import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import type { LocalVlmConfigInput, LocalVlmRuntimeKind } from "./local-vlm.types";

const FIXTURE_SERVER_PATH = join(
  process.cwd(),
  "src/fixtures/eval/vision-observer/local-vlm/__fixtures__/fake-llama-server.mjs",
);

export function sha256Hex(bytes: Uint8Array | Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export function tempDir(prefix = "local-vlm-test-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function cleanupDir(path: string) {
  rmSync(path, { recursive: true, force: true });
}

export function writeFakeModel(
  dir: string,
  name = "model-Q4_K_M.gguf",
): {
  path: string;
  sha256: string;
  size: number;
} {
  const path = join(dir, name);
  const bytes = Buffer.from(`fake-model:${name}\n`, "utf8");
  writeFileSync(path, bytes);
  return { path, sha256: sha256Hex(bytes), size: bytes.byteLength };
}

export function writeFakeProjector(
  dir: string,
  name = "mmproj.gguf",
): {
  path: string;
  sha256: string;
  size: number;
} {
  const path = join(dir, name);
  const bytes = Buffer.from(`fake-projector:${name}\n`, "utf8");
  writeFileSync(path, bytes);
  return { path, sha256: sha256Hex(bytes), size: bytes.byteLength };
}

export function writeFakeServerWrapper(
  dir: string,
  options: {
    mode?: string;
    readyDelayMs?: number;
    requestDelayMs?: number;
    logBytes?: number;
    spawnChild?: boolean;
    ignoreTermOnce?: boolean;
    canary?: string;
    completionFailAtRung?: string;
    completionErrorAtRung?: string;
  } = {},
): { path: string; sha256: string } {
  const path = join(dir, `fake-llama-server-${Date.now()}.mjs`);
  const extraArgs: string[] = [];
  if (options.mode) extraArgs.push("--mode", options.mode);
  if (options.readyDelayMs !== undefined) {
    extraArgs.push("--ready-delay-ms", String(options.readyDelayMs));
  }
  if (options.requestDelayMs !== undefined) {
    extraArgs.push("--request-delay-ms", String(options.requestDelayMs));
  }
  if (options.logBytes !== undefined) extraArgs.push("--log-bytes", String(options.logBytes));
  if (options.spawnChild) extraArgs.push("--spawn-child", "1");
  if (options.ignoreTermOnce) extraArgs.push("--ignore-term-once", "1");
  if (options.canary) extraArgs.push("--canary", options.canary);
  if (options.completionFailAtRung) {
    extraArgs.push("--completion-fail-at-rung", options.completionFailAtRung);
  }
  if (options.completionErrorAtRung) {
    extraArgs.push("--completion-error-at-rung", options.completionErrorAtRung);
  }

  const spliceLine =
    extraArgs.length === 0
      ? ""
      : `process.argv.splice(2, 0, ${extraArgs.map((value) => JSON.stringify(value)).join(", ")});\n`;
  const script = `#!/usr/bin/env node
${spliceLine}\
await import(${JSON.stringify(pathToFileURL(FIXTURE_SERVER_PATH).href)});
`;
  writeFileSync(path, script, "utf8");
  chmodSync(path, 0o755);
  return { path, sha256: sha256Hex(script) };
}

export function localVlmEnv(args: {
  executablePath: string;
  executableSha256: string;
  runtimeKind?: LocalVlmRuntimeKind;
  modelPath: string;
  modelSha256: string;
  mmprojPath?: string;
  mmprojSha256?: string;
  host?: string;
  startupTimeoutMs?: number;
  requestTimeoutMs?: number;
  terminationTimeoutMs?: number;
  maxImageBytes?: number;
  maxOutputTokens?: number;
  contextSize?: number;
  gpuLayers?: number | null;
  threadCount?: number | null;
}): LocalVlmConfigInput {
  return {
    LLAMA_SERVER_BIN: args.executablePath,
    LLAMA_SERVER_SHA256: args.executableSha256,
    VLM_RUNTIME_KIND: args.runtimeKind ?? "fake-server",
    VLM_MODEL_PATH: args.modelPath,
    VLM_MODEL_SHA256: args.modelSha256,
    VLM_MMPROJ_PATH: args.mmprojPath,
    VLM_MMPROJ_SHA256: args.mmprojSha256,
    VLM_HOST: args.host ?? "127.0.0.1",
    VLM_STARTUP_TIMEOUT_MS: String(args.startupTimeoutMs ?? 1_000),
    VLM_REQUEST_TIMEOUT_MS: String(args.requestTimeoutMs ?? 1_000),
    VLM_TERMINATION_TIMEOUT_MS: String(args.terminationTimeoutMs ?? 500),
    VLM_MAX_IMAGE_BYTES: String(args.maxImageBytes ?? 6_000_000),
    VLM_MAX_OUTPUT_TOKENS: String(args.maxOutputTokens ?? 500),
    VLM_CONTEXT_SIZE: String(args.contextSize ?? 4_096),
    VLM_GPU_LAYERS:
      args.gpuLayers === undefined || args.gpuLayers === null ? undefined : String(args.gpuLayers),
    VLM_THREADS:
      args.threadCount === undefined || args.threadCount === null
        ? undefined
        : String(args.threadCount),
  };
}
