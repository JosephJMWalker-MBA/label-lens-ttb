import { z } from "zod";

import { err, ok, type Result } from "@/shared/result";

import {
  DEFAULT_GRID_SPEC,
  DEFAULT_REFINEMENT_GRID_SPEC,
  gridCellId,
  gridCellRange,
  refinementCellId,
  refinementCellRange,
} from "./observer-grid";
import type {
  CanonicalRegionProposal,
  GridCell,
  GridCellRange,
  GridSpec,
  HaloPolicyRecord,
  LocalRefinementSelection,
  NormalizedBox,
  ObservationRunMetadata,
  ObserverDerivative,
  ObserverGridValidationError,
  ObserverRegionProposal,
  OcrInspectionHandoff,
  PaddingSpec,
  PixelBox,
  RefinementCell,
  RefinementCellRange,
  RefinementGridSpec,
  RegionGeometry,
  TransformRecord,
  VisionObserverInput,
  VisionObservationErrorRecord,
  VisionObserverResult,
} from "./observer-grid.types";
import {
  OBSERVER_APPARENT_ORIENTATIONS,
  OBSERVER_AUTHORITIES,
  OBSERVER_GRID_COLUMNS,
  OBSERVER_GRID_ROWS,
  OBSERVER_GRID_SCHEMA_VERSION,
  OBSERVER_HALO_POLICY_ID,
  OBSERVER_OBSERVATION_TYPES,
  OBSERVER_OVERLAY_ARTIFACT_KIND,
  OBSERVER_OVERLAY_MEDIA_TYPE,
  OBSERVER_PROPOSAL_SOURCES,
  OBSERVER_PURPOSES,
  OBSERVER_REASON_CODES,
  OBSERVER_REFINEMENT_COLUMNS,
  OBSERVER_REFINEMENT_ROWS,
  OBSERVER_ROTATIONS,
  OBSERVER_SOURCE_ARTIFACT_KIND,
  OBSERVER_VISIBILITIES,
} from "./observer-grid.types";

const nonEmpty = z.string().trim().min(1);
const absolutePath = nonEmpty.refine((value) => value.startsWith("/"), {
  message: "must be an absolute path",
});
const sha256 = z.string().regex(/^[a-f0-9]{64}$/i, "must be a 64-character SHA-256 hex digest");
const description = z
  .string()
  .trim()
  .min(1)
  .max(160, "description must be 160 characters or fewer");

const prohibitedDescriptionPatterns = [
  /\b(pass|fail|approved|rejected|compliant|noncompliant)\b/i,
  /\b(regulatory|legal advice|legal)\b/i,
  /\b(brand|alcohol|abv|warning)\b/i,
  /\b(probability|confidence|correctness)\b/i,
  /\b(previous image|same as before|compared to)\b/i,
  /\b(expected text|transcription|verbatim)\b/i,
  /%/,
];

function rejectProhibitedDescription(value: string, ctx: z.RefinementCtx) {
  for (const pattern of prohibitedDescriptionPatterns) {
    if (pattern.test(value)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "description includes prohibited authority, compliance, field, or transcription language",
      });
      return;
    }
  }
}

const gridColumn = z.enum(OBSERVER_GRID_COLUMNS);
const gridRow = z.union(
  OBSERVER_GRID_ROWS.map((row) => z.literal(row)) as [
    z.ZodLiteral<1>,
    z.ZodLiteral<2>,
    z.ZodLiteral<3>,
    z.ZodLiteral<4>,
    z.ZodLiteral<5>,
    z.ZodLiteral<6>,
    z.ZodLiteral<7>,
    z.ZodLiteral<8>,
    z.ZodLiteral<9>,
    z.ZodLiteral<10>,
  ],
);
const refinementColumn = z.enum(OBSERVER_REFINEMENT_COLUMNS);
const refinementRow = z.union(
  OBSERVER_REFINEMENT_ROWS.map((row) => z.literal(row)) as [
    z.ZodLiteral<1>,
    z.ZodLiteral<2>,
    z.ZodLiteral<3>,
    z.ZodLiteral<4>,
    z.ZodLiteral<5>,
  ],
);

