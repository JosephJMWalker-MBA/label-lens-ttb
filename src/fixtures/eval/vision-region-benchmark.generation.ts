import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import {
  buildLlamaServerLaunchSpec,
  readLlamaVersionOutput,
} from "./vision-observer/local-vlm/llama-server-config";
import {
  sendObservationRequest,
  waitForReadiness,
} from "./vision-observer/local-vlm/llama-server-client";
import { LlamaServerVisionObserverAdapter } from "./vision-observer/local-vlm/llama-server-adapter";
import {
  LLAMA_SERVER_ADAPTER_ID,
  LLAMA_SERVER_ADAPTER_VERSION,
  type LocalVlmObservationFailureShape,
  type LocalVlmResolvedConfig,
  type LocalVlmRuntimeKind,
} from "./vision-observer/local-vlm/local-vlm.types";
import {
  localVlmFailureFromUnknown,
  spawnOwnedLlamaServerProcess,
} from "./vision-observer/local-vlm/llama-server-process";
import {
  buildRefinementObservationInstruction,
  LOCAL_VLM_PROMPT_ID,
  LOCAL_VLM_PROMPT_SHA256,
  LOCAL_VLM_PROMPT_VERSION,
  LOCAL_VLM_REFINEMENT_PROMPT_ID,
  LOCAL_VLM_REFINEMENT_PROMPT_SHA256,
  LOCAL_VLM_REFINEMENT_PROMPT_TEXT,
  LOCAL_VLM_REFINEMENT_PROMPT_VERSION,
} from "./vision-observer/local-vlm/observer-prompt";
import { validateObserverRegionProposal } from "./vision-observer/observer-grid.schema";
import { guardObserverProposalGrid } from "./vision-observer/observer-guards";
import { mapProposalToOriginalRegion } from "./vision-observer/observer-grid-transform";
import { runVisionObserverLifecycle } from "./vision-observer/observer-lifecycle";
import { refinementCellRangeSchema } from "./vision-observer/observer-grid.schema";
import type {
  ApparentOrientation,
  NormalizedBox,
  ObserverDerivative,
  ObserverRegionProposal,
  ReasonCode,
  Visibility,
  VisionObservationErrorRecord,
  VisionObserverResult,
} from "./vision-observer/observer-grid.types";
import {
  createVisionRegionRefinementDerivative,
  mapRefinementRangeToOriginalBox,
  type VisionRegionRefinementDerivative,
} from "./vision-region-refinement-derivative";

export interface VisionRegionBenchmarkGenerationInput {
  caseId: string;
  sourceArtifactRef: string;
  sourceBytes: Uint8Array;
  sourceMediaType: string;
  sourceWidth: number;
  sourceHeight: number;
}

export interface VisionRegionBenchmarkStageProcess {
  pid: number | null;
  processGroupId: number | null;
  port: number | null;
  spawnedAt: string | null;
  readyAt: string | null;
  requestStartedAt: string | null;
  requestCompletedAt: string | null;
  terminationRequestedAt: string | null;
  exitedAt: string | null;
  portReleased: boolean | null;
  processTreeReleasedAfterTermination: boolean | null;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
}

export interface VisionRegionBenchmarkStageResources {
  workspacePeakBytes: number;
  workspaceBytesAfterCleanup: number | null;
  fileCountPeak: number;
  sampleCount: number;
  sampleFailureCount: number;
  peakProcessRssBytes: number | null;
  peakProcessTreeRssBytes: number | null;
}

export interface VisionRegionBenchmarkStageTiming {
  startupMs: number | null;
  requestMs: number | null;
  parseMs: number | null;
  terminationMs: number | null;
  totalWallMs: number | null;
}

export interface VisionRegionBenchmarkStageRun {
  stage: "coarse" | "refinement";
  scenarioId: string;
  observationRunId: string;
  workspaceRef: string;
  runtimeKind: LocalVlmRuntimeKind;
  sourceArtifactRef: string;
  sourceImageSha256: string | null;
  overlaySha256: string | null;
  promptId: string;
  promptVersion: string;
  promptDigest: string;
  adapterId: string;
  adapterVersion: string;
  runtimeVersion: string | null;
  rawResponseDigest: string | null;
  structuredResponseDigest: string | null;
  schemaValid: boolean;
  prohibitedClaimDetected: boolean;
  transportSuccess: boolean;
  jsonExtractionSuccess: boolean;
  schemaSuccess: boolean;
  prohibitedLanguageSuccess: boolean;
  geometrySuccess: boolean;
  cleanupCompleted: boolean;
  forcedTermination: boolean;
  errorCode: string | null;
  errorStage: string | null;
  process: VisionRegionBenchmarkStageProcess;
  resources: VisionRegionBenchmarkStageResources;
  timing: VisionRegionBenchmarkStageTiming;
}

