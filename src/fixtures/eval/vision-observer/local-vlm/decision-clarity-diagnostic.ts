import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import {
  OBSERVER_APPARENT_ORIENTATIONS,
  OBSERVER_AUTHORITIES,
  OBSERVER_OBSERVATION_TYPES,
  OBSERVER_PROPOSAL_SOURCES,
  OBSERVER_PURPOSES,
  OBSERVER_REASON_CODES,
  OBSERVER_VISIBILITIES,
} from "../observer-grid.types";
import { createObserverDerivative } from "../observer-grid-renderer";

import {
  buildVisionChatRequestBody,
  chatCompletionsUrl,
  waitForReadiness,
} from "./llama-server-client";
import { buildLlamaServerLaunchSpec, readLlamaVersionOutput } from "./llama-server-config";
import { localVlmFailureFromUnknown, spawnOwnedLlamaServerProcess } from "./llama-server-process";
import type {
  LlamaServerLaunchSpec,
  LocalVlmObservationFailureShape,
  LocalVlmResolvedConfig,
  LocalVlmResourceTelemetry,
} from "./local-vlm.types";
import { buildResponseCompletionRequestSpec } from "./response-completion-diagnostic";
import { buildSingleProposalDecompositionRequestSpec } from "./single-proposal-decomposition-diagnostic";

export const DECISION_CLARITY_DIAGNOSTIC_SCHEMA_VERSION =
  "local-vlm-decision-clarity-diagnostic.v1" as const;
export const DECISION_CLARITY_DIAGNOSTIC_STATUSES = ["PASS", "FAIL", "BLOCKED"] as const;
export const DECISION_CLARITY_COMPLETION_STATES = [
  "TIMELY_VALID_COMPLETION",
  "TIMELY_INVALID_COMPLETION",
  "LATE_VALID_COMPLETION",
  "LATE_INVALID_COMPLETION",
  "HARD_NON_COMPLETION",
  "REQUEST_NOT_SENT",
  "TRANSPORT_FAILURE",
  "PROCESS_FAILURE",
  "PROVENANCE_FAILURE",
  "BLOCKED",
] as const;
export const DECISION_CLARITY_CONTRACTS = ["A", "A_PRIME", "B"] as const;
export const DECISION_CLARITY_SEQUENCE = ["A", "A_PRIME", "B", "A", "A_PRIME", "B"] as const;
export const DECISION_CLARITY_REPETITIONS = 3 as const;
export const DECISION_CLARITY_SERVICE_DEADLINE_MS = 30_000 as const;
export const DECISION_CLARITY_HARD_CEILING_MS = 90_000 as const;
export const DECISION_CLARITY_MATERIAL_LATENCY_THRESHOLD_RATIO = 0.2 as const;

