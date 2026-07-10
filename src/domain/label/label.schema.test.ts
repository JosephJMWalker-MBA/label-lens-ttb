import { describe, expect, it } from "vitest";

import { expectedFieldsSchema } from "./label.schema";

const validInput = {
  brandName: "Stone's Throw",
  classType: "Distilled Spirits Specialty",
  alcoholContent: "40% ABV",
  netContents: "750 mL",
  nameAndAddress: "Stone's Throw Distillery, Louisville, KY",
};

describe("expectedFieldsSchema", () => {
  it("accepts complete application data and trims whitespace", () => {
    const result = expectedFieldsSchema.safeParse({
      ...validInput,
      brandName: "  Stone's Throw  ",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.brandName).toBe("Stone's Throw");
    }
  });

  it("rejects a missing required field with a readable message", () => {
    const result = expectedFieldsSchema.safeParse({ ...validInput, brandName: "   " });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/brand name is required/i);
    }
  });

  it("normalizes a blank optional country of origin to undefined", () => {
    const result = expectedFieldsSchema.safeParse({ ...validInput, countryOfOrigin: "   " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.countryOfOrigin).toBeUndefined();
    }
  });

  it("preserves a provided country of origin for imports", () => {
    const result = expectedFieldsSchema.safeParse({ ...validInput, countryOfOrigin: "Scotland" });
    expect(result.success && result.data.countryOfOrigin).toBe("Scotland");
  });
});
