import { describe, expect, it } from "vitest";

import { levenshtein, similarity } from "./levenshtein";

describe("levenshtein", () => {
  it("is zero for identical strings", () => {
    expect(levenshtein("abc", "abc")).toBe(0);
  });

  it("counts single-edit distance", () => {
    expect(levenshtein("kitten", "sitten")).toBe(1);
    expect(levenshtein("abc", "")).toBe(3);
  });
});

describe("similarity", () => {
  it("is 1 for identical strings and 0 for fully different equal-length strings", () => {
    expect(similarity("abc", "abc")).toBe(1);
    expect(similarity("abc", "xyz")).toBe(0);
  });

  it("treats two empty strings as identical", () => {
    expect(similarity("", "")).toBe(1);
  });
});
