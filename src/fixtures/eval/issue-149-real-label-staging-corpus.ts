import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { format, resolveConfig } from "prettier";

const OUTPUT_DIR = path.join(process.cwd(), "artifacts/issue-149-real-label-staging-corpus");

export const BRAND_PRIMARY_CLASSIFICATIONS = [
  "BRAND_SOURCE_IMAGE_UNAVAILABLE",
  "BRAND_REGION_MISSING",
  "BRAND_REGION_WRONG",
  "BRAND_OCR_EMPTY",
  "BRAND_OCR_RECOGNITION_MISS",
  "BRAND_TOKEN_GROUPING_MISS",
  "BRAND_LINE_GROUPING_MISS",
  "BRAND_CANDIDATE_GENERATION_MISS",
  "BRAND_FILTERING_MISS",
  "BRAND_RANKING_MISS",
  "BRAND_CORRECT_READ_CONSERVATIVE_GATE",
  "BRAND_WRONG_RELIABLE_READ",
  "BRAND_CORRECT_RELIABLE_READ",
  "BRAND_INSUFFICIENT_SOURCE_IMAGE",
  "BRAND_NOT_EVALUATED",
] as const;
export type BrandPrimaryClassification = (typeof BRAND_PRIMARY_CLASSIFICATIONS)[number];

export const WARNING_PRIMARY_CLASSIFICATIONS = [
  "WARNING_SOURCE_IMAGE_UNAVAILABLE",
  "WARNING_REGION_NOT_FOUND",
  "WARNING_REGION_WRONG",
  "WARNING_REGION_CONTAMINATED",
  "WARNING_ORIENTATION_MISS",
  "WARNING_ANCHOR_NOT_FOUND",
  "WARNING_ANCHOR_WRONG",
  "WARNING_OCR_RECOGNITION_MISS",
  "WARNING_EXACT_TEXT_MISMATCH",
  "WARNING_FALSE_PASS",
  "WARNING_CORRECT_PASS",
  "WARNING_NOT_PRESENT",
  "WARNING_NOT_EVALUATED",
] as const;
export type WarningPrimaryClassification = (typeof WARNING_PRIMARY_CLASSIFICATIONS)[number];

export const ALCOHOL_PRIMARY_CLASSIFICATIONS = [
  "ALCOHOL_SOURCE_IMAGE_UNAVAILABLE",
  "ALCOHOL_REGION_NOT_SEARCHED",
  "ALCOHOL_REGION_NOT_FOUND",
  "ALCOHOL_OCR_EMPTY",
  "ALCOHOL_OCR_RECOGNITION_MISS",
  "ALCOHOL_PARSE_MISS",
  "ALCOHOL_SELECTOR_MISS",
  "ALCOHOL_WRONG_RELIABLE_READ",
  "ALCOHOL_CORRECT_READ",
  "ALCOHOL_NOT_PRESENT",
  "ALCOHOL_NOT_EVALUATED",
] as const;
export type AlcoholPrimaryClassification = (typeof ALCOHOL_PRIMARY_CLASSIFICATIONS)[number];

export const NEXT_EXPERIMENT_CANDIDATES = [
  "BRAND_BOUNDED_PREPROCESSING",
  "BRAND_SCALE_EXPERIMENT",
  "BRAND_ORIENTATION_EXPERIMENT",
  "BRAND_AUTHORITY_CALIBRATION",
  "WARNING_REGION_LOCALIZATION",
  "WARNING_REGION_DECONTAMINATION",
  "WARNING_ANCHOR_RECOVERY",
  "WARNING_BOUNDED_PREPROCESSING",
  "ALCOHOL_RECOVERY_TRIGGER",
  "ALCOHOL_RESELECTION",
  "CORPUS_EXPANSION_REQUIRED",
] as const;
export type NextExperimentCandidate = (typeof NEXT_EXPERIMENT_CANDIDATES)[number];

export type SourceAvailability =
  "GOVERNED_FIXTURE_AVAILABLE" | "UNAVAILABLE_BROWSER_LOCAL" | "METADATA_ONLY";
export type ReliabilityState = "RELIABLE" | "UNRELIABLE" | "NOT_EVALUATED";
export type AuthorityState = "OBSERVED" | "AMBIGUOUS" | "LOW_CONFIDENCE" | "NOT_OBSERVED" | null;
export type WarningStatus = "PASS" | "FAIL" | "NOT_EVALUATED";
export type AlcoholObservation = "OBSERVED" | "NOT_OBSERVED" | "NOT_EVALUATED";

interface NullableField<T> {
  value: T | null;
  missingReason: string | null;
}

export interface RealLabelStagingCase {
  caseId: string;
  displayName: string;
  sourceType: "manual-pr-195-staging";
  sourceAvailability: SourceAvailability;
  governedFixturePath: NullableField<string>;
  stagingEnvironment: string;
  prNumber: 195;
  testDate: "2026-07-27";
  expectedSellerBrand: string;
  sellerSelectedRegion: NullableField<{
    panelId: string;
    geometry: null;
    notes: string;
  }>;
  rawBoundedOcrWords: NullableField<string[]>;
  boundedTranscript: NullableField<string>;
  independentTranscript: NullableField<string>;
  selectedCandidate: NullableField<string>;
  candidateList: NullableField<string[]>;
  confidence: NullableField<number>;
  reliability: ReliabilityState;
  authorityState: AuthorityState;
  comparisonOutcome: NullableField<string>;
  brandPrimaryClassification: BrandPrimaryClassification;
  brandSecondaryNotes: string[];
  warningStatus: WarningStatus;
  warningRegionStatus: NullableField<string>;
  warningOrientation: NullableField<number>;
  warningAnchorStatus: NullableField<string>;
  warningRawTranscript: NullableField<string>;
  warningAnchoredTranscript: NullableField<string>;
  warningOcrConfidence: NullableField<number>;
  warningPrimaryClassification: WarningPrimaryClassification;
  alcoholObservation: AlcoholObservation;
  alcoholPrimaryClassification: AlcoholPrimaryClassification;
  humanReviewRequired: boolean;
  provenance: {
    source: string;
    prNumber: 195;
    sourceImagesCommitted: false;
    productionBehaviorChanged: false;
  };
  missingDataReasons: string[];
}

