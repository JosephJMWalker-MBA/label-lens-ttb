import type { PrecheckServiceError } from "./precheck-service.types";

import { err, ok, type Result } from "@/shared/result";

/**
 * Process-local append freshness guard.
 *
 * The append endpoints are intentionally stateless with respect to machine
 * findings: the client resubmits the canonical export it most recently received.
 * That makes the submitted export the authority for human histories too, unless
 * the server remembers which export checksum is current for this machine result.
 *
 * This guard records the latest export integrity value the current process has
 * issued for each machine result. Any older export from the same process then
 * fails closed instead of forking or truncating append-only human history.
 *
 * No database is introduced here. The boundary is deliberately local to the
 * running process, which matches the current bounded pre-check architecture.
 */

const APPEND_HEADS_SYMBOL = Symbol.for("label-lens.append-freshness-heads.v1");

function store(): Map<string, string> {
  const globalStore = globalThis as Record<symbol, Map<string, string> | undefined>;
  if (!globalStore[APPEND_HEADS_SYMBOL]) {
    globalStore[APPEND_HEADS_SYMBOL] = new Map<string, string>();
  }
  return globalStore[APPEND_HEADS_SYMBOL] as Map<string, string>;
}

/** Remember the latest checksum this process has issued for a machine result. */
export function rememberLatestAppendableExport(
  machineResultId: string,
  exportIntegrity: string,
): void {
  store().set(machineResultId, exportIntegrity);
}

/**
 * Reject stale or untracked exports before appending human history.
 *
 * If this process no longer knows the current export head for the result, or if
 * the submitted export is not that current head, the caller must re-run the
 * pre-check or continue from the latest response it has already received.
 */
export function verifyLatestAppendableExport(
  machineResultId: string,
  exportIntegrity: string,
): Result<void, PrecheckServiceError> {
  const latestIntegrity = store().get(machineResultId);
  if (latestIntegrity === undefined || latestIntegrity !== exportIntegrity) {
    return err({
      code: "STALE_SUBMITTED_RESULT",
      message:
        "This result is no longer current for append operations. Continue from the latest response or rerun the pre-check before saving another human action.",
    });
  }
  return ok(undefined);
}
