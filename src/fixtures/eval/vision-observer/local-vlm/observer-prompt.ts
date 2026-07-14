import { createHash } from "node:crypto";

export const LOCAL_VLM_PROMPT_ID = "slice2-strict-local-vlm-observer" as const;
export const LOCAL_VLM_PROMPT_VERSION = "1.2.0" as const;
export const LOCAL_VLM_REFINEMENT_PROMPT_ID = "slice3-vision-region-refinement" as const;
export const LOCAL_VLM_REFINEMENT_PROMPT_VERSION = "1.0.0" as const;

export const LOCAL_VLM_PROMPT_FRAMING_LINES = [
  "You are inspecting the first and only image in this context.",
  "Inspect only the visible artwork in the image you receive.",
  "Use the overlaid 10x10 grid to identify text-like regions.",
  "Do not transcribe visible words or quote any text from the image.",
  "Do not identify brand, alcohol, warning, or regulatory fields.",
  "Do not decide whether the artwork complies with any rule.",
  "Do not mention laws, regulators, approval, rejection, pass, or fail.",
  "Do not compare with another image or refer to previous outputs.",
  "Do not infer seller intent or human judgment.",
] as const;

export const LOCAL_VLM_PROMPT_JSON_AND_ENUM_GUIDANCE_LINES = [
  "Return only one JSON object and no prose outside JSON.",
  "Use only these enum values:",
  'observationType: "text-like-region"',
  'source: "machine-observer"',
  'authority: "non-authoritative"',
  'purpose: "ocr-region-proposal"',
  'apparentOrientation: "horizontal" | "vertical-clockwise" | "vertical-counterclockwise" | "rotated-180" | "uncertain"',
  'visibility: "full" | "partial" | "obscured"',
  'reasonCodes: "small_text" | "edge_proximity" | "rotation" | "dense_text" | "multi_line" | "partial_visibility" | "high_salience" | "low_contrast" | "multi_artifact"',
  "Each proposal description must stay generic, field-agnostic, and must not quote image text.",
] as const;

const COARSE_PROMPT_SHAPE_LINES = [
  "Return at most 12 proposals.",
  "Return this exact JSON shape:",
  "{",
  '  "observationRunId": "<provided-observation-run-id>",',
  '  "proposals": [',
  "    {",
  '      "observationId": "string",',
  '      "proposalId": "string",',
  '      "observationType": "text-like-region",',
  '      "source": "machine-observer",',
  '      "authority": "non-authoritative",',
  '      "purpose": "ocr-region-proposal",',
  '      "gridRange": {',
  '        "start": { "column": "A", "row": 1, "columnIndex": 0, "rowIndex": 0, "id": "A1" },',
  '        "end": { "column": "A", "row": 1, "columnIndex": 0, "rowIndex": 0, "id": "A1" },',
  '        "notation": "A1"',
  "      },",
  '      "localRefinement": null,',
  '      "observationRotation": 0,',
  '      "apparentOrientation": "horizontal",',
  '      "visibility": "full",',
  '      "reasonCodes": ["high_salience"],',
  '      "description": "generic text-like region description"',
  "    }",
  "  ]",
  "}",
] as const;

const COARSE_PROMPT_LINES = [
  ...LOCAL_VLM_PROMPT_FRAMING_LINES,
  ...LOCAL_VLM_PROMPT_JSON_AND_ENUM_GUIDANCE_LINES,
  ...COARSE_PROMPT_SHAPE_LINES,
] as const;

const REFINEMENT_PROMPT_LINES = [
  "You are inspecting the first and only image in this context.",
  "Inspect only the visible artwork inside the cropped image you receive.",
  "The crop is already bounded around one coarse text-like proposal.",
  "Use the overlaid 5x5 refinement grid labeled A1:E5 to tighten that proposal if a smaller text-like region is visible.",
  "Do not transcribe visible words or quote any text from the image.",
  "Do not identify brand, alcohol, warning, or regulatory fields.",
  "Do not decide whether the artwork complies with any rule.",
  "Do not mention laws, regulators, approval, rejection, pass, or fail.",
  "Do not compare with another image or refer to previous outputs.",
  "Do not restate the coarse proposal or include prior response content.",
  "Return only one JSON object and no prose outside JSON.",
  "Use only these enum values:",
  'observationType: "text-like-region"',
  'source: "machine-observer"',
  'authority: "non-authoritative"',
  'purpose: "ocr-region-proposal"',
  'apparentOrientation: "horizontal" | "vertical-clockwise" | "vertical-counterclockwise" | "rotated-180" | "uncertain"',
  'visibility: "full" | "partial" | "obscured"',
  'reasonCodes: "small_text" | "edge_proximity" | "rotation" | "dense_text" | "multi_line" | "partial_visibility" | "high_salience" | "low_contrast" | "multi_artifact"',
  "Return at most one refinement proposal.",
  "If no tighter proposal is visible, return an empty proposals array.",
  "Return this exact JSON shape:",
  "{",
  '  "observationRunId": "<provided-observation-run-id>",',
  '  "proposals": [',
  "    {",
  '      "observationId": "string",',
  '      "proposalId": "string",',
  '      "observationType": "text-like-region",',
  '      "source": "machine-observer",',
  '      "authority": "non-authoritative",',
  '      "purpose": "ocr-region-proposal",',
  '      "gridRange": {',
  '        "start": { "column": "A", "row": 1, "columnIndex": 0, "rowIndex": 0, "id": "A1" },',
  '        "end": { "column": "A", "row": 1, "columnIndex": 0, "rowIndex": 0, "id": "A1" },',
  '        "notation": "A1"',
  "      },",
  '      "observationRotation": 0,',
  '      "apparentOrientation": "horizontal",',
  '      "visibility": "full",',
  '      "reasonCodes": ["high_salience"],',
  '      "description": "generic text-like region description"',
  "    }",
  "  ]",
  "}",
] as const;

export const LOCAL_VLM_PROMPT_TEXT = COARSE_PROMPT_LINES.join("\n");
export const LOCAL_VLM_PROMPT_SHA256 = createHash("sha256")
  .update(LOCAL_VLM_PROMPT_TEXT)
  .digest("hex");

export const LOCAL_VLM_REFINEMENT_PROMPT_TEXT = REFINEMENT_PROMPT_LINES.join("\n");
export const LOCAL_VLM_REFINEMENT_PROMPT_SHA256 = createHash("sha256")
  .update(LOCAL_VLM_REFINEMENT_PROMPT_TEXT)
  .digest("hex");

export function buildObservationInstruction(observationRunId: string): string {
  return [
    `observationRunId: ${observationRunId}`,
    "Return the same observationRunId in the JSON object.",
  ].join("\n");
}

export function buildRefinementObservationInstruction(observationRunId: string): string {
  return [
    `observationRunId: ${observationRunId}`,
    "Return the same observationRunId in the JSON object.",
    "Inspect only the provided crop and return at most one tighter proposal.",
  ].join("\n");
}
