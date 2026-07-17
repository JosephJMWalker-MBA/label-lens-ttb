import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createPrecheckDiagnosticTrace,
  sanitizePrecheckDiagnosticIssues,
} from "./precheck-diagnostics";

const ORIGINAL_DIAGNOSTICS_ENV = process.env.LABEL_LENS_PRECHECK_DIAGNOSTICS;

afterEach(() => {
  if (ORIGINAL_DIAGNOSTICS_ENV === undefined) {
    delete process.env.LABEL_LENS_PRECHECK_DIAGNOSTICS;
  } else {
    process.env.LABEL_LENS_PRECHECK_DIAGNOSTICS = ORIGINAL_DIAGNOSTICS_ENV;
  }
  vi.restoreAllMocks();
});

describe("pre-check diagnostic tracing", () => {
  it("is disabled unless explicitly enabled", () => {
    delete process.env.LABEL_LENS_PRECHECK_DIAGNOSTICS;
    expect(createPrecheckDiagnosticTrace()).toBeUndefined();

    process.env.LABEL_LENS_PRECHECK_DIAGNOSTICS = "0";
    expect(createPrecheckDiagnosticTrace()).toBeUndefined();
  });

  it("emits bounded structured events without duplicate one-time boundaries", () => {
    process.env.LABEL_LENS_PRECHECK_DIAGNOSTICS = "1";
    const writes: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    const trace = createPrecheckDiagnosticTrace();
    expect(trace).toBeDefined();
    trace?.requestAccepted();
    trace?.requestAccepted();
    trace?.recordSource({
      sha256: "a".repeat(64),
      mediaType: "image/jpeg",
      byteSize: 42,
    });
    trace?.recordDecoded({ width: 10, height: 20 });
    trace?.fail("ocr-pass-completed", {
      layer: "extractor",
      code: "OCR_PASS_FAILED",
      issues: ["failed under /Users/private/project/node_modules/tesseract.js/worker.js"],
    });

    expect(writes).toHaveLength(4);
    const events = writes.map((line) =>
      JSON.parse(line.replace(/^PRECHECK_DIAGNOSTIC /, "").trim()),
    );
    expect(events[0]).toMatchObject({
      kind: "precheck-diagnostic",
      status: "reached",
      boundary: "request-accepted",
    });
    expect(events[2].source).toMatchObject({ width: 10, height: 20 });
    expect(events[3].error).toEqual({
      layer: "extractor",
      code: "OCR_PASS_FAILED",
      issues: ["failed under <path>"],
    });
    expect(events[3].runId).toBe(events[0].runId);
    expect(events[3].elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it("limits issue count and length while removing private paths", () => {
    const issues = [
      "file:///private/tmp/work/input.jpeg",
      "C:\\private\\worker.js",
      "node_modules/tesseract.js/src/worker.js",
      "Error: failed\n    at worker (/home/operator/project/worker.js:12:3)",
      ...Array.from({ length: 8 }, (_, index) => `${index}-${"x".repeat(300)}`),
    ];

    const sanitized = sanitizePrecheckDiagnosticIssues(issues);
    expect(sanitized).toHaveLength(8);
    expect(sanitized.join(" ")).not.toMatch(/\/private\/|node_modules|C:\\private/);
    expect(sanitized.join(" ")).not.toMatch(/\/home\/|\n|\r|at worker/);
    expect(Math.max(...sanitized.map((issue) => issue.length))).toBeLessThanOrEqual(240);
  });

  it("never emits request declarations, image bytes, or unrelated secret values", () => {
    process.env.LABEL_LENS_PRECHECK_DIAGNOSTICS = "1";
    const writes: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    const declaredBrand = "DO-NOT-LOG-BRAND";
    const declaredAlcohol = "DO-NOT-LOG-ALCOHOL";
    const imageBytes = "DO-NOT-LOG-IMAGE-BYTES";
    const secret = "DO-NOT-LOG-SECRET";
    const trace = createPrecheckDiagnosticTrace();
    trace?.recordSource({ sha256: "b".repeat(64), mediaType: "image/jpeg", byteSize: 99 });
    trace?.probeUnavailable("ocr-worker-script-resolved", {
      layer: "ocr",
      code: "OCR_WORKER_SCRIPT_PROBE_UNAVAILABLE",
      issues: ["bounded probe failure"],
    });

    const output = writes.join("\n");
    expect(output).not.toContain(declaredBrand);
    expect(output).not.toContain(declaredAlcohol);
    expect(output).not.toContain(imageBytes);
    expect(output).not.toContain(secret);
    expect(output).not.toMatch(/\/Users\/|\/private\/|node_modules|\n\s+at\s/);
  });
});
