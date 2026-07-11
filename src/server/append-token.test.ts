// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { issueAppendToken, verifyAppendToken } from "./append-token";

const MACHINE_ID = "precheck-result.v1-" + "a".repeat(64);
const ENV_KEY = "LABEL_LENS_APPEND_SIGNING_KEY";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("append-token", () => {
  it("issues a token that verifies for the same machine id", () => {
    vi.stubEnv(ENV_KEY, "a-sufficiently-long-fixed-signing-secret-value");
    const issued = issueAppendToken(MACHINE_ID);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    expect(verifyAppendToken(issued.token, MACHINE_ID).ok).toBe(true);
  });

  it("rejects a token for a different machine id", () => {
    vi.stubEnv(ENV_KEY, "a-sufficiently-long-fixed-signing-secret-value");
    const issued = issueAppendToken(MACHINE_ID);
    if (!issued.ok) throw new Error("issue failed");
    const out = verifyAppendToken(issued.token, "precheck-result.v1-" + "b".repeat(64));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("INVALID_APPEND_TOKEN");
  });

  it("classifies a missing token distinctly from an invalid one", () => {
    vi.stubEnv(ENV_KEY, "a-sufficiently-long-fixed-signing-secret-value");
    const missing = verifyAppendToken("", MACHINE_ID);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe("MISSING_APPEND_TOKEN");
    const malformed = verifyAppendToken("not-a-hex-token", MACHINE_ID);
    expect(malformed.ok).toBe(false);
    if (!malformed.ok) expect(malformed.error.code).toBe("INVALID_APPEND_TOKEN");
  });

  it("in production requires an explicit environment secret", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(ENV_KEY, "");
    const issued = issueAppendToken(MACHINE_ID);
    expect(issued.ok).toBe(false);
    if (!issued.ok) expect(issued.error.code).toBe("APPEND_SIGNING_KEY_UNAVAILABLE");
  });

  it("in production rejects a secret below the minimum length", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv(ENV_KEY, "too-short");
    const issued = issueAppendToken(MACHINE_ID);
    expect(issued.ok).toBe(false);
    if (!issued.ok) expect(issued.error.code).toBe("APPEND_SIGNING_KEY_UNAVAILABLE");
  });

  it("in development falls back to a process-local secret when none is set", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv(ENV_KEY, "");
    const issued = issueAppendToken(MACHINE_ID);
    expect(issued.ok).toBe(true);
    if (!issued.ok) return;
    // The process-local secret is self-consistent within the running process.
    expect(verifyAppendToken(issued.token, MACHINE_ID).ok).toBe(true);
  });
});
