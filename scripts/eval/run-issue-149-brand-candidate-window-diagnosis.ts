/**
 * Issue #149 — where Brand truth disappears between raw OCR and the candidate set.
 *
 * EVALUATION ONLY, and it touches no production module: every surface it uses
 * already exists in `main` — `selectBrandObservationWithCompleteFilterDiagnostics`
 * (PR #220) for the complete pre-filter candidate population and reason sets, and
 * `classifyRawOcrMatch` (PR #223) for raw-OCR truth presence.
 *
 * Instrumentation captures; it does not reinterpret. The classifier applies the
 * rules frozen in `frozen-definitions.md`.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  classifyRawOcrMatch,
  isPresent,
  normToken,
  truthTokens,
} from "@/fixtures/eval/issue-149-brand-raw-ocr-match";
import { brandExactMatch, brandNormalizedMatch } from "@/fixtures/eval/metrics";
import { extractLabelEvidenceDetailed } from "@/pipeline/extractor/extractor";
import type { AnalyzerOcrEngine } from "@/pipeline/analyzer/analyzer.types";
import type { ExtractionInput } from "@/pipeline/extractor/extractor.types";
import {
  selectBrandObservationWithCompleteFilterDiagnostics,
  type BrandCandidateDiagnostic,
} from "@/pipeline/extractor/field-selection";

const OUT = "artifacts/issue-149-brand-candidate-window-diagnosis";
const POPULATION = "artifacts/brand-evidence-path-diagnosis/cases.json";
const REDERIVATION =
  "artifacts/issue-149-brand-raw-ocr-rederivation/primary/case-level-rederivation.json";
const MANIFEST = "src/fixtures/eval/eval-manifest.json";

const OCR_ENGINE: AnalyzerOcrEngine = {
  kind: "ocr",
  engineId: "tesseract.js",
  engineVersion: "7.0.0",
  modelId: "eng",
};
const PROCESSED_AT = "2026-07-12T00:00:00Z";

type FailureClass =
  | "A_EXACT_CANDIDATE_GENERATED_AND_FILTERED"
  | "B_OVERWIDE_WINDOW"
  | "C_PARTIAL_WINDOW"
  | "D_TRUTH_SPANS_MULTIPLE_GENERATION_UNITS"
  | "E_WINDOW_NOT_ENUMERATED"
  | "F_NORMALIZATION_TOKENIZATION_MISMATCH"
  | "G_OTHER"
  | "H_UNDETERMINABLE";

const valueOf = (c: BrandCandidateDiagnostic): string => c.cleanedValue ?? c.rawText;
const equalsBrand = (v: string | null, acceptable: string[]): boolean =>
  brandExactMatch(v, acceptable) || brandNormalizedMatch(v, acceptable);

/** Does `value` carry the brand inside a longer value? */
function containsBrand(value: string, acceptable: string[]): boolean {
  const hay = value.split(/\s+/).map(normToken).filter(Boolean).join("");
  return acceptable.some((a) => {
    const needle = truthTokens(a).join("");
    return needle.length > 0 && hay.includes(needle) && hay !== needle;
  });
}

/** Is `value` a proper part of the brand? */
function partialOfBrand(value: string, acceptable: string[]): boolean {
  const hay = value.split(/\s+/).map(normToken).filter(Boolean).join("");
  if (hay.length === 0) return false;
  return acceptable.some((a) => {
    const full = truthTokens(a).join("");
    return full.length > 0 && full.includes(hay) && full !== hay;
  });
}

/** Tokens of a candidate's raw span, normalized per token. */
const spanTokens = (c: BrandCandidateDiagnostic): string[] =>
  c.rawText.split(/\s+/).map(normToken).filter(Boolean);

