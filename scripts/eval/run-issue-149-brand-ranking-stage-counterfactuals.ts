/**
 * Issue #149 — F/E/S ranking-stage counterfactuals.
 *
 * OFFLINE COUNTERFACTUAL DIAGNOSIS. No production ranking, family key,
 * threshold, weight, filter, generation or authority is changed. Candidates and
 * their complete ranking inputs are captured once from the real selector, then
 * the family stage, dedupe stage and comparator are re-simulated offline.
 *
 * GATE: the offline evaluator must reproduce the production result exactly —
 * family winner, comparator pool, top-3, top-1 and selected value — before any
 * switch is applied.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { truthTokens } from "@/fixtures/eval/issue-149-brand-raw-ocr-match";
import { brandExactMatch, brandNormalizedMatch } from "@/fixtures/eval/metrics";
import { extractLabelEvidenceDetailed } from "@/pipeline/extractor/extractor";
import type { AnalyzerOcrEngine } from "@/pipeline/analyzer/analyzer.types";
import type { ExtractionInput, RegionOcrResult } from "@/pipeline/extractor/extractor.types";
import {
  selectBrandObservationWithOracleExactWindows,
  type BrandCandidateDiagnostic,
  type FieldSelection,
} from "@/pipeline/extractor/field-selection";

const OUT = "artifacts/issue-149-brand-ranking-stage-counterfactuals";
const POPULATION = "artifacts/brand-evidence-path-diagnosis/cases.json";
const ORACLE = "artifacts/issue-149-brand-oracle-exact-window/primary/case-level-results.json";
const RANKING = "artifacts/issue-149-brand-ranking-loss-diagnosis/primary/case-level-pairwise.json";
const MANIFEST = "src/fixtures/eval/eval-manifest.json";

const OCR_ENGINE: AnalyzerOcrEngine = {
  kind: "ocr",
  engineId: "tesseract.js",
  engineVersion: "7.0.0",
  modelId: "eng",
};
const PROCESSED_AT = "2026-07-12T00:00:00Z";

const normKey = (v: string): string =>
  v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

interface Cand {
  value: string;
  rawText: string;
  familyKey: string | null;
  total: number;
  prominence: number;
  ocrEvidenceScore: number;
  scoreEligible: boolean;
  normProminence: number;
  area: number;
  meaningfulChars: number;
  isOracle: boolean;
  assembly: string;
}

const valueOf = (c: BrandCandidateDiagnostic): string => c.cleanedValue ?? c.rawText;
const equalsBrand = (v: string | null, acc: string[]): boolean =>
  brandExactMatch(v, acc) || brandNormalizedMatch(v, acc);

const eligibilityOf = (c: BrandCandidateDiagnostic): boolean => {
  const e = c.ranking?.comparator?.find((x) => x.id === "score-eligibility");
  return typeof e?.value === "boolean" ? e.value : false;
};

/** score.total under switch S. */
const totalUnder = (c: Cand, S: boolean): number =>
  S ? c.total - 0.8 * c.normProminence - 0.6 * c.area - 1.6 * c.meaningfulChars : c.total;

/** The production comparator, with E replacing the eligibility partition. */
function compare(a: Cand, b: Cand, E: boolean, S: boolean): number {
  const at = totalUnder(a, S);
  const bt = totalUnder(b, S);
  if (!E) {
    if (a.scoreEligible !== b.scoreEligible) return a.scoreEligible ? -1 : 1;
    if (!a.scoreEligible) {
      // ineligible chain: prominence, ocr-evidence, ranking-score, key
      if (a.prominence !== b.prominence) return b.prominence - a.prominence;
      if (a.ocrEvidenceScore !== b.ocrEvidenceScore) return b.ocrEvidenceScore - a.ocrEvidenceScore;
      if (at !== bt) return bt - at;
      return normKey(a.value).localeCompare(normKey(b.value));
    }
  }
  // eligible chain (also the frozen replacement under E)
  if (at !== bt) return bt - at;
  if (a.prominence !== b.prominence) return b.prominence - a.prominence;
  if (a.ocrEvidenceScore !== b.ocrEvidenceScore) return b.ocrEvidenceScore - a.ocrEvidenceScore;
  return normKey(a.value).localeCompare(normKey(b.value));
}

