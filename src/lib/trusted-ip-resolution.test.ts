import { createRateLimitKey, getIp } from "@better-auth/core/utils/ip";
import { describe, expect, it } from "vitest";

import { resolveTrustedIpAddressConfig } from "./trusted-ip-config";

/**
 * Exercises the real Better Auth `getIp` resolver (not a reimplementation)
 * with the config our `resolveTrustedIpAddressConfig` produces, proving the
 * behavior this issue's verification gate requires — without depending on
 * network access or a live deployment.
 */
describe("trusted client IP resolution (issue #164)", () => {
  const path = "/sign-in/email";

  function headersWith(name: string, value: string): Headers {
    const headers = new Headers();
    headers.set(name, value);
    return headers;
  }

  it("without a configured trusted proxy, a single-hop forwarded-for header still resolves an ordinary client (login unaffected)", () => {
    const options = { advanced: { ipAddress: resolveTrustedIpAddressConfig({}) } };
    const ip = getIp(headersWith("x-forwarded-for", "203.0.113.7"), options);
    expect(ip).toBe("203.0.113.7");
  });

  it("without a configured trusted proxy, a multi-hop chain cannot be trusted (current, unchanged behavior)", () => {
    // Better Auth's own getIp resolves an untrustworthy chain to `null` in
    // production, which is what drives the shared-bucket-fallback warning
    // this issue is about. In this test/dev environment it substitutes
    // localhost instead of `null` — either way, the real per-hop IP
    // ("203.0.113.7") is never trusted, which is what this test proves.
    const options = { advanced: { ipAddress: resolveTrustedIpAddressConfig({}) } };
    const ip = getIp(headersWith("x-forwarded-for", "203.0.113.7, 10.0.0.5"), options);
    expect(ip).not.toBe("203.0.113.7");
    expect(ip).toBe("127.0.0.1");
  });

  it("with a configured trusted proxy, distinct bounded clients resolve to distinct rate-limit keys instead of one shared bucket", () => {
    const env = {
      LABEL_LENS_TRUSTED_PROXIES: "10.0.0.0/8",
      LABEL_LENS_TRUSTED_IP_HEADERS: undefined,
    };
    const options = { advanced: { ipAddress: resolveTrustedIpAddressConfig(env) } };

    const clientA = getIp(headersWith("x-forwarded-for", "203.0.113.7, 10.0.0.5"), options);
    const clientB = getIp(headersWith("x-forwarded-for", "198.51.100.20, 10.0.0.5"), options);

    expect(clientA).toBe("203.0.113.7");
    expect(clientB).toBe("198.51.100.20");
    expect(clientA).not.toBe(clientB);
    expect(createRateLimitKey(clientA!, path)).not.toBe(createRateLimitKey(clientB!, path));
  });

  it("with a configured trusted proxy, a spoofed extra hop beyond the trusted proxy is not blindly accepted as the client", () => {
    const env = {
      LABEL_LENS_TRUSTED_PROXIES: "10.0.0.0/8",
      LABEL_LENS_TRUSTED_IP_HEADERS: undefined,
    };
    const options = { advanced: { ipAddress: resolveTrustedIpAddressConfig(env) } };

    // An attacker prepends a forged "client" IP; the real proxy still appends
    // the real client next to its own (trusted) hop. The resolver must walk
    // from the right and stop at the first untrusted hop — the real client —
    // not blindly trust whatever value sits leftmost in the header.
    const spoofed = getIp(
      headersWith("x-forwarded-for", "9.9.9.9, 203.0.113.7, 10.0.0.5"),
      options,
    );
    expect(spoofed).toBe("203.0.113.7");
    expect(spoofed).not.toBe("9.9.9.9");
  });

  it("a malformed trusted-proxy entry does not weaken the fallback: config resolution fails closed to Better Auth defaults", () => {
    const options = {
      advanced: {
        ipAddress: resolveTrustedIpAddressConfig({ LABEL_LENS_TRUSTED_PROXIES: "not-an-ip" }),
      },
    };
    // Better Auth itself drops invalid trusted-proxy entries (findInvalidTrustedProxies),
    // so an operator typo degrades to "no trusted proxies configured", not an open trust boundary.
    const ip = getIp(headersWith("x-forwarded-for", "203.0.113.7, 10.0.0.5"), options);
    expect(ip).not.toBe("203.0.113.7");
    expect(ip).toBe("127.0.0.1");
  });

  it("never logs the resolved client IP or any header value", () => {
    const logs: unknown[] = [];
    const spy = (...args: unknown[]) => logs.push(args);
    const originalLog = console.log;
    const originalWarn = console.warn;
    console.log = spy;
    console.warn = spy;
    try {
      const options = {
        advanced: {
          ipAddress: resolveTrustedIpAddressConfig({ LABEL_LENS_TRUSTED_PROXIES: "10.0.0.0/8" }),
        },
      };
      getIp(headersWith("x-forwarded-for", "203.0.113.7, 10.0.0.5"), options);
    } finally {
      console.log = originalLog;
      console.warn = originalWarn;
    }
    expect(logs.flat().join(" ")).not.toContain("203.0.113.7");
  });
});
