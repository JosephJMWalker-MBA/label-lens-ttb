/**
 * Ship-readiness run-002 declaration manifest — reusable schema, governed
 * normalization, deterministic canonicalization/digests, source-byte integrity,
 * and fail-closed validation for the declared-value verification workflow
 * (Issues #124 / #127).
 *
 * Product boundary being tested (recorded and enforced by this layer):
 * a submitter or internal reviewer supplies a label image PLUS pre-existing
 * declared brand and declared alcohol values; Label Lens locates and presents
 * evidence so the reviewer can confirm, correct, abstain, or escalate. Label
 * Lens is NOT evaluated as autonomous brand/alcohol identification, and the
 * declarations are inputs — never machine truth and never adjudicated label
 * truth.
 *
 * Validation is fail-closed over untrusted JSON: it never throws on null,
 * missing, malformed, or wrong-typed input; it rejects unknown keys at every
 * governed object level; and it recursively rejects run-001 / reviewer-answer /
 * OCR / machine-result / adjudicator / expected-value material at any depth.
 *
 * This module carries no image bytes, no private paths, and no declared values.
 * Populated manifests and declared values live in a gitignored local workspace.
 * Independent of the observation-quality (#114) and RDR-004 (#116) schemas.
 */

import { existsSync, lstatSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve, sep } from "node:path";

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

/** Prior run-001 identities already exposed; never eligible for the primary stratum. */
export const EXPOSED_PRIOR_PILOT_IDENTITIES = [
  "pilot-wine-005",
  "pilot-wine-019",
  "pilot-wine-021",
] as const;

/** Keys that must never appear anywhere (they would carry run-001 outcomes / machine results). */
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
  "expectedAnswer",
  "groundTruth",
  "liveVerificationResult",
] as const;

const FORBIDDEN_SOURCE_REF =
  /label[\s_-]?lens|precheck|\bocr\b|run[\s_-]?001|manual[\s_-]?baseline|adjudicat|review[\s_-]?order|machine[\s_-]?result|reviewer[\s_-]?answer|filename/i;

// ---- Governed key allowlists (unknown keys are rejected at every level) ----

const MANIFEST_KEYS = new Set([
  "schemaVersion",
  "runId",
  "productBoundaryStatement",
  "randomizationTimestamp",
  "reviewerExposureTimestamp",
  "machineExecutionTimestamp",
  "expectedCandidateCount",
  "preparedAt",
  "preparedBy",
  "entries",
  "declarationInputDigest",
  "fullManifestDigest",
]);
const ENTRY_KEYS = new Set([
  "runId",
  "run002CaseId",
  "sourceImageRef",
  "sourceImageSha256",
  "sourceMediaType",
  "sourceByteSize",
  "priorPilotIdentity",
  "declaredBrand",
  "declaredAlcohol",
  "declarationSourceType",
  "declarationSourceRef",
  "sourceAccessDate",
  "recordedBy",
  "recordedTimestamp",
  "transcriptionMethod",
  "independenceStatement",
  "timing",
  "primaryBlindEligibilityState",
  "exclusionOrNonBlindReason",
  "schemaVersion",
  "manifestEntryDigest",
]);
const DECLARED_VALUE_KEYS = new Set([
  "exactSourceText",
  "normalizedComparisonForm",
  "valueState",
  "uncertaintyState",
]);
const RECORDED_BY_KEYS = new Set(["identity", "role"]);
const TIMING_KEYS = new Set([
  "intakeStartTimestamp",
  "intakeCompletionTimestamp",
  "sourceSearchMs",
  "transcriptionMs",
  "verificationMs",
  "totalIntakeBurdenMs",
]);

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
  readonly randomizationTimestamp: string | null;
  readonly reviewerExposureTimestamp: string | null;
  readonly machineExecutionTimestamp: string | null;
  readonly expectedCandidateCount: number;
  readonly preparedAt: string;
  readonly preparedBy: string;
  readonly entries: readonly DeclarationEntry[];
  /** Seals the stable declaration-input projection (schema/run/boundary/count + entries). */
  readonly declarationInputDigest: string | null;
  /** Seals the entire governed manifest state (adds preparer + lifecycle timestamps + entry digests). */
  readonly fullManifestDigest: string | null;
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

/** Alcohol comparison form: the numeric percent, if a plausible value is present. */
export function normalizeDeclaredAlcohol(exact: string): string {
  const match = exact.replace(/,/g, ".").match(/\d{1,2}(?:\.\d{1,2})?/);
  return match ? String(Number(match[0])) : "";
}

