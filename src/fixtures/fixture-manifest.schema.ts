import { z } from "zod";

import { err, ok, type Result } from "@/shared/result";

import {
  FIXTURE_MANIFEST_SCHEMA_VERSION,
  type FixtureManifest,
  type FixtureManifestError,
} from "./fixture-manifest.types";

const SHA256 = /^[0-9a-f]{64}$/;

const sourceSchema = z
  .object({
    kind: z.literal("public-cola-certificate"),
    reference: z.string().min(1),
    sourceBytesRetained: z.boolean(),
    sourceSha256: z.string().regex(SHA256).nullable(),
    note: z.string().min(1),
    retrievedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

const derivativeSchema = z
  .object({
    kind: z.literal("sanitized-label-crop"),
    path: z.string().min(1),
    mediaType: z.literal("image/png"),
    sha256: z.string().regex(SHA256),
    pixelWidth: z.number().int().positive(),
    pixelHeight: z.number().int().positive(),
    byteSize: z.number().int().positive(),
  })
  .strict();

const transformationStepSchema = z
  .object({
    order: z.number().int().positive(),
    operation: z.string().min(1),
    performedIn: z.enum(["outside-repository", "in-repository"]),
    performedBy: z.enum(["human", "tool"]),
    description: z.string().min(1),
    toolVersion: z.string().min(1).optional(),
    excludedRegions: z.array(z.string().min(1)).optional(),
    verification: z.string().min(1),
  })
  .strict();

// `.strict()` is the privacy guarantee: no matched value, contact text,
// signature, crop, or OCR field may ride along on an exclusion record.
const privacyExclusionSchema = z
  .object({
    category: z.string().min(1),
    check: z.string().min(1),
    result: z.enum(["excluded", "not-present"]),
    toolOrRuleVersion: z.string().min(1),
  })
  .strict();

const truthLabelsSchema = z
  .object({
    brand: z.string().min(1),
    varietal: z.string().min(1),
    appellation: z.string().min(1),
    vintage: z.string().min(1),
    alcoholStatement: z.string().min(1),
    netContents: z.string().min(1),
    governmentWarning: z.enum(["present", "absent"]),
  })
  .strict();

const provenanceNoteSchema = z
  .object({
    topic: z.string().min(1),
    resolution: z.string().min(1),
    earlierHumanTranscription: z.string().min(1).optional(),
    artifactVerifiedTruth: z.string().min(1).optional(),
  })
  .strict();

export const fixtureManifestSchema = z
  .object({
    fixtureId: z.string().min(1),
    schemaVersion: z.literal(FIXTURE_MANIFEST_SCHEMA_VERSION),
    ttbId: z.string().min(1),
    beverageCategory: z.literal("wine"),
    source: sourceSchema,
    derivative: derivativeSchema,
    transformationChain: z.array(transformationStepSchema).min(1),
    privacyExclusions: z.array(privacyExclusionSchema).min(1),
    truthLabels: truthLabelsSchema,
    provenanceNotes: z.array(provenanceNoteSchema).default([]),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    // Honesty rule: a source-byte hash may not be claimed without retained bytes.
    if (!manifest.source.sourceBytesRetained && manifest.source.sourceSha256 !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["source", "sourceSha256"],
        message: "sourceSha256 must be null unless the original certificate bytes are retained.",
      });
    }

    // Transformation chain must be contiguous 1..n so no step is silently dropped.
    manifest.transformationChain.forEach((step, index) => {
      if (step.order !== index + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transformationChain", index, "order"],
          message: `Transformation steps must be ordered contiguously from 1; expected ${index + 1}.`,
        });
      }
    });
  });

type SchemaOutput = z.infer<typeof fixtureManifestSchema>;
const _typeCheck: SchemaOutput extends FixtureManifest ? true : never = true;
void _typeCheck;

export function validateFixtureManifest(
  candidate: unknown,
): Result<FixtureManifest, FixtureManifestError> {
  const parsed = fixtureManifestSchema.safeParse(candidate);
  if (parsed.success) {
    return ok(parsed.data);
  }

  const custom = parsed.error.issues.some((issue) => issue.code === "custom");
  return err({
    code: custom ? "INVALID_PROVENANCE" : "INVALID_SHAPE",
    message: "Fixture manifest failed validation.",
    issues: parsed.error.issues.map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "$";
      return `${path}: ${issue.message}`;
    }),
  });
}
