import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import sharp from "sharp";

import { chatCompletionsUrl, waitForReadiness } from "./llama-server-client";
import { buildLlamaServerLaunchSpec } from "./llama-server-config";
import { localVlmFailureFromUnknown, spawnOwnedLlamaServerProcess } from "./llama-server-process";
import type { LocalVlmResolvedConfig } from "./local-vlm.types";
import { type Phase1DiagnosticReport } from "./phase1-diagnostic-types";

export type VisionAttentionToken = "BLACK" | "WHITE";

export interface VisionAttentionProbeEvidence {
  imageLabel: VisionAttentionToken;
  rawOutput: string | null;
  normalizedToken: VisionAttentionToken | null;
}

export interface VisionAttentionDiagnosticEvidence {
  runtimeKind: LocalVlmResolvedConfig["runtimeKind"];
  promptText: string;
  cleanupCompleted: boolean;
  workspaceDir: string;
  probes: readonly [VisionAttentionProbeEvidence, VisionAttentionProbeEvidence];
}

export type VisionAttentionDiagnosticReport =
  Phase1DiagnosticReport<VisionAttentionDiagnosticEvidence>;

const SYSTEM_PROMPT =
  "You are running a vision attention diagnostic. Return exactly one token: BLACK or WHITE.";

const USER_PROMPT =
  "If the image is predominantly black, return BLACK. If the image is predominantly white, return WHITE. Return exactly one token.";

async function readTextWithLimit(
  response: Response,
  maxBytes: number,
): Promise<{
  text: string;
  bytes: number;
}> {
  if (!response.body) {
    return { text: "", bytes: 0 };
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`response exceeds ${maxBytes} bytes`);
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }

  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return {
    text: Buffer.from(buffer).toString("utf8"),
    bytes: total,
  };
}

function normalizeBinaryToken(text: string): VisionAttentionToken | null {
  const normalized = text.toUpperCase();
  const hasBlack = /\bBLACK\b/u.test(normalized);
  const hasWhite = /\bWHITE\b/u.test(normalized);
  if (hasBlack === hasWhite) return null;
  return hasBlack ? "BLACK" : "WHITE";
}