/**
 * A supported wine alcohol declaration. Accepts the deployed declared-value
 * forms: a bare bounded numeric ("12", "12.5") OR a numeric with a %/ABV/vol
 * marker ("12.5% ALC./VOL.", "13% by volume"). The number must be a plausible
 * ABV (0..100) and nothing alphabetic beyond recognized markers may remain, so
 * "Napa Valley" is rejected. Exact source text is never altered.
 */
export function isSupportedDeclaredAlcohol(exact: string): boolean {
  const t = exact.trim().toLowerCase().replace(/,/g, ".");
  // Anchored grammar: an optional leading marker, exactly one bounded number
  // (1–2 integer digits, up to 2 decimals), then only recognized markers. This
  // rejects multi-number / 3-digit strings like "120" and non-alcohol text.
  const match = t.match(
    /^(?:alc\.?|alcohol|abv)?\.?\s*(\d{1,2}(?:\.\d{1,2})?)\s*(?:%|°|\.|\/|\s|alc\.?|alcohol|abv|by|vol\.?|volume)*$/,
  );
  if (!match) return false;
  const value = Number(match[1]);
  return value >= 0 && value <= 100;
}

// ---- Deterministic canonicalization + digests -----------------------------

/** Stable, sorted-key JSON. Future contributors must keep serialization explicit. */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`)
    .join(",")}}`;
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

function sortedEntries(manifest: DeclarationManifest): DeclarationEntry[] {
  return [...manifest.entries].sort((a, b) => a.run002CaseId.localeCompare(b.run002CaseId));
}

/** Stable declaration-input seal: schema/run/boundary/count + entry content (no lifecycle/preparer). */
export function computeDeclarationInputDigest(manifest: DeclarationManifest): string {
  return digestOf({
    schemaVersion: manifest.schemaVersion,
    runId: manifest.runId,
    productBoundaryStatement: manifest.productBoundaryStatement,
    expectedCandidateCount: manifest.expectedCandidateCount,
    entries: sortedEntries(manifest).map(entryDigestProjection),
  });
}

/** Full manifest seal: every governed field except the two digest fields themselves. */
export function computeFullManifestDigest(manifest: DeclarationManifest): string {
  return digestOf({
    schemaVersion: manifest.schemaVersion,
    runId: manifest.runId,
    productBoundaryStatement: manifest.productBoundaryStatement,
    randomizationTimestamp: manifest.randomizationTimestamp,
    reviewerExposureTimestamp: manifest.reviewerExposureTimestamp,
    machineExecutionTimestamp: manifest.machineExecutionTimestamp,
    expectedCandidateCount: manifest.expectedCandidateCount,
    preparedAt: manifest.preparedAt,
    preparedBy: manifest.preparedBy,
    entries: sortedEntries(manifest).map((e) => ({ ...e })),
  });
}

// ---- Runtime shape validation (fail-closed over untrusted JSON) ------------

const SHA_256 = /^[0-9a-f]{64}$/;
const RUN2_CASE_ID = /^r2-case-\d{3}$/;
const SOURCE_TYPE_SET = new Set<string>(DECLARATION_SOURCE_TYPES);
const ELIGIBILITY_SET = new Set<string>(DECLARATION_ELIGIBILITY_STATES);
const VALUE_STATE_SET = new Set<string>(DECLARATION_VALUE_STATES);
const UNCERTAINTY_SET = new Set<string>(DECLARATION_UNCERTAINTY_STATES);
const MEDIA_SET = new Set<string>(MEDIA_TYPES);
const EXPOSED_SET = new Set<string>(EXPOSED_PRIOR_PILOT_IDENTITIES);
const FORBIDDEN_KEY_SET = new Set<string>(FORBIDDEN_ENTRY_KEYS);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
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

function checkUnknownKeys(
  obj: Record<string, unknown>,
  path: string,
  allowed: Set<string>,
  issues: string[],
): void {
  for (const key of Object.keys(obj))
    if (!allowed.has(key)) issues.push(`${path || "manifest"}: unknown key "${key}"`);
}

/** Recursively reject forbidden keys anywhere in the structure (fail-closed leakage guard). */
function deepForbiddenScan(value: unknown, path: string, issues: string[]): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => deepForbiddenScan(v, `${path}[${i}]`, issues));
    return;
  }
  if (!isPlainObject(value)) return;
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEY_SET.has(key))
      issues.push(
        `${path || "manifest"}.${key}: forbidden run-001-outcome/machine-result key "${key}"`,
      );
    deepForbiddenScan(value[key], path ? `${path}.${key}` : key, issues);
  }
}

