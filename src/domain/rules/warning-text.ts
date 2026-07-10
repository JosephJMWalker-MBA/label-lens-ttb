/**
 * The mandatory Alcoholic Beverage Health Warning Statement (27 CFR 16.21).
 *
 * This is statutory text: it must appear verbatim, with exact wording and
 * capitalization. It is stored as a constant so the rule compares against an
 * approved source of truth rather than any model output.
 */
export const WARNING_HEADING = "GOVERNMENT WARNING:";

export const REQUIRED_GOVERNMENT_WARNING =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not " +
  "drink alcoholic beverages during pregnancy because of the risk of birth " +
  "defects. (2) Consumption of alcoholic beverages impairs your ability to " +
  "drive a car or operate machinery, and may cause health problems.";

/** Collapse runs of whitespace so line wraps in OCR text do not cause false fails. */
export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
