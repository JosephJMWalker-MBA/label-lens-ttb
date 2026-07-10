import { z } from "zod";

import { err, ok, type Result } from "@/shared/result";

import {
  ANALYZER_EVIDENCE_SCHEMA_VERSION,
  ANALYZER_OBSERVATION_STATES,
  type AnalyzerEvidenceResponse,
  type AnalyzerValidationError,
} from "./analyzer.types";

/**
 * Keys the analyzer may never emit — decisions, findings, dispositions, rule or
 * authority conclusions, and out-of-scope fields for this slice (proof,
 * government-warning conclusions). Compared after stripping spaces, hyphens, and
 * underscores and lowercasing, so casing/formatting cannot smuggle them past.
 */
const FORBIDDEN_KEYS = new Set([
  "pass",
  "fail",
  "warn",
  "needsreview",
  "notrun",
  "status",
  "finding",
  "findings",
  "verdict",
  "decision",
  "disposition",
  "humandisposition",
  "compliant",
  "compliance",
  "compliancestatus",
  "compliancedecision",
  "compliancefinding",
  "complianceverdict",
  "regulatory",
  "regulatorydecision",
  "regulatorystatus",
  "regulatoryverdict",
  "approval",
  "approved",
  "rejected",
  "rule",
  "ruleid",
  "authority",
  "authorityconclusion",
  "recommendation",
  "recommendedaction",
  "suggestedaction",
  "legalaction",
  "action",
  "proof",
  "governmentwarning",
  "governmentwarningstatus",
  "warningstatus",
  "warningcompliant",
  "overallstatus",
  "compliancepercentage",
  "score",
]);

function normalizeKey(key: string): string {
  return key.replace(/[\s_-]/g, "").toLowerCase();
}

function findForbiddenKey(value: unknown, path = "$"): { path: string; key: string } | null {
  if (value === null || typeof value !== "object") return null;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const nested = findForbiddenKey(value[i], `${path}[${i}]`);
      if (nested) return nested;
    }
    return null;
  }

  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(normalizeKey(key))) {
      return { path, key };
    }
    const nested = findForbiddenKey(child, `${path}.${key}`);
    if (nested) return nested;
  }
  return null;
}

const confidence = z.number().finite().min(0).max(1);

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
    value: z.string().min(1),
    confidence,
    geometry: geometrySchema.optional(),
  })
  .strict();

const fieldObservationSchema = z
  .object({
    state: z.enum(ANALYZER_OBSERVATION_STATES),
    value: z.string().min(1).nullable(),
    normalizedValue: z.string().min(1).nullable().optional(),
    rawText: z.string().min(1).optional(),
    confidence,
    geometry: geometrySchema.optional(),
    alternates: z.array(alternateSchema).default([]),
  })
  .strict()
  .superRefine((obs, ctx) => {
    if (obs.state === "NOT_OBSERVED" && obs.value !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: "NOT_OBSERVED must not carry a value.",
      });
    }
    if (obs.state !== "NOT_OBSERVED" && obs.value === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["value"],
        message: `${obs.state} must preserve the observed value.`,
      });
    }
    if (obs.state === "AMBIGUOUS" && obs.alternates.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["alternates"],
        message: "AMBIGUOUS must preserve at least one alternate candidate.",
      });
    }
  });

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

const provenanceSchema = z
  .object({
    artifactRef: z.string().min(1),
    derivativeSha256: z.string().regex(/^[0-9a-f]{64}$/),
    extractionAdapterId: z.string().min(1),
    extractionAdapterVersion: z.string().min(1),
    ocrEngine: ocrEngineSchema,
    parserId: z.string().min(1),
    parserVersion: z.string().min(1),
    processedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const analyzerEvidenceResponseSchema = z
  .object({
    schemaVersion: z.literal(ANALYZER_EVIDENCE_SCHEMA_VERSION),
    provenance: provenanceSchema,
    fields: z
      .object({
        brandName: fieldObservationSchema,
        alcoholStatement: fieldObservationSchema,
      })
      .strict(),
    limitations: z.array(z.string().min(1)).default([]),
  })
  .strict();

type SchemaOutput = z.infer<typeof analyzerEvidenceResponseSchema>;
const _typeCheck: SchemaOutput extends AnalyzerEvidenceResponse ? true : never = true;
void _typeCheck;

export function validateAnalyzerEvidenceResponse(
  candidate: unknown,
): Result<AnalyzerEvidenceResponse, AnalyzerValidationError> {
  const forbidden = findForbiddenKey(candidate);
  if (forbidden) {
    return err({
      code: "REGULATORY_DECISION",
      message: "Analyzer output included a forbidden decision or out-of-scope key.",
      issues: [`${forbidden.path}: key "${forbidden.key}" is not allowed in evidence-only output.`],
    });
  }

  const parsed = analyzerEvidenceResponseSchema.safeParse(candidate);
  if (!parsed.success) {
    return err({
      code: "INVALID_SHAPE",
      message: "Analyzer output failed evidence-only schema validation.",
      issues: parsed.error.issues.map((issue) => {
        const path = issue.path.length ? issue.path.join(".") : "$";
        return `${path}: ${issue.message}`;
      }),
    });
  }

  return ok(parsed.data);
}
