import { describe, expect, it } from "vitest";

import { normalizeNetContents } from "./net-contents";

describe("normalizeNetContents", () => {
  it("parses millilitres with and without a space", () => {
    expect(normalizeNetContents("750 mL").milliliters).toBe(750);
    expect(normalizeNetContents("750ml").milliliters).toBe(750);
  });

  it("treats 1 L as equivalent to 1000 mL", () => {
    expect(normalizeNetContents("1 L").milliliters).toBe(
      normalizeNetContents("1000 mL").milliliters,
    );
  });

  it("parses fractional litres", () => {
    expect(normalizeNetContents("1.75 L").milliliters).toBe(1750);
  });

  it("returns null for unparseable input and preserves the original", () => {
    const result = normalizeNetContents("one bottle");
    expect(result.milliliters).toBeNull();
    expect(result.original).toBe("one bottle");
  });
});
