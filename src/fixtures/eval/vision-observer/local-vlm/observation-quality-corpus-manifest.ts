import { canonicalStringify } from "@/pipeline/export/json/canonical-json";
import { sha256Hex } from "@/pipeline/extractor/image-integrity";
import {
  EVAL_IMAGE_MEDIA_TYPES,
  EVAL_VISUAL_STRATA,
  type EvalImageMediaType,
  type EvalUsageStatus,
  type EvalVisualStratum,
} from "../../eval-manifest.types";

import {
  OBSERVATION_QUALITY_BENCHMARK_PROTOCOL_VERSION,
  OBSERVATION_QUALITY_CASE_COUNT,
  OBSERVATION_QUALITY_OPPORTUNITY_STATES,
  OBSERVATION_QUALITY_OPPORTUNITY_TAGS,
  type ObservationQualityOpportunityState,
  type ObservationQualityOpportunityTag,
} from "./observation-quality-benchmark-protocol";

export const OBSERVATION_QUALITY_CORPUS_MANIFEST_SCHEMA_VERSION =
  "local-vlm-observation-quality-corpus-manifest.v1" as const;

export const corpusSelectionAuthorized = false as const;
export const realCorpusManifestCreationAuthorized = false as const;
export const realExecutionAuthorizedByCorpusSlice = false as const;

export const OBSERVATION_QUALITY_CORPUS_SLOT_IDS = [
  "CLEAN_SIMPLE_1",
  "CLEAN_SIMPLE_2",
  "LOW_CONTRAST_1",
  "LOW_CONTRAST_2",
  "ROTATED_OR_VERTICAL_1",
  "ROTATED_OR_VERTICAL_2",
  "DENSE_TEXT_1",
  "DENSE_TEXT_2",
  "DECORATIVE_TYPE_1",
  "DECORATIVE_TYPE_2",
  "MULTI_PANEL_OR_WRAPAROUND_1",
  "MULTI_PANEL_OR_WRAPAROUND_2",
  "AMBIGUITY_OR_COMPETING_TEXT_1",
  "AMBIGUITY_OR_COMPETING_TEXT_2",
  "ABSTENTION_OPPORTUNITY_1",
  "ABSTENTION_OPPORTUNITY_2",
] as const;

export const OBSERVATION_QUALITY_CORPUS_SLOT_CATEGORIES = [
  "CLEAN_SIMPLE",
  "LOW_CONTRAST",
  "ROTATED_OR_VERTICAL",
  "DENSE_TEXT",
  "DECORATIVE_TYPE",
  "MULTI_PANEL_OR_WRAPAROUND",
  "AMBIGUITY_OR_COMPETING_TEXT",
  "ABSTENTION_OPPORTUNITY",
] as const;

export const OBSERVATION_QUALITY_CORPUS_SLOT_CATEGORY_BY_SLOT_ID = {
  CLEAN_SIMPLE_1: "CLEAN_SIMPLE",
  CLEAN_SIMPLE_2: "CLEAN_SIMPLE",
  LOW_CONTRAST_1: "LOW_CONTRAST",
  LOW_CONTRAST_2: "LOW_CONTRAST",
  ROTATED_OR_VERTICAL_1: "ROTATED_OR_VERTICAL",
  ROTATED_OR_VERTICAL_2: "ROTATED_OR_VERTICAL",
  DENSE_TEXT_1: "DENSE_TEXT",
  DENSE_TEXT_2: "DENSE_TEXT",
  DECORATIVE_TYPE_1: "DECORATIVE_TYPE",
  DECORATIVE_TYPE_2: "DECORATIVE_TYPE",
  MULTI_PANEL_OR_WRAPAROUND_1: "MULTI_PANEL_OR_WRAPAROUND",
  MULTI_PANEL_OR_WRAPAROUND_2: "MULTI_PANEL_OR_WRAPAROUND",
  AMBIGUITY_OR_COMPETING_TEXT_1: "AMBIGUITY_OR_COMPETING_TEXT",
  AMBIGUITY_OR_COMPETING_TEXT_2: "AMBIGUITY_OR_COMPETING_TEXT",
  ABSTENTION_OPPORTUNITY_1: "ABSTENTION_OPPORTUNITY",
  ABSTENTION_OPPORTUNITY_2: "ABSTENTION_OPPORTUNITY",
} as const satisfies Readonly<
  Record<ObservationQualityCorpusSlotId, ObservationQualityCorpusSlotCategory>
>;

export const OBSERVATION_QUALITY_CORPUS_SOURCE_PROVENANCES = [
  "Alcohol and Tobacco Tax and Trade Bureau",
  "author-provided-local-acquisition",
] as const;

export const OBSERVATION_QUALITY_CORPUS_ANNOTATION_STATUSES = [
  "COMMITTED_AND_QC_CONFIRMED",
  "COMMITTED_WITH_MEDIUM_CONFIDENCE_GEOMETRY",
  "COMMITTED_BUT_ABSTENTION_RELEVANT",
] as const;

export const OBSERVATION_QUALITY_CORPUS_VISUAL_CHARACTERISTICS = [
  "CLEAN_SIMPLE_LAYOUT",
  "LOW_CONTRAST_PRESENTATION",
  "ROTATED_OR_VERTICAL_CONTENT",
  "DENSE_TEXT_CLUSTER",
  "DECORATIVE_OR_SCRIPT_TYPE",
  "MULTI_PANEL_OR_WRAPAROUND_LAYOUT",
  "MULTIPLE_COMPETING_TEXT_CLUSTERS",
  "AMBIGUOUS_SINGLE_TARGET",
  "ABSTENTION_RELEVANT_ABSENCE",
  "ABSTENTION_RELEVANT_AMBIGUITY",
] as const;

export const OBSERVATION_QUALITY_CORPUS_FREEZE_STATES = ["DRAFT", "FROZEN", "INVALIDATED"] as const;

export const OBSERVATION_QUALITY_CORPUS_NEAR_DUPLICATE_REVIEWS = [
  "NOT_REQUIRED",
  "REVIEWED_NOT_DUPLICATE",
  "INTENTIONAL_PAIR",
] as const;

export const OBSERVATION_QUALITY_CORPUS_ANNOTATION_SELECTION_INDEPENDENCE_POLICIES = [
  "NOT_REQUIRED",
  "REQUIRED",
] as const;

export const OBSERVATION_QUALITY_CORPUS_CHALLENGE_TAGS = EVAL_VISUAL_STRATA;
export const OBSERVATION_QUALITY_CORPUS_ALLOWED_USAGE_STATUSES = [
  "screened-approved",
  "repository-use-established",
  "derived-from-screened-parent",
  "screenshot-metadata-screened-author-attested",
] as const;

export type ObservationQualityCorpusSlotId = (typeof OBSERVATION_QUALITY_CORPUS_SLOT_IDS)[number];
export type ObservationQualityCorpusSlotCategory =
  (typeof OBSERVATION_QUALITY_CORPUS_SLOT_CATEGORIES)[number];
export type ObservationQualityCorpusSourceProvenance =
  (typeof OBSERVATION_QUALITY_CORPUS_SOURCE_PROVENANCES)[number];
export type ObservationQualityCorpusAnnotationStatus =
  (typeof OBSERVATION_QUALITY_CORPUS_ANNOTATION_STATUSES)[number];
export type ObservationQualityCorpusVisualCharacteristic =
  (typeof OBSERVATION_QUALITY_CORPUS_VISUAL_CHARACTERISTICS)[number];
export type ObservationQualityCorpusFreezeState =
  (typeof OBSERVATION_QUALITY_CORPUS_FREEZE_STATES)[number];
export type ObservationQualityCorpusNearDuplicateReview =
  (typeof OBSERVATION_QUALITY_CORPUS_NEAR_DUPLICATE_REVIEWS)[number];
