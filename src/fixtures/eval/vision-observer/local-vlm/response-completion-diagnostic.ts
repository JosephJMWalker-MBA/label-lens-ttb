import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, mkdtemp, rm, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createObserverDerivative } from "../observer-grid-renderer";

import {
  buildVisionChatRequestBody,
  chatCompletionsUrl,
  waitForReadiness,
} from "./llama-server-client";
import { buildLlamaServerLaunchSpec, readLlamaVersionOutput } from "./llama-server-config";
import { localVlmFailureFromUnknown, spawnOwnedLlamaServerProcess } from "./llama-server-process";
import type {
  LocalVlmObservationFailureShape,
  LocalVlmResolvedConfig,
  LocalVlmResourceTelemetry,
} from "./local-vlm.types";
import {
  buildObservationInstruction,
  LOCAL_VLM_PROMPT_FRAMING_LINES,
  LOCAL_VLM_PROMPT_JSON_AND_ENUM_GUIDANCE_LINES,
  LOCAL_VLM_PROMPT_ID,
  LOCAL_VLM_PROMPT_SHA256,
  LOCAL_VLM_PROMPT_TEXT,
  LOCAL_VLM_PROMPT_VERSION,
} from "./observer-prompt";

export const RESPONSE_COMPLETION_DIAGNOSTIC_SCHEMA_VERSION =
  "local-vlm-response-completion-diagnostic.v1" as const;
export const RESPONSE_COMPLETION_DIAGNOSTIC_STATUSES = ["PASS", "FAIL", "BLOCKED"] as const;
export const RESPONSE_COMPLETION_DIAGNOSTIC_RUNGS = [
  "one-token",
  "one-short-sentence",
  "minimal-json",
  "empty-observer-envelope",
  "one-observation-without-coordinates",
  "one-observation-with-one-grid-region",
  "full-observer-schema",
] as const;

export type ResponseCompletionDiagnosticStatus =
  (typeof RESPONSE_COMPLETION_DIAGNOSTIC_STATUSES)[number];
export type ResponseCompletionDiagnosticRung =
  (typeof RESPONSE_COMPLETION_DIAGNOSTIC_RUNGS)[number];

export interface ResponseCompletionRungEvidence {
  requestStartedAt: string | null;
  firstResponseByteAt: string | null;
  firstResponseByteLatencyMs: number | null;
  transportCompletedAt: string | null;
  transportCompletionLatencyMs: number | null;
  responseCompletedSuccessfully: boolean;
  completionAt: string | null;
  completionLatencyMs: number | null;
  responseBytes: number;
  finishReason: string | null;
  timeoutStage: "request" | "response-body" | null;
  outputPreviewEscaped: string | null;
  cleanupCompleted: boolean;
  workspaceDir: string;
  process: {
    pid: number | null;
    port: number | null;
    exitedAt: string | null;
    exitCode: number | null;
    exitSignal: string | null;
    portReleased: boolean | null;
    forcedTermination: boolean;
    stdoutTruncated: boolean;
    stderrTruncated: boolean;
  } | null;
  resources: Pick<
    LocalVlmResourceTelemetry,
    | "workspacePeakBytes"
    | "workspaceBytesAfterCleanup"
    | "fileCountPeak"
    | "processTreeReleasedAfterTermination"
    | "sampleCount"
    | "sampleFailureCount"
  > | null;
}

export interface ResponseCompletionRungReport {
  rung: ResponseCompletionDiagnosticRung;
  status: ResponseCompletionDiagnosticStatus;
  summary: string;
  issues: readonly string[];
  blockedBy: ResponseCompletionDiagnosticRung | null;
  evidence: ResponseCompletionRungEvidence | null;
}