export interface CorpusMetrics {
  brand: {
    totalCases: number;
    evaluableCases: number;
    sourceUnavailable: number;
    regionMissingOrWrong: number;
    ocrRecognitionMiss: number;
    groupingMiss: number;
    generationFilteringRankingMiss: number;
    correctReadConservativeGate: number;
    wrongReliableRead: number;
    correctReliableRead: number;
    humanReviewRequired: number;
    classificationCounts: Record<BrandPrimaryClassification, number>;
  };
  warning: {
    totalCases: number;
    evaluableCases: number;
    regionNotFound: number;
    regionWrong: number;
    regionContaminated: number;
    orientationMiss: number;
    anchorMiss: number;
    ocrRecognitionMiss: number;
    exactMismatch: number;
    falsePass: number;
    correctPass: number;
    needsReview: number;
    fail: number;
    classificationCounts: Record<WarningPrimaryClassification, number>;
  };
  alcohol: {
    totalCases: number;
    evaluableCases: number;
    regionNotSearched: number;
    regionNotFound: number;
    ocrMiss: number;
    parseMiss: number;
    selectorMiss: number;
    correctRead: number;
    wrongReliableRead: number;
    notEvaluated: number;
    classificationCounts: Record<AlcoholPrimaryClassification, number>;
  };
  summary: {
    mostFrequentBrandFailureClass: BrandPrimaryClassification;
    mostFrequentWarningFailureClass: WarningPrimaryClassification;
    mostFrequentAlcoholFailureClass: AlcoholPrimaryClassification;
    missingGovernedSourceImages: number;
    failuresAttributableToSelectionRanking: number;
    failuresAttributableToRecognitionLocalization: number;
    failuresAttributableOnlyToConservativeAuthority: number;
    falseReliableBrandReads: number;
    falseGovernmentWarningPasses: number;
    falseReliableAlcoholReads: number;
  };
}

export interface CorpusReport {
  schemaVersion: "issue-149-real-label-staging-corpus.v1";
  config: {
    productionBehaviorChanged: false;
    sourceImagesCommitted: false;
    expectedSellerTextUsedAsProductionInput: false;
    source: "manual-pr-195-staging-results";
  };
  cases: RealLabelStagingCase[];
  metrics: CorpusMetrics;
  analysis: {
    brandGroupingRankingDominant: boolean;
    rawOcrRecognitionDominantBrandFailure: boolean;
    warningDominantFailureMode: WarningPrimaryClassification;
    alcoholPerformanceEvaluable: boolean;
    recommendedNextExperiment: NextExperimentCandidate;
    recommendationReason: string;
    deferredExperiments: NextExperimentCandidate[];
    answers: Record<string, string>;
  };
}

const unavailableBrowserLocal =
  "Manual staging source image was supplied through browser/local temporary state and is not a governed redistributable repository fixture.";

const notRecorded = (field: string) => `Manual PR #195 staging notes did not record ${field}.`;

function present<T>(value: T): NullableField<T> {
  return { value, missingReason: null };
}

function missing<T>(reason: string): NullableField<T> {
  return { value: null, missingReason: reason };
}

function caseBase(args: {
  caseId: string;
  displayName: string;
  sourceAvailability?: SourceAvailability;
  governedFixturePath?: string;
  expectedSellerBrand: string;
  missingDataReasons?: string[];
}): Pick<
  RealLabelStagingCase,
  | "caseId"
  | "displayName"
  | "sourceType"
  | "sourceAvailability"
  | "governedFixturePath"
  | "stagingEnvironment"
  | "prNumber"
  | "testDate"
  | "expectedSellerBrand"
  | "sellerSelectedRegion"
  | "provenance"
  | "missingDataReasons"
> {
  const sourceAvailability = args.sourceAvailability ?? "UNAVAILABLE_BROWSER_LOCAL";
  return {
    caseId: args.caseId,
    displayName: args.displayName,
    sourceType: "manual-pr-195-staging",
    sourceAvailability,
    governedFixturePath: args.governedFixturePath
      ? present(args.governedFixturePath)
      : missing(unavailableBrowserLocal),
    stagingEnvironment: "manual PR #195 package-analysis staging",
    prNumber: 195,
    testDate: "2026-07-27",
    expectedSellerBrand: args.expectedSellerBrand,
    sellerSelectedRegion: missing("Seller-selected region geometry was not exported from staging."),
    provenance: {
      source: "PR #195 manual staging conversation and attached local label images",
      prNumber: 195,
      sourceImagesCommitted: false,
      productionBehaviorChanged: false,
    },
    missingDataReasons: args.missingDataReasons ?? [],
  };
}

