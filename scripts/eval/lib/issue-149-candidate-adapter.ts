/**
 * Issue #149 — the one public Brand acquisition API.
 *
 * Evaluation-only, and **NOT non-OCR**: `acquireProductionBrandEvidence` calls
 * `extractLabelEvidenceDetailed`, which runs the recognizer. In Stage 2 this
 * module is what performs the governed OCR. Only the focused tests are non-OCR,
 * and they are non-OCR because they mock the extractor.
 *
 * **The Stage 2 acquisition runner must use this module rather than
 * reimplementing any part of it.** A second mapping could drift from production's
 * shape without any test noticing — which is exactly how the six-key
 * `ocrConfidence` schema survived Amendment 5.
 *
 * It lives outside `src/fixtures/**` for the same reason the canonical helper
 * does. It imports production TYPES and **three runtime functions**:
 * `extractLabelEvidenceDetailed`, so the acquisition owns the OCR invocation and
 * no caller supplies evidence; `compareCandidateRanking`, so ranked order is
 * production's own comparator rather than a reimplementation; and
 * `selectBrandObservationWithCompleteFilterDiagnostics`, so the diagnostic
 * selection is derived HERE. The invocation contract permits those modules on the
 * acquisition route.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join as pathJoin } from "node:path";
import { types as nodeTypes } from "node:util";

import { extractLabelEvidenceDetailed, type ExtractionDebug } from "@/pipeline/extractor/extractor";
import type { ExtractionError, ExtractionInput } from "@/pipeline/extractor/extractor.types";
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
  assertRegionOcrResultRecord,
  canonicalize,
  finalizeCandidateRecord,
  semanticOrderedPassArrayFingerprint,
  sha256Bytes,
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
      | "MALFORMED_ARTIFACT_REF"
      | "MALFORMED_EXTRACTION_INPUT"
      | "EXTRACTION_INPUT_IDENTITY_MISMATCH"
      | "SEALED_EVIDENCE_INCOMPLETE"
      | "SEALED_EVIDENCE_WRITE_UNVERIFIED"
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
 * Internal. Derives the Brand evidence from a debug object the module produced
 * itself. **Not exported**: an `ExtractionDebug` parameter is caller-supplied
 * data, and a helper can construct a coherent one — filtered or reordered passes
 * plus matching primary and final selections — that this function would accept.
 * Only `acquireProductionBrandEvidence` may call it, with a debug object it
 * obtained privately.
 */
