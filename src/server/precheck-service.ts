import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createAnalysisRun } from "@/domain/run/analysis-run";
import type { AnalysisRunCreationInput } from "@/domain/run/analysis-run.types";
import type { DeclaredFact } from "@/domain/run/declared-facts.types";
import type { ExecutableProvenance } from "@/domain/run/version-manifest.types";
import type { AnalyzerOcrEngine } from "@/pipeline/analyzer/analyzer.types";
import { buildJsonExport, verifyExportIntegrity } from "@/pipeline/export/json/build-json-export";
import { serializeExportCanonical } from "@/pipeline/export/json/canonical-json";
import { suggestedExportFilename } from "@/pipeline/export/json/filename";
import { parseJsonExport } from "@/pipeline/export/json/parse-json-export";
import { buildReadableReport } from "@/pipeline/export/report/build-report";
import { extractLabelEvidence } from "@/pipeline/extractor/extractor";
import type { ExtractionErrorCode, ExtractionInput } from "@/pipeline/extractor/extractor.types";
import { runWinePrecheck } from "@/pipeline/precheck/orchestrator";
import { validateHumanCorrectedValue } from "@/pipeline/result/field-confirmation";
import { appendHumanFieldConfirmation } from "@/pipeline/result/field-confirmation-history";
import { appendDisposition } from "@/pipeline/result/disposition";
import { assemblePrecheckResult } from "@/pipeline/result/assemble";
import { validatePrecheckResult } from "@/pipeline/result/result.schema";
import type {
  DispositionEntryInput,
  HumanFieldConfirmationEntryInput,
  PrecheckResult,
} from "@/pipeline/result/result.types";
import { err, ok, type Result } from "@/shared/result";

import { issueAppendToken, verifyAppendToken } from "./append-token";
import { rememberLatestAppendableExport, verifyLatestAppendableExport } from "./append-freshness";
import { ALLOWED_MEDIA_TYPES, MAX_IMAGE_BYTES } from "./resource-policy";
import { getExecutableProvenance } from "./runtime-provenance";

import type {
  PrecheckDispositionRequest,
  PrecheckFieldConfirmationRequest,
  PrecheckServiceError,
  PrecheckServiceRequest,
  PrecheckServiceResponse,
} from "./precheck-service.types";

/**
 * The server-side wine pre-check service: image bytes → integrity → local
 * extractor → committed orchestrator → deterministic result → JSON export
 * (checksum-verified). It processes the image ephemerally, never writes it to
 * disk, never logs bytes or declared facts, and derives all deterministic
 * identity itself. It duplicates no rule behavior and reads no fixture manifest.
 */

const SUPPORTED_TYPES = new Set<string>(ALLOWED_MEDIA_TYPES);

// Fixed deterministic metadata: this advisory slice does not persist real
// timestamps, so identity stays a function of content + committed versions.
const FIXED_TIMESTAMP = "2026-07-10T00:00:00Z";
const SAMPLE_FIXTURE = "tests/fixtures/precheck/m-cellars-24205001000905/label-ocr-source.jpeg";

function fail(
  code: PrecheckServiceError["code"],
  message: string,
): Result<never, PrecheckServiceError> {
  return err({ code, message });
}

/** Map a typed extraction failure to a safe, user-facing service error. */
function mapExtractionError(code: ExtractionErrorCode): Result<never, PrecheckServiceError> {
  switch (code) {
    case "UNSUPPORTED_FORMAT":
      return fail("UNSUPPORTED_TYPE", "Unsupported image type. Use PNG or JPEG.");
    case "IMAGE_DIMENSIONS_EXCEEDED":
      return fail("IMAGE_DIMENSIONS_EXCEEDED", "The image is larger than the maximum dimensions.");
    case "IMAGE_PIXEL_BUDGET_EXCEEDED":
      return fail("IMAGE_PIXEL_BUDGET_EXCEEDED", "The image has too many pixels to process.");
    case "MULTI_FRAME_IMAGE_UNSUPPORTED":
      return fail(
        "MULTI_FRAME_IMAGE_UNSUPPORTED",
        "Animated or multi-page images are not supported.",
      );
    case "CORRUPT_IMAGE":
    case "EMPTY_IMAGE":
    case "DIMENSIONS_OUT_OF_BOUNDS":
      return fail("CORRUPT_IMAGE", "The image could not be read for evidence extraction.");
    default:
      return fail("EXTRACTION_FAILED", "The image could not be read for evidence extraction.");
  }
}

