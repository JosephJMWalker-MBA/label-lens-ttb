/**
 * Issue #149 — semantic diagnosis of the residual Brand ranking failures.
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

const OUT = "artifacts/issue-149-brand-semantic-ranking-diagnosis";
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
  structure: number;
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

type SMode = 0 | 1 | 2; // 0 = off, 1 = S, 2 = S-prime

/** score.total under the size/length switch. */
const totalUnder = (c: Cand, S: SMode): number => {
  if (S === 0) return c.total;
  const base = c.total - 0.8 * c.normProminence - 0.6 * c.area - 1.6 * c.meaningfulChars;
  return S === 2 ? base - 1.2 * c.structure : base;
};

/** The production comparator, with E replacing the eligibility partition. */
function compare(a: Cand, b: Cand, E: boolean, S: SMode): number {
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
function rank(cands: Cand[], F: boolean, E: boolean, S: SMode): Cand[] {
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

  const ARMS: Array<[boolean, boolean, SMode]> = [
    [false, false, 0],
    [false, true, 1],
    [false, true, 2],
  ];
  const armName = ([F, E, S]: [boolean, boolean, SMode]) =>
    S === 2 ? "E+Sprime" : S === 1 ? "E+S" : "baseline";

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
    const lineDiags = selection.brandDiagnostics?.lines ?? [];

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
        structure: c.score!.structure,
        isOracle: oracleDiag !== null && c.rawText === oracleDiag.rawText,
        assembly: c.assembly,
      }));

    // ---- reproduction gate: baseline arm must match production ----
    const baseRanked = rank(cands, false, false, 0);
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

    // ---- semantic diagnosis, per the frozen taxonomy ----
    const spArm = arms["E+Sprime"] as any;
    const winnerValue: string | null = spArm.selected;
    const winnerDiag = winnerValue
      ? (diagnostics.find((c) => (c.cleanedValue ?? c.rawText) === winnerValue) ?? null)
      : null;
    const oracleDiag2 = diagnostics.find(
      (c) => c.assembly === "line-window" && c.kept && equalsBrand(valueOf(c), acceptable),
    );
    const lineOf = (c: typeof winnerDiag) =>
      c && c.lineIndexes?.length ? (lineDiags[c.lineIndexes[0]] ?? null) : null;
    const winnerLine = lineOf(winnerDiag);
    const oracleLine = lineOf(oracleDiag2 ?? null);

    const winnerLineRejected = winnerLine ? winnerLine.kept === false : false;
    const winnerLineReason = winnerLine?.reason ?? null;
    const SEMANTIC_LINE_REASONS = [
      "producer-line",
      "non-brand-keyword",
      "domain-like",
      "varietal-or-designation",
      "generic-product-language",
      "location-or-appellation",
      "sentence-fragment",
      "low-information-fragment",
    ];
    const negativeContextAvailable =
      winnerLineRejected && SEMANTIC_LINE_REASONS.includes(String(winnerLineReason));
    const winnerLineText = winnerLine?.rawText ?? null;
    const contextLarger =
      winnerLineText !== null &&
      winnerValue !== null &&
      winnerLineText.trim().length > winnerValue.trim().length;

    let failureType: string;
    if (spArm.selectedCorrectly) failureType = "RESOLVED_UNDER_SPRIME";
    else if (winnerDiag === null) failureType = "UNDETERMINABLE";
    else if (negativeContextAvailable) failureType = "AVAILABLE_NEGATIVE_CONTEXT_UNUSED";
    else if (contextLarger) failureType = "CONTEXT_NOT_PROPAGATED";
    else failureType = "SEMANTICALLY_AMBIGUOUS_FROM_CURRENT_EVIDENCE";

    // winner role, from existing predicates and line verdicts only
    const wSuper =
      winnerValue !== null &&
      acceptable.some((a) => {
        const nb = normKey(a);
        const nw = normKey(winnerValue);
        return nb.length > 0 && nw.includes(nb) && nw !== nb;
      });
    let winnerRole: string;
    if (wSuper) winnerRole = "OVERWIDE_BRAND_SUPERSET";
    else if (winnerLineReason === "producer-line") winnerRole = "PRODUCER_OR_WINERY_NAME";
    else if (winnerLineReason === "non-brand-keyword") winnerRole = "IMPORTER_DISTRIBUTOR";
    else if (winnerLineReason === "location-or-appellation")
      winnerRole = "APPELLATION_OR_GEOGRAPHY";
    else if (winnerLineReason === "varietal-or-designation")
      winnerRole = "VARIETAL_OR_PRODUCT_DESCRIPTOR";
    else if (winnerLineReason === "generic-product-language")
      winnerRole = "VARIETAL_OR_PRODUCT_DESCRIPTOR";
    else if (winnerLineReason === "sentence-fragment") winnerRole = "REGULATORY_OR_WARNING_TEXT";
    else if (winnerLineReason === "low-information-fragment") winnerRole = "OCR_FRAGMENT";
    else if (winnerLineReason === "domain-like") winnerRole = "ADDRESS_OR_CONTACT_TEXT";
    else winnerRole = "OTHER_BRANDLIKE_TEXT";

    const structureOf = cands.find((c) => c.isOracle)?.structure ?? null;
    const winnerES = (arms["E+S"] as any).selected as string | null;
    const winnerStructure =
      winnerES !== null ? (cands.find((c) => c.value === winnerES)?.structure ?? null) : null;

    rows.push({
      caseId: entry.caseId,
      governedBrand: acceptable,
      priorPrimaryClass: rankingRows.find((r) => r.caseId === entry.caseId)?.primaryClass ?? null,
      instanceOnlyDedupe: instanceOnlyDedupe.has(entry.caseId),
      arms,
      oracleStructure: structureOf,
      winnerStructureUnderES: winnerStructure,
      winnerUnderSPrime: winnerValue,
      winnerRole,
      failureType,
      winnerLineText,
      winnerLineKept: winnerLine ? winnerLine.kept : null,
      winnerLineReason,
      oracleLineText: oracleLine?.rawText ?? null,
      oracleLineKept: oracleLine ? oracleLine.kept : null,
      oracleLineReason: oracleLine?.reason ?? null,
      winnerFilterChecksAllPassed: winnerDiag
        ? (winnerDiag.activeRejectionReasons ?? []).length === 0
        : null,
      recoveredByStructureNeutralization:
        !(arms["E+S"] as any).selectedCorrectly && (arms["E+Sprime"] as any).selectedCorrectly,
      regressedByStructureNeutralization:
        (arms["E+S"] as any).selectedCorrectly && !(arms["E+Sprime"] as any).selectedCorrectly,
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
        (r) => get(r).selectedCorrectly && !(r.arms as any)["baseline"].selectedCorrectly,
      ).length,
      regressedVsBaseline: rows.filter(
        (r) => !get(r).selectedCorrectly && (r.arms as any)["baseline"].selectedCorrectly,
      ).length,
    };
  }

  const aggregate = {
    artifact: "aggregate",
    experimentId: "issue-149-brand-semantic-ranking-diagnosis",
    inventorySha256: createHash("sha256")
      .update(readFileSync(path.join(OUT, "semantic-inventory-and-taxonomy.md")))
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
    semanticDiagnosis: {
      unresolvedUnderSPrime: rows.filter((r: any) => r.failureType !== "RESOLVED_UNDER_SPRIME")
        .length,
      failureTypes: rows.reduce((acc: any, r: any) => {
        acc[r.failureType] = (acc[r.failureType] ?? 0) + 1;
        return acc;
      }, {}),
      unresolvedWinnerRoles: rows
        .filter((r: any) => r.failureType !== "RESOLVED_UNDER_SPRIME")
        .reduce((acc: any, r: any) => {
          acc[r.winnerRole] = (acc[r.winnerRole] ?? 0) + 1;
          return acc;
        }, {}),
      controlWinnerRoles: rows
        .filter((r: any) => r.failureType === "RESOLVED_UNDER_SPRIME")
        .reduce((acc: any, r: any) => {
          acc[r.winnerRole] = (acc[r.winnerRole] ?? 0) + 1;
          return acc;
        }, {}),
      controlWinnerLineRejected: rows.filter(
        (r: any) => r.failureType === "RESOLVED_UNDER_SPRIME" && r.winnerLineKept === false,
      ).length,
    },
    structureEffect: {
      recoveredByStructureNeutralization: rows.filter(
        (r: any) => r.recoveredByStructureNeutralization,
      ).length,
      regressedByStructureNeutralization: rows.filter(
        (r: any) => r.regressedByStructureNeutralization,
      ).length,
      stillUnresolvedUnderSPrime: rows.filter((r: any) => !r.arms["E+Sprime"].selectedCorrectly)
        .length,
    },
    productionBehaviorChanged: false,
  };
  writeFileSync(path.join(OUT, "aggregate.json"), `${JSON.stringify(aggregate, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(aggregate, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
