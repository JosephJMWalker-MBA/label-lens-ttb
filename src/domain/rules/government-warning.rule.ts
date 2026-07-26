import type { AuthorityVersion } from "@/domain/run/version-manifest.types";
import type { VerificationFinding } from "@/domain/verification/finding.types";
import type {
  AnalyzerCandidateProvenance,
  AnalyzerOcrConfidence,
  EvidenceGeometry,
} from "@/pipeline/analyzer/analyzer.types";

export const GOVERNMENT_WARNING_RULE_ID = "government-warning-prescribed-text-v1";
export const GOVERNMENT_WARNING_RULE_VERSION = "1.0.1";
export const GOVERNMENT_WARNING_PROFILE_ID = "wine-precheck";
export const GOVERNMENT_WARNING_PROFILE_VERSION = "1.0.0";

export const GOVERNMENT_WARNING_AUTHORITY: AuthorityVersion = {
  citation: "27 CFR 16.20; 27 CFR 16.21; 27 CFR 16.22",
  snapshotDate: "2026-07-26",
};

export const GOVERNMENT_WARNING_AUTHORITY_SOURCE = {
  officialSources: [
    "https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-16/subpart-C/section-16.20",
    "https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-16/subpart-C/section-16.21",
    "https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-16/subpart-C/section-16.22",
    "https://www.ttb.gov/regulated-commodities/beverage-alcohol/wine/labeling-wine/wine-labeling-health-warning-statement",
  ],
  retrievalDate: "2026-07-26",
  categoryAssumptions:
    "Domestic wine or other alcoholic beverage bottled for sale or distribution in the United States, containing at least 0.5% alcohol by volume.",
} as const;

export const CANONICAL_GOVERNMENT_WARNING =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";

export const GOVERNMENT_WARNING_EVIDENCE_STATES = [
  "observed",
  "partial",
  "ambiguous",
  "not_observed",
] as const;
export type GovernmentWarningEvidenceState = (typeof GOVERNMENT_WARNING_EVIDENCE_STATES)[number];

export type GovernmentWarningRuleResult = "PASS" | "FAIL" | "NEEDS_REVIEW" | "not_run";

export const GOVERNMENT_WARNING_CONTAMINATION_REASONS = [
  "large-panel-coverage",
  "net-contents-or-abv",
  "producer-or-brand-text",
  "address-like-text",
  "severe-token-displacement",
] as const;
export type GovernmentWarningContaminationReason =
  (typeof GOVERNMENT_WARNING_CONTAMINATION_REASONS)[number];

export interface GovernmentWarningContamination {
  detected: boolean;
  reasons: GovernmentWarningContaminationReason[];
}

export interface GovernmentWarningObservation {
  panelId: string;
  evidenceState: GovernmentWarningEvidenceState;
  rawTranscript: string | null;
  normalizedComparisonText: string | null;
  anchoredTranscript: string | null;
  normalizedAnchoredComparisonText: string | null;
  ocrEvidenceScore: number;
  ocrConfidence?: AnalyzerOcrConfidence;
  detectedOrientation: 0 | 90 | 180 | 270 | null;
  geometry?: EvidenceGeometry;
  extractionProvenance: AnalyzerCandidateProvenance | null;
  contamination?: GovernmentWarningContamination;
  match: {
    anchorFound: boolean;
    anchorUncertain: boolean;
    canonicalTokenCoverage: number;
    exactTextMatch: boolean;
    distinctivePhraseHits: string[];
  };
}

export interface GovernmentWarningDiffToken {
  expected: string | null;
  observed: string | null;
  status: "equal" | "missing" | "extra" | "substituted";
}

export interface GovernmentWarningPackageFinding {
  ruleId: typeof GOVERNMENT_WARNING_RULE_ID;
  ruleVersion: typeof GOVERNMENT_WARNING_RULE_VERSION;
  authority: AuthorityVersion;
  authoritySource: typeof GOVERNMENT_WARNING_AUTHORITY_SOURCE;
  result: GovernmentWarningRuleResult;
  ruleExecutionStatus: VerificationFinding["ruleExecutionStatus"];
  expectedText: string;
  normalizedExpectedText: string;
  observedPanelId: string | null;
  observedOrientation: GovernmentWarningObservation["detectedOrientation"];
  observedText: string | null;
  normalizedObservedText: string | null;
  diff: GovernmentWarningDiffToken[];
  comparisonStatus?: "reliable" | "contaminated";
  rationale: string;
}

