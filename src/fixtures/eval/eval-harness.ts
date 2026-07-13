import type {
  AnalyzerFieldObservation,
  AnalyzerOcrEngine,
} from "@/pipeline/analyzer/analyzer.types";
import { extractLabelEvidenceDetailed, type ExtractionDebug } from "@/pipeline/extractor/extractor";
import type { ExtractionInput, OcrWord } from "@/pipeline/extractor/extractor.types";

import { loadCaseImage } from "./eval-loader";
import type { EvalCase } from "./eval-manifest.types";
import {
  alcoholDetected,
  alcoholParsedAccurate,
  brandExactMatch,
  brandInTopK,
  brandNormalizedMatch,
  classifyAlcohol,
  classifyBrand,
  normalizedIncludes,
  parseObservedPercent,
  type AlcoholDiagnostics,
  type ObservedField,
} from "./metrics";
import type { CaseDiagnostics, CaseReport, DiagnosticWord } from "./eval-report.types";

/**
 * The evaluation harness runs the REAL extractor once per case and reuses the
 * extractor's actual OCR pass trace for diagnostics, failure attribution, and
 * orientation/region cost measurement. No second OCR sweep is performed.
 */

export const EVAL_ADAPTER = { id: "local-two-field-extractor", version: "1.0.0" } as const;
const EVAL_OCR_ENGINE: AnalyzerOcrEngine = {
  kind: "ocr",
  engineId: "tesseract.js",
  engineVersion: "7.0.0",
  modelId: "eng",
};
const EVAL_PROCESSED_AT = "2026-07-12T00:00:00Z";

const MAX_SAMPLE_WORDS_PER_REGION = 25;
const MAX_BRAND_LINES = 12;
const MAX_BRAND_CANDIDATES = 24;
const MAX_ALCOHOL_CANDIDATES = 24;
const MAX_TEXT_LEN = 120;
const LINE_Y_TOLERANCE = 20;

function brandCandidatePriority(decision?: string): number {
  if (decision === "selected") return 0;
  if (decision === "ambiguous-rival") return 1;
  if (decision === "alternate") return 2;
  return 3;
}

function extractionInput(evalCase: EvalCase, sha256: string): ExtractionInput {
  return {
    imageBytes: new Uint8Array(),
    artifactRef: evalCase.caseId,
    derivativeSha256: sha256,
    processedAt: EVAL_PROCESSED_AT,
    extractionAdapterId: EVAL_ADAPTER.id,
    extractionAdapterVersion: EVAL_ADAPTER.version,
    ocrEngine: EVAL_OCR_ENGINE,
    parserId: "wine-alcohol-parse",
    parserVersion: "1.0.0",
  };
}

function truncate(text: string): string {
  return text.length > MAX_TEXT_LEN ? `${text.slice(0, MAX_TEXT_LEN)}…` : text;
}

function groupLines(words: OcrWord[]): OcrWord[][] {
  const ordered = [...words].sort(
    (a, b) => (a.bbox.y0 + a.bbox.y1) / 2 - (b.bbox.y0 + b.bbox.y1) / 2,
  );
  const out: OcrWord[][] = [];
  for (const w of ordered) {
    const wy = (w.bbox.y0 + w.bbox.y1) / 2;
    const line = out.find((l) => {
      const ly = (l[0].bbox.y0 + l[0].bbox.y1) / 2;
      return Math.abs(ly - wy) <= LINE_Y_TOLERANCE;
    });
    if (line) line.push(w);
    else out.push([w]);
  }
  return out.map((l) => [...l].sort((a, b) => a.bbox.x0 - b.bbox.x0));
}

function textOf(words: OcrWord[]): string {
  return words.map((word) => word.text).join(" ");
}

function originalGeometryOf(word: OcrWord) {
  if (!word.originalGeometry) {
    throw new Error("expected mapped OCR geometry in extractor debug output");
  }
  return word.originalGeometry;
}

function containsAlcoholMarker(text: string): boolean {
  return /\b(?:alcohol|a[l1i]c)(?=\b|\d)/i.test(text);
}

