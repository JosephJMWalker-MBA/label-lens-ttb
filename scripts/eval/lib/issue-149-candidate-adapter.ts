/**
 * Issue #149 — the one public Brand evidence API.
 *
 * Evaluation-only and non-OCR. **The Stage 2 acquisition runner must use this
 * module rather than reimplementing the mapping.** A second mapping could drift
 * from production's shape without any test noticing — which is exactly how the
 * six-key `ocrConfidence` schema survived Amendment 5.
 *
 * It lives outside `src/fixtures/**` for the same reason the canonical helper
 * does. It imports production TYPES and **two runtime functions**:
 * `compareCandidateRanking`, so ranked order is production's own comparator
 * rather than a reimplementation, and
 * `selectBrandObservationWithCompleteFilterDiagnostics`, so the diagnostic
 * selection is derived HERE and never handed in by a caller. The invocation
 * contract permits that module on the acquisition route.
 */
import type { ExtractionDebug } from "@/pipeline/extractor/extractor";
import {
  compareCandidateRanking,
  selectBrandObservationWithCompleteFilterDiagnostics,
  type BrandCandidateDiagnostic,
  type BrandFilterCheck,
  type BrandFilterCheckName,
  type FieldSelection,
} from "@/pipeline/extractor/field-selection";

import {
  CANDIDATE_CANONICALIZATION_VERSION,
  type CandidateEvidenceRecord,
  canonicalize,
  finalizeCandidateRecord,
} from "./issue-149-evidence-canonical";

export class CandidateAdapterError extends Error {
  constructor(
    readonly code:
      | "COMPLETE_DIAGNOSTICS_ABSENT"
      | "MALFORMED_OPAQUE_ITEM_ID"
      | "ORDINAL_OUT_OF_RANGE"
      | "PROVENANCE_DISAGREES_WITH_CANDIDATE"
      | "CANDIDATE_EVIDENCE_TRUNCATED"
      | "RANKED_MEMBERSHIP_INCONSISTENT"
      | "RANKED_POSITION_PARITY_FAILURE"
      | "DEBUG_PASSES_ABSENT"
      | "BRAND_DIAGNOSTIC_SELECTION_PARITY_FAILURE",
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = "CandidateAdapterError";
  }
}

/**
 * Internal. Not exported: every field is derived from the complete selection, and
 * a caller-supplied `rankedPosition` is exactly the bypass this module exists to
 * prevent.
 */
interface CandidateAdapterContext {
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
function toCandidateEvidenceRecord(
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

/** Adapt and finalize one candidate. Internal: positions come from the array. */
function finalizeProductionCandidate(
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
 * Adapt and finalize the COMPLETE diagnostic candidate population.
 *
 * Takes the whole `FieldSelection` that
 * `selectBrandObservationWithCompleteFilterDiagnostics` returned, and reads the
 * candidates from `brandDiagnostics.candidates` itself. An earlier signature took
 * a bare array, which let a caller hand over a filtered or truncated population
 * while technically calling the approved function — and the workflow named the
 * wrong property (`diagnosticSelection.candidates`) besides.
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
function finalizeProductionCandidateArray(
  diagnosticSelection: FieldSelection,
  opaqueItemId: string,
): CandidateEvidenceRecord[] {
  // Validated first: an empty candidate population would otherwise never reach
  // the per-record check, and a malformed opaque id would pass silently.
  if (!OPAQUE_ITEM_ID.test(opaqueItemId)) {
    throw new CandidateAdapterError(
      "MALFORMED_OPAQUE_ITEM_ID",
      `opaqueItemId must match ^item-\\d{4}$, received ${JSON.stringify(opaqueItemId)}`,
    );
  }

  // The candidate population comes from the selection itself, never from a
  // separately supplied array. A bare-array parameter would let a runner pass a
  // filtered or truncated population while technically calling this function.
  const diagnostics = diagnosticSelection?.brandDiagnostics;
  if (diagnostics === undefined || diagnostics === null) {
    throw new CandidateAdapterError(
      "COMPLETE_DIAGNOSTICS_ABSENT",
      "the selection carries no brandDiagnostics; the acquisition must call selectBrandObservationWithCompleteFilterDiagnostics",
    );
  }
  if (!Array.isArray(diagnostics.candidates)) {
    throw new CandidateAdapterError(
      "COMPLETE_DIAGNOSTICS_ABSENT",
      "brandDiagnostics.candidates is not an array",
    );
  }
  const candidates = diagnostics.candidates;

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
    if (!member.candidate.kept) {
      throw new CandidateAdapterError(
        "RANKED_MEMBERSHIP_INCONSISTENT",
        `candidate ${member.index} carries a decision but is not kept; production ranks only kept candidates`,
      );
    }
  }

  // The global relation the per-record schema cannot see. Production always
  // builds a non-empty ranked list and assigns one selected decision whenever
  // kept candidates exist, so an entire kept population losing every decision
  // must halt rather than pass as "all deduplicated".
  const anyKept = candidates.some((candidate) => candidate.kept);
  if (anyKept !== rankedMembers.length > 0) {
    throw new CandidateAdapterError(
      "RANKED_MEMBERSHIP_INCONSISTENT",
      anyKept
        ? `${candidates.filter((c) => c.kept).length} kept candidate(s) but no final ranked member; production always ranks at least one survivor`
        : `no kept candidate but ${rankedMembers.length} decision-bearing candidate(s)`,
    );
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
      // The ordinal IS the original diagnostic-array index.
      candidateOrdinal: index,
      completeCandidateArrayLength: candidates.length,
      rankedPosition: positionByIndex.get(index) ?? null,
    }),
  );

