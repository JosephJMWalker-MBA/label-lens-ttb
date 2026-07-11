import { z } from "zod";

import { observationSchema } from "@/domain/evidence/evidence.schema";
import { EVIDENCE_STATUSES } from "@/domain/run/run-status";
import { verificationFindingSchema } from "@/domain/verification/finding.schema";
import { PRECHECK_CHECK_IDS } from "@/pipeline/precheck/precheck.types";
import { err, ok, type Result } from "@/shared/result";

import { RESULT_DISPOSITION_DECISIONS, RESULT_MODE, RESULT_SCHEMA_VERSION } from "./result.types";
import type { AssemblyError, DispositionError, PrecheckResult } from "./result.types";

const SHA256 = /^[0-9a-f]{64}$/;
const SEMVER = /^\d+\.\d+\.\d+$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const sha256 = z.string().regex(SHA256, "must be a 64-character hex SHA-256");
const semver = z.string().regex(SEMVER, "must be a semantic version x.y.z");

// Defensive runtime bounds against pathological deserialized payloads — not
// regulatory maximums. They sit far above lawful label text and the fixtures.
const ID_MAX = 256;
const REASON_MAX = 512;
const ACTOR_MAX = 256;
const NOTE_MAX = 8192;
const INSTANT_MAX = 64;

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** A non-blank, whitespace-rejecting, bounded string. Never silently trimmed. */
function boundedText(max: number) {
  return z
    .string()
    .max(max)
    .refine((v) => v.trim().length > 0, { message: "must not be empty or whitespace" });
}

/**
 * A valid RFC3339 instant that round-trips through `Date` — rejecting impossible
 * calendar dates that permissive parsing would otherwise normalize (e.g.
 * 2026-02-30). Offsets are accepted; UTC instants are compared field-for-field.
 */
function isValidInstant(v: string): boolean {
  if (!RFC3339.test(v)) return false;
  const ms = Date.parse(v);
  if (Number.isNaN(ms)) return false;
  if (v.endsWith("Z")) {
    return new Date(ms).toISOString().slice(0, 19) === v.slice(0, 19);
  }
  return true;
}

const instant = z
  .string()
  .max(INSTANT_MAX)
  .refine(isValidInstant, { message: "must be a valid RFC3339 instant" });
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

