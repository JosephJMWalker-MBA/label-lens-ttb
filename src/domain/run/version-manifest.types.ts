/**
 * The immutable version manifest captured at run creation, before extraction or
 * rule execution. It records every version that could change a deterministic
 * finding, so any run can be reproduced and audited against exact versions.
 */

/** A regulatory authority pinned to a dated eCFR snapshot. */
export interface AuthorityVersion {
  /** Citation stored separately from the date, e.g. "27 CFR 4.36". */
  citation: string;
  /** eCFR snapshot date as ISO YYYY-MM-DD. */
  snapshotDate: string;
  /** Optional effective date as ISO YYYY-MM-DD. */
  effectiveDate?: string;
}

export interface RuleVersionRef {
  ruleId: string;
  version: string;
}

/**
 * Where the application build's commit identity came from. The development
 * fallback is labeled honestly and never pretends to be a deployed commit SHA.
 */
export type CommitProvenance = "build-environment" | "unavailable-development-fallback";

/**
 * Application build version. Semantic package version and git commit SHA are
 * kept as separate fields, never combined into one opaque string. `gitCommitSha`
 * is present only when a real build commit was supplied by the environment.
 */
export interface ApplicationBuildVersion {
  packageVersion: string;
  gitCommitSha?: string;
  commitProvenance?: CommitProvenance;
}

/**
 * OCR engine identity, or an explicit statement that none was used. `modelSha256`
 * is the digest of the vendored language/model asset — the primary model
 * identity, computed from the committed file rather than any release claim.
 */
export type OcrEngineVersion =
  | {
      kind: "ocr";
      engineId: string;
      engineVersion: string;
      modelId?: string;
      modelVersion?: string;
      modelSha256?: string;
    }
  | { kind: "not_applicable" };

/** Relationship between the source artifact and the sanitized derivative. */
export type DerivativeRelationship = "same_bytes" | "transformed";

/**
 * The executable provenance: every version/identity of the code and assets that
 * can change a deterministic finding. This is the single canonical shape a
 * runtime provenance source produces; a per-image `VersionManifest` extends it
 * with the artifact hashes and their relationship.
 */
export interface ExecutableProvenance {
  extractionAdapterId: string;
  extractionAdapterVersion: string;
  ocrEngine: OcrEngineVersion;
  parserId: string;
  parserVersion: string;
  ruleProfileId: string;
  ruleProfileVersion: string;
  /** Ordered list of the rule id/versions applied by the profile. */
  rules: RuleVersionRef[];
  authorities: AuthorityVersion[];
  applicationBuild: ApplicationBuildVersion;
}

export interface VersionManifest extends ExecutableProvenance {
  /** SHA-256 of the original source bytes, or null when none are retained. */
  sourceArtifactSha256: string | null;
  sanitizedDerivativeSha256: string;
  /** How the derivative relates to the source (e.g. identical uploaded bytes). */
  derivativeRelationship?: DerivativeRelationship;
}