export const REAL_LABEL_STAGING_CASES: RealLabelStagingCase[] = [
  {
    ...caseBase({
      caseId: "m-cellars",
      displayName: "M Cellars",
      sourceAvailability: "GOVERNED_FIXTURE_AVAILABLE",
      governedFixturePath: "tests/fixtures/precheck/m-cellars-24205001000905/label-ocr-source.jpeg",
      expectedSellerBrand: "M CELLARS",
      missingDataReasons: [notRecorded("the bounded OCR word list")],
    }),
    rawBoundedOcrWords: missing(notRecorded("raw bounded OCR words")),
    boundedTranscript: missing("Manual result recorded no coherent full Brand candidate."),
    independentTranscript: missing(notRecorded("independent Brand transcript")),
    selectedCandidate: missing("Manual result recorded no coherent full Brand candidate."),
    candidateList: missing(notRecorded("candidate list")),
    confidence: missing(notRecorded("Brand confidence")),
    reliability: "UNRELIABLE",
    authorityState: "AMBIGUOUS",
    comparisonOutcome: present("SELLER_REGION_INSUFFICIENT"),
    brandPrimaryClassification: "BRAND_OCR_RECOGNITION_MISS",
    brandSecondaryNotes: [
      "Existing synthetic issue: designator-only CELLARS previously outranked fuller M CELLARS.",
      "Manual staging result did not produce a coherent full Brand candidate.",
    ],
    warningStatus: "FAIL",
    warningRegionStatus: missing(notRecorded("warning region status")),
    warningOrientation: missing(notRecorded("warning orientation")),
    warningAnchorStatus: missing(
      "Manual result recorded warning failure without a recovered anchor.",
    ),
    warningRawTranscript: missing(notRecorded("warning raw transcript")),
    warningAnchoredTranscript: missing("No anchored warning transcript was recorded."),
    warningOcrConfidence: missing(notRecorded("warning OCR confidence")),
    warningPrimaryClassification: "WARNING_ANCHOR_NOT_FOUND",
    alcoholObservation: "NOT_EVALUATED",
    alcoholPrimaryClassification: "ALCOHOL_NOT_EVALUATED",
    humanReviewRequired: true,
  },
  {
    ...caseBase({
      caseId: "garden-city-beach",
      displayName: "Garden City Beach",
      expectedSellerBrand: "GARDEN CITY BEACH",
      missingDataReasons: [unavailableBrowserLocal],
    }),
    rawBoundedOcrWords: present(["CARDEN", "CITY", "LBEACK"]),
    boundedTranscript: present("CARDEN CITY LBEACK"),
    independentTranscript: missing(notRecorded("independent Brand transcript")),
    selectedCandidate: missing(notRecorded("selected Brand candidate")),
    candidateList: missing(notRecorded("candidate list")),
    confidence: present(0.55),
    reliability: "UNRELIABLE",
    authorityState: "AMBIGUOUS",
    comparisonOutcome: present("SELLER_REGION_INSUFFICIENT"),
    brandPrimaryClassification: "BRAND_OCR_RECOGNITION_MISS",
    brandSecondaryNotes: ["Bounded OCR visibly differs from expected Brand before grouping."],
    warningStatus: "FAIL",
    warningRegionStatus: missing(notRecorded("warning region status")),
    warningOrientation: missing(notRecorded("warning orientation")),
    warningAnchorStatus: missing(
      "Manual result recorded warning failure without a recovered anchor.",
    ),
    warningRawTranscript: missing(notRecorded("warning raw transcript")),
    warningAnchoredTranscript: missing("No anchored warning transcript was recorded."),
    warningOcrConfidence: missing(notRecorded("warning OCR confidence")),
    warningPrimaryClassification: "WARNING_ANCHOR_NOT_FOUND",
    alcoholObservation: "NOT_EVALUATED",
    alcoholPrimaryClassification: "ALCOHOL_NOT_EVALUATED",
    humanReviewRequired: true,
  },
  {
    ...caseBase({
      caseId: "minneapolis",
      displayName: "Minneapolis",
      expectedSellerBrand: "MINNEAPOLIS",
      missingDataReasons: [unavailableBrowserLocal],
    }),
    rawBoundedOcrWords: present(["MINNEADPOLIS"]),
    boundedTranscript: present("MINNEADPOLIS"),
    independentTranscript: missing(notRecorded("independent Brand transcript")),
    selectedCandidate: present("MINNEADPOLIS"),
    candidateList: missing(notRecorded("candidate list")),
    confidence: present(0),
    reliability: "UNRELIABLE",
    authorityState: "AMBIGUOUS",
    comparisonOutcome: present("SELLER_REGION_INSUFFICIENT"),
    brandPrimaryClassification: "BRAND_OCR_RECOGNITION_MISS",
    brandSecondaryNotes: [
      "OCR inserted an extra D before grouping/ranking could recover the Brand.",
    ],
    warningStatus: "FAIL",
    warningRegionStatus: present("FOUND"),
    warningOrientation: missing(notRecorded("warning orientation")),
    warningAnchorStatus: present("ANCHOR_FOUND_WITH_OCR_ERROR"),
    warningRawTranscript: present("Government Warning example included GENERAL -> GEMERAL"),
    warningAnchoredTranscript: present("GENERAL -> GEMERAL"),
    warningOcrConfidence: missing(notRecorded("warning OCR confidence")),
    warningPrimaryClassification: "WARNING_OCR_RECOGNITION_MISS",
    alcoholObservation: "NOT_EVALUATED",
    alcoholPrimaryClassification: "ALCOHOL_NOT_EVALUATED",
    humanReviewRequired: true,
  },
  {
    ...caseBase({
      caseId: "luigi-giovanni",
      displayName: "Luigi & Giovanni",
      expectedSellerBrand: "LUIGI & GIOVANNI",
      missingDataReasons: [unavailableBrowserLocal],
    }),
    rawBoundedOcrWords: present(["fli?", "GIANNI"]),
    boundedTranscript: present("fli? GIANNI"),
    independentTranscript: present("VANNI"),
    selectedCandidate: present("GIANNI"),
    candidateList: missing(notRecorded("candidate list")),
    confidence: present(0.05),
    reliability: "UNRELIABLE",
    authorityState: "AMBIGUOUS",
    comparisonOutcome: present("SELLER_REGION_INSUFFICIENT"),
    brandPrimaryClassification: "BRAND_OCR_RECOGNITION_MISS",
    brandSecondaryNotes: [
      "Selected-region and independent reads both lost LUIGI and disagreed on GIOVANNI.",
    ],
    warningStatus: "FAIL",
    warningRegionStatus: present("CONTAMINATED_INTERLEAVED"),
    warningOrientation: missing(notRecorded("warning orientation")),
    warningAnchorStatus: present("ANCHOR_CONTAMINATED"),
    warningRawTranscript: present("Government Warning region was contaminated/interleaved."),
    warningAnchoredTranscript: missing("No clean anchored warning transcript was recorded."),
    warningOcrConfidence: missing(notRecorded("warning OCR confidence")),
    warningPrimaryClassification: "WARNING_REGION_CONTAMINATED",
    alcoholObservation: "NOT_OBSERVED",
    alcoholPrimaryClassification: "ALCOHOL_NOT_EVALUATED",
    humanReviewRequired: true,
  },
  {
    ...caseBase({
      caseId: "the-golden-girls",
      displayName: "The Golden Girls",
      expectedSellerBrand: "THE GOLDEN GIRLS",
      missingDataReasons: [unavailableBrowserLocal],
    }),
    rawBoundedOcrWords: present(["mR,", "HEL”", "XT", "0]", "AUTEN", "TE"]),
    boundedTranscript: present("mR, HEL” XT 0] AUTEN TE"),
    independentTranscript: present("N Gy A001"),
    selectedCandidate: present("AUTEN TE"),
    candidateList: missing(notRecorded("candidate list")),
    confidence: present(0),
    reliability: "UNRELIABLE",
    authorityState: "AMBIGUOUS",
    comparisonOutcome: present("SELLER_REGION_INSUFFICIENT"),
    brandPrimaryClassification: "BRAND_OCR_RECOGNITION_MISS",
    brandSecondaryNotes: [
      "Selected-region and independent reads were both unrelated to the expected Brand.",
    ],
    warningStatus: "FAIL",
    warningRegionStatus: present("CONTAMINATED_INTERLEAVED"),
    warningOrientation: missing(notRecorded("warning orientation")),
    warningAnchorStatus: present("ANCHOR_CONTAMINATED"),
    warningRawTranscript: present(
      "Government Warning region contained unrelated interleaved text.",
    ),
    warningAnchoredTranscript: missing("No clean anchored warning transcript was recorded."),
    warningOcrConfidence: missing(notRecorded("warning OCR confidence")),
    warningPrimaryClassification: "WARNING_REGION_CONTAMINATED",
    alcoholObservation: "NOT_OBSERVED",
    alcoholPrimaryClassification: "ALCOHOL_NOT_EVALUATED",
    humanReviewRequired: true,
  },
  {
    ...caseBase({
      caseId: "hubert-lamy",
      displayName: "Hubert Lamy",
      expectedSellerBrand: "HUBERT LAMY",
      missingDataReasons: [unavailableBrowserLocal],
    }),
    rawBoundedOcrWords: present(["Sacnt-Aubin"]),
    boundedTranscript: present("Sacnt-Aubin"),
    independentTranscript: present("CHASSAGNE-MONTRACHET La Goujonne"),
    selectedCandidate: present("Sacnt-Aubin"),
    candidateList: missing(notRecorded("candidate list")),
    confidence: present(0.28),
    reliability: "UNRELIABLE",
    authorityState: "AMBIGUOUS",
    comparisonOutcome: present("SELLER_REGION_INSUFFICIENT"),
    brandPrimaryClassification: "BRAND_REGION_WRONG",
    brandSecondaryNotes: [
      "Manual staging indicated Brand localization and/or OCR recognition failure.",
      "Bounded OCR targeted Saint-Aubin rather than Hubert Lamy.",
    ],
    warningStatus: "FAIL",
    warningRegionStatus: present("NOT_FOUND"),
    warningOrientation: missing("No warning source region was detected."),
    warningAnchorStatus: present("ANCHOR_NOT_FOUND"),
    warningRawTranscript: missing("No warning source region or transcript was detected."),
    warningAnchoredTranscript: missing("No warning source region or transcript was detected."),
    warningOcrConfidence: missing(notRecorded("warning OCR confidence")),
    warningPrimaryClassification: "WARNING_REGION_NOT_FOUND",
    alcoholObservation: "NOT_OBSERVED",
    alcoholPrimaryClassification: "ALCOHOL_NOT_EVALUATED",
    humanReviewRequired: true,
  },
  {
    ...caseBase({
      caseId: "aphrodite",
      displayName: "Aphrodite",
      expectedSellerBrand: "APHRODITE",
      missingDataReasons: [unavailableBrowserLocal],
    }),
    rawBoundedOcrWords: present(["APHRODITE"]),
    boundedTranscript: present("APHRODITE"),
    independentTranscript: present("APHRODITE"),
    selectedCandidate: present("APHRODITE"),
    candidateList: present(["APHRODITE"]),
    confidence: present(0.91),
    reliability: "UNRELIABLE",
    authorityState: "AMBIGUOUS",
    comparisonOutcome: present("SELLER_REGION_INSUFFICIENT"),
    brandPrimaryClassification: "BRAND_CORRECT_READ_CONSERVATIVE_GATE",
    brandSecondaryNotes: [
      "Correct OCR read stayed conservative under authority/reliability gating.",
    ],
    warningStatus: "FAIL",
    warningRegionStatus: present("NOT_FOUND"),
    warningOrientation: missing("No warning source region was detected."),
    warningAnchorStatus: present("ANCHOR_NOT_FOUND"),
    warningRawTranscript: missing("No warning source region or transcript was detected."),
    warningAnchoredTranscript: missing("No warning source region or transcript was detected."),
    warningOcrConfidence: missing(notRecorded("warning OCR confidence")),
    warningPrimaryClassification: "WARNING_REGION_NOT_FOUND",
    alcoholObservation: "NOT_OBSERVED",
    alcoholPrimaryClassification: "ALCOHOL_NOT_EVALUATED",
    humanReviewRequired: true,
  },
  {
    ...caseBase({
      caseId: "christmas-hayride",
      displayName: "Christmas Hayride",
      expectedSellerBrand: "CHRISTMAS HAYRIDE",
      missingDataReasons: [unavailableBrowserLocal],
    }),
    rawBoundedOcrWords: present(["Chistuas", "Gari"]),
    boundedTranscript: present("Chistuas Gari"),
    independentTranscript: present("Bam il"),
    selectedCandidate: present("Chistuas Gari"),
    candidateList: missing(notRecorded("candidate list")),
    confidence: present(0.32),
    reliability: "UNRELIABLE",
    authorityState: "AMBIGUOUS",
    comparisonOutcome: present("SELLER_REGION_INSUFFICIENT"),
    brandPrimaryClassification: "BRAND_OCR_RECOGNITION_MISS",
    brandSecondaryNotes: ["Bounded OCR did not preserve CHRISTMAS HAYRIDE before ranking."],
    warningStatus: "PASS",
    warningRegionStatus: present("FOUND"),
    warningOrientation: missing(notRecorded("warning orientation")),
    warningAnchorStatus: present("EXACT_TOKEN_MATCH"),
    warningRawTranscript: present("Exact token match to anchored Government Warning text."),
    warningAnchoredTranscript: present("Exact token match to anchored Government Warning text."),
    warningOcrConfidence: present(0.89),
    warningPrimaryClassification: "WARNING_CORRECT_PASS",
    alcoholObservation: "NOT_OBSERVED",
    alcoholPrimaryClassification: "ALCOHOL_NOT_EVALUATED",
    humanReviewRequired: true,
  },
];

