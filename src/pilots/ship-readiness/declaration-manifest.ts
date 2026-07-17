/**
 * Ship-readiness run-002 declaration manifest — reusable schema, governed
 * normalization, deterministic canonicalization/digests, and fail-closed
 * validation for the declared-value verification workflow (Issues #124 / #127).
 *
 * Product boundary being tested (recorded and enforced by this layer):
 * a submitter or internal reviewer supplies a label image PLUS pre-existing
 * declared brand and declared alcohol values; Label Lens locates and presents
 * evidence so the reviewer can confirm, correct, abstain, or escalate. Label
 * Lens is NOT evaluated as autonomous brand/alcohol identification, and the
 * declarations are inputs — never machine truth and never adjudicated label
 * truth.
 *
 * This module carries no image bytes, no private paths, and no declared values.
 * It defines only the shape and the checks. Populated manifests, declared
 * values, and intake ledgers live in a gitignored local workspace and are never
 * committed. It has no dependency on the observation-quality (#114) or RDR-004
 * (#116) schemas.
 */

import { sha256Hex } from "@/pipeline/extractor/image-integrity";

export const DECLARATION_MANIFEST_SCHEMA_VERSION =
  "ship-readiness-declaration-manifest.v1" as const;

/** Freezing final eligible membership / running the pilot is never authorized here. */
export const eligibleMembershipFreezeAuthorized = false as const;
export const pilotExecutionAuthorized = false as const;

export const PRODUCT_BOUNDARY_STATEMENT =
  "A submitter or internal reviewer supplies a label image plus pre-existing declared brand and declared alcohol values. Label Lens locates and presents evidence on the artwork so the reviewer can confirm, correct, abstain, or escalate. Label Lens is not being evaluated as autonomous brand or alcohol identification." as const;

/** Source hierarchy (priority 1..4). Controlled transcription is the weakest. */
export const DECLARATION_SOURCE_TYPES = [
  "GENUINE_APPLICATION_PACKAGE",
  "OFFICIAL_PUBLIC_RECORD",
  "PRODUCER_CONTROLLED_RECORD",
  "CONTROLLED_INTAKE_TRANSCRIPTION",
] as const;
export type DeclarationSourceType = (typeof DECLARATION_SOURCE_TYPES)[number];

export const DECLARATION_ELIGIBILITY_STATES = [
  "PRIMARY_BLIND_CANDIDATE",
  "PENDING_SOURCE_VERIFICATION",
  "EXCLUDED",
  "NON_BLIND_OPERATIONAL",
] as const;
export type DeclarationEligibilityState = (typeof DECLARATION_ELIGIBILITY_STATES)[number];

export const DECLARATION_VALUE_STATES = [
  "PRESENT",
  "PENDING_INDEPENDENT_SOURCE",
  "DECLARED_ABSENT_IN_SOURCE",
  "UNREADABLE_IN_SOURCE",
] as const;
export type DeclarationValueState = (typeof DECLARATION_VALUE_STATES)[number];

export const DECLARATION_UNCERTAINTY_STATES = ["CERTAIN", "UNCERTAIN", "NOT_APPLICABLE"] as const;
export type DeclarationUncertaintyState = (typeof DECLARATION_UNCERTAINTY_STATES)[number];

export const MEDIA_TYPES = ["image/jpeg", "image/png"] as const;
export type DeclarationMediaType = (typeof MEDIA_TYPES)[number];

/**
 * Prior run-001 identities already exposed during deployment verification.
 * They can never enter the primary blinded stratum.
 */
export const EXPOSED_PRIOR_PILOT_IDENTITIES = [
  "pilot-wine-005",
  "pilot-wine-019",
  "pilot-wine-021",
] as const;

/** Keys that must never appear on an entry (they would carry run-001 outcomes or machine results). */
export const FORBIDDEN_ENTRY_KEYS = [
  "machineBrand",
  "machineAlcohol",
  "machineOutput",
  "ocrText",
  "ocr",
  "labelLensOutput",
  "precheckResult",
  "reviewerAnswer",
  "manualBaselineAnswer",
  "run001Answer",
  "run001Result",
  "adjudication",
  "adjudicatorNote",
  "score",
  "verdict",
  "expectedValue",
  "groundTruth",
  "liveVerificationResult",
] as const;