function deriveBrandEvidenceFromDebug(
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

// ---------------------------------------------------------------------------
// The one public acquisition API
// ---------------------------------------------------------------------------

/**
 * The exact own properties an acquisition `ExtractionInput` may carry.
 *
 * `sellerRegionTargets` and `diagnostics` are absent by contract: the seller
 * region pass is not exercised, and a diagnostics trace would give the caller a
 * channel into the extractor.
 */
const ACQUISITION_INPUT_KEYS = [
  "imageBytes",
  "artifactRef",
  "derivativeSha256",
  "processedAt",
  "extractionAdapterId",
  "extractionAdapterVersion",
  "ocrEngine",
  "parserId",
  "parserVersion",
] as const;

const OCR_ENGINE_KEYS = ["kind", "engineId", "engineVersion", "modelId"] as const;

/**
 * The frozen incumbent identities, copied as literals from
 * `incumbent-configuration-freeze.json#extractionInputIdentities`. A test asserts
 * they still equal that artifact, so a drift is a test failure rather than a
 * silent divergence.
 */
const FROZEN_IDENTITIES = {
  processedAt: "2026-07-12T00:00:00Z",
  extractionAdapterId: "local-two-field-extractor",
  extractionAdapterVersion: "1.0.0",
  parserId: "wine-alcohol-parse",
  parserVersion: "1.0.0",
  ocrEngine: {
    kind: "ocr",
    engineId: "tesseract.js",
    engineVersion: "7.0.0",
    modelId: "eng",
  },
} as const;

const LOWER_HEX_64 = /^[0-9a-f]{64}$/;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

/**
 * Capture the EXACT own data-property values of a caller-supplied object, once.
 *
 * Three distinct problems are closed here, all of which survived the previous
 * `Object.keys` validation:
 *
 * - `Object.keys` returns only ENUMERABLE STRING keys. A non-enumerable own
 *   property and a symbol-keyed own property both passed the "closed key set"
 *   check while being present on the object. `Reflect.ownKeys` returns every own
 *   key of both kinds, so the claimed exact key set is now actually checked.
 * - A `Proxy` whose target is a plain object satisfies `isPlainObject` and can
 *   present ordinary data descriptors, then return a DIFFERENT value from a `get`
 *   trap on each subsequent read. Descriptor inspection cannot see that;
 *   `util.types.isProxy` is Node's authoritative test and is used instead.
 * - Even with data descriptors, reading `raw.artifactRef` at validation time and
 *   again at copy time is two reads. Every value is captured ONCE here, and the
 *   caller's object is never read again.
 */
function captureOwnDataValues(
  target: object,
  expected: readonly string[],
  at: string,
): Record<string, unknown> {
  if (nodeTypes.isProxy(target)) {
    throw new CandidateAdapterError(
      "MALFORMED_EXTRACTION_INPUT",
      `${at} is a Proxy; a get trap can return a different value on each read, so its descriptors are not evidence of its values`,
    );
  }

  const ownKeys = Reflect.ownKeys(target);
  const symbolKeys = ownKeys.filter((key): key is symbol => typeof key === "symbol");
  if (symbolKeys.length > 0) {
    throw new CandidateAdapterError(
      "MALFORMED_EXTRACTION_INPUT",
      `${at} carries ${symbolKeys.length} symbol-keyed own propert${symbolKeys.length === 1 ? "y" : "ies"}; the acquisition key set is closed and string-only`,
    );
  }

  // Every own key, enumerable or not. An unexpected non-enumerable property is
  // as fatal as an unexpected enumerable one.
  const actual = ownKeys as string[];
  const problems = [
    ...expected.filter((key) => !actual.includes(key)).map((key) => `missing ${key}`),
    ...actual.filter((key) => !expected.includes(key)).map((key) => `unexpected ${key}`),
  ];
  if (problems.length > 0) {
    throw new CandidateAdapterError("MALFORMED_EXTRACTION_INPUT", `${at}: ${problems.join("; ")}`);
  }

  const captured: Record<string, unknown> = {};
  for (const key of expected) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    if (descriptor === undefined) {
      throw new CandidateAdapterError(
        "MALFORMED_EXTRACTION_INPUT",
        `${at}.${key} has no own property descriptor`,
      );
    }
    if (descriptor.get !== undefined || descriptor.set !== undefined) {
      throw new CandidateAdapterError(
        "MALFORMED_EXTRACTION_INPUT",
        `${at}.${key} is an accessor property; a getter can return a different value on each read`,
      );
    }
    // The one and only read of this property.
    captured[key] = descriptor.value;
  }
  return captured;
}

/**
 * Synchronously validate the caller's input and copy it into a private snapshot.
 *
 * `ExtractionInput` is an ordinary mutable interface, including mutable
 * `imageBytes` and a nested `ocrEngine`. An earlier boundary validated
 * `artifactRef`, passed the caller's object into the asynchronous extractor, and
 * re-read `artifactRef` afterwards for candidate identity — so this was possible:
 *
 * ```ts
 * const promise = acquireProductionBrandEvidence(input);
 * input.artifactRef = "item-0042";
 * await promise;
 * ```
 *
 * Everything here happens **before the first await**, and everything afterwards
 * uses only the snapshot.
 *
 * ## What is and is not frozen — stated exactly
 *
 * - the top-level snapshot object IS frozen;
 * - `ocrEngine` IS frozen;
 * - `imageBytes` is a **private copied `Uint8Array` with no caller-held alias**.
 *   It is NOT frozen, and describing it as frozen would be false: a nonempty
 *   typed array cannot be frozen in current JavaScript runtimes —
 *   `Object.freeze` on one throws, because its indexed elements are
 *   non-configurable and cannot be made non-writable. Isolation, not
 *   immutability, is what protects those bytes, and isolation is sufficient:
 *   nothing outside this module holds a reference to that buffer.
 *
 * The snapshot is therefore **not** "recursively frozen", and this module does
 * not claim it is.
 */
