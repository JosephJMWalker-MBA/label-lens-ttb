import type { VisionObservationErrorRecord, VisionObserverResult } from "../observer-grid.types";

export const LOCAL_VLM_CONFIG_SCHEMA_VERSION = "local-vlm-config.v1" as const;
export const LOCAL_VLM_REPORT_SCHEMA_VERSION = "strict-local-vlm-report.v1" as const;
export const LLAMA_SERVER_ADAPTER_ID = "llama-server-strict-isolation-observer" as const;
export const LLAMA_SERVER_ADAPTER_VERSION = "1.0.0" as const;

export const LOCAL_VLM_DECISIONS = [
  "STATELESS OBSERVER BOUNDARY SUPPORTED",
  "CONTEXT CONTAMINATION DETECTED",
  "RESOURCE LIFECYCLE BOUNDED",
  "RESOURCE LIFECYCLE NOT BOUNDED",
  "MIXED RESULT",
  "INSUFFICIENT EVIDENCE",
] as const;

export type LocalVlmDecision = (typeof LOCAL_VLM_DECISIONS)[number];

export interface LocalVlmConfigInput {
  LLAMA_SERVER_BIN?: string;
  LLAMA_SERVER_SHA256?: string;
  VLM_MODEL_PATH?: string;
  VLM_MMPROJ_PATH?: string;
  VLM_MODEL_SHA256?: string;
  VLM_MMPROJ_SHA256?: string;
  VLM_HOST?: string;
  VLM_STARTUP_TIMEOUT_MS?: string;
  VLM_REQUEST_TIMEOUT_MS?: string;
  VLM_TERMINATION_TIMEOUT_MS?: string;
  VLM_MAX_IMAGE_BYTES?: string;
  VLM_MAX_OUTPUT_TOKENS?: string;
  VLM_CONTEXT_SIZE?: string;
  VLM_GPU_LAYERS?: string;
  VLM_THREADS?: string;
}

export interface LocalVlmResolvedConfig {
  schemaVersion: typeof LOCAL_VLM_CONFIG_SCHEMA_VERSION;
  llamaServerBin: string;
  llamaExecutableSha256: string;
  llamaVersionArgs: readonly string[];
  modelPath: string;
  modelSha256: string;
  modelFileSize: number;
  modelDisplayId: string;
  modelQuantization: string | null;
  mmprojPath: string | null;
  mmprojSha256: string | null;
  mmprojFileSize: number | null;
  host: string;
  startupTimeoutMs: number;
  requestTimeoutMs: number;
  terminationTimeoutMs: number;
  maxImageBytes: number;
  maxOutputTokens: number;
  contextSize: number;
  gpuLayers: number | null;
  threadCount: number | null;
  responseBytesMax: number;
  stdoutBytesMax: number;
  stderrBytesMax: number;
  resourceSampleIntervalMs: number;
  maxProposalsPerImage: number;
  maxReasonCodesPerProposal: number;
  maxDescriptionLength: number;
  temperature: 0;
  seed: number;
  readinessPath: "/health";
  chatCompletionsPath: "/v1/chat/completions";
}

export interface LocalVlmConfigError {
  code:
    | "MISSING_CONFIG"
    | "INVALID_PATH"
    | "INVALID_DIGEST"
    | "INVALID_HOST"
    | "INVALID_NUMBER"
    | "UNSAFE_ARGUMENT";
  message: string;
  issues: readonly string[];
}

export interface LlamaServerLaunchSpec {
  command: string;
  args: readonly string[];
  host: string;
  port: number;
  sanitizedRuntimeArguments: readonly string[];
}

export interface LocalVlmReadinessTelemetry {
  attempts: number;
  firstSuccessfulReadyAt: string | null;
  totalStartupLatencyMs: number | null;
  lastReadinessError: string | null;
  processExitedBeforeReady: boolean;
  startupTimedOut: boolean;
}

export interface LocalVlmProcessTelemetry {
  pid: number | null;
  processGroupId: number | null;
  port: number;
  spawnedAt: string | null;
  readyAt: string | null;
  requestStartedAt: string | null;
  requestCompletedAt: string | null;
  terminationRequestedAt: string | null;
  exitedAt: string | null;
  exitCode: number | null;
  exitSignal: string | null;
  forcedTermination: boolean;
  stdoutBytes: number;
  stderrBytes: number;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  readiness: LocalVlmReadinessTelemetry;
  portReleased: boolean | null;
}

export interface LocalVlmGpuTelemetry {
  available: boolean;
  sampleCount: number;
  peakBytes: number | null;
  lastBytes: number | null;
  failureCount: number;
}

export interface LocalVlmResourceTelemetry {
  workspaceBytesBeforeStart: number;
  workspacePeakBytes: number;
  workspaceBytesBeforeCleanup: number;
  workspaceBytesAfterCleanup: number | null;
  fileCountPeak: number;
  filesCreated: number;
  quarantinedFiles: number;
  processRssBytesBeforeTermination: number | null;
  peakProcessRssBytes: number | null;
  peakProcessTreeRssBytes: number | null;
  processRssBytesAfterTermination: number | null;
  sampleCount: number;
  sampleFailureCount: number;
  gpu: LocalVlmGpuTelemetry;
}

