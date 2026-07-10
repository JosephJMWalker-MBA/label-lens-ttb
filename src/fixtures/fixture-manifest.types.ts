/**
 * Provenance and privacy contract for a committed test fixture.
 *
 * A fixture manifest exists so a repository-safe derivative can never be
 * confused with its source: it records where the artifact came from, exactly
 * how it was transformed, which sensitive regions were excluded, and the
 * human-verified ground truth — without ever storing the excluded values.
 */

export const FIXTURE_MANIFEST_SCHEMA_VERSION = "label-fixture-manifest.v1" as const;

/**
 * External source reference. The prototype references the public certificate
 * only; it does not retain certificate bytes, so it must not claim a
 * source-byte hash.
 */
export interface FixtureSourceReference {
  kind: "public-cola-certificate";
  reference: string;
  /** True only if the exact original bytes are retained and hashed. */
  sourceBytesRetained: boolean;
  /** SHA-256 of retained source bytes, or null when none are retained. */
  sourceSha256: string | null;
  note: string;
  retrievedAt?: string;
}

export interface FixtureDerivative {
  kind: "sanitized-label-crop";
  /** Path to the derivative, relative to the manifest. */
  path: string;
  mediaType: "image/png";
  sha256: string;
  pixelWidth: number;
  pixelHeight: number;
  byteSize: number;
}

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
 * signature, crop, or OCR.
 */
export interface FixturePrivacyExclusion {
  category: string;
  check: string;
  result: "excluded" | "not-present";
  toolOrRuleVersion: string;
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
  source: FixtureSourceReference;
  derivative: FixtureDerivative;
  transformationChain: FixtureTransformationStep[];
  privacyExclusions: FixturePrivacyExclusion[];
  truthLabels: FixtureTruthLabels;
  provenanceNotes: FixtureProvenanceNote[];
}

export type FixtureManifestErrorCode = "INVALID_SHAPE" | "INVALID_PROVENANCE";

export interface FixtureManifestError {
  code: FixtureManifestErrorCode;
  message: string;
  issues: string[];
}
