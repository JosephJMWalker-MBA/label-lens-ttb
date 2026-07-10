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
 * Application build version. Semantic package version and git commit SHA are
 * kept as separate fields, never combined into one opaque string.
 */
export interface ApplicationBuildVersion {
  packageVersion: string;
  gitCommitSha?: string;
}

/** OCR engine identity, or an explicit statement that none was used. */
export type OcrEngineVersion =
  | {
      kind: "ocr";
      engineId: string;
      engineVersion: string;
      modelId?: string;
      modelVersion?: string;
    }
  | { kind: "not_applicable" };

export interface VersionManifest {
  /** SHA-256 of the original source bytes, or null when none are retained. */
  sourceArtifactSha256: string | null;
  sanitizedDerivativeSha256: string;
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
