import { readBundledSampleImage, SAMPLE_IMAGE_MEDIA_TYPE } from "@/server/sample-image";

// Node runtime is required to read the bundled fixture bytes from disk.
export const runtime = "nodejs";

/**
 * Read-only endpoint that serves the exact bundled verified sample artwork the
 * pre-check analyzes (same authoritative source as the `source: "sample"`
 * pre-check path). Demonstration artwork only — no evaluation truth labels, no
 * applicant data. GET-only; it never accepts input.
 */
export async function GET(): Promise<Response> {
  try {
    const bytes = await readBundledSampleImage();
    return new Response(Buffer.from(bytes), {
      status: 200,
      headers: {
        "content-type": SAMPLE_IMAGE_MEDIA_TYPE,
        "content-length": String(bytes.byteLength),
        "cache-control": "public, max-age=3600",
      },
    });
  } catch {
    return new Response("The bundled demonstration sample is unavailable.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}