function operatorFact(value: string): DeclaredFact {
  return {
    value,
    provenance: {
      sourceType: "operator-entered",
      sourceReference: "wine-precheck-web",
      recordedBy: "web-operator",
      recordedAt: FIXED_TIMESTAMP,
    },
  };
}

function extensionFor(mediaType: string): string {
  return mediaType === "image/png" ? "png" : "jpeg";
}

async function resolveBytes(
  request: PrecheckServiceRequest,
): Promise<
  Result<{ bytes: Uint8Array; mediaType: string; displayName: string }, PrecheckServiceError>
> {
  if (request.source === "sample") {
    try {
      const bytes = new Uint8Array(await readFile(join(process.cwd(), SAMPLE_FIXTURE)));
      return ok({ bytes, mediaType: "image/jpeg", displayName: "M Cellars sample (bundled demo)" });
    } catch {
      return fail("SAMPLE_UNAVAILABLE", "The bundled demonstration sample is unavailable.");
    }
  }

  const bytes = request.imageBytes;
  if (!bytes || bytes.length === 0) return fail("EMPTY_FILE", "The selected file is empty.");
  // Post-buffer actual-byte guard: Content-Length may be absent or cover only
  // multipart overhead, so the true file size is still enforced here.
  if (bytes.length > MAX_IMAGE_BYTES)
    return fail("FILE_TOO_LARGE", "Image exceeds the maximum allowed size.");
  const mediaType = request.mediaType ?? "";
  if (!SUPPORTED_TYPES.has(mediaType)) {
    return fail("UNSUPPORTED_TYPE", "Unsupported image type. Use PNG or JPEG.");
  }
  return ok({ bytes, mediaType, displayName: request.filename?.trim() || "label image" });
}

/**
 * Build the immutable run creation input from the single canonical provenance.
 *
 * For this one-image workflow the uploaded bytes are both the source artifact
 * and the sanitized derivative used for OCR, so the same SHA is recorded in both
 * roles with an explicit `same_bytes` relationship — the roles stay distinct and
 * no transformation is implied. The source hash is never left null.
 */
function runInput(
  prov: ExecutableProvenance,
  sha: string,
  path: string,
  declaredBrand: string,
  declaredAlcohol: string,
): AnalysisRunCreationInput {
  return {
    runId: `run-${sha}`,
    createdAt: FIXED_TIMESTAMP,
    product: { productId: "wine-precheck", revisionId: sha },
    sourceArtifact: { artifactId: `artifact-${sha}`, sha256: sha },
    sanitizedDerivative: { derivativeId: `deriv-${sha}`, path, sha256: sha },
    declaredFacts: {
      brandName: operatorFact(declaredBrand),
      alcoholValue: operatorFact(declaredAlcohol),
    },
    versionManifest: {
      ...prov,
      sourceArtifactSha256: sha,
      sanitizedDerivativeSha256: sha,
      derivativeRelationship: "same_bytes",
    },
    checkIds: ["brand-name-check", "wine-alcohol-check"],
  };
}