/** A declaration source reference must not point at any of these provenance sources. */
const FORBIDDEN_SOURCE_REF =
  /label[\s_-]?lens|precheck|\bocr\b|run[\s_-]?001|manual[\s_-]?baseline|adjudicat|review[\s_-]?order|machine[\s_-]?result|reviewer[\s_-]?answer|filename/i;

export interface DeclaredValue {
  readonly exactSourceText: string | null;
  readonly normalizedComparisonForm: string | null;
  readonly valueState: DeclarationValueState;
  readonly uncertaintyState: DeclarationUncertaintyState;
}

export interface DeclarationTiming {
  readonly intakeStartTimestamp: string | null;
  readonly intakeCompletionTimestamp: string | null;
  readonly sourceSearchMs: number | null;
  readonly transcriptionMs: number | null;
  readonly verificationMs: number | null;
  readonly totalIntakeBurdenMs: number | null;
}

export interface DeclarationRecordedBy {
  readonly identity: string;
  readonly role: string;
}

export interface DeclarationEntry {
  readonly runId: string;
  readonly run002CaseId: string;
  readonly sourceImageRef: string;
  readonly sourceImageSha256: string;
  readonly sourceMediaType: DeclarationMediaType;
  readonly sourceByteSize: number;
  readonly priorPilotIdentity: string | null;
  readonly declaredBrand: DeclaredValue;
  readonly declaredAlcohol: DeclaredValue;
  readonly declarationSourceType: DeclarationSourceType | null;
  readonly declarationSourceRef: string | null;
  readonly sourceAccessDate: string | null;
  readonly recordedBy: DeclarationRecordedBy | null;
  readonly recordedTimestamp: string | null;
  readonly transcriptionMethod: string | null;
  readonly independenceStatement: string | null;
  readonly timing: DeclarationTiming;
  readonly primaryBlindEligibilityState: DeclarationEligibilityState;
  readonly exclusionOrNonBlindReason: string | null;
  readonly schemaVersion: typeof DECLARATION_MANIFEST_SCHEMA_VERSION;
  readonly manifestEntryDigest: string | null;
}

export interface DeclarationManifest {
  readonly schemaVersion: typeof DECLARATION_MANIFEST_SCHEMA_VERSION;
  readonly runId: string;
  readonly productBoundaryStatement: string;
  /** Timestamps that must be AFTER every declaration; null while not yet generated. */
  readonly randomizationTimestamp: string | null;
  readonly reviewerExposureTimestamp: string | null;
  readonly machineExecutionTimestamp: string | null;
  readonly expectedCandidateCount: number;
  readonly preparedAt: string;
  readonly preparedBy: string;
  readonly entries: readonly DeclarationEntry[];
  readonly manifestDigest: string | null;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly issues: readonly string[];
}

// ---- Governed normalization (comparison forms; exact text is preserved) ----

/** Brand comparison form: case/space/punctuation-folded. Never mutates the source. */
export function normalizeDeclaredBrand(exact: string): string {
  return exact
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Alcohol comparison form: the numeric percent, if a supported statement is present. */
export function normalizeDeclaredAlcohol(exact: string): string {
  const match = exact.replace(",", ".").match(/(\d{1,2}(?:\.\d{1,2})?)\s*%?/);
  return match ? String(Number(match[1])) : "";
}

/** A supported wine alcohol declaration: a percent value with a %/ABV/vol marker. */
export function isSupportedDeclaredAlcohol(exact: string): boolean {
  const t = exact.toLowerCase();
  const hasNumber = /\d{1,2}(?:\.\d{1,2})?/.test(t.replace(",", "."));
  const hasMarker = /%|alc|abv|vol/.test(t);
  return hasNumber && hasMarker;
}

// ---- Deterministic canonicalization + digests -----------------------------

/** Stable, sorted-key JSON. Future contributors must keep serialization explicit. */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}

function digestOf(value: unknown): string {
  return sha256Hex(new TextEncoder().encode(canonicalize(value)));
}

