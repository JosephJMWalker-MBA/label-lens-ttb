/**
 * Issue #149 — the durable-archive volume decision.
 *
 * ## Why this is a decision and not an exit code
 *
 * The workflow measured the output and exited nonzero when it exceeded 100 MB —
 * BEFORE the verified artifact was uploaded. GitHub applies an implicit
 * `success()` to any step whose `if:` contains no status-check function, so a
 * failing volume step skipped the verified upload; and the incomplete-forensic
 * upload was skipped too, because its own condition was false when Actor 2 and
 * Job C had succeeded.
 *
 * The result: a run that produced 100 MB plus one byte would correctly detect
 * that it crossed the threshold, and then **discard the only copy of the
 * evidence** when the runner disappeared. The rule exists to control what
 * happens to the evidence, not to destroy it.
 *
 * So the measurement is nonfatal and produces a DECISION. The artifact is
 * uploaded, redownloaded by exact ID, digest-compared and content-verified
 * either way; the stop happens afterwards, in a terminal adjudication, and means
 * "do not commit to Git and do not begin truth-based evaluation until the owner
 * makes a durable-archive decision" — not "delete it".
 */

/** The frozen limit: 100 MiB, in bytes. */
export const ARCHIVE_LIMIT_BYTES = 104857600;

export type ArchiveDecision =
  "ELIGIBLE_FOR_OWNER_COMMIT_PROCESS" | "DURABLE_ARCHIVE_DECISION_REQUIRED";

export interface ArchiveVolumeReport {
  rawBytes: number;
  archiveLimitBytes: number;
  overLimit: boolean;
  decision: ArchiveDecision;
  /**
   * Always true. The upload, exact-ID redownload, digest comparison and content
   * re-verification happen on BOTH sides of the limit.
   */
  uploadAndVerificationRequired: true;
  /** Never true. Over-limit evidence is complete evidence, not forensic output. */
  routeAsIncompleteForensicOutput: false;
  haltCode: "RAW_EVIDENCE_EXCEEDS_DURABLE_ARCHIVE_LIMIT" | null;
  meaning: string;
}

/**
 * Decide, from a byte count alone.
 *
 * Pure and total, so the boundary can be tested at 104857599 / 104857600 /
 * 104857601 without generating a 100 MB artifact.
 */
export function decideArchiveVolume(rawBytes: number): ArchiveVolumeReport {
  if (!Number.isInteger(rawBytes) || rawBytes < 0) {
    throw new RangeError(`rawBytes must be a non-negative integer, received ${String(rawBytes)}`);
  }
  // AT the limit is eligible. The rule is "exceeds", so equality is not over.
  const overLimit = rawBytes > ARCHIVE_LIMIT_BYTES;
  return {
    rawBytes,
    archiveLimitBytes: ARCHIVE_LIMIT_BYTES,
    overLimit,
    decision: overLimit ? "DURABLE_ARCHIVE_DECISION_REQUIRED" : "ELIGIBLE_FOR_OWNER_COMMIT_PROCESS",
    uploadAndVerificationRequired: true,
    routeAsIncompleteForensicOutput: false,
    haltCode: overLimit ? "RAW_EVIDENCE_EXCEEDS_DURABLE_ARCHIVE_LIMIT" : null,
    meaning: overLimit
      ? "Complete, verified evidence that exceeds the durable-archive limit. Do not commit it to Git and do not begin truth-based evaluation; an explicit owner durable-archive decision is required. The retention-bound workflow artifact is preserved for that decision — it is NOT permanent preservation, and it expires."
      : "Complete, verified evidence within the durable-archive limit. Eligible for the owner's commit process.",
  };
}

/**
 * Does the workflow's terminal adjudication fail?
 *
 * Separated from the decision so the ORDERING is testable: the halt is a
 * property of the final gate, and it may only be consulted once the artifact and
 * receipt exist.
 */
export function archiveAdjudication(input: {
  report: ArchiveVolumeReport;
  verifiedArtifactUploaded: boolean;
  verificationReceiptCreated: boolean;
}): { ok: boolean; haltCode: string | null; detail: string } {
  if (!input.verifiedArtifactUploaded || !input.verificationReceiptCreated) {
    return {
      ok: false,
      haltCode: "ARCHIVE_ADJUDICATION_BEFORE_PRESERVATION",
      detail:
        "the volume decision was adjudicated before the verified artifact and its receipt existed; preservation precedes adjudication",
    };
  }
  if (input.report.overLimit) {
    return {
      ok: false,
      haltCode: "RAW_EVIDENCE_EXCEEDS_DURABLE_ARCHIVE_LIMIT",
      detail: input.report.meaning,
    };
  }
  return { ok: true, haltCode: null, detail: input.report.meaning };
}
