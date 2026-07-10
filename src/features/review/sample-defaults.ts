import type { ExpectedFields } from "@/domain/label/label.types";

/**
 * A realistic distilled-spirits example so a reviewer can exercise the form
 * without hunting for application data. Mirrors the "Stone's Throw" case used
 * across the docs and tests.
 */
export const DISTILLED_SPIRITS_SAMPLE: ExpectedFields = {
  brandName: "Stone's Throw",
  classType: "Bourbon Whiskey",
  alcoholContent: "40% ABV (80 proof)",
  netContents: "750 mL",
  nameAndAddress: "Stone's Throw Distillery, Louisville, KY",
};
