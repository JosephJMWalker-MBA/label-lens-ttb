#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface RuntimePackageManifest {
  name: string;
  version: string | null;
  fileCount: number;
  byteLength: number;
  aggregateSha256: string;
  entries: Array<{ path: string; byteLength: number; sha256: string }>;
}

export class OcrRuntimeProbeValidationError extends Error {
  constructor(
    public readonly code: string,
    public readonly detail?: unknown,
  ) {
    super(`${code}: ${JSON.stringify(detail ?? null)}`);
  }
}

const packageByName = (packages: RuntimePackageManifest[] | undefined, name: string) =>
  packages?.find((entry) => entry.name === name);

const readJson = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
const sha256File = (file: string): string =>
  createHash("sha256").update(readFileSync(file)).digest("hex");

const readRequiredJson = (
  file: string,
  code: string,
  reject: (code: string, detail?: unknown) => never,
): Record<string, unknown> => {
  try {
    return readJson(file);
  } catch (cause) {
    return reject(code, String(cause));
  }
};

export function validateOcrRuntimeInitProbeReport(report: Record<string, unknown>): void {
  const reject = (code: string, detail?: unknown): never => {
    throw new OcrRuntimeProbeValidationError(code, detail);
  };
  if (report.status !== "OK") reject("OCR_RUNTIME_INIT_PROBE_NOT_OK", report.status);
  if (report.containerExitStatus !== 0)
    reject("OCR_RUNTIME_INIT_CONTAINER_NONZERO", report.containerExitStatus);
  if (report.reportProducedByContainer !== true)
    reject("OCR_RUNTIME_INIT_REPORT_NOT_CONTAINER_PRODUCED");
  if (report.workerInitializationAttempted !== true) reject("OCR_WORKER_INIT_NOT_ATTEMPTED");
  if (report.workerInitialized !== true) reject("OCR_WORKER_NOT_INITIALIZED");
  if (report.workerTerminationAttempted !== true) reject("OCR_WORKER_TERMINATION_NOT_ATTEMPTED");
  if (report.workerTerminated !== true) reject("OCR_WORKER_NOT_TERMINATED");
  if (report.recognizeCalls !== 0) reject("OCR_RECOGNITION_OCCURRED", report.recognizeCalls);
  if (report.governedCorpusMounted !== false) reject("GOVERNED_CORPUS_MOUNTED");
  if (report.governedCorpusUsed !== false) reject("GOVERNED_CORPUS_USED");
  if (report.acquisitionApiInvoked !== false) reject("ACQUISITION_API_INVOKED");
  if (report.networkEnabled !== false) reject("NETWORK_ENABLED");
  if (report.runtimeUid !== 10149) reject("RUNTIME_UID_MISMATCH", report.runtimeUid);
  if (report.runtimeGid !== 10149) reject("RUNTIME_GID_MISMATCH", report.runtimeGid);
  if (report.languageAssetPath !== "/opt/acquisition/assets") {
    reject("OCR_ASSET_PATH_MISMATCH", report.languageAssetPath);
  }
  if (report.corePath !== "/opt/acquisition/node_modules/tesseract.js-core") {
    reject("OCR_CORE_PATH_MISMATCH", report.corePath);
  }
  if (report.runtimePackageClosureMatched !== true) reject("RUNTIME_PACKAGE_CLOSURE_NOT_MATCHED");
  const expected = report.expectedRuntimePackageClosure as { packages?: RuntimePackageManifest[] };
  const observed = report.observedRuntimePackageClosure as { packages?: RuntimePackageManifest[] };
  if (JSON.stringify(expected) !== JSON.stringify(observed)) {
    reject("RUNTIME_PACKAGE_CLOSURE_MISMATCH");
  }
  for (const [name, version] of [
    ["tesseract.js", "7.0.0"],
    ["tesseract.js-core", "7.0.0"],
  ] as const) {
    const expectedPackage = packageByName(expected.packages, name);
    const observedPackage = packageByName(observed.packages, name);
    if (expectedPackage?.version !== version || observedPackage?.version !== version) {
      reject("RUNTIME_PACKAGE_VERSION_MISMATCH", { name, expectedPackage, observedPackage });
    }
  }
}

export function validateOcrRuntimeInitProbeArtifact(directory: string): void {
  const reject = (code: string, detail?: unknown): never => {
    throw new OcrRuntimeProbeValidationError(code, detail);
  };
  const reportPath = path.join(directory, "ocr-runtime-init-probe-report.json");
  const statusPath = path.join(directory, "ocr-runtime-init-container-status.json");
  const imagePath = path.join(directory, "ocr-runtime-init-image-identity.json");
  const report = readRequiredJson(
    reportPath,
    "OCR_RUNTIME_INIT_REPORT_MISSING_OR_MALFORMED",
    reject,
  );
  const status = readRequiredJson(
    statusPath,
    "OCR_RUNTIME_INIT_STATUS_MISSING_OR_MALFORMED",
    reject,
  );
  const image = readRequiredJson(
    imagePath,
    "OCR_RUNTIME_INIT_IMAGE_IDENTITY_MISSING_OR_MALFORMED",
    reject,
  );
  if (status.containerExitStatus !== report.containerExitStatus) {
    reject("OCR_RUNTIME_INIT_STATUS_REPORT_MISMATCH", {
      status,
      report: report.containerExitStatus,
    });
  }
  if (JSON.stringify(image) !== JSON.stringify(report.imageIdentity)) {
    reject("OCR_RUNTIME_INIT_IMAGE_IDENTITY_REPORT_MISMATCH");
  }
  if (sha256File(imagePath) !== report.imageIdentitySha256) {
    reject("OCR_RUNTIME_INIT_IMAGE_IDENTITY_DIGEST_MISMATCH");
  }
  validateOcrRuntimeInitProbeReport(report);
}

export function main(argv = process.argv): number {
  const directory = argv[2];
  if (!directory) throw new Error("usage: validate-ocr-runtime-init-probe <artifact-dir>");
  validateOcrRuntimeInitProbeArtifact(directory);
  process.stdout.write(`${JSON.stringify({ status: "OK", directory })}\n`);
  return 0;
}

if (
  process.argv[1] !== undefined &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  try {
    process.exitCode = main();
  } catch (cause) {
    process.stderr.write(
      `${cause instanceof Error ? cause.message : String(cause)}
`,
    );
    process.exitCode = 1;
  }
}
