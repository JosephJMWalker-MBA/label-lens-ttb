import {
  OCR_REGION_BENCHMARK_CASE_ANNOTATIONS,
  type OcrRegionBenchmarkCaseAnnotation,
} from "../ocr-region-benchmark.annotations";
import type { EvalAnnotationConfidence } from "../eval-manifest.types";
import type { SemanticRegionClass } from "./ontology";
import type {
  SemanticAcquisitionOperation,
  SemanticCaseAnnotation,
  SemanticNormalizedBox,
  SemanticObjectAnnotation,
  SemanticPanelAnnotation,
} from "./types";

export const SEMANTIC_REGION_ANNOTATION_SCHEMA_VERSION = "semantic-region-annotations.v1" as const;

const FULL_IMAGE: SemanticNormalizedBox = { x: 0, y: 0, width: 1, height: 1 };

interface ContextSpec {
  id: string;
  geometry: SemanticNormalizedBox;
  classes: SemanticRegionClass[];
  expectedClass: SemanticRegionClass;
  confidence: EvalAnnotationConfidence;
  basis: string;
  ambiguous?: boolean;
  operation?: SemanticAcquisitionOperation;
}

function operationForClass(semanticClass: SemanticRegionClass): SemanticAcquisitionOperation {
  if (semanticClass === "barcode" || semanticClass === "qr_code") {
    return "barcode_decoder_future";
  }
  if (semanticClass === "alcohol_statement") return "numeric_mandatory_statement_ocr";
  if (
    semanticClass === "decorative_prose" ||
    semanticClass === "illustration" ||
    semanticClass === "background_texture"
  ) {
    return "no_read_contextual";
  }
  return "generic_text_ocr";
}

