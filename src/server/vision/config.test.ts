// @vitest-environment node
import { describe, expect, it } from "vitest";

import { resolveVisionConfig } from "./config";

const VALID = {
  LABEL_LENS_VISION_ENDPOINT: "http://192.168.1.50:8080",
  LABEL_LENS_VISION_API_KEY: "a-long-enough-shared-key",
  LABEL_LENS_VISION_MODEL: "qwen2.5-vl-7b-instruct-q8_0",
};

describe("resolveVisionConfig", () => {
  it("is disabled when no endpoint is configured", () => {
    expect(resolveVisionConfig({})).toEqual({ state: "disabled" });
    expect(resolveVisionConfig({ LABEL_LENS_VISION_ENDPOINT: "  " })).toEqual({
      state: "disabled",
    });
  });

  it("enables with a private endpoint, key, and model", () => {
    const result = resolveVisionConfig({ ...VALID, LABEL_LENS_VISION_LABEL: "orin-01" });
    expect(result.state).toBe("enabled");
    if (result.state !== "enabled") return;
    expect(result.config.endpoint.hostname).toBe("192.168.1.50");
    expect(result.config.hostLabel).toBe("orin-01");
    expect(result.config.timeoutMs).toBe(30_000);
    expect(result.config.structuredOutput).toBe("json_schema");
  });

  it("accepts hostnames, which are checked again at connect time", () => {
    const result = resolveVisionConfig({
      ...VALID,
      LABEL_LENS_VISION_ENDPOINT: "http://orin.local:8080",
    });
    expect(result.state).toBe("enabled");
  });

  it("refuses a public literal address", () => {
    const result = resolveVisionConfig({
      ...VALID,
      LABEL_LENS_VISION_ENDPOINT: "https://8.8.8.8/v1",
    });
    expect(result.state).toBe("invalid");
    if (result.state !== "invalid") return;
    expect(result.issues.join(" ")).toMatch(/public address/);
  });

  it("fails closed rather than silently disabling on partial configuration", () => {
    const result = resolveVisionConfig({
      LABEL_LENS_VISION_ENDPOINT: VALID.LABEL_LENS_VISION_ENDPOINT,
    });
    expect(result.state).toBe("invalid");
    if (result.state !== "invalid") return;
    expect(result.issues).toHaveLength(2);
  });

  it("rejects embedded credentials, bad protocols, bad timeouts, and bad output modes", () => {
    const result = resolveVisionConfig({
      ...VALID,
      LABEL_LENS_VISION_ENDPOINT: "ftp://user:pw@192.168.1.50",
      LABEL_LENS_VISION_TIMEOUT_MS: "abc",
      LABEL_LENS_VISION_STRUCTURED_OUTPUT: "grammar",
    });
    expect(result.state).toBe("invalid");
    if (result.state !== "invalid") return;
    expect(result.issues).toHaveLength(4);
  });
});
