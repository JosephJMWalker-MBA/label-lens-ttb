import { err, ok, type Result } from "@/shared/result";

import { recomputeExportMachineResultId, verifyExportIntegrity } from "./build-json-export";
import { validateJsonExportShape } from "./json-export.schema";
import {
  EXPORT_SCHEMA_VERSION,
  type JsonExportError,
  type PrecheckJsonExport,
} from "./json-export.types";

export interface ParseJsonExportOptions {
  /** When provided, the export must have been generated from this machine result. */
  expectedMachineResultId?: string;
}

/**
 * Parse and fully validate JSON export text: shape, schema version, integrity
 * checksum, and (optionally) the source machine-result identity. Nothing is
 * silently repaired — every failure returns a typed error.
 */
export function parseJsonExport(
  text: string,
  options: ParseJsonExportOptions = {},
): Result<PrecheckJsonExport, JsonExportError> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    return err({
      code: "INVALID_JSON",
      message: "Export text is not valid JSON.",
      issues: [cause instanceof Error ? cause.message : String(cause)],
    });
  }

  // Distinguish an unsupported schema version from a general shape error.
  if (
    parsed &&
    typeof parsed === "object" &&
    "exportSchemaVersion" in parsed &&
    (parsed as { exportSchemaVersion: unknown }).exportSchemaVersion !== EXPORT_SCHEMA_VERSION
  ) {
    return err({
      code: "UNSUPPORTED_EXPORT_SCHEMA_VERSION",
      message: "Export schema version is not supported.",
      issues: [
        `expected ${EXPORT_SCHEMA_VERSION}, found ${String(
          (parsed as { exportSchemaVersion: unknown }).exportSchemaVersion,
        )}`,
      ],
    });
  }

  const shape = validateJsonExportShape(parsed);
  if (!shape.ok) return shape;

  const integrity = verifyExportIntegrity(shape.value);
  if (!integrity.ok) return integrity;

  // The checksum only proves payload self-consistency. Recompute the canonical
  // machine-result id from the export's machine content and reject any export
  // whose embedded identity no longer matches its (possibly re-checksummed)
  // machine fields. This invariant holds unconditionally, without a caller hint.
  const recomputedId = recomputeExportMachineResultId(shape.value);
  if (recomputedId !== shape.value.generatedFrom.machineResultId) {
    return err({
      code: "MACHINE_RESULT_ID_MISMATCH",
      message: "Export machine-result id does not match its machine content.",
      issues: [`recomputed ${recomputedId}, embedded ${shape.value.generatedFrom.machineResultId}`],
    });
  }

  if (
    options.expectedMachineResultId !== undefined &&
    shape.value.generatedFrom.machineResultId !== options.expectedMachineResultId
  ) {
    return err({
      code: "SOURCE_RESULT_ID_MISMATCH",
      message: "Export was not generated from the expected machine result.",
      issues: [
        `expected ${options.expectedMachineResultId}, found ${shape.value.generatedFrom.machineResultId}`,
      ],
    });
  }

  return ok(shape.value);
}