export const normalizedBoxSchema = z
  .object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
    width: z.number().finite().positive().max(1),
    height: z.number().finite().positive().max(1),
  })
  .strict()
  .superRefine((box, ctx) => {
    if (box.x + box.width > 1 + Number.EPSILON) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["width"],
        message: "x + width exceeds 1",
      });
    }
    if (box.y + box.height > 1 + Number.EPSILON) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["height"],
        message: "y + height exceeds 1",
      });
    }
  });

export const pixelBoxSchema = z
  .object({
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    imageWidth: z.number().int().positive(),
    imageHeight: z.number().int().positive(),
  })
  .strict()
  .superRefine((box, ctx) => {
    if (box.x + box.width > box.imageWidth) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["width"],
        message: "x + width exceeds imageWidth",
      });
    }
    if (box.y + box.height > box.imageHeight) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["height"],
        message: "y + height exceeds imageHeight",
      });
    }
  });

export const regionGeometrySchema = z
  .object({
    normalizedBox: normalizedBoxSchema,
    pixelBox: pixelBoxSchema,
  })
  .strict();

export const paddingSpecSchema = z
  .object({
    unit: z.literal("normalized"),
    top: z.number().finite().nonnegative(),
    right: z.number().finite().nonnegative(),
    bottom: z.number().finite().nonnegative(),
    left: z.number().finite().nonnegative(),
    clampToImage: z.literal(true),
  })
  .strict();

export const haloPolicySchema = z
  .object({
    paddingPolicyId: z.literal(OBSERVER_HALO_POLICY_ID),
    paddingRatio: z.number().finite().positive(),
    requestedPadding: paddingSpecSchema,
    actualPadding: paddingSpecSchema,
  })
  .strict();

export const gridSpecSchema = z
  .object({
    schemaVersion: z.literal(OBSERVER_GRID_SCHEMA_VERSION),
    columns: z.literal(10),
    rows: z.literal(10),
    columnLabels: z.tuple(
      OBSERVER_GRID_COLUMNS.map((value) => z.literal(value)) as [
        z.ZodLiteral<"A">,
        z.ZodLiteral<"B">,
        z.ZodLiteral<"C">,
        z.ZodLiteral<"D">,
        z.ZodLiteral<"E">,
        z.ZodLiteral<"F">,
        z.ZodLiteral<"G">,
        z.ZodLiteral<"H">,
        z.ZodLiteral<"I">,
        z.ZodLiteral<"J">,
      ],
    ),
    rowLabels: z.tuple(
      OBSERVER_GRID_ROWS.map((value) => z.literal(value)) as [
        z.ZodLiteral<1>,
        z.ZodLiteral<2>,
        z.ZodLiteral<3>,
        z.ZodLiteral<4>,
        z.ZodLiteral<5>,
        z.ZodLiteral<6>,
        z.ZodLiteral<7>,
        z.ZodLiteral<8>,
        z.ZodLiteral<9>,
        z.ZodLiteral<10>,
      ],
    ),
    origin: z.literal("top-left"),
    cellRangeNotation: z.literal("inclusive"),
    sourceCrop: z.literal("none"),
    aspectRatioPolicy: z.literal("preserve-source"),
  })
  .strict();

export const refinementGridSpecSchema = z
  .object({
    schemaVersion: z.literal(OBSERVER_GRID_SCHEMA_VERSION),
    columns: z.literal(5),
    rows: z.literal(5),
    columnLabels: z.tuple(
      OBSERVER_REFINEMENT_COLUMNS.map((value) => z.literal(value)) as [
        z.ZodLiteral<"A">,
        z.ZodLiteral<"B">,
        z.ZodLiteral<"C">,
        z.ZodLiteral<"D">,
        z.ZodLiteral<"E">,
      ],
    ),
    rowLabels: z.tuple(
      OBSERVER_REFINEMENT_ROWS.map((value) => z.literal(value)) as [
        z.ZodLiteral<1>,
        z.ZodLiteral<2>,
        z.ZodLiteral<3>,
        z.ZodLiteral<4>,
        z.ZodLiteral<5>,
      ],
    ),
    origin: z.literal("top-left"),
    cellRangeNotation: z.literal("inclusive"),
    sourceCrop: z.literal("none"),
    parentFrame: z.literal("coarse-proposal"),
  })
  .strict();