function emptyCounts<T extends readonly string[]>(values: T): Record<T[number], number> {
  return Object.fromEntries(values.map((value) => [value, 0])) as Record<T[number], number>;
}

function increment<T extends string>(counts: Record<T, number>, key: T): void {
  counts[key] += 1;
}

function rate(count: number, total: number): string {
  if (total === 0) return "n/a";
  return `${count}/${total} (${((count / total) * 100).toFixed(1)}%)`;
}

function mostFrequent<T extends string>(counts: Record<T, number>): T {
  return Object.entries(counts).sort((a, b) => {
    const countDelta = (b[1] as number) - (a[1] as number);
    if (countDelta !== 0) return countDelta;
    return a[0].localeCompare(b[0]);
  })[0]![0] as T;
}

export function metricsFor(cases: RealLabelStagingCase[]): CorpusMetrics {
  const brandCounts = emptyCounts(BRAND_PRIMARY_CLASSIFICATIONS);
  const warningCounts = emptyCounts(WARNING_PRIMARY_CLASSIFICATIONS);
  const alcoholCounts = emptyCounts(ALCOHOL_PRIMARY_CLASSIFICATIONS);
  for (const item of cases) {
    increment(brandCounts, item.brandPrimaryClassification);
    increment(warningCounts, item.warningPrimaryClassification);
    increment(alcoholCounts, item.alcoholPrimaryClassification);
  }
  const selectionRanking =
    brandCounts.BRAND_RANKING_MISS +
    brandCounts.BRAND_FILTERING_MISS +
    brandCounts.BRAND_CANDIDATE_GENERATION_MISS;
  const recognitionLocalization =
    brandCounts.BRAND_OCR_RECOGNITION_MISS +
    brandCounts.BRAND_REGION_MISSING +
    brandCounts.BRAND_REGION_WRONG +
    brandCounts.BRAND_OCR_EMPTY;
  return {
    brand: {
      totalCases: cases.length,
      evaluableCases: cases.filter(
        (item) => item.brandPrimaryClassification !== "BRAND_NOT_EVALUATED",
      ).length,
      sourceUnavailable: cases.filter(
        (item) => item.sourceAvailability !== "GOVERNED_FIXTURE_AVAILABLE",
      ).length,
      regionMissingOrWrong: brandCounts.BRAND_REGION_MISSING + brandCounts.BRAND_REGION_WRONG,
      ocrRecognitionMiss: brandCounts.BRAND_OCR_RECOGNITION_MISS,
      groupingMiss: brandCounts.BRAND_TOKEN_GROUPING_MISS + brandCounts.BRAND_LINE_GROUPING_MISS,
      generationFilteringRankingMiss: selectionRanking,
      correctReadConservativeGate: brandCounts.BRAND_CORRECT_READ_CONSERVATIVE_GATE,
      wrongReliableRead: brandCounts.BRAND_WRONG_RELIABLE_READ,
      correctReliableRead: brandCounts.BRAND_CORRECT_RELIABLE_READ,
      humanReviewRequired: cases.filter((item) => item.humanReviewRequired).length,
      classificationCounts: brandCounts,
    },
    warning: {
      totalCases: cases.length,
      evaluableCases: cases.filter(
        (item) => item.warningPrimaryClassification !== "WARNING_NOT_EVALUATED",
      ).length,
      regionNotFound: warningCounts.WARNING_REGION_NOT_FOUND,
      regionWrong: warningCounts.WARNING_REGION_WRONG,
      regionContaminated: warningCounts.WARNING_REGION_CONTAMINATED,
      orientationMiss: warningCounts.WARNING_ORIENTATION_MISS,
      anchorMiss: warningCounts.WARNING_ANCHOR_NOT_FOUND + warningCounts.WARNING_ANCHOR_WRONG,
      ocrRecognitionMiss: warningCounts.WARNING_OCR_RECOGNITION_MISS,
      exactMismatch: warningCounts.WARNING_EXACT_TEXT_MISMATCH,
      falsePass: warningCounts.WARNING_FALSE_PASS,
      correctPass: warningCounts.WARNING_CORRECT_PASS,
      needsReview: cases.filter((item) => item.warningStatus === "FAIL").length,
      fail: cases.filter((item) => item.warningStatus === "FAIL").length,
      classificationCounts: warningCounts,
    },
    alcohol: {
      totalCases: cases.length,
      evaluableCases: cases.filter(
        (item) => item.alcoholPrimaryClassification !== "ALCOHOL_NOT_EVALUATED",
      ).length,
      regionNotSearched: alcoholCounts.ALCOHOL_REGION_NOT_SEARCHED,
      regionNotFound: alcoholCounts.ALCOHOL_REGION_NOT_FOUND,
      ocrMiss: alcoholCounts.ALCOHOL_OCR_RECOGNITION_MISS,
      parseMiss: alcoholCounts.ALCOHOL_PARSE_MISS,
      selectorMiss: alcoholCounts.ALCOHOL_SELECTOR_MISS,
      correctRead: alcoholCounts.ALCOHOL_CORRECT_READ,
      wrongReliableRead: alcoholCounts.ALCOHOL_WRONG_RELIABLE_READ,
      notEvaluated: alcoholCounts.ALCOHOL_NOT_EVALUATED,
      classificationCounts: alcoholCounts,
    },
    summary: {
      mostFrequentBrandFailureClass: mostFrequent(brandCounts),
      mostFrequentWarningFailureClass: mostFrequent(warningCounts),
      mostFrequentAlcoholFailureClass: mostFrequent(alcoholCounts),
      missingGovernedSourceImages: cases.filter(
        (item) => item.sourceAvailability !== "GOVERNED_FIXTURE_AVAILABLE",
      ).length,
      failuresAttributableToSelectionRanking: selectionRanking,
      failuresAttributableToRecognitionLocalization: recognitionLocalization,
      failuresAttributableOnlyToConservativeAuthority:
        brandCounts.BRAND_CORRECT_READ_CONSERVATIVE_GATE,
      falseReliableBrandReads: brandCounts.BRAND_WRONG_RELIABLE_READ,
      falseGovernmentWarningPasses: warningCounts.WARNING_FALSE_PASS,
      falseReliableAlcoholReads: alcoholCounts.ALCOHOL_WRONG_RELIABLE_READ,
    },
  };
}