export const FINGERPRINT_OBSERVATION_RUN_ID_PLACEHOLDER = "<normalized-observation-run-id>";
const DECISION_CLARITY_PREVIEW_CHARS = 240;
const DECISION_CLARITY_FINGERPRINT_FIELDS = [
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
const DECISION_CLARITY_A_PRIME_SOURCE_BUILDER =
  "phase9-explicit-semantic-selection-policy" as const;
const DECISION_CLARITY_B_SOURCE_BUILDER = "phase6-description" as const;
const DECISION_CLARITY_A_SOURCE_BUILDER = "phase4-one-observation-without-coordinates" as const;
const DECISION_CLARITY_A_PRIME_POLICY_LINES = [
  "Inspect the image and return exactly one proposal for the single most visually prominent text-like region.",
  "Choose the region using this priority order:",
  "1. Largest apparent text area.",
  "2. If tied, highest visual contrast against its immediate background.",
  "3. If still tied, closest to the center of the image.",
  "A text-like region qualifies only when visible marks form an apparent line or cluster of characters.",
  "Do not transcribe any text.",
  "Do not identify a regulatory field.",
  "Do not infer what the text means.",
  "Do not infer expected values.",
  "Do not include coordinates.",
  "If no text-like region is visibly distinguishable, return an empty proposals array.",
] as const;

type DecisionClarityFingerprintField = (typeof DECISION_CLARITY_FINGERPRINT_FIELDS)[number];

const nonEmptyString = z.string().trim().min(1);
const decisionClarityProposalSchema = z
  .object({
    observationId: nonEmptyString,
    proposalId: nonEmptyString,
    observationType: z.enum(OBSERVER_OBSERVATION_TYPES),
    source: z.enum(OBSERVER_PROPOSAL_SOURCES),
    authority: z.enum(OBSERVER_AUTHORITIES),
    purpose: z.enum(OBSERVER_PURPOSES),
    apparentOrientation: z.enum(OBSERVER_APPARENT_ORIENTATIONS),
    visibility: z.enum(OBSERVER_VISIBILITIES),
    reasonCodes: z
      .array(z.enum(OBSERVER_REASON_CODES))
      .min(1)
      .max(4)
      .refine((codes) => new Set(codes).size === codes.length, {
        message: "reason codes must be unique",
      }),
    description: z.string().trim().min(1).max(160),
  })
  .strict();

const decisionClarityEnvelopeSchema = z
  .object({
    observationRunId: nonEmptyString,
    proposals: z.array(decisionClarityProposalSchema),
  })
  .strict();

export type DecisionClarityDiagnosticStatus = (typeof DECISION_CLARITY_DIAGNOSTIC_STATUSES)[number];
export type DecisionClarityCompletionState = (typeof DECISION_CLARITY_COMPLETION_STATES)[number];
export type DecisionClarityContract = (typeof DECISION_CLARITY_CONTRACTS)[number];

type DecisionClaritySourceBuilder =
  | typeof DECISION_CLARITY_A_SOURCE_BUILDER
  | typeof DECISION_CLARITY_A_PRIME_SOURCE_BUILDER
  | typeof DECISION_CLARITY_B_SOURCE_BUILDER;

export interface DecisionClaritySpec {
  contract: DecisionClarityContract;
  sourceBuilder: DecisionClaritySourceBuilder;
  promptText: string;
  instructionText: string;
  responseFormat: Record<string, unknown> | null;
}

export interface DecisionClarityFingerprintSnapshot {
  contract: DecisionClarityContract;
  sourceBuilder: DecisionClaritySourceBuilder;
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

export interface DecisionClarityCanonicalFingerprint extends DecisionClarityFingerprintSnapshot {
  normalizedSystemPromptText: string;
  normalizedUserInstructionText: string;
  normalizedResponseFormatJson: string;
  normalizedRedactedRequestBodyJson: string;
  normalizedRequestBodyShapeJson: string;
}

export interface DecisionClarityPreparedTrialRequest {
  observationRunId: string;
  spec: DecisionClaritySpec;
  requestBody: ReturnType<typeof buildVisionChatRequestBody>;
}

export interface DecisionClarityTrialEvidence {
  requestStartedAt: string | null;
  serviceDeadlineAt: string | null;
  serviceDeadlineMet: boolean | null;
  firstResponseByteAt: string | null;
  firstResponseByteLatencyMs: number | null;
  transportCompletedAt: string | null;
  transportCompletionLatencyMs: number | null;
  completionAt: string | null;
  completionLatencyMs: number | null;
  hardCeilingAt: string | null;
  responseBytes: number;
  finishReason: string | null;
  timeoutStage: "request" | "response-body" | null;
  postDeadlineDurationMs: number | null;
  boundedOutputPreview: string | null;
  cleanupCompleted: boolean;
  forcedTermination: boolean;
  portReleased: boolean | null;
  processTreeReleased: boolean | null;
  workspaceBytesAfterCleanup: number | null;
  workspaceDir: string;
}

export interface DecisionClarityTrialReport {
  sequenceNumber: number;
  repetitionNumber: number;
  sequencePosition: number;
  contract: DecisionClarityContract;
  sourceBuilder: DecisionClaritySourceBuilder;
  requestFingerprint: {
    expected: DecisionClarityFingerprintSnapshot;
    measured: DecisionClarityFingerprintSnapshot | null;
    matchedFields: readonly DecisionClarityFingerprintField[];
    mismatchedFields: readonly DecisionClarityFingerprintField[];
    allFieldsMatched: boolean;
  };
  status: DecisionClarityDiagnosticStatus;
  completionState: DecisionClarityCompletionState;
  summary: string;
  issues: readonly string[];
  blockedBySequenceNumber: number | null;
  evidence: DecisionClarityTrialEvidence | null;
}

export interface DecisionClarityLatencySummary {
  sampleCount: number;
  minimum: number | null;
  median: number | null;
  maximum: number | null;
  mean: number | null;
  standardDeviation: number | null;
  p95: number | null;
  serviceDeadlineMissCount: number;
  hardNonCompletionCount: number;
  smallSampleDescriptive: true;
}

export interface DecisionClarityContractFinding {
  contract: DecisionClarityContract;
  expectedAppearances: number;
  executedAppearances: number;
  timelyValidCount: number;
  timelyInvalidCount: number;
  lateValidCount: number;
  lateInvalidCount: number;
  hardNonCompletionCount: number;
  requestNotSentCount: number;
  transportFailureCount: number;
  processFailureCount: number;
  provenanceFailureCount: number;
  blockedCount: number;
  fingerprintMismatchCount: number;
  completeEvidence: boolean;
  latencySummary: DecisionClarityLatencySummary;
  notes: readonly string[];
}

export interface DecisionClarityPairwiseLatencyComparison {
  repetitionNumber: number;
  pairIndex: 1 | 2;
  aSequenceNumber: number | null;
  aPrimeSequenceNumber: number | null;
  aCompletionState: DecisionClarityCompletionState | null;
  aPrimeCompletionState: DecisionClarityCompletionState | null;
  aCompletionLatencyMs: number | null;
  aPrimeCompletionLatencyMs: number | null;
  rawLatencyDifferenceMs: number | null;
  percentageDifference: number | null;
  bothTimely: boolean;
  eitherLate: boolean;
  eitherHardNonCompletion: boolean;
}

export interface DecisionClarityClassification {
  clarityEffect:
    | "CLARITY_EFFECT_SUPPORTED"
    | "NO_CLARITY_EFFECT_OBSERVED"
    | "CLARITY_EFFECT_CONTRADICTED"
    | "INSUFFICIENT_EVIDENCE";
  completeVerifiedEvidence: boolean;
  notes: readonly string[];
}

export interface DecisionClarityDiagnosticReport {
  schemaVersion: typeof DECISION_CLARITY_DIAGNOSTIC_SCHEMA_VERSION;
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
    configuredRequestTimeoutMs: number;
  };
  deadlines: {
    serviceDeadlineMs: number;
    hardCeilingMs: number;
  };
  source: {
    scenarioId: string;
    sourceArtifactRef: string;
    sourceMediaType: string;
    sourceWidth: number;
    sourceHeight: number;
  };
  schedule: {
    sequence: readonly DecisionClarityContract[];
    repetitions: number;
    totalTrials: number;
  };
  requestFingerprints: readonly DecisionClarityCanonicalFingerprint[];
  trials: readonly DecisionClarityTrialReport[];
  contractFindings: readonly DecisionClarityContractFinding[];
  pairwiseLatencyComparisons: readonly DecisionClarityPairwiseLatencyComparison[];
  classification: DecisionClarityClassification;
  fatalStopReason: string | null;
}

export interface DecisionClarityScheduledTrial {
  sequenceNumber: number;
  repetitionNumber: number;
  sequencePosition: number;
  contract: DecisionClarityContract;
}

type ScheduledTrial = DecisionClarityScheduledTrial;

interface DecisionClarityTransportCompleted {
  kind: "completed";
  requestStartedAt: string;
  serviceDeadlineAt: string;
  hardCeilingAt: string;
  firstResponseByteAt: string | null;
  firstResponseByteLatencyMs: number | null;
  transportCompletedAt: string | null;
  transportCompletionLatencyMs: number | null;
  completionAt: string;
  completionLatencyMs: number;
  responseBytes: number;
  finishReason: string | null;
  timeoutStage: null;
  outputPreviewEscaped: string | null;
  rawAssistantContent: string | null;
  transportValid: boolean;
  issues: readonly string[];
}

interface DecisionClarityTransportHardNonCompletion {
  kind: "hard-non-completion";
  requestStartedAt: string;
  serviceDeadlineAt: string;
  hardCeilingAt: string;
  firstResponseByteAt: string | null;
  firstResponseByteLatencyMs: number | null;
  transportCompletedAt: null;
  transportCompletionLatencyMs: null;
  completionAt: null;
  completionLatencyMs: null;
  responseBytes: number;
  finishReason: string | null;
  timeoutStage: "request" | "response-body";
  outputPreviewEscaped: string | null;
  issues: readonly string[];
}

type DecisionClarityTransportOutcome =
  | DecisionClarityTransportCompleted
  | DecisionClarityTransportHardNonCompletion
  | {
      kind: "runtime-failure";
      requestStartedAt: string;
      serviceDeadlineAt: string;
      hardCeilingAt: string;
      firstResponseByteAt: string | null;
      firstResponseByteLatencyMs: number | null;
      transportCompletedAt: null;
      transportCompletionLatencyMs: null;
      completionAt: null;
      completionLatencyMs: null;
      responseBytes: number;
      finishReason: string | null;
      timeoutStage: null;
      outputPreviewEscaped: string | null;
      issues: readonly string[];
    };

type OwnedDecisionClarityProcess = Awaited<ReturnType<typeof spawnOwnedLlamaServerProcess>>;

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

function promptTextWithInsertedPolicy(basePromptText: string): string {
  const lines = basePromptText.split("\n");
  const insertionIndex = lines.indexOf("Return this exact JSON shape:");
  if (insertionIndex === -1) {
    throw new Error("Phase 4 response-completion prompt shape anchor is missing.");
  }
  return [
    ...lines.slice(0, insertionIndex),
    ...DECISION_CLARITY_A_PRIME_POLICY_LINES,
    ...lines.slice(insertionIndex),
  ].join("\n");
}

export function buildDecisionClaritySpec(
  contract: DecisionClarityContract,
  observationRunId: string,
): DecisionClaritySpec {
  switch (contract) {
    case "A": {
      const spec = buildResponseCompletionRequestSpec(
        "one-observation-without-coordinates",
        observationRunId,
      );
      return {
        contract,
        sourceBuilder: DECISION_CLARITY_A_SOURCE_BUILDER,
        promptText: spec.promptText,
        instructionText: spec.instructionText,
        responseFormat: spec.responseFormat,
      };
    }
    case "A_PRIME": {
      const spec = buildResponseCompletionRequestSpec(
        "one-observation-without-coordinates",
        observationRunId,
      );
      return {
        contract,
        sourceBuilder: DECISION_CLARITY_A_PRIME_SOURCE_BUILDER,
        promptText: promptTextWithInsertedPolicy(spec.promptText),
        instructionText: spec.instructionText,
        responseFormat: spec.responseFormat,
      };
    }
    case "B": {
      const spec = buildSingleProposalDecompositionRequestSpec("description", observationRunId);
      return {
        contract,
        sourceBuilder: DECISION_CLARITY_B_SOURCE_BUILDER,
        promptText: spec.promptText,
        instructionText: spec.instructionText,
        responseFormat: spec.responseFormat,
      };
    }
  }
}

function buildDecisionClarityRequestBody(args: {
  config: LocalVlmResolvedConfig;
  overlayBytes: Uint8Array;
  overlayMediaType: string;
  spec: DecisionClaritySpec;
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

function buildDecisionClarityFingerprintComputation(args: {
  observationRunId: string;
  contract: DecisionClarityContract;
  sourceBuilder: DecisionClaritySourceBuilder;
  requestBody: ReturnType<typeof buildVisionChatRequestBody>;
}): {
  snapshot: DecisionClarityFingerprintSnapshot;
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

function buildDecisionClarityPreparedTrialRequest(args: {
  config: LocalVlmResolvedConfig;
  contract: DecisionClarityContract;
  observationRunId: string;
  overlayBytes: Uint8Array;
  overlayMediaType: string;
}): DecisionClarityPreparedTrialRequest {
  const spec = buildDecisionClaritySpec(args.contract, args.observationRunId);
  return {
    observationRunId: args.observationRunId,
    spec,
    requestBody: buildDecisionClarityRequestBody({
      config: args.config,
      overlayBytes: args.overlayBytes,
      overlayMediaType: args.overlayMediaType,
      spec,
    }),
  };
}

function fingerprintSnapshotForContract(
  fingerprints: readonly DecisionClarityCanonicalFingerprint[],
  contract: DecisionClarityContract,
): DecisionClarityFingerprintSnapshot {
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

function compareDecisionClarityFingerprintSnapshots(args: {
  expected: DecisionClarityFingerprintSnapshot;
  measured: DecisionClarityFingerprintSnapshot | null;
}): DecisionClarityTrialReport["requestFingerprint"] {
  if (args.measured === null) {
    return {
      expected: args.expected,
      measured: null,
      matchedFields: [],
      mismatchedFields: [...DECISION_CLARITY_FINGERPRINT_FIELDS],
      allFieldsMatched: false,
    };
  }

  const matchedFields: DecisionClarityFingerprintField[] = [];
  const mismatchedFields: DecisionClarityFingerprintField[] = [];
  for (const field of DECISION_CLARITY_FINGERPRINT_FIELDS) {
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

export function buildDecisionClarityCanonicalFingerprints(args: {
  config: LocalVlmResolvedConfig;
  overlayBytes: Uint8Array;
  overlayMediaType: string;
  observationRunId: string;
}): readonly DecisionClarityCanonicalFingerprint[] {
  return DECISION_CLARITY_CONTRACTS.map((contract) => {
    const spec = buildDecisionClaritySpec(contract, args.observationRunId);
    const requestBody = buildDecisionClarityRequestBody({
      config: args.config,
      overlayBytes: args.overlayBytes,
      overlayMediaType: args.overlayMediaType,
      spec,
    });
    const fingerprint = buildDecisionClarityFingerprintComputation({
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
    } satisfies DecisionClarityCanonicalFingerprint;
  });
}

export function buildDecisionClaritySchedule(): readonly ScheduledTrial[] {
  const trials: ScheduledTrial[] = [];
  let sequenceNumber = 1;
  for (
    let repetitionNumber = 1;
    repetitionNumber <= DECISION_CLARITY_REPETITIONS;
    repetitionNumber += 1
  ) {
    DECISION_CLARITY_SEQUENCE.forEach((contract, index) => {
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

const DECISION_CLARITY_EXPECTED_SCHEDULE = buildDecisionClaritySchedule();
const DECISION_CLARITY_EXPECTED_APPEARANCES = Object.fromEntries(
  DECISION_CLARITY_CONTRACTS.map((contract) => [
    contract,
    DECISION_CLARITY_EXPECTED_SCHEDULE.filter((trial) => trial.contract === contract).length,
  ]),
) as Record<DecisionClarityContract, number>;

function parseJsonEnvelope(raw: string):
  | { ok: true; json: string }
  | {
      ok: false;
      issues: readonly string[];
    } {
  const trimmed = raw.trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch) {
    return { ok: true, json: fencedMatch[1]! };
  }
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return { ok: true, json: trimmed };
  }
  return {
    ok: false,
    issues: ["assistant content must be exactly one JSON object or one enclosing JSON fence"],
  };
}

function truncateForPreview(text: string): string {
  if (text.length <= DECISION_CLARITY_PREVIEW_CHARS) return text;
  return `${text.slice(0, DECISION_CLARITY_PREVIEW_CHARS)}...[truncated]`;
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

function invalidTransportFailure(
  message: string,
  issues: readonly string[],
): LocalVlmObservationFailureShape {
  return {
    code: "INVALID_OBSERVER_OUTPUT",
    message,
    issues,
  };
}

function transportCompletedAt(startedAt: number) {
  return {
    completionAt: new Date().toISOString(),
    completionLatencyMs: Math.max(0, performance.now() - startedAt),
  };
}

function headerLatencyOverride(response: Response): number | null {
  const raw = response.headers.get("x-fake-completion-latency-ms");
  if (raw === null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseCompletedTransportEnvelope(args: { response: Response; rawText: string }):
  | {
      ok: true;
      rawAssistantContent: string;
      finishReason: string | null;
      outputPreviewEscaped: string;
    }
  | {
      ok: false;
      failure: LocalVlmObservationFailureShape;
      rawAssistantContent: string | null;
      finishReason: string | null;
      outputPreviewEscaped: string;
    } {
  if (!args.response.ok) {
    return {
      ok: false,
      failure: invalidTransportFailure(
        "The transport completed, but the server returned a non-success HTTP status.",
        [`status=${args.response.status}`],
      ),
      rawAssistantContent: null,
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
      failure: invalidTransportFailure("The llama-server transport payload was not valid JSON.", [
        error instanceof Error ? error.message : String(error),
      ]),
      rawAssistantContent: null,
      finishReason: null,
      outputPreviewEscaped: escapedPreview(args.rawText) ?? JSON.stringify(""),
    };
  }

  const choice = (
    payload as { choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }> }
  )?.choices?.[0];
  const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : null;
  const rawAssistantContent = choice?.message?.content;
  if (typeof rawAssistantContent !== "string") {
    return {
      ok: false,
      failure: invalidTransportFailure(
        "The llama-server transport payload did not include a string assistant message.",
        ["choices[0].message.content must be a string"],
      ),
      rawAssistantContent: null,
      finishReason,
      outputPreviewEscaped: escapedPreview(args.rawText) ?? JSON.stringify(""),
    };
  }

  if (finishReason !== null && finishReason !== "stop") {
    return {
      ok: false,
      failure: invalidTransportFailure(
        "The response transport completed, but the model did not finish successfully.",
        [`finishReason=${finishReason}`],
      ),
      rawAssistantContent,
      finishReason,
      outputPreviewEscaped: escapedPreview(rawAssistantContent) ?? JSON.stringify(""),
    };
  }

  return {
    ok: true,
    rawAssistantContent,
    finishReason,
    outputPreviewEscaped: escapedPreview(rawAssistantContent) ?? JSON.stringify(""),
  };
}

function timeoutFailure(args: {
  timeoutMs: number;
  timeoutStage: "request" | "response-body";
}): LocalVlmObservationFailureShape {
  return {
    code: "REQUEST_TIMEOUT",
    message: "The local VLM request timed out at the hard diagnostic ceiling.",
    issues: [`timeoutMs=${args.timeoutMs}`, `timeoutStage=${args.timeoutStage}`],
  };
}

function parseValidatedDecisionClarityEnvelope(args: {
  observationRunId: string;
  rawAssistantContent: string;
}):
  | { ok: true; data: z.infer<typeof decisionClarityEnvelopeSchema> }
  | { ok: false; issues: readonly string[] } {
  const envelope = parseJsonEnvelope(args.rawAssistantContent);
  if (!envelope.ok) {
    return envelope;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(envelope.json);
  } catch (error) {
    return {
      ok: false,
      issues: [error instanceof Error ? error.message : String(error)],
    };
  }

  const validated = decisionClarityEnvelopeSchema.safeParse(parsed);
  if (!validated.success) {
    return {
      ok: false,
      issues: validated.error.issues.map((issue) =>
        issue.path.length === 0 ? issue.message : `${issue.path.join(".")}: ${issue.message}`,
      ),
    };
  }

  if (validated.data.observationRunId !== args.observationRunId) {
    return {
      ok: false,
      issues: [
        `observationRunId mismatch: expected=${args.observationRunId}, actual=${validated.data.observationRunId}`,
      ],
    };
  }

  return {
    ok: true,
    data: validated.data,
  };
}

function validateExactSingleProposalContract(args: {
  contractLabel: string;
  observationRunId: string;
  rawAssistantContent: string;
}): { ok: true } | { ok: false; issues: readonly string[] } {
  const validated = parseValidatedDecisionClarityEnvelope(args);
  if (!validated.ok) {
    return validated;
  }

  if (validated.data.proposals.length !== 1) {
    return {
      ok: false,
      issues: [`${args.contractLabel} requires exactly one proposal.`],
    };
  }

  return { ok: true };
}

function validateDecisionClarityAssistantContent(args: {
  contract: DecisionClarityContract;
  observationRunId: string;
  rawAssistantContent: string;
}): { ok: true } | { ok: false; issues: readonly string[] } {
  if (args.contract === "A") {
    return validateExactSingleProposalContract({
      contractLabel: "Contract A",
      observationRunId: args.observationRunId,
      rawAssistantContent: args.rawAssistantContent,
    });
  }

  if (args.contract === "B") {
    return validateExactSingleProposalContract({
      contractLabel: "The Phase 6 description control",
      observationRunId: args.observationRunId,
      rawAssistantContent: args.rawAssistantContent,
    });
  }

  const validated = parseValidatedDecisionClarityEnvelope({
    observationRunId: args.observationRunId,
    rawAssistantContent: args.rawAssistantContent,
  });
  if (!validated.ok) {
    return validated;
  }

  if (validated.data.proposals.length > 1) {
    return {
      ok: false,
      issues: ["Contract A_PRIME allows at most one proposal."],
    };
  }

  return { ok: true };
}

function completionStateFromOutcome(args: {
  transport: DecisionClarityTransportCompleted | DecisionClarityTransportHardNonCompletion;
  contract: DecisionClarityContract;
  observationRunId: string;
}): {
  completionState:
    | "TIMELY_VALID_COMPLETION"
    | "TIMELY_INVALID_COMPLETION"
    | "LATE_VALID_COMPLETION"
    | "LATE_INVALID_COMPLETION"
    | "HARD_NON_COMPLETION";
  issues: readonly string[];
  serviceDeadlineMet: boolean;
  postDeadlineDurationMs: number | null;
} {
  if (args.transport.kind === "hard-non-completion") {
    return {
      completionState: "HARD_NON_COMPLETION",
      issues: args.transport.issues,
      serviceDeadlineMet: false,
      postDeadlineDurationMs: null,
    };
  }

  const validation =
    args.transport.transportValid && args.transport.rawAssistantContent !== null
      ? validateDecisionClarityAssistantContent({
          contract: args.contract,
          observationRunId: args.observationRunId,
          rawAssistantContent: args.transport.rawAssistantContent,
        })
      : { ok: false as const, issues: args.transport.issues };
  const serviceDeadlineMet =
    args.transport.completionLatencyMs <=
    elapsedBetweenIso(args.transport.requestStartedAt, args.transport.serviceDeadlineAt);
  const postDeadlineDurationMs = serviceDeadlineMet
    ? null
    : Math.max(
        0,
        args.transport.completionLatencyMs -
          elapsedBetweenIso(args.transport.requestStartedAt, args.transport.serviceDeadlineAt),
      );

  if (validation.ok) {
    return {
      completionState: serviceDeadlineMet ? "TIMELY_VALID_COMPLETION" : "LATE_VALID_COMPLETION",
      issues: [],
      serviceDeadlineMet,
      postDeadlineDurationMs,
    };
  }

  return {
    completionState: serviceDeadlineMet ? "TIMELY_INVALID_COMPLETION" : "LATE_INVALID_COMPLETION",
    issues: validation.issues,
    serviceDeadlineMet,
    postDeadlineDurationMs,
  };
}

function elapsedBetweenIso(startedAt: string, completedAt: string): number {
  return Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime());
}

async function readDecisionClarityTransportBody(args: {
  response: Response;
  config: LocalVlmResolvedConfig;
  requestSignal: AbortSignal;
  requestStartedAt: string;
  serviceDeadlineAt: string;
  hardCeilingAt: string;
  startedAtMonotonic: number;
  hardCeilingMs: number;
}): Promise<DecisionClarityTransportOutcome> {
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
              kind: "hard-non-completion",
              requestStartedAt: args.requestStartedAt,
              serviceDeadlineAt: args.serviceDeadlineAt,
              hardCeilingAt: args.hardCeilingAt,
              firstResponseByteAt,
              firstResponseByteLatencyMs,
              transportCompletedAt: null,
              transportCompletionLatencyMs: null,
              completionAt: null,
              completionLatencyMs: null,
              responseBytes: total,
              finishReason: null,
              timeoutStage: "response-body",
              outputPreviewEscaped: escapedPreview(partialText),
              issues: [
                timeoutFailure({
                  timeoutMs: args.hardCeilingMs,
                  timeoutStage: "response-body",
                }).message,
                ...timeoutFailure({
                  timeoutMs: args.hardCeilingMs,
                  timeoutStage: "response-body",
                }).issues,
              ],
            };
          }
          const failure = localVlmFailureFromUnknown(error);
          const partialText = Buffer.from(concatChunks(chunks, total)).toString("utf8");
          return {
            kind: "runtime-failure",
            requestStartedAt: args.requestStartedAt,
            serviceDeadlineAt: args.serviceDeadlineAt,
            hardCeilingAt: args.hardCeilingAt,
            firstResponseByteAt,
            firstResponseByteLatencyMs,
            transportCompletedAt: null,
            transportCompletionLatencyMs: null,
            completionAt: null,
            completionLatencyMs: null,
            responseBytes: total,
            finishReason: null,
            timeoutStage: null,
            outputPreviewEscaped: escapedPreview(partialText),
            issues: [failure.message, ...failure.issues],
          };
        }

        if (next.done) break;
        if (firstResponseByteAt === null) {
          firstResponseByteAt = new Date().toISOString();
          firstResponseByteLatencyMs = Math.max(0, performance.now() - args.startedAtMonotonic);
        }
        total += next.value.byteLength;
        if (total > args.config.responseBytesMax) {
          chunks.push(next.value);
          const { completionAt, completionLatencyMs } = transportCompletedAt(
            args.startedAtMonotonic,
          );
          const partialText = Buffer.from(concatChunks(chunks, total)).toString("utf8");
          return {
            kind: "completed",
            requestStartedAt: args.requestStartedAt,
            serviceDeadlineAt: args.serviceDeadlineAt,
            hardCeilingAt: args.hardCeilingAt,
            firstResponseByteAt,
            firstResponseByteLatencyMs,
            transportCompletedAt: null,
            transportCompletionLatencyMs: null,
            completionAt,
            completionLatencyMs,
            responseBytes: total,
            finishReason: null,
            timeoutStage: null,
            outputPreviewEscaped: escapedPreview(partialText),
            rawAssistantContent: null,
            transportValid: false,
            issues: [
              "The local VLM transport payload exceeded the configured limit.",
              `responseBytes=${total}`,
              `limit=${args.config.responseBytesMax}`,
            ],
          };
        }
        chunks.push(next.value);
      }
    } finally {
      reader.releaseLock();
    }
  }

  const transportText = Buffer.from(concatChunks(chunks, total)).toString("utf8");
  const transportCompletedAtIso = new Date().toISOString();
  const transportCompletionLatencyMs =
    headerLatencyOverride(args.response) ??
    Math.max(0, performance.now() - args.startedAtMonotonic);
  const { completionAt, completionLatencyMs } = {
    completionAt: transportCompletedAtIso,
    completionLatencyMs: transportCompletionLatencyMs,
  };
  const parsedTransport = parseCompletedTransportEnvelope({
    response: args.response,
    rawText: transportText,
  });
  if (!parsedTransport.ok) {
    return {
      kind: "completed",
      requestStartedAt: args.requestStartedAt,
      serviceDeadlineAt: args.serviceDeadlineAt,
      hardCeilingAt: args.hardCeilingAt,
      firstResponseByteAt,
      firstResponseByteLatencyMs,
      transportCompletedAt: transportCompletedAtIso,
      transportCompletionLatencyMs,
      completionAt,
      completionLatencyMs,
      responseBytes: total,
      finishReason: parsedTransport.finishReason,
      timeoutStage: null,
      outputPreviewEscaped: parsedTransport.outputPreviewEscaped,
      rawAssistantContent: parsedTransport.rawAssistantContent,
      transportValid: false,
      issues: [parsedTransport.failure.message, ...parsedTransport.failure.issues],
    };
  }

  return {
    kind: "completed",
    requestStartedAt: args.requestStartedAt,
    serviceDeadlineAt: args.serviceDeadlineAt,
    hardCeilingAt: args.hardCeilingAt,
    firstResponseByteAt,
    firstResponseByteLatencyMs,
    transportCompletedAt: transportCompletedAtIso,
    transportCompletionLatencyMs,
    completionAt,
    completionLatencyMs,
    responseBytes: total,
    finishReason: parsedTransport.finishReason,
    timeoutStage: null,
    outputPreviewEscaped: parsedTransport.outputPreviewEscaped,
    rawAssistantContent: parsedTransport.rawAssistantContent,
    transportValid: true,
    issues: [],
  };
}

async function sendDecisionClarityRequest(args: {
  config: LocalVlmResolvedConfig;
  port: number;
  signal: AbortSignal;
  requestBody: ReturnType<typeof buildVisionChatRequestBody>;
  requestStartedAt: string;
  serviceDeadlineAt: string;
  hardCeilingAt: string;
  serviceDeadlineMs: number;
  hardCeilingMs: number;
}): Promise<DecisionClarityTransportOutcome> {
  const hardCeilingController = new AbortController();
  const hardCeilingTimer = setTimeout(() => hardCeilingController.abort(), args.hardCeilingMs);
  const requestSignal = AbortSignal.any([args.signal, hardCeilingController.signal]);
  const startedAtMonotonic = performance.now();

  try {
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
        const failure = timeoutFailure({
          timeoutMs: args.hardCeilingMs,
          timeoutStage: "request",
        });
        return {
          kind: "hard-non-completion",
          requestStartedAt: args.requestStartedAt,
          serviceDeadlineAt: args.serviceDeadlineAt,
          hardCeilingAt: args.hardCeilingAt,
          firstResponseByteAt: null,
          firstResponseByteLatencyMs: null,
          transportCompletedAt: null,
          transportCompletionLatencyMs: null,
          completionAt: null,
          completionLatencyMs: null,
          responseBytes: 0,
          finishReason: null,
          timeoutStage: "request",
          outputPreviewEscaped: null,
          issues: [failure.message, ...failure.issues],
        };
      }
      const failure = localVlmFailureFromUnknown(error);
      return {
        kind: "runtime-failure",
        requestStartedAt: args.requestStartedAt,
        serviceDeadlineAt: args.serviceDeadlineAt,
        hardCeilingAt: args.hardCeilingAt,
        firstResponseByteAt: null,
        firstResponseByteLatencyMs: null,
        transportCompletedAt: null,
        transportCompletionLatencyMs: null,
        completionAt: null,
        completionLatencyMs: null,
        responseBytes: 0,
        finishReason: null,
        timeoutStage: null,
        outputPreviewEscaped: null,
        issues: [failure.message, ...failure.issues],
      };
    }

    return await readDecisionClarityTransportBody({
      response,
      config: args.config,
      requestSignal,
      requestStartedAt: args.requestStartedAt,
      serviceDeadlineAt: args.serviceDeadlineAt,
      hardCeilingAt: args.hardCeilingAt,
      startedAtMonotonic,
      hardCeilingMs: args.hardCeilingMs,
    });
  } finally {
    clearTimeout(hardCeilingTimer);
  }
}

function evidenceFromRun(args: {
  requestStartedAt: string | null;
  serviceDeadlineAt: string | null;
  hardCeilingAt: string | null;
  workspaceDir: string;
  cleanupCompleted: boolean;
  owner: {
    telemetry: {
      forcedTermination: boolean;
      portReleased: boolean | null;
    };
  } | null;
  resources: LocalVlmResourceTelemetry | null;
  transport: DecisionClarityTransportOutcome | null;
  serviceDeadlineMet: boolean | null;
  postDeadlineDurationMs: number | null;
}): DecisionClarityTrialEvidence {
  return {
    requestStartedAt: args.transport?.requestStartedAt ?? args.requestStartedAt,
    serviceDeadlineAt: args.transport?.serviceDeadlineAt ?? args.serviceDeadlineAt,
    serviceDeadlineMet: args.serviceDeadlineMet,
    firstResponseByteAt: args.transport?.firstResponseByteAt ?? null,
    firstResponseByteLatencyMs: args.transport?.firstResponseByteLatencyMs ?? null,
    transportCompletedAt:
      args.transport?.kind === "completed" ? args.transport.transportCompletedAt : null,
    transportCompletionLatencyMs:
      args.transport?.kind === "completed" ? args.transport.transportCompletionLatencyMs : null,
    completionAt: args.transport?.completionAt ?? null,
    completionLatencyMs: args.transport?.completionLatencyMs ?? null,
    hardCeilingAt: args.transport?.hardCeilingAt ?? args.hardCeilingAt,
    responseBytes: args.transport?.responseBytes ?? 0,
    finishReason: args.transport?.finishReason ?? null,
    timeoutStage: args.transport?.timeoutStage ?? null,
    postDeadlineDurationMs: args.postDeadlineDurationMs,
    boundedOutputPreview: args.transport?.outputPreviewEscaped ?? null,
    cleanupCompleted: args.cleanupCompleted,
    forcedTermination: args.owner?.telemetry.forcedTermination ?? false,
    portReleased: args.owner?.telemetry.portReleased ?? null,
    processTreeReleased: args.resources?.processTreeReleasedAfterTermination ?? null,
    workspaceBytesAfterCleanup: args.resources?.workspaceBytesAfterCleanup ?? null,
    workspaceDir: args.workspaceDir,
  };
}

export function statusFromCompletionState(
  completionState: DecisionClarityCompletionState,
): DecisionClarityDiagnosticStatus {
  switch (completionState) {
    case "TIMELY_VALID_COMPLETION":
      return "PASS";
    case "BLOCKED":
      return "BLOCKED";
    default:
      return "FAIL";
  }
}

function isInfrastructureFailureState(state: DecisionClarityCompletionState): boolean {
  return (
    state === "REQUEST_NOT_SENT" || state === "TRANSPORT_FAILURE" || state === "PROCESS_FAILURE"
  );
}

async function ownerExitedSoon(
  owner: OwnedDecisionClarityProcess | null,
  gracePeriodMs = 100,
): Promise<boolean> {
  if (owner === null) return false;
  if (owner.exited) return true;
  return await Promise.race([
    owner.waitForExit().then(() => true),
    new Promise<false>((resolve) => setTimeout(() => resolve(false), gracePeriodMs)),
  ]);
}

export function buildBlockedDecisionClarityTrialReport(args: {
  trial: ScheduledTrial;
  spec: DecisionClaritySpec;
  fingerprints: readonly DecisionClarityCanonicalFingerprint[];
  blockedBySequenceNumber: number;
  reason: string;
}): DecisionClarityTrialReport {
  return {
    sequenceNumber: args.trial.sequenceNumber,
    repetitionNumber: args.trial.repetitionNumber,
    sequencePosition: args.trial.sequencePosition,
    contract: args.trial.contract,
    sourceBuilder: args.spec.sourceBuilder,
    requestFingerprint: compareDecisionClarityFingerprintSnapshots({
      expected: fingerprintSnapshotForContract(args.fingerprints, args.trial.contract),
      measured: null,
    }),
    status: "BLOCKED",
    completionState: "BLOCKED",
    summary:
      "This trial was blocked because a prior provenance, lifecycle, or runtime-integrity failure stopped the schedule.",
    issues: [`blocked by sequence ${args.blockedBySequenceNumber}: ${args.reason}`],
    blockedBySequenceNumber: args.blockedBySequenceNumber,
    evidence: null,
  };
}

export async function buildDecisionClarityFingerprintOverlay(args: {
  sourceBytes: Uint8Array;
  sourceMediaType: string;
  sourceWidth: number;
  sourceHeight: number;
}) {
  const workspaceDir = await mkdtemp(join(tmpdir(), "local-vlm-decision-clarity-fingerprint-"));
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

function descriptiveStats(
  values: readonly number[],
): Omit<
  DecisionClarityLatencySummary,
  "serviceDeadlineMissCount" | "hardNonCompletionCount" | "smallSampleDescriptive"
> {
  if (values.length === 0) {
    return {
      sampleCount: 0,
      minimum: null,
      median: null,
      maximum: null,
      mean: null,
      standardDeviation: null,
      p95: null,
    };
  }

  const sorted = [...values].sort((left, right) => left - right);
  const sampleCount = sorted.length;
  const minimum = sorted[0] ?? null;
  const maximum = sorted.at(-1) ?? null;
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sampleCount;
  const median =
    sampleCount % 2 === 1
      ? sorted[(sampleCount - 1) / 2]!
      : (sorted[sampleCount / 2 - 1]! + sorted[sampleCount / 2]!) / 2;
  const variance =
    sampleCount === 1
      ? 0
      : sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sampleCount;
  const p95Index = Math.min(sampleCount - 1, Math.ceil(sampleCount * 0.95) - 1);
  return {
    sampleCount,
    minimum,
    median,
    maximum,
    mean,
    standardDeviation: Math.sqrt(variance),
    p95: sorted[p95Index] ?? null,
  };
}

function isTimelyState(state: DecisionClarityCompletionState | null): boolean {
  return state === "TIMELY_VALID_COMPLETION" || state === "TIMELY_INVALID_COMPLETION";
}

function isLateState(state: DecisionClarityCompletionState | null): boolean {
  return state === "LATE_VALID_COMPLETION" || state === "LATE_INVALID_COMPLETION";
}

function materiallyLower(left: number | null, right: number | null): boolean {
  return (
    left !== null &&
    right !== null &&
    right <= left * (1 - DECISION_CLARITY_MATERIAL_LATENCY_THRESHOLD_RATIO)
  );
}

function materiallyHigher(left: number | null, right: number | null): boolean {
  return (
    left !== null &&
    right !== null &&
    right >= left * (1 + DECISION_CLARITY_MATERIAL_LATENCY_THRESHOLD_RATIO)
  );
}

export function buildDecisionClarityPairwiseLatencyComparisons(
  trials: readonly Pick<
    DecisionClarityTrialReport,
    | "sequenceNumber"
    | "repetitionNumber"
    | "sequencePosition"
    | "contract"
    | "completionState"
    | "evidence"
  >[],
): readonly DecisionClarityPairwiseLatencyComparison[] {
  const comparisons: DecisionClarityPairwiseLatencyComparison[] = [];

  for (
    let repetitionNumber = 1;
    repetitionNumber <= DECISION_CLARITY_REPETITIONS;
    repetitionNumber += 1
  ) {
    const repetitionTrials = trials.filter((trial) => trial.repetitionNumber === repetitionNumber);
    const pairs = [
      { pairIndex: 1 as const, aPosition: 1, aPrimePosition: 2 },
      { pairIndex: 2 as const, aPosition: 4, aPrimePosition: 5 },
    ];

    for (const pair of pairs) {
      const aTrial =
        repetitionTrials.find(
          (trial) => trial.contract === "A" && trial.sequencePosition === pair.aPosition,
        ) ?? null;
      const aPrimeTrial =
        repetitionTrials.find(
          (trial) => trial.contract === "A_PRIME" && trial.sequencePosition === pair.aPrimePosition,
        ) ?? null;
      const aLatency = aTrial?.evidence?.completionLatencyMs ?? null;
      const aPrimeLatency = aPrimeTrial?.evidence?.completionLatencyMs ?? null;
      const rawLatencyDifferenceMs =
        aLatency === null || aPrimeLatency === null ? null : aPrimeLatency - aLatency;
      const percentageDifference =
        aLatency === null || aPrimeLatency === null || aLatency === 0
          ? null
          : ((aPrimeLatency - aLatency) / aLatency) * 100;

      comparisons.push({
        repetitionNumber,
        pairIndex: pair.pairIndex,
        aSequenceNumber: aTrial?.sequenceNumber ?? null,
        aPrimeSequenceNumber: aPrimeTrial?.sequenceNumber ?? null,
        aCompletionState: aTrial?.completionState ?? null,
        aPrimeCompletionState: aPrimeTrial?.completionState ?? null,
        aCompletionLatencyMs: aLatency,
        aPrimeCompletionLatencyMs: aPrimeLatency,
        rawLatencyDifferenceMs,
        percentageDifference,
        bothTimely:
          isTimelyState(aTrial?.completionState ?? null) &&
          isTimelyState(aPrimeTrial?.completionState ?? null),
        eitherLate:
          isLateState(aTrial?.completionState ?? null) ||
          isLateState(aPrimeTrial?.completionState ?? null),
        eitherHardNonCompletion:
          aTrial?.completionState === "HARD_NON_COMPLETION" ||
          aPrimeTrial?.completionState === "HARD_NON_COMPLETION",
      });
    }
  }

  return comparisons;
}

function controlShowsRepeatedShift(args: {
  trials: readonly Pick<
    DecisionClarityTrialReport,
    "repetitionNumber" | "sequencePosition" | "contract" | "completionState" | "evidence"
  >[];
  direction: "improvement" | "degradation";
}): boolean {
  let repeatedCount = 0;
  for (
    let repetitionNumber = 1;
    repetitionNumber <= DECISION_CLARITY_REPETITIONS;
    repetitionNumber += 1
  ) {
    const repetitionTrials = args.trials.filter(
      (trial) => trial.repetitionNumber === repetitionNumber,
    );
    const firstB =
      repetitionTrials.find((trial) => trial.contract === "B" && trial.sequencePosition === 3) ??
      null;
    const secondB =
      repetitionTrials.find((trial) => trial.contract === "B" && trial.sequencePosition === 6) ??
      null;
    if (!firstB || !secondB) continue;
    const firstMiss = firstB.evidence?.serviceDeadlineMet === false;
    const secondMiss = secondB.evidence?.serviceDeadlineMet === false;
    const firstLatency = firstB.evidence?.completionLatencyMs ?? null;
    const secondLatency = secondB.evidence?.completionLatencyMs ?? null;
    const shifted =
      args.direction === "improvement"
        ? secondMiss === false && firstMiss === true
          ? true
          : materiallyLower(firstLatency, secondLatency)
        : secondMiss === true && firstMiss === false
          ? true
          : materiallyHigher(firstLatency, secondLatency);
    if (shifted) repeatedCount += 1;
  }
  return repeatedCount >= 2;
}

export function classifyDecisionClarityTrials(
  trials: readonly Pick<
    DecisionClarityTrialReport,
    | "repetitionNumber"
    | "sequencePosition"
    | "sequenceNumber"
    | "contract"
    | "status"
    | "completionState"
    | "requestFingerprint"
    | "evidence"
  >[],
): {
  contractFindings: readonly DecisionClarityContractFinding[];
  pairwiseLatencyComparisons: readonly DecisionClarityPairwiseLatencyComparison[];
  classification: DecisionClarityClassification;
} {
  const contractFindings = DECISION_CLARITY_CONTRACTS.map((contract) => {
    const contractTrials = trials.filter((trial) => trial.contract === contract);
    const timelyValidCount = contractTrials.filter(
      (trial) => trial.completionState === "TIMELY_VALID_COMPLETION",
    ).length;
    const timelyInvalidCount = contractTrials.filter(
      (trial) => trial.completionState === "TIMELY_INVALID_COMPLETION",
    ).length;
    const lateValidCount = contractTrials.filter(
      (trial) => trial.completionState === "LATE_VALID_COMPLETION",
    ).length;
    const lateInvalidCount = contractTrials.filter(
      (trial) => trial.completionState === "LATE_INVALID_COMPLETION",
    ).length;
    const hardNonCompletionCount = contractTrials.filter(
      (trial) => trial.completionState === "HARD_NON_COMPLETION",
    ).length;
    const requestNotSentCount = contractTrials.filter(
      (trial) => trial.completionState === "REQUEST_NOT_SENT",
    ).length;
    const transportFailureCount = contractTrials.filter(
      (trial) => trial.completionState === "TRANSPORT_FAILURE",
    ).length;
    const processFailureCount = contractTrials.filter(
      (trial) => trial.completionState === "PROCESS_FAILURE",
    ).length;
    const provenanceFailureCount = contractTrials.filter(
      (trial) => trial.completionState === "PROVENANCE_FAILURE",
    ).length;
    const blockedCount = contractTrials.filter((trial) => trial.status === "BLOCKED").length;
    const fingerprintMismatchCount = contractTrials.filter(
      (trial) => !trial.requestFingerprint.allFieldsMatched,
    ).length;
    const executedAppearances = contractTrials.length - blockedCount;
    const completionLatencies = contractTrials
      .map((trial) => trial.evidence?.completionLatencyMs ?? null)
      .filter((value): value is number => value !== null);
    const completeEvidence =
      contractTrials.length === DECISION_CLARITY_EXPECTED_APPEARANCES[contract] &&
      blockedCount === 0 &&
      fingerprintMismatchCount === 0 &&
      requestNotSentCount === 0 &&
      transportFailureCount === 0 &&
      processFailureCount === 0 &&
      provenanceFailureCount === 0;
    const notes: string[] = [];
    if (!completeEvidence) {
      if (blockedCount > 0) {
        notes.push(`${blockedCount} scheduled appearances were blocked.`);
      }
      if (fingerprintMismatchCount > 0) {
        notes.push(
          `${fingerprintMismatchCount} scheduled appearances failed fingerprint verification.`,
        );
      }
      if (provenanceFailureCount > 0) {
        notes.push(`${provenanceFailureCount} appearances ended with provenance failures.`);
      }
      if (requestNotSentCount > 0) {
        notes.push(`${requestNotSentCount} appearances never reached transmission.`);
      }
      if (transportFailureCount > 0) {
        notes.push(`${transportFailureCount} appearances ended with transport failures.`);
      }
      if (processFailureCount > 0) {
        notes.push(`${processFailureCount} appearances ended with process failures.`);
      }
    }
    return {
      contract,
      expectedAppearances: DECISION_CLARITY_EXPECTED_APPEARANCES[contract],
      executedAppearances,
      timelyValidCount,
      timelyInvalidCount,
      lateValidCount,
      lateInvalidCount,
      hardNonCompletionCount,
      requestNotSentCount,
      transportFailureCount,
      processFailureCount,
      provenanceFailureCount,
      blockedCount,
      fingerprintMismatchCount,
      completeEvidence,
      latencySummary: {
        ...descriptiveStats(completionLatencies),
        serviceDeadlineMissCount: lateValidCount + lateInvalidCount + hardNonCompletionCount,
        hardNonCompletionCount,
        smallSampleDescriptive: true,
      },
      notes,
    } satisfies DecisionClarityContractFinding;
  });

  const pairwiseLatencyComparisons = buildDecisionClarityPairwiseLatencyComparisons(trials);
  const completeVerifiedEvidence =
    trials.length === DECISION_CLARITY_EXPECTED_SCHEDULE.length &&
    trials.every(
      (trial) =>
        trial.status !== "BLOCKED" &&
        trial.requestFingerprint.allFieldsMatched &&
        trial.completionState !== "PROVENANCE_FAILURE" &&
        !isInfrastructureFailureState(trial.completionState),
    );

  const notes: string[] = [];
  if (!completeVerifiedEvidence) {
    notes.push("Complete unblocked fingerprint-verified evidence was not established.");
    return {
      contractFindings,
      pairwiseLatencyComparisons,
      classification: {
        clarityEffect: "INSUFFICIENT_EVIDENCE",
        completeVerifiedEvidence: false,
        notes,
      },
    };
  }

  const aFinding = contractFindings.find((finding) => finding.contract === "A")!;
  const aPrimeFinding = contractFindings.find((finding) => finding.contract === "A_PRIME")!;
  const aMisses = aFinding.latencySummary.serviceDeadlineMissCount;
  const aPrimeMisses = aPrimeFinding.latencySummary.serviceDeadlineMissCount;
  let repetitionMissImprovementCount = 0;
  let repetitionMissDegradationCount = 0;
  for (
    let repetitionNumber = 1;
    repetitionNumber <= DECISION_CLARITY_REPETITIONS;
    repetitionNumber += 1
  ) {
    const repetitionTrials = trials.filter((trial) => trial.repetitionNumber === repetitionNumber);
    const aRepetitionMisses = repetitionTrials.filter(
      (trial) => trial.contract === "A" && trial.evidence?.serviceDeadlineMet === false,
    ).length;
    const aPrimeRepetitionMisses = repetitionTrials.filter(
      (trial) => trial.contract === "A_PRIME" && trial.evidence?.serviceDeadlineMet === false,
    ).length;
    if (aPrimeRepetitionMisses < aRepetitionMisses) repetitionMissImprovementCount += 1;
    if (aPrimeRepetitionMisses > aRepetitionMisses) repetitionMissDegradationCount += 1;
  }

  const improvedPairs = pairwiseLatencyComparisons.filter((comparison) =>
    materiallyLower(comparison.aCompletionLatencyMs, comparison.aPrimeCompletionLatencyMs),
  );
  const degradedPairs = pairwiseLatencyComparisons.filter((comparison) =>
    materiallyHigher(comparison.aCompletionLatencyMs, comparison.aPrimeCompletionLatencyMs),
  );
  const improvedPairRepetitions = new Set(
    improvedPairs.map((comparison) => comparison.repetitionNumber),
  );
  const degradedPairRepetitions = new Set(
    degradedPairs.map((comparison) => comparison.repetitionNumber),
  );
  const equalMissCounts = aMisses === aPrimeMisses;
  const controlImprovement = controlShowsRepeatedShift({ trials, direction: "improvement" });
  const controlDegradation = controlShowsRepeatedShift({ trials, direction: "degradation" });

  const supportedByMisses =
    aPrimeMisses < aMisses && repetitionMissImprovementCount >= 2 && !controlImprovement;
  const supportedByLatency =
    equalMissCounts &&
    improvedPairs.length >= 4 &&
    improvedPairRepetitions.size >= 2 &&
    !controlImprovement;
  const contradictedByMisses =
    aPrimeMisses > aMisses && repetitionMissDegradationCount >= 2 && !controlDegradation;
  const contradictedByLatency =
    equalMissCounts &&
    degradedPairs.length >= 4 &&
    degradedPairRepetitions.size >= 2 &&
    !controlDegradation;
  const materiallyEquivalent =
    equalMissCounts &&
    aFinding.timelyValidCount === aPrimeFinding.timelyValidCount &&
    aFinding.timelyInvalidCount === aPrimeFinding.timelyInvalidCount &&
    aFinding.lateValidCount === aPrimeFinding.lateValidCount &&
    aFinding.lateInvalidCount === aPrimeFinding.lateInvalidCount &&
    aFinding.hardNonCompletionCount === aPrimeFinding.hardNonCompletionCount &&
    pairwiseLatencyComparisons.every((comparison) => {
      if (comparison.percentageDifference === null) return false;
      return Math.abs(comparison.percentageDifference) < 20;
    });

  let clarityEffect: DecisionClarityClassification["clarityEffect"] = "INSUFFICIENT_EVIDENCE";
  if (supportedByMisses || supportedByLatency) {
    clarityEffect = "CLARITY_EFFECT_SUPPORTED";
    if (controlImprovement) {
      notes.push(
        "The B control showed repeated later-position improvement, so attribution would be confounded.",
      );
    } else if (supportedByMisses) {
      notes.push("A_PRIME reduced service-deadline misses versus A across repeated repetitions.");
    } else {
      notes.push(
        "A_PRIME achieved materially lower completion latency than A across repeated paired positions.",
      );
    }
  } else if (contradictedByMisses || contradictedByLatency) {
    clarityEffect = "CLARITY_EFFECT_CONTRADICTED";
    if (controlDegradation) {
      notes.push(
        "The B control showed repeated later-position degradation, so contradiction would be confounded.",
      );
      clarityEffect = "INSUFFICIENT_EVIDENCE";
    } else if (contradictedByMisses) {
      notes.push("A_PRIME increased service-deadline misses versus A across repeated repetitions.");
    } else {
      notes.push(
        "A_PRIME showed materially higher completion latency than A across repeated paired positions.",
      );
    }
  } else if (materiallyEquivalent) {
    clarityEffect = "NO_CLARITY_EFFECT_OBSERVED";
    notes.push("A and A_PRIME showed materially equivalent completion-state and latency behavior.");
  } else {
    notes.push(
      "The complete schedule produced a mixed or one-off pattern that did not repeat strongly enough for attribution.",
    );
  }

  return {
    contractFindings,
    pairwiseLatencyComparisons,
    classification: {
      clarityEffect,
      completeVerifiedEvidence,
      notes,
    },
  };
}

export async function runOneDecisionClarityTrial(args: {
  config: LocalVlmResolvedConfig;
  trial: ScheduledTrial;
  sourceBytes: Uint8Array;
  sourceMediaType: string;
  sourceWidth: number;
  sourceHeight: number;
  fingerprints: readonly DecisionClarityCanonicalFingerprint[];
  serviceDeadlineMs: number;
  hardCeilingMs: number;
  mutatePreparedTrialRequest?: (
    trial: ScheduledTrial,
    prepared: DecisionClarityPreparedTrialRequest,
  ) => DecisionClarityPreparedTrialRequest;
  mutateLaunchSpec?: (
    trial: ScheduledTrial,
    launchSpec: LlamaServerLaunchSpec,
  ) => LlamaServerLaunchSpec;
  inspectPreparedTrialRequest?: (
    trial: ScheduledTrial,
    prepared: DecisionClarityPreparedTrialRequest,
  ) => void;
  inspectTransmittedRequestBody?: (
    trial: ScheduledTrial,
    requestBody: ReturnType<typeof buildVisionChatRequestBody>,
  ) => void;
}): Promise<{ report: DecisionClarityTrialReport; fatalStopReason: string | null }> {
  const workspaceDir = await mkdtemp(
    join(
      tmpdir(),
      `local-vlm-decision-clarity-${args.trial.sequenceNumber}-${args.trial.contract}-`,
    ),
  );
  const observationRunId = randomUUID();
  const expectedFingerprint = fingerprintSnapshotForContract(
    args.fingerprints,
    args.trial.contract,
  );
  let owner: Awaited<ReturnType<typeof spawnOwnedLlamaServerProcess>> | null = null;
  let cleanupCompleted = false;
  let resources: LocalVlmResourceTelemetry | null = null;
  let transport: DecisionClarityTransportOutcome | null = null;
  let measuredFingerprint: DecisionClarityFingerprintSnapshot | null = null;
  let fingerprintComparison = compareDecisionClarityFingerprintSnapshots({
    expected: expectedFingerprint,
    measured: null,
  });
  let sourceBuilder = expectedFingerprint.sourceBuilder;
  let completionState: DecisionClarityCompletionState = "PROVENANCE_FAILURE";
  let summary = "The trial failed before the decision-clarity request completed.";
  let issues: string[] = [];
  let fatalStopReason: string | null = null;
  let serviceDeadlineMet: boolean | null = null;
  let postDeadlineDurationMs: number | null = null;
  let requestSent = false;
  let requestStartedAt: string | null = null;
  let serviceDeadlineAt: string | null = null;
  let hardCeilingAt: string | null = null;

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
        issues = [
          "Overlay image exceeds the configured input-byte budget.",
          `overlayBytes=${overlayBytes.byteLength}`,
          `limit=${args.config.maxImageBytes}`,
        ];
        fatalStopReason = "overlay image exceeded configured input-byte budget";
      } else {
        let prepared = buildDecisionClarityPreparedTrialRequest({
          config: args.config,
          contract: args.trial.contract,
          observationRunId,
          overlayBytes: new Uint8Array(overlayBytes),
          overlayMediaType: derivative.value.mediaType,
        });
        if (args.mutatePreparedTrialRequest) {
          prepared = args.mutatePreparedTrialRequest(args.trial, prepared);
        }
        args.inspectPreparedTrialRequest?.(args.trial, prepared);

        measuredFingerprint = buildDecisionClarityFingerprintComputation({
          observationRunId: prepared.observationRunId,
          contract: args.trial.contract,
          sourceBuilder: prepared.spec.sourceBuilder,
          requestBody: prepared.requestBody,
        }).snapshot;
        fingerprintComparison = compareDecisionClarityFingerprintSnapshots({
          expected: expectedFingerprint,
          measured: measuredFingerprint,
        });
        sourceBuilder = prepared.spec.sourceBuilder;

        if (!fingerprintComparison.allFieldsMatched) {
          completionState = "PROVENANCE_FAILURE";
          summary =
            "The actual trial request did not match the preregistered contract, so the request was not sent.";
          issues = [
            "Harness provenance failure: the measured trial fingerprint diverged from the preregistered fingerprint.",
            `mismatchedFields=${fingerprintComparison.mismatchedFields.join(",")}`,
            `expectedRequestBodyDigest=${expectedFingerprint.requestBodyDigest}`,
            `measuredRequestBodyDigest=${measuredFingerprint.requestBodyDigest}`,
          ];
          fatalStopReason = `request fingerprint mismatch at sequence ${args.trial.sequenceNumber}`;
        } else {
          let launchSpec = buildLlamaServerLaunchSpec(args.config, 0);
          if (args.mutateLaunchSpec) {
            launchSpec = args.mutateLaunchSpec(args.trial, launchSpec);
          }

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
          requestStartedAt = new Date().toISOString();
          serviceDeadlineAt = new Date(
            new Date(requestStartedAt).getTime() + args.serviceDeadlineMs,
          ).toISOString();
          hardCeilingAt = new Date(
            new Date(requestStartedAt).getTime() + args.hardCeilingMs,
          ).toISOString();
          args.inspectTransmittedRequestBody?.(args.trial, prepared.requestBody);
          requestSent = true;
          transport = await sendDecisionClarityRequest({
            config: args.config,
            port: owner.telemetry.port,
            signal: new AbortController().signal,
            requestBody: prepared.requestBody,
            requestStartedAt,
            serviceDeadlineAt,
            hardCeilingAt,
            serviceDeadlineMs: args.serviceDeadlineMs,
            hardCeilingMs: args.hardCeilingMs,
          });

          if (transport.transportCompletedAt !== null || transport.completionAt !== null) {
            owner.markRequestCompleted();
          }

          if (transport.kind === "runtime-failure") {
            completionState = (await ownerExitedSoon(owner))
              ? "PROCESS_FAILURE"
              : "TRANSPORT_FAILURE";
            issues = [...transport.issues];
            summary =
              completionState === "PROCESS_FAILURE"
                ? "The request was sent, but the diagnostic runtime exited before a terminal completion state was reached."
                : "The request was sent, but the transport failed before a terminal completion state was reached.";
          } else {
            const completion = completionStateFromOutcome({
              transport,
              contract: args.trial.contract,
              observationRunId: prepared.observationRunId,
            });
            completionState = completion.completionState;
            serviceDeadlineMet = completion.serviceDeadlineMet;
            postDeadlineDurationMs = completion.postDeadlineDurationMs;
            issues = [...completion.issues];
            summary =
              completionState === "TIMELY_VALID_COMPLETION"
                ? "The trial completed within the 30-second service deadline and satisfied the diagnostic contract."
                : completionState === "TIMELY_INVALID_COMPLETION"
                  ? "The trial completed within the service deadline, but the response was invalid for the diagnostic contract."
                  : completionState === "LATE_VALID_COMPLETION"
                    ? "The trial missed the service deadline but completed with a valid response before the hard ceiling."
                    : completionState === "LATE_INVALID_COMPLETION"
                      ? "The trial missed the service deadline and completed with an invalid response before the hard ceiling."
                      : "The trial did not complete before the hard diagnostic ceiling.";
          }
        }
      }
    }
  } catch (error) {
    const failure = localVlmFailureFromUnknown(error);
    issues = [failure.message, ...failure.issues];
    if (!requestSent) {
      completionState = "REQUEST_NOT_SENT";
      summary =
        owner?.telemetry.readiness.processExitedBeforeReady === true
          ? "The request was never sent because the diagnostic runtime exited before readiness."
          : "The request was never sent because the trial failed before transmission.";
      fatalStopReason = [failure.message, ...failure.issues].join("; ");
    } else if (failure.code === "REQUEST_TIMEOUT") {
      completionState = "HARD_NON_COMPLETION";
      summary = "The trial did not complete before the hard diagnostic ceiling.";
      fatalStopReason = null;
    } else {
      completionState = (await ownerExitedSoon(owner)) ? "PROCESS_FAILURE" : "TRANSPORT_FAILURE";
      summary =
        completionState === "PROCESS_FAILURE"
          ? "The request was sent, but the diagnostic runtime exited before a terminal completion state was reached."
          : "The request was sent, but the transport failed before a terminal completion state was reached.";
      fatalStopReason = null;
    }
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
      status: statusFromCompletionState(completionState),
      completionState,
      summary,
      issues,
      blockedBySequenceNumber: null,
      evidence: evidenceFromRun({
        requestStartedAt,
        serviceDeadlineAt,
        hardCeilingAt,
        workspaceDir,
        cleanupCompleted,
        owner,
        resources,
        transport,
        serviceDeadlineMet,
        postDeadlineDurationMs,
      }),
    },
    fatalStopReason,
  };
}