/** Structural pass: returns issues and whether the shape is safe to run semantics on. */
/**
 * Exact runtime shape validation over untrusted JSON. Beyond container shape and
 * unknown-key rejection, this type-checks EVERY governed primitive/null field at
 * every level — manifest metadata and each entry — independent of eligibility
 * state, so a pending/non-primary entry with a wrong-typed field fails closed.
 */
function validateShape(input: unknown): { issues: string[]; safe: boolean } {
  const issues: string[] = [];
  if (!isPlainObject(input)) return { issues: ["manifest must be a JSON object"], safe: false };
  const str = (v: unknown, name: string) => {
    if (typeof v !== "string") issues.push(`${name} must be a string`);
  };
  const strOrNull = (v: unknown, name: string) => {
    if (v !== null && typeof v !== "string") issues.push(`${name} must be a string or null`);
  };
  const num = (v: unknown, name: string) => {
    if (typeof v !== "number") issues.push(`${name} must be a number`);
  };
  const numOrNull = (v: unknown, name: string) => {
    if (v !== null && typeof v !== "number") issues.push(`${name} must be a number or null`);
  };

  checkUnknownKeys(input, "", MANIFEST_KEYS, issues);
  // Manifest metadata types (independent of any entry state).
  str(input.schemaVersion, "schemaVersion");
  str(input.runId, "runId");
  str(input.productBoundaryStatement, "productBoundaryStatement");
  str(input.preparedAt, "preparedAt");
  str(input.preparedBy, "preparedBy");
  num(input.expectedCandidateCount, "expectedCandidateCount");
  strOrNull(input.randomizationTimestamp, "randomizationTimestamp");
  strOrNull(input.reviewerExposureTimestamp, "reviewerExposureTimestamp");
  strOrNull(input.machineExecutionTimestamp, "machineExecutionTimestamp");
  strOrNull(input.declarationInputDigest, "declarationInputDigest");
  strOrNull(input.fullManifestDigest, "fullManifestDigest");

  const entries = input.entries;
  if (!Array.isArray(entries))
    return { issues: [...issues, "entries must be an array"], safe: false };

  let safe = true;
  entries.forEach((e, i) => {
    const p = `entries[${i}]`;
    if (!isPlainObject(e)) {
      issues.push(`${p} must be an object`);
      safe = false;
      return;
    }
    checkUnknownKeys(e, p, ENTRY_KEYS, issues);
    // Entry primitive/null types, every field, every state.
    str(e.runId, `${p}.runId`);
    str(e.run002CaseId, `${p}.run002CaseId`);
    str(e.sourceImageRef, `${p}.sourceImageRef`);
    str(e.sourceImageSha256, `${p}.sourceImageSha256`);
    str(e.sourceMediaType, `${p}.sourceMediaType`);
    str(e.primaryBlindEligibilityState, `${p}.primaryBlindEligibilityState`);
    str(e.schemaVersion, `${p}.schemaVersion`);
    num(e.sourceByteSize, `${p}.sourceByteSize`);
    strOrNull(e.priorPilotIdentity, `${p}.priorPilotIdentity`);
    strOrNull(e.declarationSourceType, `${p}.declarationSourceType`);
    strOrNull(e.declarationSourceRef, `${p}.declarationSourceRef`);
    strOrNull(e.sourceAccessDate, `${p}.sourceAccessDate`);
    strOrNull(e.recordedTimestamp, `${p}.recordedTimestamp`);
    strOrNull(e.transcriptionMethod, `${p}.transcriptionMethod`);
    strOrNull(e.independenceStatement, `${p}.independenceStatement`);
    strOrNull(e.exclusionOrNonBlindReason, `${p}.exclusionOrNonBlindReason`);
    strOrNull(e.manifestEntryDigest, `${p}.manifestEntryDigest`);

    for (const key of ["declaredBrand", "declaredAlcohol"] as const) {
      const v = e[key];
      if (!isPlainObject(v)) {
        issues.push(`${p}.${key} must be an object`);
        safe = false;
      } else {
        checkUnknownKeys(v, `${p}.${key}`, DECLARED_VALUE_KEYS, issues);
        strOrNull(v.exactSourceText, `${p}.${key}.exactSourceText`);
        strOrNull(v.normalizedComparisonForm, `${p}.${key}.normalizedComparisonForm`);
        str(v.valueState, `${p}.${key}.valueState`);
        str(v.uncertaintyState, `${p}.${key}.uncertaintyState`);
      }
    }
    const timing = e.timing;
    if (!isPlainObject(timing)) {
      issues.push(`${p}.timing must be an object`);
      safe = false;
    } else {
      checkUnknownKeys(timing, `${p}.timing`, TIMING_KEYS, issues);
      strOrNull(timing.intakeStartTimestamp, `${p}.timing.intakeStartTimestamp`);
      strOrNull(timing.intakeCompletionTimestamp, `${p}.timing.intakeCompletionTimestamp`);
      numOrNull(timing.sourceSearchMs, `${p}.timing.sourceSearchMs`);
      numOrNull(timing.transcriptionMs, `${p}.timing.transcriptionMs`);
      numOrNull(timing.verificationMs, `${p}.timing.verificationMs`);
      numOrNull(timing.totalIntakeBurdenMs, `${p}.timing.totalIntakeBurdenMs`);
    }
    const rb = e.recordedBy;
    if (rb !== null && rb !== undefined && !isPlainObject(rb)) {
      issues.push(`${p}.recordedBy must be an object or null`);
      safe = false;
    } else if (isPlainObject(rb)) {
      checkUnknownKeys(rb, `${p}.recordedBy`, RECORDED_BY_KEYS, issues);
      str(rb.identity, `${p}.recordedBy.identity`);
      str(rb.role, `${p}.recordedBy.role`);
    }
  });
  return { issues, safe };
}