const DISTINCTIVE_PHRASES = [
  "according to the surgeon general",
  "during pregnancy",
  "risk of birth defects",
  "drive a car or operate machinery",
  "may cause health problems",
] as const;

export function normalizeGovernmentWarningForComparison(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[‐‑‒–—―]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function comparisonTokens(value: string): string[] {
  return normalizeGovernmentWarningForComparison(value).match(/[a-z0-9]+|[():.,;]/g) ?? [];
}

function tokenCoverage(observed: string): number {
  const expected = comparisonTokens(CANONICAL_GOVERNMENT_WARNING).filter((token) =>
    /[a-z0-9]+/.test(token),
  );
  const observedSet = new Set(
    comparisonTokens(observed).filter((token) => /[a-z0-9]+/.test(token)),
  );
  const covered = expected.filter((token) => observedSet.has(token)).length;
  return expected.length === 0 ? 0 : covered / expected.length;
}

function rawTokens(value: string): string[] {
  return value.split(/\s+/).filter(Boolean);
}

function wordTokens(value: string): string[] {
  return normalizeGovernmentWarningForComparison(value).match(/[a-z0-9]+/g) ?? [];
}

function longestCommonSubsequenceLength(left: readonly string[], right: readonly string[]): number {
  const previous = new Array<number>(right.length + 1).fill(0);
  const current = new Array<number>(right.length + 1).fill(0);
  for (const leftToken of left) {
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] =
        leftToken === right[rightIndex - 1]
          ? previous[rightIndex - 1] + 1
          : Math.max(previous[rightIndex], current[rightIndex - 1]);
    }
    for (let index = 0; index <= right.length; index += 1) {
      previous[index] = current[index];
      current[index] = 0;
    }
  }
  return previous[right.length];
}

export function governmentWarningContaminationSignals(
  observed: string | null,
  geometry?: EvidenceGeometry,
): GovernmentWarningContamination {
  if (!observed) return { detected: false, reasons: [] };

  const normalized = normalizeGovernmentWarningForComparison(observed);
  const reasons: GovernmentWarningContaminationReason[] = [];
  const geometryArea = geometry ? geometry.width * geometry.height : 0;
  const imageArea = geometry ? geometry.imageWidth * geometry.imageHeight : 0;
  if (imageArea > 0 && geometryArea / imageArea >= 0.65) {
    reasons.push("large-panel-coverage");
  }
  if (
    /\b\d+(?:\.\d+)?\s*(?:ml|cl|l)\b/.test(normalized) ||
    /\b(?:alc(?:ohol)?\.?\s*\/?\s*vol|alcohol\s+by\s+volume)\b/.test(normalized) ||
    /%\s*(?:alc|alcohol)/.test(normalized)
  ) {
    reasons.push("net-contents-or-abv");
  }
  if (/\b(?:wines?|winery|vineyards?|cellars?|estate|bottled|produced)\b/.test(normalized)) {
    reasons.push("producer-or-brand-text");
  }
  if (
    /,\s*(?:al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)\b/.test(
      normalized,
    )
  ) {
    reasons.push("address-like-text");
  }

  const expectedTokens = wordTokens(CANONICAL_GOVERNMENT_WARNING);
  const observedTokens = wordTokens(observed);
  const orderedCoverage =
    expectedTokens.length === 0
      ? 0
      : longestCommonSubsequenceLength(expectedTokens, observedTokens) / expectedTokens.length;
  if (
    tokenCoverage(observed) >= 0.8 &&
    orderedCoverage >= 0.7 &&
    observedTokens.length >= expectedTokens.length + 4
  ) {
    reasons.push("severe-token-displacement");
  }

  return { detected: reasons.length > 0, reasons };
}

function boundedTokenSegment(value: string): string {
  const expectedTokenCount = rawTokens(CANONICAL_GOVERNMENT_WARNING).length;
  return rawTokens(value)
    .slice(0, expectedTokenCount + 6)
    .join(" ")
    .trim();
}

