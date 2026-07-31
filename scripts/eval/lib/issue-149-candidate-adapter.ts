/**
 * Issue #149 — the one reference adapter from a production
 * `BrandCandidateDiagnostic` to a persisted candidate evidence record.
 *
 * Evaluation-only and non-OCR. **The Stage 2 acquisition runner must use this
 * adapter rather than reimplementing the mapping.** A second mapping could drift
 * from production's shape without any test noticing — which is exactly how the
 * six-key `ocrConfidence` schema survived Amendment 5.
 *
 * It lives outside `src/fixtures/**` for the same reason the canonical helper
 * does, and it imports only production TYPES from
 * `src/pipeline/extractor/field-selection`, which the invocation contract
 * explicitly permits on the acquisition route.
 */
import type {
  BrandCandidateDiagnostic,
  BrandFilterCheck,
  BrandFilterCheckName,
} from "@/pipeline/extractor/field-selection";

import {
  CANDIDATE_CANONICALIZATION_VERSION,
  type CandidateEvidenceRecord,
  finalizeCandidateRecord,
} from "./issue-149-evidence-canonical";

export class CandidateAdapterError extends Error {
  constructor(
    readonly code:
      | "COMPLETE_DIAGNOSTICS_ABSENT"
      | "MALFORMED_OPAQUE_ITEM_ID"
      | "ORDINAL_OUT_OF_RANGE"
      | "PROVENANCE_DISAGREES_WITH_CANDIDATE",
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = "CandidateAdapterError";
  }
}

export interface CandidateAdapterContext {
  opaqueItemId: string;
  candidateOrdinal: number;
  completeCandidateArrayLength: number;
  /**
   * Position in the COMPLETE ranked list, or null when the candidate is not
   * ranked. Computed by the caller from the whole array, never from a head.
   */
  rankedPosition: number | null;
}

const OPAQUE_ITEM_ID = /^item-\d{4}$/;

/**
 * Cross-field checks on facts the diagnostic states twice.
 *
 * `BrandCandidateDiagnostic` repeats `passId`, `passKind` and `regionName` at the
 * top level and inside `candidateProvenance`, and `supportPassIds` mirrors
 * `candidateProvenance.supportingPassIds`. If those ever disagree the evidence is
 * internally incoherent, and a replay reading one copy would not match a replay
 * reading the other.
 */
function assertProvenanceAgreement(diagnostic: BrandCandidateDiagnostic): void {
  const provenance = diagnostic.candidateProvenance;
  const disagreements: string[] = [];

  if (diagnostic.passId !== provenance.passId) {
    disagreements.push(`passId ${diagnostic.passId} vs provenance ${provenance.passId}`);
  }
  if (diagnostic.passKind !== provenance.passKind) {
    disagreements.push(`passKind ${diagnostic.passKind} vs provenance ${provenance.passKind}`);
  }
  if (diagnostic.regionName !== provenance.regionName) {
    disagreements.push(
      `regionName ${diagnostic.regionName} vs provenance ${provenance.regionName}`,
    );
  }
  const support = [...diagnostic.supportPassIds];
  const supporting = [...provenance.supportingPassIds];
  if (support.length !== supporting.length || support.some((id, i) => id !== supporting[i])) {
    disagreements.push(
      `supportPassIds ${JSON.stringify(support)} vs provenance.supportingPassIds ${JSON.stringify(supporting)}`,
    );
  }
  if (diagnostic.confidence !== diagnostic.ocrEvidenceScore) {
    disagreements.push(
      `confidence ${diagnostic.confidence} vs ocrEvidenceScore ${diagnostic.ocrEvidenceScore}`,
    );
  }
  const expectedRecovery = diagnostic.passKind !== "full-image-primary";
  if (provenance.recoveryPassUsed !== expectedRecovery) {
    disagreements.push(
      `provenance.recoveryPassUsed ${String(provenance.recoveryPassUsed)} but passKind is ${diagnostic.passKind}`,
    );
  }

  if (disagreements.length > 0) {
    throw new CandidateAdapterError(
      "PROVENANCE_DISAGREES_WITH_CANDIDATE",
      disagreements.join("; "),
    );
  }
}

/**
 * Map one production diagnostic to the unfinalized evidence record.
 *
 * Production optionals become explicit `null`, and the three derived fields
 * (`rankingEligible`, `rankingScore`, `selected`) are computed here so the
 * canonical validator's invariants can check them rather than trust them.
 */