// ---- Semantic validation --------------------------------------------------

function validateDeclaredValue(
  value: DeclaredValue,
  field: string,
  push: (m: string) => void,
): void {
  if (!VALUE_STATE_SET.has(value.valueState)) push(`${field}.valueState invalid`);
  if (!UNCERTAINTY_SET.has(value.uncertaintyState)) push(`${field}.uncertaintyState invalid`);
  if (value.valueState === "PRESENT") {
    if (!trimmedNonEmpty(value.exactSourceText))
      push(`${field}.exactSourceText must be non-empty and not whitespace-only when PRESENT`);
    if (typeof value.normalizedComparisonForm !== "string")
      push(`${field}.normalizedComparisonForm must be present when PRESENT`);
  } else {
    if (value.exactSourceText !== null)
      push(`${field}.exactSourceText must be null unless valueState is PRESENT`);
    if (value.normalizedComparisonForm !== null)
      push(`${field}.normalizedComparisonForm must be null unless valueState is PRESENT`);
  }
}

/**
 * One governed predicate for provenance-complete declarations. PRESENT values
 * alone are never enough — a complete declaration must carry traceable,
 * non-forbidden source provenance, recorded-by identity/role, all timestamps,
 * every component timing (explicit non-negative values, 0 allowed), and correct
 * ordering before randomization/reviewer/machine. Used by validation, primary
 * eligibility, and accounting so the three cannot disagree.
 */
export function isDeclarationProvenanceComplete(
  entry: DeclarationEntry,
  manifest: Pick<
    DeclarationManifest,
    "randomizationTimestamp" | "reviewerExposureTimestamp" | "machineExecutionTimestamp"
  >,
): boolean {
  if (
    entry.declaredBrand.valueState !== "PRESENT" ||
    entry.declaredAlcohol.valueState !== "PRESENT"
  )
    return false;
  if (entry.declarationSourceType === null || !SOURCE_TYPE_SET.has(entry.declarationSourceType))
    return false;
  if (
    !trimmedNonEmpty(entry.declarationSourceRef) ||
    FORBIDDEN_SOURCE_REF.test(entry.declarationSourceRef)
  )
    return false;
  if (!isIsoTimestamp(entry.sourceAccessDate)) return false;
  if (
    entry.recordedBy === null ||
    !trimmedNonEmpty(entry.recordedBy.identity) ||
    !trimmedNonEmpty(entry.recordedBy.role)
  )
    return false;
  if (!isIsoTimestamp(entry.recordedTimestamp)) return false;
  if (!trimmedNonEmpty(entry.transcriptionMethod)) return false;
  if (!trimmedNonEmpty(entry.independenceStatement)) return false;
  const t = entry.timing;
  if (!isIsoTimestamp(t.intakeStartTimestamp) || !isIsoTimestamp(t.intakeCompletionTimestamp))
    return false;
  // Interval order: completion must not precede start (moved in so accounting
  // and validation cannot disagree).
  if (Date.parse(t.intakeCompletionTimestamp) < Date.parse(t.intakeStartTimestamp)) return false;
  if (
    !isNonNegNumber(t.sourceSearchMs) ||
    !isNonNegNumber(t.transcriptionMs) ||
    !isNonNegNumber(t.verificationMs) ||
    !isNonNegNumber(t.totalIntakeBurdenMs)
  )
    return false;
  // Burden consistency: total must be at least the sum of the three governed
  // components (permitted overhead is allowed above the sum, never below it).
  if (t.totalIntakeBurdenMs < t.sourceSearchMs + t.transcriptionMs + t.verificationMs) return false;
  if (!beforeIfSet(entry.recordedTimestamp, manifest.randomizationTimestamp)) return false;
  if (!beforeIfSet(entry.recordedTimestamp, manifest.reviewerExposureTimestamp)) return false;
  if (!beforeIfSet(entry.recordedTimestamp, manifest.machineExecutionTimestamp)) return false;
  return true;
}