function recommendNextExperiment(metrics: CorpusMetrics): {
  recommendedNextExperiment: NextExperimentCandidate;
  recommendationReason: string;
  deferredExperiments: NextExperimentCandidate[];
} {
  if (metrics.summary.missingGovernedSourceImages > metrics.brand.totalCases / 2) {
    return {
      recommendedNextExperiment: "CORPUS_EXPANSION_REQUIRED",
      recommendationReason:
        "Most real-label staging cases are metadata-only, so the next governed step is importing redistributable source images before tuning OCR behavior.",
      deferredExperiments: [
        "BRAND_BOUNDED_PREPROCESSING",
        "BRAND_SCALE_EXPERIMENT",
        "WARNING_REGION_LOCALIZATION",
        "WARNING_REGION_DECONTAMINATION",
        "ALCOHOL_RECOVERY_TRIGGER",
        "ALCOHOL_RESELECTION",
      ],
    };
  }
  if (metrics.brand.ocrRecognitionMiss > metrics.brand.generationFilteringRankingMiss) {
    return {
      recommendedNextExperiment: "BRAND_BOUNDED_PREPROCESSING",
      recommendationReason:
        "Brand OCR recognition misses outnumber grouping, generation, filtering, and ranking misses.",
      deferredExperiments: ["BRAND_AUTHORITY_CALIBRATION", "ALCOHOL_RECOVERY_TRIGGER"],
    };
  }
  if (metrics.warning.regionContaminated >= metrics.warning.regionNotFound) {
    return {
      recommendedNextExperiment: "WARNING_REGION_DECONTAMINATION",
      recommendationReason:
        "Warning failures are most often contaminated by unrelated text once governed images are available.",
      deferredExperiments: ["ALCOHOL_RECOVERY_TRIGGER", "BRAND_SCALE_EXPERIMENT"],
    };
  }
  return {
    recommendedNextExperiment: "WARNING_REGION_LOCALIZATION",
    recommendationReason: "Warning region misses dominate the reproducible warning evidence.",
    deferredExperiments: ["ALCOHOL_RESELECTION", "BRAND_AUTHORITY_CALIBRATION"],
  };
}