export async function runPrecheckService(
  request: PrecheckServiceRequest,
): Promise<Result<PrecheckServiceResponse, PrecheckServiceError>> {
  if (request.declaredBrand.trim() === "") {
    return fail("INVALID_DECLARED_VALUE", "Enter the application brand name.");
  }
  if (request.declaredAlcohol.trim() === "") {
    return fail("INVALID_DECLARED_VALUE", "Enter the application alcohol value.");
  }

  const resolved = await resolveBytes(request);
  if (!resolved.ok) return resolved;
  const { bytes, mediaType, displayName } = resolved.value;

  const sha = createHash("sha256").update(bytes).digest("hex");
  request.diagnostics?.recordSource({ sha256: sha, mediaType, byteSize: bytes.length });
  const path = `${sha}.${extensionFor(mediaType)}`;

  // One canonical provenance drives the run, extractor, orchestration, and
  // assembly, so every executable identity is identical across all layers.
  const prov = await getExecutableProvenance(request.diagnostics);
  request.diagnostics?.recordExecutable(prov);

  const runResult = createAnalysisRun(
    runInput(prov, sha, path, request.declaredBrand, request.declaredAlcohol),
  );
  if (!runResult.ok) return fail("ASSEMBLY_FAILED", "Could not initialize the analysis run.");
  const run = runResult.value;

  const extractorInput: ExtractionInput = {
    imageBytes: bytes,
    artifactRef: run.sourceArtifact.artifactId,
    derivativeSha256: sha,
    processedAt: FIXED_TIMESTAMP,
    extractionAdapterId: prov.extractionAdapterId,
    extractionAdapterVersion: prov.extractionAdapterVersion,
    ocrEngine: prov.ocrEngine as AnalyzerOcrEngine,
    parserId: prov.parserId,
    parserVersion: prov.parserVersion,
    diagnostics: request.diagnostics,
  };
  const extraction = await extractLabelEvidence(extractorInput);
  if (!extraction.ok) return mapExtractionError(extraction.error.code);
  const analyzer = extraction.value;

  const orchestration = runWinePrecheck({
    run: runInput(prov, sha, path, request.declaredBrand, request.declaredAlcohol),
    sanitizedDerivativeSha256: sha,
    declaredFacts: {
      applicationBrandName: operatorFact(request.declaredBrand),
      applicationAlcoholValue: operatorFact(request.declaredAlcohol),
    },
    analyzer,
    coverage: { brandNameProcessed: true, alcoholStatementProcessed: true },
  });
  if (!orchestration.ok) {
    request.diagnostics?.fail("orchestration-completed", {
      layer: "orchestrator",
      code: orchestration.error.code,
      issues: orchestration.error.issues,
    });
    const code =
      orchestration.error.code === "PROFILE_MISMATCH" ? "PROFILE_MISMATCH" : "EXTRACTION_FAILED";
    return fail(code, "The pre-check could not be evaluated for this image.");
  }
  request.diagnostics?.reach("orchestration-completed", undefined, { once: true });

  const assembled = assemblePrecheckResult({
    run,
    orchestration: orchestration.value,
    analyzer,
    declaredFacts: {
      applicationBrandName: operatorFact(request.declaredBrand),
      applicationAlcoholValue: operatorFact(request.declaredAlcohol),
    },
    expectedProvenance: prov,
  });
  if (!assembled.ok) {
    request.diagnostics?.fail("assembly-export-completed", {
      layer: "assembly",
      code: assembled.error.code,
      issues: assembled.error.issues,
    });
    return fail("ASSEMBLY_FAILED", "The pre-check result could not be assembled.");
  }

  return buildResponse(
    assembled.value,
    {
      displayName,
      mediaType,
      byteSize: bytes.length,
      source: request.source,
    },
    request.diagnostics,
  );
}

/**
 * Project a validated result into the bounded response: rebuild the canonical
 * JSON export through the committed builder, verify its checksum, build the
 * deterministic readable report against that same checksum, and derive the
 * stable filenames. This is the single place both the pre-check and the
 * disposition-append paths produce a response, so their exports never diverge.
 */