function validateEntry(entry: DeclarationEntry, manifest: DeclarationManifest): string[] {
  const issues: string[] = [];
  const id =
    typeof entry.run002CaseId === "string" && entry.run002CaseId
      ? entry.run002CaseId
      : "(missing id)";
  const push = (m: string) => issues.push(`${id}: ${m}`);

  if (entry.schemaVersion !== DECLARATION_MANIFEST_SCHEMA_VERSION)
    push("entry schemaVersion mismatch");
  if (entry.runId !== manifest.runId) push("entry runId must match manifest runId");
  if (typeof entry.run002CaseId !== "string" || !RUN2_CASE_ID.test(entry.run002CaseId))
    push("run002CaseId must match r2-case-NNN");
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

  if (
    entry.declaredBrand.valueState === "PRESENT" &&
    typeof entry.declaredBrand.exactSourceText === "string"
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
    typeof entry.declaredAlcohol.exactSourceText === "string"
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
  // Burden consistency: total must be at least the sum of the three components.
  if (
    isNonNegNumber(t.sourceSearchMs) &&
    isNonNegNumber(t.transcriptionMs) &&
    isNonNegNumber(t.verificationMs) &&
    isNonNegNumber(t.totalIntakeBurdenMs) &&
    t.totalIntakeBurdenMs < t.sourceSearchMs + t.transcriptionMs + t.verificationMs
  )
    push(
      "timing.totalIntakeBurdenMs must be at least the sum of source-search + transcription + verification",
    );

  if (entry.recordedTimestamp !== null && !isIsoTimestamp(entry.recordedTimestamp))
    push("recordedTimestamp invalid");
  if (entry.sourceAccessDate !== null && !isIsoTimestamp(entry.sourceAccessDate))
    push("sourceAccessDate invalid");

  const stamp = entry.recordedTimestamp ?? entry.timing.intakeCompletionTimestamp;
  if (isIsoTimestamp(stamp)) {
    if (!beforeIfSet(stamp, manifest.randomizationTimestamp))
      push("declaration timestamp must be before randomizationTimestamp");
    if (!beforeIfSet(stamp, manifest.reviewerExposureTimestamp))
      push("declaration timestamp must be before reviewerExposureTimestamp");
    if (!beforeIfSet(stamp, manifest.machineExecutionTimestamp))
      push("declaration timestamp must be before machineExecutionTimestamp");
  }

  if (entry.declarationSourceType !== null && !SOURCE_TYPE_SET.has(entry.declarationSourceType))
    push("declarationSourceType invalid");
  if (
    typeof entry.declarationSourceRef === "string" &&
    FORBIDDEN_SOURCE_REF.test(entry.declarationSourceRef)
  )
    push("declarationSourceRef points at a forbidden provenance source");

  if (
    entry.priorPilotIdentity !== null &&
    EXPOSED_SET.has(entry.priorPilotIdentity) &&
    entry.primaryBlindEligibilityState === "PRIMARY_BLIND_CANDIDATE"
  )
    push(`exposed prior identity ${entry.priorPilotIdentity} cannot be a PRIMARY_BLIND_CANDIDATE`);

  if (
    (entry.primaryBlindEligibilityState === "EXCLUDED" ||
      entry.primaryBlindEligibilityState === "NON_BLIND_OPERATIONAL") &&
    !trimmedNonEmpty(entry.exclusionOrNonBlindReason)
  )
    push(`${entry.primaryBlindEligibilityState} requires an exclusionOrNonBlindReason`);

  // Fail-closed provenance completeness for a primary-blind candidate.
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
    if (!isIsoTimestamp(entry.sourceAccessDate))
      push("PRIMARY_BLIND_CANDIDATE requires a sourceAccessDate");
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
    if (!isIsoTimestamp(entry.timing.intakeStartTimestamp))
      push("PRIMARY_BLIND_CANDIDATE requires timing.intakeStartTimestamp");
    if (!isIsoTimestamp(entry.timing.intakeCompletionTimestamp))
      push("PRIMARY_BLIND_CANDIDATE requires timing.intakeCompletionTimestamp");
    for (const name of [
      "sourceSearchMs",
      "transcriptionMs",
      "verificationMs",
      "totalIntakeBurdenMs",
    ] as const)
      if (!isNonNegNumber(entry.timing[name]))
        push(`PRIMARY_BLIND_CANDIDATE requires a non-negative timing.${name}`);
    if (!isDeclarationProvenanceComplete(entry, manifest))
      push("PRIMARY_BLIND_CANDIDATE requires a provenance-complete declaration");
  }

  if (entry.manifestEntryDigest !== null) {
    if (typeof entry.manifestEntryDigest !== "string" || !SHA_256.test(entry.manifestEntryDigest))
      push("manifestEntryDigest must be a SHA-256");
    else if (computeEntryDigest(entry) !== entry.manifestEntryDigest)
      push("manifestEntryDigest does not match the canonical entry digest");
  }

  return issues;
}

