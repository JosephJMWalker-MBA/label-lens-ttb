import type {
  AnalyzerCandidateProvenance,
  AnalyzerCandidateRanking,
  AnalyzerOcrConfidence,
  AnalyzerObservationState,
  EvidenceGeometry,
} from "@/pipeline/analyzer/analyzer.types";
import type {
  AlcoholAbstentionReason,
  AlcoholAcceptanceReason,
  AlcoholCandidateAssembly,
  AlcoholCandidateDecision,
  AlcoholNormalizationOperation,
  AlcoholRejectionReason,
  BrandAbstentionReason,
  BrandCandidateAssembly,
  BrandCandidateDecision,
  BrandCandidateScore,
  BrandLineReason,
} from "@/pipeline/extractor/field-selection";
import type {
  OcrPassKind,
  OcrPassTriggerReason,
  RotationDegrees,
} from "@/pipeline/extractor/extractor.types";

import type { AggregateMetrics } from "./metrics";
import type { ProductionAnalyzerParityProof } from "./production-parity";
import type { SemanticRegionSurvivalMetrics } from "./semantic-scene/metrics";
import type { SemanticCaseDiagnostic } from "./semantic-scene/types";
import type {
  EvalCandidateFilteringSubtype,
  EvalFailureClass,
  EvalStratum,
} from "./eval-manifest.types";

/**
 * Machine-readable evaluation report shapes. The report is deterministic given
 * fixed OCR output: it contains no timestamps, no absolute paths, no image
 * bytes, and no unbounded OCR logs — only bounded, inspectable diagnostics.
 */

/** One bounded OCR token kept for inspection (processed-space geometry). */
export interface DiagnosticWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  originalGeometry: EvidenceGeometry;
}

/** Bounded diagnostics for one region. */
export interface RegionDiagnostics {
  passId: string;
  regionName: string;
  passKind: OcrPassKind;
  triggerReasons: OcrPassTriggerReason[];
  rotate: RotationDegrees;
  crop: { left: number; top: number; width: number; height: number };
  transformedSize: { width: number; height: number };
  wordCount: number;
  rawWordCount: number;
  discardedWordCount: number;
  timings: {
    preprocessMs: number;
    ocrMs: number;
    inverseMappingMs: number;
    totalMs: number;
  };
  /** Capped sample of tokens (never the full unbounded OCR log). */
  sampleWords: DiagnosticWord[];
}

export interface CasePerformanceDiagnostics {
  passCount: number;
  extraPassCount: number;
  primaryPassDurationMs: number;
  transformedPassDurationMs: number;
  regionPassDurationMs: number;
  totalOcrDurationMs: number;
  totalRecoveryDurationMs: number;
  totalInverseMappingDurationMs: number;
  extraPassesWithNoUsableEvidence: number;
}

export type EvalFieldKey = "brand" | "alcohol";

export interface RecoveryPassContribution {
  passId: string;
  passOrder: number;
  passKind: OcrPassKind;
  triggerReasons: OcrPassTriggerReason[];
  executionTimeMs: number;
  cumulativeCostMs: number;
  newOcrTokens: boolean;
  newOcrTokenCount: number;
  newFieldLikeEvidence: boolean;
  newFieldLikeEvidenceFields: EvalFieldKey[];
  acceptedCandidate: boolean;
  acceptedCandidateFields: EvalFieldKey[];
  changedSelectedField: boolean;
  changedSelectedFields: EvalFieldKey[];
  correctSelectedField: boolean;
  correctSelectedFields: EvalFieldKey[];
  noMeasuredValue: boolean;
}

