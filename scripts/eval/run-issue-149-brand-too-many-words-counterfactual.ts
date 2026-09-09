/**
 * Issue #149 — Brand `too-many-words` counterfactual cost.
 *
 * EVALUATION ONLY. Production selection is untouched: the treatment is reached
 * through the default-off `selectBrandObservationWithTooManyWordsCounterfactual`
 * entry point, and full-corpus production parity is asserted separately.
 *
 * OCR runs ONCE per case. Both arms are then applied to the SAME `debug.passes`,
 * so image, OCR and candidate-window generation are frozen by construction and
 * the only difference between arms is whether `too-many-words` blocks.
 *
 * The final-selection rule mirrors `extractor.ts` exactly:
 *     brand = primaryBrand.state === "OBSERVED" ? primaryBrand : select(passes)
 * with the arm's own selector substituted on both sides.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { brandExactMatch, brandInTopK, brandNormalizedMatch } from "@/fixtures/eval/metrics";
import { extractLabelEvidenceDetailed } from "@/pipeline/extractor/extractor";
import type { AnalyzerOcrEngine } from "@/pipeline/analyzer/analyzer.types";
import type { ExtractionInput, RegionOcrResult } from "@/pipeline/extractor/extractor.types";
import {
  selectBrandObservationWithCompleteFilterDiagnostics,
  selectBrandObservationWithTooManyWordsCounterfactual,
  type BrandCandidateDiagnostic,
  type FieldSelection,
} from "@/pipeline/extractor/field-selection";

const OUT = "artifacts/issue-149-brand-too-many-words-counterfactual";
const POPULATION = "artifacts/brand-evidence-path-diagnosis/cases.json";
const MANIFEST = "src/fixtures/eval/eval-manifest.json";

const OCR_ENGINE: AnalyzerOcrEngine = {
  kind: "ocr",
  engineId: "tesseract.js",
  engineVersion: "7.0.0",
  modelId: "eng",
};
const PROCESSED_AT = "2026-07-12T00:00:00Z";

/** Frozen candidate truth classification. Uses the candidate value only. */
type TruthTier = "TRUTH_EXACT" | "TRUTH_NORMALIZED" | "NON_TRUTH";
function classifyCandidate(candidate: BrandCandidateDiagnostic, acceptable: string[]): TruthTier {
  const value = candidate.cleanedValue ?? candidate.rawText;
  if (brandExactMatch(value, acceptable)) return "TRUTH_EXACT";
  if (brandNormalizedMatch(value, acceptable)) return "TRUTH_NORMALIZED";
  return "NON_TRUTH";
}
const isTruthBearing = (tier: TruthTier): boolean => tier !== "NON_TRUTH";

const observedField = (selection: FieldSelection) => ({
  state: selection.observation.state,
  value: selection.observation.value,
  confidence: selection.observation.confidence,
  ocrEvidenceScore: selection.observation.ocrEvidenceScore,
  alternates: selection.observation.alternates.map((a) => ({
    value: a.value,
    confidence: a.confidence,
    ocrEvidenceScore: a.ocrEvidenceScore,
  })),
});

/** The extractor's own final-Brand rule, with one arm's selector substituted. */
function finalBrand(
  passes: RegionOcrResult[],
  select: (results: RegionOcrResult[]) => FieldSelection,
): { primary: FieldSelection; final: FieldSelection } {
  const primary = select([passes[0]]);
  const final = primary.observation.state === "OBSERVED" ? primary : select(passes);
  return { primary, final };
}

interface PopulationCase {
  caseId: string;
  truth: { present: boolean; acceptable: string[] };
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const population = JSON.parse(readFileSync(POPULATION, "utf8")) as PopulationCase[];
  const manifestRaw = JSON.parse(readFileSync(MANIFEST, "utf8")) as unknown;
  const manifest = (
    Array.isArray(manifestRaw)
      ? manifestRaw
      : ((manifestRaw as { records?: unknown[]; cases?: unknown[] }).records ??
        (manifestRaw as { cases?: unknown[] }).cases ??
        [])
  ) as Array<{ caseId: string; imagePath: string }>;
  if (manifest.length === 0) throw new Error("eval manifest produced zero records");
  const imageById = new Map(manifest.map((r) => [r.caseId, r.imagePath]));

  const rows: Record<string, unknown>[] = [];
  const admitted: Record<string, unknown>[] = [];