export interface VisionRegionBenchmarkCoarseProposalRecord {
  proposalId: string;
  observationId: string;
  coarseGridRange: string;
  apparentOrientation: ApparentOrientation;
  visibility: Visibility;
  reasonCodes: readonly ReasonCode[];
  coarseGeometry: NormalizedBox;
}

export interface VisionRegionBenchmarkRefinementProposalRecord {
  proposalId: string;
  observationId: string;
  refinementGridRange: string;
  apparentOrientation: ApparentOrientation;
  visibility: Visibility;
  reasonCodes: readonly ReasonCode[];
  refinedGeometry: NormalizedBox;
}

export interface VisionRegionBenchmarkRefinementStage {
  coarseProposalId: string;
  cropNormalizedBox: NormalizedBox | null;
  stageRun: VisionRegionBenchmarkStageRun;
  proposal: VisionRegionBenchmarkRefinementProposalRecord | null;
}

export interface VisionRegionBenchmarkCaseRun {
  caseId: string;
  repetition: number;
  coarseStage: VisionRegionBenchmarkStageRun;
  coarseProposals: readonly VisionRegionBenchmarkCoarseProposalRecord[];
  refinementStages: readonly VisionRegionBenchmarkRefinementStage[];
}

interface ParsedRefinementResponse {
  result: {
    observationRunId: string;
    proposals: Array<{
      observationId: string;
      proposalId: string;
      gridRange: z.infer<typeof refinementCellRangeSchema>;
      apparentOrientation: ApparentOrientation;
      visibility: Visibility;
      reasonCodes: ReasonCode[];
    }>;
  };
  rawResponseDigest: string;
  structuredResponseDigest: string;
  schemaValid: true;
  prohibitedClaimDetected: false;
}

const nonEmpty = z.string().trim().min(1);
const descriptionSchema = z.string().trim().min(1).max(160);
const prohibitedDescriptionPatterns = [
  /\b(pass|fail|approved|rejected|compliant|noncompliant)\b/i,
  /\b(regulatory|legal advice|legal)\b/i,
  /\b(brand|alcohol|abv|warning)\b/i,
  /\b(probability|confidence|correctness)\b/i,
  /\b(previous image|same as before|compared to)\b/i,
  /\b(expected text|transcription|verbatim)\b/i,
  /%/,
] as const;

const refinementProposalSchema = z
  .object({
    observationId: nonEmpty,
    proposalId: nonEmpty,
    observationType: z.literal("text-like-region"),
    source: z.literal("machine-observer"),
    authority: z.literal("non-authoritative"),
    purpose: z.literal("ocr-region-proposal"),
    gridRange: refinementCellRangeSchema,
    observationRotation: z.literal(0),
    apparentOrientation: z.enum([
      "horizontal",
      "vertical-clockwise",
      "vertical-counterclockwise",
      "rotated-180",
      "uncertain",
    ]),
    visibility: z.enum(["full", "partial", "obscured"]),
    reasonCodes: z
      .array(
        z.enum([
          "small_text",
          "edge_proximity",
          "rotation",
          "dense_text",
          "multi_line",
          "partial_visibility",
          "high_salience",
          "low_contrast",
          "multi_artifact",
        ]),
      )
      .min(1)
      .max(4)
      .refine((codes) => new Set(codes).size === codes.length, {
        message: "reason codes must be unique",
      }),
    description: descriptionSchema,
  })
  .strict()
  .superRefine((proposal, ctx) => {
    for (const pattern of prohibitedDescriptionPatterns) {
      if (pattern.test(proposal.description)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "description includes prohibited authority, compliance, field, or transcription language",
        });
        break;
      }
    }
  });