export function validateDeclarationManifest(input: unknown): ValidationResult {
  const shape = validateShape(input);
  const forbidden: string[] = [];
  deepForbiddenScan(input, "", forbidden);
  if (!shape.safe) return { ok: false, issues: [...shape.issues, ...forbidden] };

  const manifest = input as DeclarationManifest;
  const issues: string[] = [...shape.issues, ...forbidden];

  if (manifest.schemaVersion !== DECLARATION_MANIFEST_SCHEMA_VERSION)
    issues.push(`schemaVersion must be ${DECLARATION_MANIFEST_SCHEMA_VERSION}`);
  if (!trimmedNonEmpty(manifest.runId)) issues.push("runId must be non-empty");
  if (manifest.productBoundaryStatement !== PRODUCT_BOUNDARY_STATEMENT)
    issues.push(
      "productBoundaryStatement must match the governed declared-value workflow statement",
    );
  if (!Number.isSafeInteger(manifest.expectedCandidateCount))
    issues.push("expectedCandidateCount must be an integer");
  if (manifest.entries.length !== manifest.expectedCandidateCount)
    issues.push(
      `entries length ${manifest.entries.length} must equal expectedCandidateCount ${manifest.expectedCandidateCount}`,
    );

  for (const entry of manifest.entries) issues.push(...validateEntry(entry, manifest));

  const idCounts = new Map<string, number>();
  for (const e of manifest.entries)
    idCounts.set(e.run002CaseId, (idCounts.get(e.run002CaseId) ?? 0) + 1);
  for (const [id, n] of idCounts) if (n > 1) issues.push(`duplicate run002CaseId ${id}`);

  const primaryDigests = new Map<string, string[]>();
  for (const e of manifest.entries)
    if (
      e.primaryBlindEligibilityState === "PRIMARY_BLIND_CANDIDATE" &&
      typeof e.sourceImageSha256 === "string" &&
      SHA_256.test(e.sourceImageSha256)
    )
      primaryDigests.set(e.sourceImageSha256, [
        ...(primaryDigests.get(e.sourceImageSha256) ?? []),
        e.run002CaseId,
      ]);
  for (const [digest, owners] of primaryDigests)
    if (owners.length > 1)
      issues.push(
        `primary-blind pool reuses image ${digest.slice(0, 12)}… across ${owners.sort().join(", ")}`,
      );

  if (manifest.declarationInputDigest !== null) {
    if (
      typeof manifest.declarationInputDigest !== "string" ||
      !SHA_256.test(manifest.declarationInputDigest)
    )
      issues.push("declarationInputDigest must be a SHA-256");
    else if (computeDeclarationInputDigest(manifest) !== manifest.declarationInputDigest)
      issues.push("declarationInputDigest does not match the canonical declaration-input digest");
  }
  if (manifest.fullManifestDigest !== null) {
    if (
      typeof manifest.fullManifestDigest !== "string" ||
      !SHA_256.test(manifest.fullManifestDigest)
    )
      issues.push("fullManifestDigest must be a SHA-256");
    else if (computeFullManifestDigest(manifest) !== manifest.fullManifestDigest)
      issues.push("fullManifestDigest does not match the canonical full-manifest digest");
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
    // Provenance-complete, not merely two PRESENT values.
    if (isDeclarationProvenanceComplete(e, manifest)) complete += 1;
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

/** Fail-closed leakage gate: recursive forbidden scan + no premature execution state. */
export function checkNoLeakage(manifest: DeclarationManifest): ValidationResult {
  const issues: string[] = [];
  deepForbiddenScan(manifest, "", issues);
  if (manifest.randomizationTimestamp !== null)
    issues.push("randomizationTimestamp must be null before freeze");
  if (manifest.reviewerExposureTimestamp !== null)
    issues.push("reviewerExposureTimestamp must be null before freeze");
  if (manifest.machineExecutionTimestamp !== null)
    issues.push("machineExecutionTimestamp must be null before freeze");
  return { ok: issues.length === 0, issues };
}

// ---- Source-byte integrity ------------------------------------------------

/** Sniff the real media type from the leading magic bytes. */
export function sniffMediaType(bytes: Uint8Array): DeclarationMediaType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= 8 && png.every((b, i) => bytes[i] === b)) return "image/png";
  return null;
}

