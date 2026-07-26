import {
  CANONICAL_GOVERNMENT_WARNING,
  deriveAnchoredGovernmentWarningTranscript,
  governmentWarningContaminationSignals,
  governmentWarningMatchSignals,
  normalizeGovernmentWarningForComparison,
  type GovernmentWarningObservation,
} from "@/domain/rules/government-warning.rule";
import type {
  AnalyzerCandidateProvenance,
  AnalyzerOcrConfidence,
} from "@/pipeline/analyzer/analyzer.types";

import type { OcrWord, RegionOcrResult } from "./extractor.types";
import { unionGeometry } from "./geometry";

function rawConfidenceOf(word: OcrWord): number | null {
  return Number.isFinite(word.rawConfidence) ? word.rawConfidence : null;
}

function ocrConfidenceOf(words: OcrWord[]): AnalyzerOcrConfidence {
  const rawTokenConfidences = words.map(rawConfidenceOf);
  const observed = rawTokenConfidences.filter((value): value is number => value !== null);
  const rawMean =
    observed.length === 0
      ? null
      : observed.reduce((sum, value) => sum + value, 0) / observed.length;
  return {
    aggregation: "mean",
    rawScale: "0-100",
    rawTokenConfidences,
    rawMean,
    rawMin: observed.length === 0 ? null : Math.min(...observed),
    rawMax: observed.length === 0 ? null : Math.max(...observed),
    missingTokenCount: rawTokenConfidences.length - observed.length,
  };
}

function ocrEvidenceScore(words: OcrWord[]): number {
  const observed = words.map(rawConfidenceOf).filter((value): value is number => value !== null);
  if (observed.length === 0) return 0;
  return (
    observed.reduce((sum, value) => sum + Math.min(1, Math.max(0, value / 100)), 0) /
    observed.length
  );
}

function readingOrder(words: OcrWord[]): OcrWord[] {
  return [...words].sort((a, b) => {
    const ay = (a.bbox.y0 + a.bbox.y1) / 2;
    const by = (b.bbox.y0 + b.bbox.y1) / 2;
    if (Math.abs(ay - by) > 20) return ay - by;
    return a.bbox.x0 - b.bbox.x0;
  });
}

function normalizedWord(value: string): string {
  return normalizeGovernmentWarningForComparison(value).replace(/[^a-z0-9]/g, "");
}

function boundedWarningWords(words: OcrWord[], exactTextMatch: boolean): OcrWord[] {
  const anchorIndex = words.findIndex(
    (word, index) =>
      normalizedWord(word.text) === "government" &&
      normalizedWord(words[index + 1]?.text ?? "") === "warning",
  );
  if (anchorIndex < 0) return words;
  const expectedTokenCount = CANONICAL_GOVERNMENT_WARNING.split(/\s+/).filter(Boolean).length;
  return words.slice(anchorIndex, anchorIndex + expectedTokenCount + (exactTextMatch ? 0 : 6));
}

function provenanceOf(pass: RegionOcrResult): AnalyzerCandidateProvenance {
  return {
    passId: pass.passId,
    passKind: pass.passKind,
    triggerReasons: pass.triggerReasons,
    preprocessing: pass.preprocessing,
    regionName: pass.regionName,
    supportingPassIds: [pass.passId],
    supportingPassKinds: [pass.passKind],
    recoveryPassUsed: pass.passKind !== "full-image-primary",
  };
}

function candidateFromPass(
  panelId: string,
  pass: RegionOcrResult,
): GovernmentWarningObservation | null {
  const words = readingOrder(pass.words).filter((word) => word.originalGeometry !== undefined);
  if (words.length === 0) return null;
  const rawTranscript = words.map((word) => word.text).join(" ");
  const anchored = deriveAnchoredGovernmentWarningTranscript(rawTranscript);
  const match = governmentWarningMatchSignals(rawTranscript);
  if (
    !match.anchorFound &&
    !match.anchorUncertain &&
    match.distinctivePhraseHits.length === 0 &&
    match.canonicalTokenCoverage < 0.35
  ) {
    return null;
  }

  const warningWords = boundedWarningWords(words, match.exactTextMatch);
  const geometry = unionGeometry(warningWords.map((word) => word.originalGeometry!));
  const contamination = governmentWarningContaminationSignals(
    anchored.anchoredTranscript,
    geometry,
  );
  const evidenceState =
    match.exactTextMatch || (match.anchorFound && match.canonicalTokenCoverage >= 0.9)
      ? "observed"
      : "partial";

  return {
    panelId,
    evidenceState,
    rawTranscript,
    normalizedComparisonText: normalizeGovernmentWarningForComparison(rawTranscript),
    anchoredTranscript: anchored.anchoredTranscript,
    normalizedAnchoredComparisonText: anchored.normalizedAnchoredComparisonText,
    ocrEvidenceScore: ocrEvidenceScore(words),
    ocrConfidence: ocrConfidenceOf(words),
    detectedOrientation: pass.transform.rotate,
    geometry,
    extractionProvenance: provenanceOf(pass),
    contamination,
    match,
  };
}

export function selectGovernmentWarningObservation(
  panelId: string,
  passes: readonly RegionOcrResult[],
): GovernmentWarningObservation {
  const candidates = passes
    .map((pass) => candidateFromPass(panelId, pass))
    .filter((candidate): candidate is GovernmentWarningObservation => candidate !== null)
    .sort(
      (left, right) =>
        Number(right.match.exactTextMatch) - Number(left.match.exactTextMatch) ||
        Number(left.contamination?.detected) - Number(right.contamination?.detected) ||
        right.match.canonicalTokenCoverage - left.match.canonicalTokenCoverage ||
        right.ocrEvidenceScore - left.ocrEvidenceScore,
    );

  const best = candidates[0];
  if (!best) {
    return {
      panelId,
      evidenceState: "not_observed",
      rawTranscript: null,
      normalizedComparisonText: null,
      anchoredTranscript: null,
      normalizedAnchoredComparisonText: null,
      ocrEvidenceScore: 0,
      detectedOrientation: null,
      extractionProvenance: null,
      match: {
        anchorFound: false,
        anchorUncertain: false,
        canonicalTokenCoverage: 0,
        exactTextMatch: false,
        distinctivePhraseHits: [],
      },
    };
  }

  const rival = candidates[1];
  if (
    rival &&
    !best.match.exactTextMatch &&
    Math.abs(best.match.canonicalTokenCoverage - rival.match.canonicalTokenCoverage) < 0.08 &&
    Math.abs(best.ocrEvidenceScore - rival.ocrEvidenceScore) < 0.1
  ) {
    return { ...best, evidenceState: "ambiguous" };
  }

  return best;
}