  if (finalized.length !== candidates.length) {
    throw new CandidateAdapterError(
      "CANDIDATE_EVIDENCE_TRUNCATED",
      `emitted ${finalized.length} records for ${candidates.length} diagnostic candidates`,
    );
  }

  assertRankedArrayInvariants(finalized);
  return finalized;
}

function assertRankedArrayInvariants(records: CandidateEvidenceRecord[]): void {
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

// ---------------------------------------------------------------------------
// The one public Brand evidence API
// ---------------------------------------------------------------------------

/** Fields the diagnostic selector adds and the ordinary selector does not. */
const COMPLETE_DIAGNOSTICS_ONLY_KEYS = ["filterChecks", "activeRejectionReasons"] as const;

/**
 * A structural deep clone with the two complete-diagnostics fields removed from
 * every Brand candidate. Everything else — `brandDiagnostics.lines`, every
 * observation field, every provenance field, every candidate field, and any
 * enumerable field added upstream later — survives into the comparison.
 */
function strippedForParity(selection: FieldSelection): unknown {
  const clone = structuredClone(selection) as {
    brandDiagnostics?: { candidates?: Array<Record<string, unknown>> };
  };
  for (const candidate of clone.brandDiagnostics?.candidates ?? []) {
    for (const key of COMPLETE_DIAGNOSTICS_ONLY_KEYS) delete candidate[key];
  }
  return clone;
}

/**
 * The ONLY public Brand evidence API.
 *
 * It takes the complete `ExtractionDebug` that `extractLabelEvidenceDetailed`
 * returned, and derives everything else itself.
 *
 * ## Why the input is `ExtractionDebug`
 *
 * Amendment 9 accepted a caller-supplied `FieldSelection` and read the candidate
 * population from `brandDiagnostics.candidates`. That removed the bare-array
 * route but left an equivalent one: a caller could filter the candidates, wrap
 * them in a freshly constructed `FieldSelection`, and pass that. This module's own
 * tests demonstrated the bypass.
 *
 * Taking `ExtractionDebug` closes it structurally. The adapter reconstructs the
 * exact production pass set, calls the complete-diagnostics selector itself,
 * asserts parity itself, and derives candidates only from the selection it
 * created — so there is no caller-reachable point at which the population can be
 * filtered, projected or replaced.
 *
 * The runner must never call `selectBrandObservationWithCompleteFilterDiagnostics`
 * directly, for the same reason.
 */
export function finalizeProductionBrandEvidence(
  debug: ExtractionDebug,
  opaqueItemId: string,
): { diagnosticSelection: FieldSelection; candidateRecords: CandidateEvidenceRecord[] } {
  if (!OPAQUE_ITEM_ID.test(opaqueItemId)) {
    throw new CandidateAdapterError(
      "MALFORMED_OPAQUE_ITEM_ID",
      `opaqueItemId must match ^item-\\d{4}$, received ${JSON.stringify(opaqueItemId)}`,
    );
  }
  if (!Array.isArray(debug?.passes) || debug.passes.length === 0) {
    throw new CandidateAdapterError(
      "DEBUG_PASSES_ABSENT",
      "debug.passes must be a non-empty ordered array",
    );
  }

  // Production's own branch, mirrored exactly (extractor.ts:99, 113): the primary
  // selection is retained when primary Brand is OBSERVED, otherwise selection
  // runs over the complete ordered pass array. Calling the diagnostic selector
  // over all passes unconditionally would produce a different candidate
  // population on every OBSERVED case.
  const brandPasses =
    debug.primarySelections?.brand?.observation?.state === "OBSERVED"
      ? [debug.passes[0]]
      : debug.passes;

  const diagnosticSelection = selectBrandObservationWithCompleteFilterDiagnostics(brandPasses);

  // Full-object canonical parity against the authority, before any evidence is
  // produced. `debug.finalSelections.brand` remains authoritative; the internally
  // derived selection supplies only the two complete-diagnostics fields.
  const derived = canonicalize(strippedForParity(diagnosticSelection));
  const authoritative = canonicalize(structuredClone(debug.finalSelections.brand));
  if (derived !== authoritative) {
    throw new CandidateAdapterError(
      "BRAND_DIAGNOSTIC_SELECTION_PARITY_FAILURE",
      "the internally derived diagnostic selection differs from debug.finalSelections.brand once only filterChecks and activeRejectionReasons are removed",
    );
  }

  const candidates = diagnosticSelection.brandDiagnostics?.candidates;
  if (!Array.isArray(candidates)) {
    throw new CandidateAdapterError(
      "COMPLETE_DIAGNOSTICS_ABSENT",
      "the internally derived selection carries no brandDiagnostics.candidates array",
    );
  }

  const candidateRecords = finalizeProductionCandidateArray(diagnosticSelection, opaqueItemId);
  if (candidateRecords.length !== candidates.length) {
    throw new CandidateAdapterError(
      "CANDIDATE_EVIDENCE_TRUNCATED",
      `emitted ${candidateRecords.length} records for ${candidates.length} internally derived diagnostic candidates`,
    );
  }

  return { diagnosticSelection, candidateRecords };
}
