import { describe, expect, it } from "vitest";

import { safeInternalPath } from "./redirect-safety";

describe("safeInternalPath", () => {
  const fallback = "/seller";

  it("accepts simple internal paths", () => {
    expect(safeInternalPath("/agent", fallback)).toBe("/agent");
    expect(safeInternalPath("/agent/submissions/pkg-1", fallback)).toBe("/agent/submissions/pkg-1");
    expect(safeInternalPath("/seller?tab=status", fallback)).toBe("/seller?tab=status");
  });

  it("rejects absolute and protocol-relative URLs", () => {
    expect(safeInternalPath("https://evil.com", fallback)).toBe(fallback);
    expect(safeInternalPath("http://evil.com/agent", fallback)).toBe(fallback);
    expect(safeInternalPath("//evil.com", fallback)).toBe(fallback);
    expect(safeInternalPath("//evil.com/agent", fallback)).toBe(fallback);
  });

  it("rejects backslash and scheme tricks", () => {
    expect(safeInternalPath("/\\evil.com", fallback)).toBe(fallback);
    expect(safeInternalPath("\\/evil.com", fallback)).toBe(fallback);
    expect(safeInternalPath("javascript:alert(1)", fallback)).toBe(fallback);
    expect(safeInternalPath("/path:with-colon", fallback)).toBe(fallback);
  });

  it("rejects encoded external URLs", () => {
    expect(safeInternalPath("%2F%2Fevil.com", fallback)).toBe(fallback);
    expect(safeInternalPath("/%2F%2Fevil.com", fallback)).toBe(fallback);
    expect(safeInternalPath("https%3A%2F%2Fevil.com", fallback)).toBe(fallback);
  });

  it("rejects non-string, empty, malformed, and oversized input", () => {
    expect(safeInternalPath(undefined, fallback)).toBe(fallback);
    expect(safeInternalPath(null, fallback)).toBe(fallback);
    expect(safeInternalPath(42, fallback)).toBe(fallback);
    expect(safeInternalPath("", fallback)).toBe(fallback);
    expect(safeInternalPath("agent", fallback)).toBe(fallback);
    expect(safeInternalPath("/", fallback)).toBe(fallback);
    expect(safeInternalPath("/a b", fallback)).toBe(fallback);
    expect(safeInternalPath("/" + "a".repeat(600), fallback)).toBe(fallback);
    expect(safeInternalPath("%ZZ", fallback)).toBe(fallback);
  });
});
