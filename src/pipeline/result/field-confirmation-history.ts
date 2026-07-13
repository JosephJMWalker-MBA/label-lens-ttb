import { err, ok, type Result } from "@/shared/result";

import { deepFreeze } from "./freeze";
import { resolveMachineAlternates } from "./field-confirmation";
import { validateHumanFieldConfirmationHistory } from "./result.schema";
import {
  HUMAN_FIELD_CONFIRMATION_PROVENANCE,
  HUMAN_FIELD_CONFIRMATION_SCHEMA_VERSION,
  type HumanFieldConfirmationEntry,
  type HumanFieldConfirmationEntryInput,
  type HumanFieldConfirmationError,
  type PrecheckResult,
} from "./result.types";

function observationValue(result: PrecheckResult, fieldId: HumanFieldConfirmationEntry["fieldId"]) {
  return fieldId === "brandName"
    ? result.observations.brandName.value
    : result.observations.alcoholStatement.value;
}

/**
 * Append one field-confirmation entry, preserving the immutable machine
 * observation and returning a new frozen result.
 */
export function appendHumanFieldConfirmation(
  result: PrecheckResult,
  input: HumanFieldConfirmationEntryInput & { confirmationId: string },
): Result<PrecheckResult, HumanFieldConfirmationError> {
  if (
    result.humanFieldConfirmationHistory.some(
      (entry) => entry.confirmationId === input.confirmationId,
    )
  ) {
    return err({
      code: "DUPLICATE_FIELD_CONFIRMATION_ID",
      message: "A field confirmation with this id already exists.",
      issues: [`confirmationId: ${input.confirmationId} is already present`],
    });
  }

  if (
    input.decisionType === "accepted-machine-reading" &&
    observationValue(result, input.fieldId) === null
  ) {
    return err({
      code: "INVALID_FIELD_CONFIRMATION",
      message: "The selected field has no machine reading to accept.",
      issues: [`fieldId: ${input.fieldId}`],
    });
  }

  if (input.decisionType === "selected-alternate") {
    const observation =
      input.fieldId === "brandName"
        ? result.observations.brandName
        : result.observations.alcoholStatement;
    const alternateIds = new Set(
      resolveMachineAlternates(input.fieldId, observation).map(
        (alternate) => alternate.alternateId,
      ),
    );
    if (!alternateIds.has(input.alternateId)) {
      return err({
        code: "INVALID_FIELD_CONFIRMATION",
        message: "The selected alternate does not belong to this machine observation.",
        issues: [`alternateId: ${input.alternateId}`],
      });
    }
  }

  if (input.decisionType === "corrected-value" && input.correctedValue.fieldId !== input.fieldId) {
    return err({
      code: "INVALID_FIELD_CONFIRMATION",
      message: "The corrected value does not match the field being confirmed.",
      issues: [
        `fieldId: ${input.fieldId}`,
        `correctedValue.fieldId: ${input.correctedValue.fieldId}`,
      ],
    });
  }

  const base = {
    confirmationId: input.confirmationId,
    sequence: result.humanFieldConfirmationHistory.length + 1,
    schemaVersion: HUMAN_FIELD_CONFIRMATION_SCHEMA_VERSION,
    provenance: HUMAN_FIELD_CONFIRMATION_PROVENANCE,
    fieldId: input.fieldId,
    recordedAt: input.recordedAt,
    ...(input.note !== undefined ? { note: input.note } : {}),
    ...(input.humanGeometry !== undefined ? { humanGeometry: input.humanGeometry } : {}),
  } as const;

  let entry: HumanFieldConfirmationEntry;
  switch (input.decisionType) {
    case "accepted-machine-reading":
      entry = { ...base, decisionType: "accepted-machine-reading" };
      break;
    case "selected-alternate":
      entry = {
        ...base,
        decisionType: "selected-alternate",
        alternateId: input.alternateId,
      };
      break;
    case "corrected-value":
      entry = {
        ...base,
        decisionType: "corrected-value",
        correctedValue: input.correctedValue,
      };
      break;
    case "field-not-visible":
      entry = { ...base, decisionType: "field-not-visible" };
      break;
    case "field-unreadable":
      entry = { ...base, decisionType: "field-unreadable" };
      break;
  }

  const humanFieldConfirmationHistory = [...result.humanFieldConfirmationHistory, entry];
  const historyCheck = validateHumanFieldConfirmationHistory(humanFieldConfirmationHistory);
  if (!historyCheck.ok) {
    return err({
      code: "INVALID_FIELD_CONFIRMATION",
      message: "Resulting field confirmation history is invalid.",
      issues: historyCheck.error.issues,
    });
  }

  return ok(deepFreeze({ ...result, humanFieldConfirmationHistory }));
}
