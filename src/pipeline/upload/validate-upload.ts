import { err, ok, type Result } from "@/shared/result";

/** Image formats the pipeline accepts for label uploads. */
export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/** Maximum accepted upload size (15 MB). */
export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

/** The minimal shape of an upload we can validate without the DOM `File` API. */
export interface UploadCandidate {
  name: string;
  type: string;
  size: number;
}

export type ValidatedUpload = UploadCandidate & {
  type: (typeof ACCEPTED_IMAGE_TYPES)[number];
};

export type UploadErrorCode = "EMPTY_FILE" | "UNSUPPORTED_TYPE" | "FILE_TOO_LARGE";

export interface UploadError {
  code: UploadErrorCode;
  /** Plain-language message suitable for display to a reviewer. */
  message: string;
}

/**
 * Validate an upload's type and size before any processing.
 *
 * Deterministic and side-effect free: it inspects only the candidate metadata
 * so it can be unit-tested without a browser or real image bytes.
 */
export function validateUpload(file: UploadCandidate): Result<ValidatedUpload, UploadError> {
  if (file.size <= 0) {
    return err({ code: "EMPTY_FILE", message: "The selected file is empty." });
  }

  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as ValidatedUpload["type"])) {
    return err({
      code: "UNSUPPORTED_TYPE",
      message: "Unsupported image type. Use PNG, JPEG, or WebP.",
    });
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return err({
      code: "FILE_TOO_LARGE",
      message: "Image is larger than the 15 MB limit.",
    });
  }

  return ok({ ...file, type: file.type as ValidatedUpload["type"] });
}