export const gridCellSchema = z
  .object({
    column: gridColumn,
    row: gridRow,
    columnIndex: z.number().int().min(0).max(9),
    rowIndex: z.number().int().min(0).max(9),
    id: nonEmpty,
  })
  .strict()
  .superRefine((cell, ctx) => {
    if (cell.id !== gridCellId(cell.column, cell.row)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["id"], message: "grid cell id mismatch" });
    }
    if (cell.columnIndex !== DEFAULT_GRID_SPEC.columnLabels.indexOf(cell.column)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["columnIndex"],
        message: "grid cell columnIndex mismatch",
      });
    }
    if (cell.rowIndex !== DEFAULT_GRID_SPEC.rowLabels.indexOf(cell.row)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rowIndex"],
        message: "grid cell rowIndex mismatch",
      });
    }
  });

export const refinementCellSchema = z
  .object({
    column: refinementColumn,
    row: refinementRow,
    columnIndex: z.number().int().min(0).max(4),
    rowIndex: z.number().int().min(0).max(4),
    id: nonEmpty,
  })
  .strict()
  .superRefine((cell, ctx) => {
    if (cell.id !== refinementCellId(cell.column, cell.row)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["id"],
        message: "refinement cell id mismatch",
      });
    }
    if (cell.columnIndex !== DEFAULT_REFINEMENT_GRID_SPEC.columnLabels.indexOf(cell.column)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["columnIndex"],
        message: "refinement cell columnIndex mismatch",
      });
    }
    if (cell.rowIndex !== DEFAULT_REFINEMENT_GRID_SPEC.rowLabels.indexOf(cell.row)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rowIndex"],
        message: "refinement cell rowIndex mismatch",
      });
    }
  });

export const gridCellRangeSchema = z
  .object({
    start: gridCellSchema,
    end: gridCellSchema,
    notation: nonEmpty,
  })
  .strict()
  .superRefine((range, ctx) => {
    const normalized = gridCellRange(range.start as GridCell, range.end as GridCell);
    if (range.notation !== normalized.notation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["notation"],
        message: "grid range notation must be normalized and inclusive",
      });
    }
  });

export const refinementCellRangeSchema = z
  .object({
    start: refinementCellSchema,
    end: refinementCellSchema,
    notation: nonEmpty,
  })
  .strict()
  .superRefine((range, ctx) => {
    const normalized = refinementCellRange(
      range.start as RefinementCell,
      range.end as RefinementCell,
    );
    if (range.notation !== normalized.notation) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["notation"],
        message: "refinement range notation must be normalized and inclusive",
      });
    }
  });

export const localRefinementSelectionSchema = z
  .object({
    gridSpec: refinementGridSpecSchema,
    range: refinementCellRangeSchema,
  })
  .strict();

export const transformRecordSchema = z
  .object({
    schemaVersion: z.literal(OBSERVER_GRID_SCHEMA_VERSION),
    mapping: z.literal("observer-grid-to-original-image"),
    coarseGridRange: nonEmpty,
    refinementGridRange: z.union([nonEmpty, z.null()]),
    observationRotation: z.union(
      OBSERVER_ROTATIONS.map((value) => z.literal(value)) as [
        z.ZodLiteral<0>,
        z.ZodLiteral<90>,
        z.ZodLiteral<180>,
        z.ZodLiteral<270>,
      ],
    ),
    sourceImageWidth: z.number().int().positive(),
    sourceImageHeight: z.number().int().positive(),
    observationFrameWidth: z.number().int().positive(),
    observationFrameHeight: z.number().int().positive(),
    sourceCrop: z.literal("none"),
    overlayDeterministic: z.literal(true),
  })
  .strict();

