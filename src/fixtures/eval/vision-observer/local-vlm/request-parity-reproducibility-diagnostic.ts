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
  "local-vlm-request-parity-reproducibility-diagnostic.v1" as const;
export const REQUEST_PARITY_REPRODUCIBILITY_TRIAL_STATUSES = ["PASS", "FAIL", "BLOCKED"] as const;
export const REQUEST_PARITY_REPRODUCIBILITY_CONTRACTS = ["A", "B", "C"] as const;
export const REQUEST_PARITY_REPRODUCIBILITY_SEQUENCE = ["A", "B", "A", "C", "B"] as const;
export const REQUEST_PARITY_REPRODUCIBILITY_REPETITIONS = 3 as const;

const FINGERPRINT_OBSERVATION_RUN_ID_PLACEHOLDER = "<normalized-observation-run-id>";
const REQUEST_PARITY_PREVIEW_CHARS = 240;

export type RequestParityReproducibilityTrialStatus =
  (typeof REQUEST_PARITY_REPRODUCIBILITY_TRIAL_STATUSES)[number];
export type RequestParityReproducibilityContract =
  (typeof REQUEST_PARITY_REPRODUCIBILITY_CONTRACTS)[number];

interface RequestParitySpec {
  contract: RequestParityReproducibilityContract;
  sourceBuilder:
    | "phase4-one-observation-without-coordinates"
    | "phase6-description"
    | "phase6-guidance-load-control";
  promptText: string;
  instructionText: string;
  responseFormat: Record<string, unknown> | null;
}

export interface RequestParityCanonicalFingerprint {
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
  seed: number;
  temperature: number;
  tokenLimit: number;
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
  requestFingerprintDigest: string;
  status: RequestParityReproducibilityTrialStatus;
  summary: string;
  issues: readonly string[];
  blockedBySequenceNumber: number | null;
  evidence: RequestParityTrialEvidence | null;
}

