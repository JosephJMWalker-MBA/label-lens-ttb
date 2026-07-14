import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { resolveLocalVlmConfig } from "../../src/fixtures/eval/vision-observer/local-vlm/llama-server-config.ts";
import {
  runLocalVlmContaminationSequence,
  writeLocalVlmReportFiles,
} from "../../src/fixtures/eval/vision-observer/local-vlm/contamination-harness.ts";
import type { LocalVlmConfigInput } from "../../src/fixtures/eval/vision-observer/local-vlm/local-vlm.types.ts";

async function main() {
  const config = await resolveLocalVlmConfig(process.env as LocalVlmConfigInput);
  if (!config.ok) {
    console.log("SKIP: local VLM contamination requires explicit local configuration.");
    console.log(config.error.message);
    return;
  }

  const outputDir = join(process.cwd(), ".local-vlm", "contamination");
  await mkdir(outputDir, { recursive: true });
  const report = await runLocalVlmContaminationSequence({ config: config.value, outputDir });
  const files = await writeLocalVlmReportFiles({
    report,
    outputDir,
    stem: "local-vlm-contamination",
  });
  console.log(`Wrote ${files.jsonPath}`);
  console.log(`Wrote ${files.markdownPath}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
