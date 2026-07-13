import type { BrandLineReason } from "@/pipeline/extractor/field-selection";

import type {
  EvalAlcoholTruth,
  EvalBrandTruth,
  EvalCandidateFilteringSubtype,
} from "./eval-manifest.types";
import {
  alcoholParsedAccurate,
  brandExactMatch,
  brandNormalizedMatch,
  normalizeKey,
  type ObservedField,
} from "./metrics";
import type { CaseDiagnostics } from "./eval-report.types";

interface BrandMatchCandidate {
  reason?: BrandLineReason;
  relation: "contains-acceptable" | "acceptable-contains";
  score: number;
}

function bestBrandTextMatch(
  text: string | null | undefined,
  acceptable: string[],
): BrandMatchCandidate | null {
  const normalizedText = normalizeKey(text ?? "");
  if (normalizedText.length === 0) return null;

  let best: BrandMatchCandidate | null = null;
  for (const accepted of acceptable) {
    const normalizedAccepted = normalizeKey(accepted);
    if (normalizedAccepted.length === 0) continue;

    if (normalizedText.includes(normalizedAccepted)) {
      const score = 2_000 - (normalizedText.length - normalizedAccepted.length);
      if (!best || score > best.score) {
        best = { relation: "contains-acceptable", score };
      }
      continue;
    }

    if (normalizedAccepted.includes(normalizedText)) {
      const score = 1_000 - (normalizedAccepted.length - normalizedText.length);
      if (!best || score > best.score) {
        best = { relation: "acceptable-contains", score };
      }
    }
  }

  return best;
}

function brandRejectedSubtype(reason: BrandLineReason): EvalCandidateFilteringSubtype {
  switch (reason) {
    case "no-letters-or-too-short":
      return "brand-rejected-no-letters-or-too-short";
    case "producer-line":
      return "brand-rejected-producer-line";
    case "non-brand-keyword":
      return "brand-rejected-non-brand-keyword";
    case "too-many-words":
      return "brand-rejected-too-many-words";
    case "domain-like":
      return "brand-rejected-domain-like";
    case "varietal-or-designation":
      return "brand-rejected-varietal-or-designation";
    case "generic-product-language":
      return "brand-rejected-generic-product-language";
    case "location-or-appellation":
      return "brand-rejected-location-or-appellation";
    case "low-information-fragment":
      return "brand-rejected-low-information-fragment";
    case "sentence-fragment":
      return "brand-rejected-sentence-fragment";
    case "candidate-positive":
    case "candidate-plausible":
      return "brand-kept-overextended-candidate";
  }
}

function candidateOrderingScore(
  score: number,
  confidence: number,
  rawText: string,
): [number, number, number] {
  return [score, confidence, -rawText.length];
}

function isBetterTuple(
  candidate: [number, number, number],
  current: [number, number, number] | null,
): boolean {
  if (!current) return true;
  if (candidate[0] !== current[0]) return candidate[0] > current[0];
  if (candidate[1] !== current[1]) return candidate[1] > current[1];
  return candidate[2] > current[2];
}

export function brandCandidateFilteringSubtype(
  truth: EvalBrandTruth,
  diagnostics: Pick<CaseDiagnostics, "brandCandidateDecisions" | "brandLineDecisions">,
): EvalCandidateFilteringSubtype | null {
  if (!truth.present || truth.acceptable.length === 0) return null;

  let bestRejected: {
    subtype: EvalCandidateFilteringSubtype;
    ordering: [number, number, number];
  } | null = null;
  for (const candidate of diagnostics.brandCandidateDecisions) {
    if (candidate.kept) continue;
    const match =
      bestBrandTextMatch(candidate.cleanedValue, truth.acceptable) ??
      bestBrandTextMatch(candidate.rawText, truth.acceptable);
    if (!match || match.relation !== "contains-acceptable") continue;
    const ordering = candidateOrderingScore(match.score, candidate.confidence, candidate.rawText);
    if (isBetterTuple(ordering, bestRejected?.ordering ?? null)) {
      bestRejected = {
        subtype: brandRejectedSubtype(candidate.filterReason),
        ordering,
      };
    }
  }
  if (bestRejected) return bestRejected.subtype;

  let bestKeptOverextended: [number, number, number] | null = null;
  let sawKeptOverextended = false;
  let bestKeptPartial: [number, number, number] | null = null;
  let sawKeptPartial = false;
  for (const candidate of diagnostics.brandCandidateDecisions) {
    if (!candidate.kept) continue;
    const match =
      bestBrandTextMatch(candidate.cleanedValue, truth.acceptable) ??
      bestBrandTextMatch(candidate.rawText, truth.acceptable);
    if (!match) continue;
    const ordering = candidateOrderingScore(match.score, candidate.confidence, candidate.rawText);
    if (match.relation === "contains-acceptable") {
      if (isBetterTuple(ordering, bestKeptOverextended)) {
        bestKeptOverextended = ordering;
        sawKeptOverextended = true;
      }
    } else if (isBetterTuple(ordering, bestKeptPartial)) {
      bestKeptPartial = ordering;
      sawKeptPartial = true;
    }
  }
  if (sawKeptOverextended) return "brand-kept-overextended-candidate";
  if (sawKeptPartial) return "brand-kept-partial-candidate";

  let bestLine: {
    subtype: EvalCandidateFilteringSubtype;
    ordering: [number, number, number];
  } | null = null;
  for (const line of diagnostics.brandLineDecisions) {
    const match = bestBrandTextMatch(line.rawText, truth.acceptable);
    if (!match) continue;
    const ordering = candidateOrderingScore(match.score, line.confidence, line.rawText);
    const subtype =
      line.kept || match.relation === "acceptable-contains"
        ? match.relation === "contains-acceptable"
          ? "brand-kept-overextended-candidate"
          : "brand-kept-partial-candidate"
        : brandRejectedSubtype(line.reason);
    if (isBetterTuple(ordering, bestLine?.ordering ?? null)) {
      bestLine = { subtype, ordering };
    }
  }

  return bestLine?.subtype ?? "brand-filtering-cause-unattributed";
}