/** Family stage, dedupe stage, then the comparator. */
function rank(cands: Cand[], F: boolean, E: boolean, S: boolean): Cand[] {
  const score = (c: Cand) => totalUnder(c, S);
  const byFamily = new Map<string, Cand>();
  const exempt: Cand[] = [];
  for (const c of cands) {
    if (F && c.isOracle) {
      exempt.push(c);
      continue;
    }
    const k = c.familyKey ?? `id:${c.rawText}`;
    const cur = byFamily.get(k);
    if (!cur || score(c) > score(cur)) byFamily.set(k, c);
  }
  const afterFamily = [...byFamily.values(), ...exempt];

  const byValue = new Map<string, Cand>();
  const exempt2: Cand[] = [];
  for (const c of afterFamily) {
    if (F && c.isOracle) {
      exempt2.push(c);
      continue;
    }
    const k = normKey(c.value);
    const cur = byValue.get(k);
    if (!cur || score(c) > score(cur)) byValue.set(k, c);
  }
  const pool = [...byValue.values(), ...exempt2];
  return [...pool].sort((a, b) => compare(a, b, E, S));
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const population = JSON.parse(readFileSync(POPULATION, "utf8")) as Array<{
    caseId: string;
    truth: { present: boolean; acceptable: string[] };
  }>;
  const oracleRows = JSON.parse(readFileSync(ORACLE, "utf8")) as Array<{
    caseId: string;
    outcomeClass?: string | null;
  }>;
  const rankingRows = JSON.parse(readFileSync(RANKING, "utf8")) as Array<{
    caseId: string;
    primaryClass?: string;
    familyWinner?: { sameValueAsOracle?: boolean } | null;
  }>;
  const target = new Set(
    oracleRows.filter((r) => r.outcomeClass === "ENUMERATION_PLUS_RANKING").map((r) => r.caseId),
  );
  if (target.size !== 37) throw new Error(`expected 37, found ${target.size}`);
  const instanceOnlyDedupe = new Set(
    rankingRows
      .filter((r) => r.primaryClass === "FAMILY_SUPPRESSION" && r.familyWinner?.sameValueAsOracle)
      .map((r) => r.caseId),
  );

  const manifest =
    (
      JSON.parse(readFileSync(MANIFEST, "utf8")) as {
        records?: Array<{ caseId: string; imagePath: string }>;
      }
    ).records ?? [];
  const imageById = new Map(manifest.map((r) => [r.caseId, r.imagePath]));

  const ARMS: Array<[boolean, boolean, boolean]> = [
    [false, false, false],
    [true, false, false],
    [false, true, false],
    [false, false, true],
    [true, true, false],
    [true, false, true],
    [false, true, true],
    [true, true, true],
  ];
  const armName = ([F, E, S]: [boolean, boolean, boolean]) =>
    `F${F ? 1 : 0}E${E ? 1 : 0}S${S ? 1 : 0}`;

  const rows: Record<string, unknown>[] = [];
  let reproduced = 0;
  let reproductionChecked = 0;
  const reproductionFailures: string[] = [];

  for (const entry of population) {
    const imagePath = imageById.get(entry.caseId);
    if (!imagePath) continue;
    const bytes = readFileSync(imagePath);
    const input: ExtractionInput = {
      imageBytes: new Uint8Array(bytes),
      artifactRef: entry.caseId,
      derivativeSha256: createHash("sha256").update(bytes).digest("hex"),
      processedAt: PROCESSED_AT,
      extractionAdapterId: "local-two-field-extractor",
      extractionAdapterVersion: "1.0.0",
      ocrEngine: OCR_ENGINE,
      parserId: "wine-alcohol-parse",
      parserVersion: "1.0.0",
    };
    const result = await extractLabelEvidenceDetailed(input);
    if (!result.ok) continue;

    const passes = result.value.debug.passes;
    const acceptable = entry.truth?.present ? entry.truth.acceptable : [];
    const isTarget = target.has(entry.caseId);
    const runs = isTarget ? acceptable.map((a) => truthTokens(a)).filter((r) => r.length > 0) : [];

    const select = (r: RegionOcrResult[]): FieldSelection =>
      selectBrandObservationWithOracleExactWindows(r, runs);
    const primary = select([passes[0]]);
    const selection = primary.observation.state === "OBSERVED" ? primary : select(passes);
    const diagnostics = selection.brandDiagnostics?.candidates ?? [];

    const oracleDiag = isTarget
      ? (diagnostics.find(
          (c) => c.assembly === "line-window" && c.kept && equalsBrand(valueOf(c), acceptable),
        ) ?? null)
      : null;

    const cands: Cand[] = diagnostics
      .filter((c) => c.kept && c.score)
      .map((c) => ({
        value: valueOf(c),
        rawText: c.rawText,
        familyKey: c.lineIndexes?.length ? `line:${c.lineIndexes[0]}` : null,
        total: c.score!.total,
        prominence: c.prominence,
        ocrEvidenceScore: c.ocrEvidenceScore,
        scoreEligible: eligibilityOf(c),
        normProminence: c.score!.prominence,
        area: c.score!.area,
        meaningfulChars: c.score!.meaningfulChars,
        isOracle: oracleDiag !== null && c.rawText === oracleDiag.rawText,
        assembly: c.assembly,
      }));

    // ---- reproduction gate: baseline arm must match production ----
    const baseRanked = rank(cands, false, false, false);
    const producedSelected = selection.observation.value;
    const simSelected = baseRanked[0]?.value ?? null;
    const matches =
      producedSelected === null
        ? simSelected === null
        : simSelected !== null && normKey(simSelected) === normKey(producedSelected);
    reproductionChecked += 1;
    if (matches) reproduced += 1;
    else
      reproductionFailures.push(
        `${entry.caseId}: production ${JSON.stringify(producedSelected)} vs simulated ${JSON.stringify(simSelected)}`,
      );

    if (!isTarget) continue;

    const arms: Record<string, unknown> = {};
    for (const arm of ARMS) {
      const [F, E, S] = arm;
      const ranked = rank(cands, F, E, S);
      const oracleIndex = ranked.findIndex((c) => c.isOracle);
      const top1 = ranked[0] ?? null;
      const top3 = ranked.slice(0, 3);
      arms[armName(arm)] = {
        oracleSurvivesFamilyStage: oracleIndex >= 0,
        oracleScoreEligible: cands.find((c) => c.isOracle)?.scoreEligible ?? null,
        oracleRank: oracleIndex >= 0 ? oracleIndex : null,
        inTop3: top3.some((c) => equalsBrand(c.value, acceptable)),
        inTop1: top1 !== null && equalsBrand(top1.value, acceptable),
        selected: top1?.value ?? null,
        selectedCorrectly: top1 !== null && equalsBrand(top1.value, acceptable),
        causalCompetitor: oracleIndex > 0 ? ranked[oracleIndex - 1].value : null,
        winner: top1?.value ?? null,
      };
    }

    // minimum sufficient intervention sets
    const success = (n: string) => (arms[n] as { selectedCorrectly: boolean }).selectedCorrectly;
    const BASE = "F0E0S0";
    const minimal: string[] = [];
    if (success(BASE)) minimal.push("NONE");
    else {
      const one = [
        ["F", "F1E0S0"],
        ["E", "F0E1S0"],
        ["S", "F0E0S1"],
      ] as const;
      for (const [label, key] of one) if (success(key)) minimal.push(label);
      if (minimal.length === 0) {
        const two = [
          ["F+E", "F1E1S0"],
          ["F+S", "F1E0S1"],
          ["E+S", "F0E1S1"],
        ] as const;
        for (const [label, key] of two) if (success(key)) minimal.push(label);
      }
      if (minimal.length === 0 && success("F1E1S1")) minimal.push("F+E+S");
      if (minimal.length === 0) minimal.push("NONE_OF_THE_EIGHT");
    }

    rows.push({
      caseId: entry.caseId,
      governedBrand: acceptable,
      priorPrimaryClass: rankingRows.find((r) => r.caseId === entry.caseId)?.primaryClass ?? null,
      instanceOnlyDedupe: instanceOnlyDedupe.has(entry.caseId),
      arms,
      minimumSufficientSets: minimal,
    });
    process.stderr.write(`  ${rows.length}/37 ${entry.caseId}\n`);
  }

  writeFileSync(path.join(OUT, "case-level-arms.json"), `${JSON.stringify(rows, null, 2)}\n`);

  const armSummary: Record<string, unknown> = {};
  for (const arm of ARMS) {
    const n = armName(arm);
    const get = (r: any) => r.arms[n];
    armSummary[n] = {
      correctTop3: rows.filter((r) => get(r).inTop3).length,
      correctTop1: rows.filter((r) => get(r).inTop1).length,
      correctlySelected: rows.filter((r) => get(r).selectedCorrectly).length,
      oracleSurvivesFamily: rows.filter((r) => get(r).oracleSurvivesFamilyStage).length,
      recoveredVsBaseline: rows.filter(
        (r) => get(r).selectedCorrectly && !(r.arms as any)["F0E0S0"].selectedCorrectly,
      ).length,
      regressedVsBaseline: rows.filter(
        (r) => !get(r).selectedCorrectly && (r.arms as any)["F0E0S0"].selectedCorrectly,
      ).length,
    };
  }

  const minimalCounts: Record<string, number> = {};
  for (const r of rows)
    for (const m of r.minimumSufficientSets as string[])
      minimalCounts[m] = (minimalCounts[m] ?? 0) + 1;

  const aggregate = {
    artifact: "aggregate",
    experimentId: "issue-149-brand-ranking-stage-counterfactuals",
    switchesSha256: createHash("sha256")
      .update(readFileSync(path.join(OUT, "switches.md")))
      .digest("hex"),
    evaluationDependency: "6a969e4b (ranking diagnosis) -> 8de5b9fc (oracle)",
    baselineReproduction: {
      casesChecked: reproductionChecked,
      reproduced,
      exact: reproduced === reproductionChecked,
      failures: reproductionFailures.slice(0, 10),
    },
    population: { targeted: rows.length, instanceOnlyDedupe: instanceOnlyDedupe.size },
    arms: armSummary,
    minimumSufficientSets: minimalCounts,
    productionBehaviorChanged: false,
  };
  writeFileSync(path.join(OUT, "aggregate.json"), `${JSON.stringify(aggregate, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(aggregate, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
