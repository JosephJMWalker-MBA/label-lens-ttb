import { z } from "zod";

import { err, ok, type Result } from "../../../../shared/result";

import type {
  LocalVlmConfigError,
  LocalVlmExperimentReport,
  LocalVlmResolvedConfig,
  LocalVlmRunReport,
} from "./local-vlm.types";
import {
  LOCAL_VLM_CONFIG_SCHEMA_VERSION,
  LOCAL_VLM_DECISIONS,
  LOCAL_VLM_REPORT_SCHEMA_VERSION,
  LOCAL_VLM_RUNTIME_KINDS,
} from "./local-vlm.types";

const sha256 = z.string().regex(/^[a-f0-9]{64}$/i, "must be a 64-character SHA-256 hex digest");
const absPath = z
  .string()
  .trim()
  .min(1)
  .refine((value) => value.startsWith("/"), {
    message: "must be an absolute path",
  });
const loopbackHost = z.string().refine((value) => {
  if (value === "::1") return true;
  const normalized = value.trim();
  if (!normalized) return false;
  if (!normalized.startsWith("127.")) return false;
  const octets = normalized.split(".");
  return (
    octets.length === 4 &&
    octets.every((part) => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255)
  );
}, "must be a loopback host");

export const localVlmResolvedConfigSchema = z
  .object({
    schemaVersion: z.literal(LOCAL_VLM_CONFIG_SCHEMA_VERSION),
    llamaServerBin: absPath,
    llamaExecutableSha256: sha256,
    llamaVersionArgs: z.array(z.string().min(1)).min(1),
    modelPath: absPath,
    modelSha256: sha256,
    modelFileSize: z.number().int().positive(),
    modelDisplayId: z.string().min(1),
    modelQuantization: z.string().min(1).nullable(),
    mmprojPath: absPath.nullable(),
    mmprojSha256: sha256.nullable(),
    mmprojFileSize: z.number().int().positive().nullable(),
    host: loopbackHost,
    startupTimeoutMs: z.number().int().positive(),
    requestTimeoutMs: z.number().int().positive(),
    terminationTimeoutMs: z.number().int().positive(),
    maxImageBytes: z.number().int().positive(),
    maxOutputTokens: z.number().int().positive(),
    contextSize: z.number().int().positive(),
    gpuLayers: z.number().int().nonnegative().nullable(),
    threadCount: z.number().int().positive().nullable(),
    responseBytesMax: z.number().int().positive(),
    stdoutBytesMax: z.number().int().positive(),
    stderrBytesMax: z.number().int().positive(),
    resourceSampleIntervalMs: z.number().int().positive(),
    maxProposalsPerImage: z.number().int().positive(),
    maxReasonCodesPerProposal: z.number().int().positive(),
    maxDescriptionLength: z.number().int().positive(),
    temperature: z.literal(0),
    seed: z.number().int(),
    readinessPath: z.literal("/health"),
    chatCompletionsPath: z.literal("/v1/chat/completions"),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    if ((cfg.mmprojPath === null) !== (cfg.mmprojSha256 === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "projector path and digest must either both be present or both be null",
      });
    }
    if ((cfg.mmprojPath === null) !== (cfg.mmprojFileSize === null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "projector path and file size must either both be present or both be null",
      });
    }
  });

