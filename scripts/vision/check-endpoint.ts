/**
 * `npm run vision:check` — confirm the private vision host is reachable, is
 * private, accepts the API key, and can transcribe a rendered test label.
 *
 * Reads the same LABEL_LENS_VISION_* settings the application uses, so a pass
 * here means the app will be able to use the reader with this configuration.
 */
import sharp from "sharp";

import { visionRequest } from "../../src/server/vision/client.ts";
import { resolveVisionConfig } from "../../src/server/vision/config.ts";
import { transcribeRegion } from "../../src/server/vision/region-transcription.ts";

const TEST_LABEL_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600">
  <rect width="900" height="600" fill="#f4efe6"/>
  <text x="450" y="200" font-family="Georgia, serif" font-size="96" text-anchor="middle" fill="#2b1d12">CEDAR RIDGE</text>
  <text x="450" y="300" font-family="Helvetica, Arial, sans-serif" font-size="40" text-anchor="middle" fill="#2b1d12">Pinot Noir</text>
  <text x="450" y="520" font-family="Helvetica, Arial, sans-serif" font-size="30" text-anchor="middle" fill="#2b1d12">13.5% ALC./VOL.  750 ML</text>
</svg>`;

async function main() {
  const resolved = resolveVisionConfig(process.env);
  if (resolved.state === "disabled") {
    console.error(
      "Vision reader is not configured. Set LABEL_LENS_VISION_ENDPOINT, _API_KEY, and _MODEL.",
    );
    process.exitCode = 1;
    return;
  }
  if (resolved.state === "invalid") {
    console.error("Vision reader configuration is invalid:");
    for (const issue of resolved.issues) console.error(`  - ${issue}`);
    process.exitCode = 1;
    return;
  }
  const { config } = resolved;
  console.log(`Endpoint: ${config.endpoint.origin} (${config.hostLabel})`);
  console.log(`Model:    ${config.model}`);

  const models = await visionRequest(config, "GET", "/models");
  const served = ((models.body as { data?: Array<{ id?: unknown }> }).data ?? [])
    .map((entry) => entry.id)
    .filter((id): id is string => typeof id === "string");
  console.log(
    `Served:   ${served.join(", ") || "(server did not list models)"} [${models.latencyMs} ms]`,
  );

  const png = await sharp(Buffer.from(TEST_LABEL_SVG)).png().toBuffer();
  const meta = await sharp(png).metadata();
  const result = await transcribeRegion(config, new Uint8Array(png), {
    left: 0,
    top: 0,
    width: meta.width ?? 900,
    height: meta.height ?? 600,
  });
  if (!result.ok) {
    console.error(`Transcription failed: ${result.code} — ${result.message}`);
    if (result.code === "HTTP_STATUS" || result.code === "UNPARSEABLE_RESPONSE") {
      console.error(
        "If the server rejects structured output, retry with LABEL_LENS_VISION_STRUCTURED_OUTPUT=off.",
      );
    }
    process.exitCode = 1;
    return;
  }

  const text = result.value.lines.join(" ").toUpperCase();
  const expected = ["CEDAR RIDGE", "PINOT NOIR", "13.5%", "750 ML"];
  const missing = expected.filter((fragment) => !text.includes(fragment));
  console.log(`Read (${result.value.legibility}, ${result.value.provenance.latencyMs} ms):`);
  for (const line of result.value.lines) console.log(`  | ${line}`);
  if (missing.length > 0) {
    console.error(
      `Reachable, but the test label was not read fully. Missing: ${missing.join(", ")}`,
    );
    process.exitCode = 1;
    return;
  }
  console.log("OK: the vision reader is reachable and transcribes the test label.");
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