const CONTEXT_BY_CASE: Record<string, ContextSpec[]> = {
  "approved-wine-022": [
    {
      id: "producer-block",
      geometry: { x: 0.04, y: 0.01, width: 0.88, height: 0.21 },
      classes: ["producer_name_address"],
      expectedClass: "producer_name_address",
      confidence: "high",
      basis: "Top produced-and-bottled identity block is visually distinct from any brand display.",
    },
    {
      id: "barcode",
      geometry: { x: 0.02, y: 0.24, width: 0.46, height: 0.23 },
      classes: ["barcode"],
      expectedClass: "barcode",
      confidence: "high",
      basis: "Visually adjudicated UPC bars and digits on the committed image.",
    },
    {
      id: "class-type",
      geometry: { x: 0.01, y: 0.5, width: 0.47, height: 0.08 },
      classes: ["class_type"],
      expectedClass: "class_type",
      confidence: "high",
      basis: "American grape wine and Concord describe product class/type, not brand.",
    },
    {
      id: "government-warning",
      geometry: { x: 0.01, y: 0.58, width: 0.97, height: 0.4 },
      classes: ["government_warning", "mandatory_disclosure"],
      expectedClass: "government_warning",
      confidence: "high",
      basis: "Complete bold GOVERNMENT WARNING block on the lower half.",
    },
  ],
  "three-steves-winery": [
    {
      id: "decorative-prose",
      geometry: { x: 0.04, y: 0.1, width: 0.91, height: 0.61 },
      classes: ["decorative_prose"],
      expectedClass: "decorative_prose",
      confidence: "high",
      basis: "Long winery and product narrative paragraphs below the brand heading.",
    },
    {
      id: "domain",
      geometry: { x: 0.62, y: 0.69, width: 0.28, height: 0.035 },
      classes: ["domain", "producer_name_address"],
      expectedClass: "domain",
      confidence: "high",
      basis: "Visible 3StevesWinery.com token in the call-to-action line.",
    },
    {
      id: "producer-block",
      geometry: { x: 0.3, y: 0.73, width: 0.43, height: 0.035 },
      classes: ["producer_name_address"],
      expectedClass: "producer_name_address",
      confidence: "high",
      basis: "Bottled By 3 Steves Winery, Livermore, CA line.",
    },
    {
      id: "government-warning",
      geometry: { x: 0.06, y: 0.77, width: 0.89, height: 0.15 },
      classes: ["government_warning", "mandatory_disclosure"],
      expectedClass: "government_warning",
      confidence: "high",
      basis: "Visually isolated mandatory warning paragraph.",
    },
  ],
  "approved-wine-006": [
    {
      id: "government-warning",
      geometry: { x: 0.02, y: 0.13, width: 0.12, height: 0.45 },
      classes: ["government_warning", "mandatory_disclosure"],
      expectedClass: "government_warning",
      confidence: "high",
      basis: "Rotated left-side warning block.",
    },
    {
      id: "barcode",
      geometry: { x: 0.06, y: 0.64, width: 0.08, height: 0.25 },
      classes: ["barcode"],
      expectedClass: "barcode",
      confidence: "high",
      basis: "Rotated UPC on the left information panel.",
    },
    {
      id: "class-type",
      geometry: { x: 0.7, y: 0.23, width: 0.23, height: 0.09 },
      classes: ["class_type"],
      expectedClass: "class_type",
      confidence: "high",
      basis: "PINOT NOIR WINE line is product class/type context.",
    },
    {
      id: "decorative-prose",
      geometry: { x: 0.7, y: 0.35, width: 0.24, height: 0.25 },
      classes: ["decorative_prose"],
      expectedClass: "decorative_prose",
      confidence: "high",
      basis: "Back-label tasting narrative paragraph.",
    },
    {
      id: "domain",
      geometry: { x: 0.72, y: 0.78, width: 0.19, height: 0.04 },
      classes: ["domain"],
      expectedClass: "domain",
      confidence: "high",
      basis: "DARKHORSEWINE.COM domain line.",
    },
  ],
  "alfredos-wine": [
    {
      id: "class-type",
      geometry: { x: 0.14, y: 0.6, width: 0.72, height: 0.13 },
      classes: ["class_type"],
      expectedClass: "class_type",
      confidence: "high",
      basis: "Large RED WINE product class text.",
    },
    {
      id: "appellation",
      geometry: { x: 0.28, y: 0.74, width: 0.45, height: 0.06 },
      classes: ["appellation"],
      expectedClass: "appellation",
      confidence: "high",
      basis: "NAPA VALLEY appellation line.",
    },
    {
      id: "government-warning",
      geometry: { x: 0.05, y: 0.9, width: 0.64, height: 0.075 },
      classes: ["government_warning", "mandatory_disclosure"],
      expectedClass: "government_warning",
      confidence: "high",
      basis: "Bottom-left mandatory warning block.",
    },
    {
      id: "producer-block",
      geometry: { x: 0.71, y: 0.9, width: 0.23, height: 0.07 },
      classes: ["producer_name_address"],
      expectedClass: "producer_name_address",
      confidence: "high",
      basis: "Produced and bottled by Red Brick Winery block.",
    },
  ],
  "approved-wine-013": [
    {
      id: "class-type",
      geometry: { x: 0.28, y: 0.14, width: 0.47, height: 0.1 },
      classes: ["class_type", "decorative_script"],
      expectedClass: "class_type",
      confidence: "medium",
      basis: "RESERVA banner is a designation presented decoratively.",
      ambiguous: true,
    },
    {
      id: "decorative-prose",
      geometry: { x: 0.13, y: 0.25, width: 0.75, height: 0.44 },
      classes: ["decorative_prose"],
      expectedClass: "decorative_prose",
      confidence: "high",
      basis: "Two long promotional narrative blocks.",
    },
    {
      id: "government-warning",
      geometry: { x: 0.16, y: 0.74, width: 0.42, height: 0.11 },
      classes: ["government_warning", "mandatory_disclosure"],
      expectedClass: "government_warning",
      confidence: "high",
      basis: "Bottom-left mandatory warning block.",
    },
    {
      id: "producer-block",
      geometry: { x: 0.59, y: 0.74, width: 0.29, height: 0.11 },
      classes: ["producer_name_address"],
      expectedClass: "producer_name_address",
      confidence: "high",
      basis: "Imported-by identity and address block.",
    },
    {
      id: "barcode",
      geometry: { x: 0.27, y: 0.85, width: 0.48, height: 0.12 },
      classes: ["barcode"],
      expectedClass: "barcode",
      confidence: "high",
      basis: "Bottom UPC bars and digits.",
    },
  ],
  "approved-wine-035": [
    {
      id: "appellation",
      geometry: { x: 0.03, y: 0.39, width: 0.7, height: 0.16 },
      classes: ["appellation", "class_type"],
      expectedClass: "appellation",
      confidence: "high",
      basis: "Chassagne-Montrachet and La Goujonne appellation presentation.",
      ambiguous: true,
    },
    {
      id: "vintage",
      geometry: { x: 0.36, y: 0.74, width: 0.25, height: 0.09 },
      classes: ["vintage"],
      expectedClass: "vintage",
      confidence: "high",
      basis: "Isolated 2022 vintage numerals.",
    },
    {
      id: "mandatory-side-strip",
      geometry: { x: 0.79, y: 0.01, width: 0.2, height: 0.98 },
      classes: ["mandatory_disclosure", "producer_name_address", "net_contents"],
      expectedClass: "mandatory_disclosure",
      confidence: "high",
      basis:
        "Rotated right information strip containing producer, origin, alcohol, and net contents.",
      ambiguous: true,
    },
  ],
  "approved-wine-054": [
    {
      id: "government-warning",
      geometry: { x: 0.02, y: 0.32, width: 0.22, height: 0.56 },
      classes: ["government_warning", "mandatory_disclosure"],
      expectedClass: "government_warning",
      confidence: "high",
      basis: "Vertical left-side government warning.",
    },
    {
      id: "class-type",
      geometry: { x: 0.39, y: 0.12, width: 0.47, height: 0.11 },
      classes: ["class_type", "appellation"],
      expectedClass: "class_type",
      confidence: "medium",
      basis: "Coteaux Bourguignons and Red Burgundy Wine product identity lines.",
      ambiguous: true,
    },
    {
      id: "producer-block",
      geometry: { x: 0.58, y: 0.72, width: 0.37, height: 0.13 },
      classes: ["producer_name_address"],
      expectedClass: "producer_name_address",
      confidence: "high",
      basis: "Imported by T. Edward Wines, Ltd. address block.",
    },
  ],
  "la-fattoria-rotated": [
    {
      id: "government-warning",
      geometry: { x: 0.02, y: 0.02, width: 0.13, height: 0.56 },
      classes: ["government_warning", "mandatory_disclosure"],
      expectedClass: "government_warning",
      confidence: "high",
      basis: "Vertical left-side government warning.",
    },
    {
      id: "barcode",
      geometry: { x: 0.88, y: 0.2, width: 0.1, height: 0.19 },
      classes: ["barcode", "domain"],
      expectedClass: "barcode",
      confidence: "high",
      basis: "Right-side UPC with adjacent vertical domain text.",
      ambiguous: true,
    },
    {
      id: "class-type",
      geometry: { x: 0.25, y: 0.6, width: 0.48, height: 0.12 },
      classes: ["class_type"],
      expectedClass: "class_type",
      confidence: "high",
      basis: "Large BARBERA class/type display.",
    },
    {
      id: "appellation",
      geometry: { x: 0.3, y: 0.72, width: 0.42, height: 0.055 },
      classes: ["appellation"],
      expectedClass: "appellation",
      confidence: "high",
      basis: "CENTRAL COAST | CA appellation line.",
    },
    {
      id: "producer-block",
      geometry: { x: 0.04, y: 0.62, width: 0.12, height: 0.25 },
      classes: ["producer_name_address", "mandatory_disclosure"],
      expectedClass: "producer_name_address",
      confidence: "high",
      basis: "Vertical produced-and-bottled-by block.",
    },
  ],
  "patricia-green-cellars": [
    {
      id: "class-appellation",
      geometry: { x: 0.2, y: 0.01, width: 0.61, height: 0.09 },
      classes: ["class_type", "appellation"],
      expectedClass: "appellation",
      confidence: "medium",
      basis:
        "Estate Vineyard, Patty's Block, and Willamette Valley lines combine designation and appellation.",
      ambiguous: true,
    },
    {
      id: "decorative-prose",
      geometry: { x: 0.04, y: 0.1, width: 0.92, height: 0.4 },
      classes: ["decorative_prose"],
      expectedClass: "decorative_prose",
      confidence: "high",
      basis: "Long vineyard narrative paragraph.",
    },
    {
      id: "domain",
      geometry: { x: 0.18, y: 0.51, width: 0.63, height: 0.055 },
      classes: ["domain", "brand_bearing_display"],
      expectedClass: "domain",
      confidence: "medium",
      basis:
        "PATRICIAGREENCELLARS.COM legitimately carries both domain and brand-bearing identity cues.",
      ambiguous: true,
    },
    {
      id: "producer-block",
      geometry: { x: 0.17, y: 0.56, width: 0.67, height: 0.075 },
      classes: ["producer_name_address", "brand_bearing_display"],
      expectedClass: "producer_name_address",
      confidence: "medium",
      basis: "Produced and bottled by Patricia Green Cellars line shares brand-bearing text.",
      ambiguous: true,
    },
    {
      id: "government-warning",
      geometry: { x: 0.04, y: 0.65, width: 0.92, height: 0.25 },
      classes: ["government_warning", "mandatory_disclosure"],
      expectedClass: "government_warning",
      confidence: "high",
      basis: "Mandatory warning block in the lower label.",
    },
  ],
  "approved-wine-095": [
    {
      id: "producer-block",
      geometry: { x: 0.28, y: 0.02, width: 0.45, height: 0.35 },
      classes: ["producer_name_address"],
      expectedClass: "producer_name_address",
      confidence: "high",
      basis: "Importer and Italian producer identity blocks; no brand display is visible.",
    },
    {
      id: "government-warning",
      geometry: { x: 0.03, y: 0.65, width: 0.94, height: 0.25 },
      classes: ["government_warning", "mandatory_disclosure"],
      expectedClass: "government_warning",
      confidence: "high",
      basis: "Bottom government warning paragraph.",
    },
  ],
  "wine-multi-artifact-04": [
    {
      id: "vintage",
      geometry: { x: 0.1, y: 0.11, width: 0.08, height: 0.04 },
      classes: ["vintage"],
      expectedClass: "vintage",
      confidence: "high",
      basis: "2018 vintage on upper artifact.",
    },
    {
      id: "class-type",
      geometry: { x: 0.02, y: 0.16, width: 0.24, height: 0.07 },
      classes: ["class_type"],
      expectedClass: "class_type",
      confidence: "high",
      basis: "Sauvignon Blanc product class/type line.",
    },
    {
      id: "illustration",
      geometry: { x: 0.02, y: 0.22, width: 0.24, height: 0.24 },
      classes: ["illustration"],
      expectedClass: "illustration",
      confidence: "high",
      basis: "Grape photograph on the upper artifact.",
      operation: "no_read_contextual",
    },
    {
      id: "decorative-prose",
      geometry: { x: 0.02, y: 0.65, width: 0.45, height: 0.18 },
      classes: ["decorative_prose"],
      expectedClass: "decorative_prose",
      confidence: "high",
      basis: "Narrative block on the lower artifact.",
    },
    {
      id: "government-warning",
      geometry: { x: 0.05, y: 0.89, width: 0.39, height: 0.08 },
      classes: ["government_warning", "mandatory_disclosure"],
      expectedClass: "government_warning",
      confidence: "medium",
      basis: "Small warning block on the lower artifact.",
    },
  ],
  "wine-multi-artifact-09": [
    {
      id: "illustration",
      geometry: { x: 0.2, y: 0.13, width: 0.33, height: 0.2 },
      classes: ["illustration"],
      expectedClass: "illustration",
      confidence: "high",
      basis: "Butterfly illustration inside the upper artifact.",
      operation: "no_read_contextual",
    },
    {
      id: "vintage",
      geometry: { x: 0.35, y: 0.33, width: 0.1, height: 0.04 },
      classes: ["vintage"],
      expectedClass: "vintage",
      confidence: "high",
      basis: "2014 vintage below illustration.",
    },
    {
      id: "class-type",
      geometry: { x: 0.26, y: 0.36, width: 0.28, height: 0.05 },
      classes: ["class_type"],
      expectedClass: "class_type",
      confidence: "high",
      basis: "CHARDONNAY product class line.",
    },
    {
      id: "producer-block",
      geometry: { x: 0.25, y: 0.41, width: 0.32, height: 0.035 },
      classes: ["producer_name_address"],
      expectedClass: "producer_name_address",
      confidence: "high",
      basis: "Produced and bottled by Duck Walk Vineyards block.",
    },
    {
      id: "government-warning",
      geometry: { x: 0.1, y: 0.72, width: 0.24, height: 0.18 },
      classes: ["government_warning", "mandatory_disclosure"],
      expectedClass: "government_warning",
      confidence: "medium",
      basis: "Separate lower warning artifact.",
    },
  ],
};

