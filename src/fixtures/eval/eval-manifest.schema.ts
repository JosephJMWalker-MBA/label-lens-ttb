import { z } from "zod";

import { err, ok, type Result } from "@/shared/result";

import {
  EVAL_FIELD_LOCATIONS,
  EVAL_MANIFEST_SCHEMA_VERSION,
  EVAL_STRATA,
  type EvalManifest,
  type EvalManifestError,
} from "./eval-manifest.types";

/**
 * Strict validator for the evaluation manifest. Malformed annotations are
 * rejected outright — an evaluation set with a silently-broken case would
 * produce a dishonest baseline.
 */

const location = z.enum(EVAL_FIELD_LOCATIONS);

const brandTruth = z
  .object({
    acceptable: z.array(z.string().min(1)).min(1),
    knownAmbiguous: z.boolean(),
    approxLocation: location.optional(),
    forbidden: z.array(z.string().min(1)).optional(),
  })
  .strict();

const alcoholTruth = z
  .object({
    present: z.boolean(),
    acceptablePercents: z.array(z.number().positive().max(100)),
    acceptableText: z.array(z.string().min(1)),
    approxLocation: location.optional(),
    detectionChallenge: z.string().min(1).optional(),
  })
  .strict()
  // Presence and the acceptable answers must agree: a present statement needs at
  // least one acceptable percent; an absent one must carry none.
  .refine(
    (a) => (a.present ? a.acceptablePercents.length > 0 : a.acceptablePercents.length === 0),
    {
      message: "present alcohol requires acceptablePercents; absent alcohol must have none",
    },
  );

const annotation = z
  .object({
    annotatedBy: z.string().min(1),
    annotatedOn: z.string().min(1),
    method: z.string().min(1),
    notes: z.string().min(1).optional(),
  })
  .strict();

const evalCase = z
  .object({
    caseId: z.string().min(1),
    fixtureDir: z.string().min(1),
    imageFilename: z.string().min(1),
    expectedSha256: z.string().regex(/^[0-9a-f]{64}$/, "sha256 must be 64 lowercase hex chars"),
    source: z.string().min(1),
    usageStatus: z.string().min(1),
    strata: z.array(z.enum(EVAL_STRATA)).min(1),
    brand: brandTruth,
    alcohol: alcoholTruth,
    annotation,
  })
  .strict();

const manifestSchema = z
  .object({
    schemaVersion: z.literal(EVAL_MANIFEST_SCHEMA_VERSION),
    description: z.string().min(1),
    cases: z
      .array(evalCase)
      .min(1)
      // Case ids must be unique so results join unambiguously to truth.
      .refine((cases) => new Set(cases.map((c) => c.caseId)).size === cases.length, {
        message: "case ids must be unique",
      }),
  })
  .strict();

export function validateEvalManifest(input: unknown): Result<EvalManifest, EvalManifestError> {
  const parsed = manifestSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: "INVALID_SHAPE",
      message: "Evaluation manifest failed validation.",
      issues: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
    });
  }
  return ok(parsed.data as EvalManifest);
}
