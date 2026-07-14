import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { resolveLocalVlmConfig } from "../../src/fixtures/eval/vision-observer/local-vlm/llama-server-config.ts";
import {
  runLocalVlmSmoke,
  writeLocalVlmReportFiles,
} from "../../src/fixtures/eval/vision-observer/local-vlm/contamination-harness.ts";
import type { LocalVlmConfigInput } from "../../src/fixtures/eval/vision-observer/local-vlm/local-vlm.types.ts";

async function main() {
  const config = await resolveLocalVlmConfig(process.env as LocalVlmConfigInput);
  if (!config.ok) {
    console.log("SKIP: local VLM smoke requires explicit local configuration.");
    console.log(config.error.message);
    return;
  }

  const outputDir = join(process.cwd(), ".local-vlm", "smoke");
  await mkdir(outputDir, { recursive: true });
  const report = await runLocalVlmSmoke({ config: config.value, outputDir });
  const files = await writeLocalVlmReportFiles({
    report,
    outputDir,
    stem: "local-vlm-smoke",
  });
  console.log(`Wrote ${files.jsonPath}`);
  console.log(`Wrote ${files.markdownPath}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
