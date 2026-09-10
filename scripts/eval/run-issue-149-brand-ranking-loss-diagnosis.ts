/**
 * Issue #149 — why the Brand ranker prefers the wrong candidate when an exact
 * governed Brand candidate is present and eligible.
 *
 * DIAGNOSIS ONLY. No scoring, ranking, family key, filter, generation, OCR or
 * authority behaviour is changed. The oracle seam is used exactly as the prior
 * experiment left it — default-off, 115/115 parity — purely to make the correct
 * candidate exist so its ranking inputs can be observed.
 *
 * The family-vs-comparator distinction is decided by a fact in the data, not by
 * inference: `decision` is assigned only while iterating the post-family,
 * post-dedupe `ranked` pool, so a candidate without one never reached
 * `compareCandidateRanking`.
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

const OUT = "artifacts/issue-149-brand-ranking-loss-diagnosis";
const POPULATION = "artifacts/brand-evidence-path-diagnosis/cases.json";
const ORACLE = "artifacts/issue-149-brand-oracle-exact-window/primary/case-level-results.json";
const MANIFEST = "src/fixtures/eval/eval-manifest.json";

const OCR_ENGINE: AnalyzerOcrEngine = {
  kind: "ocr",
  engineId: "tesseract.js",
  engineVersion: "7.0.0",
  modelId: "eng",
};
const PROCESSED_AT = "2026-07-12T00:00:00Z";

const valueOf = (c: BrandCandidateDiagnostic): string => c.cleanedValue ?? c.rawText;
const equalsBrand = (v: string | null, acceptable: string[]): boolean =>
  brandExactMatch(v, acceptable) || brandNormalizedMatch(v, acceptable);

/** Lexicographic comparison over the exposed comparator chains. */
function compareExposedRanking(a: BrandCandidateDiagnostic, b: BrandCandidateDiagnostic): number {
  const left = a.ranking?.comparator ?? [];
  const right = b.ranking?.comparator ?? [];
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const l = left[i];
    const r = right[i];
    if (l.id !== r.id) return 0;
    let cmp = 0;
    if (typeof l.value === "boolean" && typeof r.value === "boolean") {
      cmp = l.value === r.value ? 0 : l.value ? 1 : -1;
    } else if (typeof l.value === "number" && typeof r.value === "number") {
      cmp = l.value === r.value ? 0 : l.value > r.value ? 1 : -1;
    } else {
      cmp = String(l.value).localeCompare(String(r.value));
    }
    if (cmp !== 0) return l.direction === "desc" ? -cmp : cmp;
  }
  return 0;
}

const eligibilityOf = (c: BrandCandidateDiagnostic): boolean | null => {
  const entry = c.ranking?.comparator?.find((e) => e.id === "score-eligibility");
  return typeof entry?.value === "boolean" ? entry.value : null;
};

const inputsOf = (c: BrandCandidateDiagnostic) => ({
  value: valueOf(c),
  scoreEligible: eligibilityOf(c),
  scoreTotal: c.score?.total ?? null,
  prominence: c.prominence,
  ocrEvidenceScore: c.ocrEvidenceScore,
  positiveSignal: c.score?.positiveSignal ?? null,
  meaningfulChars: c.score?.meaningfulChars ?? null,
  structure: c.score?.structure ?? null,
  normalizedProminence: c.score?.prominence ?? null,
  area: c.score?.area ?? null,
  centrality: c.score?.centrality ?? null,
  alignment: c.score?.alignment ?? null,
  lineProximity: c.score?.lineProximity ?? null,
  lowInformationPenalty: c.score?.lowInformationPenalty ?? null,
  residualPenalty: c.score?.residualPenalty ?? null,
  assembly: c.assembly,
  lineIndexes: c.lineIndexes,
  familyKey: c.lineIndexes?.length ? `line:${c.lineIndexes[0]}` : null,
  reachedComparatorPool: c.decision !== undefined,
  decision: c.decision ?? null,
});