function panelAnnotations(
  caseAnnotation: OcrRegionBenchmarkCaseAnnotation,
): SemanticPanelAnnotation[] {
  const panelId = `${caseAnnotation.caseId}:panel:primary`;
  if (caseAnnotation.caseId === "wine-multi-artifact-04") {
    return [
      {
        id: panelId,
        geometry: { x: 0.01, y: 0.01, width: 0.42, height: 0.46 },
        semanticClass: "display_panel",
        annotationConfidence: "medium",
        adjudicationBasis: "Upper front-label artifact containing both active targets.",
      },
      {
        id: `${caseAnnotation.caseId}:panel:secondary`,
        geometry: { x: 0.01, y: 0.61, width: 0.49, height: 0.38 },
        semanticClass: "information_panel",
        annotationConfidence: "medium",
        adjudicationBasis: "Lower back-label artifact containing narrative and warning context.",
      },
    ];
  }
  if (caseAnnotation.caseId === "wine-multi-artifact-09") {
    return [
      {
        id: panelId,
        geometry: { x: 0.11, y: 0.04, width: 0.55, height: 0.41 },
        semanticClass: "display_panel",
        annotationConfidence: "medium",
        adjudicationBasis: "Upper label artifact containing both active targets.",
      },
      {
        id: `${caseAnnotation.caseId}:panel:secondary`,
        geometry: { x: 0.09, y: 0.7, width: 0.25, height: 0.22 },
        semanticClass: "auxiliary_panel",
        annotationConfidence: "medium",
        adjudicationBasis: "Separate lower warning-only artifact.",
      },
    ];
  }
  const informational = new Set([
    "approved-wine-022",
    "three-steves-winery",
    "patricia-green-cellars",
    "approved-wine-095",
  ]);
  return [
    {
      id: panelId,
      geometry: FULL_IMAGE,
      semanticClass: informational.has(caseAnnotation.caseId)
        ? "information_panel"
        : "display_panel",
      annotationConfidence: "medium",
      adjudicationBasis:
        "Single committed artwork frame; panel boundary is the image frame for this sparse diagnostic.",
    },
  ];
}