export interface CaseDiagnostics {
  regions: RegionDiagnostics[];
  performance: CasePerformanceDiagnostics;
  recoveryPasses: RecoveryPassContribution[];
  primarySelections: {
    brandState: AnalyzerObservationState;
    brandValue: string | null;
    alcoholState: AnalyzerObservationState;
    alcoholValue: string | null;
  };
  finalSelectionPasses: {
    brandSourcePassId: string | null;
    brandSupportingPassIds: string[];
    alcoholSourcePassId: string | null;
    alcoholSupportingPassIds: string[];
  };
  /** Reconstructed brand-region line texts (capped). */
  brandLineTexts: string[];
  brandCandidateDecisions: {
    rawText: string;
    cleanedValue: string | null;
    confidence: number;
    ocrEvidenceScore: number;
    ocrConfidence: AnalyzerOcrConfidence;
    prominence: number;
    passId: string;
    passKind: OcrPassKind;
    supportPassIds: string[];
    candidateProvenance: AnalyzerCandidateProvenance;
    assembly: BrandCandidateAssembly;
    lineIndexes: number[];
    kept: boolean;
    filterReason: BrandLineReason;
    decision?: BrandCandidateDecision;
    score?: BrandCandidateScore;
    ranking?: AnalyzerCandidateRanking;
  }[];
  brandLineDecisions: {
    rawText: string;
    cleanedValue: string | null;
    confidence: number;
    prominence: number;
    passId: string;
    passKind: OcrPassKind;
    kept: boolean;
    reason: BrandLineReason;
  }[];
  brandAbstentionReason?: BrandAbstentionReason;
  brandOcrContainsAcceptable: boolean;
  brandLineContainsAcceptable: boolean;
  brandCandidateContainsAcceptable: boolean;
  brandPrimaryOcrContainsAcceptable: boolean;
  brandRecoveryOcrContainsAcceptable: boolean;
  brandPrimaryLineContainsAcceptable: boolean;
  brandRecoveryLineContainsAcceptable: boolean;
  brandPrimaryCandidateContainsAcceptable: boolean;
  brandRecoveryCandidateContainsAcceptable: boolean;
  alcoholCandidateDecisions: {
    rawText: string;
    normalizedValue: string | null;
    normalizedParsingText: string | null;
    confidence: number;
    ocrEvidenceScore: number;
    ocrConfidence: AnalyzerOcrConfidence;
    prominence: number;
    passId: string;
    passKind: OcrPassKind;
    supportPassIds: string[];
    candidateProvenance: AnalyzerCandidateProvenance;
    assembly: AlcoholCandidateAssembly;
    lineIndexes: number[];
    sourceTokens: string[];
    sourceBoxes: { x0: number; y0: number; x1: number; y1: number }[];
    sourceOriginalBoxes: EvidenceGeometry[];
    kept: boolean;
    acceptanceReason?: AlcoholAcceptanceReason;
    positiveMarkers: string[];
    normalizationOperations: AlcoholNormalizationOperation[];
    parsedPercent: number | null;
    rejectionReason?: AlcoholRejectionReason;
    decision?: AlcoholCandidateDecision;
    ranking?: AnalyzerCandidateRanking;
  }[];
  alcoholAbstentionReason?: AlcoholAbstentionReason;
  alcoholNumberInOcr: boolean;
  alcoholPercentInOcr: boolean;
  alcoholAlcoholMarkerInOcr: boolean;
  alcoholVolumeMarkerInOcr: boolean;
  alcoholSameLineEvidenceCluster: boolean;
  alcoholAdjacentLineEvidenceCluster: boolean;
  alcoholPrimaryNumberInOcr: boolean;
  alcoholRecoveryNumberInOcr: boolean;
  alcoholPrimarySameLineEvidenceCluster: boolean;
  alcoholRecoverySameLineEvidenceCluster: boolean;
  alcoholPrimaryAdjacentLineEvidenceCluster: boolean;
  alcoholRecoveryAdjacentLineEvidenceCluster: boolean;
  alcoholPrimaryCandidateAccepted: boolean;
  alcoholRecoveryCandidateAccepted: boolean;
  alcoholFilterRejectedCandidate: boolean;
  alcoholParserRejectedCandidate: boolean;
  alcoholCandidateAccepted: boolean;
  calibrationCandidates: CandidateCalibrationRecord[];
}

export interface CandidateCalibrationRecord {
  caseId: string;
  field: EvalFieldKey;
  candidateId: string;
  candidateStatus: "selected" | "alternate" | "ambiguous-rival" | "rejected";
  selected: boolean;
  inference: {
    rawText: string;
    normalizedValue: string | null;
    ocrEvidenceScore: number;
    ocrConfidence: AnalyzerOcrConfidence;
    candidateProvenance: AnalyzerCandidateProvenance;
    ranking?: AnalyzerCandidateRanking;
    prominence: number;
    passId: string;
    passKind: OcrPassKind;
    supportPassIds: string[];
    kept: boolean;
  };
  evaluation: {
    truthPresent: boolean;
    acceptable: boolean;
    exactMatch?: boolean;
    normalizedMatch?: boolean;
    parsedAccurate?: boolean;
  };
}

/** The extractor's projected view of one field, plus the harness verdicts. */
export interface FieldReport {
  state: AnalyzerObservationState;
  value: string | null;
  confidence: number;
  ocrEvidenceScore: number;
  ocrConfidence?: AnalyzerOcrConfidence;
  candidateProvenance?: AnalyzerCandidateProvenance;
  ranking?: AnalyzerCandidateRanking;
  alternates: {
    value: string;
    confidence: number;
    ocrEvidenceScore: number;
    ocrConfidence: AnalyzerOcrConfidence;
    candidateProvenance: AnalyzerCandidateProvenance;
    ranking: AnalyzerCandidateRanking;
  }[];
  failureClass: EvalFailureClass;
  candidateFilteringSubtype: EvalCandidateFilteringSubtype | null;
}