function alcoholPercentVariants(value: number): string[] {
  const variants = new Set<string>();
  const normalized = value.toFixed(2).replace(/\.?0+$/, "");
  for (const base of [String(value), normalized, value.toFixed(1), value.toFixed(2)]) {
    variants.add(base);
    variants.add(base.replace(".", ","));
  }
  return [...variants];
}

function alcoholTextScore(
  diagnostic: Pick<
    CaseDiagnostics["alcoholCandidateDecisions"][number],
    "rawText" | "normalizedValue" | "normalizedParsingText" | "parsedPercent"
  >,
  truth: EvalAlcoholTruth,
): number {
  const texts = [diagnostic.rawText, diagnostic.normalizedValue, diagnostic.normalizedParsingText]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .map((value) => value.toLowerCase());

  let best = 0;
  if (
    diagnostic.parsedPercent !== null &&
    truth.acceptablePercents.some((value) => Math.abs(value - diagnostic.parsedPercent!) < 0.05)
  ) {
    best = 3_000;
  }

  for (const statement of truth.acceptableText) {
    const normalizedStatement = statement.toLowerCase();
    if (texts.some((text) => text.includes(normalizedStatement))) {
      best = Math.max(best, 2_500 - Math.max(0, normalizedStatement.length - 1));
    }
  }

  for (const value of truth.acceptablePercents) {
    if (
      alcoholPercentVariants(value).some((variant) => texts.some((text) => text.includes(variant)))
    ) {
      best = Math.max(best, 2_000);
    }
  }

  return best;
}

function alcoholRejectedSubtype(
  reason: NonNullable<CaseDiagnostics["alcoholCandidateDecisions"][number]["rejectionReason"]>,
): EvalCandidateFilteringSubtype {
  switch (reason) {
    case "proof-only":
      return "alcohol-rejected-proof-only";
    case "no-supported-number":
      return "alcohol-rejected-no-supported-number";
    case "missing-volume-marker":
      return "alcohol-rejected-missing-volume-marker";
    case "missing-explicit-alcohol-marker":
      return "alcohol-rejected-missing-explicit-alcohol-marker";
    case "bare-volume-marker-too-weak":
      return "alcohol-rejected-bare-volume-marker-too-weak";
    case "unsupported-pattern":
      return "alcohol-rejected-unsupported-pattern";
    case "parser-rejected":
      return "alcohol-rejected-unsupported-pattern";
  }
}

export function alcoholCandidateFilteringSubtype(
  truth: EvalAlcoholTruth,
  diagnostics: Pick<
    CaseDiagnostics,
    | "alcoholCandidateDecisions"
    | "alcoholNumberInOcr"
    | "alcoholPercentInOcr"
    | "alcoholAlcoholMarkerInOcr"
    | "alcoholVolumeMarkerInOcr"
  >,
): EvalCandidateFilteringSubtype | null {
  if (!truth.present) return null;

  let best: {
    subtype: EvalCandidateFilteringSubtype;
    ordering: [number, number, number];
  } | null = null;
  for (const candidate of diagnostics.alcoholCandidateDecisions) {
    if (candidate.kept || !candidate.rejectionReason) continue;
    const score = alcoholTextScore(candidate, truth);
    const ordering = candidateOrderingScore(score, candidate.confidence, candidate.rawText);
    if (isBetterTuple(ordering, best?.ordering ?? null)) {
      best = {
        subtype: alcoholRejectedSubtype(candidate.rejectionReason),
        ordering,
      };
    }
  }
  if (best) return best.subtype;

  if (diagnostics.alcoholNumberInOcr && diagnostics.alcoholVolumeMarkerInOcr) {
    return diagnostics.alcoholAlcoholMarkerInOcr
      ? "alcohol-rejected-missing-volume-marker"
      : "alcohol-rejected-missing-explicit-alcohol-marker";
  }
  if (diagnostics.alcoholNumberInOcr && diagnostics.alcoholPercentInOcr) {
    return "alcohol-rejected-missing-volume-marker";
  }
  return "alcohol-rejected-unsupported-pattern";
}

export function brandSelectedFieldCorrect(truth: EvalBrandTruth, observed: ObservedField): boolean {
  if (!truth.present) return false;
  return (
    brandExactMatch(observed.value, truth.acceptable) ||
    brandNormalizedMatch(observed.value, truth.acceptable)
  );
}

export function alcoholSelectedFieldCorrect(
  truth: EvalAlcoholTruth,
  observed: ObservedField,
): boolean {
  if (!truth.present) return false;
  return alcoholParsedAccurate(observed.value, truth.acceptablePercents);
}