function finalBrand(
  passes: RegionOcrResult[],
  select: (r: RegionOcrResult[]) => FieldSelection,
): FieldSelection {
  const primary = select([passes[0]]);
  return primary.observation.state === "OBSERVED" ? primary : select(passes);
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
  const target = new Set(
    oracleRows.filter((r) => r.outcomeClass === "ENUMERATION_PLUS_RANKING").map((r) => r.caseId),
  );
  if (target.size !== 37) throw new Error(`expected 37 ranking-loss cases, found ${target.size}`);

  const manifest =
    (
      JSON.parse(readFileSync(MANIFEST, "utf8")) as {
        records?: Array<{ caseId: string; imagePath: string }>;
      }
    ).records ?? [];
  if (manifest.length === 0) throw new Error("eval manifest produced zero records");
  const imageById = new Map(manifest.map((r) => [r.caseId, r.imagePath]));

  const rows: Record<string, unknown>[] = [];

  for (const entry of population) {
    if (!target.has(entry.caseId)) continue;
    const imagePath = imageById.get(entry.caseId)!;
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
    if (!result.ok) {
      rows.push({ caseId: entry.caseId, evaluable: false, error: result.error.code });
      continue;
    }

    const passes = result.value.debug.passes;
    const acceptable = entry.truth.acceptable;
    const runs = acceptable.map((a) => truthTokens(a)).filter((r) => r.length > 0);
    const selection = finalBrand(passes, (r) =>
      selectBrandObservationWithOracleExactWindows(r, runs),
    );
    const candidates = selection.brandDiagnostics?.candidates ?? [];

    const oracle =
      candidates.find(
        (c) => c.assembly === "line-window" && c.kept && equalsBrand(valueOf(c), acceptable),
      ) ?? candidates.find((c) => equalsBrand(valueOf(c), acceptable));
    const winner = candidates.find((c) => c.decision === "selected");
    const pool = candidates.filter((c) => c.decision !== undefined);
    const sortedPool = [...pool].sort(compareExposedRanking);
    const oracleRank = oracle ? sortedPool.findIndex((c) => c.rawText === oracle.rawText) : -1;
    const above = oracleRank > 0 ? sortedPool.slice(0, oracleRank) : [];

    // Pool-level denominators, recomputed observationally from the kept pool.
    const keptProminences = candidates.filter((c) => c.kept).map((c) => c.prominence);
    const maxProminence = keptProminences.length ? Math.max(...keptProminences) : 0;
    const floor = maxProminence * 0.4 + 1;

    // For a family-suppressed oracle the causal comparison is its same-family
    // SIBLING, not the eventual winner. Capture it explicitly.
    const oracleFamily = oracle?.lineIndexes?.length ? `line:${oracle.lineIndexes[0]}` : null;
    const familyMembers = oracleFamily
      ? candidates.filter(
          (c) => c.kept && c.lineIndexes?.length && `line:${c.lineIndexes[0]}` === oracleFamily,
        )
      : [];
    const familyWinner = familyMembers.reduce<BrandCandidateDiagnostic | null>(
      (best, c) => (!best || (c.score?.total ?? 0) > (best.score?.total ?? 0) ? c : best),
      null,
    );

    let primaryClass: string;
    let decisive: string[] = [];
    if (!oracle) {
      primaryClass = "UNDETERMINABLE";
    } else if (oracle.decision === undefined) {
      primaryClass = "FAMILY_SUPPRESSION";
      const sameValue = familyWinner && valueOf(familyWinner) === valueOf(oracle);
      decisive = sameValue
        ? [
            `removed by dedupeBestCandidates: an equal-valued candidate outscored it (${(familyWinner?.score?.total ?? 0).toFixed(3)} vs ${(oracle.score?.total ?? 0).toFixed(3)})`,
          ]
        : [
            `removed by bestFamilyCandidates: same-family sibling ${JSON.stringify(familyWinner ? valueOf(familyWinner) : null)} in ${oracleFamily} outscored it (${(familyWinner?.score?.total ?? 0).toFixed(3)} vs ${(oracle.score?.total ?? 0).toFixed(3)})`,
          ];
    } else if (!winner) {
      primaryClass = "UNDETERMINABLE";
    } else if (eligibilityOf(oracle) === false && eligibilityOf(winner) === true) {
      primaryClass = "ELIGIBILITY_GATE";
      decisive = [
        `score-eligibility false vs true; prominence ${oracle.prominence} <= floor ${floor.toFixed(2)} (maxProminence ${maxProminence})`,
      ];
    } else {
      const oScore = oracle.score?.total ?? 0;
      const wScore = winner.score?.total ?? 0;
      if (oScore !== wScore) {
        primaryClass = "SCORE_ORDERING";
        const terms: Array<[string, number, number]> = [
          ["positiveSignal", oracle.score?.positiveSignal ?? 0, winner.score?.positiveSignal ?? 0],
          [
            "meaningfulChars",
            oracle.score?.meaningfulChars ?? 0,
            winner.score?.meaningfulChars ?? 0,
          ],
          ["structure", oracle.score?.structure ?? 0, winner.score?.structure ?? 0],
          ["ocrEvidenceScore", oracle.ocrEvidenceScore, winner.ocrEvidenceScore],
          ["prominence", oracle.score?.prominence ?? 0, winner.score?.prominence ?? 0],
          ["area", oracle.score?.area ?? 0, winner.score?.area ?? 0],
          [
            "lowInformationPenalty",
            oracle.score?.lowInformationPenalty ?? 0,
            winner.score?.lowInformationPenalty ?? 0,
          ],
          [
            "residualPenalty",
            oracle.score?.residualPenalty ?? 0,
            winner.score?.residualPenalty ?? 0,
          ],
        ];
        decisive = terms
          .filter(([, o, w]) => Math.abs(w - o) > 1e-9)
          .sort((a, b) => Math.abs(b[2] - b[1]) - Math.abs(a[2] - a[1]))
          .slice(0, 3)
          .map(([n, o, w]) => `${n}: oracle ${o.toFixed(3)} vs winner ${w.toFixed(3)}`);
      } else {
        primaryClass = "TIE_BREAK";
        decisive = ["score.total tied; decided by a later comparator entry"];
      }
    }

    rows.push({
      caseId: entry.caseId,
      evaluable: true,
      governedBrand: acceptable,
      poolMaxProminence: maxProminence,
      eligibilityFloor: floor,
      oracle: oracle ? inputsOf(oracle) : null,
      oracleRank: oracleRank >= 0 ? oracleRank : null,
      oracleReachedComparatorPool: oracle ? oracle.decision !== undefined : false,
      winner: winner ? inputsOf(winner) : null,
      scoreDelta: oracle && winner ? (winner.score?.total ?? 0) - (oracle.score?.total ?? 0) : null,
      oracleFamily,
      familyMemberCount: familyMembers.length,
      familyWinner: familyWinner
        ? {
            value: valueOf(familyWinner),
            scoreTotal: familyWinner.score?.total ?? null,
            prominence: familyWinner.prominence,
            sameValueAsOracle: valueOf(familyWinner) === (oracle ? valueOf(oracle) : null),
            isTheOracleItself: familyWinner.rawText === oracle?.rawText,
          }
        : null,
      candidatesAboveOracle: above.map((c) => ({
        value: valueOf(c),
        scoreEligible: eligibilityOf(c),
        scoreTotal: c.score?.total ?? null,
        prominence: c.prominence,
      })),
      primaryClass,
      decisiveFeatures: decisive,
    });
    process.stderr.write(`  ${rows.length}/37 ${entry.caseId}\n`);
  }

  writeFileSync(path.join(OUT, "case-level-pairwise.json"), `${JSON.stringify(rows, null, 2)}\n`);

  const ev = rows.filter((r) => r.evaluable === true) as Array<Record<string, any>>;
  const c = (k: string) => ev.filter((r) => r.primaryClass === k).length;
  const archetype: Record<string, number> = {};
  for (const r of ev) {
    const v = (r.winner?.value ?? "?") as string;
    const kind = /WINERY|VINEYARD|CELLARS|ESTATE|AZIENDA|AGRICOLA|DOMAINE|BOTTL/i.test(v)
      ? "producer/estate phrase"
      : /\d/.test(v)
        ? "contains digits"
        : v.split(/\s+/).length >= 3
          ? "long phrase (3+ tokens)"
          : "short token";
    archetype[kind] = (archetype[kind] ?? 0) + 1;
  }
  const featureCounts: Record<string, number> = {};
  for (const r of ev)
    for (const f of r.decisiveFeatures ?? []) {
      const nm = String(f).split(":")[0];
      featureCounts[nm] = (featureCounts[nm] ?? 0) + 1;
    }

  const aggregate = {
    artifact: "aggregate",
    experimentId: "issue-149-brand-ranking-loss-diagnosis",
    inventorySha256: createHash("sha256")
      .update(readFileSync(path.join(OUT, "ranking-feature-inventory.md")))
      .digest("hex"),
    evaluationDependency: "oracle checkpoint 8de5b9fc (ancestry is an evaluation dependency only)",
    population: { targeted: 37, evaluable: ev.length },
    primaryClasses: {
      FAMILY_SUPPRESSION: c("FAMILY_SUPPRESSION"),
      ELIGIBILITY_GATE: c("ELIGIBILITY_GATE"),
      SCORE_ORDERING: c("SCORE_ORDERING"),
      TIE_BREAK: c("TIE_BREAK"),
      OTHER: c("OTHER"),
      UNDETERMINABLE: c("UNDETERMINABLE"),
    },
    oracleReachedComparatorPool: ev.filter((r) => r.oracleReachedComparatorPool).length,
    oracleRemovedBeforeComparator: ev.filter((r) => !r.oracleReachedComparatorPool).length,
    eligibility: {
      oracleIneligible: ev.filter((r) => r.oracle?.scoreEligible === false).length,
      winnerEligible: ev.filter((r) => r.winner?.scoreEligible === true).length,
      bothEligible: ev.filter(
        (r) => r.oracle?.scoreEligible === true && r.winner?.scoreEligible === true,
      ).length,
    },
    scoreDelta: {
      median: (() => {
        const d = ev
          .map((r) => r.scoreDelta)
          .filter((x): x is number => typeof x === "number")
          .sort((a, b) => a - b);
        return d.length ? d[Math.floor(d.length / 2)] : null;
      })(),
    },
    winningCandidateArchetypes: archetype,
    decisiveFeatureFrequency: featureCounts,
    productionBehaviorChanged: false,
  };
  writeFileSync(path.join(OUT, "aggregate.json"), `${JSON.stringify(aggregate, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(aggregate, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