export type ObservationQualityCorpusAnnotationSelectionIndependencePolicy =
  (typeof OBSERVATION_QUALITY_CORPUS_ANNOTATION_SELECTION_INDEPENDENCE_POLICIES)[number];
export type ObservationQualityCorpusChallengeTag = EvalVisualStratum;
export type ObservationQualityCorpusAllowedUsageStatus = Exclude<
  EvalUsageStatus,
  "usage-or-provenance-concern"
>;

export interface ObservationQualityCorpusSlotSupportByChallengeTag {
  readonly kind: "CHALLENGE_TAG";
  readonly tag: ObservationQualityCorpusChallengeTag;
}

export interface ObservationQualityCorpusSlotSupportByVisualCharacteristic {
  readonly kind: "HUMAN_REVIEWED_VISUAL_CHARACTERISTIC";
  readonly characteristic: ObservationQualityCorpusVisualCharacteristic;
  readonly note: string;
}

export type ObservationQualityCorpusSlotSupport =
  | ObservationQualityCorpusSlotSupportByChallengeTag
  | ObservationQualityCorpusSlotSupportByVisualCharacteristic;

export interface ObservationQualityCorpusCaseEntry {
  readonly slotId: ObservationQualityCorpusSlotId;
  readonly sourceCaseId: string;
  readonly sourceArtifactRef: string;
  readonly sourceManifestRecordDigest: string;
  readonly sourceImageDigest: string;
  readonly derivativeDigest: string;
  readonly mediaType: EvalImageMediaType;
  readonly width: number;
  readonly height: number;
  readonly beverageCategory: "wine";
  readonly challengeTags: readonly ObservationQualityCorpusChallengeTag[];
  readonly slotSupport: ObservationQualityCorpusSlotSupport;
  readonly sourceProvenance: ObservationQualityCorpusSourceProvenance;
  readonly usageStatus: ObservationQualityCorpusAllowedUsageStatus;
  readonly selectionRationale: string;
  readonly annotationStatus: ObservationQualityCorpusAnnotationStatus;
  readonly observationOpportunityState: ObservationQualityOpportunityState;
  readonly observationOpportunityTags: readonly ObservationQualityOpportunityTag[];
  readonly nearDuplicateReview: ObservationQualityCorpusNearDuplicateReview;
  readonly annotatedBy: string;
  readonly annotatedAt: string;
  readonly selectedBy: string;
  readonly selectedAt: string;
}

export interface ObservationQualityCorpusManifest {
  readonly schemaVersion: typeof OBSERVATION_QUALITY_CORPUS_MANIFEST_SCHEMA_VERSION;
  readonly protocolVersion: typeof OBSERVATION_QUALITY_BENCHMARK_PROTOCOL_VERSION;
  readonly benchmarkCorpusId: string;
  readonly annotationSelectionIndependencePolicy: ObservationQualityCorpusAnnotationSelectionIndependencePolicy;
  readonly freezeState: ObservationQualityCorpusFreezeState;
  readonly sourceManifestRef: string;
  readonly sourceManifestDigest: string | null;
  readonly createdAt: string;
  readonly createdBy: string;
  readonly frozenAt: string | null;
  readonly frozenBy: string | null;
  readonly manifestDigest: string | null;
  readonly invalidationReason: string | null;
  readonly invalidatedAt: string | null;
  readonly invalidatedBy: string | null;
  readonly cases: readonly ObservationQualityCorpusCaseEntry[];
}

export interface ObservationQualityCorpusValidationSuccess {
  ok: true;
  issues: readonly [];
}

export interface ObservationQualityCorpusValidationFailure {
  ok: false;
  issues: readonly string[];
}

export type ObservationQualityCorpusValidationResult =
  ObservationQualityCorpusValidationSuccess | ObservationQualityCorpusValidationFailure;

export interface ObservationQualityCorpusIngestionSuccess {
  ok: true;
  manifest: ObservationQualityCorpusManifest;
  issues: readonly [];
}

export interface ObservationQualityCorpusIngestionFailure {
  ok: false;
  issues: readonly string[];
}

export type ObservationQualityCorpusIngestionResult =
  ObservationQualityCorpusIngestionSuccess | ObservationQualityCorpusIngestionFailure;

export interface ObservationQualityCorpusCategoryCoverageResult {
  readonly counts: Readonly<Record<ObservationQualityCorpusSlotCategory, number>>;
  readonly issues: readonly string[];
}

export interface ObservationQualityFrozenCorpusGateResult {
  readonly satisfied: boolean;
  readonly issues: readonly string[];
}

export const OBSERVATION_QUALITY_CORPUS_MANIFEST_DIGEST_SCOPE = {
  digestField: "manifestDigest",
  scope: "governed-corpus-content",
  includedManifestFields: [
    "schemaVersion",
    "protocolVersion",
    "benchmarkCorpusId",
    "annotationSelectionIndependencePolicy",
    "sourceManifestRef",
    "sourceManifestDigest",
    "createdAt",
    "createdBy",
    "cases",
  ],
  includedCaseProvenanceFields: ["annotatedBy", "annotatedAt", "selectedBy", "selectedAt"],
  excludedLifecycleFields: [
    "freezeState",
    "frozenAt",
    "frozenBy",
    "manifestDigest",
    "invalidationReason",
    "invalidatedAt",
    "invalidatedBy",
  ],
} as const;

const SLOT_ORDER_INDEX = new Map(
  OBSERVATION_QUALITY_CORPUS_SLOT_IDS.map((slotId, index) => [slotId, index] as const),
);

const MEDIA_TYPE_SET = new Set(EVAL_IMAGE_MEDIA_TYPES);
const CHALLENGE_TAG_SET = new Set(EVAL_VISUAL_STRATA);
const SOURCE_PROVENANCE_SET = new Set(OBSERVATION_QUALITY_CORPUS_SOURCE_PROVENANCES);
const ALLOWED_USAGE_STATUS_SET = new Set(OBSERVATION_QUALITY_CORPUS_ALLOWED_USAGE_STATUSES);
const ANNOTATION_STATUS_SET = new Set(OBSERVATION_QUALITY_CORPUS_ANNOTATION_STATUSES);
const VISUAL_CHARACTERISTIC_SET = new Set(OBSERVATION_QUALITY_CORPUS_VISUAL_CHARACTERISTICS);
const FREEZE_STATE_SET = new Set(OBSERVATION_QUALITY_CORPUS_FREEZE_STATES);
const OPPORTUNITY_STATE_SET = new Set(OBSERVATION_QUALITY_OPPORTUNITY_STATES);
const OPPORTUNITY_TAG_SET = new Set(OBSERVATION_QUALITY_OPPORTUNITY_TAGS);
const NEAR_DUPLICATE_REVIEW_SET = new Set(OBSERVATION_QUALITY_CORPUS_NEAR_DUPLICATE_REVIEWS);
const ANNOTATION_SELECTION_INDEPENDENCE_POLICY_SET = new Set(
  OBSERVATION_QUALITY_CORPUS_ANNOTATION_SELECTION_INDEPENDENCE_POLICIES,
);
const SOURCE_CASE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const BENCHMARK_CORPUS_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const SHA_256_HEX = /^[0-9a-f]{64}$/;
const REASONABLE_NOTE_MAX_LENGTH = 500;
const RATIONALE_MAX_LENGTH = 500;
const FORBIDDEN_RATIONALE_PATTERNS = [
  /\bA output\b/i,
  /\bA_PRIME output\b/i,
  /\bmodel output\b/i,
  /\bmodel score\b/i,
  /\bcompletion result\b/i,
  /\bhuman score\b/i,
  /\bprompt comparison\b/i,
  /\bcontract preference\b/i,
] as const;
const MANIFEST_RUNTIME_KEYS = [
  "schemaVersion",
  "protocolVersion",
  "benchmarkCorpusId",
  "annotationSelectionIndependencePolicy",
  "freezeState",
  "sourceManifestRef",
  "sourceManifestDigest",
  "createdAt",
  "createdBy",
  "frozenAt",
  "frozenBy",
  "manifestDigest",
  "invalidationReason",
  "invalidatedAt",
  "invalidatedBy",
  "cases",
] as const;
const CASE_ENTRY_RUNTIME_KEYS = [
  "slotId",
  "sourceCaseId",
  "sourceArtifactRef",
  "sourceManifestRecordDigest",
  "sourceImageDigest",
  "derivativeDigest",
  "mediaType",
  "width",
  "height",
  "beverageCategory",
  "challengeTags",
  "slotSupport",
  "sourceProvenance",
  "usageStatus",
  "selectionRationale",
  "annotationStatus",
  "observationOpportunityState",
  "observationOpportunityTags",
  "nearDuplicateReview",
  "annotatedBy",
  "annotatedAt",
  "selectedBy",
  "selectedAt",
] as const;
const CHALLENGE_TAG_SLOT_SUPPORT_RUNTIME_KEYS = ["kind", "tag"] as const;
const VISUAL_CHARACTERISTIC_SLOT_SUPPORT_RUNTIME_KEYS = ["kind", "characteristic", "note"] as const;