export function toCandidateEvidenceRecord(
  diagnostic: BrandCandidateDiagnostic,
  context: CandidateAdapterContext,
): Record<string, unknown> {
  if (!OPAQUE_ITEM_ID.test(context.opaqueItemId)) {
    throw new CandidateAdapterError(
      "MALFORMED_OPAQUE_ITEM_ID",
      `opaqueItemId must match ^item-\\d{4}$, received ${JSON.stringify(context.opaqueItemId)}`,
    );
  }
  if (
    !Number.isInteger(context.candidateOrdinal) ||
    context.candidateOrdinal < 0 ||
    context.candidateOrdinal >= context.completeCandidateArrayLength
  ) {
    throw new CandidateAdapterError(
      "ORDINAL_OUT_OF_RANGE",
      `candidateOrdinal ${context.candidateOrdinal} is not within [0, ${context.completeCandidateArrayLength})`,
    );
  }

  const filterChecks: BrandFilterCheck[] | undefined = diagnostic.filterChecks;
  const activeRejectionReasons: BrandFilterCheckName[] | undefined =
    diagnostic.activeRejectionReasons;
  if (filterChecks === undefined || activeRejectionReasons === undefined) {
    throw new CandidateAdapterError(
      "COMPLETE_DIAGNOSTICS_ABSENT",
      "filterChecks and activeRejectionReasons are required; the acquisition must call selectBrandObservationWithCompleteFilterDiagnostics, not the ordinary selector",
    );
  }

  assertProvenanceAgreement(diagnostic);

  const ranking = diagnostic.ranking ?? null;

  return {
    canonicalizationVersion: CANDIDATE_CANONICALIZATION_VERSION,
    opaqueItemId: context.opaqueItemId,
    candidateOrdinal: context.candidateOrdinal,
    completeCandidateArrayLength: context.completeCandidateArrayLength,
    rawText: diagnostic.rawText,
    cleanedValue: diagnostic.cleanedValue,
    confidence: diagnostic.confidence,
    ocrEvidenceScore: diagnostic.ocrEvidenceScore,
    ocrConfidence: { ...diagnostic.ocrConfidence },
    prominence: diagnostic.prominence,
    regionName: diagnostic.regionName,
    passId: diagnostic.passId,
    passKind: diagnostic.passKind,
    supportPassIds: [...diagnostic.supportPassIds],
    candidateProvenance: { ...diagnostic.candidateProvenance },
    assembly: diagnostic.assembly,
    lineIndexes: [...diagnostic.lineIndexes],
    kept: diagnostic.kept,
    filterReason: diagnostic.filterReason,
    decision: diagnostic.decision ?? null,
    score: diagnostic.score === undefined ? null : { ...diagnostic.score },
    ranking: ranking === null ? null : normalizeRanking(ranking),
    filterChecks: filterChecks.map((check) => ({ check: check.check, failed: check.failed })),
    activeRejectionReasons: [...activeRejectionReasons],
    rankingEligible: ranking !== null,
    rankingScore: ranking?.rankingScore ?? null,
    rankedPosition: context.rankedPosition,
    selected: diagnostic.decision === "selected",
  };
}

/**
 * `AnalyzerCandidateRanking` has two optional properties. The persisted record
 * carries all five keys so the canonical key set is stable across records.
 */
function normalizeRanking(
  ranking: NonNullable<BrandCandidateDiagnostic["ranking"]>,
): Record<string, unknown> {
  return {
    strategy: ranking.strategy,
    orderingMode: ranking.orderingMode,
    comparator: ranking.comparator.map((entry) => ({ ...entry })),
    rankingScore: ranking.rankingScore ?? null,
    scoreFactors:
      ranking.scoreFactors === undefined ? null : ranking.scoreFactors.map((f) => ({ ...f })),
  };
}

/** Adapt and finalize in one step: the sanctioned Stage 2 call. */
export function finalizeProductionCandidate(
  diagnostic: BrandCandidateDiagnostic,
  context: CandidateAdapterContext,
): CandidateEvidenceRecord {
  return finalizeCandidateRecord(toCandidateEvidenceRecord(diagnostic, context));
}

/**
 * Adapt and finalize a COMPLETE diagnostic array, assigning contiguous ordinals
 * from 0 and the ranked position from the whole array.
 */
export function finalizeProductionCandidateArray(
  candidates: BrandCandidateDiagnostic[],
  opaqueItemId: string,
): CandidateEvidenceRecord[] {
  const rankedOrder = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter((entry) => entry.candidate.ranking !== undefined)
    .sort(
      (a, b) =>
        (b.candidate.ranking?.rankingScore ?? 0) - (a.candidate.ranking?.rankingScore ?? 0) ||
        a.index - b.index,
    );
  const rankedPositionByIndex = new Map<number, number>(
    rankedOrder.map((entry, position) => [entry.index, position]),
  );

  return candidates.map((candidate, index) =>
    finalizeProductionCandidate(candidate, {
      opaqueItemId,
      candidateOrdinal: index,
      completeCandidateArrayLength: candidates.length,
      rankedPosition: rankedPositionByIndex.get(index) ?? null,
    }),
  );
}