export interface ResponseCompletionDiagnosticReport {
  schemaVersion: typeof RESPONSE_COMPLETION_DIAGNOSTIC_SCHEMA_VERSION;
  generatedAt: string;
  gitCommit: string;
  runtime: {
    runtimeKind: LocalVlmResolvedConfig["runtimeKind"];
    executableDigest: string;
    runtimeVersion: string | null;
    modelDigest: string;
    projectorDigest: string | null;
    modelDisplayId: string;
    host: string;
    contextSize: number;
    maxOutputTokens: number;
    temperature: number;
    seed: number;
    requestTimeoutMs: number;
  };
  prompt: {
    promptId: typeof LOCAL_VLM_PROMPT_ID;
    promptVersion: typeof LOCAL_VLM_PROMPT_VERSION;
    promptDigest: typeof LOCAL_VLM_PROMPT_SHA256;
  };
  source: {
    scenarioId: string;
    sourceArtifactRef: string;
    sourceMediaType: string;
    sourceWidth: number;
    sourceHeight: number;
  };
  firstFailingRung: ResponseCompletionDiagnosticRung | null;
  rungs: readonly ResponseCompletionRungReport[];
}

export interface ResponseCompletionRequestSpec {
  rung: ResponseCompletionDiagnosticRung;
  promptText: string;
  instructionText: string;
  responseFormat: Record<string, unknown> | null;
}

interface CompletionTransportSuccess {
  ok: true;
  responseBytes: number;
  firstResponseByteAt: string | null;
  firstResponseByteLatencyMs: number | null;
  transportCompletedAt: string;
  transportCompletionLatencyMs: number;
  responseCompletedSuccessfully: true;
  completionAt: string;
  completionLatencyMs: number;
  finishReason: string | null;
  timeoutStage: null;
  outputPreviewEscaped: string | null;
}

interface CompletionTransportFailure {
  ok: false;
  failure: LocalVlmObservationFailureShape;
  responseBytes: number;
  firstResponseByteAt: string | null;
  firstResponseByteLatencyMs: number | null;
  transportCompletedAt: string | null;
  transportCompletionLatencyMs: number | null;
  responseCompletedSuccessfully: false;
  completionAt: string | null;
  completionLatencyMs: number | null;
  timeoutStage: "request" | "response-body" | null;
  finishReason: string | null;
  outputPreviewEscaped: string | null;
}

const COMPLETION_PREVIEW_CHARS = 240;
const JSON_OBJECT_RESPONSE_FORMAT = { type: "json_object" } as const;

function currentGitCommit(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
}

function promptText(lines: readonly string[]) {
  return lines.join("\n");
}