  for (const [index, entry] of population.entries()) {
    const imagePath = imageById.get(entry.caseId);
    if (!imagePath) throw new Error(`no image path for ${entry.caseId}`);
    const bytes = readFileSync(imagePath);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const input: ExtractionInput = {
      imageBytes: new Uint8Array(bytes),
      artifactRef: entry.caseId,
      derivativeSha256: sha256,
      processedAt: PROCESSED_AT,
      extractionAdapterId: "local-two-field-extractor",
      extractionAdapterVersion: "1.0.0",
      ocrEngine: OCR_ENGINE,
      parserId: "wine-alcohol-parse",
      parserVersion: "1.0.0",
    };

    const result = await extractLabelEvidenceDetailed(input);
    if (!result.ok) {
      rows.push({ caseId: entry.caseId, extractionError: result.error.code, evaluable: false });
      continue;
    }

    const passes = result.value.debug.passes;
    const acceptable = entry.truth?.present ? entry.truth.acceptable : [];
    const brandPresent = entry.truth?.present === true;

    const base = finalBrand(passes, selectBrandObservationWithCompleteFilterDiagnostics);
    const treat = finalBrand(passes, selectBrandObservationWithTooManyWordsCounterfactual);

    const baseCands = base.final.brandDiagnostics?.candidates ?? [];
    const treatCands = treat.final.brandDiagnostics?.candidates ?? [];

    const baseKept = baseCands.filter((c) => c.kept);
    const treatKept = treatCands.filter((c) => c.kept);

    // Sole-blocker candidates: rejected in baseline, and too-many-words is the
    // ONLY active reason. These are the candidates the treatment admits.
    const soleBlocked = baseCands.filter(
      (c) =>
        !c.kept &&
        (c.activeRejectionReasons ?? []).length === 1 &&
        (c.activeRejectionReasons ?? [])[0] === "too-many-words",
    );
    const tmwWithOthers = baseCands.filter(
      (c) =>
        !c.kept &&
        (c.activeRejectionReasons ?? []).includes("too-many-words") &&
        (c.activeRejectionReasons ?? []).length > 1,
    );

    const keyOf = (c: BrandCandidateDiagnostic) =>
      `${c.passId}|${c.assembly}|${c.lineIndexes.join(",")}|${c.rawText}`;
    const baseKeptKeys = new Set(baseKept.map(keyOf));
    const newlyAdmitted = treatKept.filter((c) => !baseKeptKeys.has(keyOf(c)));

    for (const c of newlyAdmitted) {
      const tier = classifyCandidate(c, acceptable);
      admitted.push({
        caseId: entry.caseId,
        brandPresent,
        rawText: c.rawText,
        cleanedValue: c.cleanedValue,
        wordCount: (c.cleanedValue ?? c.rawText).split(/\s+/).filter(Boolean).length,
        assembly: c.assembly,
        passId: c.passId,
        regionName: c.regionName,
        candidateProvenance: c.candidateProvenance,
        truthTier: tier,
        truthBearing: isTruthBearing(tier),
      });
    }

    const baseObs = observedField(base.final);
    const treatObs = observedField(treat.final);

    const baseCorrect = brandNormalizedMatch(baseObs.value, acceptable);
    const treatCorrect = brandNormalizedMatch(treatObs.value, acceptable);

    rows.push({
      caseId: entry.caseId,
      evaluable: true,
      brandPresent,
      acceptable,
      baseline: {
        state: baseObs.state,
        value: baseObs.value,
        correct: baseCorrect,
        top1: brandInTopK(baseObs, acceptable, 1),
        top3: brandInTopK(baseObs, acceptable, 3),
        keptCandidates: baseKept.length,
        totalCandidates: baseCands.length,
        truthBearingKept: baseKept.filter((c) => isTruthBearing(classifyCandidate(c, acceptable)))
          .length,
      },
      counterfactual: {
        state: treatObs.state,
        value: treatObs.value,
        correct: treatCorrect,
        top1: brandInTopK(treatObs, acceptable, 1),
        top3: brandInTopK(treatObs, acceptable, 3),
        keptCandidates: treatKept.length,
        totalCandidates: treatCands.length,
        truthBearingKept: treatKept.filter((c) => isTruthBearing(classifyCandidate(c, acceptable)))
          .length,
      },
      soleBlockerCandidates: soleBlocked.length,
      soleBlockerTruthBearing: soleBlocked.filter((c) =>
        isTruthBearing(classifyCandidate(c, acceptable)),
      ).length,
      tooManyWordsWithOtherBlockers: tmwWithOthers.length,
      newlyAdmittedCandidates: newlyAdmitted.length,
      newlyAdmittedTruthBearing: newlyAdmitted.filter((c) =>
        isTruthBearing(classifyCandidate(c, acceptable)),
      ).length,
      changed:
        baseObs.state !== treatObs.state ||
        baseObs.value !== treatObs.value ||
        baseCorrect !== treatCorrect,
    });

    if ((index + 1) % 20 === 0) process.stderr.write(`  …${index + 1}/${population.length}\n`);
  }

  writeFileSync(path.join(OUT, "case-level-results.json"), `${JSON.stringify(rows, null, 2)}\n`);
  writeFileSync(
    path.join(OUT, "admitted-candidates.jsonl"),
    `${admitted.map((a) => JSON.stringify(a)).join("\n")}\n`,
  );

  const ev = rows.filter((r) => r.evaluable === true) as Array<Record<string, any>>;
  const bp = ev.filter((r) => r.brandPresent === true);
  const ba = ev.filter((r) => r.brandPresent === false);
  const sum = (xs: Array<Record<string, any>>, f: (r: any) => number) =>
    xs.reduce((acc, r) => acc + f(r), 0);