export const dispositionEntrySchema = z
  .object({
    dispositionId: boundedText(ID_MAX),
    sequence: z.number().int().positive().refine(Number.isSafeInteger, "unsafe integer"),
    actorId: boundedText(ACTOR_MAX),
    recordedAt: instant,
    decision: z.enum(RESULT_DISPOSITION_DECISIONS),
    reasonCode: boundedText(REASON_MAX),
    note: boundedText(NOTE_MAX).optional(),
    references: z
      .object({
        ruleIds: z.array(boundedText(ID_MAX)).optional(),
        checkIds: z.array(boundedText(ID_MAX)).optional(),
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

/**
 * Cross-object semantic invariants shared by the immutable result and the JSON
 * export. Both wrap the same observation/finding schemas; this enforces that the
 * assembled whole is self-consistent: findings match the ordered manifest,
 * evidence references resolve to real observations, ids are unique, and
 * disposition references point at findings/checks that actually exist. Nothing
 * is reordered or deduplicated — contradictions are rejected.
 */
interface ResultSemanticShape {
  profile: { id: string; version: string; ruleManifest: { ruleId: string; version: string }[] };
  observations: { brandName: { state: string }; alcoholStatement: { state: string } };
  findings: {
    ruleId: string;
    ruleVersion: string;
    profileId: string;
    profileVersion: string;
    evidenceReferences: {
      fieldId: string;
      derivativeSha256: string;
      observationState: string;
      alternateIndex?: number;
    }[];
  }[];
  evidenceAssessments: { checkId: string }[];
  versionManifest: { sanitizedDerivativeSha256: string };
  humanDispositionHistory: {
    references?: { ruleIds?: string[]; checkIds?: string[] };
  }[];
}

export function refineResultSemantics(result: ResultSemanticShape, ctx: z.RefinementCtx): void {
  const issue = (path: (string | number)[], message: string) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

  // Manifest rule ids and id@version must be unique.
  const ruleIds = new Set<string>();
  const ruleIdVersions = new Set<string>();
  result.profile.ruleManifest.forEach((r, i) => {
    if (ruleIds.has(r.ruleId)) issue(["profile", "ruleManifest", i], "duplicate manifest rule id.");
    ruleIds.add(r.ruleId);
    const key = `${r.ruleId}@${r.version}`;
    if (ruleIdVersions.has(key)) {
      issue(["profile", "ruleManifest", i], "duplicate manifest rule id/version.");
    }
    ruleIdVersions.add(key);
  });

  // Findings: exactly one per manifest rule, in the manifest's order, with the
  // manifest rule version and the enclosing profile identity.
  if (result.findings.length !== result.profile.ruleManifest.length) {
    issue(["findings"], "findings count must equal the ordered rule manifest length.");
  }
  const seenFindingRuleIds = new Set<string>();
  result.findings.forEach((f, i) => {
    const manifestRule = result.profile.ruleManifest[i];
    if (manifestRule && f.ruleId !== manifestRule.ruleId) {
      issue(["findings", i, "ruleId"], "finding order does not match the ordered manifest.");
    }
    if (manifestRule && f.ruleVersion !== manifestRule.version) {
      issue(["findings", i, "ruleVersion"], "finding rule version differs from the manifest.");
    }
    if (f.profileId !== result.profile.id || f.profileVersion !== result.profile.version) {
      issue(["findings", i, "profileId"], "finding profile identity differs from the result.");
    }
    if (seenFindingRuleIds.has(f.ruleId)) {
      issue(["findings", i, "ruleId"], "duplicate finding rule id.");
    }
    seenFindingRuleIds.add(f.ruleId);
  });

  // Evidence assessment check ids unique.
  const checkIds = new Set<string>();
  result.evidenceAssessments.forEach((a, i) => {
    if (checkIds.has(a.checkId)) issue(["evidenceAssessments", i], "duplicate check id.");
    checkIds.add(a.checkId);
  });

  // Evidence references must resolve to a real observation field, the same
  // derivative hash, and the matching observation state.
  const fieldStates: Record<string, string> = {
    brandName: result.observations.brandName.state,
    alcoholStatement: result.observations.alcoholStatement.state,
  };
  result.findings.forEach((f, fi) => {
    f.evidenceReferences.forEach((ref, ri) => {
      const state = fieldStates[ref.fieldId];
      if (state === undefined) {
        issue(
          ["findings", fi, "evidenceReferences", ri, "fieldId"],
          "references an unknown field.",
        );
        return;
      }
      if (ref.derivativeSha256 !== result.versionManifest.sanitizedDerivativeSha256) {
        issue(
          ["findings", fi, "evidenceReferences", ri, "derivativeSha256"],
          "reference derivative hash differs from the result.",
        );
      }
      if (ref.observationState !== state) {
        issue(
          ["findings", fi, "evidenceReferences", ri, "observationState"],
          `reference state ${ref.observationState} differs from observation state ${state}.`,
        );
      }
      if (ref.alternateIndex !== undefined && state === "NOT_OBSERVED") {
        issue(
          ["findings", fi, "evidenceReferences", ri, "alternateIndex"],
          "cannot reference an alternate of a NOT_OBSERVED observation.",
        );
      }
    });
  });

  // Disposition references must point at findings/checks that exist, with no
  // duplicates within an entry.
  const findingRuleIdSet = new Set(result.findings.map((f) => f.ruleId));
  result.humanDispositionHistory.forEach((entry, ei) => {
    const refs = entry.references;
    if (!refs) return;
    const dupRule = new Set<string>();
    for (const ruleId of refs.ruleIds ?? []) {
      if (!findingRuleIdSet.has(ruleId)) {
        issue(
          ["humanDispositionHistory", ei, "references", "ruleIds"],
          `unknown rule id ${ruleId}.`,
        );
      }
      if (dupRule.has(ruleId)) {
        issue(
          ["humanDispositionHistory", ei, "references", "ruleIds"],
          "duplicate rule reference.",
        );
      }
      dupRule.add(ruleId);
    }
    const dupCheck = new Set<string>();
    for (const checkId of refs.checkIds ?? []) {
      if (!checkIds.has(checkId)) {
        issue(
          ["humanDispositionHistory", ei, "references", "checkIds"],
          `unknown check id ${checkId}.`,
        );
      }
      if (dupCheck.has(checkId)) {
        issue(
          ["humanDispositionHistory", ei, "references", "checkIds"],
          "duplicate check reference.",
        );
      }
      dupCheck.add(checkId);
    }
  });
}

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
  .strict()
  .superRefine(refineResultSemantics);

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