type UnknownRecord = Record<string, unknown>;

function success(): ObservationQualityCorpusValidationSuccess {
  return {
    ok: true,
    issues: [],
  };
}

function failure(issues: string[]): ObservationQualityCorpusValidationFailure {
  return {
    ok: false,
    issues,
  };
}

function ingestionSuccess(
  manifest: ObservationQualityCorpusManifest,
): ObservationQualityCorpusIngestionSuccess {
  return {
    ok: true,
    manifest,
    issues: [],
  };
}

function ingestionFailure(issues: string[]): ObservationQualityCorpusIngestionFailure {
  return {
    ok: false,
    issues,
  };
}

function nonEmptyText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function nonEmptyTrimmedBoundedText(value: string | null | undefined, maxLength: number): boolean {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value.length >= 1 &&
    value.length <= maxLength
  );
}

function uniqueValues<T>(values: readonly T[]): boolean {
  return new Set(values).size === values.length;
}

function isLowercaseSha256(value: string): boolean {
  return SHA_256_HEX.test(value);
}

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isSafeRepoRelativePath(value: string): boolean {
  if (value.length === 0 || value.includes("\0") || value.includes("\\")) return false;
  if (value.startsWith("/") || /^[A-Za-z]:/.test(value)) return false;
  const segments = value.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function hasForbiddenRationaleLanguage(value: string): boolean {
  return FORBIDDEN_RATIONALE_PATTERNS.some((pattern) => pattern.test(value));
}

function duplicatedValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort((left, right) => left.localeCompare(right));
}

function categoryCounts(): Record<ObservationQualityCorpusSlotCategory, number> {
  return {
    CLEAN_SIMPLE: 0,
    LOW_CONTRAST: 0,
    ROTATED_OR_VERTICAL: 0,
    DENSE_TEXT: 0,
    DECORATIVE_TYPE: 0,
    MULTI_PANEL_OR_WRAPAROUND: 0,
    AMBIGUITY_OR_COMPETING_TEXT: 0,
    ABSTENTION_OPPORTUNITY: 0,
  };
}

function canonicalCaseOrder(
  left: ObservationQualityCorpusCaseEntry,
  right: ObservationQualityCorpusCaseEntry,
): number {
  const leftIndex = SLOT_ORDER_INDEX.get(left.slotId) ?? Number.MAX_SAFE_INTEGER;
  const rightIndex = SLOT_ORDER_INDEX.get(right.slotId) ?? Number.MAX_SAFE_INTEGER;
  if (leftIndex !== rightIndex) return leftIndex - rightIndex;
  return left.sourceCaseId.localeCompare(right.sourceCaseId);
}

