import { execFileSync } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
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
import { buildResponseCompletionRequestSpec } from "./response-completion-diagnostic";
import { buildSingleProposalDecompositionRequestSpec } from "./single-proposal-decomposition-diagnostic";

export const REQUEST_PARITY_REPRODUCIBILITY_DIAGNOSTIC_SCHEMA_VERSION =
  "local-vlm-request-parity-reproducibility-diagnostic.v2" as const;
export const REQUEST_PARITY_REPRODUCIBILITY_TRIAL_STATUSES = ["PASS", "FAIL", "BLOCKED"] as const;
export const REQUEST_PARITY_REPRODUCIBILITY_CONTRACTS = ["A", "B", "C"] as const;
export const REQUEST_PARITY_REPRODUCIBILITY_SEQUENCE = ["A", "B", "A", "C", "B"] as const;
export const REQUEST_PARITY_REPRODUCIBILITY_REPETITIONS = 3 as const;

const FINGERPRINT_OBSERVATION_RUN_ID_PLACEHOLDER = "<normalized-observation-run-id>";
const REQUEST_PARITY_PREVIEW_CHARS = 240;
const REQUEST_PARITY_FINGERPRINT_FIELDS = [
  "systemPromptDigest",
  "userInstructionDigest",
  "responseFormatDigest",
  "requestBodyDigest",
  "requestBodyShapeDigest",
  "overlayImageDigest",
  "overlayImageMediaType",
  "model",
  "seed",
  "temperature",
  "tokenLimit",
] as const;

export type RequestParityReproducibilityTrialStatus =
  (typeof REQUEST_PARITY_REPRODUCIBILITY_TRIAL_STATUSES)[number];
export type RequestParityReproducibilityContract =
  (typeof REQUEST_PARITY_REPRODUCIBILITY_CONTRACTS)[number];
type RequestParityFingerprintField = (typeof REQUEST_PARITY_FINGERPRINT_FIELDS)[number];

export interface RequestParitySpec {
  contract: RequestParityReproducibilityContract;
  sourceBuilder:
    | "phase4-one-observation-without-coordinates"
    | "phase6-description"
    | "phase6-guidance-load-control";
  promptText: string;
  instructionText: string;
  responseFormat: Record<string, unknown> | null;
}

export interface RequestParityFingerprintSnapshot {
  contract: RequestParityReproducibilityContract;
  sourceBuilder: RequestParitySpec["sourceBuilder"];
  systemPromptDigest: string;
  userInstructionDigest: string;
  responseFormatDigest: string;
  requestBodyDigest: string;
  requestBodyShapeDigest: string;
  overlayImageDigest: string;
  overlayImageMediaType: string;
  model: string;
  seed: string;
  temperature: string;
  tokenLimit: string;
}

export interface RequestParityCanonicalFingerprint {
  contract: RequestParityFingerprintSnapshot["contract"];
  sourceBuilder: RequestParityFingerprintSnapshot["sourceBuilder"];
  systemPromptDigest: RequestParityFingerprintSnapshot["systemPromptDigest"];
  userInstructionDigest: RequestParityFingerprintSnapshot["userInstructionDigest"];
  responseFormatDigest: RequestParityFingerprintSnapshot["responseFormatDigest"];
  requestBodyDigest: RequestParityFingerprintSnapshot["requestBodyDigest"];
  requestBodyShapeDigest: RequestParityFingerprintSnapshot["requestBodyShapeDigest"];
  overlayImageDigest: RequestParityFingerprintSnapshot["overlayImageDigest"];
  overlayImageMediaType: RequestParityFingerprintSnapshot["overlayImageMediaType"];
  model: RequestParityFingerprintSnapshot["model"];
  seed: RequestParityFingerprintSnapshot["seed"];
  temperature: RequestParityFingerprintSnapshot["temperature"];
  tokenLimit: RequestParityFingerprintSnapshot["tokenLimit"];
  normalizedSystemPromptText: string;
  normalizedUserInstructionText: string;
  normalizedResponseFormatJson: string;
  normalizedRedactedRequestBodyJson: string;
  normalizedRequestBodyShapeJson: string;
}

export interface RequestParityPairwiseDifference {
  left: RequestParityReproducibilityContract;
  right: RequestParityReproducibilityContract;
  sameSystemPromptDigest: boolean;
  sameUserInstructionDigest: boolean;
  sameResponseFormatDigest: boolean;
  sameRequestBodyDigest: boolean;
  sameRequestBodyShapeDigest: boolean;
  sameOverlayImageDigest: boolean;
  differingComponents: readonly string[];
  systemPromptDiff: {
    leftOnlyLines: readonly string[];
    rightOnlyLines: readonly string[];
  };
  userInstructionDiff: {
    leftOnlyLines: readonly string[];
    rightOnlyLines: readonly string[];
  };
  responseFormatDiff: {
    leftOnlyLines: readonly string[];
    rightOnlyLines: readonly string[];
  };
  requestBodyDiff: {
    leftOnlyLines: readonly string[];
    rightOnlyLines: readonly string[];
  };
}