export interface LocalVlmTimingTelemetry {
  startupMs: number | null;
  readinessMs: number | null;
  requestMs: number | null;
  parseMs: number | null;
  terminationMs: number | null;
  totalWallMs: number | null;
}

export interface LocalVlmValidationTelemetry {
  transportSuccess: boolean;
  jsonExtractionSuccess: boolean;
  schemaSuccess: boolean;
  prohibitedLanguageSuccess: boolean;
  geometrySuccess: boolean;
}

export interface LocalVlmOutputTelemetry {
  rawResponseDigest: string | null;
  structuredResponseDigest: string | null;
  responseBytes: number;
  schemaValid: boolean;
  prohibitedClaimDetected: boolean;
  proposalCount: number;
  duplicateProposalIdsDetected: boolean;
}

export interface LocalVlmAdapterRunSnapshot {
  observationRunId: string;
  sourceArtifactRef: string;
  sourceImageSha256: string;
  overlaySha256: string;
  promptId: string;
  promptVersion: string;
  promptSha256: string;
  adapterId: string;
  adapterVersion: string;
  process: LocalVlmProcessTelemetry;
  resources: LocalVlmResourceTelemetry;
  timing: LocalVlmTimingTelemetry;
  validation: LocalVlmValidationTelemetry;
  output: LocalVlmOutputTelemetry;
  runtimeArguments: readonly string[];
  llamaExecutablePathOrRef: string;
  llamaExecutableSha256: string;
  llamaVersionOutput: string | null;
  modelPathOrRef: string;
  modelSha256: string;
  modelFileSize: number;
  modelDisplayId: string;
  modelQuantization: string | null;
  projectorPathOrRef: string | null;
  projectorSha256: string | null;
  projectorFileSize: number | null;
  contextSize: number;
  maxOutputTokens: number;
  temperature: 0;
  seed: number;
  threadCount: number | null;
  gpuLayerSetting: number | null;
  observerResult: VisionObserverResult | null;
  rawResponseText: string | null;
  errorRecord: VisionObservationErrorRecord | null;
}

export interface LocalVlmObservationFailureShape {
  code:
    | "READINESS_TIMEOUT"
    | "PROCESS_EXIT_BEFORE_READY"
    | "REQUEST_TIMEOUT"
    | "RESPONSE_TOO_LARGE"
    | "INVALID_OBSERVER_OUTPUT"
    | "PROCESS_TERMINATION_FAILED"
    | "PORT_RELEASE_FAILED"
    | "CONFIG_INVALID";
  message: string;
  issues: readonly string[];
}

export interface LocalVlmRunReport {
  observationRunId: string;
  sourceArtifactRef: string;
  sourceImageSha256: string;
  overlaySha256: string;
  process: LocalVlmProcessTelemetry;
  resources: LocalVlmResourceTelemetry;
  timing: LocalVlmTimingTelemetry;
  rawResponseDigest: string | null;
  structuredResponseDigest: string | null;
  schemaValid: boolean;
  prohibitedClaimDetected: boolean;
  contaminationTokensDetected: readonly string[];
  cleanupCompleted: boolean;
  forcedTermination: boolean;
  transportSuccess: boolean;
  jsonExtractionSuccess: boolean;
  schemaSuccess: boolean;
  prohibitedLanguageSuccess: boolean;
  geometrySuccess: boolean;
  errorRecord: VisionObservationErrorRecord | LocalVlmObservationFailureShape | null;
}

export interface LocalVlmAggregateReport {
  runCount: number;
  validResponseCount: number;
  invalidResponseCount: number;
  contaminationCount: number;
  cleanupFailureCount: number;
  forcedTerminationCount: number;
  prohibitedClaimCount: number;
  schemaFailureCount: number;
  peakRssSummary: {
    peakProcessRssBytes: number | null;
    peakProcessTreeRssBytes: number | null;
  };
  workspaceSummary: {
    maxWorkspaceBytes: number;
    maxWorkspaceFiles: number;
  };
  latencySummary: {
    maxStartupMs: number | null;
    maxRequestMs: number | null;
    maxTerminationMs: number | null;
  };
}

export interface LocalVlmExperimentReport {
  schemaVersion: typeof LOCAL_VLM_REPORT_SCHEMA_VERSION;
  generatedAt: string;
  gitCommit: string;
  runtime: {
    executableDigest: string | null;
    runtimeVersion: string | null;
  };
  model: {
    modelDigest: string | null;
    projectorDigest: string | null;
    quantization: string | null;
  };
  prompt: {
    promptId: string;
    promptVersion: string;
    promptDigest: string;
  };
  configuration: {
    sanitizedRuntimeArguments: readonly string[];
    isolationMode: "one-process-per-observation";
  };
  runs: readonly LocalVlmRunReport[];
  aggregate: LocalVlmAggregateReport;
  decision: LocalVlmDecision;
}
