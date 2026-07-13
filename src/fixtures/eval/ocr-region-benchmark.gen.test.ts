// @vitest-environment node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { format, resolveConfig } from "prettier";
import { describe, expect, it } from "vitest";

import { renderOcrRegionBenchmarkMarkdown, runOcrRegionBenchmark } from "./ocr-region-benchmark";

const RUN = process.env.EVAL_REGION_BENCHMARK === "1";
const OUTPUT_DIR = join(process.cwd(), "docs/ocr-region-isolation-benchmark");

async function writeFormattedJson(filePath: string, value: unknown) {
  const config = (await resolveConfig(filePath)) ?? {};
  const formatted = await format(JSON.stringify(value), {
    ...config,
    filepath: filePath,
    parser: "json",
  });
  writeFileSync(filePath, formatted);
}

(RUN ? describe : describe.skip)("ocr region benchmark generation", () => {
  it(
    "runs the evaluation-only benchmark and writes the committed report artifacts",
    async () => {
      const report = await runOcrRegionBenchmark();

      mkdirSync(OUTPUT_DIR, { recursive: true });
      await writeFormattedJson(join(OUTPUT_DIR, "report.json"), report);
      writeFileSync(join(OUTPUT_DIR, "report.md"), renderOcrRegionBenchmarkMarkdown(report));

      expect(report.cases.length).toBe(report.benchmarkCaseCount);
    },
    20 * 60_000,
  );
});
