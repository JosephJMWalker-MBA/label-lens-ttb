import { beforeEach, describe, expect, it } from "vitest";

import {
  clearPrecheckTiming,
  getPrecheckTiming,
  hasCompletedSampleRun,
  nowMs,
  recordFirstTrustworthyResultMs,
  recordFirstUploadAfterSampleMs,
  recordFirstUploadWithoutSampleMs,
  recordSampleRequestMs,
  recordShellReadyMs,
} from "./precheck-timing";

beforeEach(() => clearPrecheckTiming());

describe("precheck-timing", () => {
  it("starts empty and reports no completed sample run", () => {
    expect(getPrecheckTiming()).toEqual({
      shellReadyMs: null,
      sampleRequestMs: null,
      firstTrustworthyResultMs: null,
      firstUploadAfterSampleMs: null,
      firstUploadWithoutSampleMs: null,
    });
    expect(hasCompletedSampleRun()).toBe(false);
  });

  it("records each sequence measurement once and never overwrites it", () => {
    recordShellReadyMs(120);
    recordSampleRequestMs(1500);
    recordFirstTrustworthyResultMs(1700);
    expect(getPrecheckTiming()).toMatchObject({
      shellReadyMs: 120,
      sampleRequestMs: 1500,
      firstTrustworthyResultMs: 1700,
    });
    // A replay's second sample must not clobber the genuine first-visit numbers.
    recordShellReadyMs(5);
    recordSampleRequestMs(50);
    recordFirstTrustworthyResultMs(60);
    expect(getPrecheckTiming()).toMatchObject({
      shellReadyMs: 120,
      sampleRequestMs: 1500,
      firstTrustworthyResultMs: 1700,
    });
  });

  it("treats a completed sample run as an observed fact once sampleRequestMs exists", () => {
    expect(hasCompletedSampleRun()).toBe(false);
    recordSampleRequestMs(900);
    expect(hasCompletedSampleRun()).toBe(true);
  });

  it("classifies uploads by observed sequence (after-sample vs without-sample)", () => {
    // Without a completed sample, only the without-sample field is recordable.
    recordFirstUploadAfterSampleMs(400);
    recordFirstUploadWithoutSampleMs(400);
    expect(getPrecheckTiming().firstUploadAfterSampleMs).toBe(400);
    expect(getPrecheckTiming().firstUploadWithoutSampleMs).toBe(400);
    // Each is recorded once.
    recordFirstUploadAfterSampleMs(999);
    expect(getPrecheckTiming().firstUploadAfterSampleMs).toBe(400);
  });

  it("ignores non-finite or negative durations", () => {
    recordShellReadyMs(Number.NaN);
    recordSampleRequestMs(-5);
    expect(getPrecheckTiming().shellReadyMs).toBeNull();
    expect(getPrecheckTiming().sampleRequestMs).toBeNull();
  });

  it("exposes a numeric monotonic clock", () => {
    expect(typeof nowMs()).toBe("number");
  });
});