function buildResponse(
  result: PrecheckResult,
  file: PrecheckServiceResponse["file"],
  diagnostics?: PrecheckServiceRequest["diagnostics"],
): Result<PrecheckServiceResponse, PrecheckServiceError> {
  const exportResult = buildJsonExport(result);
  if (!exportResult.ok) {
    diagnostics?.fail("assembly-export-completed", {
      layer: "assembly",
      code: exportResult.error.code,
      issues: exportResult.error.issues,
    });
    return fail("EXPORT_CHECKSUM_FAILED", "The JSON export could not be produced.");
  }
  const verified = verifyExportIntegrity(exportResult.value);
  if (!verified.ok) {
    diagnostics?.fail("assembly-export-completed", {
      layer: "assembly",
      code: verified.error.code,
      issues: verified.error.issues,
    });
    return fail("EXPORT_CHECKSUM_FAILED", "The JSON export failed its integrity check.");
  }

  const filename = suggestedExportFilename(verified.value);
  if (!filename.ok) {
    diagnostics?.fail("assembly-export-completed", {
      layer: "assembly",
      code: filename.error.code,
      issues: filename.error.issues,
    });
    return fail("EXPORT_CHECKSUM_FAILED", "The export filename could not be derived.");
  }

  const report = buildReadableReport({
    result,
    jsonChecksum: verified.value.integrity.value,
  });
  if (!report.ok) {
    diagnostics?.fail("assembly-export-completed", {
      layer: "assembly",
      code: report.error.code,
      issues: report.error.issues,
    });
    return fail("REPORT_FAILED", "The readable report could not be produced.");
  }

  // Server-issued append authorization: proves this server assembled the machine
  // result. The signing secret is never placed in the export, report, or client
  // payload — only this opaque HMAC over the machine-result id is returned.
  const token = issueAppendToken(result.machineResultId);
  if (!token.ok) {
    diagnostics?.fail("assembly-export-completed", {
      layer: "assembly",
      code: token.error.code,
      issues: [],
    });
    return fail(
      "APPEND_SIGNING_KEY_UNAVAILABLE",
      "The append-authorization service is not configured.",
    );
  }

  rememberLatestAppendableExport(result.machineResultId, verified.value.integrity.value);
  diagnostics?.reach("assembly-export-completed", undefined, { once: true });

  return ok({
    machineResultId: result.machineResultId,
    appendToken: token.token,
    profile: { id: result.profile.id, version: result.profile.version },
    advisoryNotice: result.advisoryNotice,
    declaredFacts: result.declaredFacts,
    observations: result.observations,
    evidenceAssessments: result.evidenceAssessments,
    findings: result.findings,
    humanFieldConfirmationHistory: result.humanFieldConfirmationHistory,
    humanDispositionHistory: result.humanDispositionHistory,
    suggestedFilename: filename.value,
    exportJson: serializeExportCanonical(verified.value),
    report: { html: report.value.html, filename: report.value.filename },
    file,
  });
}

interface ReconstructedSubmittedResult {
  result: PrecheckResult;
  exportIntegrity: string;
}

/** Reconstruct a `PrecheckResult` from a parsed, checksum-validated JSON export. */
function resultFromExport(
  exportJson: string,
): Result<ReconstructedSubmittedResult, PrecheckServiceError> {
  const parsed = parseJsonExport(exportJson);
  if (!parsed.ok)
    return fail("INVALID_SUBMITTED_RESULT", "The submitted result could not be validated.");
  const e = parsed.value;
  const candidate = {
    machineResultId: e.generatedFrom.machineResultId,
    resultSchemaVersion: e.generatedFrom.resultSchemaVersion,
    mode: e.mode,
    profile: e.profile,
    run: e.run,
    declaredFacts: e.declaredFacts,
    evidenceAssessments: e.evidenceAssessments,
    observations: e.observations,
    findings: e.findings,
    versionManifest: e.versionManifest,
    humanFieldConfirmationHistory: e.humanFieldConfirmationHistory,
    advisoryNotice: e.advisoryNotice,
    ...(e.advisoryQuality !== undefined ? { advisoryQuality: e.advisoryQuality } : {}),
    humanDispositionHistory: e.humanDispositionHistory,
  };
  const validated = validatePrecheckResult(candidate);
  if (!validated.ok)
    return fail("INVALID_SUBMITTED_RESULT", "The submitted result could not be validated.");
  return ok({ result: validated.value, exportIntegrity: e.integrity.value });
}