export interface RequestParityContractFinding {
  contract: RequestParityReproducibilityContract;
  executedAppearances: number;
  passCount: number;
  failCount: number;
  blockedCount: number;
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

export function buildRequestParityCanonicalFingerprints(args: {
  config: LocalVlmResolvedConfig;
  overlayBytes: Uint8Array;
  overlayMediaType: string;
  observationRunId: string;
}): readonly RequestParityCanonicalFingerprint[] {
  const overlayImageDigest = sha256Hex(args.overlayBytes);
  const overlayDataUrl = `data:${args.overlayMediaType};base64,${Buffer.from(args.overlayBytes).toString("base64")}`;

  return REQUEST_PARITY_REPRODUCIBILITY_CONTRACTS.map((contract) => {
    const spec = buildRequestParitySpec(contract, args.observationRunId);
    const requestBody = buildVisionChatRequestBody({
      config: args.config,
      overlayDataUrl,
      systemPrompt: spec.promptText,
      userInstruction: spec.instructionText,
      responseFormat: spec.responseFormat ?? undefined,
    });
    const normalizedPromptText = replaceRunIdInText(spec.promptText, args.observationRunId);
    const normalizedInstructionText = replaceRunIdInText(
      spec.instructionText,
      args.observationRunId,
    );
    const normalizedResponseFormat = stableJsonStringify(spec.responseFormat);
    const normalizedRequestBody = normalizeRunIdDeep(requestBody, args.observationRunId);
    const normalizedRequestBodyJson = stableJsonStringify(normalizedRequestBody);
    const normalizedRedactedRequestBodyJson = stableJsonStringify(
      redactOverlayDataUrlsDeep(normalizedRequestBody, overlayImageDigest),
    );
    const normalizedRequestBodyShapeJson = stableJsonStringify(jsonShape(normalizedRequestBody));

    return {
      contract,
      sourceBuilder: spec.sourceBuilder,
      systemPromptDigest: sha256Hex(normalizedPromptText),
      userInstructionDigest: sha256Hex(normalizedInstructionText),
      responseFormatDigest: sha256Hex(normalizedResponseFormat),
      requestBodyDigest: sha256Hex(normalizedRequestBodyJson),
      requestBodyShapeDigest: sha256Hex(normalizedRequestBodyShapeJson),
      overlayImageDigest,
      overlayImageMediaType: args.overlayMediaType,
      model: args.config.modelDisplayId,
      seed: args.config.seed,
      temperature: args.config.temperature,
      tokenLimit: args.config.maxOutputTokens,
      normalizedSystemPromptText: normalizedPromptText,
      normalizedUserInstructionText: normalizedInstructionText,
      normalizedResponseFormatJson: normalizedResponseFormat,
      normalizedRedactedRequestBodyJson,
      normalizedRequestBodyShapeJson,
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

function contractFingerprintDigest(
  fingerprints: readonly RequestParityCanonicalFingerprint[],
  contract: RequestParityReproducibilityContract,
): string {
  return (
    fingerprints.find((fingerprint) => fingerprint.contract === contract)?.requestBodyDigest ?? ""
  );
}

function consistentOutcome(trials: readonly RequestParityTrialReport[]) {
  const executed = trials.filter((trial) => trial.status !== "BLOCKED");
  if (executed.length === 0) return null;
  if (executed.every((trial) => trial.status === "PASS")) return "PASS" as const;
  if (executed.every((trial) => trial.status === "FAIL")) return "FAIL" as const;
  return null;
}

export function classifyRequestParityTrials(args: {
  trials: readonly Pick<
    RequestParityTrialReport,
    "contract" | "sequencePosition" | "status" | "requestFingerprintDigest"
  >[];
  fingerprints: readonly RequestParityCanonicalFingerprint[];
}): RequestParityClassification {
  const contractFindings = REQUEST_PARITY_REPRODUCIBILITY_CONTRACTS.map((contract) => {
    const contractTrials = args.trials.filter((trial) => trial.contract === contract);
    const executed = contractTrials.filter((trial) => trial.status !== "BLOCKED");
    const passCount = executed.filter((trial) => trial.status === "PASS").length;
    const failCount = executed.filter((trial) => trial.status === "FAIL").length;
    const blockedCount = contractTrials.length - executed.length;
    const sequencePositions = Array.from(
      new Set(contractTrials.map((trial) => trial.sequencePosition)),
    ).sort((left, right) => left - right);

    const positionOutcomeMap = new Map<number, Set<RequestParityReproducibilityTrialStatus>>();
    for (const trial of executed) {
      const statuses = positionOutcomeMap.get(trial.sequencePosition) ?? new Set();
      statuses.add(trial.status);
      positionOutcomeMap.set(trial.sequencePosition, statuses);
    }
    const repeatedPositionPattern =
      positionOutcomeMap.size > 1 &&
      sequencePositions.every(
        (position) => executed.filter((trial) => trial.sequencePosition === position).length > 1,
      ) &&
      Array.from(positionOutcomeMap.values()).every((statuses) => statuses.size === 1) &&
      new Set(Array.from(positionOutcomeMap.values()).map((statuses) => Array.from(statuses)[0]))
        .size > 1;

    const notes: string[] = [];
    let outcome: RequestParityContractFinding["outcome"] = "INSUFFICIENT_EVIDENCE";
    if (executed.length > 0 && failCount === executed.length) {
      outcome = "DETERMINISTIC_FAILURE";
      notes.push("Every executed appearance failed.");
    } else if (executed.length > 0 && passCount === executed.length) {
      outcome = "ALL_PASS";
      notes.push("Every executed appearance passed.");
    } else if (repeatedPositionPattern) {
      outcome = "ORDER_OR_STATE_EFFECT";
      notes.push(
        "Sequence-position outcomes differed while remaining consistent within each position.",
      );
    } else if (passCount > 0 && failCount > 0) {
      outcome = "INTERMITTENT_FAILURE";
      notes.push("The same request fingerprint produced both PASS and FAIL outcomes.");
    } else {
      notes.push("No deterministic or mixed pattern was established.");
    }

    return {
      contract,
      executedAppearances: executed.length,
      passCount,
      failCount,
      blockedCount,
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
      const leftTrials = args.trials.filter((trial) => trial.contract === left);
      const rightTrials = args.trials.filter((trial) => trial.contract === right);
      const leftOutcome = consistentOutcome(leftTrials as RequestParityTrialReport[]);
      const rightOutcome = consistentOutcome(rightTrials as RequestParityTrialReport[]);
      const fingerprintsDiffer =
        contractFingerprintDigest(args.fingerprints, left) !==
        contractFingerprintDigest(args.fingerprints, right);

      let outcome: RequestParityDifferenceFinding["outcome"] = "INSUFFICIENT_EVIDENCE";
      const notes: string[] = [];
      if (!fingerprintsDiffer) {
        outcome = "NO_EFFECT";
        notes.push(
          "Canonical request fingerprints matched, so no request-difference attribution applies.",
        );
      } else if (leftOutcome !== null && rightOutcome !== null && leftOutcome !== rightOutcome) {
        outcome = "REQUEST_DIFFERENCE_EFFECT";
        notes.push("Fingerprints differed and the two contracts behaved consistently differently.");
      } else if (leftOutcome !== null && rightOutcome !== null && leftOutcome === rightOutcome) {
        outcome = "NO_EFFECT";
        notes.push(
          "Fingerprints differed, but the two contracts behaved the same across executed appearances.",
        );
      } else {
        notes.push(
          "At least one contract had mixed or blocked outcomes, so request-difference attribution is not established.",
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

  const overall = contractFindings.some((finding) => finding.outcome === "ORDER_OR_STATE_EFFECT")
    ? "ORDER_OR_STATE_EFFECT"
    : contractFindings.some((finding) => finding.outcome === "INTERMITTENT_FAILURE")
      ? "INTERMITTENT_FAILURE"
      : requestDifferenceFindings.some((finding) => finding.outcome === "REQUEST_DIFFERENCE_EFFECT")
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
  overlayArtifactPath: string;
  overlayMediaType: string;
  spec: RequestParitySpec;
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
          systemPrompt: args.spec.promptText,
          userInstruction: args.spec.instructionText,
          responseFormat: args.spec.responseFormat ?? undefined,
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
  return {
    sequenceNumber: args.trial.sequenceNumber,
    repetitionNumber: args.trial.repetitionNumber,
    sequencePosition: args.trial.sequencePosition,
    contract: args.trial.contract,
    sourceBuilder: args.spec.sourceBuilder,
    requestFingerprintDigest: contractFingerprintDigest(args.fingerprints, args.trial.contract),
    status: "BLOCKED",
    summary:
      "This trial was blocked because a prior runtime or cleanup failure stopped the schedule.",
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
}): Promise<{ report: RequestParityTrialReport; fatalStopReason: string | null }> {
  const workspaceDir = await mkdtemp(
    join(tmpdir(), `local-vlm-request-parity-${args.trial.sequenceNumber}-${args.trial.contract}-`),
  );
  const observationRunId = randomUUID();
  const spec = buildRequestParitySpec(args.trial.contract, observationRunId);
  let owner: Awaited<ReturnType<typeof spawnOwnedLlamaServerProcess>> | null = null;
  let cleanupCompleted = false;
  let resources: LocalVlmResourceTelemetry | null = null;
  let outcome: CompletionTransportSuccess | CompletionTransportFailure | null = null;
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
        overlayArtifactPath: derivative.value.overlayArtifactPath,
        overlayMediaType: derivative.value.mediaType,
        spec,
      });

      if (outcome.transportCompletedAt !== null) {
        owner.markRequestCompleted();
      }

      if (outcome.ok) {
        summary = "The trial completed within the configured timeout and byte budget.";
      } else {
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
      sourceBuilder: spec.sourceBuilder,
      requestFingerprintDigest: contractFingerprintDigest(args.fingerprints, args.trial.contract),
      status: outcome?.ok ? "PASS" : "FAIL",
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
      return `- #${trial.sequenceNumber} rep${trial.repetitionNumber} pos${trial.sequencePosition} ${trial.contract}: ${trial.status}; fingerprint=${trial.requestFingerprintDigest}; responseCompletedSuccessfully=${String(trial.evidence?.responseCompletedSuccessfully ?? false)}; finishReason=${finishReason}; timeoutStage=${trial.evidence?.timeoutStage ?? "null"}; responseBytes=${trial.evidence?.responseBytes ?? 0}; preview=${preview}`;
    }),
  ].join("\n");
  await writeFile(jsonPath, `${JSON.stringify(args.report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, `${markdown}\n`, "utf8");
  return { jsonPath, markdownPath };
}