export function buildResponseCompletionRequestSpec(
  rung: ResponseCompletionDiagnosticRung,
  observationRunId: string,
): ResponseCompletionRequestSpec {
  switch (rung) {
    case "one-token":
      return {
        rung,
        promptText: promptText([
          ...LOCAL_VLM_PROMPT_FRAMING_LINES,
          "Return exactly one token: OK.",
        ]),
        instructionText: [
          `observationRunId: ${observationRunId}`,
          "If the requested response shape does not include observationRunId, ignore it.",
        ].join("\n"),
        responseFormat: null,
      };
    case "one-short-sentence":
      return {
        rung,
        promptText: promptText([
          ...LOCAL_VLM_PROMPT_FRAMING_LINES,
          "Return exactly one short sentence and nothing else.",
        ]),
        instructionText: [
          `observationRunId: ${observationRunId}`,
          "If the requested response shape does not include observationRunId, ignore it.",
        ].join("\n"),
        responseFormat: null,
      };
    case "minimal-json":
      return {
        rung,
        promptText: promptText([
          ...LOCAL_VLM_PROMPT_FRAMING_LINES,
          'Return exactly this JSON object and nothing else: {"ok":true}',
        ]),
        instructionText: [
          `observationRunId: ${observationRunId}`,
          "If the requested response shape does not include observationRunId, ignore it.",
        ].join("\n"),
        responseFormat: JSON_OBJECT_RESPONSE_FORMAT,
      };
    case "empty-observer-envelope":
      return {
        rung,
        promptText: promptText([
          ...LOCAL_VLM_PROMPT_FRAMING_LINES,
          "Return exactly this empty observer envelope and nothing else.",
          "Return only one JSON object and no prose outside JSON.",
          "Return this exact JSON shape:",
          "{",
          '  "observationRunId": "<provided-observation-run-id>",',
          '  "proposals": []',
          "}",
        ]),
        instructionText: buildObservationInstruction(observationRunId),
        responseFormat: JSON_OBJECT_RESPONSE_FORMAT,
      };
    case "one-observation-without-coordinates":
      return {
        rung,
        promptText: promptText([
          ...LOCAL_VLM_PROMPT_FRAMING_LINES,
          ...LOCAL_VLM_PROMPT_JSON_AND_ENUM_GUIDANCE_LINES,
          "Return exactly one observer proposal without any gridRange coordinates.",
          "Return this exact JSON shape:",
          "{",
          '  "observationRunId": "<provided-observation-run-id>",',
          '  "proposals": [',
          "    {",
          '      "observationId": "string",',
          '      "proposalId": "string",',
          '      "observationType": "text-like-region",',
          '      "source": "machine-observer",',
          '      "authority": "non-authoritative",',
          '      "purpose": "ocr-region-proposal",',
          '      "apparentOrientation": "horizontal",',
          '      "visibility": "full",',
          '      "reasonCodes": ["high_salience"],',
          '      "description": "generic text-like region description"',
          "    }",
          "  ]",
          "}",
        ]),
        instructionText: buildObservationInstruction(observationRunId),
        responseFormat: JSON_OBJECT_RESPONSE_FORMAT,
      };
    case "one-observation-with-one-grid-region":
      return {
        rung,
        promptText: promptText([
          ...LOCAL_VLM_PROMPT_FRAMING_LINES,
          ...LOCAL_VLM_PROMPT_JSON_AND_ENUM_GUIDANCE_LINES,
          "Return exactly one observer proposal with exactly one gridRange.",
          "Return this exact JSON shape:",
          "{",
          '  "observationRunId": "<provided-observation-run-id>",',
          '  "proposals": [',
          "    {",
          '      "observationId": "string",',
          '      "proposalId": "string",',
          '      "observationType": "text-like-region",',
          '      "source": "machine-observer",',
          '      "authority": "non-authoritative",',
          '      "purpose": "ocr-region-proposal",',
          '      "gridRange": {',
          '        "start": { "column": "A", "row": 1, "columnIndex": 0, "rowIndex": 0, "id": "A1" },',
          '        "end": { "column": "A", "row": 1, "columnIndex": 0, "rowIndex": 0, "id": "A1" },',
          '        "notation": "A1"',
          "      },",
          '      "localRefinement": null,',
          '      "observationRotation": 0,',
          '      "apparentOrientation": "horizontal",',
          '      "visibility": "full",',
          '      "reasonCodes": ["high_salience"],',
          '      "description": "generic text-like region description"',
          "    }",
          "  ]",
          "}",
        ]),
        instructionText: buildObservationInstruction(observationRunId),
        responseFormat: JSON_OBJECT_RESPONSE_FORMAT,
      };
    case "full-observer-schema":
      return {
        rung,
        promptText: LOCAL_VLM_PROMPT_TEXT,
        instructionText: buildObservationInstruction(observationRunId),
        responseFormat: JSON_OBJECT_RESPONSE_FORMAT,
      };
  }
}

function blockedRungReport(args: {
  rung: ResponseCompletionDiagnosticRung;
  blockedBy: ResponseCompletionDiagnosticRung;
}): ResponseCompletionRungReport {
  return {
    rung: args.rung,
    status: "BLOCKED",
    summary: "This rung was blocked because an earlier rung did not complete.",
    issues: [`upstream rung ${args.blockedBy} must pass before this rung can run`],
    blockedBy: args.blockedBy,
    evidence: null,
  };
}

function truncateForPreview(text: string): string {
  if (text.length <= COMPLETION_PREVIEW_CHARS) return text;
  return `${text.slice(0, COMPLETION_PREVIEW_CHARS)}...[truncated]`;
}

function escapedPreview(text: string | null): string | null {
  if (text === null) return null;
  return JSON.stringify(truncateForPreview(text));
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}

function invalidCompletionFailure(
  message: string,
  issues: readonly string[],
): LocalVlmObservationFailureShape {
  return {
    code: "INVALID_OBSERVER_OUTPUT",
    message,
    issues,
  };
}

