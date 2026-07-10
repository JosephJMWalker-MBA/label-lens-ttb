import { z } from "zod";

import { DECLARED_FACT_SOURCE_TYPES } from "./declared-facts.types";

const SHA256 = /^[0-9a-f]{64}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const GIT_SHA = /^[0-9a-f]{7,40}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const sha256 = z.string().regex(SHA256, "must be a 64-character hex SHA-256");
const version = z.string().regex(SEMVER, "must be a semantic version x.y.z");
// eCFR snapshot dates: strict ISO calendar date.
const isoDate = z
  .string()
  .regex(ISO_DATE)
  .refine((v) => !Number.isNaN(Date.parse(v)), {
    message: "must be a valid ISO YYYY-MM-DD date",
  });

const authorityVersionSchema = z
  .object({
    citation: z.string().min(1),
    snapshotDate: isoDate,
    effectiveDate: isoDate.optional(),
  })
  .strict();

const ocrEngineSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("ocr"),
      engineId: z.string().min(1),
      engineVersion: z.string().min(1),
      modelId: z.string().min(1).optional(),
      modelVersion: z.string().min(1).optional(),
    })
    .strict(),
  z.object({ kind: z.literal("not_applicable") }).strict(),
]);

const versionManifestSchema = z
  .object({
    sourceArtifactSha256: sha256.nullable(),
    sanitizedDerivativeSha256: sha256,
    extractionAdapterId: z.string().min(1),
    extractionAdapterVersion: version,
    ocrEngine: ocrEngineSchema,
    parserId: z.string().min(1),
    parserVersion: version,
    ruleProfileId: z.string().min(1),
    ruleProfileVersion: version,
    rules: z.array(z.object({ ruleId: z.string().min(1), version }).strict()).min(1),
    authorities: z.array(authorityVersionSchema).min(1),
    applicationBuild: z
      .object({
        packageVersion: version,
        gitCommitSha: z.string().regex(GIT_SHA).optional(),
      })
      .strict(),
  })
  .strict();

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

const declaredFactsSchema = z
  .object({
    brandName: declaredFactSchema,
    alcoholValue: declaredFactSchema,
  })
  .strict();

export const analysisRunCreationInputSchema = z
  .object({
    runId: z.string().min(1),
    createdAt: z.string().min(1),
    product: z.object({ productId: z.string().min(1), revisionId: z.string().min(1) }).strict(),
    sourceArtifact: z.object({ artifactId: z.string().min(1), sha256: sha256.nullable() }).strict(),
    sanitizedDerivative: z
      .object({ derivativeId: z.string().min(1), path: z.string().min(1), sha256 })
      .strict(),
    declaredFacts: declaredFactsSchema,
    versionManifest: versionManifestSchema,
    checkIds: z.array(z.string().min(1)).min(1),
  })
  .strict();

export type AnalysisRunCreationInputParsed = z.infer<typeof analysisRunCreationInputSchema>;