function containsVolumeMarker(text: string): boolean {
  return (
    /\b(?:by\s*)?v[o0][l1i](?:ume)?\b/i.test(text) ||
    /\ba[l1i]c[./]*\s*\/\s*v[o0][l1i]/i.test(text) ||
    /\ba[l1i]c[./]*v[o0][l1i]/i.test(text)
  );
}

function candidateSupportsRecovery(
  supportPassIds: string[],
  recoveryPassIds: Set<string>,
): boolean {
  return supportPassIds.some((passId) => recoveryPassIds.has(passId));
}

function candidateSupportsPrimary(
  supportPassIds: string[],
  primaryPassId: string | undefined,
): boolean {
  return !!primaryPassId && supportPassIds.includes(primaryPassId);
}

function diagnosticsFor(debug: ExtractionDebug, acceptableBrands: string[]): CaseDiagnostics {
  const passes = debug.passes;
  const primaryPassId = passes[0]?.passId;
  const recoveryPassIds = new Set(passes.slice(1).map((pass) => pass.passId));

  const sampleRegions = passes.map((pass) => ({
    passId: pass.passId,
    regionName: pass.regionName,
    passKind: pass.passKind,
    triggerReasons: pass.triggerReasons,
    rotate: pass.transform.rotate,
    crop: pass.transform.crop,
    transformedSize: pass.transformedSize,
    wordCount: pass.words.length,
    rawWordCount: pass.rawWordCount,
    discardedWordCount: pass.discardedWordCount,
    timings: pass.timings,
    sampleWords: pass.words.slice(0, MAX_SAMPLE_WORDS_PER_REGION).map((word): DiagnosticWord => ({
      text: truncate(word.text),
      confidence: word.rawConfidence,
      bbox: word.bbox,
      originalGeometry: originalGeometryOf(word),
    })),
  }));

  const primaryBrandPasses = passes.filter(
    (pass) => pass.passKind === "full-image-primary" && pass.fieldEligibility.brand,
  );
  const recoveryBrandPasses = passes.filter(
    (pass) => pass.passKind !== "full-image-primary" && pass.fieldEligibility.brand,
  );
  const brandLineTexts = passes
    .filter((pass) => pass.fieldEligibility.brand)
    .flatMap((pass) =>
      groupLines(pass.words)
        .map((line) => truncate(textOf(line)))
        .filter((text) => text.trim().length > 0),
    )
    .slice(0, MAX_BRAND_LINES);

  const brandSelection = debug.finalSelections.brand;
  const brandCandidates = [...(brandSelection.brandDiagnostics?.candidates ?? [])];
  const keptBrandCandidates = brandCandidates.filter(
    (candidate) => candidate.kept && candidate.cleanedValue,
  );
  const brandCandidateValues = keptBrandCandidates.map((candidate) => candidate.cleanedValue!);
  const brandPrimaryText = primaryBrandPasses.map((pass) => textOf(pass.words)).join(" ");
  const brandRecoveryText = recoveryBrandPasses.map((pass) => textOf(pass.words)).join(" ");
  const brandPrimaryLines = primaryBrandPasses.flatMap((pass) =>
    groupLines(pass.words).map((line) => textOf(line)),
  );
  const brandRecoveryLines = recoveryBrandPasses.flatMap((pass) =>
    groupLines(pass.words).map((line) => textOf(line)),
  );

  const alcoholSelection = debug.finalSelections.alcohol;
  const alcoholCandidates = [...(alcoholSelection.alcoholDiagnostics?.candidates ?? [])];
  const primaryAlcoholWords = primaryBrandPasses.flatMap((pass) => pass.words);
  const recoveryAlcoholWords = passes
    .filter((pass) => pass.passKind !== "full-image-primary" && pass.fieldEligibility.alcohol)
    .flatMap((pass) => pass.words);
  const primaryAlcoholText = textOf(primaryAlcoholWords);
  const recoveryAlcoholText = textOf(recoveryAlcoholWords);

  const usefulPassIds = new Set<string>([
    ...debug.finalSelections.brand.supportingPassIds,
    ...debug.finalSelections.alcohol.supportingPassIds,
    ...keptBrandCandidates.flatMap((candidate) => candidate.supportPassIds),
    ...alcoholCandidates
      .filter((candidate) => candidate.kept)
      .flatMap((candidate) => candidate.supportPassIds),
  ]);
  const extraPassesWithNoUsableEvidence = passes
    .slice(1)
    .filter((pass) => !usefulPassIds.has(pass.passId)).length;

  return {
    regions: sampleRegions,
    performance: {
      passCount: passes.length,
      extraPassCount: Math.max(0, passes.length - 1),
      primaryPassDurationMs: passes[0]?.timings.totalMs ?? 0,
      transformedPassDurationMs: passes
        .filter((pass) => pass.transform.rotate !== 0)
        .reduce((sum, pass) => sum + pass.timings.totalMs, 0),
      regionPassDurationMs: passes
        .slice(1)
        .filter(
          (pass) =>
            pass.transform.crop.left !== 0 ||
            pass.transform.crop.top !== 0 ||
            pass.transform.crop.width !== pass.transform.originalWidth ||
            pass.transform.crop.height !== pass.transform.originalHeight,
        )
        .reduce((sum, pass) => sum + pass.timings.totalMs, 0),
      totalOcrDurationMs: passes.reduce((sum, pass) => sum + pass.timings.ocrMs, 0),
      totalRecoveryDurationMs: passes.slice(1).reduce((sum, pass) => sum + pass.timings.totalMs, 0),
      totalInverseMappingDurationMs: passes.reduce(
        (sum, pass) => sum + pass.timings.inverseMappingMs,
        0,
      ),
      extraPassesWithNoUsableEvidence,
    },
    primarySelections: {
      brandState: debug.primarySelections.brand.observation.state,
      brandValue: debug.primarySelections.brand.observation.value,
      alcoholState: debug.primarySelections.alcohol.observation.state,
      alcoholValue: debug.primarySelections.alcohol.observation.value,
    },
    finalSelectionPasses: {
      brandSourcePassId: debug.finalSelections.brand.source?.passId ?? null,
      brandSupportingPassIds: debug.finalSelections.brand.supportingPassIds,
      alcoholSourcePassId: debug.finalSelections.alcohol.source?.passId ?? null,
      alcoholSupportingPassIds: debug.finalSelections.alcohol.supportingPassIds,
    },
    brandLineTexts,
    brandCandidateDecisions: brandCandidates
      .sort((a, b) => {
        const decisionDelta =
          brandCandidatePriority(a.decision) - brandCandidatePriority(b.decision);
        if (decisionDelta !== 0) return decisionDelta;
        const scoreDelta =
          (b.score?.total ?? Number.NEGATIVE_INFINITY) -
          (a.score?.total ?? Number.NEGATIVE_INFINITY);
        if (scoreDelta !== 0) return scoreDelta;
        return b.prominence - a.prominence;
      })
      .slice(0, MAX_BRAND_CANDIDATES)
      .map((candidate) => ({
        rawText: truncate(candidate.rawText),
        cleanedValue: candidate.cleanedValue ? truncate(candidate.cleanedValue) : null,
        confidence: candidate.confidence,
        prominence: candidate.prominence,
        passId: candidate.passId,
        passKind: candidate.passKind,
        supportPassIds: candidate.supportPassIds,
        assembly: candidate.assembly,
        lineIndexes: candidate.lineIndexes,
        kept: candidate.kept,
        filterReason: candidate.filterReason,
        decision: candidate.decision,
        score: candidate.score,
      })),
    brandLineDecisions: (brandSelection.brandDiagnostics?.lines ?? [])
      .slice(0, MAX_BRAND_LINES)
      .map((line) => ({
        rawText: truncate(line.rawText),
        cleanedValue: line.cleanedValue ? truncate(line.cleanedValue) : null,
        confidence: line.confidence,
        prominence: line.prominence,
        passId: line.passId,
        passKind: line.passKind,
        kept: line.kept,
        reason: line.reason,
      })),
    brandAbstentionReason: brandSelection.brandDiagnostics?.abstentionReason,
    brandOcrContainsAcceptable:
      normalizedIncludes(brandPrimaryText, acceptableBrands) ||
      normalizedIncludes(brandRecoveryText, acceptableBrands),
    brandLineContainsAcceptable:
      brandPrimaryLines.some((line) => normalizedIncludes(line, acceptableBrands)) ||
      brandRecoveryLines.some((line) => normalizedIncludes(line, acceptableBrands)),
    brandCandidateContainsAcceptable: brandCandidateValues.some((value) =>
      acceptableBrands.some((acceptable) => brandNormalizedMatch(value, [acceptable])),
    ),
    brandPrimaryOcrContainsAcceptable: normalizedIncludes(brandPrimaryText, acceptableBrands),
    brandRecoveryOcrContainsAcceptable: normalizedIncludes(brandRecoveryText, acceptableBrands),
    brandPrimaryLineContainsAcceptable: brandPrimaryLines.some((line) =>
      normalizedIncludes(line, acceptableBrands),
    ),
    brandRecoveryLineContainsAcceptable: brandRecoveryLines.some((line) =>
      normalizedIncludes(line, acceptableBrands),
    ),
    brandPrimaryCandidateContainsAcceptable: keptBrandCandidates.some(
      (candidate) =>
        candidateSupportsPrimary(candidate.supportPassIds, primaryPassId) &&
        acceptableBrands.some((acceptable) =>
          brandNormalizedMatch(candidate.cleanedValue ?? null, [acceptable]),
        ),
    ),
    brandRecoveryCandidateContainsAcceptable: keptBrandCandidates.some(
      (candidate) =>
        candidateSupportsRecovery(candidate.supportPassIds, recoveryPassIds) &&
        acceptableBrands.some((acceptable) =>
          brandNormalizedMatch(candidate.cleanedValue ?? null, [acceptable]),
        ),
    ),
    alcoholCandidateDecisions: alcoholCandidates
      .sort((a, b) => {
        const decisionDelta =
          brandCandidatePriority(a.decision) - brandCandidatePriority(b.decision);
        if (decisionDelta !== 0) return decisionDelta;
        return b.confidence - a.confidence || b.prominence - a.prominence;
      })
      .slice(0, MAX_ALCOHOL_CANDIDATES)
      .map((candidate) => ({
        rawText: truncate(candidate.rawText),
        normalizedValue: candidate.normalizedValue ? truncate(candidate.normalizedValue) : null,
        normalizedParsingText: candidate.normalizedParsingText
          ? truncate(candidate.normalizedParsingText)
          : null,
        confidence: candidate.confidence,
        prominence: candidate.prominence,
        passId: candidate.passId,
        passKind: candidate.passKind,
        supportPassIds: candidate.supportPassIds,
        assembly: candidate.assembly,
        lineIndexes: candidate.lineIndexes,
        sourceTokens: candidate.sourceTokens.map(truncate),
        sourceBoxes: candidate.sourceBoxes,
        sourceOriginalBoxes: candidate.sourceOriginalBoxes,
        kept: candidate.kept,
        acceptanceReason: candidate.acceptanceReason,
        positiveMarkers: candidate.positiveMarkers,
        normalizationOperations: candidate.normalizationOperations,
        parsedPercent: candidate.parsedPercent,
        rejectionReason: candidate.rejectionReason,
        decision: candidate.decision,
      })),
    alcoholAbstentionReason: alcoholSelection.alcoholDiagnostics?.abstentionReason,
    alcoholNumberInOcr: /\d/.test(primaryAlcoholText) || /\d/.test(recoveryAlcoholText),
    alcoholPercentInOcr: primaryAlcoholText.includes("%") || recoveryAlcoholText.includes("%"),
    alcoholAlcoholMarkerInOcr:
      containsAlcoholMarker(primaryAlcoholText) || containsAlcoholMarker(recoveryAlcoholText),
    alcoholVolumeMarkerInOcr:
      containsVolumeMarker(primaryAlcoholText) || containsVolumeMarker(recoveryAlcoholText),
    alcoholSameLineEvidenceCluster: alcoholCandidates.some(
      (candidate) => candidate.assembly === "same-line-window",
    ),
    alcoholAdjacentLineEvidenceCluster: alcoholCandidates.some(
      (candidate) => candidate.assembly === "adjacent-line-window",
    ),
    alcoholPrimaryNumberInOcr: /\d/.test(primaryAlcoholText),
    alcoholRecoveryNumberInOcr: /\d/.test(recoveryAlcoholText),
    alcoholPrimarySameLineEvidenceCluster: alcoholCandidates.some(
      (candidate) =>
        candidate.assembly === "same-line-window" &&
        candidateSupportsPrimary(candidate.supportPassIds, primaryPassId),
    ),
    alcoholRecoverySameLineEvidenceCluster: alcoholCandidates.some(
      (candidate) =>
        candidate.assembly === "same-line-window" &&
        candidateSupportsRecovery(candidate.supportPassIds, recoveryPassIds),
    ),
    alcoholPrimaryAdjacentLineEvidenceCluster: alcoholCandidates.some(
      (candidate) =>
        candidate.assembly === "adjacent-line-window" &&
        candidateSupportsPrimary(candidate.supportPassIds, primaryPassId),
    ),
    alcoholRecoveryAdjacentLineEvidenceCluster: alcoholCandidates.some(
      (candidate) =>
        candidate.assembly === "adjacent-line-window" &&
        candidateSupportsRecovery(candidate.supportPassIds, recoveryPassIds),
    ),
    alcoholPrimaryCandidateAccepted: alcoholCandidates.some(
      (candidate) =>
        candidate.kept && candidateSupportsPrimary(candidate.supportPassIds, primaryPassId),
    ),
    alcoholRecoveryCandidateAccepted: alcoholCandidates.some(
      (candidate) =>
        candidate.kept && candidateSupportsRecovery(candidate.supportPassIds, recoveryPassIds),
    ),
    alcoholFilterRejectedCandidate:
      alcoholSelection.alcoholDiagnostics?.filterRejectedCandidate ?? false,
    alcoholParserRejectedCandidate:
      alcoholSelection.alcoholDiagnostics?.parserRejectedCandidate ?? false,
    alcoholCandidateAccepted: alcoholSelection.alcoholDiagnostics?.candidateAccepted ?? false,
  };
}

