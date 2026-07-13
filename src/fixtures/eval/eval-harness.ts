import type {
  AnalyzerFieldObservation,
  AnalyzerOcrEngine,
} from "@/pipeline/analyzer/analyzer.types";
import { extractLabelEvidenceDetailed, type ExtractionDebug } from "@/pipeline/extractor/extractor";
import {
  selectAlcoholObservation,
  selectBrandObservation,
  type FieldSelection,
} from "@/pipeline/extractor/field-selection";
import type { ExtractionInput, OcrWord } from "@/pipeline/extractor/extractor.types";

import {
  alcoholCandidateFilteringSubtype,
  alcoholSelectedFieldCorrect,
  brandCandidateFilteringSubtype,
  brandSelectedFieldCorrect,
} from "./diagnostic-attribution";
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
  normalizeKey,
  normalizedIncludes,
  parseObservedPercent,
  type AlcoholDiagnostics,
  type ObservedField,
} from "./metrics";
import type {
  CandidateCalibrationRecord,
  CaseDiagnostics,
  CaseReport,
  DiagnosticWord,
  EvalFieldKey,
  FieldReport,
  RecoveryPassContribution,
} from "./eval-report.types";

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

function selectionForPasses(passes: ExtractionDebug["passes"]): {
  brand: FieldSelection;
  alcohol: FieldSelection;
} {
  return {
    brand: selectBrandObservation(passes),
    alcohol: selectAlcoholObservation(passes),
  };
}

function observationChanged(previous: FieldSelection, current: FieldSelection): boolean {
  return (
    previous.observation.state !== current.observation.state ||
    previous.observation.value !== current.observation.value
  );
}

function fieldsForPass(
  passId: string,
  brandEntries: { passId: string }[],
  alcoholEntries: { passId: string }[],
): EvalFieldKey[] {
  const fields: EvalFieldKey[] = [];
  if (brandEntries.some((entry) => entry.passId === passId)) fields.push("brand");
  if (alcoholEntries.some((entry) => entry.passId === passId)) fields.push("alcohol");
  return fields;
}

function tokenKeys(words: OcrWord[]): Set<string> {
  return new Set(words.map((word) => normalizeKey(word.text)).filter((key) => key.length > 0));
}

function contributionFields(
  evalCase: EvalCase,
  previous: { brand: FieldSelection; alcohol: FieldSelection },
  current: { brand: FieldSelection; alcohol: FieldSelection },
): EvalFieldKey[] {
  const fields: EvalFieldKey[] = [];
  if (
    !brandSelectedFieldCorrect(evalCase.brand, toObserved(previous.brand.observation)) &&
    brandSelectedFieldCorrect(evalCase.brand, toObserved(current.brand.observation))
  ) {
    fields.push("brand");
  }
  if (
    !alcoholSelectedFieldCorrect(evalCase.alcohol, toObserved(previous.alcohol.observation)) &&
    alcoholSelectedFieldCorrect(evalCase.alcohol, toObserved(current.alcohol.observation))
  ) {
    fields.push("alcohol");
  }
  return fields;
}