function snapshotAcquisitionInput(input: ExtractionInput): ExtractionInput {
  if (!isPlainObject(input)) {
    throw new CandidateAdapterError(
      "MALFORMED_EXTRACTION_INPUT",
      "the acquisition input must be a plain object",
    );
  }

  // One capture. `raw` holds VALUES, not a live view of the caller's object.
  const raw = captureOwnDataValues(input, ACQUISITION_INPUT_KEYS, "input");

  if (typeof raw.artifactRef !== "string" || !OPAQUE_ITEM_ID.test(raw.artifactRef)) {
    throw new CandidateAdapterError(
      "MALFORMED_ARTIFACT_REF",
      `input.artifactRef must match ^item-\\d{4}$, received ${JSON.stringify(raw.artifactRef)}`,
    );
  }
  if (typeof raw.derivativeSha256 !== "string" || !LOWER_HEX_64.test(raw.derivativeSha256)) {
    throw new CandidateAdapterError(
      "MALFORMED_EXTRACTION_INPUT",
      `input.derivativeSha256 must be lowercase 64-hex, received ${JSON.stringify(raw.derivativeSha256)}`,
    );
  }
  if (!(raw.imageBytes instanceof Uint8Array)) {
    throw new CandidateAdapterError(
      "MALFORMED_EXTRACTION_INPUT",
      "input.imageBytes must be a Uint8Array",
    );
  }
  for (const key of [
    "processedAt",
    "extractionAdapterId",
    "extractionAdapterVersion",
    "parserId",
    "parserVersion",
  ] as const) {
    if (typeof raw[key] !== "string") {
      throw new CandidateAdapterError(
        "MALFORMED_EXTRACTION_INPUT",
        `input.${key} must be a string, received ${JSON.stringify(raw[key])}`,
      );
    }
  }

  if (!isPlainObject(raw.ocrEngine)) {
    throw new CandidateAdapterError(
      "MALFORMED_EXTRACTION_INPUT",
      "input.ocrEngine must be a plain object",
    );
  }
  const engine = captureOwnDataValues(raw.ocrEngine, OCR_ENGINE_KEYS, "input.ocrEngine");
  for (const key of OCR_ENGINE_KEYS) {
    if (typeof engine[key] !== "string") {
      throw new CandidateAdapterError(
        "MALFORMED_EXTRACTION_INPUT",
        `input.ocrEngine.${key} must be a string, received ${JSON.stringify(engine[key])}`,
      );
    }
  }

  // The frozen incumbent identities. A run whose provenance differs from the
  // preregistered one is not an observation of the incumbent.
  const identityMismatches: string[] = [];
  for (const key of [
    "processedAt",
    "extractionAdapterId",
    "extractionAdapterVersion",
    "parserId",
    "parserVersion",
  ] as const) {
    if (raw[key] !== FROZEN_IDENTITIES[key]) {
      identityMismatches.push(
        `${key} is ${JSON.stringify(raw[key])}, frozen value is ${JSON.stringify(FROZEN_IDENTITIES[key])}`,
      );
    }
  }
  for (const key of OCR_ENGINE_KEYS) {
    if (engine[key] !== FROZEN_IDENTITIES.ocrEngine[key]) {
      identityMismatches.push(
        `ocrEngine.${key} is ${JSON.stringify(engine[key])}, frozen value is ${JSON.stringify(FROZEN_IDENTITIES.ocrEngine[key])}`,
      );
    }
  }
  if (identityMismatches.length > 0) {
    throw new CandidateAdapterError(
      "EXTRACTION_INPUT_IDENTITY_MISMATCH",
      identityMismatches.join("; "),
    );
  }

  // Built entirely from the captured values. `imageBytes` is copied into a NEW
  // Uint8Array, so a later mutation of the caller's buffer cannot reach the
  // extractor and nothing outside this module aliases the copy.
  const snapshot = {
    imageBytes: Uint8Array.from(raw.imageBytes),
    artifactRef: raw.artifactRef,
    derivativeSha256: raw.derivativeSha256,
    processedAt: raw.processedAt as string,
    extractionAdapterId: raw.extractionAdapterId as string,
    extractionAdapterVersion: raw.extractionAdapterVersion as string,
    ocrEngine: Object.freeze({
      kind: engine.kind as string,
      engineId: engine.engineId as string,
      engineVersion: engine.engineVersion as string,
      modelId: engine.modelId as string,
    }),
    parserId: raw.parserId as string,
    parserVersion: raw.parserVersion as string,
  };
  return Object.freeze(snapshot) as unknown as ExtractionInput;
}