const refinementResponseSchema = z
  .object({
    observationRunId: nonEmpty,
    proposals: z.array(refinementProposalSchema).max(1),
  })
  .strict();

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
    .join(",")}}`;
}

function parseJsonEnvelope(raw: string):
  | { ok: true; json: string }
  | {
      ok: false;
      error: LocalVlmObservationFailureShape;
    } {
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch) return { ok: true, json: fencedMatch[1]! };
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return { ok: true, json: trimmed };
  return {
    ok: false,
    error: {
      code: "INVALID_OBSERVER_OUTPUT",
      message: "Model output must be exactly one JSON object or one enclosing JSON fence.",
      issues: ["leading or trailing prose is not allowed"],
    },
  };
}

function emptyProcess(): VisionRegionBenchmarkStageProcess {
  return {
    pid: null,
    processGroupId: null,
    port: null,
    spawnedAt: null,
    readyAt: null,
    requestStartedAt: null,
    requestCompletedAt: null,
    terminationRequestedAt: null,
    exitedAt: null,
    portReleased: null,
    processTreeReleasedAfterTermination: null,
    stdoutTruncated: false,
    stderrTruncated: false,
  };
}

function emptyResources(): VisionRegionBenchmarkStageResources {
  return {
    workspacePeakBytes: 0,
    workspaceBytesAfterCleanup: null,
    fileCountPeak: 0,
    sampleCount: 0,
    sampleFailureCount: 0,
    peakProcessRssBytes: null,
    peakProcessTreeRssBytes: null,
  };
}

function emptyTiming(): VisionRegionBenchmarkStageTiming {
  return {
    startupMs: null,
    requestMs: null,
    parseMs: null,
    terminationMs: null,
    totalWallMs: null,
  };
}

function shouldSkipWorkspaceCleanup(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "PROCESS_TERMINATION_FAILED",
  );
}

function extractWorkspaceBytesAfterCleanup(path: string) {
  if (!existsSync(path)) return Promise.resolve<number | null>(0);
  return stat(path)
    .then((info) => (info.isDirectory() ? 1 : info.size))
    .catch(() => null);
}

function toStageRun(args: {
  stage: "coarse" | "refinement";
  scenarioId: string;
  observationRunId: string;
  workspaceRef: string;
  runtimeKind: LocalVlmRuntimeKind;
  sourceArtifactRef: string;
  sourceImageSha256: string | null;
  overlaySha256: string | null;
  promptId: string;
  promptVersion: string;
  promptDigest: string;
  runtimeVersion: string | null;
  rawResponseDigest: string | null;
  structuredResponseDigest: string | null;
  schemaValid: boolean;
  prohibitedClaimDetected: boolean;
  transportSuccess: boolean;
  jsonExtractionSuccess: boolean;
  schemaSuccess: boolean;
  prohibitedLanguageSuccess: boolean;
  geometrySuccess: boolean;
  cleanupCompleted: boolean;
  forcedTermination: boolean;
  errorCode: string | null;
  errorStage: string | null;
  process: VisionRegionBenchmarkStageProcess;
  resources: VisionRegionBenchmarkStageResources;
  timing: VisionRegionBenchmarkStageTiming;
}): VisionRegionBenchmarkStageRun {
  return {
    stage: args.stage,
    scenarioId: args.scenarioId,
    observationRunId: args.observationRunId,
    workspaceRef: args.workspaceRef,
    runtimeKind: args.runtimeKind,
    sourceArtifactRef: args.sourceArtifactRef,
    sourceImageSha256: args.sourceImageSha256,
    overlaySha256: args.overlaySha256,
    promptId: args.promptId,
    promptVersion: args.promptVersion,
    promptDigest: args.promptDigest,
    adapterId: LLAMA_SERVER_ADAPTER_ID,
    adapterVersion: LLAMA_SERVER_ADAPTER_VERSION,
    runtimeVersion: args.runtimeVersion,
    rawResponseDigest: args.rawResponseDigest,
    structuredResponseDigest: args.structuredResponseDigest,
    schemaValid: args.schemaValid,
    prohibitedClaimDetected: args.prohibitedClaimDetected,
    transportSuccess: args.transportSuccess,
    jsonExtractionSuccess: args.jsonExtractionSuccess,
    schemaSuccess: args.schemaSuccess,
    prohibitedLanguageSuccess: args.prohibitedLanguageSuccess,
    geometrySuccess: args.geometrySuccess,
    cleanupCompleted: args.cleanupCompleted,
    forcedTermination: args.forcedTermination,
    errorCode: args.errorCode,
    errorStage: args.errorStage,
    process: args.process,
    resources: args.resources,
    timing: args.timing,
  };
}

function parseRefinementResponse(args: {
  observationRunId: string;
  rawResponseText: string;
  responseBytes: number;
  config: LocalVlmResolvedConfig;
}):
  | { ok: true; value: ParsedRefinementResponse }
  | {
      ok: false;
      error: LocalVlmObservationFailureShape;
      parseState: {
        jsonExtractionSuccess: boolean;
        schemaSuccess: boolean;
        prohibitedClaimDetected: boolean;
      };
    } {
  if (args.responseBytes > args.config.responseBytesMax) {
    return {
      ok: false,
      error: {
        code: "RESPONSE_TOO_LARGE",
        message: "Model response exceeded the configured byte budget.",
        issues: [`responseBytes=${args.responseBytes}`, `limit=${args.config.responseBytesMax}`],
      },
      parseState: {
        jsonExtractionSuccess: false,
        schemaSuccess: false,
        prohibitedClaimDetected: false,
      },
    };
  }

  const envelope = parseJsonEnvelope(args.rawResponseText);
  if (!envelope.ok) {
    return {
      ok: false,
      error: envelope.error,
      parseState: {
        jsonExtractionSuccess: false,
        schemaSuccess: false,
        prohibitedClaimDetected: false,
      },
    };
  }

  let parsedValue: unknown;
  try {
    parsedValue = JSON.parse(envelope.json);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: "INVALID_OBSERVER_OUTPUT",
        message: "Model output was not valid JSON.",
        issues: [error instanceof Error ? error.message : String(error)],
      },
      parseState: {
        jsonExtractionSuccess: true,
        schemaSuccess: false,
        prohibitedClaimDetected: false,
      },
    };
  }

  const validated = refinementResponseSchema.safeParse(parsedValue);
  if (!validated.success) {
    const issues = validated.error.issues.map((issue) => {
      const path = issue.path.length === 0 ? "" : `${issue.path.join(".")}: `;
      return `${path}${issue.message}`;
    });
    return {
      ok: false,
      error: {
        code: "INVALID_OBSERVER_OUTPUT",
        message: "Refinement response failed schema validation.",
        issues,
      },
      parseState: {
        jsonExtractionSuccess: true,
        schemaSuccess: false,
        prohibitedClaimDetected: issues.some((issue) =>
          /prohibited|authority|compliance|transcription/i.test(issue),
        ),
      },
    };
  }

  if (validated.data.observationRunId !== args.observationRunId) {
    return {
      ok: false,
      error: {
        code: "INVALID_OBSERVER_OUTPUT",
        message: "Refinement response carried the wrong observationRunId.",
        issues: [`expected=${args.observationRunId}`, `actual=${validated.data.observationRunId}`],
      },
      parseState: {
        jsonExtractionSuccess: true,
        schemaSuccess: false,
        prohibitedClaimDetected: false,
      },
    };
  }

  for (const proposal of validated.data.proposals) {
    if (proposal.reasonCodes.length > args.config.maxReasonCodesPerProposal) {
      return {
        ok: false,
        error: {
          code: "INVALID_OBSERVER_OUTPUT",
          message: "Refinement response exceeded the reason-code budget.",
          issues: [
            `${proposal.proposalId} emitted ${proposal.reasonCodes.length} reason codes`,
            `limit=${args.config.maxReasonCodesPerProposal}`,
          ],
        },
        parseState: {
          jsonExtractionSuccess: true,
          schemaSuccess: false,
          prohibitedClaimDetected: false,
        },
      };
    }
    if (proposal.description.length > args.config.maxDescriptionLength) {
      return {
        ok: false,
        error: {
          code: "INVALID_OBSERVER_OUTPUT",
          message: "Refinement response exceeded the description budget.",
          issues: [
            `${proposal.proposalId} description length=${proposal.description.length}`,
            `limit=${args.config.maxDescriptionLength}`,
          ],
        },
        parseState: {
          jsonExtractionSuccess: true,
          schemaSuccess: false,
          prohibitedClaimDetected: false,
        },
      };
    }
  }

  return {
    ok: true,
    value: {
      result: {
        observationRunId: validated.data.observationRunId,
        proposals: validated.data.proposals.map((proposal) => ({
          observationId: proposal.observationId,
          proposalId: proposal.proposalId,
          gridRange: proposal.gridRange,
          apparentOrientation: proposal.apparentOrientation,
          visibility: proposal.visibility,
          reasonCodes: proposal.reasonCodes,
        })),
      },
      rawResponseDigest: hashText(args.rawResponseText),
      structuredResponseDigest: hashText(stableStringify(validated.data)),
      schemaValid: true,
      prohibitedClaimDetected: false,
    },
  };
}

function toCoarseProposalRecord(
  proposal: ObserverRegionProposal,
  coarseGeometry: NormalizedBox,
): VisionRegionBenchmarkCoarseProposalRecord {
  return {
    proposalId: proposal.proposalId,
    observationId: proposal.observationId,
    coarseGridRange: proposal.gridRange.notation,
    apparentOrientation: proposal.apparentOrientation,
    visibility: proposal.visibility,
    reasonCodes: [...proposal.reasonCodes],
    coarseGeometry,
  };
}

function isEvaluationSafeSourceArtifactError(
  errorRecord: VisionObservationErrorRecord | null,
): boolean {
  return (
    errorRecord?.code === "INVALID_PROPOSAL_GEOMETRY" &&
    errorRecord.issues.some((issue) =>
      /ocrHandoff\.sourceArtifactRef: must be an absolute path/i.test(issue),
    )
  );
}

function deriveBenchmarkCoarseProposals(args: {
  observerResult: VisionObserverResult;
  derivative: ObserverDerivative;
}):
  | { ok: true; proposals: VisionRegionBenchmarkCoarseProposalRecord[] }
  | {
      ok: false;
      errorCode: string;
      errorStage: string;
    } {
  const proposals: VisionRegionBenchmarkCoarseProposalRecord[] = [];
  for (const candidate of args.observerResult.proposals) {
    const validated = validateObserverRegionProposal(candidate);
    if (!validated.ok) {
      return {
        ok: false,
        errorCode: "INVALID_OBSERVER_OUTPUT",
        errorStage: "proposal-validate",
      };
    }

    const gridGuard = guardObserverProposalGrid(validated.value, args.derivative.gridSpec);
    if (!gridGuard.ok) {
      return {
        ok: false,
        errorCode: "INVALID_OBSERVER_OUTPUT",
        errorStage: "proposal-validate",
      };
    }

    const mapped = mapProposalToOriginalRegion({
      gridRange: validated.value.gridRange,
      localRefinement: null,
      observationRotation: validated.value.observationRotation,
      sourceImageWidth: args.derivative.transform.sourceImageWidth,
      sourceImageHeight: args.derivative.transform.sourceImageHeight,
      gridSpec: args.derivative.gridSpec,
    });
    if (!mapped.ok) {
      return {
        ok: false,
        errorCode: "INVALID_PROPOSAL_GEOMETRY",
        errorStage: "geometry",
      };
    }

    proposals.push(toCoarseProposalRecord(validated.value, mapped.value.normalizedBox));
  }

  return { ok: true, proposals };
}

async function observeCoarseCase(args: {
  config: LocalVlmResolvedConfig;
  input: VisionRegionBenchmarkGenerationInput;
  repetition: number;
}): Promise<{
  stageRun: VisionRegionBenchmarkStageRun;
  coarseProposals: VisionRegionBenchmarkCoarseProposalRecord[];
}> {
  const adapter = new LlamaServerVisionObserverAdapter(args.config);
  const result = await runVisionObserverLifecycle({
    scenarioId: `vision-region:${args.input.caseId}:r${args.repetition}:coarse`,
    sourceArtifactRef: args.input.sourceArtifactRef,
    sourceBytes: args.input.sourceBytes,
    sourceMediaType: args.input.sourceMediaType,
    sourceWidth: args.input.sourceWidth,
    sourceHeight: args.input.sourceHeight,
    adapter,
    timeoutMs:
      args.config.startupTimeoutMs +
      args.config.requestTimeoutMs +
      args.config.terminationTimeoutMs +
      1_000,
  });

  const snapshot = adapter.getLastRunSnapshot();
  if (!snapshot) throw new Error("local VLM adapter did not capture a coarse benchmark snapshot");

  const derivedCoarseProposals =
    snapshot.observerResult && result.derivative
      ? deriveBenchmarkCoarseProposals({
          observerResult: snapshot.observerResult,
          derivative: result.derivative,
        })
      : null;
  const safeSourceArtifactBypass = isEvaluationSafeSourceArtifactError(result.errorRecord);
  const coarseProposals =
    derivedCoarseProposals?.ok && (result.errorRecord === null || safeSourceArtifactBypass)
      ? derivedCoarseProposals.proposals
      : [];
  const geometrySuccess =
    snapshot.validation.geometrySuccess &&
    derivedCoarseProposals !== null &&
    derivedCoarseProposals.ok &&
    (result.errorRecord === null || safeSourceArtifactBypass);
  const effectiveErrorCode =
    result.errorRecord === null || safeSourceArtifactBypass
      ? derivedCoarseProposals?.ok === false
        ? derivedCoarseProposals.errorCode
        : null
      : ((snapshot.errorRecord ?? result.errorRecord)?.code ??
        (typeof result.errorRecord?.code === "string" ? result.errorRecord.code : null));
  const effectiveErrorStage =
    result.errorRecord === null || safeSourceArtifactBypass
      ? derivedCoarseProposals?.ok === false
        ? derivedCoarseProposals.errorStage
        : null
      : ((snapshot.errorRecord ?? result.errorRecord)?.stage ??
        (typeof result.errorRecord?.stage === "string" ? result.errorRecord.stage : null));

  const stageRun = toStageRun({
    stage: "coarse",
    scenarioId: `vision-region:${args.input.caseId}:r${args.repetition}:coarse`,
    observationRunId: result.run.observationRunId,
    workspaceRef: result.workspaceDir,
    runtimeKind: args.config.runtimeKind,
    sourceArtifactRef: args.input.sourceArtifactRef,
    sourceImageSha256: snapshot.sourceImageSha256,
    overlaySha256: snapshot.overlaySha256,
    promptId: LOCAL_VLM_PROMPT_ID,
    promptVersion: LOCAL_VLM_PROMPT_VERSION,
    promptDigest: LOCAL_VLM_PROMPT_SHA256,
    runtimeVersion: snapshot.llamaVersionOutput,
    rawResponseDigest: snapshot.output.rawResponseDigest,
    structuredResponseDigest: snapshot.output.structuredResponseDigest,
    schemaValid: snapshot.output.schemaValid,
    prohibitedClaimDetected: snapshot.output.prohibitedClaimDetected,
    transportSuccess: snapshot.validation.transportSuccess,
    jsonExtractionSuccess: snapshot.validation.jsonExtractionSuccess,
    schemaSuccess: snapshot.validation.schemaSuccess,
    prohibitedLanguageSuccess: snapshot.validation.prohibitedLanguageSuccess,
    geometrySuccess,
    cleanupCompleted: result.run.cleanupCompleted,
    forcedTermination: snapshot.process.forcedTermination,
    errorCode: effectiveErrorCode,
    errorStage: effectiveErrorStage,
    process: {
      pid: snapshot.process.pid,
      processGroupId: snapshot.process.processGroupId,
      port: snapshot.process.port,
      spawnedAt: snapshot.process.spawnedAt,
      readyAt: snapshot.process.readyAt,
      requestStartedAt: snapshot.process.requestStartedAt,
      requestCompletedAt: snapshot.process.requestCompletedAt,
      terminationRequestedAt: snapshot.process.terminationRequestedAt,
      exitedAt: snapshot.process.exitedAt,
      portReleased: snapshot.process.portReleased,
      processTreeReleasedAfterTermination: snapshot.resources.processTreeReleasedAfterTermination,
      stdoutTruncated: snapshot.process.stdoutTruncated,
      stderrTruncated: snapshot.process.stderrTruncated,
    },
    resources: {
      workspacePeakBytes: snapshot.resources.workspacePeakBytes,
      workspaceBytesAfterCleanup: result.run.cleanupCompleted
        ? 0
        : snapshot.resources.workspaceBytesAfterCleanup,
      fileCountPeak: snapshot.resources.fileCountPeak,
      sampleCount: snapshot.resources.sampleCount,
      sampleFailureCount: snapshot.resources.sampleFailureCount,
      peakProcessRssBytes: snapshot.resources.peakProcessRssBytes,
      peakProcessTreeRssBytes: snapshot.resources.peakProcessTreeRssBytes,
    },
    timing: {
      startupMs: snapshot.timing.startupMs,
      requestMs: snapshot.timing.requestMs,
      parseMs: snapshot.timing.parseMs,
      terminationMs: snapshot.timing.terminationMs,
      totalWallMs: snapshot.timing.totalWallMs,
    },
  });

  return {
    stageRun,
    coarseProposals,
  };
}

async function runRefinementStage(args: {
  config: LocalVlmResolvedConfig;
  caseId: string;
  repetition: number;
  sourceBytes: Uint8Array;
  sourceMediaType: string;
  sourceWidth: number;
  sourceHeight: number;
  coarseProposal: VisionRegionBenchmarkCoarseProposalRecord;
  workspaceRoot?: string;
}): Promise<VisionRegionBenchmarkRefinementStage> {
  const workspaceRoot = args.workspaceRoot ?? tmpdir();
  const workspaceDir = await mkdtemp(join(workspaceRoot, "vision-region-refinement-"));
  const observationRunId = randomUUID();
  const scenarioId = `vision-region:${args.caseId}:r${args.repetition}:refine:${args.coarseProposal.proposalId}`;
  const sourceArtifactRef = `coarse-proposal:${args.caseId}:r${args.repetition}:${args.coarseProposal.proposalId}`;

  let cropNormalizedBox: NormalizedBox | null = null;
  let runtimeVersion: string | null = null;
  let rawResponseDigest: string | null = null;
  let structuredResponseDigest: string | null = null;
  let schemaValid = false;
  let prohibitedClaimDetected = false;
  let transportSuccess = false;
  let jsonExtractionSuccess = false;
  let schemaSuccess = false;
  let prohibitedLanguageSuccess = false;
  let geometrySuccess = false;
  let forcedTermination = false;
  let cleanupCompleted = false;
  let errorCode: string | null = null;
  let errorStage: string | null = null;
  let process = emptyProcess();
  let resources = emptyResources();
  let timing = emptyTiming();
  let proposal: VisionRegionBenchmarkRefinementProposalRecord | null = null;

  let lifecycleError: unknown = null;
  let derivative: VisionRegionRefinementDerivative | null = null;
  let owner: Awaited<ReturnType<typeof spawnOwnedLlamaServerProcess>> | null = null;

  try {
    const derivativeResult = await createVisionRegionRefinementDerivative({
      sourceBytes: args.sourceBytes,
      sourceMediaType: args.sourceMediaType,
      expectedSourceWidth: args.sourceWidth,
      expectedSourceHeight: args.sourceHeight,
      coarseGeometry: args.coarseProposal.coarseGeometry,
      workspaceDir,
    });
    if (!derivativeResult.ok) {
      errorCode = derivativeResult.error.code;
      errorStage = "derivative";
      lifecycleError = derivativeResult.error;
    } else {
      derivative = derivativeResult.value;
      cropNormalizedBox = derivative.cropNormalizedBox;

      const launchSpec = buildLlamaServerLaunchSpec(args.config, 0);
      owner = await spawnOwnedLlamaServerProcess({
        launchSpec,
        workspaceDir,
        host: args.config.host,
        stdoutBytesMax: args.config.stdoutBytesMax,
        stderrBytesMax: args.config.stderrBytesMax,
        resourceSampleIntervalMs: args.config.resourceSampleIntervalMs,
        terminationTimeoutMs: args.config.terminationTimeoutMs,
      });
      process = {
        ...process,
        port: owner.telemetry.port,
      };

      const signal = AbortSignal.timeout(
        args.config.startupTimeoutMs +
          args.config.requestTimeoutMs +
          args.config.terminationTimeoutMs +
          1_000,
      );
      const startedAt = performance.now();
      runtimeVersion = await readLlamaVersionOutput(args.config);

      let observeFailure: unknown = null;
      try {
        await waitForReadiness({
          config: args.config,
          port: owner.telemetry.port,
          signal,
          onAttempt: ({ ok, error }) => owner?.noteReadinessAttempt(ok, error, startedAt),
        });

        owner.markRequestStarted();
        const requestStartedAt = performance.now();
        const transport = await sendObservationRequest({
          config: args.config,
          port: owner.telemetry.port,
          input: {
            observationRunId,
            scenarioId,
            sourceArtifactRef,
            workspaceDir,
            overlayArtifactPath: derivative.overlayArtifactPath,
            overlayMediaType: derivative.mediaType,
            overlaySha256: derivative.overlaySha256,
            overlayWidth: derivative.width,
            overlayHeight: derivative.height,
            sourceImageSha256: derivative.sourceSha256,
          },
          signal,
          promptText: LOCAL_VLM_REFINEMENT_PROMPT_TEXT,
          instructionText: buildRefinementObservationInstruction(observationRunId),
        });
        owner.markRequestCompleted();
        const requestCompletedAt = performance.now();
        transportSuccess = true;

        const parseStartedAt = performance.now();
        const parsed = parseRefinementResponse({
          observationRunId,
          rawResponseText: transport.text,
          responseBytes: transport.bytes,
          config: args.config,
        });
        const parseCompletedAt = performance.now();
        jsonExtractionSuccess = parsed.ok || parsed.parseState.jsonExtractionSuccess;
        schemaSuccess = parsed.ok || parsed.parseState.schemaSuccess;
        prohibitedClaimDetected = parsed.ok ? false : parsed.parseState.prohibitedClaimDetected;
        prohibitedLanguageSuccess = !prohibitedClaimDetected;

        timing = {
          ...timing,
          requestMs: Math.max(0, requestCompletedAt - requestStartedAt),
          parseMs: Math.max(0, parseCompletedAt - parseStartedAt),
          totalWallMs: Math.max(0, performance.now() - startedAt),
        };

        if (!parsed.ok) {
          observeFailure = parsed.error;
          errorCode = parsed.error.code;
          errorStage = "proposal-validate";
        } else {
          rawResponseDigest = parsed.value.rawResponseDigest;
          structuredResponseDigest = parsed.value.structuredResponseDigest;
          schemaValid = parsed.value.schemaValid;
          prohibitedClaimDetected = parsed.value.prohibitedClaimDetected;
          geometrySuccess = true;
          const chosen = parsed.value.result.proposals[0] ?? null;
          if (chosen !== null) {
            const mapped = mapRefinementRangeToOriginalBox({
              cropNormalizedBox: derivative.cropNormalizedBox,
              refinementRange: chosen.gridRange,
            });
            if (!mapped.ok) {
              observeFailure = {
                code: "INVALID_OBSERVER_OUTPUT",
                message: mapped.error.message,
                issues: mapped.error.issues,
              } satisfies LocalVlmObservationFailureShape;
              errorCode = "INVALID_OBSERVER_OUTPUT";
              errorStage = "geometry";
              geometrySuccess = false;
              schemaValid = false;
            } else {
              proposal = {
                proposalId: chosen.proposalId,
                observationId: chosen.observationId,
                refinementGridRange: chosen.gridRange.notation,
                apparentOrientation: chosen.apparentOrientation,
                visibility: chosen.visibility,
                reasonCodes: chosen.reasonCodes,
                refinedGeometry: mapped.value,
              };
            }
          }
        }
      } catch (error) {
        const failure = localVlmFailureFromUnknown(error);
        if (failure.code === "READINESS_TIMEOUT") owner.markReadinessTimeout();
        observeFailure = error;
        errorCode = failure.code;
        errorStage = failure.code === "READINESS_TIMEOUT" ? "observe" : "proposal-validate";
      }

      let terminationFailure: unknown = null;
      try {
        await owner.terminate();
      } catch (error) {
        terminationFailure = error;
        const failure = localVlmFailureFromUnknown(error);
        errorCode = failure.code;
        errorStage = "observe";
      }

      const workspaceBytesAfterCleanup = await extractWorkspaceBytesAfterCleanup(workspaceDir);
      const finalized = await owner.finalizeResources(workspaceBytesAfterCleanup);
      forcedTermination = owner.telemetry.forcedTermination;
      process = {
        pid: owner.telemetry.pid,
        processGroupId: owner.telemetry.processGroupId,
        port: owner.telemetry.port,
        spawnedAt: owner.telemetry.spawnedAt,
        readyAt: owner.telemetry.readyAt,
        requestStartedAt: owner.telemetry.requestStartedAt,
        requestCompletedAt: owner.telemetry.requestCompletedAt,
        terminationRequestedAt: owner.telemetry.terminationRequestedAt,
        exitedAt: owner.telemetry.exitedAt,
        portReleased: owner.telemetry.portReleased,
        processTreeReleasedAfterTermination: finalized.processTreeReleasedAfterTermination,
        stdoutTruncated: owner.telemetry.stdoutTruncated,
        stderrTruncated: owner.telemetry.stderrTruncated,
      };
      resources = {
        workspacePeakBytes: finalized.workspacePeakBytes,
        workspaceBytesAfterCleanup,
        fileCountPeak: finalized.fileCountPeak,
        sampleCount: finalized.sampleCount,
        sampleFailureCount: finalized.sampleFailureCount,
        peakProcessRssBytes: finalized.peakProcessRssBytes,
        peakProcessTreeRssBytes: finalized.peakProcessTreeRssBytes,
      };
      timing = {
        startupMs: owner.telemetry.readiness.totalStartupLatencyMs,
        requestMs: timing.requestMs,
        parseMs: timing.parseMs,
        terminationMs:
          owner.telemetry.terminationRequestedAt && owner.telemetry.exitedAt
            ? Date.parse(owner.telemetry.exitedAt) -
              Date.parse(owner.telemetry.terminationRequestedAt)
            : null,
        totalWallMs: timing.totalWallMs ?? Math.max(0, performance.now() - startedAt),
      };
      lifecycleError = terminationFailure ?? observeFailure;
    }
  } catch (error) {
    lifecycleError = error;
    const failure = localVlmFailureFromUnknown(error);
    errorCode = failure.code;
    errorStage = errorStage ?? "observe";
  } finally {
    if (shouldSkipWorkspaceCleanup(lifecycleError)) {
      cleanupCompleted = false;
    } else {
      try {
        await rm(workspaceDir, { recursive: true, force: true });
        cleanupCompleted = true;
      } catch {
        cleanupCompleted = false;
      }
    }
  }

  if (cleanupCompleted) {
    resources = {
      ...resources,
      workspaceBytesAfterCleanup: 0,
    };
  }

  const stageRun = toStageRun({
    stage: "refinement",
    scenarioId,
    observationRunId,
    workspaceRef: workspaceDir,
    runtimeKind: args.config.runtimeKind,
    sourceArtifactRef,
    sourceImageSha256: derivative?.sourceSha256 ?? null,
    overlaySha256: derivative?.overlaySha256 ?? null,
    promptId: LOCAL_VLM_REFINEMENT_PROMPT_ID,
    promptVersion: LOCAL_VLM_REFINEMENT_PROMPT_VERSION,
    promptDigest: LOCAL_VLM_REFINEMENT_PROMPT_SHA256,
    runtimeVersion,
    rawResponseDigest,
    structuredResponseDigest,
    schemaValid,
    prohibitedClaimDetected,
    transportSuccess,
    jsonExtractionSuccess,
    schemaSuccess,
    prohibitedLanguageSuccess,
    geometrySuccess,
    cleanupCompleted,
    forcedTermination,
    errorCode,
    errorStage,
    process,
    resources,
    timing,
  });

  return {
    coarseProposalId: args.coarseProposal.proposalId,
    cropNormalizedBox,
    stageRun,
    proposal,
  };
}

export async function runVisionRegionBenchmarkGeneration(args: {
  config: LocalVlmResolvedConfig;
  inputs: readonly VisionRegionBenchmarkGenerationInput[];
  caseRepetitions: number;
  workspaceRoot?: string;
}): Promise<VisionRegionBenchmarkCaseRun[]> {
  const runs: VisionRegionBenchmarkCaseRun[] = [];
  for (let repetition = 1; repetition <= args.caseRepetitions; repetition += 1) {
    for (const input of args.inputs) {
      const coarse = await observeCoarseCase({
        config: args.config,
        input,
        repetition,
      });
      const refinementStages: VisionRegionBenchmarkRefinementStage[] = [];
      for (const coarseProposal of coarse.coarseProposals) {
        refinementStages.push(
          await runRefinementStage({
            config: args.config,
            caseId: input.caseId,
            repetition,
            sourceBytes: input.sourceBytes,
            sourceMediaType: input.sourceMediaType,
            sourceWidth: input.sourceWidth,
            sourceHeight: input.sourceHeight,
            coarseProposal,
            workspaceRoot: args.workspaceRoot,
          }),
        );
      }
      runs.push({
        caseId: input.caseId,
        repetition,
        coarseStage: coarse.stageRun,
        coarseProposals: coarse.coarseProposals,
        refinementStages,
      });
    }
  }
  return runs;
}