function entryDigestProjection(entry: DeclarationEntry): Record<string, unknown> {
  const { manifestEntryDigest: _omit, ...rest } = entry;
  void _omit;
  return rest as unknown as Record<string, unknown>;
}

export function computeEntryDigest(entry: DeclarationEntry): string {
  return digestOf(entryDigestProjection(entry));
}

export function canonicalizeManifestForDigest(manifest: DeclarationManifest): string {
  return canonicalize({
    schemaVersion: manifest.schemaVersion,
    runId: manifest.runId,
    productBoundaryStatement: manifest.productBoundaryStatement,
    expectedCandidateCount: manifest.expectedCandidateCount,
    entries: [...manifest.entries]
      .sort((a, b) => a.run002CaseId.localeCompare(b.run002CaseId))
      .map(entryDigestProjection),
  });
}

export function computeManifestDigest(manifest: DeclarationManifest): string {
  return sha256Hex(new TextEncoder().encode(canonicalizeManifestForDigest(manifest)));
}

// ---- Validation helpers ---------------------------------------------------

const SHA_256 = /^[0-9a-f]{64}$/;
const RUN2_CASE_ID = /^r2-case-\d{3}$/;
const SOURCE_TYPE_SET = new Set<string>(DECLARATION_SOURCE_TYPES);
const ELIGIBILITY_SET = new Set<string>(DECLARATION_ELIGIBILITY_STATES);
const VALUE_STATE_SET = new Set<string>(DECLARATION_VALUE_STATES);
const UNCERTAINTY_SET = new Set<string>(DECLARATION_UNCERTAINTY_STATES);
const MEDIA_SET = new Set<string>(MEDIA_TYPES);
const EXPOSED_SET = new Set<string>(EXPOSED_PRIOR_PILOT_IDENTITIES);
const FORBIDDEN_KEY_SET = new Set<string>(FORBIDDEN_ENTRY_KEYS);

function trimmedNonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v === v.trim();
}
function isIsoTimestamp(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && !Number.isNaN(Date.parse(v));
}
function isNonNegNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}
function beforeIfSet(a: string, b: string | null): boolean {
  return b === null || Date.parse(a) < Date.parse(b);
}

function validateDeclaredValue(
  value: DeclaredValue,
  field: string,
  push: (m: string) => void,
): void {
  if (!VALUE_STATE_SET.has(value.valueState)) push(`${field}.valueState invalid`);
  if (!UNCERTAINTY_SET.has(value.uncertaintyState)) push(`${field}.uncertaintyState invalid`);
  if (value.valueState === "PRESENT") {
    if (!trimmedNonEmpty(value.exactSourceText)) {
      push(`${field}.exactSourceText must be non-empty and not whitespace-only when PRESENT`);
    }
    if (typeof value.normalizedComparisonForm !== "string")
      push(`${field}.normalizedComparisonForm must be present when PRESENT`);
  } else {
    if (value.exactSourceText !== null)
      push(`${field}.exactSourceText must be null unless valueState is PRESENT`);
  }
}

export function scanEntryForForbiddenKeys(entry: object, id: string): string[] {
  return Object.keys(entry)
    .filter((k) => FORBIDDEN_KEY_SET.has(k))
    .map((k) => `${id}: forbidden run-001-outcome/machine-result key "${k}"`);
}

