/**
 * Issue #149 — fresh re-derivation of Brand `truthInRawOcr`.
 *
 * RESEARCH / EVALUATION ONLY. Changes no production code, no filter, no
 * threshold, no truth and no corpus. It re-runs the real extractor over the
 * frozen governed population to obtain the COMPLETE per-word OCR evidence —
 * which the committed corpus report does not carry, because it caps
 * `sampleWords` at 25 per region — and then classifies Brand truth presence
 * under the rule frozen in `matching-rule.md`.
 *
 * Contamination boundary: the classifier receives `pass.words[].text` and the
 * governed acceptable list, and nothing else. Candidates, filter reasons,
 * reconstructed lines, ranks, selected values and the inherited
 * `truthInRawOcr` are attached only after classification, for comparison.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { extractLabelEvidenceDetailed } from "@/pipeline/extractor/extractor";
import type { AnalyzerOcrEngine } from "@/pipeline/analyzer/analyzer.types";
import type { ExtractionInput } from "@/pipeline/extractor/extractor.types";
import {
  betterTier as better,
  classifyRawOcrMatch as classifyPass,
  normToken,
  type RawOcrTier as Tier,
} from "@/fixtures/eval/issue-149-brand-raw-ocr-match";

const OUT = "artifacts/issue-149-brand-raw-ocr-rederivation";
const POPULATION = "artifacts/brand-evidence-path-diagnosis/cases.json";
const MANIFEST = "src/fixtures/eval/eval-manifest.json";

const OCR_ENGINE: AnalyzerOcrEngine = {
  kind: "ocr",
  engineId: "tesseract.js",
  engineVersion: "7.0.0",
  modelId: "eng",
};
const PROCESSED_AT = "2026-07-12T00:00:00Z";

// ---------------------------------------------------------------------------

interface PopulationCase {
  caseId: string;
  truth: { present: boolean; acceptable: string[] };
  truthInRawOcr: boolean;
  truthOnReconstructedLine: boolean;
  truthReachedCandidate: boolean;
  truthAmongKeptCandidates: boolean;
  truthFilterReasons: string[] | null;
  truthRank: number | null;
  truthInTop1: boolean;
  truthInTop3: boolean;
  selectedNormalizedMatch: boolean;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const population = JSON.parse(readFileSync(POPULATION, "utf8")) as PopulationCase[];
  const manifestRaw = JSON.parse(readFileSync(MANIFEST, "utf8")) as unknown;
  const manifest = (
    Array.isArray(manifestRaw)
      ? manifestRaw
      : ((manifestRaw as { cases?: unknown[]; records?: unknown[] }).cases ??
        (manifestRaw as { records?: unknown[] }).records ??
        [])
  ) as Array<{ caseId: string; imagePath: string }>;
  const imageById = new Map(manifest.map((record) => [record.caseId, record.imagePath]));

  const rows: Record<string, unknown>[] = [];
  const wordEvidence: Record<string, unknown>[] = [];

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

    const brandPresent = entry.truth?.present === true;
    let tier: Tier = "UNDETERMINABLE";
    let matched: string[] | null = null;
    let detail: string | null = null;
    let matchedPassId: string | null = null;
    let totalWords = 0;
    let brandPassCount = 0;

    if (!result.ok) {
      tier = "UNDETERMINABLE";
      detail = `extraction failed: ${result.error.code}`;
    } else if (!brandPresent) {
      tier = "NOT_PRESENT";
      detail = "brand-absent control; not classified";
    } else {
      const brandPasses = result.value.debug.passes.filter((pass) => pass.fieldEligibility.brand);
      brandPassCount = brandPasses.length;
      let best: Tier = "NOT_PRESENT";
      for (const pass of brandPasses) {
        totalWords += pass.words.length;
        const texts = pass.words.map((word) => word.text);
        for (const acceptable of entry.truth.acceptable) {
          const outcome = classifyPass(texts, acceptable);
          const merged = better(outcome.tier, best);
          if (merged !== best && outcome.tier === merged) {
            best = merged;
            matched = outcome.matchedTokens;
            detail = outcome.detail;
            matchedPassId = pass.passId;
          }
        }
      }
      tier = brandPasses.length === 0 ? "UNDETERMINABLE" : best;
      if (brandPasses.length === 0) detail = "no brand-eligible pass produced word evidence";

      wordEvidence.push({
        caseId: entry.caseId,
        acceptable: entry.truth.acceptable,
        passes: brandPasses.map((pass) => ({
          passId: pass.passId,
          regionName: pass.regionName,
          wordCount: pass.words.length,
          words: pass.words.map((word) => word.text),
        })),
      });
    }

    const fresh = tier === "EXACT_RAW_MATCH" || tier === "NORMALIZED_RAW_MATCH";
    rows.push({
      caseId: entry.caseId,
      brandPresent,
      groundTruthBrand: entry.truth?.acceptable ?? [],
      rawOcrEvidenceRef: `raw-word-evidence.jsonl#${entry.caseId}`,
      brandEligiblePasses: brandPassCount,
      totalBrandPassWords: totalWords,
      freshClassification: tier,
      freshTruthInRawOcr: fresh,
      normalizedMatchedTokens: matched,
      matchedPassId,
      explanation: detail,
      priorTruthInRawOcr: entry.truthInRawOcr,
      agreesWithPrior: brandPresent ? fresh === entry.truthInRawOcr : null,
      // Comparison-only, never used by the classifier:
      truthReachedCandidate: entry.truthReachedCandidate,
      truthAmongKeptCandidates: entry.truthAmongKeptCandidates,
      truthFilterReasons: entry.truthFilterReasons ?? null,
      truthInTop3: entry.truthInTop3,
      truthInTop1: entry.truthInTop1,
      selectedNormalizedMatch: entry.selectedNormalizedMatch,
    });

    if ((index + 1) % 20 === 0) process.stderr.write(`  …${index + 1}/${population.length}\n`);
  }

  writeFileSync(
    path.join(OUT, "case-level-rederivation.json"),
    `${JSON.stringify(rows, null, 2)}\n`,
  );
  writeFileSync(
    path.join(OUT, "raw-word-evidence.jsonl"),
    `${wordEvidence.map((entry) => JSON.stringify(entry)).join("\n")}\n`,
  );

  // -------------------------------------------------------------------------
  // Aggregates — every count traces to case-level rows.
  // -------------------------------------------------------------------------
  const bp = rows.filter((row) => row.brandPresent === true);
  const count = (tier: Tier) => bp.filter((row) => row.freshClassification === tier).length;
  const freshPresent = bp.filter((row) => row.freshTruthInRawOcr === true);
  const priorPresent = bp.filter((row) => row.priorTruthInRawOcr === true);
  const overturnedPositives = bp.filter(
    (row) => row.priorTruthInRawOcr === true && row.freshTruthInRawOcr === false,
  );
  const overturnedNegatives = bp.filter(
    (row) => row.priorTruthInRawOcr === false && row.freshTruthInRawOcr === true,
  );

  const survivedCandidate = bp.filter((row) => row.truthAmongKeptCandidates === true);
  const top3 = bp.filter((row) => row.truthInTop3 === true);
  const top1 = bp.filter((row) => row.truthInTop1 === true);
  const selected = bp.filter((row) => row.selectedNormalizedMatch === true);

  // Fresh cascade: losses measured against the FRESH raw-OCR classification.
  const lostOcrToCandidate = freshPresent.filter(
    (row) => row.truthAmongKeptCandidates !== true,
  ).length;

  // Filter decomposition, recounted over the fresh OCR-present population only.
  const filterRows = freshPresent.filter(
    (row) =>
      row.truthAmongKeptCandidates !== true &&
      Array.isArray(row.truthFilterReasons) &&
      (row.truthFilterReasons as string[]).length > 0,
  );
  const tmw = filterRows.filter((row) =>
    (row.truthFilterReasons as string[]).includes("too-many-words"),
  );
  const tmwSole = tmw.filter((row) => (row.truthFilterReasons as string[]).length === 1);
  const identities = new Set(
    tmwSole.map((row) => JSON.stringify((row.groundTruthBrand as string[]).map(normToken).sort())),
  );

  const aggregate = {
    artifact: "aggregate-rederivation",
    experimentId: "issue-149-brand-raw-ocr-rederivation",
    matchingRuleSha256: createHash("sha256")
      .update(readFileSync(path.join(OUT, "matching-rule.md")))
      .digest("hex"),
    population: {
      cases: rows.length,
      brandPresent: bp.length,
      brandAbsent: rows.length - bp.length,
      source: POPULATION,
    },
    freshClassification: {
      EXACT_RAW_MATCH: count("EXACT_RAW_MATCH"),
      NORMALIZED_RAW_MATCH: count("NORMALIZED_RAW_MATCH"),
      PARTIAL_INSUFFICIENT: count("PARTIAL_INSUFFICIENT"),
      NOT_PRESENT: count("NOT_PRESENT"),
      UNDETERMINABLE: count("UNDETERMINABLE"),
    },
    freshTruthInRawOcr: freshPresent.length,
    priorTruthInRawOcr: priorPresent.length,
    agreementRate: bp.length === 0 ? null : bp.filter((row) => row.agreesWithPrior === true).length / bp.length,
    agreementCases: bp.filter((row) => row.agreesWithPrior === true).length,
    disagreementCases: bp.filter((row) => row.agreesWithPrior === false).length,
    priorPositivesOverturned: overturnedPositives.length,
    priorNegativesOverturned: overturnedNegatives.length,
    overturnedPositiveCaseIds: overturnedPositives.map((row) => row.caseId),
    overturnedNegativeCaseIds: overturnedNegatives.map((row) => row.caseId),
    rebuiltCascade: {
      governedTruth: bp.length,
      truthPresentInRawOcr_fresh: freshPresent.length,
      truthSurvivesCandidateConstruction: survivedCandidate.length,
      truthInTop3: top3.length,
      truthInTop1: top1.length,
      truthSelected: selected.length,
      lostRawOcrToCandidateConstruction_fresh: lostOcrToCandidate,
      lostGovernedTruthToRawOcr_fresh: bp.length - freshPresent.length,
    },
    filterDecompositionFresh: {
      basis: "cases with fresh raw-OCR presence that did not survive candidate construction and carry at least one filter reason",
      filterRejectionCases: filterRows.length,
      tooManyWordsBlocker: tmw.length,
      tooManyWordsSoleBlocker: tmwSole.length,
      distinctBrandIdentitiesInSoleBlocker: identities.size,
    },
    productionFilesChanged: 0,
    filtersModified: false,
    truthChanged: false,
    corpusChanged: false,
  };

  writeFileSync(path.join(OUT, "aggregate.json"), `${JSON.stringify(aggregate, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(aggregate, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