export function buildCorpusReport(cases = REAL_LABEL_STAGING_CASES): CorpusReport {
  const metrics = metricsFor(cases);
  const recommendation = recommendNextExperiment(metrics);
  const brandGroupingRankingDominant =
    metrics.summary.failuresAttributableToSelectionRanking >
    metrics.summary.failuresAttributableToRecognitionLocalization;
  const rawOcrRecognitionDominantBrandFailure =
    metrics.brand.ocrRecognitionMiss >=
    Math.max(
      metrics.brand.regionMissingOrWrong,
      metrics.brand.groupingMiss,
      metrics.brand.generationFilteringRankingMiss,
      metrics.brand.correctReadConservativeGate,
    );
  const alcoholPerformanceEvaluable = metrics.alcohol.evaluableCases > 0;
  return {
    schemaVersion: "issue-149-real-label-staging-corpus.v1",
    config: {
      productionBehaviorChanged: false,
      sourceImagesCommitted: false,
      expectedSellerTextUsedAsProductionInput: false,
      source: "manual-pr-195-staging-results",
    },
    cases,
    metrics,
    analysis: {
      brandGroupingRankingDominant,
      rawOcrRecognitionDominantBrandFailure,
      warningDominantFailureMode: metrics.summary.mostFrequentWarningFailureClass,
      alcoholPerformanceEvaluable,
      ...recommendation,
      answers: {
        brandGroupingDominance: brandGroupingRankingDominant
          ? "Brand grouping/ranking is the dominant real-label failure."
          : "Brand grouping/ranking is not the dominant real-label failure in this staging corpus.",
        brandRecognitionDominance: rawOcrRecognitionDominantBrandFailure
          ? "Raw OCR recognition is the dominant Brand failure class."
          : "Raw OCR recognition is not the dominant Brand failure class.",
        warningFailureMode:
          "Government Warning failures split across missing anchors, contaminated regions, missing regions, and OCR transcription; exact comparison is proven only by the Christmas Hayride pass.",
        alcoholEvaluability: alcoholPerformanceEvaluable
          ? "Alcohol performance can be evaluated from at least one case."
          : "Alcohol performance cannot be evaluated from the current staging evidence because every Alcohol result is metadata-only or not evaluated.",
        nextExperiment: recommendation.recommendationReason,
        deferred:
          "OCR tuning, warning tuning, and Alcohol recovery experiments should be deferred until governed real-label source images are available for most cases.",
      },
    },
  };
}