// ---------------------------------------------------------------------------
// The sealed item-evidence package
// ---------------------------------------------------------------------------

/**
 * ## Why the public API returns bytes and not objects
 *
 * Owning the extractor call closed the INPUT side. The output side was still
 * open: the boundary returned the extractor's own `DetailedExtractionResult`,
 * the live `FieldSelection` and a mutable candidate array, and left serialization
 * to the runner. The source analyzer could catch a write that kept a recognizable
 * property chain, but it could not catch either of these:
 *
 * ```ts
 * const passes = evidence.value.detailed.debug.passes;  // now a bare identifier
 * passes.splice(0, 1);
 *
 * const head = evidence.value.detailed.debug.passes.slice(0, 1);  // no mutation
 * persistPasses(head);                                            // truncated
 * ```
 *
 * The second needs no mutation at all. A projection — `slice`, `filter`, `map`,
 * `concat`, a spread into a new array — produces incomplete evidence while
 * leaving every original object untouched, and no adjacent-pair or alias
 * analysis of source text can establish data lineage through it.
 *
 * That is the same ownership defect as before, one step further out:
 *
 * ```
 * candidate array -> FieldSelection -> ExtractionDebug -> ExtractionInput -> returned evidence
 * ```
 *
 * So the alternative is deleted rather than prohibited. Serialization happens
 * HERE, over the complete populations, before anything is returned. What the
 * runner receives is a frozen list of file descriptors carrying exact bytes and
 * their digests. There is nothing left to filter, project, reorder or rebuild:
 * the only faithful action on a sealed package is to write all of it.
 */
export interface SealedEvidenceFile {
  /** Governed path RELATIVE TO THE RUN DIRECTORY (`raw/<run>/`). */
  readonly path: string;
  /** Exact byte length of the sealed content. */
  readonly byteLength: number;
  /** SHA-256 over exactly those bytes. */
  readonly sha256: string;
  /**
   * A FRESH COPY of the sealed bytes on every read. The sealed buffer itself is
   * module-private and is never handed out, so mutating what this returns cannot
   * change what gets written or what `sha256` covers.
   */
  readonly bytes: Uint8Array;
}

export interface SealedItemEvidence {
  readonly itemId: string;
  readonly outcome: "extracted" | "extraction-failed";
  readonly files: readonly SealedEvidenceFile[];
  readonly fileCount: number;
  readonly totalBytes: number;
  /** SHA-256 over the ordered (path, byteLength, sha256) entries. */
  readonly aggregateSha256: string;
  /** Present only when `outcome` is `extraction-failed`. A frozen copy. */
  readonly failure?: {
    readonly code: string;
    readonly message: string;
    readonly issues: readonly string[];
  };
}

/** The item files a successful extraction seals, in fixed order. */
export const SEALED_SUCCESS_FILE_SUFFIXES = [
  ".passes.json",
  ".words.jsonl",
  ".lines.jsonl",
  ".candidates.jsonl",
  ".selection.json",
  ".counts.json",
] as const;

/** The one file a failed extraction seals. No partial debug is ever synthesised. */
export const SEALED_FAILURE_FILE_SUFFIXES = [".failure.json"] as const;

/** Canonical JSON plus a terminal newline. Bytes, from here on. */
const canonicalLine = (value: unknown): string => `${canonicalize(value)}\n`;

function sealFile(path: string, text: string): SealedEvidenceFile {
  const sealed = Uint8Array.from(Buffer.from(text, "utf8"));
  const descriptor = {
    path,
    byteLength: sealed.byteLength,
    sha256: sha256Bytes(sealed),
    get bytes(): Uint8Array {
      // A copy, every time. Handing out `sealed` would alias it.
      return Uint8Array.from(sealed);
    },
  };
  return Object.freeze(descriptor);
}