export interface CaseReport {
  caseId: string;
  fixtureDir: string;
  strata: EvalStratum[];
  /** Present only when extraction returned a typed error. */
  extractionError: string | null;
  brand: FieldReport & {
    present: boolean;
    acceptable: string[];
    knownAmbiguous: boolean;
    exactMatch: boolean;
    normalizedMatch: boolean;
    top3Recall: boolean;
  };
  alcohol: FieldReport & {
    present: boolean;
    acceptablePercents: number[];
    detected: boolean;
    parsedValue: number | null;
    parsedAccurate: boolean;
  };
  diagnostics: CaseDiagnostics;
  /** Evaluation-only semantic scene graph and target survival attribution. */
  semanticScene?: SemanticCaseDiagnostic;
  latencyMs: number;
}

export interface EvalAlcoholSliceMetrics {
  key: string;
  label: string;
  presentCaseCount: number;
  detectedCount: number;
  parsedAccurateCount: number;
  detectionRecall: number;
  parsedAccuracy: number;
}

export interface EvalOrientationSliceMetrics {
  key: string;
  label: string;
  determinateBrandCount: number;
  brandExactCount: number;
  brandNormalizedCount: number;
  brandTop3Count: number;
  brandTop5Count: number;
  brandExactMatchRate: number;
  brandNormalizedAcceptableRate: number;
  brandTop3Recall: number;
  brandTop5Recall: number;
  presentAlcoholCount: number;
  alcoholDetectedCount: number;
  alcoholParsedAccurateCount: number;
  alcoholDetectionRecall: number;
  alcoholParsedAccuracy: number;
}

export interface EvalPerformanceBreakdown {
  medianPassCount: number;
  p95PassCount: number;
  casesRequiringExtraPasses: number;
  extraPassCaseRate: number;
  medianRecoveryDurationMs: number;
  p95RecoveryDurationMs: number;
  medianTotalOcrDurationMs: number;
  p95TotalOcrDurationMs: number;
  extraPassesWithNoUsableEvidence: number;
  costPerRecoveredCorrectCaseMs: number;
}

export interface EvalFailureDistributionBucket {
  key: string;
  label: string;
  count: number;
}

export interface EvalCandidateFilteringSubtypeBucket {
  key: EvalCandidateFilteringSubtype;
  label: string;
  field: EvalFieldKey;
  count: number;
}

export interface EvalRecoveryPassContributionBucket {
  key: OcrPassKind;
  label: string;
  passCount: number;
  caseCount: number;
  newOcrTokensCount: number;
  newFieldLikeEvidenceCount: number;
  acceptedCandidateCount: number;
  changedSelectedFieldCount: number;
  correctSelectedFieldCount: number;
  noMeasuredValueCount: number;
  totalExecutionTimeMs: number;
  maxCumulativeCostMs: number;
}

export interface EvalCalibrationCoverageField {
  recordCount: number;
  selectedCount: number;
  nonSelectedCount: number;
  rejectedCount: number;
  rankedCount: number;
  rawOcrConfidencePresentCount: number;
  rawOcrConfidenceMissingCount: number;
}

export interface EvalCalibrationCoverage {
  totalRecordCount: number;
  byField: {
    brand: EvalCalibrationCoverageField;
    alcohol: EvalCalibrationCoverageField;
  };
}

export interface EvalReport {
  schemaVersion: "extraction-baseline-report.v5";
  manifestSchemaVersion: string;
  extractorAdapter: { id: string; version: string };
  aggregate: AggregateMetrics;
  breakdowns: {
    alcoholSlices: EvalAlcoholSliceMetrics[];
    orientationSlices: EvalOrientationSliceMetrics[];
    failureDistribution: EvalFailureDistributionBucket[];
    candidateFilteringSubtypes: EvalCandidateFilteringSubtypeBucket[];
    recoveryPassContributions: EvalRecoveryPassContributionBucket[];
    calibrationCoverage: EvalCalibrationCoverage;
    performance: EvalPerformanceBreakdown;
  };
  semanticRegionSurvival: {
    metrics: SemanticRegionSurvivalMetrics;
    productionParity: ProductionAnalyzerParityProof;
  };
  cases: CaseReport[];
}