function recoveryPassDiagnostics(
  debug: ExtractionDebug,
  evalCase: EvalCase,
): RecoveryPassContribution[] {
  const passes = debug.passes;
  if (passes.length <= 1) return [];

  const prefixes = passes.map((_, index) => selectionForPasses(passes.slice(0, index + 1)));
  const priorTokenSets: Set<string>[] = passes.map((_, index) =>
    tokenKeys(passes.slice(0, index).flatMap((pass) => pass.words)),
  );

  let cumulativeCostMs = passes[0]?.timings.totalMs ?? 0;
  return passes.slice(1).map((pass, recoveryIndex) => {
    const passOrder = recoveryIndex + 1;
    cumulativeCostMs += pass.timings.totalMs;

    const previous = prefixes[passOrder - 1];
    const current = prefixes[passOrder];

    const newTokenCount = [...tokenKeys(pass.words)].filter(
      (key) => !priorTokenSets[passOrder].has(key),
    ).length;

    const brandCandidateDecisions = current.brand.brandDiagnostics?.candidates ?? [];
    const alcoholCandidateDecisions = current.alcohol.alcoholDiagnostics?.candidates ?? [];
    const newFieldLikeEvidenceFields = fieldsForPass(
      pass.passId,
      brandCandidateDecisions,
      alcoholCandidateDecisions,
    );
    const acceptedCandidateFields = fieldsForPass(
      pass.passId,
      brandCandidateDecisions.filter((candidate) => candidate.kept),
      alcoholCandidateDecisions.filter((candidate) => candidate.kept),
    );

    const changedSelectedFields: EvalFieldKey[] = [];
    if (observationChanged(previous.brand, current.brand)) changedSelectedFields.push("brand");
    if (observationChanged(previous.alcohol, current.alcohol))
      changedSelectedFields.push("alcohol");

    const correctSelectedFields = contributionFields(evalCase, previous, current);

    const newOcrTokens = newTokenCount > 0;
    const newFieldLikeEvidence = newFieldLikeEvidenceFields.length > 0;
    const acceptedCandidate = acceptedCandidateFields.length > 0;
    const changedSelectedField = changedSelectedFields.length > 0;
    const correctSelectedField = correctSelectedFields.length > 0;

    return {
      passId: pass.passId,
      passOrder,
      passKind: pass.passKind,
      triggerReasons: pass.triggerReasons,
      executionTimeMs: pass.timings.totalMs,
      cumulativeCostMs,
      newOcrTokens,
      newOcrTokenCount: newTokenCount,
      newFieldLikeEvidence,
      newFieldLikeEvidenceFields,
      acceptedCandidate,
      acceptedCandidateFields,
      changedSelectedField,
      changedSelectedFields,
      correctSelectedField,
      correctSelectedFields,
      noMeasuredValue:
        !newOcrTokens &&
        !newFieldLikeEvidence &&
        !acceptedCandidate &&
        !changedSelectedField &&
        !correctSelectedField,
    };
  });
}