function sealPackage(
  itemId: string,
  outcome: SealedItemEvidence["outcome"],
  files: SealedEvidenceFile[],
  failure?: SealedItemEvidence["failure"],
): SealedItemEvidence {
  const expected =
    outcome === "extracted" ? SEALED_SUCCESS_FILE_SUFFIXES : SEALED_FAILURE_FILE_SUFFIXES;
  const expectedPaths = expected.map((suffix) => `${itemId}${suffix}`);
  const actualPaths = files.map((file) => file.path);

  // Dropped or duplicated files are caught HERE, before return — a package that
  // is missing a file is not a sealed package, and the runner has no way to
  // notice on its own because it never sees the populations.
  if (
    actualPaths.length !== expectedPaths.length ||
    actualPaths.some((path, index) => path !== expectedPaths[index])
  ) {
    throw new CandidateAdapterError(
      "SEALED_EVIDENCE_INCOMPLETE",
      `sealed files ${JSON.stringify(actualPaths)} do not match the required ordered set ${JSON.stringify(expectedPaths)}`,
    );
  }
  if (new Set(actualPaths).size !== actualPaths.length) {
    throw new CandidateAdapterError(
      "SEALED_EVIDENCE_INCOMPLETE",
      `duplicate sealed path in ${JSON.stringify(actualPaths)}`,
    );
  }

  const aggregateSha256 = sha256Bytes(
    canonicalize(
      files.map((file) => ({ path: file.path, byteLength: file.byteLength, sha256: file.sha256 })),
    ),
  );

  return Object.freeze({
    itemId,
    outcome,
    files: Object.freeze(files.slice()),
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.byteLength, 0),
    aggregateSha256,
    ...(failure === undefined ? {} : { failure }),
  }) as SealedItemEvidence;
}

/**
 * Serialize the COMPLETE populations and seal them.
 *
 * Every array's order is fixed before serialization, and every record passes the
 * frozen schema validators, so an incomplete or reordered package cannot be
 * produced by this function at all.
 */
function sealSuccessfulItem(
  itemId: string,
  debug: ExtractionDebug,
  diagnosticSelection: FieldSelection,
  candidateRecords: CandidateEvidenceRecord[],
): SealedItemEvidence {
  const passes = debug.passes;
  passes.forEach((pass, index) => assertRegionOcrResultRecord(pass, `debug.passes[${index}]`));

  const passesText = canonicalLine(
    passes.map((pass, index) => ({
      opaqueItemId: itemId,
      passOrdinal: index,
      ...(pass as unknown as Record<string, unknown>),
    })),
  );

  let wordOrdinal = 0;
  const wordLines: string[] = [];
  passes.forEach((pass, passIndex) => {
    const record = pass as unknown as { passId: string; words: unknown[] };
    record.words.forEach((word, wordIndex) => {
      wordLines.push(
        canonicalLine({
          opaqueItemId: itemId,
          passOrdinal: passIndex,
          passId: record.passId,
          originalWordOrder: wordIndex,
          globalWordOrdinal: wordOrdinal++,
          ...(word as Record<string, unknown>),
        }),
      );
    });
  });

  const lines = diagnosticSelection.brandDiagnostics?.lines ?? [];
  const lineLines = lines.map((line, index) =>
    canonicalLine({
      opaqueItemId: itemId,
      lineOrdinal: index,
      ...(line as unknown as Record<string, unknown>),
    }),
  );

  const candidateLines = candidateRecords.map((record) => canonicalLine(record));

  const selectionText = canonicalLine({ opaqueItemId: itemId, selection: diagnosticSelection });

  const countsText = canonicalLine({
    opaqueItemId: itemId,
    canonicalizationVersion: CANDIDATE_CANONICALIZATION_VERSION,
    passCount: passes.length,
    wordCount: wordLines.length,
    perPassWordCounts: passes.map((pass) => (pass as unknown as { words: unknown[] }).words.length),
    lineCount: lineLines.length,
    candidateCount: candidateLines.length,
    rankedCount: candidateRecords.filter((record) => record.rankedPosition !== null).length,
    selectedCount: candidateRecords.filter((record) => record.selected).length,
    semanticOrderedPassArrayFingerprint: semanticOrderedPassArrayFingerprint(passes),
    stableCandidateIds: candidateRecords.map((record) => record.stableCandidateId),
  });

  return sealPackage(itemId, "extracted", [
    sealFile(`${itemId}.passes.json`, passesText),
    sealFile(`${itemId}.words.jsonl`, wordLines.join("")),
    sealFile(`${itemId}.lines.jsonl`, lineLines.join("")),
    sealFile(`${itemId}.candidates.jsonl`, candidateLines.join("")),
    sealFile(`${itemId}.selection.json`, selectionText),
    sealFile(`${itemId}.counts.json`, countsText),
  ]);
}