function anchoredFromObservation(observation: GovernmentWarningObservation): {
  rawTranscript: string | null;
  anchoredTranscript: string | null;
  normalizedAnchoredComparisonText: string | null;
  contamination: GovernmentWarningContamination;
  match: GovernmentWarningObservation["match"];
} {
  if (!observation.rawTranscript) {
    return {
      rawTranscript: null,
      anchoredTranscript: null,
      normalizedAnchoredComparisonText: null,
      contamination: observation.contamination ?? { detected: false, reasons: [] },
      match: observation.match,
    };
  }

  const derived = deriveAnchoredGovernmentWarningTranscript(observation.rawTranscript);
  const anchoredTranscript =
    derived.anchoredTranscript && derived.anchoredTranscript !== observation.rawTranscript
      ? derived.anchoredTranscript
      : (observation.anchoredTranscript ?? derived.anchoredTranscript);
  const normalizedAnchoredComparisonText = anchoredTranscript
    ? normalizeGovernmentWarningForComparison(anchoredTranscript)
    : null;
  const normalized =
    normalizedAnchoredComparisonText ??
    normalizeGovernmentWarningForComparison(observation.rawTranscript);
  const normalizedExpected = normalizeGovernmentWarningForComparison(CANONICAL_GOVERNMENT_WARNING);
  const distinctivePhraseHits = DISTINCTIVE_PHRASES.filter((phrase) => normalized.includes(phrase));

  return {
    rawTranscript: observation.rawTranscript,
    anchoredTranscript,
    normalizedAnchoredComparisonText,
    contamination: governmentWarningContaminationSignals(anchoredTranscript, observation.geometry),
    match: {
      anchorFound: derived.anchorFound || observation.match.anchorFound,
      anchorUncertain: derived.anchorUncertain || observation.match.anchorUncertain,
      canonicalTokenCoverage: tokenCoverage(anchoredTranscript ?? observation.rawTranscript),
      exactTextMatch: normalized === normalizedExpected || normalized.includes(normalizedExpected),
      distinctivePhraseHits,
    },
  };
}

export function deriveAnchoredGovernmentWarningTranscript(rawTranscript: string): {
  anchoredTranscript: string | null;
  normalizedAnchoredComparisonText: string | null;
  anchorFound: boolean;
  anchorUncertain: boolean;
} {
  const normalizedRaw = normalizeGovernmentWarningForComparison(rawTranscript);
  const anchor = /government\s+warning\b[:\s]*/i.exec(rawTranscript);
  if (anchor?.index !== undefined) {
    const anchoredTranscript = boundedTokenSegment(rawTranscript.slice(anchor.index));
    return {
      anchoredTranscript,
      normalizedAnchoredComparisonText: normalizeGovernmentWarningForComparison(anchoredTranscript),
      anchorFound: true,
      anchorUncertain: false,
    };
  }

  const anchorUncertain =
    /\bgovernment\b/.test(normalizedRaw) &&
    (/\bwarn[a-z0-9]*\b/.test(normalizedRaw) || /\bwarning\b/.test(normalizedRaw));
  return {
    anchoredTranscript: null,
    normalizedAnchoredComparisonText: null,
    anchorFound: false,
    anchorUncertain,
  };
}

export function governmentWarningMatchSignals(
  rawTranscript: string,
): GovernmentWarningObservation["match"] {
  const anchor = deriveAnchoredGovernmentWarningTranscript(rawTranscript);
  const normalized =
    anchor.normalizedAnchoredComparisonText ??
    normalizeGovernmentWarningForComparison(rawTranscript);
  const normalizedExpected = normalizeGovernmentWarningForComparison(CANONICAL_GOVERNMENT_WARNING);
  const distinctivePhraseHits = DISTINCTIVE_PHRASES.filter((phrase) => normalized.includes(phrase));
  return {
    anchorFound: anchor.anchorFound,
    anchorUncertain: anchor.anchorUncertain,
    canonicalTokenCoverage: tokenCoverage(anchor.anchoredTranscript ?? rawTranscript),
    exactTextMatch: normalized === normalizedExpected || normalized.includes(normalizedExpected),
    distinctivePhraseHits,
  };
}

export function diffGovernmentWarning(observed: string | null): GovernmentWarningDiffToken[] {
  const expectedTokens = comparisonTokens(CANONICAL_GOVERNMENT_WARNING);
  const normalizedExpected = normalizeGovernmentWarningForComparison(CANONICAL_GOVERNMENT_WARNING);
  const normalizedObserved = observed ? normalizeGovernmentWarningForComparison(observed) : "";
  const observedTokens =
    observed && normalizedObserved.startsWith(normalizedExpected)
      ? expectedTokens
      : observed
        ? comparisonTokens(observed)
        : [];
  const out: GovernmentWarningDiffToken[] = [];
  const max = Math.max(expectedTokens.length, observedTokens.length);
  for (let index = 0; index < max; index += 1) {
    const expected = expectedTokens[index] ?? null;
    const actual = observedTokens[index] ?? null;
    if (expected === actual) {
      out.push({ expected, observed: actual, status: "equal" });
    } else if (expected === null) {
      out.push({ expected, observed: actual, status: "extra" });
    } else if (actual === null) {
      out.push({ expected, observed: actual, status: "missing" });
    } else {
      out.push({ expected, observed: actual, status: "substituted" });
    }
  }
  return out;
}