function primaryPanelId(caseAnnotation: OcrRegionBenchmarkCaseAnnotation): string {
  return `${caseAnnotation.caseId}:panel:primary`;
}

function targetObjects(
  caseAnnotation: OcrRegionBenchmarkCaseAnnotation,
): SemanticObjectAnnotation[] {
  const objects: SemanticObjectAnnotation[] = [];
  const brand = caseAnnotation.fields.brand;
  if (brand) {
    const ambiguous = caseAnnotation.caseId === "patricia-green-cellars";
    const stylized = new Set([
      "luigi-giovanni-live",
      "approved-wine-035",
      "wine-multi-artifact-04",
    ]).has(caseAnnotation.caseId);
    objects.push({
      id: `${caseAnnotation.caseId}:target:brand`,
      caseId: caseAnnotation.caseId,
      geometry: brand.geometry,
      semanticClasses: ambiguous
        ? ["brand_bearing_display", "producer_name_address", "domain", "conflicting_classification"]
        : stylized
          ? ["brand_bearing_display", "decorative_script"]
          : ["brand_bearing_display"],
      expectedClass: "brand_bearing_display",
      role: "target",
      relevantField: "brand",
      annotationConfidence: brand.annotationConfidence,
      adjudicationBasis: `${caseAnnotation.geometryProvenance}; ${brand.notes}`,
      legitimateAmbiguity: ambiguous,
      panelId: primaryPanelId(caseAnnotation),
      expectedOperation: stylized ? "stylized_text_ocr" : "generic_text_ocr",
    });
  }
  const alcohol = caseAnnotation.fields.alcohol;
  if (alcohol) {
    objects.push({
      id: `${caseAnnotation.caseId}:target:alcohol`,
      caseId: caseAnnotation.caseId,
      geometry: alcohol.geometry,
      semanticClasses: ["alcohol_statement", "mandatory_disclosure"],
      expectedClass: "alcohol_statement",
      role: "target",
      relevantField: "alcohol",
      annotationConfidence: alcohol.annotationConfidence,
      adjudicationBasis: `${caseAnnotation.geometryProvenance}; ${alcohol.notes}`,
      legitimateAmbiguity: false,
      panelId: primaryPanelId(caseAnnotation),
      expectedOperation: "numeric_mandatory_statement_ocr",
    });
  }
  return objects;
}