function emptyDiagnostics(): CaseDiagnostics {
  return {
    regions: [],
    performance: {
      passCount: 0,
      extraPassCount: 0,
      primaryPassDurationMs: 0,
      transformedPassDurationMs: 0,
      regionPassDurationMs: 0,
      totalOcrDurationMs: 0,
      totalRecoveryDurationMs: 0,
      totalInverseMappingDurationMs: 0,
      extraPassesWithNoUsableEvidence: 0,
    },
    primarySelections: {
      brandState: "NOT_OBSERVED",
      brandValue: null,
      alcoholState: "NOT_OBSERVED",
      alcoholValue: null,
    },
    finalSelectionPasses: {
      brandSourcePassId: null,
      brandSupportingPassIds: [],
      alcoholSourcePassId: null,
      alcoholSupportingPassIds: [],
    },
    brandLineTexts: [],
    brandCandidateDecisions: [],
    brandLineDecisions: [],
    brandOcrContainsAcceptable: false,
    brandLineContainsAcceptable: false,
    brandCandidateContainsAcceptable: false,
    brandPrimaryOcrContainsAcceptable: false,
    brandRecoveryOcrContainsAcceptable: false,
    brandPrimaryLineContainsAcceptable: false,
    brandRecoveryLineContainsAcceptable: false,
    brandPrimaryCandidateContainsAcceptable: false,
    brandRecoveryCandidateContainsAcceptable: false,
    brandAbstentionReason: undefined,
    alcoholCandidateDecisions: [],
    alcoholAbstentionReason: undefined,
    alcoholNumberInOcr: false,
    alcoholPercentInOcr: false,
    alcoholAlcoholMarkerInOcr: false,
    alcoholVolumeMarkerInOcr: false,
    alcoholSameLineEvidenceCluster: false,
    alcoholAdjacentLineEvidenceCluster: false,
    alcoholPrimaryNumberInOcr: false,
    alcoholRecoveryNumberInOcr: false,
    alcoholPrimarySameLineEvidenceCluster: false,
    alcoholRecoverySameLineEvidenceCluster: false,
    alcoholPrimaryAdjacentLineEvidenceCluster: false,
    alcoholRecoveryAdjacentLineEvidenceCluster: false,
    alcoholPrimaryCandidateAccepted: false,
    alcoholRecoveryCandidateAccepted: false,
    alcoholFilterRejectedCandidate: false,
    alcoholParserRejectedCandidate: false,
    alcoholCandidateAccepted: false,
  };
}

