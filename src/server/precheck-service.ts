import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { createAnalysisRun } from "@/domain/run/analysis-run";
import type { AnalysisRunCreationInput } from "@/domain/run/analysis-run.types";
import type { DeclaredFact } from "@/domain/run/declared-facts.types";
import type { AnalyzerOcrEngine } from "@/pipeline/analyzer/analyzer.types";
import { buildJsonExport, verifyExportIntegrity } from "@/pipeline/export/json/build-json-export";
import { serializeExportCanonical } from "@/pipeline/export/json/canonical-json";
import { suggestedExportFilename } from "@/pipeline/export/json/filename";
import { extractLabelEvidence } from "@/pipeline/extractor/extractor";
import type { ExtractionInput } from "@/pipeline/extractor/extractor.types";
import { runWinePrecheck } from "@/pipeline/precheck/orchestrator";
import { winePrecheckRegistry } from "@/pipeline/precheck/wine-precheck.profile";
import { assemblePrecheckResult } from "@/pipeline/result/assemble";
import { err, ok, type Result } from "@/shared/result";

import type {
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

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
const SUPPORTED_TYPES = new Set(["image/png", "image/jpeg"]);

// Fixed deterministic metadata: this advisory slice does not persist real
// timestamps, so identity stays a function of content + committed versions.
const FIXED_TIMESTAMP = "2026-07-10T00:00:00Z";
const ADAPTER_ID = "local-two-field-extractor";
const ADAPTER_VERSION = "1.0.0";
const PARSER_ID = "wine-alcohol-parse";
const PARSER_VERSION = "1.0.0";
const OCR_ENGINE: AnalyzerOcrEngine = {
  kind: "ocr",
  engineId: "tesseract.js",
  engineVersion: "7.0.0",
  modelId: "eng",
};
const APP_PACKAGE_VERSION = "0.1.0";
const SAMPLE_FIXTURE = "tests/fixtures/precheck/m-cellars-24205001000905/label-ocr-source.jpeg";

function fail(
  code: PrecheckServiceError["code"],
  message: string,
): Result<never, PrecheckServiceError> {
  return err({ code, message });
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
  if (bytes.length > MAX_UPLOAD_BYTES)
    return fail("FILE_TOO_LARGE", "Image exceeds the 15 MB limit.");
  const mediaType = request.mediaType ?? "";
  if (!SUPPORTED_TYPES.has(mediaType)) {
    return fail("UNSUPPORTED_TYPE", "Unsupported image type. Use PNG or JPEG.");
  }
  return ok({ bytes, mediaType, displayName: request.filename?.trim() || "label image" });
}

function runInput(
  sha: string,
  path: string,
  declaredBrand: string,
  declaredAlcohol: string,
): AnalysisRunCreationInput {
  return {
    runId: `run-${sha}`,
    createdAt: FIXED_TIMESTAMP,
    product: { productId: "wine-precheck", revisionId: sha },
    sourceArtifact: { artifactId: `artifact-${sha}`, sha256: null },
    sanitizedDerivative: { derivativeId: `deriv-${sha}`, path, sha256: sha },
    declaredFacts: {
      brandName: operatorFact(declaredBrand),
      alcoholValue: operatorFact(declaredAlcohol),
    },
    versionManifest: {
      sourceArtifactSha256: null,
      sanitizedDerivativeSha256: sha,
      extractionAdapterId: ADAPTER_ID,
      extractionAdapterVersion: ADAPTER_VERSION,
      ocrEngine: { kind: "ocr", engineId: "tesseract.js", engineVersion: "7.0.0" },
      parserId: PARSER_ID,
      parserVersion: PARSER_VERSION,
      ruleProfileId: winePrecheckRegistry.profileId,
      ruleProfileVersion: winePrecheckRegistry.profileVersion,
      rules: winePrecheckRegistry.ruleManifest(),
      authorities: [
        { citation: "27 CFR 4.32; 27 CFR 4.33", snapshotDate: "2026-07-10" },
        { citation: "27 CFR 4.36", snapshotDate: "2026-07-10" },
      ],
      applicationBuild: { packageVersion: APP_PACKAGE_VERSION },
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
  const path = `${sha}.${extensionFor(mediaType)}`;

  const runResult = createAnalysisRun(
    runInput(sha, path, request.declaredBrand, request.declaredAlcohol),
  );
  if (!runResult.ok) return fail("ASSEMBLY_FAILED", "Could not initialize the analysis run.");
  const run = runResult.value;

  const extractorInput: ExtractionInput = {
    imageBytes: bytes,
    artifactRef: run.sourceArtifact.artifactId,
    derivativeSha256: sha,
    processedAt: FIXED_TIMESTAMP,
    extractionAdapterId: ADAPTER_ID,
    extractionAdapterVersion: ADAPTER_VERSION,
    ocrEngine: OCR_ENGINE,
    parserId: PARSER_ID,
    parserVersion: PARSER_VERSION,
  };
  const extraction = await extractLabelEvidence(extractorInput);
  if (!extraction.ok) {
    const code =
      extraction.error.code === "UNSUPPORTED_FORMAT"
        ? "UNSUPPORTED_TYPE"
        : extraction.error.code === "CORRUPT_IMAGE" ||
            extraction.error.code === "EMPTY_IMAGE" ||
            extraction.error.code === "DIMENSIONS_OUT_OF_BOUNDS"
          ? "CORRUPT_IMAGE"
          : "EXTRACTION_FAILED";
    return fail(code, "The image could not be read for evidence extraction.");
  }
  const analyzer = extraction.value;

  const orchestration = runWinePrecheck({
    run: runInput(sha, path, request.declaredBrand, request.declaredAlcohol),
    sanitizedDerivativeSha256: sha,
    declaredFacts: {
      applicationBrandName: operatorFact(request.declaredBrand),
      applicationAlcoholValue: operatorFact(request.declaredAlcohol),
    },
    analyzer,
    coverage: { brandNameProcessed: true, alcoholStatementProcessed: true },
  });
  if (!orchestration.ok) {
    const code =
      orchestration.error.code === "PROFILE_MISMATCH" ? "PROFILE_MISMATCH" : "EXTRACTION_FAILED";
    return fail(code, "The pre-check could not be evaluated for this image.");
  }

  const assembled = assemblePrecheckResult({
    run,
    orchestration: orchestration.value,
    analyzer,
    declaredFacts: {
      applicationBrandName: operatorFact(request.declaredBrand),
      applicationAlcoholValue: operatorFact(request.declaredAlcohol),
    },
  });
  if (!assembled.ok) return fail("ASSEMBLY_FAILED", "The pre-check result could not be assembled.");
  const result = assembled.value;

  const exportResult = buildJsonExport(result);
  if (!exportResult.ok)
    return fail("EXPORT_CHECKSUM_FAILED", "The JSON export could not be produced.");
  const verified = verifyExportIntegrity(exportResult.value);
  if (!verified.ok)
    return fail("EXPORT_CHECKSUM_FAILED", "The JSON export failed its integrity check.");

  const filename = suggestedExportFilename(verified.value);
  if (!filename.ok)
    return fail("EXPORT_CHECKSUM_FAILED", "The export filename could not be derived.");

  return ok({
    machineResultId: result.machineResultId,
    profile: { id: result.profile.id, version: result.profile.version },
    advisoryNotice: result.advisoryNotice,
    declaredFacts: result.declaredFacts,
    observations: result.observations,
    evidenceAssessments: result.evidenceAssessments,
    findings: result.findings,
    suggestedFilename: filename.value,
    exportJson: serializeExportCanonical(verified.value),
    file: { displayName, mediaType, byteSize: bytes.length, source: request.source },
  });
}
