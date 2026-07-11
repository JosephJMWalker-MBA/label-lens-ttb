import { err, ok, type Result } from "@/shared/result";

import { deepFreeze } from "./freeze";
import { validateDispositionHistory } from "./result.schema";
import type {
  DispositionEntry,
  DispositionEntryInput,
  DispositionError,
  PrecheckResult,
} from "./result.types";

/**
 * Append one human disposition entry, returning a new frozen result.
 *
 * The history is append-only: existing entries are never edited or removed, the
 * sequence is assigned contiguously, and duplicate disposition ids are rejected.
 * Machine findings are copied through untouched — a disposition can reference
 * findings but never mutates them, and the machine result id is unchanged.
 */
export function appendDisposition(
  result: PrecheckResult,
  input: DispositionEntryInput,
): Result<PrecheckResult, DispositionError> {
  if (result.humanDispositionHistory.some((e) => e.dispositionId === input.dispositionId)) {
    return err({
      code: "DUPLICATE_DISPOSITION_ID",
      message: "A disposition with this id already exists.",
      issues: [`dispositionId: ${input.dispositionId} is already present`],
    });
  }

  const entry: DispositionEntry = {
    dispositionId: input.dispositionId,
    sequence: result.humanDispositionHistory.length + 1,
    actorId: input.actorId,
    recordedAt: input.recordedAt,
    decision: input.decision,
    reasonCode: input.reasonCode,
    ...(input.note !== undefined ? { note: input.note } : {}),
    ...(input.references !== undefined ? { references: input.references } : {}),
  };

  const humanDispositionHistory = [...result.humanDispositionHistory, entry];

  const historyCheck = validateDispositionHistory(humanDispositionHistory);
  if (!historyCheck.ok) {
    return err({
      code: "INVALID_DISPOSITION",
      message: "Resulting disposition history is invalid.",
      issues: historyCheck.error.issues,
    });
  }

  // A new frozen result; the original and its history array are left untouched.
  return ok(deepFreeze({ ...result, humanDispositionHistory }));
}
