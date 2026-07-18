export const SEMANTIC_REGION_ONTOLOGY_VERSION = "semantic-region-ontology.v1" as const;

export const SEMANTIC_REGION_FAMILIES = [
  "structural",
  "identity",
  "regulatory",
  "commercial",
  "presentation",
  "unknown",
] as const;
export type SemanticRegionFamily = (typeof SEMANTIC_REGION_FAMILIES)[number];

export const SEMANTIC_REGION_CLASSES_BY_FAMILY = {
  structural: [
    "artifact",
    "display_panel",
    "information_panel",
    "auxiliary_panel",
    "unknown_panel",
  ],
  identity: [
    "brand_bearing_display",
    "producer_name_address",
    "class_type",
    "appellation",
    "vintage",
  ],
  regulatory: ["alcohol_statement", "government_warning", "net_contents", "mandatory_disclosure"],
  commercial: ["barcode", "qr_code", "domain", "sku_like_region"],
  presentation: [
    "logo",
    "illustration",
    "decorative_script",
    "decorative_prose",
    "background_texture",
  ],
  unknown: ["unknown_text_region", "unknown_non_text_region", "conflicting_classification"],
} as const satisfies Record<SemanticRegionFamily, readonly string[]>;

export type SemanticRegionClass =
  (typeof SEMANTIC_REGION_CLASSES_BY_FAMILY)[SemanticRegionFamily][number];

export const SEMANTIC_REGION_CLASSES = Object.values(
  SEMANTIC_REGION_CLASSES_BY_FAMILY,
).flat() as SemanticRegionClass[];

export function semanticFamilyOf(semanticClass: SemanticRegionClass): SemanticRegionFamily {
  for (const family of SEMANTIC_REGION_FAMILIES) {
    if ((SEMANTIC_REGION_CLASSES_BY_FAMILY[family] as readonly string[]).includes(semanticClass)) {
      return family;
    }
  }
  throw new Error(`unknown semantic region class ${semanticClass}`);
}

export const SEMANTIC_ANNOTATION_RULES = [
  "Annotate sparse high-value targets and hard negatives, not every visible region.",
  "Geometry is normalized to the committed original image frame and may remain approximate.",
  "Multiple semantic classes are retained when the artwork supports legitimate ambiguity.",
  "Unknown and conflicting classification are valid annotations and diagnostic outcomes.",
  "Adjudicated truth evaluates the diagnostic but is never a classifier or OCR-search feature.",
  "Ranking scores order hypotheses; they are not calibrated probabilities or correctness confidence.",
  "No unobserved text or inferred character may be added to a proposal or projection.",
] as const;