function parseCompletedTransportEnvelope(args: { response: Response; rawText: string }):
  | {
      ok: true;
      finishReason: string | null;
      outputPreviewEscaped: string;
    }
  | {
      ok: false;
      failure: LocalVlmObservationFailureShape;
      finishReason: string | null;
      outputPreviewEscaped: string;
    } {
  if (!args.response.ok) {
    return {
      ok: false,
      failure: invalidCompletionFailure(
        "The transport completed, but the server returned a non-success HTTP status.",
        [`status=${args.response.status}`],
      ),
      finishReason: null,
      outputPreviewEscaped: escapedPreview(args.rawText) ?? JSON.stringify(""),
    };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(args.rawText);
  } catch (error) {
    return {
      ok: false,
      failure: invalidCompletionFailure("The llama-server transport payload was not valid JSON.", [
        error instanceof Error ? error.message : String(error),
      ]),
      finishReason: null,
      outputPreviewEscaped: escapedPreview(args.rawText) ?? JSON.stringify(""),
    };
  }

  const choice = (
    payload as { choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }> }
  )?.choices?.[0];
  const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : null;
  const rawContent = choice?.message?.content;
  if (typeof rawContent !== "string") {
    return {
      ok: false,
      failure: invalidCompletionFailure(
        "The llama-server transport payload did not include a string assistant message.",
        ["choices[0].message.content must be a string"],
      ),
      finishReason,
      outputPreviewEscaped: escapedPreview(args.rawText) ?? JSON.stringify(""),
    };
  }

  if (finishReason !== null && finishReason !== "stop") {
    return {
      ok: false,
      failure: invalidCompletionFailure(
        "The response transport completed, but the model did not finish successfully.",
        [`finishReason=${finishReason}`],
      ),
      finishReason,
      outputPreviewEscaped: escapedPreview(rawContent) ?? JSON.stringify(""),
    };
  }

  return {
    ok: true,
    finishReason,
    outputPreviewEscaped: escapedPreview(rawContent) ?? JSON.stringify(""),
  };
}

function timeoutFailure(args: {
  config: LocalVlmResolvedConfig;
  timeoutStage: "request" | "response-body";
  partialText: string | null;
}): LocalVlmObservationFailureShape & {
  timeoutStage: "request" | "response-body";
  partialText: string | null;
} {
  return {
    code: "REQUEST_TIMEOUT",
    message: "The local VLM request timed out or was aborted.",
    issues: [`timeoutMs=${args.config.requestTimeoutMs}`],
    timeoutStage: args.timeoutStage,
    partialText: args.partialText,
  };
}

function oversizedFailure(args: {
  config: LocalVlmResolvedConfig;
  bytes: number;
  partialText: string | null;
}): LocalVlmObservationFailureShape & {
  timeoutStage: null;
  partialText: string | null;
} {
  return {
    code: "RESPONSE_TOO_LARGE",
    message: "The local VLM transport payload exceeded the configured limit.",
    issues: [`responseBytes=${args.bytes}`, `limit=${args.config.responseBytesMax}`],
    timeoutStage: null,
    partialText: args.partialText,
  };
}

