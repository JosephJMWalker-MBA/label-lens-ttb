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
import {
  compareCandidateRanking,
  type BrandCandidateDiagnostic,
  type BrandFilterCheck,
  type BrandFilterCheckName,
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
      | "PROVENANCE_DISAGREES_WITH_CANDIDATE"
      | "RANKED_MEMBERSHIP_INCONSISTENT"
      | "RANKED_POSITION_PARITY_FAILURE",
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
 * `compareCandidateRanking` is exported by production and reads **only**
 * `candidate.ranking` — verified against the function body at the frozen base and
 * asserted by `issue-149-production-candidate-compatibility.test.ts`. A minimal
 * structural wrapper is therefore faithful, and is used in preference to
 * reimplementing the comparator.
 */
type RankingCarrier = Parameters<typeof compareCandidateRanking>[0];
const forComparator = (diagnostic: BrandCandidateDiagnostic): RankingCarrier =>
  ({ ranking: diagnostic.ranking }) as unknown as RankingCarrier;

/**
 * Adapt and finalize a COMPLETE diagnostic array.
 *
 * ## Final ranked membership is `decision`, not `ranking`
 *
 * Production assigns `ranking` semantics to **every scored candidate**, then
 * reduces them — `dedupeBestCandidates(bestFamilyCandidates(scored))` — sorts the
 * survivors with `compareCandidateRanking`, and assigns a `decision` **only to
 * candidates in that final ranked array** (`field-selection.ts:2556-2578`).
 *
 * So `ranking !== undefined` means "ranking semantics were computed" and
 * `decision !== undefined` means "this candidate survived into the final ranked
 * list". A candidate can have the first without the second, because family
 * reduction or normalized-value deduplication removed it.
 *
 * An earlier revision of this adapter took every diagnostic carrying a `ranking`
 * and sorted them by `rankingScore` descending. That was wrong twice over: it
 * gave a fake ranked position to candidates production had eliminated, and it
 * ignored the ordered comparator, which can prioritise score eligibility,
 * prominence, OCR evidence and normalized value under three different ordering
 * modes.
 */
export function finalizeProductionCandidateArray(
  candidates: BrandCandidateDiagnostic[],
  opaqueItemId: string,
): CandidateEvidenceRecord[] {
  const rankedMembers = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter((entry) => entry.candidate.decision !== undefined);

  for (const member of rankedMembers) {
    if (member.candidate.ranking === undefined) {
      throw new CandidateAdapterError(
        "RANKED_MEMBERSHIP_INCONSISTENT",
        `candidate ${member.index} carries decision ${String(member.candidate.decision)} but no ranking; production ranks only scored candidates`,
      );
    }
  }

  // Production's own comparator, with the original diagnostic-array order as the
  // stable tie-break so a comparator tie can never reorder the evidence.
  const sorted = [...rankedMembers].sort((left, right) => {
    const compared = compareCandidateRanking(
      forComparator(left.candidate),
      forComparator(right.candidate),
    );
    return compared !== 0 ? compared : left.index - right.index;
  });

  const positionByIndex = new Map<number, number>(
    sorted.map((entry, position) => [entry.index, position]),
  );

  if (sorted.length > 0) {
    const selected = sorted.filter((entry) => entry.candidate.decision === "selected");
    if (selected.length !== 1) {
      throw new CandidateAdapterError(
        "RANKED_POSITION_PARITY_FAILURE",
        `a non-empty ranked list must contain exactly one selected candidate, found ${selected.length}`,
      );
    }
    if (positionByIndex.get(selected[0].index) !== 0) {
      throw new CandidateAdapterError(
        "RANKED_POSITION_PARITY_FAILURE",
        `the selected candidate is at ranked position ${String(positionByIndex.get(selected[0].index))}, but production's selected candidate is ranked[0]`,
      );
    }
  }

  const finalized = candidates.map((candidate, index) =>
    finalizeProductionCandidate(candidate, {
      opaqueItemId,
      candidateOrdinal: index,
      completeCandidateArrayLength: candidates.length,
      rankedPosition: positionByIndex.get(index) ?? null,
    }),
  );

  assertRankedArrayInvariants(finalized);
  return finalized;
}

/**
 * Invariants that only exist across a whole array. A single-record validator
 * cannot prove uniqueness or contiguity, and pretending otherwise would be the
 * same class of overclaim as a guard that restates what it guards.
 */
export function assertRankedArrayInvariants(records: CandidateEvidenceRecord[]): void {
  const positions = records
    .map((record) => record.rankedPosition)
    .filter((position): position is number => position !== null);

  if (new Set(positions).size !== positions.length) {
    throw new CandidateAdapterError(
      "RANKED_POSITION_PARITY_FAILURE",
      `ranked positions are not unique: ${JSON.stringify(positions)}`,
    );
  }
  const expected = Array.from({ length: positions.length }, (_, index) => index);
  if ([...positions].sort((a, b) => a - b).join(",") !== expected.join(",")) {
    throw new CandidateAdapterError(
      "RANKED_POSITION_PARITY_FAILURE",
      `ranked positions are not contiguous from 0: ${JSON.stringify([...positions].sort((a, b) => a - b))}`,
    );
  }

  const selected = records.filter((record) => record.selected);
  if (selected.length > 1) {
    throw new CandidateAdapterError(
      "RANKED_POSITION_PARITY_FAILURE",
      `at most one candidate may be selected, found ${selected.length}`,
    );
  }
  if (positions.length > 0 && selected.length !== 1) {
    throw new CandidateAdapterError(
      "RANKED_POSITION_PARITY_FAILURE",
      `a non-empty ranked set requires exactly one selected candidate, found ${selected.length}`,
    );
  }
  if (selected.length === 1 && selected[0].rankedPosition !== 0) {
    throw new CandidateAdapterError(
      "RANKED_POSITION_PARITY_FAILURE",
      `the selected candidate is at position ${String(selected[0].rankedPosition)}, expected 0`,
    );
  }
}
