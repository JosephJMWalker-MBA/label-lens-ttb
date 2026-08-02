#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface FinalizeProbeInput {
  directory: string;
  containerExitStatus: number;
}

function readJsonIfPresent(file: string): Record<string, unknown> | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function finalizeOcrRuntimeInitProbe(input: FinalizeProbeInput): Record<string, unknown> {
  mkdirSync(input.directory, { recursive: true });
  const reportPath = path.join(input.directory, "ocr-runtime-init-probe-report.json");
  const statusPath = path.join(input.directory, "ocr-runtime-init-container-status.json");
  const imageIdentityPath = path.join(input.directory, "ocr-runtime-init-image-identity.json");
  writeFileSync(
    statusPath,
    `${JSON.stringify({ containerExitStatus: input.containerExitStatus }, null, 2)}\n`,
  );

  const containerReport = readJsonIfPresent(reportPath);
  if (containerReport) {
    return containerReport;
  }

  const wrapperReport = {
    status: "HALTED",
    containerExitStatus: input.containerExitStatus,
    failureStage: "container",
    failureCode: "OCR_RUNTIME_INIT_CONTAINER_FAILED",
    failureDetail: "container emitted no closed JSON probe report",
    imageIdentity: readJsonIfPresent(imageIdentityPath),
    reportProducedByContainer: false,
    workerInitializationAttempted: false,
    workerInitialized: false,
    workerTerminationAttempted: false,
    workerTerminated: false,
    recognizeCalls: null,
    governedCorpusMounted: false,
    governedCorpusUsed: false,
    acquisitionApiInvoked: false,
    networkEnabled: false,
    runtimeUid: null,
    runtimeGid: null,
    languageAssetPath: null,
    corePath: null,
    runtimePackageClosureMatched: false,
  };
  writeFileSync(reportPath, `${JSON.stringify(wrapperReport, null, 2)}\n`);
  return wrapperReport;
}

export function main(argv = process.argv): number {
  const directory = argv[2];
  const status = Number(argv[3]);
  if (!directory || !Number.isInteger(status)) {
    throw new Error(
      "usage: finalize-ocr-runtime-init-probe <artifact-dir> <container-exit-status>",
    );
  }
  const report = finalizeOcrRuntimeInitProbe({ directory, containerExitStatus: status });
  process.stdout.write(`${JSON.stringify({ status: "OK", reportStatus: report.status })}\n`);
  return 0;
}

if (process.argv[1]?.includes("issue-149-finalize-ocr-runtime-init-probe")) {
  try {
    process.exitCode = main();
  } catch (cause) {
    process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exitCode = 1;
  }
}
