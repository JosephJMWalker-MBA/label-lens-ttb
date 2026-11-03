import { resolveVisionConfig } from "@/server/vision/config";

// Lightweight liveness/readiness probe for hosting platforms and container
// health checks. It performs no OCR, image, or filesystem work, so a health
// ping never spins up the extraction stack. It only reports that the Node
// server is up and whether the required append-signing secret is configured, so
// a misconfigured deployment is visible without exposing the secret's value.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(): Response {
  // In production the pre-check route requires LABEL_LENS_APPEND_SIGNING_KEY to
  // issue append tokens; surface its presence (never its value) so a broken
  // deployment is diagnosable from the health check alone.
  const key = process.env.LABEL_LENS_APPEND_SIGNING_KEY;
  const appendSigningKeyConfigured = typeof key === "string" && key.length >= 32;

  // Configuration state only. Reachability is checked with
  // `npm run vision:check`, never from a health ping.
  const vision = resolveVisionConfig();
  const visionReader =
    vision.state === "enabled"
      ? "configured"
      : vision.state === "invalid"
        ? "misconfigured"
        : "disabled";

  return Response.json(
    {
      status: "ok",
      service: "label-lens-ttb",
      appendSigningKeyConfigured,
      visionReader,
    },
    { status: 200 },
  );
}
