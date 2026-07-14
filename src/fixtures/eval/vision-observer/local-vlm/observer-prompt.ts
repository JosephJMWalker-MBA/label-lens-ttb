import { createHash } from "node:crypto";

export const LOCAL_VLM_PROMPT_ID = "slice2-strict-local-vlm-observer" as const;
export const LOCAL_VLM_PROMPT_VERSION = "1.0.0" as const;

const PROMPT_LINES = [
  "You are inspecting the first and only image in this context.",
  "Inspect only the visible artwork in the image you receive.",
  "Use the overlaid grid to identify text-like regions.",
  "Do not transcribe visible words or quote any text from the image.",
  "Do not identify brand, alcohol, warning, or regulatory fields.",
  "Do not decide whether the artwork complies with any rule.",
  "Do not mention laws, regulators, approval, rejection, pass, or fail.",
  "Do not compare with another image or refer to previous outputs.",
  "Do not infer seller intent or human judgment.",
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

export const LOCAL_VLM_PROMPT_TEXT = PROMPT_LINES.join("\n");
export const LOCAL_VLM_PROMPT_SHA256 = createHash("sha256")
  .update(LOCAL_VLM_PROMPT_TEXT)
  .digest("hex");

export function buildObservationInstruction(observationRunId: string): string {
  return [
    `observationRunId: ${observationRunId}`,
    "Return the same observationRunId in the JSON object.",
  ].join("\n");
}