/**
 * Append one operator disposition to an already-validated result and return the
 * refreshed bounded response with rebuilt JSON and readable-report exports.
 *
 * Machine findings, observations, the version manifest, and the machine-result
 * id are taken from the re-validated submitted export and never from any
 * separate client field, so a caller cannot inject or mutate them. The
 * disposition id and sequence are assigned server-side; `recordedAt` is supplied
 * by the caller (generated at the workflow boundary).
 */
export function appendDispositionToResult(
  request: PrecheckDispositionRequest,
): Result<PrecheckServiceResponse, PrecheckServiceError> {
  if (request.actorId.trim() === "")
    return fail("INVALID_DISPOSITION", "Enter an operator identifier.");
  if (request.reasonCode.trim() === "") return fail("INVALID_DISPOSITION", "Enter a reason code.");
  if (request.recordedAt.trim() === "")
    return fail("INVALID_DISPOSITION", "A recorded-at timestamp is required.");

  const reconstructed = resultFromExport(request.exportJson);
  if (!reconstructed.ok) return reconstructed;
  const { result, exportIntegrity } = reconstructed.value;

  // Authenticate the append against the machine-result id the parser recomputed
  // from the submitted content. Re-checksumming or forging a self-consistent
  // record is not enough: the caller must also present a token this server
  // signed for exactly this recomputed machine-result id.
  const authorized = verifyAppendToken(request.appendToken, result.machineResultId);
  if (!authorized.ok) {
    const message =
      authorized.error.code === "APPEND_SIGNING_KEY_UNAVAILABLE"
        ? "The append-authorization service is not configured."
        : authorized.error.code === "MISSING_APPEND_TOKEN"
          ? "A server-issued append-authorization token is required."
          : "The append-authorization token is not valid for this result.";
    return fail(authorized.error.code, message);
  }

  const freshness = verifyLatestAppendableExport(result.machineResultId, exportIntegrity);
  if (!freshness.ok) return freshness;

  // Reference validation: any referenced rule/check must exist in this result.
  const knownRuleIds = new Set<string>(result.findings.map((f) => f.ruleId));
  const knownCheckIds = new Set<string>(result.evidenceAssessments.map((a) => a.checkId));
  for (const ruleId of request.references?.ruleIds ?? []) {
    if (!knownRuleIds.has(ruleId))
      return fail("INVALID_DISPOSITION_REFERENCE", "A referenced rule id is not in this result.");
  }
  for (const checkId of request.references?.checkIds ?? []) {
    if (!knownCheckIds.has(checkId))
      return fail("INVALID_DISPOSITION_REFERENCE", "A referenced check id is not in this result.");
  }

  const input: DispositionEntryInput = {
    dispositionId: `disposition-${result.humanDispositionHistory.length + 1}`,
    actorId: request.actorId,
    recordedAt: request.recordedAt,
    decision: request.decision,
    reasonCode: request.reasonCode,
    ...(request.note !== undefined && request.note.trim() !== "" ? { note: request.note } : {}),
    ...(request.references !== undefined ? { references: request.references } : {}),
  };

  const appended = appendDisposition(result, input);
  if (!appended.ok) return fail("INVALID_DISPOSITION", "The disposition could not be recorded.");

  return buildResponse(appended.value, request.file);
}

/**
 * Append one human field confirmation to an already-validated result and return
 * the refreshed bounded response with rebuilt JSON and readable-report exports.
 */
