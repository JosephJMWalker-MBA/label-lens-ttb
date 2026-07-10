import { describe, expect, it } from "vitest";

import { compareText } from "./semantic";

describe("compareText", () => {
  it("classifies identical values as exact", () => {
    const result = compareText("Stone's Throw", "Stone's Throw");
    expect(result.equivalence).toBe("exact");
  });

  // Dave's regression: human-obvious equivalence must not read as a mismatch.
  it("treats STONE'S THROW and Stone's Throw as equivalent", () => {
    const result = compareText("STONE'S THROW", "Stone's Throw");
    expect(result.equivalence).toBe("equivalent");
    expect(result.reason).toMatch(/case, spacing/i);
  });

  it("treats a typographic apostrophe as equivalent", () => {
    expect(compareText("Stone's Throw", "Stone’s Throw").equivalence).toBe("equivalent");
  });

  it("keeps a genuine mismatch visible with a reason and similarity", () => {
    const result = compareText("Stone's Throw", "Stonewall Reserve");
    expect(result.equivalence).toBe("different");
    expect(result.similarity).toBeLessThan(1);
    expect(result.reason).toMatch(/differ/i);
  });

  it("does not upgrade a close near-miss to equivalent", () => {
    // One-character brand difference must remain a difference, not a silent pass.
    const result = compareText("Rebel Yell", "Rebel Bell");
    expect(result.equivalence).toBe("different");
    expect(result.similarity).toBeGreaterThan(0.8);
  });
});