export async function runLocalVlmDecisionClarityDiagnostic(args: {
  config: LocalVlmResolvedConfig;
  scenarioId: string;
  sourceArtifactRef: string;
  sourceBytes: Uint8Array;
  sourceMediaType: string;
  sourceWidth: number;
  sourceHeight: number;
  serviceDeadlineMs?: number;
  hardCeilingMs?: number;
  mutatePreparedTrialRequest?: (
    trial: ScheduledTrial,
    prepared: DecisionClarityPreparedTrialRequest,
  ) => DecisionClarityPreparedTrialRequest;
  mutateLaunchSpec?: (
    trial: ScheduledTrial,
    launchSpec: LlamaServerLaunchSpec,
  ) => LlamaServerLaunchSpec;
  inspectPreparedTrialRequest?: (
    trial: ScheduledTrial,
    prepared: DecisionClarityPreparedTrialRequest,
  ) => void;
  inspectTransmittedRequestBody?: (
    trial: ScheduledTrial,
    requestBody: ReturnType<typeof buildVisionChatRequestBody>,
  ) => void;
}): Promise<DecisionClarityDiagnosticReport> {
  const serviceDeadlineMs = args.serviceDeadlineMs ?? DECISION_CLARITY_SERVICE_DEADLINE_MS;
  const hardCeilingMs = args.hardCeilingMs ?? DECISION_CLARITY_HARD_CEILING_MS;
  if (hardCeilingMs <= serviceDeadlineMs) {
    throw new Error("hardCeilingMs must be greater than serviceDeadlineMs");
  }

  const runtimeVersion = await readLlamaVersionOutput(args.config);
  const fingerprintOverlay = await buildDecisionClarityFingerprintOverlay({
    sourceBytes: args.sourceBytes,
    sourceMediaType: args.sourceMediaType,
    sourceWidth: args.sourceWidth,
    sourceHeight: args.sourceHeight,
  });
  const requestFingerprints = buildDecisionClarityCanonicalFingerprints({
    config: args.config,
    overlayBytes: fingerprintOverlay.overlayBytes,
    overlayMediaType: fingerprintOverlay.overlayMediaType,
    observationRunId: randomUUID(),
  });
  const schedule = buildDecisionClaritySchedule();
  const trials: DecisionClarityTrialReport[] = [];
  let fatalStopReason: string | null = null;
  let blockedBySequenceNumber: number | null = null;

  for (const trial of schedule) {
    if (fatalStopReason !== null && blockedBySequenceNumber !== null) {
      trials.push(
        buildBlockedDecisionClarityTrialReport({
          trial,
          spec: buildDecisionClaritySpec(
            trial.contract,
            FINGERPRINT_OBSERVATION_RUN_ID_PLACEHOLDER,
          ),
          fingerprints: requestFingerprints,
          blockedBySequenceNumber,
          reason: fatalStopReason,
        }),
      );
      continue;
    }

    const result = await runOneDecisionClarityTrial({
      config: args.config,
      trial,
      sourceBytes: args.sourceBytes,
      sourceMediaType: args.sourceMediaType,
      sourceWidth: args.sourceWidth,
      sourceHeight: args.sourceHeight,
      fingerprints: requestFingerprints,
      serviceDeadlineMs,
      hardCeilingMs,
      mutatePreparedTrialRequest: args.mutatePreparedTrialRequest,
      mutateLaunchSpec: args.mutateLaunchSpec,
      inspectPreparedTrialRequest: args.inspectPreparedTrialRequest,
      inspectTransmittedRequestBody: args.inspectTransmittedRequestBody,
    });
    trials.push(result.report);
    if (result.fatalStopReason !== null) {
      fatalStopReason = result.fatalStopReason;
      blockedBySequenceNumber = trial.sequenceNumber;
    }
  }

  const classified = classifyDecisionClarityTrials(trials);

  return {
    schemaVersion: DECISION_CLARITY_DIAGNOSTIC_SCHEMA_VERSION,
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
      configuredRequestTimeoutMs: args.config.requestTimeoutMs,
    },
    deadlines: {
      serviceDeadlineMs,
      hardCeilingMs,
    },
    source: {
      scenarioId: args.scenarioId,
      sourceArtifactRef: args.sourceArtifactRef,
      sourceMediaType: args.sourceMediaType,
      sourceWidth: args.sourceWidth,
      sourceHeight: args.sourceHeight,
    },
    schedule: {
      sequence: DECISION_CLARITY_SEQUENCE,
      repetitions: DECISION_CLARITY_REPETITIONS,
      totalTrials: schedule.length,
    },
    requestFingerprints,
    trials,
    contractFindings: classified.contractFindings,
    pairwiseLatencyComparisons: classified.pairwiseLatencyComparisons,
    classification: classified.classification,
    fatalStopReason,
  };
}