export interface RequestParityTrialEvidence {
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

export interface RequestParityTrialReport {
  sequenceNumber: number;
  repetitionNumber: number;
  sequencePosition: number;
  contract: RequestParityReproducibilityContract;
  sourceBuilder: RequestParitySpec["sourceBuilder"];
  requestFingerprint: {
    expected: RequestParityFingerprintSnapshot;
    measured: RequestParityFingerprintSnapshot | null;
    matchedFields: readonly RequestParityFingerprintField[];
    mismatchedFields: readonly RequestParityFingerprintField[];
    allFieldsMatched: boolean;
  };
  status: RequestParityReproducibilityTrialStatus;
  summary: string;
  issues: readonly string[];
  blockedBySequenceNumber: number | null;
  evidence: RequestParityTrialEvidence | null;
}

export interface RequestParityContractFinding {
  contract: RequestParityReproducibilityContract;
  expectedAppearances: number;
  executedAppearances: number;
  passCount: number;
  failCount: number;
  blockedCount: number;
  fingerprintVerifiedCount: number;
  fingerprintMismatchCount: number;
  completeEvidence: boolean;
  outcome:
    | "ALL_PASS"
    | "DETERMINISTIC_FAILURE"
    | "INTERMITTENT_FAILURE"
    | "ORDER_OR_STATE_EFFECT"
    | "INSUFFICIENT_EVIDENCE";
  sequencePositions: readonly number[];
  notes: readonly string[];
}

export interface RequestParityDifferenceFinding {
  left: RequestParityReproducibilityContract;
  right: RequestParityReproducibilityContract;
  outcome: "REQUEST_DIFFERENCE_EFFECT" | "NO_EFFECT" | "INSUFFICIENT_EVIDENCE";
  notes: readonly string[];
}

export interface RequestParityClassification {
  overall:
    | "DETERMINISTIC_CONTRACT_FAILURE"
    | "INTERMITTENT_FAILURE"
    | "REQUEST_DIFFERENCE_EFFECT"
    | "ORDER_OR_STATE_EFFECT"
    | "INSUFFICIENT_EVIDENCE";
  contractFindings: readonly RequestParityContractFinding[];
  requestDifferenceFindings: readonly RequestParityDifferenceFinding[];
}

export interface RequestParityReproducibilityDiagnosticReport {
  schemaVersion: typeof REQUEST_PARITY_REPRODUCIBILITY_DIAGNOSTIC_SCHEMA_VERSION;
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
  source: {
    scenarioId: string;
    sourceArtifactRef: string;
    sourceMediaType: string;
    sourceWidth: number;
    sourceHeight: number;
  };
  schedule: {
    sequence: readonly RequestParityReproducibilityContract[];
    repetitions: number;
    totalTrials: number;
  };
  requestFingerprints: readonly RequestParityCanonicalFingerprint[];
  pairwiseDifferences: readonly RequestParityPairwiseDifference[];
  trials: readonly RequestParityTrialReport[];
  classification: RequestParityClassification;
  fatalStopReason: string | null;
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

interface ScheduledTrial {
  sequenceNumber: number;
  repetitionNumber: number;
  sequencePosition: number;
  contract: RequestParityReproducibilityContract;
}

export interface RequestParityPreparedTrialRequest {
  observationRunId: string;
  spec: RequestParitySpec;
  requestBody: ReturnType<typeof buildVisionChatRequestBody>;
}

function currentGitCommit(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
}

function sha256Hex(bytes: Uint8Array | Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function replaceRunIdInText(text: string, observationRunId: string): string {
  return text.split(observationRunId).join(FINGERPRINT_OBSERVATION_RUN_ID_PLACEHOLDER);
}

function normalizeRunIdDeep(value: unknown, observationRunId: string): unknown {
  if (typeof value === "string") {
    return replaceRunIdInText(value, observationRunId);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeRunIdDeep(entry, observationRunId));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        normalizeRunIdDeep(entry, observationRunId),
      ]),
    );
  }
  return value;
}

function redactOverlayDataUrlsDeep(value: unknown, overlayDigest: string): unknown {
  if (typeof value === "string" && value.startsWith("data:")) {
    return `<overlay:${overlayDigest}>`;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => redactOverlayDataUrlsDeep(entry, overlayDigest));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        redactOverlayDataUrlsDeep(entry, overlayDigest),
      ]),
    );
  }
  return value;
}

function stableJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJsonStringify(entry)).join(",")}]`;
  }
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries
    .map(([key, entry]) => `${JSON.stringify(key)}:${stableJsonStringify(entry)}`)
    .join(",")}}`;
}

function jsonShape(value: unknown): unknown {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map((entry) => jsonShape(entry));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, jsonShape(entry)]),
    );
  }
  return typeof value;
}

function uniqueLineDiff(left: string, right: string) {
  const leftLines = left.split("\n");
  const rightLines = right.split("\n");
  const rightSet = new Set(rightLines);
  const leftSet = new Set(leftLines);
  return {
    leftOnlyLines: leftLines.filter(
      (line, index) => !rightSet.has(line) && leftLines.indexOf(line) === index,
    ),
    rightOnlyLines: rightLines.filter(
      (line, index) => !leftSet.has(line) && rightLines.indexOf(line) === index,
    ),
  };
}

function buildRequestParitySpec(
  contract: RequestParityReproducibilityContract,
  observationRunId: string,
): RequestParitySpec {
  switch (contract) {
    case "A": {
      const spec = buildResponseCompletionRequestSpec(
        "one-observation-without-coordinates",
        observationRunId,
      );
      return {
        contract,
        sourceBuilder: "phase4-one-observation-without-coordinates",
        promptText: spec.promptText,
        instructionText: spec.instructionText,
        responseFormat: spec.responseFormat,
      };
    }
    case "B": {
      const spec = buildSingleProposalDecompositionRequestSpec("description", observationRunId);
      return {
        contract,
        sourceBuilder: "phase6-description",
        promptText: spec.promptText,
        instructionText: spec.instructionText,
        responseFormat: spec.responseFormat,
      };
    }
    case "C": {
      const spec = buildSingleProposalDecompositionRequestSpec(
        "guidance-load-control",
        observationRunId,
      );
      return {
        contract,
        sourceBuilder: "phase6-guidance-load-control",
        promptText: spec.promptText,
        instructionText: spec.instructionText,
        responseFormat: spec.responseFormat,
      };
    }
  }
}

function buildRequestParityRequestBody(args: {
  config: LocalVlmResolvedConfig;
  overlayBytes: Uint8Array;
  overlayMediaType: string;
  spec: RequestParitySpec;
}) {
  return buildVisionChatRequestBody({
    config: args.config,
    overlayDataUrl: `data:${args.overlayMediaType};base64,${Buffer.from(args.overlayBytes).toString("base64")}`,
    systemPrompt: args.spec.promptText,
    userInstruction: args.spec.instructionText,
    responseFormat: args.spec.responseFormat ?? undefined,
  });
}

