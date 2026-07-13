import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Single authoritative source for the bundled verified sample image.
 *
 * Both the pre-check sample execution path (`runPrecheckService` with
 * `source: "sample"`) and the read-only sample-image endpoint read these exact
 * bytes, so the onboarding preview always corresponds to the artwork the server
 * actually analyzes. This is demonstration artwork only — it carries no
 * evaluation truth labels, and nothing here reads a fixture manifest.
 */
export const SAMPLE_IMAGE_RELATIVE_PATH =
  "tests/fixtures/precheck/m-cellars-24205001000905/label-ocr-source.jpeg";

export const SAMPLE_IMAGE_MEDIA_TYPE = "image/jpeg";

export const SAMPLE_IMAGE_DISPLAY_NAME = "M Cellars sample (bundled demo)";

/** Read the exact bundled sample bytes the pre-check analyzes. */
export async function readBundledSampleImage(): Promise<Uint8Array> {
  return new Uint8Array(await readFile(join(process.cwd(), SAMPLE_IMAGE_RELATIVE_PATH)));
}