  const soleBlockerCases = bp.filter((r) => r.soleBlockerCandidates > 0);
  const wordLengths = admitted.map((a) => a.wordCount as number).sort((x, y) => x - y);
  const dist: Record<string, number> = {};
  for (const n of wordLengths) dist[String(n)] = (dist[String(n)] ?? 0) + 1;

  const aggregate = {
    artifact: "aggregate",
    experimentId: "issue-149-brand-too-many-words-counterfactual",
    preregistrationSha256: createHash("sha256")
      .update(readFileSync(path.join(OUT, "preregistration.md")))
      .digest("hex"),
    population: { evaluable: ev.length, brandPresent: bp.length, brandAbsent: ba.length },

    effect1_trueEvidenceRecovery: {
      soleBlockerCases: soleBlockerCases.length,
      soleBlockerCasesWithTruthBearingBlockedCandidate: bp.filter(
        (r) => r.soleBlockerTruthBearing > 0,
      ).length,
      becameEligible: soleBlockerCases.filter((r) => r.newlyAdmittedCandidates > 0).length,
      reachedTop3: soleBlockerCases.filter((r) => !r.baseline.top3 && r.counterfactual.top3).length,
      reachedTop1: soleBlockerCases.filter((r) => !r.baseline.top1 && r.counterfactual.top1).length,
      becameSelected: soleBlockerCases.filter(
        (r) => !r.baseline.correct && r.counterfactual.correct,
      ).length,
      admittedButStillNotSelected: soleBlockerCases.filter(
        (r) => r.newlyAdmittedCandidates > 0 && !r.counterfactual.correct,
      ).length,
    },

    effect2_admissionCost: {
      totalAdditionalCandidates: sum(ev, (r) => r.newlyAdmittedCandidates),
      additionalTruthBearing: admitted.filter((a) => a.truthBearing).length,
      additionalNonTruth: admitted.filter((a) => !a.truthBearing).length,
      casesWithAnyAdmission: ev.filter((r) => r.newlyAdmittedCandidates > 0).length,
      baselineKeptTotal: sum(ev, (r) => r.baseline.keptCandidates),
      counterfactualKeptTotal: sum(ev, (r) => r.counterfactual.keptCandidates),
      inflationRatio:
        sum(ev, (r) => r.baseline.keptCandidates) === 0
          ? null
          : sum(ev, (r) => r.counterfactual.keptCandidates) /
            sum(ev, (r) => r.baseline.keptCandidates),
      maxAdmissionsInOneCase: Math.max(0, ...ev.map((r) => r.newlyAdmittedCandidates as number)),
      admittedWordLengthDistribution: dist,
    },

    effect3_rankingDisruption: {
      currentlyCorrectCases: bp.filter((r) => r.baseline.correct).length,
      currentlyCorrectUnchanged: bp.filter((r) => r.baseline.correct && r.counterfactual.correct)
        .length,
      currentlyCorrectDisplaced: bp.filter((r) => r.baseline.correct && !r.counterfactual.correct)
        .length,
      displacedFromTop1: bp.filter((r) => r.baseline.top1 && !r.counterfactual.top1).length,
      displacedFromTop3: bp.filter((r) => r.baseline.top3 && !r.counterfactual.top3).length,
      currentlyIncorrectImproved: bp.filter((r) => !r.baseline.correct && r.counterfactual.correct)
        .length,
      brandAbsentCasesWithAdmissions: ba.filter((r) => r.newlyAdmittedCandidates > 0).length,
      brandAbsentBecamePositive: ba.filter(
        (r) => r.baseline.state === "NOT_OBSERVED" && r.counterfactual.state !== "NOT_OBSERVED",
      ).length,
    },

    effect4_authority: {
      baselineObserved: ev.filter((r) => r.baseline.state === "OBSERVED").length,
      counterfactualObserved: ev.filter((r) => r.counterfactual.state === "OBSERVED").length,
      baselineCorrectObserved: ev.filter(
        (r) => r.baseline.state === "OBSERVED" && r.baseline.correct,
      ).length,
      counterfactualCorrectObserved: ev.filter(
        (r) => r.counterfactual.state === "OBSERVED" && r.counterfactual.correct,
      ).length,
      baselineWrongObserved: ev.filter(
        (r) => r.baseline.state === "OBSERVED" && !r.baseline.correct,
      ).length,
      counterfactualWrongObserved: ev.filter(
        (r) => r.counterfactual.state === "OBSERVED" && !r.counterfactual.correct,
      ).length,
      newlyWronglyAuthoritative: ev
        .filter(
          (r) =>
            r.baseline.state !== "OBSERVED" &&
            r.counterfactual.state === "OBSERVED" &&
            !r.counterfactual.correct,
        )
        .map((r) => r.caseId),
      stateChangedCases: ev.filter((r) => r.baseline.state !== r.counterfactual.state).length,
    },

    behaviorallyChangedCases: ev.filter((r) => r.changed === true).map((r) => r.caseId),
    productionFilesChanged: 0,
    productionBehaviorChanged: false,
    filtersModified: false,
  };

  writeFileSync(path.join(OUT, "aggregate.json"), `${JSON.stringify(aggregate, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(aggregate, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
