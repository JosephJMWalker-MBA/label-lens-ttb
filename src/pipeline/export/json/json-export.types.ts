import type { DeclaredFact } from "@/domain/run/declared-facts.types";
import type { VersionManifest } from "@/domain/run/version-manifest.types";
import type { VerificationFinding } from "@/domain/verification/finding.types";
import type {
  EvidenceAssessment,
  PrecheckAdvisoryQuality,
} from "@/pipeline/precheck/precheck.types";
import type {
  AdvisoryNotice,
  DispositionEntry,
  ResultObservations,
  ResultProfile,
  ResultRunReference,
} from "@/pipeline/result/result.types";

/**
 * A bounded, deterministic JSON projection of an assembled `PrecheckResult`.
 *
 * The export is a faithful, versioned copy of the result — it recomputes
 * nothing, resolves nothing external, and adds only a checksum. It carries no
 * image/model bytes, filesystem paths, timings, logs, overall status,
 * percentage, or government disposition.
 */
export const EXPORT_SCHEMA_VERSION = "precheck-json-export.v1" as const;
export const EXPORT_TYPE = "wine-precheck-result" as const;
export const INTEGRITY_SCOPE = "precheck-json-export-payload.v1" as const;
export const HASH_ALGORITHM = "SHA-256" as const;

/** Integrity checksum block — a plain SHA-256, never a cryptographic signature. */
export interface ExportIntegrity {
  algorithm: typeof HASH_ALGORITHM;
  scope: typeof INTEGRITY_SCOPE;
  /** 64 lowercase hex characters. */
  value: string;
}

export interface ExportSourceReference {
  machineResultId: string;
  resultSchemaVersion: string;
}

export interface PrecheckJsonExport {
  exportSchemaVersion: typeof EXPORT_SCHEMA_VERSION;
  exportType: typeof EXPORT_TYPE;
  generatedFrom: ExportSourceReference;
  mode: "wine-precheck";
  profile: ResultProfile;
  run: ResultRunReference;
  declaredFacts: {
    applicationBrandName: DeclaredFact;
    applicationAlcoholValue: DeclaredFact;
  };
  evidenceAssessments: EvidenceAssessment[];
  observations: ResultObservations;
  findings: VerificationFinding[];
  versionManifest: VersionManifest;
  humanDispositionHistory: DispositionEntry[];
  advisoryNotice: AdvisoryNotice;
  advisoryQuality?: PrecheckAdvisoryQuality;
  integrity: ExportIntegrity;
}

/** The export payload used for hashing: everything except the integrity block. */
export type ExportPayload = Omit<PrecheckJsonExport, "integrity">;

export type JsonExportErrorCode =
  | "INVALID_EXPORT_SHAPE"
  | "UNSUPPORTED_EXPORT_SCHEMA_VERSION"
  | "INVALID_JSON"
  | "INTEGRITY_MISMATCH"
  | "SOURCE_RESULT_ID_MISMATCH"
  | "INVALID_FILENAME_IDENTITY";

export interface JsonExportError {
  code: JsonExportErrorCode;
  message: string;
  issues: string[];
}