/** Reject absolute paths, backslashes, and any path escape (traversal). */
export function isSafeSourceRelRef(ref: string): boolean {
  if (typeof ref !== "string" || ref.length === 0) return false;
  if (ref.includes("\0") || ref.includes("\\") || ref.startsWith("/")) return false;
  if (/^[A-Za-z]:/.test(ref)) return false;
  return ref.split("/").every((seg) => seg.length > 0 && seg !== "." && seg !== "..");
}

/** Verify one entry against the actual source bytes (digest, byte size, media type). */
export function verifySourceBytes(entry: DeclarationEntry, bytes: Uint8Array): string[] {
  const issues: string[] = [];
  const actualDigest = sha256Hex(bytes);
  if (actualDigest !== entry.sourceImageSha256)
    issues.push("sha256 mismatch (source bytes differ from the manifest)");
  if (bytes.length !== entry.sourceByteSize)
    issues.push(`byte size mismatch (actual ${bytes.length}, manifest ${entry.sourceByteSize})`);
  const sniffed = sniffMediaType(bytes);
  if (sniffed === null) issues.push("unrecognized media type from source bytes");
  else if (sniffed !== entry.sourceMediaType)
    issues.push(`media type mismatch (actual ${sniffed}, manifest ${entry.sourceMediaType})`);
  return issues;
}

export interface SourceVerification {
  readonly run002CaseId: string;
  readonly sourceImageRef: string;
  readonly ok: boolean;
  readonly issues: readonly string[];
}
export interface SourceVerificationReport {
  readonly ok: boolean;
  readonly results: readonly SourceVerification[];
}

/**
 * Verify every source against a byte reader confined to an authorized root.
 * `reader` returns the file bytes for a safe relative ref, or null if missing.
 * No absolute paths leave this function; refs that escape are rejected.
 */
export function verifySourcesWithReader(
  manifest: DeclarationManifest,
  reader: (safeRelRef: string) => Uint8Array | null,
): SourceVerificationReport {
  const results = manifest.entries.map((entry): SourceVerification => {
    const issues: string[] = [];
    if (!isSafeSourceRelRef(entry.sourceImageRef)) {
      issues.push("sourceImageRef is not a safe in-root relative path (traversal/escape rejected)");
    } else {
      const bytes = reader(entry.sourceImageRef);
      if (bytes === null) issues.push("source file not found under the authorized root");
      else issues.push(...verifySourceBytes(entry, bytes));
    }
    return {
      run002CaseId: entry.run002CaseId,
      sourceImageRef: entry.sourceImageRef,
      ok: issues.length === 0,
      issues,
    };
  });
  return { ok: results.every((r) => r.ok), results };
}

export interface TrustedInventoryRecord {
  readonly sha256: string;
  readonly sizeBytes: number;
}

/** Verify every source against a trusted preservation inventory (digest + byte size). */
export function verifySourcesAgainstInventory(
  manifest: DeclarationManifest,
  inventory: readonly TrustedInventoryRecord[],
): SourceVerificationReport {
  const byDigest = new Map<string, number>();
  for (const r of inventory)
    if (typeof r.sha256 === "string") byDigest.set(r.sha256.toLowerCase(), r.sizeBytes);
  const results = manifest.entries.map((entry): SourceVerification => {
    const issues: string[] = [];
    const size = byDigest.get(entry.sourceImageSha256);
    if (size === undefined) issues.push("source digest not present in the trusted inventory");
    else if (size !== entry.sourceByteSize)
      issues.push(
        `byte size mismatch against trusted inventory (inventory ${size}, manifest ${entry.sourceByteSize})`,
      );
    return {
      run002CaseId: entry.run002CaseId,
      sourceImageRef: entry.sourceImageRef,
      ok: issues.length === 0,
      issues,
    };
  });
  return { ok: results.every((r) => r.ok), results };
}

/** True iff `targetReal` (a canonical path) is the root or nested under it. */
export function isWithinCanonicalRoot(rootReal: string, targetReal: string): boolean {
  return targetReal === rootReal || targetReal.startsWith(rootReal + sep);
}

