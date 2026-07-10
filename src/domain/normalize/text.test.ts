import { describe, expect, it } from "vitest";

import { normalizeText } from "./text";

describe("normalizeText", () => {
  it("preserves the original as evidence", () => {
    expect(normalizeText("STONE'S THROW").original).toBe("STONE'S THROW");
  });

  it("treats case, spacing, and apostrophe style as equivalent", () => {
    expect(normalizeText("STONE'S THROW").canonical).toBe(
      normalizeText("Stone’s   Throw").canonical,
    );
  });

  it("strips surrounding punctuation but keeps intra-word apostrophes", () => {
    expect(normalizeText("Stone's Throw.").canonical).toBe("stone's throw");
  });

  it("keeps genuinely different values distinct", () => {
    expect(normalizeText("Stone's Throw").canonical).not.toBe(
      normalizeText("Stones Cast").canonical,
    );
  });
});
