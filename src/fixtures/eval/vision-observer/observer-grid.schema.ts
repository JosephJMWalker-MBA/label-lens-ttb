import { z } from "zod";

import { err, ok, type Result } from "@/shared/result";

import { DEFAULT_GRID_SPEC, gridCellId, gridCellRange } from "./observer-grid";
import type {
  CanonicalRegionProposal,
  GridCell,
  GridCellRange,
  GridSpec,
  NormalizedBox,
  ObserverDerivative,
  ObserverGridValidationError,
  ObserverRegionProposal,
  PaddingSpec,
  PixelBox,
  TransformRecord,
} from "./observer-grid.types";
import {
  OBSERVER_DERIVATIVE_MEDIA_TYPE,
  OBSERVER_FIELDS,
  OBSERVER_GRID_COLUMNS,
  OBSERVER_GRID_ROWS,
  OBSERVER_GRID_SCHEMA_VERSION,
} from "./observer-grid.types";

const nonEmpty = z.string().trim().min(1);
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
const observerField = z.enum(OBSERVER_FIELDS);

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

export const gridSpecSchema = z
  .object({
    schemaVersion: z.literal(OBSERVER_GRID_SCHEMA_VERSION),
    columns: z.literal(10),
    rows: z.literal(10),
    columnLabels: z.tuple(
      OBSERVER_GRID_COLUMNS.map((label) => z.literal(label)) as [
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
    ),
    origin: z.literal("top-left"),
    cellRangeNotation: z.literal("inclusive"),
    sourceCrop: z.literal("none"),
    aspectRatioPolicy: z.literal("preserve-source"),
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
    const expected = gridCellId(cell.column, cell.row);
    if (cell.id !== expected) {
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
    if (range.start.columnIndex !== normalized.start.columnIndex) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["start", "columnIndex"],
        message: "grid range start must be normalized to the upper-left cell",
      });
    }
    if (range.start.rowIndex !== normalized.start.rowIndex) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["start", "rowIndex"],
        message: "grid range start must be normalized to the upper-left cell",
      });
    }
    if (range.end.columnIndex !== normalized.end.columnIndex) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end", "columnIndex"],
        message: "grid range end must be normalized to the lower-right cell",
      });
    }
    if (range.end.rowIndex !== normalized.end.rowIndex) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end", "rowIndex"],
        message: "grid range end must be normalized to the lower-right cell",
      });
    }
  });

export const paddingSpecSchema = z
  .object({
    xCells: z.number().finite().min(0),
    yCells: z.number().finite().min(0),
    clampToImage: z.boolean(),
  })
  .strict();

export const transformRecordSchema = z
  .object({
    schemaVersion: z.literal(OBSERVER_GRID_SCHEMA_VERSION),
    mapping: z.literal("grid-cells-to-original-image"),
    sourceImageWidth: z.number().int().positive(),
    sourceImageHeight: z.number().int().positive(),
    derivativeImageWidth: z.number().int().positive(),
    derivativeImageHeight: z.number().int().positive(),
    sourceCrop: z.literal("none"),
    overlayDeterministic: z.literal(true),
    sourceAspectRatio: z.number().finite().positive(),
    derivativeAspectRatio: z.number().finite().positive(),
    padding: paddingSpecSchema,
  })
  .strict();

export const observerDerivativeSchema = z
  .object({
    gridSpec: gridSpecSchema,
    mediaType: z.literal(OBSERVER_DERIVATIVE_MEDIA_TYPE),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    sourceMediaType: nonEmpty,
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/i, "sourceSha256 must be a 64-char hex digest"),
    svg: nonEmpty,
    transform: transformRecordSchema,
  })
  .strict();

export const observerRegionProposalSchema = z
  .object({
    observerId: nonEmpty,
    proposalId: nonEmpty,
    field: observerField,
    gridRange: gridCellRangeSchema,
    rationale: nonEmpty,
  })
  .strict();

export const canonicalRegionProposalSchema = observerRegionProposalSchema
  .extend({
    normalizedBox: normalizedBoxSchema,
    pixelBox: pixelBoxSchema,
    transform: transformRecordSchema,
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
    ? ok(parsed.data)
    : fail("Grid spec failed schema validation.", parsed.error);
}

export function validateGridCellRange(
  candidate: unknown,
): Result<GridCellRange, ObserverGridValidationError> {
  const parsed = gridCellRangeSchema.safeParse(candidate);
  return parsed.success
    ? ok(parsed.data as GridCellRange)
    : fail("Grid cell range failed schema validation.", parsed.error);
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

export function validatePaddingSpec(
  candidate: unknown,
): Result<PaddingSpec, ObserverGridValidationError> {
  const parsed = paddingSpecSchema.safeParse(candidate);
  return parsed.success
    ? ok(parsed.data as PaddingSpec)
    : fail("Padding spec failed schema validation.", parsed.error);
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

export function validateCanonicalRegionProposal(
  candidate: unknown,
): Result<CanonicalRegionProposal, ObserverGridValidationError> {
  const parsed = canonicalRegionProposalSchema.safeParse(candidate);
  return parsed.success
    ? ok(parsed.data as CanonicalRegionProposal)
    : fail("Canonical region proposal failed schema validation.", parsed.error);
}