export const observerDerivativeSchema = z
  .object({
    gridSpec: gridSpecSchema,
    rotation: z.literal(0),
    mediaType: z.literal(OBSERVER_OVERLAY_MEDIA_TYPE),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    sourceMediaType: nonEmpty,
    sourceSha256: sha256,
    overlaySha256: sha256,
    bytes: z.instanceof(Uint8Array),
    sourceArtifactPath: absolutePath,
    overlayArtifactPath: absolutePath,
    workspaceDir: absolutePath,
    transform: transformRecordSchema,
  })
  .strict();

const observerRegionProposalBaseSchema = z
  .object({
    observationId: nonEmpty,
    proposalId: nonEmpty,
    observationType: z.enum(OBSERVER_OBSERVATION_TYPES),
    source: z.enum(OBSERVER_PROPOSAL_SOURCES),
    authority: z.enum(OBSERVER_AUTHORITIES),
    purpose: z.enum(OBSERVER_PURPOSES),
    gridRange: gridCellRangeSchema,
    localRefinement: z.union([localRefinementSelectionSchema, z.null()]),
    observationRotation: z.union(
      OBSERVER_ROTATIONS.map((value) => z.literal(value)) as [
        z.ZodLiteral<0>,
        z.ZodLiteral<90>,
        z.ZodLiteral<180>,
        z.ZodLiteral<270>,
      ],
    ),
    apparentOrientation: z.enum(OBSERVER_APPARENT_ORIENTATIONS),
    visibility: z.enum(OBSERVER_VISIBILITIES),
    reasonCodes: z
      .array(z.enum(OBSERVER_REASON_CODES))
      .min(1)
      .max(4)
      .refine((codes) => new Set(codes).size === codes.length, {
        message: "reason codes must be unique",
      }),
    description,
  })
  .strict();

export const observerRegionProposalSchema = observerRegionProposalBaseSchema.superRefine(
  (proposal, ctx) => {
    rejectProhibitedDescription(proposal.description, ctx);
  },
);

export const ocrInspectionHandoffSchema = z
  .object({
    sourceArtifactKind: z.literal(OBSERVER_SOURCE_ARTIFACT_KIND),
    sourceArtifactRef: absolutePath,
    sourceImageSha256: sha256,
    originalPixelRegion: pixelBoxSchema,
    overlayArtifactKindRejected: z.literal(OBSERVER_OVERLAY_ARTIFACT_KIND),
    overlayArtifactPathRejected: absolutePath,
    overlaySha256Rejected: sha256,
  })
  .strict();

export const canonicalRegionProposalSchema = observerRegionProposalBaseSchema
  .extend({
    proposedRegion: regionGeometrySchema,
    ocrInspectionRegion: regionGeometrySchema,
    haloPolicy: haloPolicySchema,
    transform: transformRecordSchema,
    ocrHandoff: ocrInspectionHandoffSchema,
  })
  .strict()
  .superRefine((proposal, ctx) => {
    rejectProhibitedDescription(proposal.description, ctx);
  });

export const observationRunMetadataSchema = z
  .object({
    observationRunId: nonEmpty,
    adapterId: nonEmpty,
    adapterVersion: nonEmpty,
    promptId: nonEmpty,
    promptVersion: nonEmpty,
    sourceImageSha256: sha256,
    overlaySha256: z.union([sha256, z.null()]),
    startedAt: nonEmpty,
    completedAt: nonEmpty,
    cleanupCompleted: z.boolean(),
  })
  .strict();

export const visionObserverInputSchema = z
  .object({
    observationRunId: nonEmpty,
    scenarioId: nonEmpty,
    sourceArtifactRef: nonEmpty,
    workspaceDir: absolutePath,
    overlayArtifactPath: absolutePath,
    overlayMediaType: z.literal(OBSERVER_OVERLAY_MEDIA_TYPE),
    overlaySha256: sha256,
    overlayWidth: z.number().int().positive(),
    overlayHeight: z.number().int().positive(),
    sourceImageSha256: sha256,
  })
  .strict();

