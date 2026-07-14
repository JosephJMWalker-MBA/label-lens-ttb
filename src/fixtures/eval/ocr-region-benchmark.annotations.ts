import type { EvalAnnotationConfidence, EvalNormalizedBox } from "./eval-manifest.types";

export const OCR_REGION_BENCHMARK_ANNOTATION_SCHEMA_VERSION =
  "ocr-region-benchmark-annotations.v1" as const;

export type OcrRegionBenchmarkFieldKey = "brand" | "alcohol";

export interface OcrRegionBenchmarkFieldAnnotation {
  geometry: EvalNormalizedBox;
  annotationConfidence: EvalAnnotationConfidence;
  humanReadable: boolean;
  notes: string;
}

export interface OcrRegionBenchmarkCaseAnnotation {
  caseId: string;
  inclusionReasons: string[];
  challengeSlices: string[];
  geometryProvenance: string;
  orientationProvenance: "eval-manifest";
  adjudicationNotes: string;
  fields: Partial<Record<OcrRegionBenchmarkFieldKey, OcrRegionBenchmarkFieldAnnotation>>;
}

const HUMAN_VISUAL_ADJUDICATION =
  "manual visual adjudication against the committed benchmark image in the repository checkout";

export const OCR_REGION_BENCHMARK_CASE_ANNOTATIONS: OcrRegionBenchmarkCaseAnnotation[] = [
  {
    caseId: "wine-multi-artifact-09",
    inclusionReasons: ["correct present-field control", "multi-artifact label"],
    challengeSlices: ["correct-control", "multi-artifact"],
    geometryProvenance: HUMAN_VISUAL_ADJUDICATION,
    orientationProvenance: "eval-manifest",
    adjudicationNotes: "The top artifact contains both the brand presentation and alcohol line.",
    fields: {
      brand: {
        geometry: { x: 0.12, y: 0.05, width: 0.24, height: 0.11 },
        annotationConfidence: "high",
        humanReadable: true,
        notes: "Top label title only; avoids the lower warning-only artifact.",
      },
      alcohol: {
        geometry: { x: 0.2, y: 0.37, width: 0.15, height: 0.06 },
        annotationConfidence: "high",
        humanReadable: true,
        notes: "Bottom line of the top label with ALC. 12.5% BY VOL.",
      },
    },
  },
  {
    caseId: "approved-wine-022",
    inclusionReasons: ["correct absent-brand control", "bottom alcohol"],
    challengeSlices: ["correct-control", "absent-brand", "bottom-alcohol"],
    geometryProvenance: HUMAN_VISUAL_ADJUDICATION,
    orientationProvenance: "eval-manifest",
    adjudicationNotes:
      "No separate brand presentation is visible; only the alcohol line is targeted.",
    fields: {
      alcohol: {
        geometry: { x: 0.57, y: 0.24, width: 0.34, height: 0.12 },
        annotationConfidence: "high",
        humanReadable: true,
        notes: "Includes the 12% ALC BY VOL. line and its immediate context.",
      },
    },
  },
  {
    caseId: "three-steves-winery",
    inclusionReasons: ["correct absent-alcohol control", "multiple brand-like phrases"],
    challengeSlices: ["correct-control", "absent-alcohol", "multiple-brand-like-phrases"],
    geometryProvenance: HUMAN_VISUAL_ADJUDICATION,
    orientationProvenance: "eval-manifest",
    adjudicationNotes: "The brand is clear at the top header; no alcohol statement is visible.",
    fields: {
      brand: {
        geometry: { x: 0.23, y: 0.01, width: 0.45, height: 0.08 },
        annotationConfidence: "high",
        humanReadable: true,
        notes: "Top title only; excludes the explanatory paragraph and URL.",
      },
    },
  },
  {
    caseId: "approved-wine-006",
    inclusionReasons: ["brand candidate-filtering failure", "low-contrast control"],
    challengeSlices: ["candidate-filtering", "low-contrast", "bottom-alcohol"],
    geometryProvenance: HUMAN_VISUAL_ADJUDICATION,
    orientationProvenance: "eval-manifest",
    adjudicationNotes:
      "The target brand presentation is the top-right DARK HORSE heading rather than the narrative copy or domain.",
    fields: {
      brand: {
        geometry: { x: 0.7, y: 0.08, width: 0.25, height: 0.12 },
        annotationConfidence: "high",
        humanReadable: true,
        notes: "Tight crop on the DARK HORSE heading and wine line.",
      },
      alcohol: {
        geometry: { x: 0.73, y: 0.84, width: 0.16, height: 0.05 },
        annotationConfidence: "high",
        humanReadable: true,
        notes: "Bottom-right ALC. 13.5% BY VOL. line only.",
      },
    },
  },
  {
    caseId: "alfredos-wine",
    inclusionReasons: ["brand candidate-filtering failure", "alcohol candidate-filtering failure"],
    challengeSlices: ["candidate-filtering", "bottom-alcohol", "front-label"],
    geometryProvenance: HUMAN_VISUAL_ADJUDICATION,
    orientationProvenance: "eval-manifest",
    adjudicationNotes:
      "The clear brand presentation is the top ALFREDO'S WINE heading rather than the producer block.",
    fields: {
      brand: {
        geometry: { x: 0.22, y: 0.18, width: 0.58, height: 0.13 },
        annotationConfidence: "high",
        humanReadable: true,
        notes: "Top title only; excludes RED WINE and NAPA VALLEY.",
      },
      alcohol: {
        geometry: { x: 0.69, y: 0.91, width: 0.19, height: 0.05 },
        annotationConfidence: "high",
        humanReadable: true,
        notes: "Bottom-right 14% ALC line with minimal producer context.",
      },
    },
  },
  {
    caseId: "luigi-giovanni-live",
    inclusionReasons: ["brand candidate-filtering failure", "alcohol side-region failure"],
    challengeSlices: ["candidate-filtering", "side-or-edge-alcohol", "multiple-brand-like-phrases"],
    geometryProvenance: HUMAN_VISUAL_ADJUDICATION,
    orientationProvenance: "eval-manifest",
    adjudicationNotes:
      "The centered brand mark is readable; the alcohol statement sits in the bottom-right producer block.",
    fields: {
      brand: {
        geometry: { x: 0.18, y: 0.18, width: 0.63, height: 0.2 },
        annotationConfidence: "high",
        humanReadable: true,
        notes: "Covers the Luigi & Giovanni artwork only.",
      },
      alcohol: {
        geometry: { x: 0.68, y: 0.91, width: 0.24, height: 0.06 },
        annotationConfidence: "high",
        humanReadable: true,
        notes: "Bottom-right producer block including 14% ALC.",
      },
    },
  },
  {
    caseId: "approved-wine-013",
    inclusionReasons: ["brand ranking failure", "alcohol candidate-filtering failure"],
    challengeSlices: ["candidate-ranking", "candidate-filtering", "multiple-brand-like-phrases"],
    geometryProvenance: HUMAN_VISUAL_ADJUDICATION,
    orientationProvenance: "eval-manifest",
    adjudicationNotes:
      "The large AFFLICTED heading is the brand presentation; the bottom-right ABV line is isolated separately.",
    fields: {
      brand: {
        geometry: { x: 0.16, y: 0.08, width: 0.69, height: 0.12 },
        annotationConfidence: "high",
        humanReadable: true,
        notes: "Upper AFFLICTED wordmark only; excludes RESERVA and product prose.",
      },
      alcohol: {
        geometry: { x: 0.69, y: 0.79, width: 0.2, height: 0.05 },
        annotationConfidence: "high",
        humanReadable: true,
        notes: "Bottom-right 13.5% ABV line.",
      },
    },
  },
  {
    caseId: "approved-wine-035",
    inclusionReasons: ["brand OCR-recognition failure", "rotated alcohol OCR-recognition failure"],
    challengeSlices: ["ocr-recognition", "side-or-edge-alcohol", "rotated-text"],
    geometryProvenance: HUMAN_VISUAL_ADJUDICATION,
    orientationProvenance: "eval-manifest",
    adjudicationNotes:
      "The brand is the script heading; alcohol is the right-edge vertical mandatory strip.",
    fields: {
      brand: {
        geometry: { x: 0.12, y: 0.04, width: 0.62, height: 0.14 },
        annotationConfidence: "high",
        humanReadable: true,
        notes: "Top Hubert Lamy script and Saint-Aubin subtitle.",
      },
      alcohol: {
        geometry: { x: 0.79, y: 0.61, width: 0.17, height: 0.29 },
        annotationConfidence: "high",
        humanReadable: true,
        notes: "Right-side vertical strip segment containing 13.5% vol.",
      },
    },
  },
  {
    caseId: "la-fattoria-rotated",
    inclusionReasons: ["vertical mandatory strip", "orientation-specific alcohol failure"],
    challengeSlices: ["vertical-mandatory-strip", "side-or-edge-alcohol", "rotated-text"],
    geometryProvenance: HUMAN_VISUAL_ADJUDICATION,
    orientationProvenance: "eval-manifest",
    adjudicationNotes: "Brand is centered; alcohol is the left-edge vertical producer strip.",
    fields: {
      brand: {
        geometry: { x: 0.28, y: 0.28, width: 0.43, height: 0.17 },
        annotationConfidence: "high",
        humanReadable: true,
        notes: "La Fattoria artwork only.",
      },
      alcohol: {
        geometry: { x: 0.01, y: 0.73, width: 0.15, height: 0.23 },
        annotationConfidence: "high",
        humanReadable: true,
        notes: "Left vertical strip segment containing 14% ALC 750ml.",
      },
    },
  },
  {
    caseId: "approved-wine-054",
    inclusionReasons: [
      "brand candidate-filtering failure",
      "mixed-orientation alcohol OCR failure",
    ],
    challengeSlices: [
      "candidate-filtering",
      "ocr-recognition",
      "mixed-orientation",
      "side-or-edge-alcohol",
    ],
    geometryProvenance: HUMAN_VISUAL_ADJUDICATION,
    orientationProvenance: "eval-manifest",
    adjudicationNotes:
      "The brand is the small top-right name; alcohol is the rotated center-left side strip.",
    fields: {
      brand: {
        geometry: { x: 0.38, y: 0.02, width: 0.33, height: 0.08 },
        annotationConfidence: "medium",
        humanReadable: true,
        notes: "Top-right Henri Dufrères line and immediate subtitle.",
      },
      alcohol: {
        geometry: { x: 0.28, y: 0.3, width: 0.1, height: 0.31 },
        annotationConfidence: "medium",
        humanReadable: true,
        notes: "Center-left vertical strip containing 12.5% Alc. by Vol.",
      },
    },
  },
  {
    caseId: "patricia-green-cellars",
    inclusionReasons: ["genuinely ambiguous brand control", "alcohol candidate-filtering failure"],
    challengeSlices: ["genuinely-ambiguous", "candidate-filtering", "low-contrast"],
    geometryProvenance: HUMAN_VISUAL_ADJUDICATION,
    orientationProvenance: "eval-manifest",
    adjudicationNotes:
      "The brand-like evidence is clustered in the domain and producer lines, which remain genuinely ambiguous even when isolated.",
    fields: {
      brand: {
        geometry: { x: 0.18, y: 0.48, width: 0.6, height: 0.17 },
        annotationConfidence: "medium",
        humanReadable: true,
        notes:
          "Includes the domain line and produced-by line together to preserve the ambiguity honestly.",
      },
      alcohol: {
        geometry: { x: 0.52, y: 0.82, width: 0.25, height: 0.06 },
        annotationConfidence: "medium",
        humanReadable: true,
        notes: "Bottom line segment containing ALC. 13.8% BY VOL.",
      },
    },
  },
  {
    caseId: "wine-multi-artifact-04",
    inclusionReasons: ["multi-artifact failure", "brand OCR-recognition failure"],
    challengeSlices: ["multi-artifact", "ocr-recognition", "candidate-filtering"],
    geometryProvenance: HUMAN_VISUAL_ADJUDICATION,
    orientationProvenance: "eval-manifest",
    adjudicationNotes:
      "The target field lives on the upper artifact only; the lower artifact is unrelated context.",
    fields: {
      brand: {
        geometry: { x: 0.04, y: 0.01, width: 0.39, height: 0.2 },
        annotationConfidence: "high",
        humanReadable: true,
        notes: "Upper Dry Cellar wordmark only.",
      },
      alcohol: {
        geometry: { x: 0.1, y: 0.42, width: 0.24, height: 0.05 },
        annotationConfidence: "high",
        humanReadable: true,
        notes: "Bottom line of the upper artifact with Alc. 13.2% by Vol.",
      },
    },
  },
  {
    caseId: "approved-wine-095",
    inclusionReasons: [
      "low-resolution absent-brand control",
      "alcohol candidate-filtering failure",
    ],
    challengeSlices: ["low-resolution", "absent-brand", "candidate-filtering", "bottom-alcohol"],
    geometryProvenance: HUMAN_VISUAL_ADJUDICATION,
    orientationProvenance: "eval-manifest",
    adjudicationNotes: "No brand presentation is visible; only the alcohol line is benchmarked.",
    fields: {
      alcohol: {
        geometry: { x: 0.54, y: 0.44, width: 0.29, height: 0.09 },
        annotationConfidence: "medium",
        humanReadable: true,
        notes: "Includes the ALC. 12% BY VOL. segment on the low-resolution back label.",
      },
    },
  },
];