/**
 * Seal the governed failure evidence. No partial debug object is synthesised: a
 * failed item has no pass array, no lines and no candidates, and none is
 * fabricated. There is no retry — the extractor was called once.
 */
function sealFailedItem(itemId: string, error: ExtractionError): SealedItemEvidence {
  const issues = Array.isArray((error as unknown as { issues?: unknown[] }).issues)
    ? (error as unknown as { issues: unknown[] }).issues.map((issue) => String(issue))
    : [];
  const failure = Object.freeze({
    code: String((error as unknown as { code?: unknown }).code),
    message: String((error as unknown as { message?: unknown }).message),
    issues: Object.freeze(issues) as readonly string[],
  });
  const text = canonicalLine({
    opaqueItemId: itemId,
    outcome: "extraction-failed",
    errorCode: failure.code,
    errorMessage: failure.message,
    issues: [...failure.issues],
    retried: false,
    debugSynthesised: false,
  });
  return sealPackage(
    itemId,
    "extraction-failed",
    [sealFile(`${itemId}.failure.json`, text)],
    failure,
  );
}

/**
 * Write a COMPLETE sealed package and verify it by reading the bytes back.
 *
 * It takes the whole package. There is deliberately no file-subset parameter:
 * a writer that accepts a caller-chosen subset reintroduces exactly the
 * projection this boundary exists to remove.
 */
export function writeSealedEvidencePackage(
  sealed: SealedItemEvidence,
  options: { directory: string },
): {
  itemId: string;
  directory: string;
  filesWritten: number;
  totalBytes: number;
  aggregateSha256: string;
} {
  if (sealed.fileCount !== sealed.files.length) {
    throw new CandidateAdapterError(
      "SEALED_EVIDENCE_INCOMPLETE",
      `fileCount ${sealed.fileCount} disagrees with files.length ${sealed.files.length}`,
    );
  }
  mkdirSync(options.directory, { recursive: true });
  for (const file of sealed.files) {
    const target = pathJoin(options.directory, file.path);
    writeFileSync(target, file.bytes);
    const readBack = readFileSync(target);
    if (readBack.byteLength !== file.byteLength || sha256Bytes(readBack) !== file.sha256) {
      throw new CandidateAdapterError(
        "SEALED_EVIDENCE_WRITE_UNVERIFIED",
        `${file.path} read back as ${readBack.byteLength} bytes / ${sha256Bytes(readBack)}, expected ${file.byteLength} / ${file.sha256}`,
      );
    }
  }
  return {
    itemId: sealed.itemId,
    directory: options.directory,
    filesWritten: sealed.files.length,
    totalBytes: sealed.totalBytes,
    aggregateSha256: sealed.aggregateSha256,
  };
}

export async function acquireProductionBrandEvidence(
  input: ExtractionInput,
): Promise<SealedItemEvidence> {
  // Synchronously, before the first await: validate and copy. Nothing after this
  // line reads the caller's object.
  const snapshot = snapshotAcquisitionInput(input);
  const itemId = snapshot.artifactRef;

  // Exactly once, with the snapshot. There is no retry path: a failed item
  // produces the preregistered typed failure and is never re-run.
  const detailed = await extractLabelEvidenceDetailed(snapshot);
  if (!detailed.ok) {
    return sealFailedItem(itemId, detailed.error);
  }

  const { diagnosticSelection, candidateRecords } = deriveBrandEvidenceFromDebug(
    detailed.value.debug,
    itemId,
  );

  // Serialized and sealed HERE. No mutable DetailedExtractionResult,
  // ExtractionDebug, FieldSelection, candidate array or pass array leaves this
  // function.
  return sealSuccessfulItem(itemId, detailed.value.debug, diagnosticSelection, candidateRecords);
}
