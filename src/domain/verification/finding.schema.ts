import { z } from "zod";

import { geometrySchema } from "@/domain/evidence/evidence.schema";
import { FINDING_STATUSES, RULE_EXECUTION_STATUSES } from "@/domain/run/run-status";
import type { FindingStatus, RuleExecutionStatus } from "@/domain/run/run-status";
import { ANALYZER_OBSERVATION_STATES } from "@/pipeline/analyzer/analyzer.types";
import { err, ok, type Result } from "@/shared/result";

import type { VerificationFinding } from "./finding.types";

const SEMVER = /^\d+\.\d+\.\d+$/;
const SHA256 = /^[0-9a-f]{64}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Which finding statuses are valid for each rule execution status. Anything not
 * listed here is rejected — e.g. executed + not_run, or not_run_* + PASS.
 */
const VALID_FINDING_STATUSES: Record<RuleExecutionStatus, ReadonlySet<FindingStatus>> = {
  executed: new Set(["PASS", "WARN", "FAIL", "NEEDS_REVIEW"]),
  not_run_insufficient_evidence: new Set(["not_run"]),
  not_run_external_dependency: new Set(["not_run"]),
  error: new Set(["NEEDS_REVIEW"]),
};

export function isValidExecutionFinding(
  execution: RuleExecutionStatus,
  finding: FindingStatus,
): boolean {
  return VALID_FINDING_STATUSES[execution].has(finding);
}

const isoDate = z
  .string()
  .regex(ISO_DATE)
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "must be a valid ISO YYYY-MM-DD date" });

const evidenceReferenceSchema = z
  .object({
    derivativeSha256: z.string().regex(SHA256, "must be a 64-character hex SHA-256"),
    fieldId: z.string().min(1),
    observationState: z.enum(ANALYZER_OBSERVATION_STATES),
    ocrEvidenceScore: z.number().finite().min(0).max(1),
    confidence: z.number().finite().min(0).max(1),
    geometry: geometrySchema.optional(),
    alternateIndex: z.number().int().nonnegative().optional(),
  })
  .strict()
  .superRefine((reference, ctx) => {
    if (Math.abs(reference.confidence - reference.ocrEvidenceScore) > 1e-9) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confidence"],
        message: "confidence must match ocrEvidenceScore exactly.",
      });
    }
  });

const authoritySchema = z
  .object({
    citation: z.string().min(1),
    snapshotDate: isoDate,
    effectiveDate: isoDate.optional(),
  })
  .strict();

export const verificationFindingSchema = z
  .object({
    ruleId: z.string().min(1),
    ruleVersion: z.string().regex(SEMVER, "must be a semantic version x.y.z"),
    profileId: z.string().min(1),
    profileVersion: z.string().regex(SEMVER, "must be a semantic version x.y.z"),
    authority: authoritySchema,
    findingStatus: z.enum(FINDING_STATUSES),
    ruleExecutionStatus: z.enum(RULE_EXECUTION_STATUSES),
    evidenceReferences: z.array(evidenceReferenceSchema),
    message: z.string().min(1),
    externalEvidenceDependency: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((finding, ctx) => {
    if (!isValidExecutionFinding(finding.ruleExecutionStatus, finding.findingStatus)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["findingStatus"],
        message: `findingStatus "${finding.findingStatus}" is not valid for ruleExecutionStatus "${finding.ruleExecutionStatus}".`,
      });
    }

    const needsDependency = finding.ruleExecutionStatus === "not_run_external_dependency";
    if (needsDependency && !finding.externalEvidenceDependency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["externalEvidenceDependency"],
        message: "not_run_external_dependency requires an externalEvidenceDependency.",
      });
    }
    if (!needsDependency && finding.externalEvidenceDependency !== undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["externalEvidenceDependency"],
        message: "externalEvidenceDependency is only allowed for not_run_external_dependency.",
      });
    }
  });

type SchemaOutput = z.infer<typeof verificationFindingSchema>;
const _typeCheck: SchemaOutput extends VerificationFinding ? true : never = true;
void _typeCheck;

export interface VerificationFindingError {
  code: "INVALID_FINDING";
  message: string;
  issues: string[];
}

export function validateVerificationFinding(
  candidate: unknown,
): Result<VerificationFinding, VerificationFindingError> {
  const parsed = verificationFindingSchema.safeParse(candidate);
  if (parsed.success) {
    return ok(parsed.data);
  }
  return err({
    code: "INVALID_FINDING",
    message: "Verification finding failed validation.",
    issues: parsed.error.issues.map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "$";
      return `${path}: ${issue.message}`;
    }),
  });
}