export const visionObserverResultSchema = z
  .object({
    observationRunId: nonEmpty,
    proposals: z.array(z.unknown()),
  })
  .strict();

export const visionObservationErrorRecordSchema = z
  .object({
    immutable: z.literal(true),
    code: z.enum([
      "DERIVATIVE_DECODE_FAILED",
      "DERIVATIVE_DIMENSION_MISMATCH",
      "DERIVATIVE_RENDER_FAILED",
      "OBSERVER_TIMEOUT",
      "OBSERVER_EXCEPTION",
      "INVALID_OBSERVER_OUTPUT",
      "INVALID_PROPOSAL_GEOMETRY",
      "INVALID_OCR_HANDOFF",
    ]),
    stage: z.enum(["derivative", "observe", "proposal-validate", "geometry", "ocr-handoff"]),
    message: nonEmpty,
    issues: z.array(nonEmpty),
  })
  .strict();

function issues(error: z.ZodError) {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    return `${path}${issue.message}`;
  });
}

function fail(message: string, error: z.ZodError): Result<never, ObserverGridValidationError> {
  return err({ code: "INVALID_SHAPE", message, issues: issues(error) });
}

export function validateGridSpec(
  candidate: unknown,
): Result<GridSpec, ObserverGridValidationError> {
  const parsed = gridSpecSchema.safeParse(candidate);
  return parsed.success
    ? ok(parsed.data as GridSpec)
    : fail("Grid spec failed schema validation.", parsed.error);
}

export function validateRefinementGridSpec(
  candidate: unknown,
): Result<RefinementGridSpec, ObserverGridValidationError> {
  const parsed = refinementGridSpecSchema.safeParse(candidate);
  return parsed.success
    ? ok(parsed.data as RefinementGridSpec)
    : fail("Refinement grid spec failed schema validation.", parsed.error);
}

export function validateGridCellRange(
  candidate: unknown,
): Result<GridCellRange, ObserverGridValidationError> {
  const parsed = gridCellRangeSchema.safeParse(candidate);
  return parsed.success
    ? ok(parsed.data as GridCellRange)
    : fail("Grid cell range failed schema validation.", parsed.error);
}

export function validateRefinementCellRange(
  candidate: unknown,
): Result<RefinementCellRange, ObserverGridValidationError> {
  const parsed = refinementCellRangeSchema.safeParse(candidate);
  return parsed.success
    ? ok(parsed.data as RefinementCellRange)
    : fail("Refinement cell range failed schema validation.", parsed.error);
}

export function validateLocalRefinementSelection(
  candidate: unknown,
): Result<LocalRefinementSelection, ObserverGridValidationError> {
  const parsed = localRefinementSelectionSchema.safeParse(candidate);
  return parsed.success
    ? ok(parsed.data as LocalRefinementSelection)
    : fail("Local refinement selection failed schema validation.", parsed.error);
}

export function validateNormalizedBox(
  candidate: unknown,
): Result<NormalizedBox, ObserverGridValidationError> {
  const parsed = normalizedBoxSchema.safeParse(candidate);
  return parsed.success
    ? ok(parsed.data as NormalizedBox)
    : fail("Normalized box failed schema validation.", parsed.error);
}

export function validatePixelBox(
  candidate: unknown,
): Result<PixelBox, ObserverGridValidationError> {
  const parsed = pixelBoxSchema.safeParse(candidate);
  return parsed.success
    ? ok(parsed.data as PixelBox)
    : fail("Pixel box failed schema validation.", parsed.error);
}

export function validateRegionGeometry(
  candidate: unknown,
): Result<RegionGeometry, ObserverGridValidationError> {
  const parsed = regionGeometrySchema.safeParse(candidate);
  return parsed.success
    ? ok(parsed.data as RegionGeometry)
    : fail("Region geometry failed schema validation.", parsed.error);
}