function contextObjects(
  caseAnnotation: OcrRegionBenchmarkCaseAnnotation,
): SemanticObjectAnnotation[] {
  const panels = panelAnnotations(caseAnnotation);
  return (CONTEXT_BY_CASE[caseAnnotation.caseId] ?? []).map((spec) => {
    const centerX = spec.geometry.x + spec.geometry.width / 2;
    const centerY = spec.geometry.y + spec.geometry.height / 2;
    const panel = panels.find(
      (candidate) =>
        centerX >= candidate.geometry.x &&
        centerX <= candidate.geometry.x + candidate.geometry.width &&
        centerY >= candidate.geometry.y &&
        centerY <= candidate.geometry.y + candidate.geometry.height,
    );
    return {
      id: `${caseAnnotation.caseId}:context:${spec.id}`,
      caseId: caseAnnotation.caseId,
      geometry: spec.geometry,
      semanticClasses: spec.classes,
      expectedClass: spec.expectedClass,
      role: "hard_negative",
      relevantField: null,
      annotationConfidence: spec.confidence,
      adjudicationBasis: spec.basis,
      legitimateAmbiguity: spec.ambiguous ?? false,
      panelId: panel?.id ?? null,
      expectedOperation: spec.operation ?? operationForClass(spec.expectedClass),
    };
  });
}

export const SEMANTIC_CASE_ANNOTATIONS: SemanticCaseAnnotation[] =
  OCR_REGION_BENCHMARK_CASE_ANNOTATIONS.map((caseAnnotation) => ({
    caseId: caseAnnotation.caseId,
    panels: panelAnnotations(caseAnnotation),
    objects: [...targetObjects(caseAnnotation), ...contextObjects(caseAnnotation)],
  }));

export function semanticAnnotationForCase(caseId: string): SemanticCaseAnnotation | null {
  return SEMANTIC_CASE_ANNOTATIONS.find((annotation) => annotation.caseId === caseId) ?? null;
}
