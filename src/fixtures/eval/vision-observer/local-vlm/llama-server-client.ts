import { readFile } from "node:fs/promises";

import type { VisionObserverInput } from "../observer-grid.types";

import { buildObservationInstruction, LOCAL_VLM_PROMPT_TEXT } from "./observer-prompt";
import type { LocalVlmObservationFailureShape, LocalVlmResolvedConfig } from "./local-vlm.types";

function baseUrl(host: string, port: number): string {
  return host.includes(":") ? `http://[${host}]:${port}` : `http://${host}:${port}`;
}

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
  return { text: Buffer.from(buffer).toString("utf8"), bytes: total };
}

export function readinessUrl(config: LocalVlmResolvedConfig, port: number): string {
  return `${baseUrl(config.host, port)}${config.readinessPath}`;
}

export function chatCompletionsUrl(config: LocalVlmResolvedConfig, port: number): string {
  return `${baseUrl(config.host, port)}${config.chatCompletionsPath}`;
}

export async function waitForReadiness(args: {
  config: LocalVlmResolvedConfig;
  port: number;
  signal: AbortSignal;
  onAttempt: (event: { ok: boolean; error: string | null }) => void;
}): Promise<void> {
  const timeout = AbortSignal.timeout(args.config.startupTimeoutMs);
  const signal = AbortSignal.any([args.signal, timeout]);

  while (!signal.aborted) {
    try {
      const response = await fetch(readinessUrl(args.config, args.port), {
        method: "GET",
        cache: "no-store",
        signal,
      });
      if (response.ok) {
        args.onAttempt({ ok: true, error: null });
        return;
      }
      args.onAttempt({ ok: false, error: `HTTP ${response.status}` });
    } catch (error) {
      if (signal.aborted) break;
      args.onAttempt({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw {
    code: "READINESS_TIMEOUT",
    message: "llama-server did not become ready before the startup timeout.",
    issues: [`timeoutMs=${args.config.startupTimeoutMs}`],
  } satisfies LocalVlmObservationFailureShape;
}

export async function sendObservationRequest(args: {
  config: LocalVlmResolvedConfig;
  port: number;
  input: VisionObserverInput;
  signal: AbortSignal;
}): Promise<{ text: string; bytes: number }> {
  const overlayBytes = await readFile(args.input.overlayArtifactPath);
  if (overlayBytes.byteLength > args.config.maxImageBytes) {
    throw {
      code: "INVALID_OBSERVER_OUTPUT",
      message: "Overlay image exceeds the configured input-byte budget.",
      issues: [`overlayBytes=${overlayBytes.byteLength}`, `limit=${args.config.maxImageBytes}`],
    } satisfies LocalVlmObservationFailureShape;
  }

  const requestSignal = AbortSignal.any([
    args.signal,
    AbortSignal.timeout(args.config.requestTimeoutMs),
  ]);

  let response: Response;
  try {
    response = await fetch(chatCompletionsUrl(args.config, args.port), {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: requestSignal,
      body: JSON.stringify({
        model: args.config.modelDisplayId,
        temperature: args.config.temperature,
        seed: args.config.seed,
        max_tokens: args.config.maxOutputTokens,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: LOCAL_VLM_PROMPT_TEXT },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: buildObservationInstruction(args.input.observationRunId),
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${args.input.overlayMediaType};base64,${overlayBytes.toString("base64")}`,
                },
              },
            ],
          },
        ],
      }),
    });
  } catch (error) {
    if (requestSignal.aborted) {
      throw {
        code: "REQUEST_TIMEOUT",
        message: "The local VLM request timed out or was aborted.",
        issues: [`timeoutMs=${args.config.requestTimeoutMs}`],
      } satisfies LocalVlmObservationFailureShape;
    }
    throw error;
  }

  const transportBody = await readTextWithLimit(response, args.config.responseBytesMax);
  let payload: unknown;
  try {
    payload = JSON.parse(transportBody.text);
  } catch (error) {
    throw {
      code: "INVALID_OBSERVER_OUTPUT",
      message: "The llama-server transport payload was not valid JSON.",
      issues: [error instanceof Error ? error.message : String(error)],
    } satisfies LocalVlmObservationFailureShape;
  }

  const rawContent = (payload as { choices?: Array<{ message?: { content?: unknown } }> })
    ?.choices?.[0]?.message?.content;
  if (typeof rawContent === "string") {
    return {
      text: rawContent,
      bytes: Buffer.byteLength(rawContent),
    };
  }

  const text = JSON.stringify(payload);
  if (Buffer.byteLength(text) > args.config.responseBytesMax) {
    throw {
      code: "RESPONSE_TOO_LARGE",
      message: "The local VLM transport payload exceeded the configured limit.",
      issues: [`limit=${args.config.responseBytesMax}`],
    } satisfies LocalVlmObservationFailureShape;
  }

  return await readTextWithLimit(
    new Response(text, { headers: { "content-type": "application/json" } }),
    args.config.responseBytesMax,
  );
}
