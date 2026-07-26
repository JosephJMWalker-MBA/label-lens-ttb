// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { GET } from "./route";

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
  delete process.env.LABEL_LENS_PROXY_DIAGNOSTIC;
  delete process.env.LABEL_LENS_PROXY_DIAGNOSTIC_TOKEN;
  delete process.env.LABEL_LENS_PROXY_DIAGNOSTIC_HMAC_SECRET;
}

const TOKEN = "operator-only-diagnostic-token-value";
const HMAC_SECRET = "test-only-hmac-secret-at-least-32-characters";

function requestWith(headers: Record<string, string>): Request {
  return new Request("http://localhost:3000/api/admin/proxy-diagnostic", { headers });
}

beforeEach(resetEnv);
afterEach(resetEnv);

describe("GET /api/admin/proxy-diagnostic", () => {
  it("responds 404 when the diagnostic is not explicitly enabled (default, safe-off)", async () => {
    process.env.LABEL_LENS_PROXY_DIAGNOSTIC_TOKEN = TOKEN;
    process.env.LABEL_LENS_PROXY_DIAGNOSTIC_HMAC_SECRET = HMAC_SECRET;
    const response = await GET(requestWith({ "x-diagnostic-token": TOKEN }));
    expect(response.status).toBe(404);
  });

  it("responds 503 when enabled but the token or HMAC secret is not configured", async () => {
    process.env.LABEL_LENS_PROXY_DIAGNOSTIC = "true";
    const response = await GET(requestWith({ "x-diagnostic-token": TOKEN }));
    expect(response.status).toBe(503);
    const body = await response.text();
    expect(body).not.toContain(TOKEN);
    expect(body).not.toContain(HMAC_SECRET);
  });

  it("responds 404 (not 401/403) when enabled but the operator token is missing or wrong, revealing nothing about why", async () => {
    process.env.LABEL_LENS_PROXY_DIAGNOSTIC = "true";
    process.env.LABEL_LENS_PROXY_DIAGNOSTIC_TOKEN = TOKEN;
    process.env.LABEL_LENS_PROXY_DIAGNOSTIC_HMAC_SECRET = HMAC_SECRET;

    const missing = await GET(requestWith({}));
    expect(missing.status).toBe(404);

    const wrong = await GET(requestWith({ "x-diagnostic-token": "not-the-token" }));
    expect(wrong.status).toBe(404);
  });

  it("returns the bounded diagnostic report only with the correct token, once fully configured", async () => {
    process.env.LABEL_LENS_PROXY_DIAGNOSTIC = "true";
    process.env.LABEL_LENS_PROXY_DIAGNOSTIC_TOKEN = TOKEN;
    process.env.LABEL_LENS_PROXY_DIAGNOSTIC_HMAC_SECRET = HMAC_SECRET;

    const response = await GET(
      requestWith({
        "x-diagnostic-token": TOKEN,
        "x-forwarded-for": "203.0.113.7, 10.0.0.5",
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { headers: Array<{ header: string }> };
    expect(Array.isArray(body.headers)).toBe(true);
    expect(body.headers.some((h) => h.header === "x-forwarded-for")).toBe(true);
  });

  it("never leaks the raw forwarded-for value, the operator token, the HMAC secret, cookies, or authorization in the response", async () => {
    process.env.LABEL_LENS_PROXY_DIAGNOSTIC = "true";
    process.env.LABEL_LENS_PROXY_DIAGNOSTIC_TOKEN = TOKEN;
    process.env.LABEL_LENS_PROXY_DIAGNOSTIC_HMAC_SECRET = HMAC_SECRET;

    const response = await GET(
      requestWith({
        "x-diagnostic-token": TOKEN,
        "x-forwarded-for": "203.0.113.7, 10.0.0.5",
        "x-real-ip": "198.51.100.20",
        cookie: "session=super-secret-session-token",
        authorization: "Bearer super-secret-bearer-token",
      }),
    );
    const bodyText = await response.text();

    expect(bodyText).not.toContain("203.0.113.7");
    expect(bodyText).not.toContain("10.0.0.5");
    expect(bodyText).not.toContain("198.51.100.20");
    expect(bodyText).not.toContain("super-secret-session-token");
    expect(bodyText).not.toContain("super-secret-bearer-token");
    expect(bodyText).not.toContain(TOKEN);
    expect(bodyText).not.toContain(HMAC_SECRET);
  });

  it("rejects a configured token or secret that is implausibly short (fails closed, no weak defaults)", async () => {
    process.env.LABEL_LENS_PROXY_DIAGNOSTIC = "true";
    process.env.LABEL_LENS_PROXY_DIAGNOSTIC_TOKEN = "short";
    process.env.LABEL_LENS_PROXY_DIAGNOSTIC_HMAC_SECRET = HMAC_SECRET;
    const response = await GET(requestWith({ "x-diagnostic-token": "short" }));
    expect(response.status).toBe(503);
  });
});