function requestBodySystemPrompt(requestBody: Record<string, unknown>): string {
  const messages = requestBody.messages;
  if (!Array.isArray(messages)) return "<missing-system-prompt>";
  const systemContent = (messages[0] as { content?: unknown } | undefined)?.content;
  return typeof systemContent === "string" ? systemContent : "<missing-system-prompt>";
}

function requestBodyUserInstruction(requestBody: Record<string, unknown>): string {
  const messages = requestBody.messages;
  if (!Array.isArray(messages)) return "<missing-user-instruction>";
  const content = (messages[1] as { content?: unknown } | undefined)?.content;
  if (!Array.isArray(content)) return "<missing-user-instruction>";
  const textPart = content.find(
    (part) =>
      typeof (part as { type?: unknown })?.type === "string" &&
      (part as { type?: string }).type === "text",
  ) as { text?: unknown } | undefined;
  return typeof textPart?.text === "string" ? textPart.text : "<missing-user-instruction>";
}

function requestBodyOverlayDataUrl(requestBody: Record<string, unknown>): string | null {
  const messages = requestBody.messages;
  if (!Array.isArray(messages)) return null;
  const content = (messages[1] as { content?: unknown } | undefined)?.content;
  if (!Array.isArray(content)) return null;
  const imagePart = content.find(
    (part) =>
      typeof (part as { type?: unknown })?.type === "string" &&
      (part as { type?: string }).type === "image_url",
  ) as { image_url?: { url?: unknown } } | undefined;
  return typeof imagePart?.image_url?.url === "string" ? imagePart.image_url.url : null;
}

function parsedOverlayFromRequestBody(requestBody: Record<string, unknown>): {
  mediaType: string;
  digest: string;
} {
  const dataUrl = requestBodyOverlayDataUrl(requestBody);
  if (typeof dataUrl !== "string") {
    return {
      mediaType: "<missing-overlay-image>",
      digest: sha256Hex("<missing-overlay-image>"),
    };
  }
  const match = /^data:([^;,]+);base64,([\s\S]+)$/u.exec(dataUrl);
  if (!match) {
    return {
      mediaType: "<invalid-overlay-image>",
      digest: sha256Hex(dataUrl),
    };
  }
  return {
    mediaType: match[1] ?? "<invalid-overlay-image>",
    digest: sha256Hex(Buffer.from(match[2] ?? "", "base64")),
  };
}

function requestBodyResponseFormat(requestBody: Record<string, unknown>): unknown {
  return "response_format" in requestBody ? requestBody.response_format : null;
}

