import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";

import type {
  VisionObservationErrorRecord,
  VisionObserverAdapter,
  VisionObserverInput,
  VisionObserverResult,
} from "../observer-grid.types";

import { buildLlamaServerLaunchSpec, readLlamaVersionOutput } from "./llama-server-config";
import { sendObservationRequest, waitForReadiness } from "./llama-server-client";
import {
  LLAMA_SERVER_ADAPTER_ID,
  LLAMA_SERVER_ADAPTER_VERSION,
  type LocalVlmAdapterRunSnapshot,
  type LocalVlmObservationFailureShape,
  type LocalVlmResolvedConfig,
} from "./local-vlm.types";
import {
  LOCAL_VLM_PROMPT_ID,
  LOCAL_VLM_PROMPT_SHA256,
  LOCAL_VLM_PROMPT_VERSION,
} from "./observer-prompt";
import { parseObserverResponse } from "./observer-response-parser";
import { spawnOwnedLlamaServerProcess, localVlmFailureFromUnknown } from "./llama-server-process";

function immutableObservationError(
  failure: LocalVlmObservationFailureShape,
): VisionObservationErrorRecord {
  switch (failure.code) {
    case "READINESS_TIMEOUT":
    case "REQUEST_TIMEOUT":
      return Object.freeze({
        immutable: true,
        code: "OBSERVER_TIMEOUT",
        stage: "observe",
        message: failure.message,
        issues: Object.freeze([...failure.issues]),
      });
    case "INVALID_OBSERVER_OUTPUT":
    case "RESPONSE_TOO_LARGE":
      return Object.freeze({
        immutable: true,
        code: "INVALID_OBSERVER_OUTPUT",
        stage: "proposal-validate",
        message: failure.message,
        issues: Object.freeze([...failure.issues]),
      });
    default:
      return Object.freeze({
        immutable: true,
        code: "OBSERVER_EXCEPTION",
        stage: "observe",
        message: failure.message,
        issues: Object.freeze([...failure.issues]),
      });
  }
}

function proposalCount(observerResult: VisionObserverResult | null): number {
  return observerResult?.proposals.length ?? 0;
}

export class LlamaServerVisionObserverAdapter implements VisionObserverAdapter {
  readonly adapterId = LLAMA_SERVER_ADAPTER_ID;
  readonly adapterVersion = LLAMA_SERVER_ADAPTER_VERSION;
  readonly promptId = LOCAL_VLM_PROMPT_ID;
  readonly promptVersion = LOCAL_VLM_PROMPT_VERSION;

  readonly #config: LocalVlmResolvedConfig;
  #disposed = false;
  #lastSnapshot: LocalVlmAdapterRunSnapshot | null = null;

  constructor(config: LocalVlmResolvedConfig) {
    this.#config = config;
  }

  getLastRunSnapshot(): LocalVlmAdapterRunSnapshot | null {
    return this.#lastSnapshot;
  }