async function readTransportBody(args: {
  response: Response;
  config: LocalVlmResolvedConfig;
  requestSignal: AbortSignal;
  startedAt: number;
}): Promise<CompletionTransportSuccess | CompletionTransportFailure> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  let firstResponseByteAt: string | null = null;
  let firstResponseByteLatencyMs: number | null = null;

  if (args.response.body) {
    const reader = args.response.body.getReader();
    try {
      while (true) {
        let next: ReadableStreamReadResult<Uint8Array>;
        try {
          next = await reader.read();
        } catch (error) {
          if (args.requestSignal.aborted) {
            const partialText = Buffer.from(concatChunks(chunks, total)).toString("utf8");
            return {
              ok: false,
              failure: timeoutFailure({
                config: args.config,
                timeoutStage: "response-body",
                partialText,
              }),
              responseBytes: total,
              firstResponseByteAt,
              firstResponseByteLatencyMs,
              transportCompletedAt: null,
              transportCompletionLatencyMs: null,
              responseCompletedSuccessfully: false,
              completionAt: null,
              completionLatencyMs: null,
              timeoutStage: "response-body",
              finishReason: null,
              outputPreviewEscaped: escapedPreview(partialText),
            };
          }
          throw error;
        }

        if (next.done) break;
        if (firstResponseByteAt === null) {
          firstResponseByteAt = new Date().toISOString();
          firstResponseByteLatencyMs = Math.max(0, performance.now() - args.startedAt);
        }
        total += next.value.byteLength;
        if (total > args.config.responseBytesMax) {
          const partialChunks = [...chunks, next.value];
          const partialText = Buffer.from(concatChunks(partialChunks, total)).toString("utf8");
          return {
            ok: false,
            failure: oversizedFailure({
              config: args.config,
              bytes: total,
              partialText,
            }),
            responseBytes: total,
            firstResponseByteAt,
            firstResponseByteLatencyMs,
            transportCompletedAt: null,
            transportCompletionLatencyMs: null,
            responseCompletedSuccessfully: false,
            completionAt: null,
            completionLatencyMs: null,
            timeoutStage: null,
            finishReason: null,
            outputPreviewEscaped: escapedPreview(partialText),
          };
        }
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
  }

  const transportText = Buffer.from(concatChunks(chunks, total)).toString("utf8");
  const transportCompletedAt = new Date().toISOString();
  const transportCompletionLatencyMs = Math.max(0, performance.now() - args.startedAt);
  const completedTransport = parseCompletedTransportEnvelope({
    response: args.response,
    rawText: transportText,
  });
  if (!completedTransport.ok) {
    return {
      ok: false,
      failure: completedTransport.failure,
      responseBytes: total,
      firstResponseByteAt,
      firstResponseByteLatencyMs,
      transportCompletedAt,
      transportCompletionLatencyMs,
      responseCompletedSuccessfully: false,
      completionAt: null,
      completionLatencyMs: null,
      timeoutStage: null,
      finishReason: completedTransport.finishReason,
      outputPreviewEscaped: completedTransport.outputPreviewEscaped,
    };
  }

  return {
    ok: true,
    responseBytes: total,
    firstResponseByteAt,
    firstResponseByteLatencyMs,
    transportCompletedAt,
    transportCompletionLatencyMs,
    responseCompletedSuccessfully: true,
    completionAt: transportCompletedAt,
    completionLatencyMs: transportCompletionLatencyMs,
    finishReason: completedTransport.finishReason,
    timeoutStage: null,
    outputPreviewEscaped: completedTransport.outputPreviewEscaped,
  };
}

async function sendCompletionDiagnosticRequest(args: {
  config: LocalVlmResolvedConfig;
  port: number;
  signal: AbortSignal;
  overlayArtifactPath: string;
  overlayMediaType: string;
  promptText: string;
  instructionText: string;
  responseFormat: Record<string, unknown> | null;
}): Promise<CompletionTransportSuccess | CompletionTransportFailure> {
  const overlayBytes = await readFile(args.overlayArtifactPath);
  if (overlayBytes.byteLength > args.config.maxImageBytes) {
    return {
      ok: false,
      failure: {
        code: "INVALID_OBSERVER_OUTPUT",
        message: "Overlay image exceeds the configured input-byte budget.",
        issues: [`overlayBytes=${overlayBytes.byteLength}`, `limit=${args.config.maxImageBytes}`],
      },
      responseBytes: 0,
      firstResponseByteAt: null,
      firstResponseByteLatencyMs: null,
      transportCompletedAt: null,
      transportCompletionLatencyMs: null,
      responseCompletedSuccessfully: false,
      completionAt: null,
      completionLatencyMs: null,
      timeoutStage: null,
      finishReason: null,
      outputPreviewEscaped: null,
    };
  }

  const requestSignal = AbortSignal.any([
    args.signal,
    AbortSignal.timeout(args.config.requestTimeoutMs),
  ]);
  const startedAt = performance.now();

  let response: Response;
  try {
    response = await fetch(chatCompletionsUrl(args.config, args.port), {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: requestSignal,
      body: JSON.stringify(
        buildVisionChatRequestBody({
          config: args.config,
          overlayDataUrl: `data:${args.overlayMediaType};base64,${overlayBytes.toString("base64")}`,
          systemPrompt: args.promptText,
          userInstruction: args.instructionText,
          responseFormat: args.responseFormat ?? undefined,
        }),
      ),
    });
  } catch (error) {
    if (requestSignal.aborted) {
      return {
        ok: false,
        failure: timeoutFailure({
          config: args.config,
          timeoutStage: "request",
          partialText: null,
        }),
        responseBytes: 0,
        firstResponseByteAt: null,
        firstResponseByteLatencyMs: null,
        transportCompletedAt: null,
        transportCompletionLatencyMs: null,
        responseCompletedSuccessfully: false,
        completionAt: null,
        completionLatencyMs: null,
        timeoutStage: "request",
        finishReason: null,
        outputPreviewEscaped: null,
      };
    }
    throw error;
  }

  return await readTransportBody({
    response,
    config: args.config,
    requestSignal,
    startedAt,
  });
}

function evidenceFromRun(args: {
  workspaceDir: string;
  cleanupCompleted: boolean;
  owner: {
    telemetry: {
      pid: number | null;
      port: number;
      exitedAt: string | null;
      exitCode: number | null;
      exitSignal: string | null;
      portReleased: boolean | null;
      forcedTermination: boolean;
      stdoutTruncated: boolean;
      stderrTruncated: boolean;
      requestStartedAt: string | null;
    };
  } | null;
  resources: LocalVlmResourceTelemetry | null;
  outcome: CompletionTransportSuccess | CompletionTransportFailure | null;
}): ResponseCompletionRungEvidence {
  return {
    requestStartedAt: args.owner?.telemetry.requestStartedAt ?? null,
    firstResponseByteAt: args.outcome?.firstResponseByteAt ?? null,
    firstResponseByteLatencyMs: args.outcome?.firstResponseByteLatencyMs ?? null,
    transportCompletedAt: args.outcome?.transportCompletedAt ?? null,
    transportCompletionLatencyMs: args.outcome?.transportCompletionLatencyMs ?? null,
    responseCompletedSuccessfully: args.outcome?.responseCompletedSuccessfully ?? false,
    completionAt: args.outcome?.ok ? args.outcome.completionAt : null,
    completionLatencyMs: args.outcome?.ok ? args.outcome.completionLatencyMs : null,
    responseBytes: args.outcome?.responseBytes ?? 0,
    finishReason: args.outcome?.finishReason ?? null,
    timeoutStage: args.outcome?.timeoutStage ?? null,
    outputPreviewEscaped: args.outcome?.outputPreviewEscaped ?? null,
    cleanupCompleted: args.cleanupCompleted,
    workspaceDir: args.workspaceDir,
    process:
      args.owner === null
        ? null
        : {
            pid: args.owner.telemetry.pid,
            port: args.owner.telemetry.port,
            exitedAt: args.owner.telemetry.exitedAt,
            exitCode: args.owner.telemetry.exitCode,
            exitSignal: args.owner.telemetry.exitSignal,
            portReleased: args.owner.telemetry.portReleased,
            forcedTermination: args.owner.telemetry.forcedTermination,
            stdoutTruncated: args.owner.telemetry.stdoutTruncated,
            stderrTruncated: args.owner.telemetry.stderrTruncated,
          },
    resources:
      args.resources === null
        ? null
        : {
            workspacePeakBytes: args.resources.workspacePeakBytes,
            workspaceBytesAfterCleanup: args.resources.workspaceBytesAfterCleanup,
            fileCountPeak: args.resources.fileCountPeak,
            processTreeReleasedAfterTermination: args.resources.processTreeReleasedAfterTermination,
            sampleCount: args.resources.sampleCount,
            sampleFailureCount: args.resources.sampleFailureCount,
          },
  };
}

async function runOneCompletionRung(args: {
  config: LocalVlmResolvedConfig;
  rung: ResponseCompletionDiagnosticRung;
  observationRunId: string;
  scenarioId: string;
  sourceArtifactRef: string;
  sourceBytes: Uint8Array;
  sourceMediaType: string;
  sourceWidth: number;
  sourceHeight: number;
}): Promise<ResponseCompletionRungReport> {
  const workspaceDir = await mkdtemp(join(tmpdir(), `local-vlm-completion-${args.rung}-`));
  const spec = buildResponseCompletionRequestSpec(args.rung, args.observationRunId);
  let owner: Awaited<ReturnType<typeof spawnOwnedLlamaServerProcess>> | null = null;
  let cleanupCompleted = false;
  let resources: LocalVlmResourceTelemetry | null = null;
  let outcome: CompletionTransportSuccess | CompletionTransportFailure | null = null;
  let summary = "Response completion rung failed before the request completed.";
  let issues: string[] = [];

  try {
    const derivative = await createObserverDerivative({
      sourceBytes: args.sourceBytes,
      sourceMediaType: args.sourceMediaType,
      expectedSourceWidth: args.sourceWidth,
      expectedSourceHeight: args.sourceHeight,
      workspaceDir,
    });
    if (!derivative.ok) {
      issues = [derivative.error.message, ...derivative.error.issues];
    } else {
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

      const startedAt = performance.now();
      await waitForReadiness({
        config: args.config,
        port: owner.telemetry.port,
        signal: AbortSignal.timeout(args.config.startupTimeoutMs),
        onAttempt: ({ ok, error }) => owner?.noteReadinessAttempt(ok, error, startedAt),
      });

      owner.markRequestStarted();
      outcome = await sendCompletionDiagnosticRequest({
        config: args.config,
        port: owner.telemetry.port,
        signal: new AbortController().signal,
        overlayArtifactPath: derivative.value.overlayArtifactPath,
        overlayMediaType: derivative.value.mediaType,
        promptText: spec.promptText,
        instructionText: spec.instructionText,
        responseFormat: spec.responseFormat,
      });

      if (outcome.transportCompletedAt !== null) {
        owner.markRequestCompleted();
      }

      if (outcome.ok) {
        summary = "The rung completed within the configured timeout and byte budget.";
      } else {
        const failure = localVlmFailureFromUnknown(outcome.failure);
        issues = [failure.message, ...failure.issues];
        summary =
          failure.code === "REQUEST_TIMEOUT"
            ? "The rung did not complete before the configured timeout."
            : outcome.transportCompletedAt !== null
              ? "The transport completed, but the response did not complete successfully."
              : "The rung did not complete within the configured completion bounds.";
      }
    }
  } catch (error) {
    const failure = localVlmFailureFromUnknown(error);
    issues = [failure.message, ...failure.issues];
  } finally {
    let terminationFailure: unknown = null;
    if (owner !== null) {
      try {
        await owner.terminate();
      } catch (error) {
        terminationFailure = error;
        const failure = localVlmFailureFromUnknown(error);
        issues = issues.length > 0 ? issues : [failure.message, ...failure.issues];
      }
    }

    if (terminationFailure === null) {
      await rm(workspaceDir, { recursive: true, force: true });
      cleanupCompleted = true;
    }

    if (owner !== null) {
      resources = await owner.finalizeResources(cleanupCompleted ? 0 : 1);
    }
  }

  return {
    rung: args.rung,
    status: outcome?.ok ? "PASS" : "FAIL",
    summary,
    issues,
    blockedBy: null,
    evidence: evidenceFromRun({
      workspaceDir,
      cleanupCompleted,
      owner,
      resources,
      outcome,
    }),
  };
}

export async function runResponseCompletionDiagnosticSequence(args: {
  runRung: (rung: ResponseCompletionDiagnosticRung) => Promise<ResponseCompletionRungReport>;
}): Promise<readonly ResponseCompletionRungReport[]> {
  const reports: ResponseCompletionRungReport[] = [];
  let blockedBy: ResponseCompletionDiagnosticRung | null = null;

  for (const rung of RESPONSE_COMPLETION_DIAGNOSTIC_RUNGS) {
    if (blockedBy !== null) {
      reports.push(blockedRungReport({ rung, blockedBy }));
      continue;
    }

    const report = await args.runRung(rung);
    reports.push(report);
    if (report.status === "FAIL") blockedBy = rung;
  }

  return reports;
}

export async function runLocalVlmResponseCompletionDiagnostic(args: {
  config: LocalVlmResolvedConfig;
  scenarioId: string;
  sourceArtifactRef: string;
  sourceBytes: Uint8Array;
  sourceMediaType: string;
  sourceWidth: number;
  sourceHeight: number;
}): Promise<ResponseCompletionDiagnosticReport> {
  const observationRunId = randomUUID();
  const runtimeVersion = await readLlamaVersionOutput(args.config);
  const rungs = await runResponseCompletionDiagnosticSequence({
    runRung: async (rung) =>
      await runOneCompletionRung({
        config: args.config,
        rung,
        observationRunId,
        scenarioId: args.scenarioId,
        sourceArtifactRef: args.sourceArtifactRef,
        sourceBytes: args.sourceBytes,
        sourceMediaType: args.sourceMediaType,
        sourceWidth: args.sourceWidth,
        sourceHeight: args.sourceHeight,
      }),
  });
  const firstFailingRung = rungs.find((rung) => rung.status === "FAIL")?.rung ?? null;

  return {
    schemaVersion: RESPONSE_COMPLETION_DIAGNOSTIC_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    gitCommit: currentGitCommit(),
    runtime: {
      runtimeKind: args.config.runtimeKind,
      executableDigest: args.config.llamaExecutableSha256,
      runtimeVersion,
      modelDigest: args.config.modelSha256,
      projectorDigest: args.config.mmprojSha256,
      modelDisplayId: args.config.modelDisplayId,
      host: args.config.host,
      contextSize: args.config.contextSize,
      maxOutputTokens: args.config.maxOutputTokens,
      temperature: args.config.temperature,
      seed: args.config.seed,
      requestTimeoutMs: args.config.requestTimeoutMs,
    },
    prompt: {
      promptId: LOCAL_VLM_PROMPT_ID,
      promptVersion: LOCAL_VLM_PROMPT_VERSION,
      promptDigest: LOCAL_VLM_PROMPT_SHA256,
    },
    source: {
      scenarioId: args.scenarioId,
      sourceArtifactRef: args.sourceArtifactRef,
      sourceMediaType: args.sourceMediaType,
      sourceWidth: args.sourceWidth,
      sourceHeight: args.sourceHeight,
    },
    firstFailingRung,
    rungs,
  };
}

export async function writeResponseCompletionDiagnosticFiles(args: {
  report: ResponseCompletionDiagnosticReport;
  outputDir: string;
  stem: string;
}): Promise<{ jsonPath: string; markdownPath: string }> {
  await mkdir(args.outputDir, { recursive: true });
  const jsonPath = join(args.outputDir, `${args.stem}.json`);
  const markdownPath = join(args.outputDir, `${args.stem}.md`);
  const markdown = [
    `# ${args.stem}`,
    "",
    `- Schema version: \`${args.report.schemaVersion}\``,
    `- Git commit: \`${args.report.gitCommit}\``,
    `- Runtime kind: \`${args.report.runtime.runtimeKind}\``,
    `- First failing rung: ${args.report.firstFailingRung ?? "none"}`,
    "",
    "## Rungs",
    "",
    ...args.report.rungs.map((rung) => {
      const preview = rung.evidence?.outputPreviewEscaped ?? "null";
      const finishReason = rung.evidence?.finishReason ?? "null";
      return `- ${rung.rung}: ${rung.status}; responseCompletedSuccessfully=${String(rung.evidence?.responseCompletedSuccessfully ?? false)}; finishReason=${finishReason}; timeoutStage=${rung.evidence?.timeoutStage ?? "null"}; responseBytes=${rung.evidence?.responseBytes ?? 0}; preview=${preview}`;
    }),
  ].join("\n");
  await writeFile(jsonPath, `${JSON.stringify(args.report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, `${markdown}\n`, "utf8");
  return { jsonPath, markdownPath };
}