function stableSortedStrings(values: readonly string[]): readonly string[] {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function rootIssue(message: string): string {
  return `root: ${message}`;
}

function manifestIssue(path: string, message: string): string {
  return `${path}: ${message}`;
}

function caseIssue(index: number, field: string, message: string): string {
  return `cases[${index}].${field}: ${message}`;
}

function isRecordObject(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function propertyPath(basePath: string, key: string): string {
  return basePath.length === 0 ? key : `${basePath}.${key}`;
}

function pushUnexpectedPropertyIssues(
  basePath: string,
  record: UnknownRecord,
  allowedKeys: readonly string[],
  issues: string[],
): void {
  const allowedKeySet = new Set(allowedKeys);
  const unexpectedKeys = Object.keys(record)
    .filter((key) => !allowedKeySet.has(key))
    .sort((left, right) => left.localeCompare(right));
  for (const unexpectedKey of unexpectedKeys) {
    issues.push(manifestIssue(propertyPath(basePath, unexpectedKey), "is not allowed"));
  }
}

function readRequiredString(
  record: UnknownRecord,
  basePath: string,
  key: string,
  issues: string[],
): string | undefined {
  if (!(key in record)) {
    issues.push(manifestIssue(propertyPath(basePath, key), "is required"));
    return undefined;
  }
  const value = record[key];
  if (typeof value !== "string") {
    issues.push(manifestIssue(propertyPath(basePath, key), "must be a string"));
    return undefined;
  }
  return value;
}

function readRequiredNullableString(
  record: UnknownRecord,
  basePath: string,
  key: string,
  issues: string[],
): string | null | undefined {
  if (!(key in record)) {
    issues.push(manifestIssue(propertyPath(basePath, key), "is required"));
    return undefined;
  }
  const value = record[key];
  if (typeof value !== "string" && value !== null) {
    issues.push(manifestIssue(propertyPath(basePath, key), "must be a string or null"));
    return undefined;
  }
  return value;
}

function readRequiredNumber(
  record: UnknownRecord,
  basePath: string,
  key: string,
  issues: string[],
): number | undefined {
  if (!(key in record)) {
    issues.push(manifestIssue(propertyPath(basePath, key), "is required"));
    return undefined;
  }
  const value = record[key];
  if (typeof value !== "number" || Number.isNaN(value)) {
    issues.push(manifestIssue(propertyPath(basePath, key), "must be a number"));
    return undefined;
  }
  return value;
}

function readRequiredStringArray(
  record: UnknownRecord,
  basePath: string,
  key: string,
  issues: string[],
): string[] | undefined {
  if (!(key in record)) {
    issues.push(manifestIssue(propertyPath(basePath, key), "is required"));
    return undefined;
  }
  const value = record[key];
  if (!Array.isArray(value)) {
    issues.push(manifestIssue(propertyPath(basePath, key), "must be an array"));
    return undefined;
  }
  const items: string[] = [];
  let invalidItem = false;
  value.forEach((item, index) => {
    if (typeof item !== "string") {
      issues.push(manifestIssue(`${propertyPath(basePath, key)}[${index}]`, "must be a string"));
      invalidItem = true;
      return;
    }
    items.push(item);
  });
  return invalidItem ? undefined : items;
}

export function isObservationQualityCorpusSlotId(
  value: string,
): value is ObservationQualityCorpusSlotId {
  return (OBSERVATION_QUALITY_CORPUS_SLOT_IDS as readonly string[]).includes(value);
}

export function isObservationQualityCorpusSlotCategory(
  value: string,
): value is ObservationQualityCorpusSlotCategory {
  return (OBSERVATION_QUALITY_CORPUS_SLOT_CATEGORIES as readonly string[]).includes(value);
}

export function isObservationQualityCorpusChallengeTag(
  value: string,
): value is ObservationQualityCorpusChallengeTag {
  return CHALLENGE_TAG_SET.has(value as ObservationQualityCorpusChallengeTag);
}

export function isObservationQualityCorpusSourceProvenance(
  value: string,
): value is ObservationQualityCorpusSourceProvenance {
  return SOURCE_PROVENANCE_SET.has(value as ObservationQualityCorpusSourceProvenance);
}

export function isObservationQualityCorpusAllowedUsageStatus(
  value: string,
): value is ObservationQualityCorpusAllowedUsageStatus {
  return ALLOWED_USAGE_STATUS_SET.has(value as ObservationQualityCorpusAllowedUsageStatus);
}

export function isObservationQualityCorpusAnnotationStatus(
  value: string,
): value is ObservationQualityCorpusAnnotationStatus {
  return ANNOTATION_STATUS_SET.has(value as ObservationQualityCorpusAnnotationStatus);
}

export function isObservationQualityCorpusVisualCharacteristic(
  value: string,
): value is ObservationQualityCorpusVisualCharacteristic {
  return VISUAL_CHARACTERISTIC_SET.has(value as ObservationQualityCorpusVisualCharacteristic);
}

export function isObservationQualityCorpusFreezeState(
  value: string,
): value is ObservationQualityCorpusFreezeState {
  return FREEZE_STATE_SET.has(value as ObservationQualityCorpusFreezeState);
}

export function isObservationQualityCorpusNearDuplicateReview(
  value: string,
): value is ObservationQualityCorpusNearDuplicateReview {
  return NEAR_DUPLICATE_REVIEW_SET.has(value as ObservationQualityCorpusNearDuplicateReview);
}

export function isObservationQualityCorpusAnnotationSelectionIndependencePolicy(
  value: string,
): value is ObservationQualityCorpusAnnotationSelectionIndependencePolicy {
  return ANNOTATION_SELECTION_INDEPENDENCE_POLICY_SET.has(
    value as ObservationQualityCorpusAnnotationSelectionIndependencePolicy,
  );
}

export function observationQualityCorpusSlotCategory(
  slotId: ObservationQualityCorpusSlotId,
): ObservationQualityCorpusSlotCategory {
  return OBSERVATION_QUALITY_CORPUS_SLOT_CATEGORY_BY_SLOT_ID[slotId];
}

function challengeTagSupportsCategory(
  category: ObservationQualityCorpusSlotCategory,
  tag: ObservationQualityCorpusChallengeTag,
): boolean {
  switch (category) {
    case "CLEAN_SIMPLE":
      return tag === "simple-centered-brand";
    case "LOW_CONTRAST":
      return tag === "low-contrast";
    case "ROTATED_OR_VERTICAL":
      return tag === "vertical-mandatory-strip" || tag === "alcohol-at-side-or-rotated";
    case "DENSE_TEXT":
      return tag === "dense-text";
    case "DECORATIVE_TYPE":
      return tag === "decorative-or-script-brand";
    case "MULTI_PANEL_OR_WRAPAROUND":
      return tag === "multi-panel" || tag === "wraparound";
    case "AMBIGUITY_OR_COMPETING_TEXT":
      return tag === "multiple-brand-like-phrases" || tag === "genuinely-ambiguous";
    case "ABSTENTION_OPPORTUNITY":
      return tag === "missing-alcohol-statement" || tag === "genuinely-ambiguous";
    default: {
      const unreachable: never = category;
      throw new Error(`unreachable slot category: ${String(unreachable)}`);
    }
  }
}

function characteristicSupportsCategory(
  category: ObservationQualityCorpusSlotCategory,
  characteristic: ObservationQualityCorpusVisualCharacteristic,
): boolean {
  switch (category) {
    case "CLEAN_SIMPLE":
      return characteristic === "CLEAN_SIMPLE_LAYOUT";
    case "LOW_CONTRAST":
      return characteristic === "LOW_CONTRAST_PRESENTATION";
    case "ROTATED_OR_VERTICAL":
      return characteristic === "ROTATED_OR_VERTICAL_CONTENT";
    case "DENSE_TEXT":
      return characteristic === "DENSE_TEXT_CLUSTER";
    case "DECORATIVE_TYPE":
      return characteristic === "DECORATIVE_OR_SCRIPT_TYPE";
    case "MULTI_PANEL_OR_WRAPAROUND":
      return characteristic === "MULTI_PANEL_OR_WRAPAROUND_LAYOUT";
    case "AMBIGUITY_OR_COMPETING_TEXT":
      return (
        characteristic === "MULTIPLE_COMPETING_TEXT_CLUSTERS" ||
        characteristic === "AMBIGUOUS_SINGLE_TARGET"
      );
    case "ABSTENTION_OPPORTUNITY":
      return (
        characteristic === "ABSTENTION_RELEVANT_ABSENCE" ||
        characteristic === "ABSTENTION_RELEVANT_AMBIGUITY"
      );
    default: {
      const unreachable: never = category;
      throw new Error(`unreachable slot category: ${String(unreachable)}`);
    }
  }
}

export function validateObservationQualityCorpusSlotSupport(
  entry: ObservationQualityCorpusCaseEntry,
): ObservationQualityCorpusValidationResult {
  const issues: string[] = [];

  if (!isObservationQualityCorpusSlotId(entry.slotId)) {
    issues.push(`slotId must be one of the approved slot IDs, received ${String(entry.slotId)}`);
    return failure(issues);
  }

  const category = observationQualityCorpusSlotCategory(entry.slotId);
  if (entry.slotSupport.kind === "CHALLENGE_TAG") {
    if (!isObservationQualityCorpusChallengeTag(entry.slotSupport.tag)) {
      issues.push(
        `slotSupport.tag must be a committed challenge tag, received ${String(entry.slotSupport.tag)}`,
      );
    } else {
      if (!entry.challengeTags.includes(entry.slotSupport.tag)) {
        issues.push("slotSupport.tag must also appear in challengeTags");
      }
      if (!challengeTagSupportsCategory(category, entry.slotSupport.tag)) {
        issues.push(`${entry.slotId} requires slot support compatible with ${category}`);
      }
    }
  } else if (entry.slotSupport.kind === "HUMAN_REVIEWED_VISUAL_CHARACTERISTIC") {
    if (!isObservationQualityCorpusVisualCharacteristic(entry.slotSupport.characteristic)) {
      issues.push(
        `slotSupport.characteristic must be a supported visual characteristic, received ${String(entry.slotSupport.characteristic)}`,
      );
    } else if (!characteristicSupportsCategory(category, entry.slotSupport.characteristic)) {
      issues.push(`${entry.slotId} requires slot support compatible with ${category}`);
    }
    if (!nonEmptyTrimmedBoundedText(entry.slotSupport.note, REASONABLE_NOTE_MAX_LENGTH)) {
      issues.push(`slotSupport.note must be 1-${REASONABLE_NOTE_MAX_LENGTH} trimmed characters`);
    }
  } else {
    issues.push(
      `slotSupport.kind is unsupported: ${String((entry.slotSupport as { kind?: unknown }).kind)}`,
    );
  }

  if (category === "ABSTENTION_OPPORTUNITY") {
    const opportunityStateSupports =
      entry.observationOpportunityState === "NO_CLEAR_OBSERVATION_OPPORTUNITY" ||
      entry.observationOpportunityState === "UNCERTAIN";
    const explicitSlotSupport =
      entry.slotSupport.kind === "CHALLENGE_TAG"
        ? challengeTagSupportsCategory(category, entry.slotSupport.tag)
        : characteristicSupportsCategory(category, entry.slotSupport.characteristic);
    if (!opportunityStateSupports && !explicitSlotSupport) {
      issues.push(
        `${entry.slotId} requires NO_CLEAR_OBSERVATION_OPPORTUNITY, UNCERTAIN, or explicit abstention-relevant slot support`,
      );
    }
  }

  return issues.length === 0 ? success() : failure(issues);
}

function ingestObservationQualityCorpusSlotSupport(
  value: unknown,
  basePath: string,
  issues: string[],
): ObservationQualityCorpusSlotSupport | undefined {
  if (!isRecordObject(value)) {
    issues.push(manifestIssue(basePath, "must be an object"));
    return undefined;
  }

  const kind = readRequiredString(value, basePath, "kind", issues);
  if (kind === "CHALLENGE_TAG") {
    const startCount = issues.length;
    pushUnexpectedPropertyIssues(basePath, value, CHALLENGE_TAG_SLOT_SUPPORT_RUNTIME_KEYS, issues);
    const tag = readRequiredString(value, basePath, "tag", issues);
    if (issues.length !== startCount || tag === undefined) {
      return undefined;
    }
    return {
      kind: "CHALLENGE_TAG",
      tag: tag as ObservationQualityCorpusChallengeTag,
    };
  }

  if (kind === "HUMAN_REVIEWED_VISUAL_CHARACTERISTIC") {
    const startCount = issues.length;
    pushUnexpectedPropertyIssues(
      basePath,
      value,
      VISUAL_CHARACTERISTIC_SLOT_SUPPORT_RUNTIME_KEYS,
      issues,
    );
    const characteristic = readRequiredString(value, basePath, "characteristic", issues);
    const note = readRequiredString(value, basePath, "note", issues);
    if (issues.length !== startCount || characteristic === undefined || note === undefined) {
      return undefined;
    }
    return {
      kind: "HUMAN_REVIEWED_VISUAL_CHARACTERISTIC",
      characteristic: characteristic as ObservationQualityCorpusVisualCharacteristic,
      note,
    };
  }

  pushUnexpectedPropertyIssues(basePath, value, ["kind"], issues);
  if (kind !== undefined) {
    issues.push(
      manifestIssue(
        `${basePath}.kind`,
        "must be one of CHALLENGE_TAG, HUMAN_REVIEWED_VISUAL_CHARACTERISTIC",
      ),
    );
  }
  return undefined;
}

function ingestObservationQualityCorpusCaseEntry(
  value: unknown,
  index: number,
  issues: string[],
): ObservationQualityCorpusCaseEntry | undefined {
  const basePath = `cases[${index}]`;
  if (!isRecordObject(value)) {
    issues.push(manifestIssue(basePath, "must be an object"));
    return undefined;
  }

  const startCount = issues.length;
  pushUnexpectedPropertyIssues(basePath, value, CASE_ENTRY_RUNTIME_KEYS, issues);

  const slotId = readRequiredString(value, basePath, "slotId", issues);
  const sourceCaseId = readRequiredString(value, basePath, "sourceCaseId", issues);
  const sourceArtifactRef = readRequiredString(value, basePath, "sourceArtifactRef", issues);
  const sourceManifestRecordDigest = readRequiredString(
    value,
    basePath,
    "sourceManifestRecordDigest",
    issues,
  );
  const sourceImageDigest = readRequiredString(value, basePath, "sourceImageDigest", issues);
  const derivativeDigest = readRequiredString(value, basePath, "derivativeDigest", issues);
  const mediaType = readRequiredString(value, basePath, "mediaType", issues);
  const width = readRequiredNumber(value, basePath, "width", issues);
  const height = readRequiredNumber(value, basePath, "height", issues);
  const beverageCategory = readRequiredString(value, basePath, "beverageCategory", issues);
  const challengeTags = readRequiredStringArray(value, basePath, "challengeTags", issues);
  const slotSupport = ingestObservationQualityCorpusSlotSupport(
    value.slotSupport,
    `${basePath}.slotSupport`,
    issues,
  );
  const sourceProvenance = readRequiredString(value, basePath, "sourceProvenance", issues);
  const usageStatus = readRequiredString(value, basePath, "usageStatus", issues);
  const selectionRationale = readRequiredString(value, basePath, "selectionRationale", issues);
  const annotationStatus = readRequiredString(value, basePath, "annotationStatus", issues);
  const observationOpportunityState = readRequiredString(
    value,
    basePath,
    "observationOpportunityState",
    issues,
  );
  const observationOpportunityTags = readRequiredStringArray(
    value,
    basePath,
    "observationOpportunityTags",
    issues,
  );
  const nearDuplicateReview = readRequiredString(value, basePath, "nearDuplicateReview", issues);
  const annotatedBy = readRequiredString(value, basePath, "annotatedBy", issues);
  const annotatedAt = readRequiredString(value, basePath, "annotatedAt", issues);
  const selectedBy = readRequiredString(value, basePath, "selectedBy", issues);
  const selectedAt = readRequiredString(value, basePath, "selectedAt", issues);

  if (issues.length !== startCount) {
    return undefined;
  }
  if (
    slotId === undefined ||
    sourceCaseId === undefined ||
    sourceArtifactRef === undefined ||
    sourceManifestRecordDigest === undefined ||
    sourceImageDigest === undefined ||
    derivativeDigest === undefined ||
    mediaType === undefined ||
    width === undefined ||
    height === undefined ||
    beverageCategory === undefined ||
    challengeTags === undefined ||
    slotSupport === undefined ||
    sourceProvenance === undefined ||
    usageStatus === undefined ||
    selectionRationale === undefined ||
    annotationStatus === undefined ||
    observationOpportunityState === undefined ||
    observationOpportunityTags === undefined ||
    nearDuplicateReview === undefined ||
    annotatedBy === undefined ||
    annotatedAt === undefined ||
    selectedBy === undefined ||
    selectedAt === undefined
  ) {
    return undefined;
  }

  return {
    slotId: slotId as ObservationQualityCorpusSlotId,
    sourceCaseId,
    sourceArtifactRef,
    sourceManifestRecordDigest,
    sourceImageDigest,
    derivativeDigest,
    mediaType: mediaType as EvalImageMediaType,
    width,
    height,
    beverageCategory: beverageCategory as "wine",
    challengeTags: challengeTags as readonly ObservationQualityCorpusChallengeTag[],
    slotSupport,
    sourceProvenance: sourceProvenance as ObservationQualityCorpusSourceProvenance,
    usageStatus: usageStatus as ObservationQualityCorpusAllowedUsageStatus,
    selectionRationale,
    annotationStatus: annotationStatus as ObservationQualityCorpusAnnotationStatus,
    observationOpportunityState: observationOpportunityState as ObservationQualityOpportunityState,
    observationOpportunityTags:
      observationOpportunityTags as readonly ObservationQualityOpportunityTag[],
    nearDuplicateReview: nearDuplicateReview as ObservationQualityCorpusNearDuplicateReview,
    annotatedBy,
    annotatedAt,
    selectedBy,
    selectedAt,
  };
}

function ingestObservationQualityCorpusManifestObject(
  value: unknown,
  issues: string[],
): ObservationQualityCorpusManifest | undefined {
  if (!isRecordObject(value)) {
    issues.push(rootIssue("must be an object"));
    return undefined;
  }

  const startCount = issues.length;
  pushUnexpectedPropertyIssues("", value, MANIFEST_RUNTIME_KEYS, issues);

  const schemaVersion = readRequiredString(value, "", "schemaVersion", issues);
  const protocolVersion = readRequiredString(value, "", "protocolVersion", issues);
  const benchmarkCorpusId = readRequiredString(value, "", "benchmarkCorpusId", issues);
  const annotationSelectionIndependencePolicy = readRequiredString(
    value,
    "",
    "annotationSelectionIndependencePolicy",
    issues,
  );
  const freezeState = readRequiredString(value, "", "freezeState", issues);
  const sourceManifestRef = readRequiredString(value, "", "sourceManifestRef", issues);
  const sourceManifestDigest = readRequiredNullableString(
    value,
    "",
    "sourceManifestDigest",
    issues,
  );
  const createdAt = readRequiredString(value, "", "createdAt", issues);
  const createdBy = readRequiredString(value, "", "createdBy", issues);
  const frozenAt = readRequiredNullableString(value, "", "frozenAt", issues);
  const frozenBy = readRequiredNullableString(value, "", "frozenBy", issues);
  const manifestDigest = readRequiredNullableString(value, "", "manifestDigest", issues);
  const invalidationReason = readRequiredNullableString(value, "", "invalidationReason", issues);
  const invalidatedAt = readRequiredNullableString(value, "", "invalidatedAt", issues);
  const invalidatedBy = readRequiredNullableString(value, "", "invalidatedBy", issues);

  let cases: ObservationQualityCorpusCaseEntry[] | undefined;
  if (!("cases" in value)) {
    issues.push(manifestIssue("cases", "is required"));
  } else if (!Array.isArray(value.cases)) {
    issues.push(manifestIssue("cases", "must be an array"));
  } else {
    const parsedCases: ObservationQualityCorpusCaseEntry[] = [];
    value.cases.forEach((entry, index) => {
      const parsedEntry = ingestObservationQualityCorpusCaseEntry(entry, index, issues);
      if (parsedEntry !== undefined) {
        parsedCases.push(parsedEntry);
      }
    });
    if (parsedCases.length === value.cases.length) {
      cases = parsedCases;
    }
  }

  if (issues.length !== startCount) {
    return undefined;
  }
  if (
    schemaVersion === undefined ||
    protocolVersion === undefined ||
    benchmarkCorpusId === undefined ||
    annotationSelectionIndependencePolicy === undefined ||
    freezeState === undefined ||
    sourceManifestRef === undefined ||
    sourceManifestDigest === undefined ||
    createdAt === undefined ||
    createdBy === undefined ||
    frozenAt === undefined ||
    frozenBy === undefined ||
    manifestDigest === undefined ||
    invalidationReason === undefined ||
    invalidatedAt === undefined ||
    invalidatedBy === undefined ||
    cases === undefined
  ) {
    return undefined;
  }

  return {
    schemaVersion: schemaVersion as typeof OBSERVATION_QUALITY_CORPUS_MANIFEST_SCHEMA_VERSION,
    protocolVersion: protocolVersion as typeof OBSERVATION_QUALITY_BENCHMARK_PROTOCOL_VERSION,
    benchmarkCorpusId,
    annotationSelectionIndependencePolicy:
      annotationSelectionIndependencePolicy as ObservationQualityCorpusAnnotationSelectionIndependencePolicy,
    freezeState: freezeState as ObservationQualityCorpusFreezeState,
    sourceManifestRef,
    sourceManifestDigest,
    createdAt,
    createdBy,
    frozenAt,
    frozenBy,
    manifestDigest,
    invalidationReason,
    invalidatedAt,
    invalidatedBy,
    cases,
  };
}

export function ingestObservationQualityCorpusManifest(
  value: unknown,
): ObservationQualityCorpusIngestionResult {
  const issues: string[] = [];
  const manifest = ingestObservationQualityCorpusManifestObject(value, issues);
  if (manifest === undefined) {
    return ingestionFailure(issues);
  }

  const validation = validateObservationQualityCorpusManifest(manifest);
  if (!validation.ok) {
    return ingestionFailure([...validation.issues]);
  }

  return ingestionSuccess(manifest);
}

function validateObservationQualityCorpusCaseEntry(
  entry: ObservationQualityCorpusCaseEntry,
  index: number,
): ObservationQualityCorpusValidationResult {
  const issues: string[] = [];

  if (!isObservationQualityCorpusSlotId(entry.slotId)) {
    issues.push(
      caseIssue(index, "slotId", `must be an approved slot ID, received ${String(entry.slotId)}`),
    );
  }
  if (!nonEmptyText(entry.sourceCaseId) || !SOURCE_CASE_IDENTIFIER.test(entry.sourceCaseId)) {
    issues.push(
      caseIssue(
        index,
        "sourceCaseId",
        "must be a non-empty bounded identifier using letters, digits, ., _, or -",
      ),
    );
  }
  if (!nonEmptyText(entry.sourceArtifactRef) || !isSafeRepoRelativePath(entry.sourceArtifactRef)) {
    issues.push(
      caseIssue(index, "sourceArtifactRef", "must be a safe POSIX repository-relative path"),
    );
  }
  if (!isLowercaseSha256(entry.sourceManifestRecordDigest)) {
    issues.push(
      caseIssue(
        index,
        "sourceManifestRecordDigest",
        "must be a 64-character lowercase SHA-256 hex digest",
      ),
    );
  }
  if (!isLowercaseSha256(entry.sourceImageDigest)) {
    issues.push(
      caseIssue(index, "sourceImageDigest", "must be a 64-character lowercase SHA-256 hex digest"),
    );
  }
  if (!isLowercaseSha256(entry.derivativeDigest)) {
    issues.push(
      caseIssue(index, "derivativeDigest", "must be a 64-character lowercase SHA-256 hex digest"),
    );
  }
  if (!MEDIA_TYPE_SET.has(entry.mediaType)) {
    issues.push(
      caseIssue(index, "mediaType", `must be one of ${EVAL_IMAGE_MEDIA_TYPES.join(", ")}`),
    );
  }
  if (!isPositiveInteger(entry.width)) {
    issues.push(caseIssue(index, "width", "must be a positive integer"));
  }
  if (!isPositiveInteger(entry.height)) {
    issues.push(caseIssue(index, "height", "must be a positive integer"));
  }
  if (entry.beverageCategory !== "wine") {
    issues.push(
      caseIssue(
        index,
        "beverageCategory",
        `must be wine, received ${String(entry.beverageCategory)}`,
      ),
    );
  }
  if (!Array.isArray(entry.challengeTags) || entry.challengeTags.length === 0) {
    issues.push(
      caseIssue(index, "challengeTags", "must contain at least one committed challenge tag"),
    );
  } else {
    if (!uniqueValues(entry.challengeTags)) {
      issues.push(caseIssue(index, "challengeTags", "must be unique"));
    }
    const invalidChallengeTags = entry.challengeTags.filter(
      (tag) => !isObservationQualityCorpusChallengeTag(tag),
    );
    if (invalidChallengeTags.length > 0) {
      issues.push(
        caseIssue(
          index,
          "challengeTags",
          `contains unsupported challenge tags: ${invalidChallengeTags.join(", ")}`,
        ),
      );
    }
  }
  if (!isObservationQualityCorpusSourceProvenance(entry.sourceProvenance)) {
    issues.push(
      caseIssue(
        index,
        "sourceProvenance",
        `must be one of ${OBSERVATION_QUALITY_CORPUS_SOURCE_PROVENANCES.join(", ")}`,
      ),
    );
  }
  if (!isObservationQualityCorpusAllowedUsageStatus(entry.usageStatus)) {
    issues.push(
      caseIssue(
        index,
        "usageStatus",
        `must be one of ${OBSERVATION_QUALITY_CORPUS_ALLOWED_USAGE_STATUSES.join(", ")}`,
      ),
    );
  }
  if (!nonEmptyTrimmedBoundedText(entry.selectionRationale, RATIONALE_MAX_LENGTH)) {
    issues.push(
      caseIssue(
        index,
        "selectionRationale",
        `must be 1-${RATIONALE_MAX_LENGTH} trimmed characters`,
      ),
    );
  } else if (hasForbiddenRationaleLanguage(entry.selectionRationale)) {
    issues.push(
      caseIssue(index, "selectionRationale", "contains forbidden benchmark-result language"),
    );
  }
  if (!isObservationQualityCorpusAnnotationStatus(entry.annotationStatus)) {
    issues.push(
      caseIssue(
        index,
        "annotationStatus",
        `must be one of ${OBSERVATION_QUALITY_CORPUS_ANNOTATION_STATUSES.join(", ")}`,
      ),
    );
  }
  if (!OPPORTUNITY_STATE_SET.has(entry.observationOpportunityState)) {
    issues.push(
      caseIssue(
        index,
        "observationOpportunityState",
        "must reuse the Slice 1 opportunity-state vocabulary",
      ),
    );
  }
  if (!Array.isArray(entry.observationOpportunityTags)) {
    issues.push(caseIssue(index, "observationOpportunityTags", "must be an array"));
  } else {
    if (!uniqueValues(entry.observationOpportunityTags)) {
      issues.push(caseIssue(index, "observationOpportunityTags", "must be unique"));
    }
    const invalidTags = entry.observationOpportunityTags.filter(
      (tag) => !OPPORTUNITY_TAG_SET.has(tag),
    );
    if (invalidTags.length > 0) {
      issues.push(
        caseIssue(
          index,
          "observationOpportunityTags",
          `contains unsupported opportunity tags: ${invalidTags.join(", ")}`,
        ),
      );
    }
  }
  if (!isObservationQualityCorpusNearDuplicateReview(entry.nearDuplicateReview)) {
    issues.push(
      caseIssue(
        index,
        "nearDuplicateReview",
        `must be one of ${OBSERVATION_QUALITY_CORPUS_NEAR_DUPLICATE_REVIEWS.join(", ")}`,
      ),
    );
  } else if (entry.nearDuplicateReview === "INTENTIONAL_PAIR") {
    issues.push(
      caseIssue(
        index,
        "nearDuplicateReview",
        "INTENTIONAL_PAIR is not permitted in the Phase 1 frozen corpus",
      ),
    );
  }
  if (!nonEmptyText(entry.annotatedBy)) {
    issues.push(caseIssue(index, "annotatedBy", "must be a non-empty string"));
  }
  if (!nonEmptyText(entry.annotatedAt)) {
    issues.push(caseIssue(index, "annotatedAt", "must be a non-empty string"));
  }
  if (!nonEmptyText(entry.selectedBy)) {
    issues.push(caseIssue(index, "selectedBy", "must be a non-empty string"));
  }
  if (!nonEmptyText(entry.selectedAt)) {
    issues.push(caseIssue(index, "selectedAt", "must be a non-empty string"));
  }

  const slotSupport = validateObservationQualityCorpusSlotSupport(entry);
  if (!slotSupport.ok) {
    for (const issue of slotSupport.issues) {
      issues.push(caseIssue(index, "slotSupport", issue));
    }
  }

  return issues.length === 0 ? success() : failure(issues);
}

export function evaluateObservationQualityCorpusCategoryCoverage(
  cases: readonly ObservationQualityCorpusCaseEntry[],
): ObservationQualityCorpusCategoryCoverageResult {
  const counts = categoryCounts();

  for (const entry of cases) {
    if (!isObservationQualityCorpusSlotId(entry.slotId)) continue;
    counts[observationQualityCorpusSlotCategory(entry.slotId)] += 1;
  }

  const issues = OBSERVATION_QUALITY_CORPUS_SLOT_CATEGORIES.flatMap((category) => {
    const actual = counts[category];
    return actual === 2
      ? []
      : [`slot category ${category} must contain exactly 2 cases (expected 2, received ${actual})`];
  });

  return {
    counts,
    issues,
  };
}

/**
 * Validates a trusted typed manifest object.
 * Use ingestObservationQualityCorpusManifest for arbitrary runtime payloads.
 */
export function validateObservationQualityCorpusManifest(
  manifest: ObservationQualityCorpusManifest,
): ObservationQualityCorpusValidationResult {
  const issues: string[] = [];

  if (manifest.schemaVersion !== OBSERVATION_QUALITY_CORPUS_MANIFEST_SCHEMA_VERSION) {
    issues.push(
      manifestIssue(
        "schemaVersion",
        `must be ${OBSERVATION_QUALITY_CORPUS_MANIFEST_SCHEMA_VERSION}`,
      ),
    );
  }
  if (manifest.protocolVersion !== OBSERVATION_QUALITY_BENCHMARK_PROTOCOL_VERSION) {
    issues.push(
      manifestIssue("protocolVersion", `must be ${OBSERVATION_QUALITY_BENCHMARK_PROTOCOL_VERSION}`),
    );
  }
  if (
    !nonEmptyText(manifest.benchmarkCorpusId) ||
    manifest.benchmarkCorpusId.length > 100 ||
    !BENCHMARK_CORPUS_IDENTIFIER.test(manifest.benchmarkCorpusId)
  ) {
    issues.push(
      manifestIssue(
        "benchmarkCorpusId",
        "must be a non-empty bounded identifier using letters, digits, ., _, or -",
      ),
    );
  }
  if (
    !isObservationQualityCorpusAnnotationSelectionIndependencePolicy(
      manifest.annotationSelectionIndependencePolicy,
    )
  ) {
    issues.push(
      manifestIssue(
        "annotationSelectionIndependencePolicy",
        `must be one of ${OBSERVATION_QUALITY_CORPUS_ANNOTATION_SELECTION_INDEPENDENCE_POLICIES.join(", ")}`,
      ),
    );
  }
  if (
    !nonEmptyText(manifest.sourceManifestRef) ||
    !isSafeRepoRelativePath(manifest.sourceManifestRef)
  ) {
    issues.push(
      manifestIssue("sourceManifestRef", "must be a safe POSIX repository-relative path"),
    );
  }
  if (manifest.sourceManifestDigest !== null && !isLowercaseSha256(manifest.sourceManifestDigest)) {
    issues.push(
      manifestIssue(
        "sourceManifestDigest",
        "must be null or a 64-character lowercase SHA-256 hex digest",
      ),
    );
  }
  if (!nonEmptyText(manifest.createdAt)) {
    issues.push(manifestIssue("createdAt", "must be a non-empty string"));
  }
  if (!nonEmptyText(manifest.createdBy)) {
    issues.push(manifestIssue("createdBy", "must be a non-empty string"));
  }
  if (!isObservationQualityCorpusFreezeState(manifest.freezeState)) {
    issues.push(
      manifestIssue(
        "freezeState",
        `must be one of ${OBSERVATION_QUALITY_CORPUS_FREEZE_STATES.join(", ")}`,
      ),
    );
  } else {
    if (manifest.freezeState === "DRAFT") {
      if (manifest.manifestDigest !== null) {
        issues.push(manifestIssue("manifestDigest", "must be null while freezeState is DRAFT"));
      }
      if (manifest.frozenAt !== null) {
        issues.push(manifestIssue("frozenAt", "must be null while freezeState is DRAFT"));
      }
      if (manifest.frozenBy !== null) {
        issues.push(manifestIssue("frozenBy", "must be null while freezeState is DRAFT"));
      }
      if (
        manifest.invalidationReason !== null ||
        manifest.invalidatedAt !== null ||
        manifest.invalidatedBy !== null
      ) {
        issues.push(
          manifestIssue(
            "invalidationReason",
            "invalidation metadata must be null while freezeState is DRAFT",
          ),
        );
      }
    }

    if (manifest.freezeState === "FROZEN") {
      if (!nonEmptyText(manifest.frozenAt)) {
        issues.push(manifestIssue("frozenAt", "must be present when freezeState is FROZEN"));
      }
      if (!nonEmptyText(manifest.frozenBy)) {
        issues.push(manifestIssue("frozenBy", "must be present when freezeState is FROZEN"));
      }
      if (manifest.sourceManifestDigest === null) {
        issues.push(
          manifestIssue("sourceManifestDigest", "must be present when freezeState is FROZEN"),
        );
      }
      if (manifest.manifestDigest === null) {
        issues.push(manifestIssue("manifestDigest", "must be present when freezeState is FROZEN"));
      } else if (!isLowercaseSha256(manifest.manifestDigest)) {
        issues.push(
          manifestIssue("manifestDigest", "must be a 64-character lowercase SHA-256 hex digest"),
        );
      }
      if (
        manifest.invalidationReason !== null ||
        manifest.invalidatedAt !== null ||
        manifest.invalidatedBy !== null
      ) {
        issues.push(manifestIssue("invalidationReason", "must be null when freezeState is FROZEN"));
      }
    }

    if (manifest.freezeState === "INVALIDATED") {
      if (!nonEmptyText(manifest.invalidationReason)) {
        issues.push(
          manifestIssue("invalidationReason", "must be present when freezeState is INVALIDATED"),
        );
      }
      if (!nonEmptyText(manifest.invalidatedAt)) {
        issues.push(
          manifestIssue("invalidatedAt", "must be present when freezeState is INVALIDATED"),
        );
      }
      if (!nonEmptyText(manifest.invalidatedBy)) {
        issues.push(
          manifestIssue("invalidatedBy", "must be present when freezeState is INVALIDATED"),
        );
      }
    }
  }

  if (manifest.manifestDigest !== null && !isLowercaseSha256(manifest.manifestDigest)) {
    issues.push(
      manifestIssue(
        "manifestDigest",
        "must be null or a 64-character lowercase SHA-256 hex digest",
      ),
    );
  }

  if (manifest.cases.length !== OBSERVATION_QUALITY_CASE_COUNT) {
    issues.push(
      manifestIssue(
        "cases",
        `must contain exactly ${OBSERVATION_QUALITY_CASE_COUNT} entries, received ${manifest.cases.length}`,
      ),
    );
  }

  manifest.cases.forEach((entry, index) => {
    const validation = validateObservationQualityCorpusCaseEntry(entry, index);
    if (!validation.ok) {
      issues.push(...validation.issues);
    }
    if (
      manifest.annotationSelectionIndependencePolicy === "REQUIRED" &&
      entry.selectedBy === entry.annotatedBy
    ) {
      issues.push(
        caseIssue(
          index,
          "annotatedBy",
          "must differ from selectedBy when annotationSelectionIndependencePolicy is REQUIRED",
        ),
      );
    }
  });

  const slotIds = manifest.cases
    .filter((entry) => nonEmptyText(entry.slotId))
    .map((entry) => String(entry.slotId));
  const sourceCaseIds = manifest.cases
    .filter((entry) => nonEmptyText(entry.sourceCaseId))
    .map((entry) => entry.sourceCaseId);
  const sourceImageDigests = manifest.cases
    .filter((entry) => nonEmptyText(entry.sourceImageDigest))
    .map((entry) => entry.sourceImageDigest);
  const derivativeDigests = manifest.cases
    .filter((entry) => nonEmptyText(entry.derivativeDigest))
    .map((entry) => entry.derivativeDigest);
  const artifactRefs = manifest.cases
    .filter((entry) => nonEmptyText(entry.sourceArtifactRef))
    .map((entry) => entry.sourceArtifactRef);

  for (const duplicate of duplicatedValues(slotIds)) {
    issues.push(manifestIssue("cases", `duplicate slotId ${duplicate}`));
  }
  for (const duplicate of duplicatedValues(sourceCaseIds)) {
    issues.push(manifestIssue("cases", `duplicate sourceCaseId ${duplicate}`));
  }
  for (const duplicate of duplicatedValues(sourceImageDigests)) {
    issues.push(manifestIssue("cases", `duplicate sourceImageDigest ${duplicate}`));
  }
  for (const duplicate of duplicatedValues(derivativeDigests)) {
    issues.push(manifestIssue("cases", `duplicate derivativeDigest ${duplicate}`));
  }
  for (const duplicate of duplicatedValues(artifactRefs)) {
    issues.push(manifestIssue("cases", `duplicate sourceArtifactRef ${duplicate}`));
  }

  const presentSlots = new Set(
    manifest.cases
      .map((entry) => entry.slotId)
      .filter((slotId): slotId is ObservationQualityCorpusSlotId =>
        isObservationQualityCorpusSlotId(slotId),
      ),
  );
  for (const slotId of OBSERVATION_QUALITY_CORPUS_SLOT_IDS) {
    if (!presentSlots.has(slotId)) {
      issues.push(manifestIssue("cases", `missing required slot ${slotId}`));
    }
  }

  const coverage = evaluateObservationQualityCorpusCategoryCoverage(manifest.cases);
  issues.push(...coverage.issues);

  return issues.length === 0 ? success() : failure(issues);
}

function digestProjectionCase(entry: ObservationQualityCorpusCaseEntry): Record<string, unknown> {
  return {
    slotId: entry.slotId,
    sourceCaseId: entry.sourceCaseId,
    sourceArtifactRef: entry.sourceArtifactRef,
    sourceManifestRecordDigest: entry.sourceManifestRecordDigest,
    sourceImageDigest: entry.sourceImageDigest,
    derivativeDigest: entry.derivativeDigest,
    mediaType: entry.mediaType,
    width: entry.width,
    height: entry.height,
    beverageCategory: entry.beverageCategory,
    challengeTags: stableSortedStrings(entry.challengeTags),
    slotSupport:
      entry.slotSupport.kind === "CHALLENGE_TAG"
        ? {
            kind: entry.slotSupport.kind,
            tag: entry.slotSupport.tag,
          }
        : {
            kind: entry.slotSupport.kind,
            characteristic: entry.slotSupport.characteristic,
            note: entry.slotSupport.note,
          },
    sourceProvenance: entry.sourceProvenance,
    usageStatus: entry.usageStatus,
    selectionRationale: entry.selectionRationale,
    annotationStatus: entry.annotationStatus,
    observationOpportunityState: entry.observationOpportunityState,
    observationOpportunityTags: stableSortedStrings(entry.observationOpportunityTags),
    nearDuplicateReview: entry.nearDuplicateReview,
    annotatedBy: entry.annotatedBy,
    annotatedAt: entry.annotatedAt,
    selectedBy: entry.selectedBy,
    selectedAt: entry.selectedAt,
  };
}

/**
 * manifestDigest binds governed corpus content and provenance, not lifecycle state.
 */
export function canonicalizeObservationQualityCorpusManifestForDigest(
  manifest: ObservationQualityCorpusManifest,
): string {
  return canonicalStringify({
    schemaVersion: manifest.schemaVersion,
    protocolVersion: manifest.protocolVersion,
    benchmarkCorpusId: manifest.benchmarkCorpusId,
    annotationSelectionIndependencePolicy: manifest.annotationSelectionIndependencePolicy,
    sourceManifestRef: manifest.sourceManifestRef,
    sourceManifestDigest: manifest.sourceManifestDigest,
    createdAt: manifest.createdAt,
    createdBy: manifest.createdBy,
    cases: [...manifest.cases].sort(canonicalCaseOrder).map(digestProjectionCase),
  });
}

export function computeObservationQualityCorpusManifestDigest(
  manifest: ObservationQualityCorpusManifest,
): string {
  return sha256Hex(
    new TextEncoder().encode(canonicalizeObservationQualityCorpusManifestForDigest(manifest)),
  );
}

export function evaluateObservationQualityFrozenCorpusGate(
  manifest: ObservationQualityCorpusManifest,
): ObservationQualityFrozenCorpusGateResult {
  const issues: string[] = [];
  const validation = validateObservationQualityCorpusManifest(manifest);
  if (!validation.ok) {
    issues.push(...validation.issues);
  }

  if (manifest.freezeState !== "FROZEN") {
    issues.push(`freezeState must be FROZEN, received ${String(manifest.freezeState)}`);
  }

  if (
    manifest.freezeState === "FROZEN" &&
    typeof manifest.manifestDigest === "string" &&
    isLowercaseSha256(manifest.manifestDigest)
  ) {
    const recomputed = computeObservationQualityCorpusManifestDigest(manifest);
    if (recomputed !== manifest.manifestDigest) {
      issues.push("manifestDigest does not match the canonical manifest digest");
    }
  }

  return {
    satisfied: issues.length === 0,
    issues,
  };
}

export function evaluateObservationQualityFrozenCorpusGatePayload(
  value: unknown,
): ObservationQualityFrozenCorpusGateResult {
  const ingestion = ingestObservationQualityCorpusManifest(value);
  if (!ingestion.ok) {
    return {
      satisfied: false,
      issues: [...ingestion.issues],
    };
  }

  return evaluateObservationQualityFrozenCorpusGate(ingestion.manifest);
}