interface PopulationCase {
  caseId: string;
  truth: { present: boolean; acceptable: string[] };
}
interface RederivationRow {
  caseId: string;
  freshTruthInRawOcr: boolean;
  freshClassification: string;
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const population = JSON.parse(readFileSync(POPULATION, "utf8")) as PopulationCase[];
  const rederivation = JSON.parse(readFileSync(REDERIVATION, "utf8")) as RederivationRow[];
  const freshById = new Map(rederivation.map((r) => [r.caseId, r]));
  const manifestRaw = JSON.parse(readFileSync(MANIFEST, "utf8")) as {
    records?: Array<{ caseId: string; imagePath: string }>;
  };
  const manifest = manifestRaw.records ?? [];
  if (manifest.length === 0) throw new Error("eval manifest produced zero records");
  const imageById = new Map(manifest.map((r) => [r.caseId, r.imagePath]));

  const rows: Record<string, unknown>[] = [];
  const completeness = {
    casesWithRejectedCandidatesVisible: 0,
    maxCandidatesInOneCase: 0,
    casesOverHarnessCandidateCap24: 0,
    maxLinesInOneCase: 0,
    casesOverHarnessLineCap12: 0,
    rejectedCandidatesMissingReasons: 0,
  };

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
      rows.push({ caseId: entry.caseId, evaluable: false, error: result.error.code });
      continue;
    }

    const passes = result.value.debug.passes.filter((p) => p.fieldEligibility.brand);
    const acceptable = entry.truth?.present ? entry.truth.acceptable : [];
    const selection = selectBrandObservationWithCompleteFilterDiagnostics(passes);
    const candidates = selection.brandDiagnostics?.candidates ?? [];
    const lines = selection.brandDiagnostics?.lines ?? [];

    // ---- instrumentation completeness, observed rather than assumed ----
    if (candidates.some((c) => !c.kept)) completeness.casesWithRejectedCandidatesVisible++;
    completeness.maxCandidatesInOneCase = Math.max(
      completeness.maxCandidatesInOneCase,
      candidates.length,
    );
    if (candidates.length > 24) completeness.casesOverHarnessCandidateCap24++;
    completeness.maxLinesInOneCase = Math.max(completeness.maxLinesInOneCase, lines.length);
    if (lines.length > 12) completeness.casesOverHarnessLineCap12++;
    completeness.rejectedCandidatesMissingReasons += candidates.filter(
      (c) => !c.kept && (c.activeRejectionReasons ?? []).length === 0,
    ).length;

    const fresh = freshById.get(entry.caseId);
    const rawPresent = fresh?.freshTruthInRawOcr === true;
    const exactKept = candidates.some((c) => c.kept && equalsBrand(valueOf(c), acceptable));

    const inScope = entry.truth?.present === true && rawPresent && !exactKept;
    if (!inScope) {
      rows.push({
        caseId: entry.caseId,
        evaluable: true,
        inScope: false,
        brandPresent: entry.truth?.present === true,
        freshTruthInRawOcr: rawPresent,
        exactCandidateKept: exactKept,
      });
      if ((index + 1) % 20 === 0) process.stderr.write(`  …${index + 1}/${population.length}\n`);
      continue;
    }

    // ---- classification, per the frozen definitions ----
    const exactPreFilter = candidates.filter((c) => equalsBrand(valueOf(c), acceptable));
    const overwide = candidates.filter((c) => containsBrand(valueOf(c), acceptable));
    const partial = candidates.filter((c) => partialOfBrand(valueOf(c), acceptable));

    // Which pass/line units contain the truth token run contiguously?
    const unitsContainingTruth: Array<{ passId: string; lineIndex: number; rawText: string }> = [];
    for (const [lineIndex, line] of lines.entries()) {
      const tokens = line.rawText.split(/\s+/);
      const hit = acceptable.some((a) => isPresent(classifyRawOcrMatch(tokens, a).tier));
      if (hit) unitsContainingTruth.push({ passId: line.passId, lineIndex, rawText: line.rawText });
    }

    // A span whose raw tokens are exactly the truth tokens.
    const spanCoveringTruthExactly = candidates.filter((c) =>
      acceptable.some((a) => {
        const t = truthTokens(a);
        const s = spanTokens(c);
        return s.length === t.length && s.every((x, i) => x === t[i]);
      }),
    );

    let failureClass: FailureClass;
    let explanation: string;

    // Amendment 1 precedence: exact candidate existence is tested FIRST, because
    // its existence falsifies a window-formation loss for that case. An emitted
    // exact span is tested next, for the same reason one stage later.
    if (exactPreFilter.length > 0) {
      const kept = exactPreFilter.filter((c) => c.kept);
      if (kept.length > 0) {
        failureClass = "G_OTHER";
        explanation =
          "SCOPE VIOLATION: an exact candidate was kept, so this case should not be in the loss population. Investigate.";
      } else {
        failureClass = "A_EXACT_CANDIDATE_GENERATED_AND_FILTERED";
        explanation = `A pre-filter candidate equal to the Brand was generated and rejected: ${JSON.stringify(
          exactPreFilter.map((c) => ({
            value: valueOf(c),
            reasons: c.activeRejectionReasons ?? [c.filterReason],
          })),
        )}`;
      }
    } else if (spanCoveringTruthExactly.length > 0) {
      failureClass = "F_NORMALIZATION_TOKENIZATION_MISMATCH";
      explanation = `A span covering exactly the truth token run was emitted, so enumeration succeeded; its constructed value does not equal the Brand: ${JSON.stringify(
        spanCoveringTruthExactly.map((c) => ({ rawText: c.rawText, value: valueOf(c) })),
      )}`;
    } else if (unitsContainingTruth.length === 0) {
      failureClass = "D_TRUTH_SPANS_MULTIPLE_GENERATION_UNITS";
      explanation =
        "The truth token run is present in raw OCR but not contiguous within any single reconstructed line, so span enumeration never had a unit containing it.";
    } else if (overwide.length > 0) {
      failureClass = "B_OVERWIDE_WINDOW";
      explanation = `No exact candidate. Generated windows carry the Brand inside longer values: ${JSON.stringify(
        overwide.slice(0, 3).map((c) => valueOf(c)),
      )}`;
    } else if (partial.length > 0) {
      failureClass = "C_PARTIAL_WINDOW";
      explanation = `No exact or overwide candidate. Generated windows capture only part of the Brand: ${JSON.stringify(
        partial.slice(0, 3).map((c) => valueOf(c)),
      )}`;
    } else {
      failureClass = "E_WINDOW_NOT_ENUMERATED";
      explanation =
        "The truth token run sits inside a reconstructed line, but no generated candidate equals, contains, or partially matches the Brand.";
    }

    rows.push({
      caseId: entry.caseId,
      evaluable: true,
      inScope: true,
      governedBrand: acceptable,
      freshRawOcrClassification: fresh?.freshClassification ?? null,
      rawTruthBearingTokenRun: acceptable.map((a) => truthTokens(a)),
      provenance: {
        brandEligiblePasses: passes.map((p) => ({ passId: p.passId, regionName: p.regionName })),
        unitsContainingTruth,
        totalLines: lines.length,
        totalCandidates: candidates.length,
        keptCandidates: candidates.filter((c) => c.kept).length,
      },
      exactCandidateGenerated: exactPreFilter.length > 0,
      exactCandidateKept: exactKept,
      overwideCandidateGenerated: overwide.length > 0,
      partialCandidateGenerated: partial.length > 0,
      spanCoveringTruthExactlyEmitted: spanCoveringTruthExactly.length > 0,
      relevantGeneratedSpans: [...exactPreFilter, ...overwide, ...partial].slice(0, 8).map((c) => ({
        rawText: c.rawText,
        value: valueOf(c),
        assembly: c.assembly,
        passId: c.passId,
        regionName: c.regionName,
        lineIndexes: c.lineIndexes,
        kept: c.kept,
        activeRejectionReasons: c.activeRejectionReasons ?? [c.filterReason],
      })),
      filterReasonsIfExactCandidateExisted:
        exactPreFilter.length > 0
          ? exactPreFilter.map((c) => c.activeRejectionReasons ?? [c.filterReason])
          : null,
      earliestDemonstratedFailureStage:
        failureClass === "A_EXACT_CANDIDATE_GENERATED_AND_FILTERED"
          ? "filtering"
          : failureClass === "F_NORMALIZATION_TOKENIZATION_MISMATCH"
            ? "candidate value construction"
            : failureClass === "D_TRUTH_SPANS_MULTIPLE_GENERATION_UNITS"
              ? "line/region structure"
              : "span/window enumeration",
      failureClass,
      explanation,
    });

    if ((index + 1) % 20 === 0) process.stderr.write(`  …${index + 1}/${population.length}\n`);
  }

  writeFileSync(path.join(OUT, "case-level-diagnosis.json"), `${JSON.stringify(rows, null, 2)}\n`);

  const scope = rows.filter((r) => r.inScope === true) as Array<Record<string, any>>;
  const count = (c: FailureClass) => scope.filter((r) => r.failureClass === c).length;
  const filterLoss = count("A_EXACT_CANDIDATE_GENERATED_AND_FILTERED");
  const windowLoss =
    count("B_OVERWIDE_WINDOW") + count("C_PARTIAL_WINDOW") + count("E_WINDOW_NOT_ENUMERATED");

  const aggregate = {
    artifact: "aggregate",
    experimentId: "issue-149-brand-candidate-window-diagnosis",
    frozenDefinitionsSha256: createHash("sha256")
      .update(readFileSync(path.join(OUT, "frozen-definitions.md")))
      .digest("hex"),
    instrumentationCompleteness: completeness,
    population: {
      cases: rows.length,
      brandPresent: rows.filter((r) => (r as any).brandPresent !== false && (r as any).evaluable)
        .length,
      inScope: scope.length,
    },
    classification: {
      A_EXACT_CANDIDATE_GENERATED_AND_FILTERED: filterLoss,
      B_OVERWIDE_WINDOW: count("B_OVERWIDE_WINDOW"),
      C_PARTIAL_WINDOW: count("C_PARTIAL_WINDOW"),
      D_TRUTH_SPANS_MULTIPLE_GENERATION_UNITS: count("D_TRUTH_SPANS_MULTIPLE_GENERATION_UNITS"),
      E_WINDOW_NOT_ENUMERATED: count("E_WINDOW_NOT_ENUMERATED"),
      F_NORMALIZATION_TOKENIZATION_MISMATCH: count("F_NORMALIZATION_TOKENIZATION_MISMATCH"),
      G_OTHER: count("G_OTHER"),
      H_UNDETERMINABLE: count("H_UNDETERMINABLE"),
    },
    rollUp: {
      FILTER_LOSS: filterLoss,
      WINDOW_SPAN_FORMATION_LOSS: windowLoss,
      STRUCTURAL_SEGMENTATION_LOSS: count("D_TRUTH_SPANS_MULTIPLE_GENERATION_UNITS"),
      VALUE_CONSTRUCTION_LOSS: count("F_NORMALIZATION_TOKENIZATION_MISMATCH"),
      OTHER: count("G_OTHER") + count("H_UNDETERMINABLE"),
    },
    tooManyWordsReconciliation: {
      casesWhereExactCandidateRejectedByTooManyWords: scope.filter(
        (r) =>
          r.failureClass === "A_EXACT_CANDIDATE_GENERATED_AND_FILTERED" &&
          (r.filterReasonsIfExactCandidateExisted ?? []).some((rs: string[]) =>
            rs.includes("too-many-words"),
          ),
      ).length,
      casesWhereTooManyWordsRejectedOnlyAnOverwideSpan: scope.filter(
        (r) => r.failureClass === "B_OVERWIDE_WINDOW",
      ).length,
    },
    productionFilesChanged: 0,
    productionBehaviorChanged: false,
  };

  writeFileSync(path.join(OUT, "aggregate.json"), `${JSON.stringify(aggregate, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(aggregate, null, 2)}\n`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
