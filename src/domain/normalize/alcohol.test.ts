import { describe, expect, it } from "vitest";

import { normalizeAlcohol } from "./alcohol";

describe("normalizeAlcohol", () => {
  it("parses a percentage ABV", () => {
    expect(normalizeAlcohol("40% ABV").abv).toBe(40);
  });

  it("parses 'ALC. 40% BY VOL'", () => {
    expect(normalizeAlcohol("ALC. 40% BY VOL").abv).toBe(40);
  });

  it("treats 80 proof as equivalent to 40% ABV", () => {
    expect(normalizeAlcohol("80 proof").abv).toBe(normalizeAlcohol("40% ABV").abv);
  });

  it("keeps a real difference visible", () => {
    expect(normalizeAlcohol("45% ABV").abv).not.toBe(normalizeAlcohol("40% ABV").abv);
  });

  it("returns null for unparseable input and preserves the original", () => {
    const result = normalizeAlcohol("strong");
    expect(result.abv).toBeNull();
    expect(result.original).toBe("strong");
  });
});
