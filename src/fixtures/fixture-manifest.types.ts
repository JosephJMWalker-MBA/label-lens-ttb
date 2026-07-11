/**
 * Source-chain provenance and privacy contract for a committed test fixture.
 *
 * A fixture manifest exists so a repository-safe derivative can never be confused
 * with its source. This v2 model records, for an independent reviewer:
 *   - where the public approved-label asset came from (registry authority, TTB
 *     ID, public URL, retrieval method) and what source bytes were NOT retained;
 *   - for every committed derivative: its id, filename, role, on-disk identity
 *     (dimensions, byte size, SHA-256), its parent/source relationship, the
 *     ordered transformation steps, whether any pixels/text were manually
 *     corrected, its privacy exclusions, and its intended use.
 *
 * Unknown facts are represented explicitly (`unknown`, `not_retained`,
 * `relationship_not_proven`) rather than invented, and no excluded content
 * (certificate fields, contact blocks, signatures) is ever stored.
 */

export const FIXTURE_MANIFEST_SCHEMA_VERSION = "label-fixture-manifest.v2" as const;

/** Explicit sentinel for a source dimension/digest that was never retained. */
export const NOT_RETAINED = "not_retained" as const;
/** Explicit sentinel for a fact that was not recorded. */
export const UNKNOWN = "unknown" as const;
/** Explicit sentinel for a derivative relationship that is not proven. */
export const RELATIONSHIP_NOT_PROVEN = "relationship_not_proven" as const;

export type FixtureRetrievalMethod =
  | "browser-download"
  | "public-printable-view"
  | "chat-browser-attachment-transfer"
  | typeof UNKNOWN;

/**
 * The external public record the derivatives ultimately came from. This
 * prototype references the public record only; it does not retain the exact
 * external source file's bytes, so it must not claim a source digest.
 */
export interface FixtureExternalSource {
  authority: "Alcohol and Tobacco Tax and Trade Bureau";
  registry: "Public COLA Registry";
  ttbId: string;
  /** A stable public URL for the registry/application record. */
  applicationDetailUrl: string;
  /** A stable direct printable-label/source-asset URL, or `unknown`. */
  printableLabelUrl: string | typeof UNKNOWN;
  retrievalMethod: FixtureRetrievalMethod;
  /** ISO instant when retrieved, or `unknown` when it was not recorded. */
  retrievedAt: string | typeof UNKNOWN;
  sourceMediaType: string | typeof UNKNOWN;
  /** Original source pixel dimensions, or `not_retained`. */
  sourceDimensions: { width: number; height: number } | typeof NOT_RETAINED;
  /** SHA-256 of retained source bytes, or `not_retained` when none are kept. */
  sourceSha256: string | typeof NOT_RETAINED;
  /** True only if the exact original source bytes are retained and hashed. */
  sourceBytesRetained: boolean;
  privacyReview: string;
  publicRecordLimitations: string;
  availabilityCaveat: string;
}

export type DerivativeRole = "reference-crop" | "ocr-benchmark";

export type DerivativeParentKind = "external-source" | "repository-derivative" | typeof UNKNOWN;

/**
 * A derivative's parent. `repository-derivative` must reference another
 * committed derivative's id; `external-source` references the external record;
 * `unknown` must use the explicit `relationship_not_proven` sentinel.
 */
export interface FixtureDerivativeParent {
  kind: DerivativeParentKind;
  ref: string;
}

export type TransformationType =
  | "crop"
  | "resize"
  | "re-encode"
  | "browser-client-representation"
  | "unchanged-bytes"
  | typeof UNKNOWN;

export interface FixtureTransformationStep {
  order: number;
  operation: string;
  performedIn: "outside-repository" | "in-repository";
  performedBy: "human" | "tool";
  description: string;
  toolVersion?: string;
  excludedRegions?: string[];
  verification: string;
}

/**
 * A privacy exclusion record. It documents that a category was handled — never
 * what the excluded content was. It carries no matched value, contact text,
 * signature, crop, or OCR field.
 */
export interface FixturePrivacyExclusion {
  category: string;
  check: string;
  result: "excluded" | "not-present";
  toolOrRuleVersion: string;
}

/** Full provenance for one committed derivative file. */
export interface FixtureDerivativeProvenance {
  derivativeId: string;
  /** Filename relative to the fixture manifest. */
  filename: string;
  role: DerivativeRole;
  mediaType: "image/png" | "image/jpeg";
  pixelWidth: number;
  pixelHeight: number;
  byteSize: number;
  sha256: string;
  parent: FixtureDerivativeParent;
  transformationType: TransformationType;
  /** Ordered, nonempty description of how this derivative was produced. */
  transformationSteps: FixtureTransformationStep[];
  /** Explicitly true or false — never omitted. */
  manuallyCorrectedPixelsOrText: boolean;
  privacyExclusions: FixturePrivacyExclusion[];
  intendedUse: string;
}

export interface FixtureSourceChain {
  externalSource: FixtureExternalSource;
  derivatives: FixtureDerivativeProvenance[];
}

export interface FixtureTruthLabels {
  brand: string;
  varietal: string;
  appellation: string;
  vintage: string;
  alcoholStatement: string;
  netContents: string;
  governmentWarning: "present" | "absent";
}

/** An honest record of a provenance correction (e.g. a fixed transcription). */
export interface FixtureProvenanceNote {
  topic: string;
  resolution: string;
  earlierHumanTranscription?: string;
  artifactVerifiedTruth?: string;
}

export interface FixtureManifest {
  fixtureId: string;
  schemaVersion: typeof FIXTURE_MANIFEST_SCHEMA_VERSION;
  ttbId: string;
  beverageCategory: "wine";
  sourceChain: FixtureSourceChain;
  truthLabels: FixtureTruthLabels;
  provenanceNotes: FixtureProvenanceNote[];
}

export type FixtureManifestErrorCode =
  "INVALID_SHAPE" | "INVALID_PROVENANCE" | "UNSUPPORTED_MANIFEST_VERSION";

export interface FixtureManifestError {
  code: FixtureManifestErrorCode;
  message: string;
  issues: string[];
}