function validateEntry(entry: DeclarationEntry, manifest: DeclarationManifest): string[] {
  const issues: string[] = [];
  const id = entry.run002CaseId || "(missing id)";
  const push = (m: string) => issues.push(`${id}: ${m}`);

  if (entry.schemaVersion !== DECLARATION_MANIFEST_SCHEMA_VERSION)
    push("entry schemaVersion mismatch");
  if (entry.runId !== manifest.runId) push("entry runId must match manifest runId");
  if (!RUN2_CASE_ID.test(entry.run002CaseId)) push("run002CaseId must match r2-case-NNN");
  if (!trimmedNonEmpty(entry.sourceImageRef)) push("sourceImageRef must be non-empty");
  if (typeof entry.sourceImageSha256 !== "string" || !SHA_256.test(entry.sourceImageSha256))
    push("sourceImageSha256 must be a 64-char lowercase SHA-256");
  if (!MEDIA_SET.has(entry.sourceMediaType)) push("sourceMediaType invalid");
  if (!(Number.isSafeInteger(entry.sourceByteSize) && entry.sourceByteSize > 0))
    push("sourceByteSize must be a positive integer");
  if (!ELIGIBILITY_SET.has(entry.primaryBlindEligibilityState))
    push("primaryBlindEligibilityState invalid");

  validateDeclaredValue(entry.declaredBrand, "declaredBrand", push);
  validateDeclaredValue(entry.declaredAlcohol, "declaredAlcohol", push);

  // No uncontrolled normalization: normalized form must equal the governed form.
  if (
    entry.declaredBrand.valueState === "PRESENT" &&
    entry.declaredBrand.exactSourceText !== null
  ) {
    if (
      entry.declaredBrand.normalizedComparisonForm !==
      normalizeDeclaredBrand(entry.declaredBrand.exactSourceText)
    )
      push(
        "declaredBrand.normalizedComparisonForm is not the governed normalization of the exact text",
      );
  }
  if (
    entry.declaredAlcohol.valueState === "PRESENT" &&
    entry.declaredAlcohol.exactSourceText !== null
  ) {
    if (!isSupportedDeclaredAlcohol(entry.declaredAlcohol.exactSourceText))
      push("declaredAlcohol.exactSourceText is not a supported alcohol declaration syntax");
    if (
      entry.declaredAlcohol.normalizedComparisonForm !==
      normalizeDeclaredAlcohol(entry.declaredAlcohol.exactSourceText)
    )
      push(
        "declaredAlcohol.normalizedComparisonForm is not the governed normalization of the exact text",
      );
  }

  // Timing: valid, non-negative, ordered, and burden accounted separately.
  const t = entry.timing;
  for (const [name, ms] of [
    ["sourceSearchMs", t.sourceSearchMs],
    ["transcriptionMs", t.transcriptionMs],
    ["verificationMs", t.verificationMs],
    ["totalIntakeBurdenMs", t.totalIntakeBurdenMs],
  ] as const) {
    if (ms !== null && !isNonNegNumber(ms)) push(`timing.${name} must be null or non-negative`);
  }
  if (t.intakeStartTimestamp !== null && !isIsoTimestamp(t.intakeStartTimestamp))
    push("timing.intakeStartTimestamp invalid");
  if (t.intakeCompletionTimestamp !== null && !isIsoTimestamp(t.intakeCompletionTimestamp))
    push("timing.intakeCompletionTimestamp invalid");
  if (
    isIsoTimestamp(t.intakeStartTimestamp) &&
    isIsoTimestamp(t.intakeCompletionTimestamp) &&
    Date.parse(t.intakeCompletionTimestamp) < Date.parse(t.intakeStartTimestamp)
  )
    push("timing.intakeCompletionTimestamp is before intakeStartTimestamp");

  if (entry.recordedTimestamp !== null && !isIsoTimestamp(entry.recordedTimestamp))
    push("recordedTimestamp invalid");
  if (entry.sourceAccessDate !== null && !isIsoTimestamp(entry.sourceAccessDate))
    push("sourceAccessDate invalid");

  // Declarations must precede randomization / reviewer exposure / machine execution.
  const stamp = entry.recordedTimestamp ?? entry.timing.intakeCompletionTimestamp;
  if (isIsoTimestamp(stamp)) {
    if (!beforeIfSet(stamp, manifest.randomizationTimestamp))
      push("declaration timestamp must be before randomizationTimestamp");
    if (!beforeIfSet(stamp, manifest.reviewerExposureTimestamp))
      push("declaration timestamp must be before reviewerExposureTimestamp");
    if (!beforeIfSet(stamp, manifest.machineExecutionTimestamp))
      push("declaration timestamp must be before machineExecutionTimestamp");
  }

  // Provenance source type + forbidden-source guards.
  if (entry.declarationSourceType !== null && !SOURCE_TYPE_SET.has(entry.declarationSourceType))
    push("declarationSourceType invalid");
  if (entry.declarationSourceRef !== null && FORBIDDEN_SOURCE_REF.test(entry.declarationSourceRef))
    push("declarationSourceRef points at a forbidden provenance source");
  issues.push(...scanEntryForForbiddenKeys(entry, id));

  // Exposed prior identities can never be primary-blind.
  if (
    entry.priorPilotIdentity !== null &&
    EXPOSED_SET.has(entry.priorPilotIdentity) &&
    entry.primaryBlindEligibilityState === "PRIMARY_BLIND_CANDIDATE"
  )
    push(`exposed prior identity ${entry.priorPilotIdentity} cannot be a PRIMARY_BLIND_CANDIDATE`);

  // Non-primary states require a reason.
  if (
    (entry.primaryBlindEligibilityState === "EXCLUDED" ||
      entry.primaryBlindEligibilityState === "NON_BLIND_OPERATIONAL") &&
    !trimmedNonEmpty(entry.exclusionOrNonBlindReason)
  )
    push(`${entry.primaryBlindEligibilityState} requires an exclusionOrNonBlindReason`);

  // Fail-closed completeness for a primary-blind candidate.
  if (entry.primaryBlindEligibilityState === "PRIMARY_BLIND_CANDIDATE") {
    if (
      entry.declaredBrand.valueState !== "PRESENT" ||
      entry.declaredAlcohol.valueState !== "PRESENT"
    )
      push("PRIMARY_BLIND_CANDIDATE requires PRESENT declared brand and alcohol");
    if (entry.declarationSourceType === null)
      push("PRIMARY_BLIND_CANDIDATE requires a declarationSourceType");
    if (!trimmedNonEmpty(entry.declarationSourceRef))
      push("PRIMARY_BLIND_CANDIDATE requires a declarationSourceRef");
    if (!trimmedNonEmpty(entry.independenceStatement))
      push("PRIMARY_BLIND_CANDIDATE requires an independenceStatement");
    if (!trimmedNonEmpty(entry.transcriptionMethod))
      push("PRIMARY_BLIND_CANDIDATE requires a transcriptionMethod");
    if (
      entry.recordedBy === null ||
      !trimmedNonEmpty(entry.recordedBy.identity) ||
      !trimmedNonEmpty(entry.recordedBy.role)
    )
      push("PRIMARY_BLIND_CANDIDATE requires recordedBy identity and role");
    if (!isIsoTimestamp(entry.recordedTimestamp))
      push("PRIMARY_BLIND_CANDIDATE requires a recordedTimestamp");
    if (!isNonNegNumber(entry.timing.totalIntakeBurdenMs))
      push("PRIMARY_BLIND_CANDIDATE requires a non-negative totalIntakeBurdenMs");
  }

  // Per-entry digest, when present, must match.
  if (entry.manifestEntryDigest !== null) {
    if (!SHA_256.test(entry.manifestEntryDigest)) push("manifestEntryDigest must be a SHA-256");
    else if (computeEntryDigest(entry) !== entry.manifestEntryDigest)
      push("manifestEntryDigest does not match the canonical entry digest");
  }

  return issues;
}

