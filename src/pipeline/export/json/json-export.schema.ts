import { z } from "zod";

import { observationSchema } from "@/domain/evidence/evidence.schema";
import { EVIDENCE_STATUSES } from "@/domain/run/run-status";
import { verificationFindingSchema } from "@/domain/verification/finding.schema";
import { PRECHECK_CHECK_IDS } from "@/pipeline/precheck/precheck.types";
import {
  dispositionHistorySchema,
  humanFieldConfirmationHistorySchema,
  refineResultSemantics,
} from "@/pipeline/result/result.schema";
import { RESULT_MODE, RESULT_SCHEMA_VERSION } from "@/pipeline/result/result.types";
import { err, ok, type Result } from "@/shared/result";

import {
  EXPORT_SCHEMA_VERSION,
  EXPORT_TYPE,
  HASH_ALGORITHM,
  INTEGRITY_SCOPE,
  type JsonExportError,
  type PrecheckJsonExport,
} from "./json-export.types";

const SHA256 = /^[0-9a-f]{64}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const sha256 = z.string().regex(SHA256, "must be a 64-character hex SHA-256");
const semver = z.string().regex(SEMVER, "must be a semantic version x.y.z");
const isoDate = z
  .string()
  .regex(ISO_DATE)
  .refine((v) => !Number.isNaN(Date.parse(v)), {
    message: "must be a valid ISO YYYY-MM-DD date",
  });

const ocrEngineSchema = z.union([
  z
    .object({
      kind: z.literal("ocr"),
      engineId: z.string().min(1),
      engineVersion: z.string().min(1),
      modelId: z.string().min(1).optional(),
      modelVersion: z.string().min(1).optional(),
      modelSha256: sha256.optional(),
    })
    .strict(),
  z.object({ kind: z.literal("not_applicable") }).strict(),
]);

const provenanceSchema = z
  .object({
    artifactRef: z.string().min(1),
    derivativeSha256: sha256,
    extractionAdapterId: z.string().min(1),
    extractionAdapterVersion: z.string().min(1),
    ocrEngine: ocrEngineSchema,
    parserId: z.string().min(1),
    parserVersion: z.string().min(1),
    processedAt: z.string().min(1),
  })
  .strict();

const authoritySchema = z
  .object({ citation: z.string().min(1), snapshotDate: isoDate, effectiveDate: isoDate.optional() })
  .strict();

const ruleRefSchema = z.object({ ruleId: z.string().min(1), version: semver }).strict();

const declaredFactSchema = z
  .object({
    value: z.string().min(1),
    provenance: z
      .object({
        sourceType: z.string().min(1),
        sourceReference: z.string().min(1),
        recordedBy: z.string().min(1),
        recordedAt: z.string().min(1),
        note: z.string().min(1).optional(),
      })
      .strict(),
  })
  .strict();

const evidenceAssessmentSchema = z
  .object({
    checkId: z.enum(PRECHECK_CHECK_IDS),
    evidenceStatus: z.enum(EVIDENCE_STATUSES),
    reasonCode: z.string().min(1),
  })
  .strict();

const versionManifestSchema = z
  .object({
    sourceArtifactSha256: sha256.nullable(),
    sanitizedDerivativeSha256: sha256,
    extractionAdapterId: z.string().min(1),
    extractionAdapterVersion: semver,
    ocrEngine: ocrEngineSchema,
    parserId: z.string().min(1),
    parserVersion: semver,
    ruleProfileId: z.string().min(1),
    ruleProfileVersion: semver,
    rules: z.array(ruleRefSchema).min(1),
    authorities: z.array(authoritySchema).min(1),
    applicationBuild: z
      .object({
        packageVersion: semver,
        gitCommitSha: z.string().min(1).optional(),
        commitProvenance: z
          .enum(["build-environment", "unavailable-development-fallback"])
          .optional(),
      })
      .strict(),
    derivativeRelationship: z.enum(["same_bytes", "transformed"]).optional(),
  })
  .strict();

export const precheckJsonExportSchema = z
  .object({
    exportSchemaVersion: z.literal(EXPORT_SCHEMA_VERSION),
    exportType: z.literal(EXPORT_TYPE),
    generatedFrom: z
      .object({
        machineResultId: z.string().min(1),
        resultSchemaVersion: z.literal(RESULT_SCHEMA_VERSION),
      })
      .strict(),
    mode: z.literal(RESULT_MODE),
    profile: z
      .object({
        id: z.string().min(1),
        version: semver,
        ruleManifest: z.array(ruleRefSchema).min(1),
      })
      .strict(),
    run: z
      .object({
        runId: z.string().min(1),
        createdAt: z.string().min(1),
        product: z.object({ productId: z.string().min(1), revisionId: z.string().min(1) }).strict(),
        sourceArtifact: z
          .object({ artifactId: z.string().min(1), sha256: sha256.nullable() })
          .strict(),
        sanitizedDerivative: z
          .object({ derivativeId: z.string().min(1), path: z.string().min(1), sha256 })
          .strict(),
      })
      .strict(),
    declaredFacts: z
      .object({
        applicationBrandName: declaredFactSchema,
        applicationAlcoholValue: declaredFactSchema,
      })
      .strict(),
    evidenceAssessments: z.array(evidenceAssessmentSchema).length(2),
    observations: z
      .object({
        provenance: provenanceSchema,
        brandName: observationSchema,
        alcoholStatement: observationSchema,
      })
      .strict(),
    findings: z.array(verificationFindingSchema),
    versionManifest: versionManifestSchema,
    humanFieldConfirmationHistory: humanFieldConfirmationHistorySchema.default([]),
    humanDispositionHistory: dispositionHistorySchema,
    advisoryNotice: z
      .object({ noticeId: z.string().min(1), noticeVersion: semver, text: z.string().min(1) })
      .strict(),
    advisoryQuality: z
      .object({
        imageQualityWarnings: z.array(z.string().min(1)).optional(),
        note: z.string().min(1).optional(),
      })
      .strict()
      .optional(),
    integrity: z
      .object({
        algorithm: z.literal(HASH_ALGORITHM),
        scope: z.literal(INTEGRITY_SCOPE),
        value: sha256,
      })
      .strict(),
  })
  .strict()
  // The export wraps the same machine content as the result, so it enforces the
  // identical cross-object semantic invariants — never fewer.
  .superRefine(refineResultSemantics);

export function validateJsonExportShape(
  candidate: unknown,
): Result<PrecheckJsonExport, JsonExportError> {
  const parsed = precheckJsonExportSchema.safeParse(candidate);
  if (parsed.success) return ok(parsed.data as PrecheckJsonExport);
  return err({
    code: "INVALID_EXPORT_SHAPE",
    message: "JSON export failed schema validation.",
    issues: parsed.error.issues.map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "$";
      return `${path}: ${issue.message}`;
    }),
  });
}