export function appendFieldConfirmationToResult(
  request: PrecheckFieldConfirmationRequest,
): Result<PrecheckServiceResponse, PrecheckServiceError> {
  if (request.recordedAt.trim() === "") {
    return fail("INVALID_FIELD_CONFIRMATION", "A recorded-at timestamp is required.");
  }

  const reconstructed = resultFromExport(request.exportJson);
  if (!reconstructed.ok) return reconstructed;
  const { result, exportIntegrity } = reconstructed.value;

  const authorized = verifyAppendToken(request.appendToken, result.machineResultId);
  if (!authorized.ok) {
    const message =
      authorized.error.code === "APPEND_SIGNING_KEY_UNAVAILABLE"
        ? "The append-authorization service is not configured."
        : authorized.error.code === "MISSING_APPEND_TOKEN"
          ? "A server-issued append-authorization token is required."
          : "The append-authorization token is not valid for this result.";
    return fail(authorized.error.code, message);
  }

  const freshness = verifyLatestAppendableExport(result.machineResultId, exportIntegrity);
  if (!freshness.ok) return freshness;

  let input: HumanFieldConfirmationEntryInput;
  switch (request.decisionType) {
    case "accepted-machine-reading":
      input = {
        fieldId: request.fieldId,
        decisionType: "accepted-machine-reading",
        recordedAt: request.recordedAt,
        ...(request.note !== undefined && request.note.trim() !== "" ? { note: request.note } : {}),
        ...(request.humanGeometry !== undefined ? { humanGeometry: request.humanGeometry } : {}),
      };
      break;
    case "selected-alternate":
      if (!request.alternateId || request.alternateId.trim() === "") {
        return fail(
          "INVALID_FIELD_CONFIRMATION",
          "Select a valid alternate before confirming this field.",
        );
      }
      input = {
        fieldId: request.fieldId,
        decisionType: "selected-alternate",
        alternateId: request.alternateId,
        recordedAt: request.recordedAt,
        ...(request.note !== undefined && request.note.trim() !== "" ? { note: request.note } : {}),
        ...(request.humanGeometry !== undefined ? { humanGeometry: request.humanGeometry } : {}),
      };
      break;
    case "corrected-value": {
      if (!request.correctedValue || request.correctedValue.trim() === "") {
        return fail(
          "INVALID_FIELD_CONFIRMATION",
          "Enter a corrected value before confirming this field.",
        );
      }
      const correctedValue = validateHumanCorrectedValue(request.fieldId, request.correctedValue);
      if (!correctedValue.ok) {
        return fail("INVALID_FIELD_CONFIRMATION", correctedValue.error.message);
      }
      input = {
        fieldId: request.fieldId,
        decisionType: "corrected-value",
        correctedValue: correctedValue.value,
        recordedAt: request.recordedAt,
        ...(request.note !== undefined && request.note.trim() !== "" ? { note: request.note } : {}),
        ...(request.humanGeometry !== undefined ? { humanGeometry: request.humanGeometry } : {}),
      };
      break;
    }
    case "field-not-visible":
      input = {
        fieldId: request.fieldId,
        decisionType: "field-not-visible",
        recordedAt: request.recordedAt,
        ...(request.note !== undefined && request.note.trim() !== "" ? { note: request.note } : {}),
        ...(request.humanGeometry !== undefined ? { humanGeometry: request.humanGeometry } : {}),
      };
      break;
    case "field-unreadable":
      input = {
        fieldId: request.fieldId,
        decisionType: "field-unreadable",
        recordedAt: request.recordedAt,
        ...(request.note !== undefined && request.note.trim() !== "" ? { note: request.note } : {}),
        ...(request.humanGeometry !== undefined ? { humanGeometry: request.humanGeometry } : {}),
      };
      break;
  }

  const appended = appendHumanFieldConfirmation(result, {
    confirmationId: `field-confirmation-${result.humanFieldConfirmationHistory.length + 1}`,
    ...input,
  });
  if (!appended.ok) {
    return fail("INVALID_FIELD_CONFIRMATION", "The field confirmation could not be recorded.");
  }

  return buildResponse(appended.value, request.file);
}