async function sendVisionAttentionProbe(args: {
  config: LocalVlmResolvedConfig;
  port: number;
  signal: AbortSignal;
  imagePath: string;
  imageLabel: VisionAttentionToken;
}): Promise<VisionAttentionProbeEvidence> {
  const imageBytes = await readFile(args.imagePath);
  const response = await fetch(chatCompletionsUrl(args.config, args.port), {
    method: "POST",
    headers: { "content-type": "application/json" },
    signal: AbortSignal.any([args.signal, AbortSignal.timeout(args.config.requestTimeoutMs)]),
    body: JSON.stringify({
      model: args.config.modelDisplayId,
      temperature: args.config.temperature,
      seed: args.config.seed,
      max_tokens: 8,
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `run id: vision-attention-${args.imageLabel.toLowerCase()}\n${USER_PROMPT}`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${imageBytes.toString("base64")}`,
              },
            },
          ],
        },
      ],
    }),
  });

  const transport = await readTextWithLimit(response, args.config.responseBytesMax);
  const payload = JSON.parse(transport.text) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const rawOutput = payload.choices?.[0]?.message?.content;
  if (typeof rawOutput !== "string") {
    throw new Error("vision attention response did not include message content");
  }

  return {
    imageLabel: args.imageLabel,
    rawOutput,
    normalizedToken: normalizeBinaryToken(rawOutput),
  };
}

export async function createVisionAttentionSentinelPng(
  token: VisionAttentionToken,
): Promise<Uint8Array> {
  const background = token === "BLACK" ? "#000000" : "#ffffff";
  return Uint8Array.from(
    await sharp({
      create: {
        width: 96,
        height: 96,
        channels: 3,
        background,
      },
    })
      .png()
      .toBuffer(),
  );
}

export async function runVisionAttentionDiagnostic(args: {
  config: LocalVlmResolvedConfig;
  blackImagePath: string;
  whiteImagePath: string;
}): Promise<VisionAttentionDiagnosticReport> {
  const workspaceDir = await mkdtemp(join(tmpdir(), "local-vlm-phase1-attention-"));
  let cleanupCompleted = false;
  let owner: Awaited<ReturnType<typeof spawnOwnedLlamaServerProcess>> | null = null;

  let blackProbe: VisionAttentionProbeEvidence = {
    imageLabel: "BLACK",
    rawOutput: null,
    normalizedToken: null,
  };
  let whiteProbe: VisionAttentionProbeEvidence = {
    imageLabel: "WHITE",
    rawOutput: null,
    normalizedToken: null,
  };
  let issues: string[] = [];
  let summary = "Vision attention failed the sentinel comparison.";
  let status: VisionAttentionDiagnosticReport["status"] = "FAIL";
  let observeFailure: unknown = null;
  let terminationFailure: unknown = null;

  try {
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
    const processOwner = owner;

    const startedAt = performance.now();
    await waitForReadiness({
      config: args.config,
      port: processOwner.telemetry.port,
      signal: AbortSignal.timeout(args.config.startupTimeoutMs),
      onAttempt: ({ ok, error }) => processOwner.noteReadinessAttempt(ok, error, startedAt),
    });

    blackProbe = await sendVisionAttentionProbe({
      config: args.config,
      port: processOwner.telemetry.port,
      signal: AbortSignal.timeout(args.config.requestTimeoutMs),
      imagePath: args.blackImagePath,
      imageLabel: "BLACK",
    });
    whiteProbe = await sendVisionAttentionProbe({
      config: args.config,
      port: processOwner.telemetry.port,
      signal: AbortSignal.timeout(args.config.requestTimeoutMs),
      imagePath: args.whiteImagePath,
      imageLabel: "WHITE",
    });

    if (blackProbe.normalizedToken === null || whiteProbe.normalizedToken === null) {
      issues = ["vision attention response was not reducible to exactly one BLACK or WHITE token"];
    } else if (blackProbe.normalizedToken === whiteProbe.normalizedToken) {
      issues = [
        `different sentinel images produced the same token: ${blackProbe.normalizedToken}`,
        "likely prompt-only behavior, missing projector, or an upstream image transport defect",
      ];
    } else {
      status = "PASS";
      summary =
        "Vision attention passed because the black and white sentinel images produced different outputs.";
    }
  } catch (error) {
    observeFailure = error;
    const failure = localVlmFailureFromUnknown(error);
    issues = [failure.message, ...failure.issues.map((issue) => String(issue))];
    summary = "Vision attention failed before image conditioning could be established.";
  } finally {
    if (owner !== null) {
      try {
        await owner.terminate();
      } catch (error) {
        terminationFailure = error;
      }
    }

    if (terminationFailure === null) {
      await rm(workspaceDir, { recursive: true, force: true });
      cleanupCompleted = true;
    }

    if (owner !== null) {
      await owner.finalizeResources(cleanupCompleted ? 0 : 1);
    }
  }

  if (terminationFailure !== null) {
    const failure = localVlmFailureFromUnknown(terminationFailure);
    status = "FAIL";
    summary = "Vision attention failed because the diagnostic runtime did not terminate cleanly.";
    issues = [failure.message, ...failure.issues.map((issue) => String(issue))];
  } else if (observeFailure === null && status === "FAIL" && issues.length === 0) {
    issues = ["different sentinel images did not produce distinct BLACK and WHITE outputs"];
  }

  return {
    layer: "vision-attention",
    status,
    summary,
    issues,
    blockedBy: null,
    evidence: {
      runtimeKind: args.config.runtimeKind,
      promptText: USER_PROMPT,
      cleanupCompleted,
      workspaceDir,
      probes: [blackProbe, whiteProbe],
    },
  };
}

export async function writeVisionAttentionSentinelPair(args: { dir: string }): Promise<{
  blackImagePath: string;
  whiteImagePath: string;
}> {
  const blackImagePath = join(args.dir, "sentinel-black.png");
  const whiteImagePath = join(args.dir, "sentinel-white.png");
  await writeFile(blackImagePath, await createVisionAttentionSentinelPng("BLACK"));
  await writeFile(whiteImagePath, await createVisionAttentionSentinelPng("WHITE"));
  return { blackImagePath, whiteImagePath };
}