export function caseSchemaJson(): Record<string, unknown> {
  const nullableString = {
    type: "object",
    required: ["value", "missingReason"],
    properties: {
      value: { type: ["string", "null"] },
      missingReason: { type: ["string", "null"] },
    },
    additionalProperties: false,
  };
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    title: "Issue 149 real-label staging corpus case",
    type: "object",
    required: [
      "caseId",
      "displayName",
      "sourceType",
      "sourceAvailability",
      "governedFixturePath",
      "stagingEnvironment",
      "prNumber",
      "testDate",
      "expectedSellerBrand",
      "sellerSelectedRegion",
      "rawBoundedOcrWords",
      "boundedTranscript",
      "independentTranscript",
      "selectedCandidate",
      "candidateList",
      "confidence",
      "reliability",
      "authorityState",
      "comparisonOutcome",
      "brandPrimaryClassification",
      "brandSecondaryNotes",
      "warningStatus",
      "warningRegionStatus",
      "warningOrientation",
      "warningAnchorStatus",
      "warningRawTranscript",
      "warningAnchoredTranscript",
      "warningOcrConfidence",
      "warningPrimaryClassification",
      "alcoholObservation",
      "alcoholPrimaryClassification",
      "humanReviewRequired",
      "provenance",
      "missingDataReasons",
    ],
    properties: {
      caseId: { type: "string" },
      displayName: { type: "string" },
      sourceType: { const: "manual-pr-195-staging" },
      sourceAvailability: {
        enum: ["GOVERNED_FIXTURE_AVAILABLE", "UNAVAILABLE_BROWSER_LOCAL", "METADATA_ONLY"],
      },
      governedFixturePath: nullableString,
      stagingEnvironment: { type: "string" },
      prNumber: { const: 195 },
      testDate: { type: "string" },
      expectedSellerBrand: { type: "string" },
      sellerSelectedRegion: { type: "object" },
      rawBoundedOcrWords: { type: "object" },
      boundedTranscript: nullableString,
      independentTranscript: nullableString,
      selectedCandidate: nullableString,
      candidateList: { type: "object" },
      confidence: { type: "object" },
      reliability: { enum: ["RELIABLE", "UNRELIABLE", "NOT_EVALUATED"] },
      authorityState: { enum: ["OBSERVED", "AMBIGUOUS", "LOW_CONFIDENCE", "NOT_OBSERVED", null] },
      comparisonOutcome: nullableString,
      brandPrimaryClassification: { enum: BRAND_PRIMARY_CLASSIFICATIONS },
      brandSecondaryNotes: { type: "array", items: { type: "string" } },
      warningStatus: { enum: ["PASS", "FAIL", "NOT_EVALUATED"] },
      warningRegionStatus: nullableString,
      warningOrientation: { type: "object" },
      warningAnchorStatus: nullableString,
      warningRawTranscript: nullableString,
      warningAnchoredTranscript: nullableString,
      warningOcrConfidence: { type: "object" },
      warningPrimaryClassification: { enum: WARNING_PRIMARY_CLASSIFICATIONS },
      alcoholObservation: { enum: ["OBSERVED", "NOT_OBSERVED", "NOT_EVALUATED"] },
      alcoholPrimaryClassification: { enum: ALCOHOL_PRIMARY_CLASSIFICATIONS },
      humanReviewRequired: { type: "boolean" },
      provenance: { type: "object" },
      missingDataReasons: { type: "array", items: { type: "string" } },
    },
    additionalProperties: false,
  };
}

function currentGitSha(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: process.cwd(),
      encoding: "utf8",
    }).trim();
  } catch {
    return "unavailable";
  }
}

function renderMetrics(report: CorpusReport): string {
  const { metrics, analysis } = report;
  const brand = metrics.brand;
  const warning = metrics.warning;
  const alcohol = metrics.alcohol;
  const rows = [
    ["Field", "Metric", "Value"],
    ["Brand", "Total cases", String(brand.totalCases)],
    ["Brand", "Evaluable cases", String(brand.evaluableCases)],
    ["Brand", "Source unavailable", rate(brand.sourceUnavailable, brand.totalCases)],
    ["Brand", "Region missing/wrong", rate(brand.regionMissingOrWrong, brand.totalCases)],
    ["Brand", "OCR recognition miss", rate(brand.ocrRecognitionMiss, brand.totalCases)],
    ["Brand", "Grouping miss", rate(brand.groupingMiss, brand.totalCases)],
    [
      "Brand",
      "Generation/filtering/ranking miss",
      rate(brand.generationFilteringRankingMiss, brand.totalCases),
    ],
    [
      "Brand",
      "Correct read conservative gate",
      rate(brand.correctReadConservativeGate, brand.totalCases),
    ],
    ["Brand", "Wrong reliable read", rate(brand.wrongReliableRead, brand.totalCases)],
    ["Brand", "Correct reliable read", rate(brand.correctReliableRead, brand.totalCases)],
    ["Warning", "Total cases", String(warning.totalCases)],
    ["Warning", "Evaluable cases", String(warning.evaluableCases)],
    ["Warning", "Region not found", rate(warning.regionNotFound, warning.totalCases)],
    ["Warning", "Region contaminated", rate(warning.regionContaminated, warning.totalCases)],
    ["Warning", "Anchor miss", rate(warning.anchorMiss, warning.totalCases)],
    ["Warning", "OCR recognition miss", rate(warning.ocrRecognitionMiss, warning.totalCases)],
    ["Warning", "Correct pass", rate(warning.correctPass, warning.totalCases)],
    ["Warning", "Fail", rate(warning.fail, warning.totalCases)],
    ["Alcohol", "Total cases", String(alcohol.totalCases)],
    ["Alcohol", "Evaluable cases", String(alcohol.evaluableCases)],
    ["Alcohol", "Not evaluated", rate(alcohol.notEvaluated, alcohol.totalCases)],
  ];
  const table = rows
    .map((row, index) =>
      index === 0
        ? `| ${row.join(" | ")} |\n| ${row.map(() => "---").join(" | ")} |`
        : `| ${row.join(" | ")} |`,
    )
    .join("\n");
  return `# Issue #149 real-label staging metrics

${table}

## Dominant Failures

- Brand: \`${metrics.summary.mostFrequentBrandFailureClass}\`
- Government Warning: \`${metrics.summary.mostFrequentWarningFailureClass}\`
- Alcohol: \`${metrics.summary.mostFrequentAlcoholFailureClass}\`

## Safety Outcomes

- False reliable Brand reads: ${metrics.summary.falseReliableBrandReads}
- False Government Warning passes: ${metrics.summary.falseGovernmentWarningPasses}
- False reliable Alcohol reads: ${metrics.summary.falseReliableAlcoholReads}

## Analysis

1. Is Brand grouping/ranking still dominant? ${analysis.answers.brandGroupingDominance}
2. Is raw OCR recognition dominant for Brand? ${analysis.answers.brandRecognitionDominance}
3. Why is Government Warning failing? ${analysis.answers.warningFailureMode}
4. Can Alcohol performance be evaluated? ${analysis.answers.alcoholEvaluability}
5. Recommended next experiment: \`${analysis.recommendedNextExperiment}\` - ${analysis.recommendationReason}
6. Deferred experiments: ${analysis.deferredExperiments.map((item) => `\`${item}\``).join(", ")}
`;
}

function renderTaxonomy(): string {
  return `# Failure Taxonomy

