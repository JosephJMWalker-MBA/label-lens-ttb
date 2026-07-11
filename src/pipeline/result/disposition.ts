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

  // References may only point at findings/checks that exist in this result, and
  // never mutate them. This invariant is enforced here in the canonical append,
  // independent of any calling boundary.
  const knownRuleIds = new Set<string>(result.findings.map((f) => f.ruleId));
  const knownCheckIds = new Set<string>(result.evidenceAssessments.map((a) => a.checkId));
  const badRule = (input.references?.ruleIds ?? []).find((id) => !knownRuleIds.has(id));
  const badCheck = (input.references?.checkIds ?? []).find((id) => !knownCheckIds.has(id));
  if (badRule !== undefined || badCheck !== undefined) {
    return err({
      code: "INVALID_DISPOSITION",
      message: "Disposition references a finding or check that does not exist in this result.",
      issues: [
        ...(badRule !== undefined ? [`unknown ruleId: ${badRule}`] : []),
        ...(badCheck !== undefined ? [`unknown checkId: ${badCheck}`] : []),
      ],
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