export function validateDeclarationManifest(manifest: DeclarationManifest): ValidationResult {
  const issues: string[] = [];
  if (manifest.schemaVersion !== DECLARATION_MANIFEST_SCHEMA_VERSION)
    issues.push(`schemaVersion must be ${DECLARATION_MANIFEST_SCHEMA_VERSION}`);
  if (!trimmedNonEmpty(manifest.runId)) issues.push("runId must be non-empty");
  if (manifest.productBoundaryStatement !== PRODUCT_BOUNDARY_STATEMENT)
    issues.push(
      "productBoundaryStatement must match the governed declared-value workflow statement",
    );

  if (!Array.isArray(manifest.entries)) {
    issues.push("entries must be an array");
    return { ok: false, issues };
  }
  if (manifest.entries.length !== manifest.expectedCandidateCount)
    issues.push(
      `entries length ${manifest.entries.length} must equal expectedCandidateCount ${manifest.expectedCandidateCount}`,
    );

  for (const entry of manifest.entries) issues.push(...validateEntry(entry, manifest));

  // Unique run-002 case IDs.
  const idCounts = new Map<string, number>();
  for (const e of manifest.entries)
    idCounts.set(e.run002CaseId, (idCounts.get(e.run002CaseId) ?? 0) + 1);
  for (const [id, n] of idCounts) if (n > 1) issues.push(`duplicate run002CaseId ${id}`);

  // Unique primary source-image membership: no image twice in the primary pool.
  const primaryDigests = new Map<string, string[]>();
  for (const e of manifest.entries) {
    if (
      e.primaryBlindEligibilityState === "PRIMARY_BLIND_CANDIDATE" &&
      SHA_256.test(e.sourceImageSha256)
    )
      primaryDigests.set(e.sourceImageSha256, [
        ...(primaryDigests.get(e.sourceImageSha256) ?? []),
        e.run002CaseId,
      ]);
  }
  for (const [digest, owners] of primaryDigests)
    if (owners.length > 1)
      issues.push(
        `primary-blind pool reuses image ${digest.slice(0, 12)}… across ${owners.sort().join(", ")}`,
      );

  // Whole-manifest digest, when present, must match.
  if (manifest.manifestDigest !== null) {
    if (!SHA_256.test(manifest.manifestDigest)) issues.push("manifestDigest must be a SHA-256");
    else if (computeManifestDigest(manifest) !== manifest.manifestDigest)
      issues.push("manifestDigest does not match the canonical manifest digest");
  }

  return { ok: issues.length === 0, issues };
}

