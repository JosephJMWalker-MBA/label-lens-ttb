import { describe, expect, it } from "vitest";

import { resolveTrustedIpAddressConfig } from "./trusted-ip-config";

describe("resolveTrustedIpAddressConfig", () => {
  it("resolves to an empty config (Better Auth defaults) when both env vars are unset", () => {
    expect(resolveTrustedIpAddressConfig({})).toEqual({});
  });

  it("ignores blank/whitespace-only env values, preserving the default fallback", () => {
    expect(
      resolveTrustedIpAddressConfig({
        LABEL_LENS_TRUSTED_IP_HEADERS: "   ",
        LABEL_LENS_TRUSTED_PROXIES: "",
      }),
    ).toEqual({});
  });

  it("parses a comma-separated header list, trimming whitespace and dropping empties", () => {
    expect(
      resolveTrustedIpAddressConfig({
        LABEL_LENS_TRUSTED_IP_HEADERS: " x-real-ip , x-forwarded-for ,,",
      }),
    ).toEqual({ ipAddressHeaders: ["x-real-ip", "x-forwarded-for"] });
  });

  it("parses a comma-separated trusted-proxy CIDR list", () => {
    expect(
      resolveTrustedIpAddressConfig({
        LABEL_LENS_TRUSTED_PROXIES: "10.0.0.0/8, 192.168.1.1",
      }),
    ).toEqual({ trustedProxies: ["10.0.0.0/8", "192.168.1.1"] });
  });

  it("resolves both keys together when both env vars are set", () => {
    expect(
      resolveTrustedIpAddressConfig({
        LABEL_LENS_TRUSTED_IP_HEADERS: "x-forwarded-for",
        LABEL_LENS_TRUSTED_PROXIES: "10.0.0.0/8",
      }),
    ).toEqual({
      ipAddressHeaders: ["x-forwarded-for"],
      trustedProxies: ["10.0.0.0/8"],
    });
  });
});