export async function writeDecisionClarityDiagnosticFiles(args: {
  report: DecisionClarityDiagnosticReport;
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
    `- Clarity-effect classification: ${args.report.classification.clarityEffect}`,
    `- Fatal stop reason: ${args.report.fatalStopReason ?? "none"}`,
    `- Schedule: ${args.report.schedule.sequence.join(" -> ")} x ${args.report.schedule.repetitions}`,
    `- Service deadline: ${args.report.deadlines.serviceDeadlineMs} ms`,
    `- Hard ceiling: ${args.report.deadlines.hardCeilingMs} ms`,
    "",
    "## Contract Findings",
    "",
    ...args.report.contractFindings.map((finding) => {
      return `- ${finding.contract}: timelyValid=${finding.timelyValidCount}; timelyInvalid=${finding.timelyInvalidCount}; lateValid=${finding.lateValidCount}; lateInvalid=${finding.lateInvalidCount}; hardNonCompletion=${finding.hardNonCompletionCount}; blocked=${finding.blockedCount}; fingerprintMismatch=${finding.fingerprintMismatchCount}`;
    }),
    "",
    "## Pairwise Latency",
    "",
    ...args.report.pairwiseLatencyComparisons.map((comparison) => {
      return `- repetition ${comparison.repetitionNumber} pair ${comparison.pairIndex}: A=${comparison.aCompletionLatencyMs ?? "null"} ms; A_PRIME=${comparison.aPrimeCompletionLatencyMs ?? "null"} ms; delta=${comparison.rawLatencyDifferenceMs ?? "null"} ms; pct=${comparison.percentageDifference === null ? "null" : `${comparison.percentageDifference.toFixed(2)}%`}`;
    }),
    "",
    "## Trials",
    "",
    ...args.report.trials.map((trial) => {
      const preview = trial.evidence?.boundedOutputPreview ?? "null";
      const completionLatencyMs = trial.evidence?.completionLatencyMs ?? "null";
      const measured = trial.requestFingerprint.measured?.requestBodyDigest ?? "null";
      return `- #${trial.sequenceNumber} rep${trial.repetitionNumber} pos${trial.sequencePosition} ${trial.contract}: ${trial.status}; completionState=${trial.completionState}; expectedFingerprint=${trial.requestFingerprint.expected.requestBodyDigest}; measuredFingerprint=${measured}; fingerprintVerified=${String(trial.requestFingerprint.allFieldsMatched)}; completionLatencyMs=${completionLatencyMs}; serviceDeadlineMet=${trial.evidence?.serviceDeadlineMet === null ? "null" : String(trial.evidence?.serviceDeadlineMet)}; timeoutStage=${trial.evidence?.timeoutStage ?? "null"}; preview=${preview}`;
    }),
  ].join("\n");
  await writeFile(jsonPath, `${JSON.stringify(args.report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, `${markdown}\n`, "utf8");
  return { jsonPath, markdownPath };
}