export function evaluateGovernmentWarningPackage(
  observations: readonly GovernmentWarningObservation[],
): GovernmentWarningPackageFinding {
  const candidates = observations
    .filter((observation) => observation.evidenceState !== "not_observed")
    .map((observation) => ({
      observation,
      anchored: anchoredFromObservation(observation),
    }));
  const exact = candidates.find((candidate) => candidate.anchored.match.exactTextMatch);
  const best =
    exact ??
    [...candidates].sort(
      (left, right) =>
        right.anchored.match.canonicalTokenCoverage - left.anchored.match.canonicalTokenCoverage ||
        right.observation.ocrEvidenceScore - left.observation.ocrEvidenceScore,
    )[0] ??
    null;

  const base = {
    ruleId: GOVERNMENT_WARNING_RULE_ID,
    ruleVersion: GOVERNMENT_WARNING_RULE_VERSION,
    authority: GOVERNMENT_WARNING_AUTHORITY,
    authoritySource: GOVERNMENT_WARNING_AUTHORITY_SOURCE,
    expectedText: CANONICAL_GOVERNMENT_WARNING,
    normalizedExpectedText: normalizeGovernmentWarningForComparison(CANONICAL_GOVERNMENT_WARNING),
    observedPanelId: best?.observation.panelId ?? null,
    observedOrientation: best?.observation.detectedOrientation ?? null,
    observedText: best?.anchored.anchoredTranscript ?? best?.anchored.rawTranscript ?? null,
    normalizedObservedText:
      best?.anchored.normalizedAnchoredComparisonText ??
      best?.observation.normalizedComparisonText ??
      null,
    diff: diffGovernmentWarning(
      best?.anchored.anchoredTranscript ?? best?.anchored.rawTranscript ?? null,
    ),
    comparisonStatus: "reliable" as const,
  } as const;

  if (observations.length === 0) {
    return {
      ...base,
      result: "not_run",
      ruleExecutionStatus: "not_run_insufficient_evidence",
      rationale:
        "not_run: no panel OCR observations were available for government-warning verification.",
    };
  }

  if (!best) {
    return {
      ...base,
      result: "FAIL",
      ruleExecutionStatus: "executed",
      rationale:
        "FAIL: sufficient supplied panel evidence was searched and no government-warning anchor or prescribed-warning phrase evidence was observed.",
    };
  }

  if (best.observation.evidenceState === "ambiguous") {
    return {
      ...base,
      result: "NEEDS_REVIEW",
      ruleExecutionStatus: "executed",
      rationale:
        "NEEDS_REVIEW: multiple plausible government-warning candidates were observed and no deterministic winner is safe.",
    };
  }

  if (best.anchored.match.anchorUncertain) {
    return {
      ...base,
      result: "NEEDS_REVIEW",
      ruleExecutionStatus: "executed",
      rationale:
        "NEEDS_REVIEW: likely government-warning evidence exists, but the warning anchor is corrupted or uncertain.",
    };
  }

  const broadExactEvidence =
    best.anchored.match.exactTextMatch &&
    best.anchored.contamination.reasons.includes("large-panel-coverage");
  if (
    best.anchored.contamination.detected &&
    (!best.anchored.match.exactTextMatch || broadExactEvidence)
  ) {
    return {
      ...base,
      result: "NEEDS_REVIEW",
      ruleExecutionStatus: "executed",
      diff: [],
      comparisonStatus: "contaminated",
      rationale:
        "NEEDS_REVIEW: warning text was detected, but surrounding label text was interleaved with the OCR result. Human review is required.",
    };
  }

  if (best.anchored.match.exactTextMatch) {
    return {
      ...base,
      result: "PASS",
      ruleExecutionStatus: "executed",
      rationale: "PASS: readable government-warning evidence matches the prescribed text.",
    };
  }

  if (
    best.observation.evidenceState === "observed" &&
    best.anchored.match.canonicalTokenCoverage >= 0.9
  ) {
    return {
      ...base,
      result: "FAIL",
      ruleExecutionStatus: "executed",
      rationale:
        "FAIL: readable government-warning evidence is complete enough to establish a wording defect.",
    };
  }

  return {
    ...base,
    result: "NEEDS_REVIEW",
    ruleExecutionStatus: "executed",
    rationale:
      "NEEDS_REVIEW: likely government-warning evidence exists, but OCR completeness or image quality cannot establish exact wording.",
  };
}