export function validatePaddingSpec(
  candidate: unknown,
): Result<PaddingSpec, ObserverGridValidationError> {
  const parsed = paddingSpecSchema.safeParse(candidate);
  return parsed.success
    ? ok(parsed.data as PaddingSpec)
    : fail("Padding spec failed schema validation.", parsed.error);
}

export function validateHaloPolicy(
  candidate: unknown,
): Result<HaloPolicyRecord, ObserverGridValidationError> {
  const parsed = haloPolicySchema.safeParse(candidate);
  return parsed.success
    ? ok(parsed.data as HaloPolicyRecord)
    : fail("Halo policy failed schema validation.", parsed.error);
}

export function validateTransformRecord(
  candidate: unknown,
): Result<TransformRecord, ObserverGridValidationError> {
  const parsed = transformRecordSchema.safeParse(candidate);
  return parsed.success
    ? ok(parsed.data as TransformRecord)
    : fail("Transform record failed schema validation.", parsed.error);
}

export function validateObserverDerivative(
  candidate: unknown,
): Result<ObserverDerivative, ObserverGridValidationError> {
  const parsed = observerDerivativeSchema.safeParse(candidate);
  return parsed.success
    ? ok(parsed.data as ObserverDerivative)
    : fail("Observer derivative failed schema validation.", parsed.error);
}

export function validateObserverRegionProposal(
  candidate: unknown,
): Result<ObserverRegionProposal, ObserverGridValidationError> {
  const parsed = observerRegionProposalSchema.safeParse(candidate);
  return parsed.success
    ? ok(parsed.data as ObserverRegionProposal)
    : fail("Observer region proposal failed schema validation.", parsed.error);
}

export function validateOcrInspectionHandoff(
  candidate: unknown,
): Result<OcrInspectionHandoff, ObserverGridValidationError> {
  const parsed = ocrInspectionHandoffSchema.safeParse(candidate);
  return parsed.success
    ? ok(parsed.data as OcrInspectionHandoff)
    : fail("OCR inspection handoff failed schema validation.", parsed.error);
}

export function validateCanonicalRegionProposal(
  candidate: unknown,
): Result<CanonicalRegionProposal, ObserverGridValidationError> {
  const parsed = canonicalRegionProposalSchema.safeParse(candidate);
  return parsed.success
    ? ok(parsed.data as CanonicalRegionProposal)
    : fail("Canonical region proposal failed schema validation.", parsed.error);
}

export function validateObservationRunMetadata(
  candidate: unknown,
): Result<ObservationRunMetadata, ObserverGridValidationError> {
  const parsed = observationRunMetadataSchema.safeParse(candidate);
  return parsed.success
    ? ok(parsed.data as ObservationRunMetadata)
    : fail("Observation run metadata failed schema validation.", parsed.error);
}

export function validateVisionObservationErrorRecord(
  candidate: unknown,
): Result<VisionObservationErrorRecord, ObserverGridValidationError> {
  const parsed = visionObservationErrorRecordSchema.safeParse(candidate);
  return parsed.success
    ? ok(parsed.data as VisionObservationErrorRecord)
    : fail("Vision observation error record failed schema validation.", parsed.error);
}

export function validateVisionObserverInput(
  candidate: unknown,
): Result<VisionObserverInput, ObserverGridValidationError> {
  const parsed = visionObserverInputSchema.safeParse(candidate);
  return parsed.success
    ? ok(parsed.data as VisionObserverInput)
    : fail("Vision observer input failed schema validation.", parsed.error);
}

export function validateVisionObserverResult(
  candidate: unknown,
): Result<VisionObserverResult, ObserverGridValidationError> {
  const parsed = visionObserverResultSchema.safeParse(candidate);
  return parsed.success
    ? ok(parsed.data as VisionObserverResult)
    : fail("Vision observer result failed schema validation.", parsed.error);
}
