import type { PrecheckResult } from "@/pipeline/result/result.types";
import { deriveMachineResultId } from "@/pipeline/result/serialize";
import { err, ok, type Result } from "@/shared/result";

import { payloadHash } from "./canonical-json";
import { validateJsonExportShape } from "./json-export.schema";
import {
  EXPORT_SCHEMA_VERSION,
  EXPORT_TYPE,
  HASH_ALGORITHM,
  INTEGRITY_SCOPE,
  type ExportPayload,
  type JsonExportError,
  type PrecheckJsonExport,
} from "./json-export.types";

/**
 * Build a validated JSON export from an already-assembled result.
 *
 * This is a faithful projection: nothing is recalculated, resolved, or fetched.
 * The integrity checksum is computed over the canonical payload (all fields
 * except the integrity block itself).
 */
export function buildJsonExport(
  result: PrecheckResult,
): Result<PrecheckJsonExport, JsonExportError> {
  const payload: ExportPayload = {
    exportSchemaVersion: EXPORT_SCHEMA_VERSION,
    exportType: EXPORT_TYPE,
    generatedFrom: {
      machineResultId: result.machineResultId,
      resultSchemaVersion: result.resultSchemaVersion,
    },
    mode: result.mode,
    profile: result.profile,
    run: result.run,
    declaredFacts: result.declaredFacts,
    evidenceAssessments: result.evidenceAssessments,
    observations: result.observations,
    findings: result.findings,
    versionManifest: result.versionManifest,
    humanFieldConfirmationHistory: result.humanFieldConfirmationHistory,
    humanDispositionHistory: result.humanDispositionHistory,
    advisoryNotice: result.advisoryNotice,
    ...(result.advisoryQuality !== undefined ? { advisoryQuality: result.advisoryQuality } : {}),
  };

  const exportObject: PrecheckJsonExport = {
    ...payload,
    integrity: {
      algorithm: HASH_ALGORITHM,
      scope: INTEGRITY_SCOPE,
      value: payloadHash(payload),
    },
  };

  const validated = validateJsonExportShape(exportObject);
  if (!validated.ok) return validated;
  return ok(validated.value);
}

/** Recompute the payload hash from an export object (integrity block excluded). */
export function recomputeExportHash(exportObject: PrecheckJsonExport): string {
  const { integrity: _integrity, ...payload } = exportObject;
  void _integrity;
  return payloadHash(payload);
}

/**
 * Reconstruct the machine-result content an export represents and recompute its
 * canonical machine-result id, using the exact same derivation as result
 * assembly (disposition history and the id field itself excluded). This detects
 * an export whose payload was changed and re-checksummed while keeping a stale
 * `generatedFrom.machineResultId`.
 */
export function recomputeExportMachineResultId(exportObject: PrecheckJsonExport): string {
  const machineContent: Omit<PrecheckResult, "machineResultId"> = {
    resultSchemaVersion: exportObject.generatedFrom
      .resultSchemaVersion as PrecheckResult["resultSchemaVersion"],
    mode: exportObject.mode,
    profile: exportObject.profile,
    run: exportObject.run,
    declaredFacts: exportObject.declaredFacts,
    evidenceAssessments: exportObject.evidenceAssessments,
    observations: exportObject.observations,
    findings: exportObject.findings,
    versionManifest: exportObject.versionManifest,
    humanFieldConfirmationHistory: exportObject.humanFieldConfirmationHistory,
    advisoryNotice: exportObject.advisoryNotice,
    ...(exportObject.advisoryQuality !== undefined
      ? { advisoryQuality: exportObject.advisoryQuality }
      : {}),
    humanDispositionHistory: exportObject.humanDispositionHistory,
  };
  return deriveMachineResultId(machineContent);
}

/** Verify an export's integrity checksum against its canonical payload. */
export function verifyExportIntegrity(
  exportObject: PrecheckJsonExport,
): Result<PrecheckJsonExport, JsonExportError> {
  const expected = recomputeExportHash(exportObject);
  if (expected !== exportObject.integrity.value) {
    return err({
      code: "INTEGRITY_MISMATCH",
      message: "Export integrity checksum does not match the canonical payload.",
      issues: [`expected ${expected}, found ${exportObject.integrity.value}`],
    });
  }
  return ok(exportObject);
}
