import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import {
  runVisionRegionBenchmark,
  shouldWritePublicVisionRegionReport,
  writeVisionRegionBenchmarkReportFiles,
} from "../../src/fixtures/eval/vision-region-benchmark.ts";

async function main() {
  const report = await runVisionRegionBenchmark();

  const localOutputDir = join(process.cwd(), ".local-vlm", "vision-region-benchmark", "latest");
  await mkdir(localOutputDir, { recursive: true });
  const localFiles = await writeVisionRegionBenchmarkReportFiles({
    report,
    outputDir: localOutputDir,
  });
  console.log(`Wrote ${localFiles.jsonPath}`);
  console.log(`Wrote ${localFiles.markdownPath}`);

  if (!shouldWritePublicVisionRegionReport(report)) {
    console.log(
      "SKIP: public governed report not written because validated real-local-vlm evidence is unavailable.",
    );
    console.log(`Decision: ${report.decision}`);
    if (report.runtime.configurationError) console.log(report.runtime.configurationError);
    return;
  }

  const publicOutputDir = join(process.cwd(), "docs", "vision-region-benchmark");
  const publicFiles = await writeVisionRegionBenchmarkReportFiles({
    report,
    outputDir: publicOutputDir,
  });
  console.log(`Wrote ${publicFiles.jsonPath}`);
  console.log(`Wrote ${publicFiles.markdownPath}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
