import { z } from "zod";

import { DECLARED_FACT_SOURCE_TYPES } from "@/domain/run/declared-facts.types";
import { err, ok, type Result } from "@/shared/result";

import type { PrecheckError } from "./precheck.types";

const SHA256 = /^[0-9a-f]{64}$/;

const declaredFactSchema = z
  .object({
    value: z.string().min(1),
    provenance: z
      .object({
        sourceType: z.enum(DECLARED_FACT_SOURCE_TYPES),
        sourceReference: z.string().min(1),
        recordedBy: z.string().min(1),
        recordedAt: z.string().min(1),
        note: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

/**
 * The intake wrapper schema. `.strict()` at every level rejects mutable UI
 * state, an overall status, a compliance percentage, an embedded human
 * disposition, undeclared extra facts, and any other out-of-scope top-level
 * field. The nested `run` and `analyzer` payloads are validated by their own
 * committed validators, so they are accepted opaquely here.
 */
export const precheckRequestSchema = z
  .object({
    run: z.unknown(),
    sanitizedDerivativeSha256: z.string().regex(SHA256, "must be a 64-character hex SHA-256"),
    declaredFacts: z
      .object({
        applicationBrandName: declaredFactSchema,
        applicationAlcoholValue: declaredFactSchema,
      })
      .strict(),
    analyzer: z.unknown(),
    coverage: z
      .object({
        brandNameProcessed: z.boolean(),
        alcoholStatementProcessed: z.boolean(),
      })
      .strict(),
    quality: z
      .object({
        imageQualityWarnings: z.array(z.string().min(1)).optional(),
        note: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export function validatePrecheckRequestShape(candidate: unknown): Result<void, PrecheckError> {
  const parsed = precheckRequestSchema.safeParse(candidate);
  if (parsed.success) {
    return ok(undefined);
  }
  return err({
    code: "INVALID_INTAKE",
    message: "Pre-check intake failed validation.",
    issues: parsed.error.issues.map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "$";
      return `${path}: ${issue.message}`;
    }),
  });
}
