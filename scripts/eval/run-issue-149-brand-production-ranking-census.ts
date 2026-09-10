/**
 * Issue #149 — production Brand ranking census. DIAGNOSIS ONLY.
 * Runs the unmodified production selection path. No seam, no counterfactual,
 * no treatment. Uses only diagnostics already shipped in main.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  classifyRawOcrMatch,
  isPresent,
  truthTokens,
} from "@/fixtures/eval/issue-149-brand-raw-ocr-match";
import { brandExactMatch, brandNormalizedMatch } from "@/fixtures/eval/metrics";
import { extractLabelEvidenceDetailed } from "@/pipeline/extractor/extractor";
import type { AnalyzerOcrEngine } from "@/pipeline/analyzer/analyzer.types";
import type { ExtractionInput, RegionOcrResult } from "@/pipeline/extractor/extractor.types";
import {
  selectBrandObservationWithCompleteFilterDiagnostics,
  type BrandCandidateDiagnostic,
  type FieldSelection,
} from "@/pipeline/extractor/field-selection";

const OUT = "artifacts/issue-149-brand-production-ranking-census";
const POPULATION = "artifacts/brand-evidence-path-diagnosis/cases.json";
const MANIFEST = "src/fixtures/eval/eval-manifest.json";
const ENGINE: AnalyzerOcrEngine = {
  kind: "ocr",
  engineId: "tesseract.js",
  engineVersion: "7.0.0",
  modelId: "eng",
};

const val = (c: BrandCandidateDiagnostic) => c.cleanedValue ?? c.rawText;
const eq = (v: string | null, a: string[]) => brandExactMatch(v, a) || brandNormalizedMatch(v, a);
const elig = (c: BrandCandidateDiagnostic) => {
  const e = c.ranking?.comparator?.find((x) => x.id === "score-eligibility");
  return typeof e?.value === "boolean" ? e.value : null;
};
const inputs = (c: BrandCandidateDiagnostic | null) =>
  c && {
    value: val(c),
    kept: c.kept,
    decision: c.decision ?? null,
    scoreEligible: elig(c),
    scoreTotal: c.score?.total ?? null,
    prominence: c.prominence,
    ocrEvidenceScore: c.ocrEvidenceScore,
    positiveSignal: c.score?.positiveSignal ?? null,
    meaningfulChars: c.score?.meaningfulChars ?? null,
    structure: c.score?.structure ?? null,
    normProminence: c.score?.prominence ?? null,
    area: c.score?.area ?? null,
    centrality: c.score?.centrality ?? null,
    lowInformationPenalty: c.score?.lowInformationPenalty ?? null,
    residualPenalty: c.score?.residualPenalty ?? null,
    assembly: c.assembly,
    familyKey: c.lineIndexes?.length ? `line:${c.lineIndexes[0]}` : null,
    activeRejectionReasons: c.activeRejectionReasons ?? (c.kept ? [] : [c.filterReason]),
  };

function cmp(a: BrandCandidateDiagnostic, b: BrandCandidateDiagnostic): number {
  const L = a.ranking?.comparator ?? [],
    R = b.ranking?.comparator ?? [];
  for (let i = 0; i < Math.min(L.length, R.length); i++) {
    const l = L[i],
      r = R[i];
    if (l.id !== r.id) return 0;
    let c = 0;
    if (typeof l.value === "boolean" && typeof r.value === "boolean")
      c = l.value === r.value ? 0 : l.value ? 1 : -1;
    else if (typeof l.value === "number" && typeof r.value === "number")
      c = l.value === r.value ? 0 : l.value > r.value ? 1 : -1;
    else c = String(l.value).localeCompare(String(r.value));
    if (c !== 0) return l.direction === "desc" ? -c : c;
  }
  return 0;
}

function finalBrand(passes: RegionOcrResult[]): FieldSelection {
  const primary = selectBrandObservationWithCompleteFilterDiagnostics([passes[0]]);
  return primary.observation.state === "OBSERVED"
    ? primary
    : selectBrandObservationWithCompleteFilterDiagnostics(passes);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const population = JSON.parse(readFileSync(POPULATION, "utf8")) as Array<{
    caseId: string;
    truth: { present: boolean; acceptable: string[] };
  }>;
  const manifest =
    (
      JSON.parse(readFileSync(MANIFEST, "utf8")) as {
        records?: Array<{ caseId: string; imagePath: string }>;
      }
    ).records ?? [];
  if (manifest.length === 0) throw new Error("empty manifest");
  const byId = new Map(manifest.map((r) => [r.caseId, r.imagePath]));
  const rows: Record<string, unknown>[] = [];
  let parityMismatch = 0;

  for (const e of population) {
    const ip = byId.get(e.caseId);
    if (!ip) continue;
    const bytes = readFileSync(ip);
    const input: ExtractionInput = {
      imageBytes: new Uint8Array(bytes),
      artifactRef: e.caseId,
      derivativeSha256: createHash("sha256").update(bytes).digest("hex"),
      processedAt: "2026-07-12T00:00:00Z",
      extractionAdapterId: "local-two-field-extractor",
      extractionAdapterVersion: "1.0.0",
      ocrEngine: ENGINE,
      parserId: "wine-alcohol-parse",
      parserVersion: "1.0.0",
    };
    const res = await extractLabelEvidenceDetailed(input);
    if (!res.ok) {
      rows.push({ caseId: e.caseId, evaluable: false });
      continue;
    }
    const prod = res.value.response.fields.brandName;
    const passes = res.value.debug.passes;
    const acc = e.truth?.present ? e.truth.acceptable : [];
    const present = e.truth?.present === true;
    const sel = finalBrand(passes);
    if (sel.observation.value !== prod.value || sel.observation.state !== prod.state)
      parityMismatch++;

    const cands = sel.brandDiagnostics?.candidates ?? [];
    const brandPasses = passes.filter((p) => p.fieldEligibility.brand);
    const rawPresent =
      present &&
      acc.some((a) =>
        brandPasses.some((p) =>
          isPresent(
            classifyRawOcrMatch(
              p.words.map((w) => w.text),
              a,
            ).tier,
          ),
        ),
      );

    const correctAll = cands.filter((c) => eq(val(c), acc));
    const correctKept = correctAll.filter((c) => c.kept);
    const correctInPool = correctKept.filter((c) => c.decision !== undefined);
    const pool = cands.filter((c) => c.decision !== undefined);
    const ranked = [...pool].sort(cmp);
    const winner = cands.find((c) => c.decision === "selected") ?? null;
    const best = correctInPool.length
      ? correctInPool.reduce((b, c) => (cmp(c, b) < 0 ? c : b))
      : null;
    const rank = best ? ranked.findIndex((c) => c.rawText === best.rawText) : null;
    const selectedCorrect = brandNormalizedMatch(sel.observation.value, acc);

    let mechanism: string;
    if (!present) mechanism = "BRAND_ABSENT";
    else if (selectedCorrect && sel.observation.state === "OBSERVED")
      mechanism = "CORRECT_AND_AUTHORITATIVE";
    else if (selectedCorrect) mechanism = "CORRECT_SELECTED_BUT_AUTHORITY_RESTRAINED";
    else if (correctAll.length === 0) mechanism = "CANDIDATE_NOT_GENERATED";
    else if (correctKept.length === 0) mechanism = "FILTER_LOSS";
    else if (correctInPool.length === 0) mechanism = "FAMILY_OR_DEDUPE_SUPPRESSION";
    else if (winner === null) mechanism = "UNDETERMINABLE";
    else if (elig(best!) === false && elig(winner) === true) mechanism = "ELIGIBILITY_GATE";
    else if ((best!.score?.total ?? 0) !== (winner.score?.total ?? 0)) mechanism = "SCORE_ORDERING";
    else mechanism = "TIE_BREAK";

    rows.push({
      caseId: e.caseId,
      evaluable: true,
      brandPresent: present,
      governedBrand: acc,
      productionValue: prod.value,
      productionState: prod.state,
      selectedCorrect,
      rawTruthPresent: rawPresent,
      exactCandidateGenerated: correctAll.length > 0,
      exactSurvivesFiltering: correctKept.length > 0,
      exactSurvivesFamilyDedupe: correctInPool.length > 0,
      correctRank: rank,
      inTop3: rank !== null && rank >= 0 && rank < 3,
      inTop1: rank === 0,
      correctCandidate: inputs(best),
      winner: inputs(winner),
      scoreDelta: best && winner ? (winner.score?.total ?? 0) - (best.score?.total ?? 0) : null,
      correctScoresHigherButEliminatedEarly:
        correctKept.length > 0 &&
        correctInPool.length === 0 &&
        winner !== null &&
        (correctKept[0].score?.total ?? 0) > (winner.score?.total ?? 0),
      mechanism,
    });
    process.stderr.write(`  ${rows.length}/${population.length}\n`);
  }

  const ev = rows.filter((r) => r.evaluable) as Array<Record<string, any>>;
  const bp = ev.filter((r) => r.brandPresent);
  const c = (m: string) => bp.filter((r) => r.mechanism === m).length;
  const states: Record<string, number> = {};
  for (const r of bp) states[r.productionState] = (states[r.productionState] ?? 0) + 1;

  const agg = {
    artifact: "aggregate",
    experimentId: "issue-149-brand-production-ranking-census",
    baseSha: "195182c5ccef51e4a15767801d184d12ab07e52a",
    taxonomySha256: createHash("sha256")
      .update(readFileSync(path.join(OUT, "taxonomy.md")))
      .digest("hex"),
    diagnosticsParity: {
      mismatches: parityMismatch,
      exact: parityMismatch === 0,
      note: "diagnostics variant compared to the real analyzer response value and state",
    },
    cascade: {
      brandPresent: bp.length,
      rawTruthPresent: bp.filter((r) => r.rawTruthPresent).length,
      exactCandidateGenerated: bp.filter((r) => r.exactCandidateGenerated).length,
      exactSurvivesFiltering: bp.filter((r) => r.exactSurvivesFiltering).length,
      exactSurvivesFamilyDedupe: bp.filter((r) => r.exactSurvivesFamilyDedupe).length,
      finalTop3: bp.filter((r) => r.inTop3).length,
      finalTop1: bp.filter((r) => r.inTop1).length,
      correctlySelected: bp.filter((r) => r.selectedCorrect).length,
      correctlyAuthoritative: bp.filter(
        (r) => r.selectedCorrect && r.productionState === "OBSERVED",
      ).length,
    },
    mechanisms: {
      CANDIDATE_NOT_GENERATED: c("CANDIDATE_NOT_GENERATED"),
      FILTER_LOSS: c("FILTER_LOSS"),
      FAMILY_OR_DEDUPE_SUPPRESSION: c("FAMILY_OR_DEDUPE_SUPPRESSION"),
      ELIGIBILITY_GATE: c("ELIGIBILITY_GATE"),
      SCORE_ORDERING: c("SCORE_ORDERING"),
      TIE_BREAK: c("TIE_BREAK"),
      CORRECT_SELECTED_BUT_AUTHORITY_RESTRAINED: c("CORRECT_SELECTED_BUT_AUTHORITY_RESTRAINED"),
      CORRECT_AND_AUTHORITATIVE: c("CORRECT_AND_AUTHORITATIVE"),
      OTHER: c("OTHER"),
      UNDETERMINABLE: c("UNDETERMINABLE"),
    },
    trueComparatorRankingFailures: c("ELIGIBILITY_GATE") + c("SCORE_ORDERING") + c("TIE_BREAK"),
    preComparatorLosses: c("FAMILY_OR_DEDUPE_SUPPRESSION"),
    productionStateDistribution: states,
    correctScoresHigherButEliminatedEarly: bp
      .filter((r) => r.correctScoresHigherButEliminatedEarly)
      .map((r) => r.caseId),
    productionBehaviorChanged: false,
  };
  writeFileSync(path.join(OUT, "case-level-census.json"), `${JSON.stringify(rows, null, 2)}\n`);
  writeFileSync(path.join(OUT, "aggregate.json"), `${JSON.stringify(agg, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(agg, null, 2)}\n`);
}
main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.stack : e);
  process.exitCode = 1;
});
