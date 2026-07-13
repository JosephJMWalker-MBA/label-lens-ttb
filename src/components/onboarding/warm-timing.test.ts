import { beforeEach, describe, expect, it } from "vitest";

import {
  clearPrecheckTiming,
  getPrecheckTiming,
  isServiceWarm,
  nowMs,
  recordColdMs,
  recordWarmMs,
} from "./warm-timing";

beforeEach(() => clearPrecheckTiming());

describe("warm-timing", () => {
  it("starts empty and reports the service as cold", () => {
    expect(getPrecheckTiming()).toEqual({ coldMs: null, warmMs: null });
    expect(isServiceWarm()).toBe(false);
  });

  it("records the first cold measurement and does not overwrite it", () => {
    recordColdMs(1200);
    expect(getPrecheckTiming().coldMs).toBe(1200);
    expect(isServiceWarm()).toBe(true);
    // A replay's second cold run must not clobber the genuine first-visit number.
    recordColdMs(300);
    expect(getPrecheckTiming().coldMs).toBe(1200);
  });

  it("only records a warm run after a cold run exists, and only once", () => {
    // No cold run yet: an upload is not a genuine warm comparison.
    recordWarmMs(400);
    expect(getPrecheckTiming().warmMs).toBeNull();

    recordColdMs(1500);
    recordWarmMs(400);
    expect(getPrecheckTiming().warmMs).toBe(400);
    // The first warm run stands; later uploads do not overwrite it.
    recordWarmMs(900);
    expect(getPrecheckTiming().warmMs).toBe(400);
  });

  it("ignores non-finite or negative durations", () => {
    recordColdMs(Number.NaN);
    recordColdMs(-5);
    expect(getPrecheckTiming().coldMs).toBeNull();
  });

  it("exposes a numeric monotonic clock", () => {
    expect(typeof nowMs()).toBe("number");
  });
});
