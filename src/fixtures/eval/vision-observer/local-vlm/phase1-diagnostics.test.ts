// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { runPhase1DiagnosticSequence } from "./phase1-diagnostics";

describe("phase 1 diagnostic reporting", () => {
  it("blocks vision attention when image transport fails", async () => {
    const runVisionAttention = vi.fn(async () => {
      throw new Error("should not run");
    });

    const report = await runPhase1DiagnosticSequence({
      runImageTransport: async () => ({
        layer: "image-transport",
        status: "FAIL" as const,
        summary: "transport failed",
        issues: ["no image supplied"],
        blockedBy: null,
        evidence: {
          requestContentType: "application/json",
          rawRequestBody: "{}",
          requestMediaType: "application/json",
          imageCount: 0,
          imageMimeTypes: [],
          imageByteLengths: [],
          imageDigests: [],
          duplicateImageDigests: [],
        },
      }),
      runVisionAttention,
    });

    expect(report.imageTransport.status).toBe("FAIL");
    expect(report.visionAttention.status).toBe("BLOCKED");
    expect(report.visionAttention.blockedBy).toBe("image-transport");
    expect(runVisionAttention).not.toHaveBeenCalled();
  });
});