  async observe(input: VisionObserverInput, signal: AbortSignal): Promise<VisionObserverResult> {
    if (this.#disposed) throw new Error("llama-server observer adapter has been disposed");

    const launchSpec = buildLlamaServerLaunchSpec(this.#config, 0);
    const owner = await spawnOwnedLlamaServerProcess({
      launchSpec,
      workspaceDir: input.workspaceDir,
      host: this.#config.host,
      stdoutBytesMax: this.#config.stdoutBytesMax,
      stderrBytesMax: this.#config.stderrBytesMax,
      resourceSampleIntervalMs: this.#config.resourceSampleIntervalMs,
      terminationTimeoutMs: this.#config.terminationTimeoutMs,
    });
    const startedAt = performance.now();
    const llamaVersionOutput = await readLlamaVersionOutput(this.#config);

    let rawResponseText: string | null = null;
    let rawResponseDigest: string | null = null;
    let structuredResponseDigest: string | null = null;
    let schemaValid = false;
    let prohibitedClaimDetected = false;
    let duplicateProposalIdsDetected = false;
    let transportSuccess = false;
    let jsonExtractionSuccess = false;
    let schemaSuccess = false;
    let prohibitedLanguageSuccess = false;
    let geometrySuccess = false;
    let requestStartedAt: number | null = null;
    let requestCompletedAt: number | null = null;
    let parseStartedAt: number | null = null;
    let parseCompletedAt: number | null = null;
    let responseBytes = 0;
    let observerResult: VisionObserverResult | null = null;
    let errorRecord: VisionObservationErrorRecord | null = null;
    let observeFailure: unknown = null;

    try {
      await waitForReadiness({
        config: this.#config,
        port: owner.telemetry.port,
        signal,
        onAttempt: ({ ok, error }) => owner.noteReadinessAttempt(ok, error, startedAt),
      });

      owner.markRequestStarted();
      requestStartedAt = performance.now();
      const transport = await sendObservationRequest({
        config: this.#config,
        port: owner.telemetry.port,
        input,
        signal,
      });
      owner.markRequestCompleted();
      requestCompletedAt = performance.now();
      transportSuccess = true;
      rawResponseText = transport.text;
      responseBytes = transport.bytes;

      parseStartedAt = performance.now();
      const parsed = parseObserverResponse({
        observationRunId: input.observationRunId,
        rawResponseText: transport.text,
        responseBytes: transport.bytes,
        config: this.#config,
      });
      parseCompletedAt = performance.now();
      jsonExtractionSuccess = parsed.ok || parsed.parseState.jsonExtractionSuccess;
      schemaSuccess = parsed.ok || parsed.parseState.schemaSuccess;
      prohibitedClaimDetected = parsed.ok ? false : parsed.parseState.prohibitedClaimDetected;
      prohibitedLanguageSuccess = !prohibitedClaimDetected;
      duplicateProposalIdsDetected = parsed.ok
        ? parsed.value.duplicateProposalIdsDetected
        : parsed.parseState.duplicateProposalIdsDetected;

      if (!parsed.ok) {
        errorRecord = immutableObservationError(parsed.error);
        observeFailure = parsed.error;
      } else {
        observerResult = parsed.value.result;
        rawResponseDigest = parsed.value.rawResponseDigest;
        structuredResponseDigest = parsed.value.structuredResponseDigest;
        schemaValid = parsed.value.schemaValid;
        prohibitedClaimDetected = parsed.value.prohibitedClaimDetected;
        geometrySuccess = true;
      }
    } catch (error) {
      const failure = localVlmFailureFromUnknown(error);
      if (failure.code === "READINESS_TIMEOUT") owner.markReadinessTimeout();
      errorRecord = errorRecord ?? immutableObservationError(failure);
      observeFailure = error;
    }

    let workspaceBytesAfterCleanup: number | null = null;
    let terminationFailure: unknown = null;
    try {
      await owner.terminate();
    } catch (error) {
      const failure = localVlmFailureFromUnknown(error);
      errorRecord = immutableObservationError(failure);
      terminationFailure = error;
    }

    if (!existsSync(input.workspaceDir)) {
      workspaceBytesAfterCleanup = 0;
    } else {
      try {
        const info = await stat(input.workspaceDir);
        workspaceBytesAfterCleanup = info.isDirectory() ? 1 : info.size;
      } catch {
        workspaceBytesAfterCleanup = null;
      }
    }

    const resources = await owner.finalizeResources(workspaceBytesAfterCleanup);

    this.#lastSnapshot = {
      observationRunId: input.observationRunId,
      sourceArtifactRef: input.sourceArtifactRef,
      sourceImageSha256: input.sourceImageSha256,
      overlaySha256: input.overlaySha256,
      promptId: this.promptId,
      promptVersion: this.promptVersion,
      promptSha256: LOCAL_VLM_PROMPT_SHA256,
      adapterId: this.adapterId,
      adapterVersion: this.adapterVersion,
      process: owner.telemetry,
      resources,
      timing: {
        startupMs: owner.telemetry.readiness.totalStartupLatencyMs,
        readinessMs: owner.telemetry.readiness.totalStartupLatencyMs,
        requestMs:
          requestStartedAt !== null && requestCompletedAt !== null
            ? Math.max(0, requestCompletedAt - requestStartedAt)
            : null,
        parseMs:
          parseStartedAt !== null && parseCompletedAt !== null
            ? Math.max(0, parseCompletedAt - parseStartedAt)
            : null,
        terminationMs:
          owner.telemetry.terminationRequestedAt && owner.telemetry.exitedAt
            ? Date.parse(owner.telemetry.exitedAt) -
              Date.parse(owner.telemetry.terminationRequestedAt)
            : null,
        totalWallMs: Math.max(0, performance.now() - startedAt),
      },
      validation: {
        transportSuccess,
        jsonExtractionSuccess,
        schemaSuccess,
        prohibitedLanguageSuccess,
        geometrySuccess,
      },
      output: {
        rawResponseDigest,
        structuredResponseDigest,
        responseBytes,
        schemaValid,
        prohibitedClaimDetected,
        proposalCount: proposalCount(observerResult),
        duplicateProposalIdsDetected,
      },
      runtimeArguments: owner.launchSpec.sanitizedRuntimeArguments,
      llamaExecutablePathOrRef: this.#config.llamaServerBin,
      llamaExecutableSha256: this.#config.llamaExecutableSha256,
      llamaVersionOutput,
      modelPathOrRef: this.#config.modelPath,
      modelSha256: this.#config.modelSha256,
      modelFileSize: this.#config.modelFileSize,
      modelDisplayId: this.#config.modelDisplayId,
      modelQuantization: this.#config.modelQuantization,
      projectorPathOrRef: this.#config.mmprojPath,
      projectorSha256: this.#config.mmprojSha256,
      projectorFileSize: this.#config.mmprojFileSize,
      contextSize: this.#config.contextSize,
      maxOutputTokens: this.#config.maxOutputTokens,
      temperature: this.#config.temperature,
      seed: this.#config.seed,
      threadCount: this.#config.threadCount,
      gpuLayerSetting: this.#config.gpuLayers,
      observerResult,
      rawResponseText,
      errorRecord,
    };

    if (terminationFailure !== null) throw terminationFailure;
    if (observeFailure !== null) throw observeFailure;
    if (observerResult === null) {
      throw new Error("llama-server observer completed without a result");
    }
    return observerResult;
  }

  async dispose(): Promise<void> {
    this.#disposed = true;
  }
}
