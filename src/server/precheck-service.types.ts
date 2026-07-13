import type { DeclaredFact } from "@/domain/run/declared-facts.types";
import type { VerificationFinding } from "@/domain/verification/finding.types";
import type { EvidenceAssessment } from "@/pipeline/precheck/precheck.types";
import type {
  AdvisoryNotice,
  DispositionEntry,
  DispositionReferences,
  HumanFieldConfirmationDecisionType,
  HumanFieldGeometry,
  ReviewableFieldId,
  ResultDispositionDecision,
  ResultObservations,
} from "@/pipeline/result/result.types";

/**
 * The bounded server request for one wine pre-check. The server derives all
 * deterministic identity (hash, dimensions, versions, ids, checksum) itself and
 * never trusts client-supplied findings, statuses, or version metadata. The
 * filename is non-authoritative display metadata only.
 */
export interface PrecheckServiceRequest {
  /** "upload" carries user bytes; "sample" runs the bundled demo fixture. */
  source: "upload" | "sample";
  /** Raw image bytes for an upload; ignored for the sample source. */
  imageBytes?: Uint8Array;
  /** Non-authoritative display filename (never used for identity or paths). */
  filename?: string;
  /** Declared media type for an upload; validated against the decoded format. */
  mediaType?: string;
  declaredBrand: string;
  declaredAlcohol: string;
}

/** Bounded, render-only projection of one field observation and its provenance. */
export interface PrecheckServiceResponse {
  machineResultId: string;
  /**
   * Opaque server-issued authorization token that must accompany any later
   * disposition append for this machine result. It is an HMAC over the
   * machine-result id (never a checksum), carries no secret, and is stable
   * across successive appends because the machine content is immutable.
   */
  appendToken: string;
  profile: { id: string; version: string };
  advisoryNotice: AdvisoryNotice;
  declaredFacts: {
    applicationBrandName: DeclaredFact;
    applicationAlcoholValue: DeclaredFact;
  };
  observations: ResultObservations;
  evidenceAssessments: EvidenceAssessment[];
  findings: VerificationFinding[];
  /** Append-only field confirmation history; separate from machine observations. */
  humanFieldConfirmationHistory: import("@/pipeline/result/result.types").HumanFieldConfirmationEntry[];
  /** Append-only operator disposition history; separate from machine findings. */
  humanDispositionHistory: DispositionEntry[];
  /** Deterministic suggested filename for the JSON download. */
  suggestedFilename: string;
  /** Canonical JSON export text, checksum-verified server-side. */
  exportJson: string;
  /** Deterministic, human-readable HTML report of the same validated result. */
  report: { html: string; filename: string };
  /** Echoed display metadata for the selected file; not part of identity. */
  file: { displayName: string; mediaType: string; byteSize: number; source: "upload" | "sample" };
}

/**
 * Bounded request to append one operator disposition to an already-returned
 * validated result. The client submits the canonical JSON export it received
 * (re-validated server-side); it can never inject or mutate machine findings,
 * observations, version manifests, or the machine-result id. `recordedAt` is
 * supplied at the UI/server workflow boundary — never inside machine assembly.
 */
export interface PrecheckDispositionRequest {
  /** The canonical JSON export text of the result being dispositioned. */
  exportJson: string;
  /**
   * The server-issued append-authorization token returned with the original
   * pre-check response for this machine result. Required for every append.
   */
  appendToken: string;
  actorId: string;
  decision: ResultDispositionDecision;
  reasonCode: string;
  note?: string;
  references?: DispositionReferences;
  /** ISO timestamp generated at the workflow boundary (human-action metadata). */
  recordedAt: string;
  /** Echoed, non-authoritative display metadata carried from the prior response. */
  file: { displayName: string; mediaType: string; byteSize: number; source: "upload" | "sample" };
}

export interface PrecheckFieldConfirmationRequest {
  /** The canonical JSON export text of the result being confirmed. */
  exportJson: string;
  /**
   * The server-issued append-authorization token returned with the original
   * pre-check response for this machine result. Required for every append.
   */
  appendToken: string;
  fieldId: ReviewableFieldId;
  decisionType: HumanFieldConfirmationDecisionType;
  correctedValue?: string;
  alternateId?: string;
  note?: string;
  humanGeometry?: HumanFieldGeometry;
  /** ISO timestamp generated at the workflow boundary (human-action metadata). */
  recordedAt: string;
  /** Echoed, non-authoritative display metadata carried from the prior response. */
  file: { displayName: string; mediaType: string; byteSize: number; source: "upload" | "sample" };
}

export type PrecheckServiceErrorCode =
  | "NO_IMAGE"
  | "MULTIPLE_IMAGES"
  | "UNSUPPORTED_TYPE"
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE"
  | "CORRUPT_IMAGE"
  | "INVALID_DECLARED_VALUE"
  | "UNDECLARED_FIELD"
  | "UNSAFE_FILENAME"
  | "CLIENT_INJECTED_FIELD"
  | "EXTRACTION_FAILED"
  | "PROFILE_MISMATCH"
  | "ASSEMBLY_FAILED"
  | "EXPORT_CHECKSUM_FAILED"
  | "SAMPLE_UNAVAILABLE"
  | "INVALID_SUBMITTED_RESULT"
  | "INVALID_DISPOSITION"
  | "INVALID_DISPOSITION_REFERENCE"
  | "INVALID_FIELD_CONFIRMATION"
  | "MISSING_APPEND_TOKEN"
  | "INVALID_APPEND_TOKEN"
  | "APPEND_SIGNING_KEY_UNAVAILABLE"
  | "REPORT_FAILED"
  // Bounded resource-control failures.
  | "REQUEST_TOO_LARGE"
  | "REQUEST_NOT_MULTIPART"
  | "IMAGE_DIMENSIONS_EXCEEDED"
  | "IMAGE_PIXEL_BUDGET_EXCEEDED"
  | "MULTI_FRAME_IMAGE_UNSUPPORTED";

/** A user-safe error: no stack traces, absolute paths, or environment data. */
export interface PrecheckServiceError {
  code: PrecheckServiceErrorCode;
  message: string;
}
