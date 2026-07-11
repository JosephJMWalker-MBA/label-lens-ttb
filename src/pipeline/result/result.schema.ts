import { z } from "zod";

import { EVIDENCE_STATUSES } from "@/domain/run/run-status";
import { verificationFindingSchema } from "@/domain/verification/finding.schema";
import { ANALYZER_OBSERVATION_STATES } from "@/pipeline/analyzer/analyzer.types";
import { PRECHECK_CHECK_IDS } from "@/pipeline/precheck/precheck.types";
import { err, ok, type Result } from "@/shared/result";

import { RESULT_DISPOSITION_DECISIONS, RESULT_MODE, RESULT_SCHEMA_VERSION } from "./result.types";
import type { AssemblyError, DispositionError, PrecheckResult } from "./result.types";

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

const geometrySchema = z
  .object({
    imageIndex: z.number().int().nonnegative(),
    x: z.number().finite().nonnegative(),
    y: z.number().finite().nonnegative(),
    width: z.number().finite().positive(),
    height: z.number().finite().positive(),
    imageWidth: z.number().finite().positive(),
    imageHeight: z.number().finite().positive(),
  })
  .strict();

const alternateSchema = z
  .object({
    value: z.string(),
    confidence: z.number().finite().min(0).max(1),
    geometry: geometrySchema.optional(),
  })
  .strict();

const observationSchema = z
  .object({
    state: z.enum(ANALYZER_OBSERVATION_STATES),
    value: z.string().nullable(),
    normalizedValue: z.string().nullable().optional(),
    rawText: z.string().optional(),
    confidence: z.number().finite().min(0).max(1),
    geometry: geometrySchema.optional(),
    alternates: z.array(alternateSchema),
  })
  .strict();

const ocrEngineSchema = z.union([
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
      .object({ packageVersion: semver, gitCommitSha: z.string().optional() })
      .strict(),
  })
  .strict();

export const dispositionEntrySchema = z
  .object({
    dispositionId: z.string().min(1),
    sequence: z.number().int().positive(),
    actorId: z.string().min(1),
    recordedAt: z.string().min(1),
    decision: z.enum(RESULT_DISPOSITION_DECISIONS),
    reasonCode: z.string().min(1),
    note: z.string().min(1).optional(),
    references: z
      .object({
        ruleIds: z.array(z.string().min(1)).optional(),
        checkIds: z.array(z.string().min(1)).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/** Append-only history: contiguous 1..n sequence, unique disposition ids. */
export const dispositionHistorySchema = z
  .array(dispositionEntrySchema)
  .superRefine((entries, ctx) => {
    const ids = new Set<string>();
    entries.forEach((entry, index) => {
      if (entry.sequence !== index + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "sequence"],
          message: `Disposition sequence must be contiguous from 1; expected ${index + 1}.`,
        });
      }
      if (ids.has(entry.dispositionId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, "dispositionId"],
          message: `Duplicate dispositionId: ${entry.dispositionId}.`,
        });
      }
      ids.add(entry.dispositionId);
    });
  });

export const precheckResultSchema = z
  .object({
    machineResultId: z.string().min(1),
    resultSchemaVersion: z.literal(RESULT_SCHEMA_VERSION),
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
    humanDispositionHistory: dispositionHistorySchema,
  })
  .strict();

export function validatePrecheckResult(candidate: unknown): Result<PrecheckResult, AssemblyError> {
  const parsed = precheckResultSchema.safeParse(candidate);
  if (parsed.success) return ok(parsed.data as PrecheckResult);
  return err({
    code: "INVALID_RESULT_SHAPE",
    message: "Pre-check result failed schema validation.",
    issues: issuesOf(parsed.error),
  });
}

export function validateDispositionHistory(candidate: unknown): Result<void, DispositionError> {
  const parsed = dispositionHistorySchema.safeParse(candidate);
  if (parsed.success) return ok(undefined);
  return err({
    code: "INVALID_DISPOSITION",
    message: "Disposition history failed validation.",
    issues: issuesOf(parsed.error),
  });
}

function issuesOf(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length ? issue.path.join(".") : "$";
    return `${path}: ${issue.message}`;
  });
}
