import type { AuthorityVersion } from "@/domain/run/version-manifest.types";
import type { VerificationFinding } from "@/domain/verification/finding.types";
import type {
  AnalyzerCandidateProvenance,
  AnalyzerOcrConfidence,
  EvidenceGeometry,
} from "@/pipeline/analyzer/analyzer.types";

export const GOVERNMENT_WARNING_RULE_ID = "government-warning-prescribed-text-v1";
export const GOVERNMENT_WARNING_RULE_VERSION = "1.0.0";
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

function boundedTokenSegment(value: string): string {
  const expectedTokenCount = rawTokens(CANONICAL_GOVERNMENT_WARNING).length;
  return rawTokens(value)
    .slice(0, expectedTokenCount + 6)
    .join(" ")
    .trim();
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
  const candidates = observations.filter(
    (observation) => observation.evidenceState !== "not_observed",
  );
  const exact = candidates.find((observation) => observation.match.exactTextMatch);
  const best =
    exact ??
    [...candidates].sort(
      (left, right) =>
        right.match.canonicalTokenCoverage - left.match.canonicalTokenCoverage ||
        right.ocrEvidenceScore - left.ocrEvidenceScore,
    )[0] ??
    null;

  const base = {
    ruleId: GOVERNMENT_WARNING_RULE_ID,
    ruleVersion: GOVERNMENT_WARNING_RULE_VERSION,
    authority: GOVERNMENT_WARNING_AUTHORITY,
    authoritySource: GOVERNMENT_WARNING_AUTHORITY_SOURCE,
    expectedText: CANONICAL_GOVERNMENT_WARNING,
    normalizedExpectedText: normalizeGovernmentWarningForComparison(CANONICAL_GOVERNMENT_WARNING),
    observedPanelId: best?.panelId ?? null,
    observedOrientation: best?.detectedOrientation ?? null,
    observedText: best?.anchoredTranscript ?? best?.rawTranscript ?? null,
    normalizedObservedText:
      best?.normalizedAnchoredComparisonText ?? best?.normalizedComparisonText ?? null,
    diff: diffGovernmentWarning(best?.anchoredTranscript ?? best?.rawTranscript ?? null),
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

  if (best.evidenceState === "ambiguous") {
    return {
      ...base,
      result: "NEEDS_REVIEW",
      ruleExecutionStatus: "executed",
      rationale:
        "NEEDS_REVIEW: multiple plausible government-warning candidates were observed and no deterministic winner is safe.",
    };
  }

  if (best.match.anchorUncertain) {
    return {
      ...base,
      result: "NEEDS_REVIEW",
      ruleExecutionStatus: "executed",
      rationale:
        "NEEDS_REVIEW: likely government-warning evidence exists, but the warning anchor is corrupted or uncertain.",
    };
  }

  if (best.match.exactTextMatch) {
    return {
      ...base,
      result: "PASS",
      ruleExecutionStatus: "executed",
      rationale: "PASS: readable government-warning evidence matches the prescribed text.",
    };
  }

  if (best.evidenceState === "observed" && best.match.canonicalTokenCoverage >= 0.9) {
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
