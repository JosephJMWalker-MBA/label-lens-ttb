/**
 * Operator-entered application facts, kept strictly separate from artwork the
 * pipeline observes. A declared fact is what a human asserts the application
 * says; it is never derived from the label image.
 */

export const DECLARED_FACT_SOURCE_TYPES = [
  "public-certificate-form-field",
  "operator-entered",
  "imported-structured-source",
] as const;
export type DeclaredFactSourceType = (typeof DECLARED_FACT_SOURCE_TYPES)[number];

export interface DeclaredFactProvenance {
  sourceType: DeclaredFactSourceType;
  /** Where the value came from, e.g. a TTB ID for a certificate form field. */
  sourceReference: string;
  recordedBy: string;
  recordedAt: string;
  note?: string;
}

export interface DeclaredFact {
  value: string;
  provenance: DeclaredFactProvenance;
}

/**
 * The declared facts supported by the first wine slice: brand name and the
 * application alcohol value. The alcohol value is the operator-entered
 * application figure, never the value observed on the artwork.
 */
export interface DeclaredFacts {
  brandName: DeclaredFact;
  alcoholValue: DeclaredFact;
}