const runReportSchema = z
  .object({
    scenarioId: z.string().min(1),
    observationRunId: z.string().uuid(),
    runtimeKind: z.enum(LOCAL_VLM_RUNTIME_KINDS),
    workspaceRef: z.string().min(1),
    sourceArtifactRef: z.string().min(1),
    sourceImageSha256: sha256,
    overlaySha256: sha256,
    process: z.object({
      pid: z.number().int().positive().nullable(),
      processGroupId: z.number().int().positive().nullable(),
      port: z.number().int().positive(),
      spawnedAt: z.string().datetime().nullable(),
      readyAt: z.string().datetime().nullable(),
      requestStartedAt: z.string().datetime().nullable(),
      requestCompletedAt: z.string().datetime().nullable(),
      terminationRequestedAt: z.string().datetime().nullable(),
      exitedAt: z.string().datetime().nullable(),
      exitCode: z.number().int().nullable(),
      exitSignal: z.string().nullable(),
      forcedTermination: z.boolean(),
      stdoutBytes: z.number().int().nonnegative(),
      stderrBytes: z.number().int().nonnegative(),
      stdoutTruncated: z.boolean(),
      stderrTruncated: z.boolean(),
      readiness: z.object({
        attempts: z.number().int().nonnegative(),
        firstSuccessfulReadyAt: z.string().datetime().nullable(),
        totalStartupLatencyMs: z.number().nonnegative().nullable(),
        lastReadinessError: z.string().nullable(),
        processExitedBeforeReady: z.boolean(),
        startupTimedOut: z.boolean(),
      }),
      portReleased: z.boolean().nullable(),
    }),
    resources: z.object({
      workspaceBytesBeforeStart: z.number().int().nonnegative(),
      workspacePeakBytes: z.number().int().nonnegative(),
      workspaceBytesBeforeCleanup: z.number().int().nonnegative(),
      workspaceBytesAfterCleanup: z.number().int().nonnegative().nullable(),
      fileCountPeak: z.number().int().nonnegative(),
      filesCreated: z.number().int().nonnegative(),
      quarantinedFiles: z.number().int().nonnegative(),
      processRssBytesBeforeTermination: z.number().int().nonnegative().nullable(),
      peakProcessRssBytes: z.number().int().nonnegative().nullable(),
      peakProcessTreeRssBytes: z.number().int().nonnegative().nullable(),
      processRssBytesAfterTermination: z.number().int().nonnegative().nullable(),
      sampleCount: z.number().int().nonnegative(),
      sampleFailureCount: z.number().int().nonnegative(),
      gpu: z.object({
        available: z.boolean(),
        sampleCount: z.number().int().nonnegative(),
        peakBytes: z.number().int().nonnegative().nullable(),
        lastBytes: z.number().int().nonnegative().nullable(),
        failureCount: z.number().int().nonnegative(),
      }),
    }),
    timing: z.object({
      startupMs: z.number().nonnegative().nullable(),
      readinessMs: z.number().nonnegative().nullable(),
      requestMs: z.number().nonnegative().nullable(),
      parseMs: z.number().nonnegative().nullable(),
      terminationMs: z.number().nonnegative().nullable(),
      totalWallMs: z.number().nonnegative().nullable(),
    }),
    rawResponseDigest: sha256.nullable(),
    structuredResponseDigest: sha256.nullable(),
    schemaValid: z.boolean(),
    prohibitedClaimDetected: z.boolean(),
    observationIds: z.array(z.string().min(1)),
    proposalDescriptions: z.array(z.string().min(1)),
    contaminationTokensDetected: z.array(z.string().min(1)),
    priorRunIdsDetected: z.array(z.string().min(1)),
    priorObservationIdsDetected: z.array(z.string().min(1)),
    copiedDescriptionsDetected: z.array(z.string().min(1)),
    comparisonLanguageDetected: z.array(z.string().min(1)),
    cleanupCompleted: z.boolean(),
    forcedTermination: z.boolean(),
    transportSuccess: z.boolean(),
    jsonExtractionSuccess: z.boolean(),
    schemaSuccess: z.boolean(),
    prohibitedLanguageSuccess: z.boolean(),
    geometrySuccess: z.boolean(),
    errorRecord: z.unknown().nullable(),
  })
  .strict();

export const localVlmExperimentReportSchema = z
  .object({
    schemaVersion: z.literal(LOCAL_VLM_REPORT_SCHEMA_VERSION),
    generatedAt: z.string().datetime(),
    gitCommit: z.string().min(1),
    runtime: z.object({
      executableDigest: sha256.nullable(),
      runtimeVersion: z.string().nullable(),
    }),
    model: z.object({
      modelDigest: sha256.nullable(),
      projectorDigest: sha256.nullable(),
      quantization: z.string().nullable(),
    }),
    prompt: z.object({
      promptId: z.string().min(1),
      promptVersion: z.string().min(1),
      promptDigest: sha256,
    }),
    configuration: z.object({
      sanitizedRuntimeArguments: z.array(z.string().min(1)),
      isolationMode: z.literal("one-process-per-observation"),
    }),
    runs: z.array(runReportSchema),
    aggregate: z.object({
      runCount: z.number().int().nonnegative(),
      validResponseCount: z.number().int().nonnegative(),
      invalidResponseCount: z.number().int().nonnegative(),
      contaminationCount: z.number().int().nonnegative(),
      cleanupFailureCount: z.number().int().nonnegative(),
      forcedTerminationCount: z.number().int().nonnegative(),
      prohibitedClaimCount: z.number().int().nonnegative(),
      schemaFailureCount: z.number().int().nonnegative(),
      peakRssSummary: z.object({
        peakProcessRssBytes: z.number().int().nonnegative().nullable(),
        peakProcessTreeRssBytes: z.number().int().nonnegative().nullable(),
      }),
      workspaceSummary: z.object({
        maxWorkspaceBytes: z.number().int().nonnegative(),
        maxWorkspaceFiles: z.number().int().nonnegative(),
      }),
      latencySummary: z.object({
        maxStartupMs: z.number().nonnegative().nullable(),
        maxRequestMs: z.number().nonnegative().nullable(),
        maxTerminationMs: z.number().nonnegative().nullable(),
      }),
    }),
    decision: z.enum(LOCAL_VLM_DECISIONS),
  })
  .strict();

function issuesOf(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
    return `${path}${issue.message}`;
  });
}

export function validateLocalVlmResolvedConfig(
  input: unknown,
): Result<LocalVlmResolvedConfig, LocalVlmConfigError> {
  const parsed = localVlmResolvedConfigSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: "INVALID_NUMBER",
      message: "Local VLM configuration is invalid.",
      issues: issuesOf(parsed.error),
    });
  }
  return ok(parsed.data);
}

export function validateLocalVlmExperimentReport(
  input: unknown,
): Result<LocalVlmExperimentReport, { message: string; issues: readonly string[] }> {
  const parsed = localVlmExperimentReportSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      message: "Local VLM experiment report is invalid.",
      issues: issuesOf(parsed.error),
    });
  }
  return ok(parsed.data as LocalVlmExperimentReport);
}

export function validateLocalVlmRunReport(
  input: unknown,
): Result<LocalVlmRunReport, { message: string; issues: readonly string[] }> {
  const parsed = runReportSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      message: "Local VLM run report is invalid.",
      issues: issuesOf(parsed.error),
    });
  }
  return ok(parsed.data as LocalVlmRunReport);
}