/**
 * A byte reader confined to an authorized root that resists BOTH `..` traversal
 * and symlink escape: it resolves the target's canonical real path and reads it
 * only when that real path remains under the canonical root. An in-root symlink
 * that points outside the root is rejected, and the outside file is never read.
 */
export function createAuthorizedRootReader(rootDir: string): (ref: string) => Uint8Array | null {
  const resolvedRoot = resolve(rootDir);
  const rootReal = existsSync(resolvedRoot) ? realpathSync(resolvedRoot) : resolvedRoot;
  return (ref: string): Uint8Array | null => {
    if (!isSafeSourceRelRef(ref)) return null;
    const target = join(rootReal, ref);
    if (!existsSync(target)) return null; // missing or dangling symlink
    let real: string;
    try {
      real = realpathSync(target); // canonicalize through any symlinks
    } catch {
      return null;
    }
    if (!isWithinCanonicalRoot(rootReal, real)) return null; // symlink/target escapes the root
    try {
      if (!lstatSync(real).isFile()) return null;
    } catch {
      return null;
    }
    return new Uint8Array(readFileSync(real));
  };
}

// ---- Fail-closed candidate-input parsing (pre-skeleton) --------------------

export interface CandidateInput {
  readonly run002CaseId: string;
  readonly sourceImageRef: string;
  readonly sourceImageSha256: string;
  readonly sourceMediaType: DeclarationMediaType;
  readonly sourceByteSize: number;
  readonly priorPilotIdentity: string | null;
  readonly eligibility: DeclarationEligibilityState;
  readonly reason: string | null;
}

const CANDIDATE_KEYS = new Set([
  "run002CaseId",
  "sourceImageRef",
  "sourceImageSha256",
  "sourceMediaType",
  "sourceByteSize",
  "priorPilotIdentity",
  "eligibility",
  "reason",
]);

export interface CandidateParseResult {
  readonly ok: boolean;
  readonly issues: readonly string[];
  readonly candidates: readonly CandidateInput[];
}

/** Parse + validate untrusted candidates JSON fail-closed before skeleton construction. */
export function parseCandidateInputs(raw: unknown): CandidateParseResult {
  const issues: string[] = [];
  if (!Array.isArray(raw))
    return { ok: false, issues: ["candidates must be an array"], candidates: [] };

  const candidates: CandidateInput[] = [];
  raw.forEach((c, i) => {
    const p = `candidates[${i}]`;
    if (!isPlainObject(c)) {
      issues.push(`${p} must be an object`);
      return;
    }
    checkUnknownKeys(c, p, CANDIDATE_KEYS, issues);
    const before = issues.length;
    if (typeof c.run002CaseId !== "string" || !RUN2_CASE_ID.test(c.run002CaseId))
      issues.push(`${p}.run002CaseId must match r2-case-NNN`);
    if (!trimmedNonEmpty(c.sourceImageRef))
      issues.push(`${p}.sourceImageRef must be a non-empty string`);
    if (typeof c.sourceImageSha256 !== "string" || !SHA_256.test(c.sourceImageSha256))
      issues.push(`${p}.sourceImageSha256 must be a 64-char lowercase SHA-256`);
    if (typeof c.sourceMediaType !== "string" || !MEDIA_SET.has(c.sourceMediaType))
      issues.push(`${p}.sourceMediaType must be image/jpeg or image/png`);
    if (!(Number.isSafeInteger(c.sourceByteSize) && (c.sourceByteSize as number) > 0))
      issues.push(`${p}.sourceByteSize must be a positive integer`);
    if (c.priorPilotIdentity !== null && typeof c.priorPilotIdentity !== "string")
      issues.push(`${p}.priorPilotIdentity must be a string or null`);
    if (typeof c.eligibility !== "string" || !ELIGIBILITY_SET.has(c.eligibility))
      issues.push(`${p}.eligibility must be a valid eligibility state`);
    if (c.reason !== undefined && c.reason !== null && typeof c.reason !== "string")
      issues.push(`${p}.reason must be a string, null, or omitted`);
    if (issues.length === before)
      candidates.push({
        run002CaseId: c.run002CaseId as string,
        sourceImageRef: c.sourceImageRef as string,
        sourceImageSha256: c.sourceImageSha256 as string,
        sourceMediaType: c.sourceMediaType as DeclarationMediaType,
        sourceByteSize: c.sourceByteSize as number,
        priorPilotIdentity: (c.priorPilotIdentity as string | null) ?? null,
        eligibility: c.eligibility as DeclarationEligibilityState,
        reason: (c.reason as string | null | undefined) ?? null,
      });
  });
  return { ok: issues.length === 0, issues, candidates };
}
