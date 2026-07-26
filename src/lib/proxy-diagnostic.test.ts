import { describe, expect, it } from "vitest";

import {
  CANDIDATE_PROXY_HEADERS,
  buildProxyDiagnosticReport,
  verifyDiagnosticToken,
} from "./proxy-diagnostic";

const SECRET = "test-only-hmac-secret-at-least-32-characters";

describe("buildProxyDiagnosticReport", () => {
  it("reports every candidate header with a fixed, bounded shape", () => {
    const report = buildProxyDiagnosticReport(new Headers(), SECRET);
    expect(report.headers.map((h) => h.header)).toEqual([...CANDIDATE_PROXY_HEADERS]);
    for (const header of report.headers) {
      expect(header.present).toBe(false);
      expect(header.hopCount).toBe(0);
      expect(header.hopDigests).toEqual([]);
    }
    expect(report.peerAddressAvailable).toBe(false);
    expect(report.peerAddressDigest).toBeNull();
    expect(typeof report.correlationId).toBe("string");
    expect(new Date(report.observedAt).toISOString()).toBe(report.observedAt);
  });

  it("never includes the raw header value anywhere in the report", () => {
    const headers = new Headers();
    headers.set("x-forwarded-for", "203.0.113.7, 10.0.0.5");
    headers.set("x-real-ip", "198.51.100.20");
    headers.set("cookie", "session=super-secret-session-token");
    headers.set("authorization", "Bearer super-secret-bearer-token");

    const report = buildProxyDiagnosticReport(headers, SECRET);
    const serialized = JSON.stringify(report);

    expect(serialized).not.toContain("203.0.113.7");
    expect(serialized).not.toContain("10.0.0.5");
    expect(serialized).not.toContain("198.51.100.20");
    expect(serialized).not.toContain("super-secret-session-token");
    expect(serialized).not.toContain("super-secret-bearer-token");
    // Only candidate headers are ever inspected — cookie/authorization never appear as keys.
    expect(serialized).not.toContain("cookie");
    expect(serialized).not.toContain("authorization");
  });

  it("counts hops and reports one digest per hop for a multi-value header", () => {
    const headers = new Headers();
    headers.set("x-forwarded-for", "203.0.113.7, 198.51.100.20, 10.0.0.5");
    const report = buildProxyDiagnosticReport(headers, SECRET);
    const xff = report.headers.find((h) => h.header === "x-forwarded-for")!;
    expect(xff.present).toBe(true);
    expect(xff.hopCount).toBe(3);
    expect(xff.hopDigests).toHaveLength(3);
    expect(new Set(xff.hopDigests).size).toBe(3);
  });

  it("produces the same digest for the same hop across independent requests (comparable, not just unique)", () => {
    const first = new Headers();
    first.set("x-forwarded-for", "203.0.113.7");
    const second = new Headers();
    second.set("x-forwarded-for", "203.0.113.7");

    const reportA = buildProxyDiagnosticReport(first, SECRET);
    const reportB = buildProxyDiagnosticReport(second, SECRET);

    expect(reportA.headers[0].hopDigests).toEqual(reportB.headers[0].hopDigests);
  });

  it("produces different digests for different hops, and different digests under different secrets", () => {
    const headersA = new Headers();
    headersA.set("x-real-ip", "203.0.113.7");
    const headersB = new Headers();
    headersB.set("x-real-ip", "198.51.100.20");

    const reportA = buildProxyDiagnosticReport(headersA, SECRET);
    const reportB = buildProxyDiagnosticReport(headersB, SECRET);
    expect(reportA.headers.find((h) => h.header === "x-real-ip")!.hopDigests).not.toEqual(
      reportB.headers.find((h) => h.header === "x-real-ip")!.hopDigests,
    );

    const reportUnderOtherSecret = buildProxyDiagnosticReport(
      headersA,
      "a-completely-different-test-secret-value-32",
    );
    expect(reportA.headers.find((h) => h.header === "x-real-ip")!.hopDigests).not.toEqual(
      reportUnderOtherSecret.headers.find((h) => h.header === "x-real-ip")!.hopDigests,
    );
  });

  it("normalizes whitespace and case before digesting so equivalent hops compare equal", () => {
    const headersA = new Headers();
    headersA.set("x-forwarded-for", "  203.0.113.7  ,10.0.0.5");
    const headersB = new Headers();
    headersB.set("x-forwarded-for", "203.0.113.7,  10.0.0.5  ");

    const reportA = buildProxyDiagnosticReport(headersA, SECRET);
    const reportB = buildProxyDiagnosticReport(headersB, SECRET);
    expect(reportA.headers[0].hopDigests).toEqual(reportB.headers[0].hopDigests);
  });

  it("assigns a fresh correlation ID per call", () => {
    const a = buildProxyDiagnosticReport(new Headers(), SECRET);
    const b = buildProxyDiagnosticReport(new Headers(), SECRET);
    expect(a.correlationId).not.toBe(b.correlationId);
  });
});

describe("verifyDiagnosticToken", () => {
  it("accepts the exact configured token", () => {
    expect(
      verifyDiagnosticToken("operator-secret-token-value", "operator-secret-token-value"),
    ).toBe(true);
  });

  it("rejects a mismatched token", () => {
    expect(verifyDiagnosticToken("wrong-token", "operator-secret-token-value")).toBe(false);
  });

  it("rejects an empty provided or configured token", () => {
    expect(verifyDiagnosticToken("", "operator-secret-token-value")).toBe(false);
    expect(verifyDiagnosticToken("operator-secret-token-value", "")).toBe(false);
  });

  it("rejects tokens of different lengths without throwing", () => {
    expect(() =>
      verifyDiagnosticToken("short", "a-much-longer-configured-token-value"),
    ).not.toThrow();
    expect(verifyDiagnosticToken("short", "a-much-longer-configured-token-value")).toBe(false);
  });
});
