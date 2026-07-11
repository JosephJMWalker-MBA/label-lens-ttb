import { err, ok, type Result } from "@/shared/result";

import type { JsonExportError, PrecheckJsonExport } from "./json-export.types";

/**
 * Deterministic suggested filename for an export, derived only from the stable
 * machine-result identity. It contains no current date/time, no path
 * separators, no whitespace, and no absolute path — and it writes nothing.
 */
const MACHINE_RESULT_ID = /^precheck-result\.v1-[0-9a-f]{64}$/;

export function suggestedExportFilename(
  exportObject: PrecheckJsonExport,
): Result<string, JsonExportError> {
  const id = exportObject.generatedFrom.machineResultId;
  if (!MACHINE_RESULT_ID.test(id)) {
    return err({
      code: "INVALID_FILENAME_IDENTITY",
      message: "Machine result id is not a valid stable identity for a filename.",
      issues: [`machineResultId: ${id}`],
    });
  }
  return ok(`label-lens-wine-precheck-${id}.json`);
}
