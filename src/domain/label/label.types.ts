/**
 * Core label field contracts shared by the form, extraction, and rule engine.
 *
 * `ExpectedFields` is the application data an agent enters or imports.
 * `ExtractedFields` is what the analysis pipeline observed on the label image.
 * Both use the same field keys so comparison is a straightforward join.
 */

/** Field keys the prototype verifies. */
export const LABEL_FIELDS = [
  "brandName",
  "classType",
  "alcoholContent",
  "netContents",
  "nameAndAddress",
  "countryOfOrigin",
] as const;

export type LabelField = (typeof LABEL_FIELDS)[number];

/** Expected application values entered by the reviewer. */
export interface ExpectedFields {
  brandName: string;
  classType: string;
  alcoholContent: string;
  netContents: string;
  nameAndAddress: string;
  /** Required for imports; optional otherwise. */
  countryOfOrigin?: string;
}

/** A single value the pipeline observed, with the confidence behind it. */
export interface ExtractedField {
  /** Raw observed text, or null when nothing was recovered. */
  value: string | null;
  /** Extraction confidence in the range 0..1. */
  confidence: number;
}

/**
 * Values observed on the label image. Every verifiable field plus the
 * government warning, which is validated but never entered as expected data.
 */
export type ExtractedFields = Record<LabelField, ExtractedField> & {
  governmentWarning: ExtractedField;
};