function stringifyRequestField(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function buildRequestParityFingerprintComputation(args: {
  observationRunId: string;
  contract: RequestParityReproducibilityContract;
  sourceBuilder: RequestParitySpec["sourceBuilder"];
  requestBody: ReturnType<typeof buildVisionChatRequestBody>;
}): {
  snapshot: RequestParityFingerprintSnapshot;
  normalizedSystemPromptText: string;
  normalizedUserInstructionText: string;
  normalizedResponseFormatJson: string;
  normalizedRedactedRequestBodyJson: string;
  normalizedRequestBodyShapeJson: string;
} {
  const overlay = parsedOverlayFromRequestBody(args.requestBody);
  const normalizedPromptText = replaceRunIdInText(
    requestBodySystemPrompt(args.requestBody),
    args.observationRunId,
  );
  const normalizedInstructionText = replaceRunIdInText(
    requestBodyUserInstruction(args.requestBody),
    args.observationRunId,
  );
  const normalizedResponseFormatJson = stableJsonStringify(
    requestBodyResponseFormat(args.requestBody),
  );
  const normalizedRequestBody = normalizeRunIdDeep(args.requestBody, args.observationRunId);
  const normalizedRequestBodyJson = stableJsonStringify(normalizedRequestBody);
  const normalizedRedactedRequestBodyJson = stableJsonStringify(
    redactOverlayDataUrlsDeep(normalizedRequestBody, overlay.digest),
  );
  const normalizedRequestBodyShapeJson = stableJsonStringify(jsonShape(normalizedRequestBody));

  return {
    snapshot: {
      contract: args.contract,
      sourceBuilder: args.sourceBuilder,
      systemPromptDigest: sha256Hex(normalizedPromptText),
      userInstructionDigest: sha256Hex(normalizedInstructionText),
      responseFormatDigest: sha256Hex(normalizedResponseFormatJson),
      requestBodyDigest: sha256Hex(normalizedRequestBodyJson),
      requestBodyShapeDigest: sha256Hex(normalizedRequestBodyShapeJson),
      overlayImageDigest: overlay.digest,
      overlayImageMediaType: overlay.mediaType,
      model: stringifyRequestField(args.requestBody.model, "<missing-model>"),
      seed: stringifyRequestField(args.requestBody.seed, "<missing-seed>"),
      temperature: stringifyRequestField(args.requestBody.temperature, "<missing-temperature>"),
      tokenLimit: stringifyRequestField(args.requestBody.max_tokens, "<missing-max-tokens>"),
    },
    normalizedSystemPromptText: normalizedPromptText,
    normalizedUserInstructionText: normalizedInstructionText,
    normalizedResponseFormatJson,
    normalizedRedactedRequestBodyJson,
    normalizedRequestBodyShapeJson,
  };
}

function buildRequestParityPreparedTrialRequest(args: {
  config: LocalVlmResolvedConfig;
  contract: RequestParityReproducibilityContract;
  observationRunId: string;
  overlayBytes: Uint8Array;
  overlayMediaType: string;
}): RequestParityPreparedTrialRequest {
  const spec = buildRequestParitySpec(args.contract, args.observationRunId);
  const requestBody = buildRequestParityRequestBody({
    config: args.config,
    overlayBytes: args.overlayBytes,
    overlayMediaType: args.overlayMediaType,
    spec,
  });

  return {
    observationRunId: args.observationRunId,
    spec,
    requestBody,
  };
}

function fingerprintSnapshotForContract(
  fingerprints: readonly RequestParityCanonicalFingerprint[],
  contract: RequestParityReproducibilityContract,
): RequestParityFingerprintSnapshot {
  const fingerprint = fingerprints.find((entry) => entry.contract === contract);
  if (!fingerprint) {
    throw new Error(`missing fingerprint for contract ${contract}`);
  }
  return {
    contract: fingerprint.contract,
    sourceBuilder: fingerprint.sourceBuilder,
    systemPromptDigest: fingerprint.systemPromptDigest,
    userInstructionDigest: fingerprint.userInstructionDigest,
    responseFormatDigest: fingerprint.responseFormatDigest,
    requestBodyDigest: fingerprint.requestBodyDigest,
    requestBodyShapeDigest: fingerprint.requestBodyShapeDigest,
    overlayImageDigest: fingerprint.overlayImageDigest,
    overlayImageMediaType: fingerprint.overlayImageMediaType,
    model: fingerprint.model,
    seed: fingerprint.seed,
    temperature: fingerprint.temperature,
    tokenLimit: fingerprint.tokenLimit,
  };
}

function compareRequestParityFingerprintSnapshots(args: {
  expected: RequestParityFingerprintSnapshot;
  measured: RequestParityFingerprintSnapshot | null;
}): RequestParityTrialReport["requestFingerprint"] {
  if (args.measured === null) {
    return {
      expected: args.expected,
      measured: null,
      matchedFields: [],
      mismatchedFields: [...REQUEST_PARITY_FINGERPRINT_FIELDS],
      allFieldsMatched: false,
    };
  }

  const matchedFields: RequestParityFingerprintField[] = [];
  const mismatchedFields: RequestParityFingerprintField[] = [];
  for (const field of REQUEST_PARITY_FINGERPRINT_FIELDS) {
    if (args.expected[field] === args.measured[field]) {
      matchedFields.push(field);
    } else {
      mismatchedFields.push(field);
    }
  }

  return {
    expected: args.expected,
    measured: args.measured,
    matchedFields,
    mismatchedFields,
    allFieldsMatched: mismatchedFields.length === 0,
  };
}

export function buildRequestParityCanonicalFingerprints(args: {
  config: LocalVlmResolvedConfig;
  overlayBytes: Uint8Array;
  overlayMediaType: string;
  observationRunId: string;
}): readonly RequestParityCanonicalFingerprint[] {
  return REQUEST_PARITY_REPRODUCIBILITY_CONTRACTS.map((contract) => {
    const spec = buildRequestParitySpec(contract, args.observationRunId);
    const requestBody = buildRequestParityRequestBody({
      config: args.config,
      overlayBytes: args.overlayBytes,
      overlayMediaType: args.overlayMediaType,
      spec,
    });
    const fingerprint = buildRequestParityFingerprintComputation({
      observationRunId: args.observationRunId,
      contract,
      sourceBuilder: spec.sourceBuilder,
      requestBody,
    });

    return {
      ...fingerprint.snapshot,
      normalizedSystemPromptText: fingerprint.normalizedSystemPromptText,
      normalizedUserInstructionText: fingerprint.normalizedUserInstructionText,
      normalizedResponseFormatJson: fingerprint.normalizedResponseFormatJson,
      normalizedRedactedRequestBodyJson: fingerprint.normalizedRedactedRequestBodyJson,
      normalizedRequestBodyShapeJson: fingerprint.normalizedRequestBodyShapeJson,
    } satisfies RequestParityCanonicalFingerprint;
  });
}

export function compareRequestParityFingerprints(
  fingerprints: readonly RequestParityCanonicalFingerprint[],
): readonly RequestParityPairwiseDifference[] {
  const results: RequestParityPairwiseDifference[] = [];

  for (let index = 0; index < fingerprints.length; index += 1) {
    for (let nextIndex = index + 1; nextIndex < fingerprints.length; nextIndex += 1) {
      const left = fingerprints[index]!;
      const right = fingerprints[nextIndex]!;
      const differingComponents = [
        left.systemPromptDigest === right.systemPromptDigest ? null : "system-prompt",
        left.userInstructionDigest === right.userInstructionDigest ? null : "user-instruction",
        left.responseFormatDigest === right.responseFormatDigest ? null : "response-format",
        left.requestBodyDigest === right.requestBodyDigest ? null : "request-body",
        left.requestBodyShapeDigest === right.requestBodyShapeDigest ? null : "request-body-shape",
        left.overlayImageDigest === right.overlayImageDigest ? null : "overlay-image",
      ].filter((entry): entry is string => entry !== null);

      results.push({
        left: left.contract,
        right: right.contract,
        sameSystemPromptDigest: left.systemPromptDigest === right.systemPromptDigest,
        sameUserInstructionDigest: left.userInstructionDigest === right.userInstructionDigest,
        sameResponseFormatDigest: left.responseFormatDigest === right.responseFormatDigest,
        sameRequestBodyDigest: left.requestBodyDigest === right.requestBodyDigest,
        sameRequestBodyShapeDigest: left.requestBodyShapeDigest === right.requestBodyShapeDigest,
        sameOverlayImageDigest: left.overlayImageDigest === right.overlayImageDigest,
        differingComponents,
        systemPromptDiff: uniqueLineDiff(
          left.normalizedSystemPromptText,
          right.normalizedSystemPromptText,
        ),
        userInstructionDiff: uniqueLineDiff(
          left.normalizedUserInstructionText,
          right.normalizedUserInstructionText,
        ),
        responseFormatDiff: uniqueLineDiff(
          left.normalizedResponseFormatJson,
          right.normalizedResponseFormatJson,
        ),
        requestBodyDiff: uniqueLineDiff(
          left.normalizedRedactedRequestBodyJson,
          right.normalizedRedactedRequestBodyJson,
        ),
      });
    }
  }

  return results;
}

export function buildRequestParitySchedule(): readonly ScheduledTrial[] {
  const trials: ScheduledTrial[] = [];
  let sequenceNumber = 1;
  for (
    let repetitionNumber = 1;
    repetitionNumber <= REQUEST_PARITY_REPRODUCIBILITY_REPETITIONS;
    repetitionNumber += 1
  ) {
    REQUEST_PARITY_REPRODUCIBILITY_SEQUENCE.forEach((contract, index) => {
      trials.push({
        sequenceNumber,
        repetitionNumber,
        sequencePosition: index + 1,
        contract,
      });
      sequenceNumber += 1;
    });
  }
  return trials;
}

const REQUEST_PARITY_EXPECTED_SCHEDULE = buildRequestParitySchedule();
const REQUEST_PARITY_EXPECTED_APPEARANCES = Object.fromEntries(
  REQUEST_PARITY_REPRODUCIBILITY_CONTRACTS.map((contract) => [
    contract,
    REQUEST_PARITY_EXPECTED_SCHEDULE.filter((trial) => trial.contract === contract).length,
  ]),
) as Record<RequestParityReproducibilityContract, number>;
const REQUEST_PARITY_EXPECTED_POSITION_COUNTS = new Map<
  RequestParityReproducibilityContract,
  Map<number, number>
>(
  REQUEST_PARITY_REPRODUCIBILITY_CONTRACTS.map((contract) => {
    const positionCounts = new Map<number, number>();
    for (const trial of REQUEST_PARITY_EXPECTED_SCHEDULE) {
      if (trial.contract !== contract) continue;
      positionCounts.set(
        trial.sequencePosition,
        (positionCounts.get(trial.sequencePosition) ?? 0) + 1,
      );
    }
    return [contract, positionCounts];
  }),
);

export function classifyRequestParityTrials(args: {
  trials: readonly Pick<
    RequestParityTrialReport,
    "contract" | "sequencePosition" | "status" | "requestFingerprint"
  >[];
  fingerprints: readonly RequestParityCanonicalFingerprint[];
}): RequestParityClassification {
  const contractFindings = REQUEST_PARITY_REPRODUCIBILITY_CONTRACTS.map((contract) => {
    const contractTrials = args.trials.filter((trial) => trial.contract === contract);
    const executed = contractTrials.filter((trial) => trial.status !== "BLOCKED");
    const passCount = executed.filter((trial) => trial.status === "PASS").length;
    const failCount = executed.filter((trial) => trial.status === "FAIL").length;
    const blockedCount = contractTrials.length - executed.length;
    const expectedAppearances = REQUEST_PARITY_EXPECTED_APPEARANCES[contract];
    const fingerprintVerifiedCount = contractTrials.filter(
      (trial) => trial.requestFingerprint.allFieldsMatched,
    ).length;
    const fingerprintMismatchCount = contractTrials.length - fingerprintVerifiedCount;
    const completeEvidence =
      contractTrials.length === expectedAppearances &&
      blockedCount === 0 &&
      fingerprintMismatchCount === 0;
    const sequencePositions = Array.from(
      new Set(contractTrials.map((trial) => trial.sequencePosition)),
    ).sort((left, right) => left - right);
    const expectedPositionCounts =
      REQUEST_PARITY_EXPECTED_POSITION_COUNTS.get(contract) ?? new Map();
    const repeatedPositionPattern =
      completeEvidence &&
      expectedPositionCounts.size > 1 &&
      Array.from(expectedPositionCounts.entries()).every(([position, expectedCount]) => {
        const trialsAtPosition = executed.filter((trial) => trial.sequencePosition === position);
        return (
          trialsAtPosition.length === expectedCount &&
          new Set(trialsAtPosition.map((trial) => trial.status)).size === 1
        );
      }) &&
      new Set(
        Array.from(expectedPositionCounts.keys()).map((position) => {
          return executed.find((trial) => trial.sequencePosition === position)?.status ?? "BLOCKED";
        }),
      ).size > 1;

    const notes: string[] = [];
    let outcome: RequestParityContractFinding["outcome"] = "INSUFFICIENT_EVIDENCE";
    if (!completeEvidence) {
      if (contractTrials.length !== expectedAppearances) {
        notes.push(
          `Only ${contractTrials.length} of ${expectedAppearances} scheduled appearances were observed.`,
        );
      }
      if (blockedCount > 0) {
        notes.push(`${blockedCount} scheduled appearances were blocked.`);
      }
      if (fingerprintMismatchCount > 0) {
        notes.push(
          `${fingerprintMismatchCount} scheduled appearances failed fingerprint verification.`,
        );
      }
      if (notes.length === 0) {
        notes.push("Complete fingerprint-verified evidence was not established.");
      }
    } else if (failCount === expectedAppearances) {
      outcome = "DETERMINISTIC_FAILURE";
      notes.push("Every scheduled appearance failed with a verified matching fingerprint.");
    } else if (passCount === expectedAppearances) {
      outcome = "ALL_PASS";
      notes.push("Every scheduled appearance passed with a verified matching fingerprint.");
    } else if (repeatedPositionPattern) {
      outcome = "ORDER_OR_STATE_EFFECT";
      notes.push(
        "Sequence-position outcomes differed while remaining stable across all repeated positions.",
      );
    } else if (passCount > 0 && failCount > 0) {
      outcome = "INTERMITTENT_FAILURE";
      notes.push(
        "The same verified request fingerprint produced both PASS and FAIL outcomes across the full schedule.",
      );
    } else {
      notes.push("No deterministic or mixed pattern was established.");
    }

    return {
      contract,
      expectedAppearances,
      executedAppearances: executed.length,
      passCount,
      failCount,
      blockedCount,
      fingerprintVerifiedCount,
      fingerprintMismatchCount,
      completeEvidence,
      outcome,
      sequencePositions,
      notes,
    } satisfies RequestParityContractFinding;
  });

  const requestDifferenceFindings: RequestParityDifferenceFinding[] = [];
  for (let index = 0; index < REQUEST_PARITY_REPRODUCIBILITY_CONTRACTS.length; index += 1) {
    for (
      let nextIndex = index + 1;
      nextIndex < REQUEST_PARITY_REPRODUCIBILITY_CONTRACTS.length;
      nextIndex += 1
    ) {
      const left = REQUEST_PARITY_REPRODUCIBILITY_CONTRACTS[index]!;
      const right = REQUEST_PARITY_REPRODUCIBILITY_CONTRACTS[nextIndex]!;
      const leftFinding = contractFindings.find((finding) => finding.contract === left)!;
      const rightFinding = contractFindings.find((finding) => finding.contract === right)!;
      const fingerprintsDiffer =
        fingerprintSnapshotForContract(args.fingerprints, left).requestBodyDigest !==
        fingerprintSnapshotForContract(args.fingerprints, right).requestBodyDigest;

      let outcome: RequestParityDifferenceFinding["outcome"] = "INSUFFICIENT_EVIDENCE";
      const notes: string[] = [];
      if (!fingerprintsDiffer) {
        outcome = "NO_EFFECT";
        notes.push(
          "Canonical request fingerprints matched, so no request-difference attribution applies.",
        );
      } else if (!leftFinding.completeEvidence || !rightFinding.completeEvidence) {
        notes.push(
          "At least one contract lacked the complete fingerprint-verified schedule required for request-difference attribution.",
        );
      } else if (
        (leftFinding.outcome === "ALL_PASS" || leftFinding.outcome === "DETERMINISTIC_FAILURE") &&
        (rightFinding.outcome === "ALL_PASS" || rightFinding.outcome === "DETERMINISTIC_FAILURE") &&
        leftFinding.outcome !== rightFinding.outcome
      ) {
        outcome = "REQUEST_DIFFERENCE_EFFECT";
        notes.push(
          "Fingerprints differed and the two contracts behaved consistently differently across every scheduled appearance.",
        );
      } else if (
        (leftFinding.outcome === "ALL_PASS" || leftFinding.outcome === "DETERMINISTIC_FAILURE") &&
        leftFinding.outcome === rightFinding.outcome
      ) {
        outcome = "NO_EFFECT";
        notes.push(
          "Fingerprints differed, but the two contracts behaved the same across the complete schedule.",
        );
      } else {
        notes.push(
          "The compared contracts did not show a stable all-pass or all-fail contrast across the complete schedule.",
        );
      }

      requestDifferenceFindings.push({
        left,
        right,
        outcome,
        notes,
      });
    }
  }

  const scheduleCompleteAndVerified =
    args.trials.length === REQUEST_PARITY_EXPECTED_SCHEDULE.length &&
    args.trials.every(
      (trial) => trial.status !== "BLOCKED" && trial.requestFingerprint.allFieldsMatched,
    );
  const overall = !scheduleCompleteAndVerified
    ? "INSUFFICIENT_EVIDENCE"
    : contractFindings.some((finding) => finding.outcome === "ORDER_OR_STATE_EFFECT")
      ? "ORDER_OR_STATE_EFFECT"
      : contractFindings.some((finding) => finding.outcome === "INTERMITTENT_FAILURE")
        ? "INTERMITTENT_FAILURE"
        : requestDifferenceFindings.some(
              (finding) => finding.outcome === "REQUEST_DIFFERENCE_EFFECT",
            )
          ? "REQUEST_DIFFERENCE_EFFECT"
          : contractFindings.some((finding) => finding.outcome === "DETERMINISTIC_FAILURE")
            ? "DETERMINISTIC_CONTRACT_FAILURE"
            : "INSUFFICIENT_EVIDENCE";

  return {
    overall,
    contractFindings,
    requestDifferenceFindings,
  };
}

function truncateForPreview(text: string): string {
  if (text.length <= REQUEST_PARITY_PREVIEW_CHARS) return text;
  return `${text.slice(0, REQUEST_PARITY_PREVIEW_CHARS)}...[truncated]`;
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

async function sendRequestParityRequest(args: {
  config: LocalVlmResolvedConfig;
  port: number;
  signal: AbortSignal;
  requestBody: ReturnType<typeof buildVisionChatRequestBody>;
}): Promise<CompletionTransportSuccess | CompletionTransportFailure> {
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
      body: JSON.stringify(args.requestBody),
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
}): RequestParityTrialEvidence {
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

function blockedTrialReport(args: {
  trial: ScheduledTrial;
  spec: RequestParitySpec;
  fingerprints: readonly RequestParityCanonicalFingerprint[];
  blockedBySequenceNumber: number;
  reason: string;
}): RequestParityTrialReport {
  const expectedFingerprint = fingerprintSnapshotForContract(
    args.fingerprints,
    args.trial.contract,
  );
  return {
    sequenceNumber: args.trial.sequenceNumber,
    repetitionNumber: args.trial.repetitionNumber,
    sequencePosition: args.trial.sequencePosition,
    contract: args.trial.contract,
    sourceBuilder: args.spec.sourceBuilder,
    requestFingerprint: compareRequestParityFingerprintSnapshots({
      expected: expectedFingerprint,
      measured: null,
    }),
    status: "BLOCKED",
    summary:
      "This trial was blocked because a prior runtime, cleanup, or provenance failure stopped the schedule.",
    issues: [`blocked by sequence ${args.blockedBySequenceNumber}: ${args.reason}`],
    blockedBySequenceNumber: args.blockedBySequenceNumber,
    evidence: null,
  };
}

async function buildFingerprintOverlay(args: {
  sourceBytes: Uint8Array;
  sourceMediaType: string;
  sourceWidth: number;
  sourceHeight: number;
}) {
  const workspaceDir = await mkdtemp(join(tmpdir(), "local-vlm-request-parity-fingerprint-"));
  try {
    const derivative = await createObserverDerivative({
      sourceBytes: args.sourceBytes,
      sourceMediaType: args.sourceMediaType,
      expectedSourceWidth: args.sourceWidth,
      expectedSourceHeight: args.sourceHeight,
      workspaceDir,
    });
    if (!derivative.ok) {
      throw new Error([derivative.error.message, ...derivative.error.issues].join("; "));
    }
    const overlayBytes = await readFile(derivative.value.overlayArtifactPath);
    return {
      overlayBytes: new Uint8Array(overlayBytes),
      overlayMediaType: derivative.value.mediaType,
    };
  } finally {
    await rm(workspaceDir, { recursive: true, force: true });
  }
}

async function runOneRequestParityTrial(args: {
  config: LocalVlmResolvedConfig;
  trial: ScheduledTrial;
  sourceBytes: Uint8Array;
  sourceMediaType: string;
  sourceWidth: number;
  sourceHeight: number;
  fingerprints: readonly RequestParityCanonicalFingerprint[];
  mutatePreparedTrialRequest?: (
    prepared: RequestParityPreparedTrialRequest,
  ) => RequestParityPreparedTrialRequest;
}): Promise<{ report: RequestParityTrialReport; fatalStopReason: string | null }> {
  const workspaceDir = await mkdtemp(
    join(tmpdir(), `local-vlm-request-parity-${args.trial.sequenceNumber}-${args.trial.contract}-`),
  );
  const observationRunId = randomUUID();
  const expectedFingerprint = fingerprintSnapshotForContract(
    args.fingerprints,
    args.trial.contract,
  );
  let owner: Awaited<ReturnType<typeof spawnOwnedLlamaServerProcess>> | null = null;
  let cleanupCompleted = false;
  let resources: LocalVlmResourceTelemetry | null = null;
  let outcome: CompletionTransportSuccess | CompletionTransportFailure | null = null;
  let measuredFingerprint: RequestParityFingerprintSnapshot | null = null;
  let fingerprintComparison = compareRequestParityFingerprintSnapshots({
    expected: expectedFingerprint,
    measured: null,
  });
  let sourceBuilder = expectedFingerprint.sourceBuilder;
  let status: RequestParityReproducibilityTrialStatus = "FAIL";
  let summary = "The trial failed before the request completed.";
  let issues: string[] = [];
  let fatalStopReason: string | null = null;

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
      fatalStopReason = issues.join("; ");
    } else {
      const overlayBytes = await readFile(derivative.value.overlayArtifactPath);
      if (overlayBytes.byteLength > args.config.maxImageBytes) {
        outcome = {
          ok: false,
          failure: {
            code: "INVALID_OBSERVER_OUTPUT",
            message: "Overlay image exceeds the configured input-byte budget.",
            issues: [
              `overlayBytes=${overlayBytes.byteLength}`,
              `limit=${args.config.maxImageBytes}`,
            ],
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
      } else {
        let prepared = buildRequestParityPreparedTrialRequest({
          config: args.config,
          contract: args.trial.contract,
          observationRunId,
          overlayBytes: new Uint8Array(overlayBytes),
          overlayMediaType: derivative.value.mediaType,
        });
        if (args.mutatePreparedTrialRequest) {
          prepared = args.mutatePreparedTrialRequest(prepared);
        }
        measuredFingerprint = buildRequestParityFingerprintComputation({
          observationRunId: prepared.observationRunId,
          contract: args.trial.contract,
          sourceBuilder: prepared.spec.sourceBuilder,
          requestBody: prepared.requestBody,
        }).snapshot;
        fingerprintComparison = compareRequestParityFingerprintSnapshots({
          expected: expectedFingerprint,
          measured: measuredFingerprint,
        });
        sourceBuilder = prepared.spec.sourceBuilder;

        if (!fingerprintComparison.allFieldsMatched) {
          status = "BLOCKED";
          summary =
            "The actual trial request did not match the preregistered contract, so the request was not sent.";
          issues = [
            "Harness provenance failure: the measured trial fingerprint diverged from the preregistered fingerprint.",
            `mismatchedFields=${fingerprintComparison.mismatchedFields.join(",")}`,
            `expectedRequestBodyDigest=${expectedFingerprint.requestBodyDigest}`,
            `measuredRequestBodyDigest=${measuredFingerprint.requestBodyDigest}`,
            `expectedOverlayImageDigest=${expectedFingerprint.overlayImageDigest}`,
            `measuredOverlayImageDigest=${measuredFingerprint.overlayImageDigest}`,
          ];
          fatalStopReason = `request fingerprint mismatch at sequence ${args.trial.sequenceNumber}`;
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
          outcome = await sendRequestParityRequest({
            config: args.config,
            port: owner.telemetry.port,
            signal: new AbortController().signal,
            requestBody: prepared.requestBody,
          });

          if (outcome.transportCompletedAt !== null) {
            owner.markRequestCompleted();
          }

          if (outcome.ok) {
            status = "PASS";
            summary = "The trial completed within the configured timeout and byte budget.";
          } else {
            status = "FAIL";
            const failure = localVlmFailureFromUnknown(outcome.failure);
            issues = [failure.message, ...failure.issues];
            summary =
              failure.code === "REQUEST_TIMEOUT"
                ? "The trial did not complete before the configured timeout."
                : outcome.transportCompletedAt !== null
                  ? "The transport completed, but the response did not complete successfully."
                  : "The trial did not complete within the configured completion bounds.";
          }
        }
      }
    }
  } catch (error) {
    const failure = localVlmFailureFromUnknown(error);
    issues = [failure.message, ...failure.issues];
    fatalStopReason = [failure.message, ...failure.issues].join("; ");
  } finally {
    let terminationFailure: unknown = null;
    if (owner !== null) {
      try {
        await owner.terminate();
      } catch (error) {
        terminationFailure = error;
        const failure = localVlmFailureFromUnknown(error);
        issues = issues.length > 0 ? issues : [failure.message, ...failure.issues];
        fatalStopReason = [failure.message, ...failure.issues].join("; ");
      }
    }

    if (terminationFailure === null) {
      await rm(workspaceDir, { recursive: true, force: true });
      cleanupCompleted = true;
    }

    if (owner !== null) {
      resources = await owner.finalizeResources(cleanupCompleted ? 0 : 1);
    }

    if (!cleanupCompleted && fatalStopReason === null) {
      fatalStopReason = "workspace cleanup did not complete";
    }
  }

  return {
    report: {
      sequenceNumber: args.trial.sequenceNumber,
      repetitionNumber: args.trial.repetitionNumber,
      sequencePosition: args.trial.sequencePosition,
      contract: args.trial.contract,
      sourceBuilder,
      requestFingerprint: fingerprintComparison,
      status,
      summary,
      issues,
      blockedBySequenceNumber: null,
      evidence: evidenceFromRun({
        workspaceDir,
        cleanupCompleted,
        owner,
        resources,
        outcome,
      }),
    },
    fatalStopReason,
  };
}

export async function runLocalVlmRequestParityReproducibilityDiagnostic(args: {
  config: LocalVlmResolvedConfig;
  scenarioId: string;
  sourceArtifactRef: string;
  sourceBytes: Uint8Array;
  sourceMediaType: string;
  sourceWidth: number;
  sourceHeight: number;
  mutatePreparedTrialRequest?: (
    trial: ScheduledTrial,
    prepared: RequestParityPreparedTrialRequest,
  ) => RequestParityPreparedTrialRequest;
}): Promise<RequestParityReproducibilityDiagnosticReport> {
  const runtimeVersion = await readLlamaVersionOutput(args.config);
  const fingerprintOverlay = await buildFingerprintOverlay({
    sourceBytes: args.sourceBytes,
    sourceMediaType: args.sourceMediaType,
    sourceWidth: args.sourceWidth,
    sourceHeight: args.sourceHeight,
  });
  const requestFingerprints = buildRequestParityCanonicalFingerprints({
    config: args.config,
    overlayBytes: fingerprintOverlay.overlayBytes,
    overlayMediaType: fingerprintOverlay.overlayMediaType,
    observationRunId: randomUUID(),
  });
  const pairwiseDifferences = compareRequestParityFingerprints(requestFingerprints);
  const schedule = buildRequestParitySchedule();
  const trials: RequestParityTrialReport[] = [];
  let fatalStopReason: string | null = null;
  let blockedBySequenceNumber: number | null = null;

  for (const trial of schedule) {
    if (fatalStopReason !== null && blockedBySequenceNumber !== null) {
      trials.push(
        blockedTrialReport({
          trial,
          spec: buildRequestParitySpec(trial.contract, FINGERPRINT_OBSERVATION_RUN_ID_PLACEHOLDER),
          fingerprints: requestFingerprints,
          blockedBySequenceNumber,
          reason: fatalStopReason,
        }),
      );
      continue;
    }

    const result = await runOneRequestParityTrial({
      config: args.config,
      trial,
      sourceBytes: args.sourceBytes,
      sourceMediaType: args.sourceMediaType,
      sourceWidth: args.sourceWidth,
      sourceHeight: args.sourceHeight,
      fingerprints: requestFingerprints,
      mutatePreparedTrialRequest:
        args.mutatePreparedTrialRequest === undefined
          ? undefined
          : (prepared) => args.mutatePreparedTrialRequest!(trial, prepared),
    });
    trials.push(result.report);
    if (result.fatalStopReason !== null) {
      fatalStopReason = result.fatalStopReason;
      blockedBySequenceNumber = trial.sequenceNumber;
    }
  }

  const classification = classifyRequestParityTrials({
    trials,
    fingerprints: requestFingerprints,
  });

  return {
    schemaVersion: REQUEST_PARITY_REPRODUCIBILITY_DIAGNOSTIC_SCHEMA_VERSION,
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
    source: {
      scenarioId: args.scenarioId,
      sourceArtifactRef: args.sourceArtifactRef,
      sourceMediaType: args.sourceMediaType,
      sourceWidth: args.sourceWidth,
      sourceHeight: args.sourceHeight,
    },
    schedule: {
      sequence: REQUEST_PARITY_REPRODUCIBILITY_SEQUENCE,
      repetitions: REQUEST_PARITY_REPRODUCIBILITY_REPETITIONS,
      totalTrials: schedule.length,
    },
    requestFingerprints,
    pairwiseDifferences,
    trials,
    classification,
    fatalStopReason,
  };
}

export async function writeRequestParityReproducibilityDiagnosticFiles(args: {
  report: RequestParityReproducibilityDiagnosticReport;
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
    `- Overall classification: ${args.report.classification.overall}`,
    `- Fatal stop reason: ${args.report.fatalStopReason ?? "none"}`,
    "",
    "## Fingerprints",
    "",
    ...args.report.requestFingerprints.map((fingerprint) => {
      return `- ${fingerprint.contract}: requestBodyDigest=${fingerprint.requestBodyDigest}; systemPromptDigest=${fingerprint.systemPromptDigest}; userInstructionDigest=${fingerprint.userInstructionDigest}; responseFormatDigest=${fingerprint.responseFormatDigest}; overlayImageDigest=${fingerprint.overlayImageDigest}`;
    }),
    "",
    "## Trials",
    "",
    ...args.report.trials.map((trial) => {
      const preview = trial.evidence?.outputPreviewEscaped ?? "null";
      const finishReason = trial.evidence?.finishReason ?? "null";
      const expected = trial.requestFingerprint.expected.requestBodyDigest;
      const measured = trial.requestFingerprint.measured?.requestBodyDigest ?? "null";
      return `- #${trial.sequenceNumber} rep${trial.repetitionNumber} pos${trial.sequencePosition} ${trial.contract}: ${trial.status}; expectedFingerprint=${expected}; measuredFingerprint=${measured}; fingerprintVerified=${String(trial.requestFingerprint.allFieldsMatched)}; responseCompletedSuccessfully=${String(trial.evidence?.responseCompletedSuccessfully ?? false)}; finishReason=${finishReason}; timeoutStage=${trial.evidence?.timeoutStage ?? "null"}; responseBytes=${trial.evidence?.responseBytes ?? 0}; preview=${preview}`;
    }),
  ].join("\n");
  await writeFile(jsonPath, `${JSON.stringify(args.report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, `${markdown}\n`, "utf8");
  return { jsonPath, markdownPath };
}
