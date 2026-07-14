import { createHash } from "node:crypto";
import { constants as fsConstants, createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import { basename } from "node:path";
import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";

import { err, ok, type Result } from "../../../../shared/result";

import { validateLocalVlmResolvedConfig } from "./local-vlm.schema";
import type {
  LlamaServerLaunchSpec,
  LocalVlmConfigError,
  LocalVlmConfigInput,
  LocalVlmResolvedConfig,
} from "./local-vlm.types";
import { LOCAL_VLM_CONFIG_SCHEMA_VERSION } from "./local-vlm.types";

const execFile = promisify(execFileCb);

const DEFAULTS = {
  host: "127.0.0.1",
  startupTimeoutMs: 20_000,
  requestTimeoutMs: 30_000,
  terminationTimeoutMs: 5_000,
  maxImageBytes: 6_000_000,
  maxOutputTokens: 900,
  contextSize: 4_096,
  responseBytesMax: 24_000,
  stdoutBytesMax: 64_000,
  stderrBytesMax: 64_000,
  resourceSampleIntervalMs: 250,
  maxProposalsPerImage: 12,
  maxReasonCodesPerProposal: 9,
  maxDescriptionLength: 160,
  seed: 17,
  temperature: 0 as const,
} as const;

async function sha256File(path: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function invalid(
  code: LocalVlmConfigError["code"],
  message: string,
  issues: string[],
): Result<never, LocalVlmConfigError> {
  return err({ code, message, issues });
}

function parsePositiveInt(
  value: string | undefined,
  fallback: number,
  name: string,
): Result<number, LocalVlmConfigError> {
  if (value === undefined || value.trim() === "") return ok(fallback);
  if (!/^-?\d+$/.test(value.trim())) {
    return invalid("INVALID_NUMBER", `${name} must be an integer.`, [`${name}=${value}`]);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return invalid("INVALID_NUMBER", `${name} must be a positive integer.`, [`${name}=${value}`]);
  }
  return ok(parsed);
}

function parseOptionalNonNegativeInt(
  value: string | undefined,
  name: string,
): Result<number | null, LocalVlmConfigError> {
  if (value === undefined || value.trim() === "") return ok(null);
  if (!/^-?\d+$/.test(value.trim())) {
    return invalid("INVALID_NUMBER", `${name} must be an integer.`, [`${name}=${value}`]);
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    return invalid("INVALID_NUMBER", `${name} must be a non-negative integer.`, [
      `${name}=${value}`,
    ]);
  }
  return ok(parsed);
}

function isLoopbackHost(host: string): boolean {
  if (host === "::1") return true;
  const parts = host.split(".");
  if (parts.length !== 4 || parts[0] !== "127") return false;
  return parts.every((part) => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}

function rejectUnsafeArgumentValue(
  value: string,
  name: string,
): Result<string, LocalVlmConfigError> {
  const trimmed = value.trim();
  if (!trimmed) {
    return invalid("INVALID_PATH", `${name} is required.`, [`${name} is empty`]);
  }
  if (trimmed.startsWith("-")) {
    return invalid("UNSAFE_ARGUMENT", `${name} cannot begin with '-'.`, [`${name}=${trimmed}`]);
  }
  if (/[\r\n]/.test(trimmed)) {
    return invalid("UNSAFE_ARGUMENT", `${name} cannot contain line breaks.`, [
      `${name}=${trimmed}`,
    ]);
  }
  return ok(trimmed);
}

async function validateExecutablePath(path: string, name: string) {
  await access(path);
  const stats = await stat(path);
  if (!stats.isFile()) {
    throw new Error(`${name} must be a regular file`);
  }
  await access(path, fsConstants.X_OK);
}

async function validateRegularFile(path: string, name: string) {
  await access(path);
  const stats = await stat(path);
  if (!stats.isFile()) {
    throw new Error(`${name} must be a regular file`);
  }
  return stats.size;
}

function discoverQuantization(modelDisplayId: string): string | null {
  const match = modelDisplayId.match(/(?:^|[-_.])(Q\d[^-_.]*)/i);
  return match?.[1] ?? null;
}

export function localVlmConfigPresent(input: LocalVlmConfigInput): boolean {
  return Boolean(
    input.LLAMA_SERVER_BIN &&
    input.LLAMA_SERVER_SHA256 &&
    input.VLM_MODEL_PATH &&
    input.VLM_MODEL_SHA256,
  );
}

export async function resolveLocalVlmConfig(
  input: LocalVlmConfigInput,
): Promise<Result<LocalVlmResolvedConfig, LocalVlmConfigError>> {
  if (!localVlmConfigPresent(input)) {
    return invalid("MISSING_CONFIG", "Local VLM configuration is absent.", [
      "LLAMA_SERVER_BIN, LLAMA_SERVER_SHA256, VLM_MODEL_PATH, and VLM_MODEL_SHA256 are required for local execution.",
    ]);
  }

  const bin = rejectUnsafeArgumentValue(input.LLAMA_SERVER_BIN!, "LLAMA_SERVER_BIN");
  if (!bin.ok) return bin;
  const executableSha = rejectUnsafeArgumentValue(
    input.LLAMA_SERVER_SHA256!,
    "LLAMA_SERVER_SHA256",
  );
  if (!executableSha.ok) return executableSha;
  const modelPath = rejectUnsafeArgumentValue(input.VLM_MODEL_PATH!, "VLM_MODEL_PATH");
  if (!modelPath.ok) return modelPath;
  const modelSha = rejectUnsafeArgumentValue(input.VLM_MODEL_SHA256!, "VLM_MODEL_SHA256");
  if (!modelSha.ok) return modelSha;
  const mmprojPath =
    input.VLM_MMPROJ_PATH === undefined || input.VLM_MMPROJ_PATH.trim() === ""
      ? ok<string | null>(null)
      : rejectUnsafeArgumentValue(input.VLM_MMPROJ_PATH, "VLM_MMPROJ_PATH");
  if (!mmprojPath.ok) return mmprojPath;
  const mmprojSha =
    input.VLM_MMPROJ_SHA256 === undefined || input.VLM_MMPROJ_SHA256.trim() === ""
      ? ok<string | null>(null)
      : rejectUnsafeArgumentValue(input.VLM_MMPROJ_SHA256, "VLM_MMPROJ_SHA256");
  if (!mmprojSha.ok) return mmprojSha;
  if ((mmprojPath.value === null) !== (mmprojSha.value === null)) {
    return invalid(
      "INVALID_DIGEST",
      "Projector path and digest must both be set or both be absent.",
      [],
    );
  }

  const startupTimeoutMs = parsePositiveInt(
    input.VLM_STARTUP_TIMEOUT_MS,
    DEFAULTS.startupTimeoutMs,
    "VLM_STARTUP_TIMEOUT_MS",
  );
  if (!startupTimeoutMs.ok) return startupTimeoutMs;
  const requestTimeoutMs = parsePositiveInt(
    input.VLM_REQUEST_TIMEOUT_MS,
    DEFAULTS.requestTimeoutMs,
    "VLM_REQUEST_TIMEOUT_MS",
  );
  if (!requestTimeoutMs.ok) return requestTimeoutMs;
  const terminationTimeoutMs = parsePositiveInt(
    input.VLM_TERMINATION_TIMEOUT_MS,
    DEFAULTS.terminationTimeoutMs,
    "VLM_TERMINATION_TIMEOUT_MS",
  );
  if (!terminationTimeoutMs.ok) return terminationTimeoutMs;
  const maxImageBytes = parsePositiveInt(
    input.VLM_MAX_IMAGE_BYTES,
    DEFAULTS.maxImageBytes,
    "VLM_MAX_IMAGE_BYTES",
  );
  if (!maxImageBytes.ok) return maxImageBytes;
  const maxOutputTokens = parsePositiveInt(
    input.VLM_MAX_OUTPUT_TOKENS,
    DEFAULTS.maxOutputTokens,
    "VLM_MAX_OUTPUT_TOKENS",
  );
  if (!maxOutputTokens.ok) return maxOutputTokens;
  const contextSize = parsePositiveInt(
    input.VLM_CONTEXT_SIZE,
    DEFAULTS.contextSize,
    "VLM_CONTEXT_SIZE",
  );
  if (!contextSize.ok) return contextSize;
  const gpuLayers = parseOptionalNonNegativeInt(input.VLM_GPU_LAYERS, "VLM_GPU_LAYERS");
  if (!gpuLayers.ok) return gpuLayers;
  const threadCount = parseOptionalNonNegativeInt(input.VLM_THREADS, "VLM_THREADS");
  if (!threadCount.ok) return threadCount;

  const host = (input.VLM_HOST ?? DEFAULTS.host).trim();
  if (!isLoopbackHost(host)) {
    return invalid("INVALID_HOST", "VLM_HOST must resolve to loopback only.", [`VLM_HOST=${host}`]);
  }

  try {
    await validateExecutablePath(bin.value, "LLAMA_SERVER_BIN");
    const modelFileSize = await validateRegularFile(modelPath.value, "VLM_MODEL_PATH");
    const mmprojFileSize =
      mmprojPath.value === null
        ? null
        : await validateRegularFile(mmprojPath.value, "VLM_MMPROJ_PATH");
    const actualExecutableSha = await sha256File(bin.value);
    if (actualExecutableSha !== executableSha.value.toLowerCase()) {
      return invalid(
        "INVALID_DIGEST",
        "Configured llama-server digest does not match the local executable.",
        [`expected ${executableSha.value.toLowerCase()}`, `actual ${actualExecutableSha}`],
      );
    }
    const actualModelSha = await sha256File(modelPath.value);
    if (actualModelSha !== modelSha.value.toLowerCase()) {
      return invalid("INVALID_DIGEST", "Configured model digest does not match the local file.", [
        `expected ${modelSha.value.toLowerCase()}`,
        `actual ${actualModelSha}`,
      ]);
    }

    let actualProjectorSha: string | null = null;
    if (mmprojPath.value !== null && mmprojSha.value !== null) {
      actualProjectorSha = await sha256File(mmprojPath.value);
      if (actualProjectorSha !== mmprojSha.value.toLowerCase()) {
        return invalid(
          "INVALID_DIGEST",
          "Configured projector digest does not match the local file.",
          [`expected ${mmprojSha.value.toLowerCase()}`, `actual ${actualProjectorSha}`],
        );
      }
    }

    const candidate: LocalVlmResolvedConfig = {
      schemaVersion: LOCAL_VLM_CONFIG_SCHEMA_VERSION,
      llamaServerBin: bin.value,
      llamaExecutableSha256: actualExecutableSha,
      llamaVersionArgs: ["--version"],
      modelPath: modelPath.value,
      modelSha256: actualModelSha,
      modelFileSize,
      modelDisplayId: basename(modelPath.value),
      modelQuantization: discoverQuantization(basename(modelPath.value)),
      mmprojPath: mmprojPath.value,
      mmprojSha256: actualProjectorSha,
      mmprojFileSize,
      host,
      startupTimeoutMs: startupTimeoutMs.value,
      requestTimeoutMs: requestTimeoutMs.value,
      terminationTimeoutMs: terminationTimeoutMs.value,
      maxImageBytes: maxImageBytes.value,
      maxOutputTokens: maxOutputTokens.value,
      contextSize: contextSize.value,
      gpuLayers: gpuLayers.value,
      threadCount: threadCount.value,
      responseBytesMax: DEFAULTS.responseBytesMax,
      stdoutBytesMax: DEFAULTS.stdoutBytesMax,
      stderrBytesMax: DEFAULTS.stderrBytesMax,
      resourceSampleIntervalMs: DEFAULTS.resourceSampleIntervalMs,
      maxProposalsPerImage: DEFAULTS.maxProposalsPerImage,
      maxReasonCodesPerProposal: DEFAULTS.maxReasonCodesPerProposal,
      maxDescriptionLength: DEFAULTS.maxDescriptionLength,
      temperature: DEFAULTS.temperature,
      seed: DEFAULTS.seed,
      readinessPath: "/health",
      chatCompletionsPath: "/v1/chat/completions",
    };

    return validateLocalVlmResolvedConfig(candidate);
  } catch (error) {
    return invalid("INVALID_PATH", "Local VLM paths are invalid.", [
      error instanceof Error ? error.message : String(error),
    ]);
  }
}

export function buildLlamaServerLaunchSpec(
  config: LocalVlmResolvedConfig,
  port: number,
): LlamaServerLaunchSpec {
  const args = [
    "--host",
    config.host,
    "--port",
    String(port),
    "--model",
    config.modelPath,
    ...(config.mmprojPath === null ? [] : ["--mmproj", config.mmprojPath]),
    "--ctx-size",
    String(config.contextSize),
    "--temp",
    String(config.temperature),
    "--seed",
    String(config.seed),
    "--n-predict",
    String(config.maxOutputTokens),
    ...(config.gpuLayers === null ? [] : ["--n-gpu-layers", String(config.gpuLayers)]),
    ...(config.threadCount === null ? [] : ["--threads", String(config.threadCount)]),
  ] as const;

  return {
    command: config.llamaServerBin,
    args,
    host: config.host,
    port,
    sanitizedRuntimeArguments: [...args],
  };
}

export async function readLlamaVersionOutput(
  config: LocalVlmResolvedConfig,
): Promise<string | null> {
  try {
    const result = await execFile(config.llamaServerBin, [...config.llamaVersionArgs], {
      timeout: 5_000,
      maxBuffer: 64 * 1024,
    });
    const output = `${result.stdout}\n${result.stderr}`.trim();
    return output.length > 0 ? output : null;
  } catch {
    return null;
  }
}
