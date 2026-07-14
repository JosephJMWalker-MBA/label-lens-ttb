import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { resolveLocalVlmConfig } from "../../src/fixtures/eval/vision-observer/local-vlm/llama-server-config.ts";
import {
  runLocalVlmStress,
  writeLocalVlmReportFiles,
} from "../../src/fixtures/eval/vision-observer/local-vlm/contamination-harness.ts";
import type { LocalVlmConfigInput } from "../../src/fixtures/eval/vision-observer/local-vlm/local-vlm.types.ts";

function parseRunCount(argv: readonly string[]): number {
  const flagIndex = argv.findIndex((value) => value === "--runs");
  if (flagIndex === -1) return 10;
  const candidate = Number(argv[flagIndex + 1] ?? "10");
  if (!Number.isSafeInteger(candidate) || candidate <= 0 || candidate > 25) {
    throw new Error("`--runs` must be an integer between 1 and 25.");
  }
  return candidate;
}

async function main() {
  const config = await resolveLocalVlmConfig(process.env as LocalVlmConfigInput);
  if (!config.ok) {
    console.log("SKIP: local VLM stress requires explicit local configuration.");
    console.log(config.error.message);
    return;
  }

  const runCount = parseRunCount(process.argv.slice(2));
  const outputDir = join(process.cwd(), ".local-vlm", "stress");
  await mkdir(outputDir, { recursive: true });
  const report = await runLocalVlmStress({ config: config.value, outputDir, runCount });
  const files = await writeLocalVlmReportFiles({
    report,
    outputDir,
    stem: `local-vlm-stress-${runCount}x`,
  });
  console.log(`Wrote ${files.jsonPath}`);
  console.log(`Wrote ${files.markdownPath}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
