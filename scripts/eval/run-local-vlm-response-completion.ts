import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import sharp from "sharp";

import { loadEvalManifest, loadCaseImage } from "../../src/fixtures/eval/eval-loader.ts";
import { loadBenchmarkCases } from "../../src/fixtures/eval/ocr-region-benchmark.ts";
import { resolveLocalVlmConfig } from "../../src/fixtures/eval/vision-observer/local-vlm/llama-server-config.ts";
import {
  runLocalVlmResponseCompletionDiagnostic,
  writeResponseCompletionDiagnosticFiles,
} from "../../src/fixtures/eval/vision-observer/local-vlm/response-completion-diagnostic.ts";
import type { LocalVlmConfigInput } from "../../src/fixtures/eval/vision-observer/local-vlm/local-vlm.types.ts";

function parseCaseId(argv: readonly string[]): string {
  const flagIndex = argv.findIndex((value) => value === "--case-id");
  if (flagIndex === -1) return "wine-multi-artifact-09";
  const caseId = argv[flagIndex + 1]?.trim();
  if (!caseId) {
    throw new Error("`--case-id` requires a non-empty case id.");
  }
  return caseId;
}

async function main() {
  const config = await resolveLocalVlmConfig(process.env as LocalVlmConfigInput);
  if (!config.ok) {
    console.log("SKIP: local VLM response completion requires explicit local configuration.");
    console.log(config.error.message);
    return;
  }

  const caseId = parseCaseId(process.argv.slice(2));
  const manifest = loadEvalManifest();
  const benchmarkCases = loadBenchmarkCases(manifest);
  const benchmarkCase = benchmarkCases.find((entry) => entry.evalCase.caseId === caseId);
  if (!benchmarkCase) {
    throw new Error(`benchmark case not found: ${caseId}`);
  }

  const source = loadCaseImage(benchmarkCase.evalCase);
  const metadata = await sharp(Buffer.from(source.bytes)).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`source metadata missing dimensions for ${caseId}`);
  }

  const report = await runLocalVlmResponseCompletionDiagnostic({
    config: config.value,
    scenarioId: benchmarkCase.evalCase.caseId,
    sourceArtifactRef: `eval-case:${benchmarkCase.evalCase.caseId}`,
    sourceBytes: source.bytes,
    sourceMediaType: benchmarkCase.record.image.mediaType,
    sourceWidth: metadata.width,
    sourceHeight: metadata.height,
  });

  const outputDir = join(process.cwd(), ".local-vlm", "response-completion", "latest");
  await mkdir(outputDir, { recursive: true });
  const files = await writeResponseCompletionDiagnosticFiles({
    report,
    outputDir,
    stem: "local-vlm-response-completion",
  });
  console.log(`Wrote ${files.jsonPath}`);
  console.log(`Wrote ${files.markdownPath}`);
  console.log(`First failing rung: ${report.firstFailingRung ?? "none"}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