Each field result receives exactly one primary classification.

## Brand

${BRAND_PRIMARY_CLASSIFICATIONS.map((item) => `- \`${item}\``).join("\n")}

## Government Warning

${WARNING_PRIMARY_CLASSIFICATIONS.map((item) => `- \`${item}\``).join("\n")}

## Alcohol

${ALCOHOL_PRIMARY_CLASSIFICATIONS.map((item) => `- \`${item}\``).join("\n")}

## Deterministic Classification Rules

- Correct bounded OCR transcript with \`AMBIGUOUS\` solely because of authority logic: \`BRAND_CORRECT_READ_CONSERVATIVE_GATE\`.
- OCR transcript visibly differs from expected Brand before grouping: \`BRAND_OCR_RECOGNITION_MISS\`.
- Bounded region targets adjacent non-Brand text instead of the Brand: \`BRAND_REGION_WRONG\`.
- No warning region or transcript: \`WARNING_REGION_NOT_FOUND\`.
- Warning text inside a large region mixed with unrelated text: \`WARNING_REGION_CONTAMINATED\`.
- Exact anchored warning match and pass: \`WARNING_CORRECT_PASS\`.
- Alcohol absent from available staging evidence but source image cannot confirm presence: \`ALCOHOL_NOT_EVALUATED\`.
`;
}

function renderProvenance(report: CorpusReport): string {
  return `# Provenance

- Source: manual PR #195 staging conversation for Issue #149.
- Base commit for this measurement branch: ${currentGitSha()}.
- Production behavior changed: ${report.config.productionBehaviorChanged}.
- Source images committed: ${report.config.sourceImagesCommitted}.
- Expected seller Brand text is retained as evaluation truth only and is not a production OCR input, hint, ranking signal, or decision input.

## Governed Source Search

M Cellars has an existing governed repository fixture at \`tests/fixtures/precheck/m-cellars-24205001000905/label-ocr-source.jpeg\`.

Garden City Beach, Minneapolis, Luigi & Giovanni, The Golden Girls, Hubert Lamy, Aphrodite, and Christmas Hayride remain metadata-only because the attached desktop/manual staging images are not governed redistributable fixtures.
`;
}

function renderMissingImages(cases: RealLabelStagingCase[]): string {
  const rows = cases
    .filter((item) => item.sourceAvailability !== "GOVERNED_FIXTURE_AVAILABLE")
    .map(
      (item) =>
        `| ${item.caseId} | ${item.displayName} | ${item.governedFixturePath.missingReason ?? ""} |`,
    )
    .join("\n");
  return `# Missing Governed Images

Do not commit browser-local or private manual staging images. Add governed images later only when redistribution is approved.

## Import Procedure

1. Add the approved source image under a governed fixture directory.
2. Record its provenance and license/redistribution basis.
3. Add seller-selected region geometry exported from staging.
4. Regenerate this corpus with \`npm run eval:issue-149-real-label-staging-corpus\`.

| Case ID | Display Name | Reason |
| --- | --- | --- |
${rows}
`;
}

function renderReadme(report: CorpusReport): string {
  return `# Issue #149 Real-Label Staging Corpus

This artifact records manual PR #195 staging results as a governed measurement corpus. It is metadata-only for cases whose source images are not redistributable repository fixtures.

Run:

\`\`\`bash
npm run eval:issue-149-real-label-staging-corpus
\`\`\`

Recommended next experiment: \`${report.analysis.recommendedNextExperiment}\`.

No production OCR, selector, authority, warning, Alcohol, API, persistence, or UI behavior is changed by this artifact.
`;
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  const config = (await resolveConfig(filePath)) ?? {};
  const formatted = await format(JSON.stringify(value), {
    ...config,
    filepath: filePath,
    parser: "json",
  });
  writeFileSync(filePath, formatted);
}

export async function generateIssue149RealLabelStagingCorpus(): Promise<CorpusReport> {
  const report = buildCorpusReport();
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(
    path.join(OUTPUT_DIR, "cases.jsonl"),
    report.cases.map((item) => JSON.stringify(item)).join("\n") + "\n",
  );
  await writeJson(path.join(OUTPUT_DIR, "cases.schema.json"), caseSchemaJson());
  await writeJson(path.join(OUTPUT_DIR, "report.json"), report);
  writeFileSync(path.join(OUTPUT_DIR, "metrics.md"), renderMetrics(report));
  writeFileSync(path.join(OUTPUT_DIR, "failure-taxonomy.md"), renderTaxonomy());
  writeFileSync(path.join(OUTPUT_DIR, "provenance.md"), renderProvenance(report));
  writeFileSync(path.join(OUTPUT_DIR, "missing-images.md"), renderMissingImages(report.cases));
  writeFileSync(
    path.join(OUTPUT_DIR, "commands.sh"),
    "#!/usr/bin/env bash\nset -euo pipefail\nnpm run eval:issue-149-real-label-staging-corpus\n",
    { mode: 0o755 },
  );
  writeFileSync(path.join(OUTPUT_DIR, "git-sha.txt"), `${currentGitSha()}\n`);
  writeFileSync(path.join(OUTPUT_DIR, "README.md"), renderReadme(report));
  return report;
}