function toObserved(field: AnalyzerFieldObservation): ObservedField {
  return {
    state: field.state,
    value: field.value,
    confidence: field.confidence,
    alternates: field.alternates.map((alternate) => ({
      value: alternate.value,
      confidence: alternate.confidence,
    })),
  };
}

export async function runCase(evalCase: EvalCase): Promise<CaseReport> {
  const { bytes, sha256 } = loadCaseImage(evalCase);
  const input: ExtractionInput = { ...extractionInput(evalCase, sha256), imageBytes: bytes };

  const start = performance.now();
  const result = await extractLabelEvidenceDetailed(input);
  const latencyMs = performance.now() - start;

  let diagnostics = emptyDiagnostics();
  if (result.ok) diagnostics = diagnosticsFor(result.value.debug, evalCase.brand.acceptable);

  const alcoholDiag: AlcoholDiagnostics = {
    numberInOcr: diagnostics.alcoholNumberInOcr,
    percentInOcr: diagnostics.alcoholPercentInOcr,
    alcoholMarkerInOcr: diagnostics.alcoholAlcoholMarkerInOcr,
    volumeMarkerInOcr: diagnostics.alcoholVolumeMarkerInOcr,
    sameLineEvidenceCluster: diagnostics.alcoholSameLineEvidenceCluster,
    adjacentLineEvidenceCluster: diagnostics.alcoholAdjacentLineEvidenceCluster,
    filterRejectedCandidate: diagnostics.alcoholFilterRejectedCandidate,
    parserRejectedCandidate: diagnostics.alcoholParserRejectedCandidate,
    candidateAccepted: diagnostics.alcoholCandidateAccepted,
    primaryNumberInOcr: diagnostics.alcoholPrimaryNumberInOcr,
    recoveryNumberInOcr: diagnostics.alcoholRecoveryNumberInOcr,
    primarySameLineEvidenceCluster: diagnostics.alcoholPrimarySameLineEvidenceCluster,
    recoverySameLineEvidenceCluster: diagnostics.alcoholRecoverySameLineEvidenceCluster,
    primaryAdjacentLineEvidenceCluster: diagnostics.alcoholPrimaryAdjacentLineEvidenceCluster,
    recoveryAdjacentLineEvidenceCluster: diagnostics.alcoholRecoveryAdjacentLineEvidenceCluster,
    primaryCandidateAccepted: diagnostics.alcoholPrimaryCandidateAccepted,
    recoveryCandidateAccepted: diagnostics.alcoholRecoveryCandidateAccepted,
  };

  if (!result.ok) {
    const empty: ObservedField = {
      state: "NOT_OBSERVED",
      value: null,
      confidence: 0,
      alternates: [],
    };
    return {
      caseId: evalCase.caseId,
      fixtureDir: evalCase.fixtureDir,
      strata: evalCase.strata,
      extractionError: result.error.code,
      brand: {
        ...emptyFieldReport(empty),
        present: evalCase.brand.present,
        acceptable: evalCase.brand.acceptable,
        knownAmbiguous: evalCase.brand.knownAmbiguous,
        exactMatch: false,
        normalizedMatch: false,
        top3Recall: false,
        failureClass: classifyBrand(evalCase.brand, empty, {
          ocrContainsAcceptable: diagnostics.brandOcrContainsAcceptable,
          lineContainsAcceptable: diagnostics.brandLineContainsAcceptable,
          candidateContainsAcceptable: diagnostics.brandCandidateContainsAcceptable,
          primaryOcrContainsAcceptable: diagnostics.brandPrimaryOcrContainsAcceptable,
          recoveryOcrContainsAcceptable: diagnostics.brandRecoveryOcrContainsAcceptable,
          primaryLineContainsAcceptable: diagnostics.brandPrimaryLineContainsAcceptable,
          recoveryLineContainsAcceptable: diagnostics.brandRecoveryLineContainsAcceptable,
          primaryCandidateContainsAcceptable: diagnostics.brandPrimaryCandidateContainsAcceptable,
          recoveryCandidateContainsAcceptable: diagnostics.brandRecoveryCandidateContainsAcceptable,
          abstentionReason: diagnostics.brandAbstentionReason,
        }),
      },
      alcohol: {
        ...emptyFieldReport(empty),
        present: evalCase.alcohol.present,
        acceptablePercents: evalCase.alcohol.acceptablePercents,
        detected: false,
        parsedValue: null,
        parsedAccurate: false,
        failureClass: classifyAlcohol(evalCase.alcohol, empty, alcoholDiag),
      },
      diagnostics,
      latencyMs,
    };
  }

  const brandObs = toObserved(result.value.response.fields.brandName);
  const alcoholObs = toObserved(result.value.response.fields.alcoholStatement);

  return {
    caseId: evalCase.caseId,
    fixtureDir: evalCase.fixtureDir,
    strata: evalCase.strata,
    extractionError: null,
    brand: {
      state: brandObs.state,
      value: brandObs.value,
      confidence: brandObs.confidence,
      alternates: brandObs.alternates,
      present: evalCase.brand.present,
      acceptable: evalCase.brand.acceptable,
      knownAmbiguous: evalCase.brand.knownAmbiguous,
      exactMatch: brandExactMatch(brandObs.value, evalCase.brand.acceptable),
      normalizedMatch: brandNormalizedMatch(brandObs.value, evalCase.brand.acceptable),
      top3Recall: brandInTopK(brandObs, evalCase.brand.acceptable, 3),
      failureClass: classifyBrand(evalCase.brand, brandObs, {
        ocrContainsAcceptable: diagnostics.brandOcrContainsAcceptable,
        lineContainsAcceptable: diagnostics.brandLineContainsAcceptable,
        candidateContainsAcceptable: diagnostics.brandCandidateContainsAcceptable,
        primaryOcrContainsAcceptable: diagnostics.brandPrimaryOcrContainsAcceptable,
        recoveryOcrContainsAcceptable: diagnostics.brandRecoveryOcrContainsAcceptable,
        primaryLineContainsAcceptable: diagnostics.brandPrimaryLineContainsAcceptable,
        recoveryLineContainsAcceptable: diagnostics.brandRecoveryLineContainsAcceptable,
        primaryCandidateContainsAcceptable: diagnostics.brandPrimaryCandidateContainsAcceptable,
        recoveryCandidateContainsAcceptable: diagnostics.brandRecoveryCandidateContainsAcceptable,
        abstentionReason: diagnostics.brandAbstentionReason,
      }),
    },
    alcohol: {
      state: alcoholObs.state,
      value: alcoholObs.value,
      confidence: alcoholObs.confidence,
      alternates: alcoholObs.alternates,
      present: evalCase.alcohol.present,
      acceptablePercents: evalCase.alcohol.acceptablePercents,
      detected: alcoholDetected(alcoholObs),
      parsedValue: parseObservedPercent(alcoholObs.value),
      parsedAccurate: alcoholParsedAccurate(alcoholObs.value, evalCase.alcohol.acceptablePercents),
      failureClass: classifyAlcohol(evalCase.alcohol, alcoholObs, alcoholDiag),
    },
    diagnostics,
    latencyMs,
  };
}

function emptyFieldReport(empty: ObservedField) {
  return {
    state: empty.state,
    value: empty.value,
    confidence: empty.confidence,
    alternates: empty.alternates,
  };
}