// ---- Deterministic accounting --------------------------------------------

export interface CandidateAccounting {
  readonly totalCandidateImages: number;
  readonly declarationsComplete: number;
  readonly declarationsIncomplete: number;
  readonly primaryBlindCandidates: number;
  readonly pending: number;
  readonly excluded: number;
  readonly nonBlindOperational: number;
  readonly nonPrimaryReasons: Readonly<Record<string, string>>;
}

export function computeCandidateAccounting(manifest: DeclarationManifest): CandidateAccounting {
  let complete = 0;
  let primary = 0;
  let pending = 0;
  let excluded = 0;
  let nonBlind = 0;
  const reasons: Record<string, string> = {};
  for (const e of manifest.entries) {
    const declComplete =
      e.declaredBrand.valueState === "PRESENT" && e.declaredAlcohol.valueState === "PRESENT";
    if (declComplete) complete += 1;
    switch (e.primaryBlindEligibilityState) {
      case "PRIMARY_BLIND_CANDIDATE":
        primary += 1;
        break;
      case "PENDING_SOURCE_VERIFICATION":
        pending += 1;
        reasons[e.run002CaseId] =
          e.exclusionOrNonBlindReason ?? "pending independent declaration source";
        break;
      case "EXCLUDED":
        excluded += 1;
        reasons[e.run002CaseId] = e.exclusionOrNonBlindReason ?? "excluded";
        break;
      case "NON_BLIND_OPERATIONAL":
        nonBlind += 1;
        reasons[e.run002CaseId] = e.exclusionOrNonBlindReason ?? "non-blind operational";
        break;
    }
  }
  return {
    totalCandidateImages: manifest.entries.length,
    declarationsComplete: complete,
    declarationsIncomplete: manifest.entries.length - complete,
    primaryBlindCandidates: primary,
    pending,
    excluded,
    nonBlindOperational: nonBlind,
    nonPrimaryReasons: reasons,
  };
}

/** Fail-closed leakage gate: proves no run/machine outputs and no premature execution state. */
export function checkNoLeakage(manifest: DeclarationManifest): ValidationResult {
  const issues: string[] = [];
  for (const e of manifest.entries) issues.push(...scanEntryForForbiddenKeys(e, e.run002CaseId));
  if (manifest.randomizationTimestamp !== null)
    issues.push("randomizationTimestamp must be null before freeze");
  if (manifest.reviewerExposureTimestamp !== null)
    issues.push("reviewerExposureTimestamp must be null before freeze");
  if (manifest.machineExecutionTimestamp !== null)
    issues.push("machineExecutionTimestamp must be null before freeze");
  return { ok: issues.length === 0, issues };
}
