import { buildProxyDiagnosticReport, verifyDiagnosticToken } from "@/lib/proxy-diagnostic";

/**
 * TEMPORARY diagnostic endpoint (issue #183) — see
 * src/lib/proxy-diagnostic.ts and docs/deployment.md for the removal
 * requirement and privacy guardrails. Do not add fields here without
 * re-reading both.
 *
 * Disabled unless `LABEL_LENS_PROXY_DIAGNOSTIC=true`. When disabled this
 * responds 404, the same as a route that does not exist, so its presence is
 * not discoverable from the outside. When enabled, a request must also
 * present the exact operator token via the `X-Diagnostic-Token` header,
 * compared in constant time against `LABEL_LENS_PROXY_DIAGNOSTIC_TOKEN`. Both
 * that token and `LABEL_LENS_PROXY_DIAGNOSTIC_HMAC_SECRET` must be configured
 * before the diagnostic will respond at all — there is no default secret and
 * no fallback.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (process.env.LABEL_LENS_PROXY_DIAGNOSTIC !== "true") {
    return new Response(null, { status: 404 });
  }

  const token = process.env.LABEL_LENS_PROXY_DIAGNOSTIC_TOKEN;
  const hmacSecret = process.env.LABEL_LENS_PROXY_DIAGNOSTIC_HMAC_SECRET;
  if (!token || token.length < 20 || !hmacSecret || hmacSecret.length < 32) {
    return Response.json(
      {
        error:
          "Proxy diagnostic is enabled but not fully configured. Set LABEL_LENS_PROXY_DIAGNOSTIC_TOKEN (>=20 chars) and LABEL_LENS_PROXY_DIAGNOSTIC_HMAC_SECRET (>=32 chars).",
      },
      { status: 503 },
    );
  }

  const provided = request.headers.get("x-diagnostic-token") ?? "";
  if (!verifyDiagnosticToken(provided, token)) {
    return new Response(null, { status: 404 });
  }

  const report = buildProxyDiagnosticReport(request.headers, hmacSecret);
  return Response.json(report, { status: 200 });
}