function diagnosticsFor(debug: ExtractionDebug, evalCase: EvalCase): CaseDiagnostics {
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
    recoveryPasses: recoveryPassDiagnostics(debug, evalCase),
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
        ocrEvidenceScore: candidate.ocrEvidenceScore,
        ocrConfidence: candidate.ocrConfidence,
        prominence: candidate.prominence,
        passId: candidate.passId,
        passKind: candidate.passKind,
        supportPassIds: candidate.supportPassIds,
        candidateProvenance: candidate.candidateProvenance,
        assembly: candidate.assembly,
        lineIndexes: candidate.lineIndexes,
        kept: candidate.kept,
        filterReason: candidate.filterReason,
        decision: candidate.decision,
        score: candidate.score,
        ranking: candidate.ranking,
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
      normalizedIncludes(brandPrimaryText, evalCase.brand.acceptable) ||
      normalizedIncludes(brandRecoveryText, evalCase.brand.acceptable),
    brandLineContainsAcceptable:
      brandPrimaryLines.some((line) => normalizedIncludes(line, evalCase.brand.acceptable)) ||
      brandRecoveryLines.some((line) => normalizedIncludes(line, evalCase.brand.acceptable)),
    brandCandidateContainsAcceptable: brandCandidateValues.some((value) =>
      evalCase.brand.acceptable.some((acceptable) => brandNormalizedMatch(value, [acceptable])),
    ),
    brandPrimaryOcrContainsAcceptable: normalizedIncludes(
      brandPrimaryText,
      evalCase.brand.acceptable,
    ),
    brandRecoveryOcrContainsAcceptable: normalizedIncludes(
      brandRecoveryText,
      evalCase.brand.acceptable,
    ),
    brandPrimaryLineContainsAcceptable: brandPrimaryLines.some((line) =>
      normalizedIncludes(line, evalCase.brand.acceptable),
    ),
    brandRecoveryLineContainsAcceptable: brandRecoveryLines.some((line) =>
      normalizedIncludes(line, evalCase.brand.acceptable),
    ),
    brandPrimaryCandidateContainsAcceptable: keptBrandCandidates.some(
      (candidate) =>
        candidateSupportsPrimary(candidate.supportPassIds, primaryPassId) &&
        evalCase.brand.acceptable.some((acceptable) =>
          brandNormalizedMatch(candidate.cleanedValue ?? null, [acceptable]),
        ),
    ),
    brandRecoveryCandidateContainsAcceptable: keptBrandCandidates.some(
      (candidate) =>
        candidateSupportsRecovery(candidate.supportPassIds, recoveryPassIds) &&
        evalCase.brand.acceptable.some((acceptable) =>
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
        ocrEvidenceScore: candidate.ocrEvidenceScore,
        ocrConfidence: candidate.ocrConfidence,
        prominence: candidate.prominence,
        passId: candidate.passId,
        passKind: candidate.passKind,
        supportPassIds: candidate.supportPassIds,
        candidateProvenance: candidate.candidateProvenance,
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
        ranking: candidate.ranking,
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
    calibrationCandidates: [],
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
    recoveryPasses: [],
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
    calibrationCandidates: [],
  };
}

function toObserved(field: AnalyzerFieldObservation): ObservedField {
  return {
    state: field.state,
    value: field.value,
    confidence: field.confidence,
    ocrEvidenceScore: field.ocrEvidenceScore,
    alternates: field.alternates.map((alternate) => ({
      value: alternate.value,
      confidence: alternate.confidence,
      ocrEvidenceScore: alternate.ocrEvidenceScore,
    })),
  };
}

function fieldReportOf(
  field: AnalyzerFieldObservation,
): Omit<FieldReport, "failureClass" | "candidateFilteringSubtype"> {
  return {
    state: field.state,
    value: field.value,
    confidence: field.confidence,
    ocrEvidenceScore: field.ocrEvidenceScore,
    ocrConfidence: field.ocrConfidence,
    candidateProvenance: field.candidateProvenance,
    ranking: field.ranking,
    alternates: field.alternates.map((alternate) => ({
      value: alternate.value,
      confidence: alternate.confidence,
      ocrEvidenceScore: alternate.ocrEvidenceScore,
      ocrConfidence: alternate.ocrConfidence,
      candidateProvenance: alternate.candidateProvenance,
      ranking: alternate.ranking,
    })),
  };
}

function calibrationStatus(
  decision: string | undefined,
  kept: boolean,
): CandidateCalibrationRecord["candidateStatus"] {
  if (decision === "selected" || decision === "alternate" || decision === "ambiguous-rival") {
    return decision;
  }
  return kept ? "alternate" : "rejected";
}

function brandCalibrationCandidates(
  evalCase: EvalCase,
  diagnostics: CaseDiagnostics,
): CandidateCalibrationRecord[] {
  return diagnostics.brandCandidateDecisions.map((candidate, index) => {
    const candidateStatus = calibrationStatus(candidate.decision, candidate.kept);
    const comparableValue = candidate.cleanedValue ?? candidate.rawText;
    const exactMatch = evalCase.brand.present
      ? brandExactMatch(comparableValue, evalCase.brand.acceptable)
      : false;
    const normalizedMatch = evalCase.brand.present
      ? brandNormalizedMatch(comparableValue, evalCase.brand.acceptable)
      : false;
    return {
      caseId: evalCase.caseId,
      field: "brand",
      candidateId: `brand-candidate-${index}`,
      candidateStatus,
      selected: candidateStatus === "selected",
      inference: {
        rawText: candidate.rawText,
        normalizedValue: candidate.cleanedValue,
        ocrEvidenceScore: candidate.ocrEvidenceScore,
        ocrConfidence: candidate.ocrConfidence,
        candidateProvenance: candidate.candidateProvenance,
        ranking: candidate.ranking,
        prominence: candidate.prominence,
        passId: candidate.passId,
        passKind: candidate.passKind,
        supportPassIds: candidate.supportPassIds,
        kept: candidate.kept,
      },
      evaluation: {
        truthPresent: evalCase.brand.present,
        acceptable: exactMatch || normalizedMatch,
        exactMatch,
        normalizedMatch,
      },
    };
  });
}

function alcoholCalibrationCandidates(
  evalCase: EvalCase,
  diagnostics: CaseDiagnostics,
): CandidateCalibrationRecord[] {
  return diagnostics.alcoholCandidateDecisions.map((candidate, index) => {
    const candidateStatus = calibrationStatus(candidate.decision, candidate.kept);
    const comparableValue =
      candidate.normalizedValue ?? candidate.normalizedParsingText ?? candidate.rawText;
    const parsedAccurate = evalCase.alcohol.present
      ? alcoholParsedAccurate(comparableValue, evalCase.alcohol.acceptablePercents)
      : false;
    return {
      caseId: evalCase.caseId,
      field: "alcohol",
      candidateId: `alcohol-candidate-${index}`,
      candidateStatus,
      selected: candidateStatus === "selected",
      inference: {
        rawText: candidate.rawText,
        normalizedValue: candidate.normalizedValue,
        ocrEvidenceScore: candidate.ocrEvidenceScore,
        ocrConfidence: candidate.ocrConfidence,
        candidateProvenance: candidate.candidateProvenance,
        ranking: candidate.ranking,
        prominence: candidate.prominence,
        passId: candidate.passId,
        passKind: candidate.passKind,
        supportPassIds: candidate.supportPassIds,
        kept: candidate.kept,
      },
      evaluation: {
        truthPresent: evalCase.alcohol.present,
        acceptable: parsedAccurate,
        parsedAccurate,
      },
    };
  });
}

function buildCalibrationCandidates(
  evalCase: EvalCase,
  diagnostics: CaseDiagnostics,
): CandidateCalibrationRecord[] {
  return [
    ...brandCalibrationCandidates(evalCase, diagnostics),
    ...alcoholCalibrationCandidates(evalCase, diagnostics),
  ];
}

export async function runCase(evalCase: EvalCase): Promise<CaseReport> {
  const { bytes, sha256 } = loadCaseImage(evalCase);
  const input: ExtractionInput = { ...extractionInput(evalCase, sha256), imageBytes: bytes };

  const start = performance.now();
  const result = await extractLabelEvidenceDetailed(input);
  const latencyMs = performance.now() - start;

  let diagnostics = emptyDiagnostics();
  if (result.ok) {
    diagnostics = diagnosticsFor(result.value.debug, evalCase);
    diagnostics.calibrationCandidates = buildCalibrationCandidates(evalCase, diagnostics);
  }

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
      ocrEvidenceScore: 0,
      alternates: [],
    };
    const brandFailureClass = classifyBrand(evalCase.brand, empty, {
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
    });
    const alcoholFailureClass = classifyAlcohol(evalCase.alcohol, empty, alcoholDiag);
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
        failureClass: brandFailureClass,
        candidateFilteringSubtype:
          brandFailureClass === "candidate-filtering-failure"
            ? brandCandidateFilteringSubtype(evalCase.brand, diagnostics)
            : null,
      },
      alcohol: {
        ...emptyFieldReport(empty),
        present: evalCase.alcohol.present,
        acceptablePercents: evalCase.alcohol.acceptablePercents,
        detected: false,
        parsedValue: null,
        parsedAccurate: false,
        failureClass: alcoholFailureClass,
        candidateFilteringSubtype:
          alcoholFailureClass === "candidate-filtering-failure"
            ? alcoholCandidateFilteringSubtype(evalCase.alcohol, diagnostics)
            : null,
      },
      diagnostics,
      latencyMs,
    };
  }

  const brandObs = toObserved(result.value.response.fields.brandName);
  const alcoholObs = toObserved(result.value.response.fields.alcoholStatement);
  const brandFailureClass = classifyBrand(evalCase.brand, brandObs, {
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
  });
  const alcoholFailureClass = classifyAlcohol(evalCase.alcohol, alcoholObs, alcoholDiag);

  return {
    caseId: evalCase.caseId,
    fixtureDir: evalCase.fixtureDir,
    strata: evalCase.strata,
    extractionError: null,
    brand: {
      ...fieldReportOf(result.value.response.fields.brandName),
      present: evalCase.brand.present,
      acceptable: evalCase.brand.acceptable,
      knownAmbiguous: evalCase.brand.knownAmbiguous,
      exactMatch: brandExactMatch(brandObs.value, evalCase.brand.acceptable),
      normalizedMatch: brandNormalizedMatch(brandObs.value, evalCase.brand.acceptable),
      top3Recall: brandInTopK(brandObs, evalCase.brand.acceptable, 3),
      failureClass: brandFailureClass,
      candidateFilteringSubtype:
        brandFailureClass === "candidate-filtering-failure"
          ? brandCandidateFilteringSubtype(evalCase.brand, diagnostics)
          : null,
    },
    alcohol: {
      ...fieldReportOf(result.value.response.fields.alcoholStatement),
      present: evalCase.alcohol.present,
      acceptablePercents: evalCase.alcohol.acceptablePercents,
      detected: alcoholDetected(alcoholObs),
      parsedValue: parseObservedPercent(alcoholObs.value),
      parsedAccurate: alcoholParsedAccurate(alcoholObs.value, evalCase.alcohol.acceptablePercents),
      failureClass: alcoholFailureClass,
      candidateFilteringSubtype:
        alcoholFailureClass === "candidate-filtering-failure"
          ? alcoholCandidateFilteringSubtype(evalCase.alcohol, diagnostics)
          : null,
    },
    diagnostics,
    latencyMs,
  };
}

function emptyFieldReport(
  empty: ObservedField,
): Omit<FieldReport, "failureClass" | "candidateFilteringSubtype"> {
  return {
    state: empty.state,
    value: empty.value,
    confidence: empty.confidence,
    ocrEvidenceScore: empty.ocrEvidenceScore,
    alternates: [],
  };
}
