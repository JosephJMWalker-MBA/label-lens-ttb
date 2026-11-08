import { isIP } from "node:net";

import { isPrivateNetworkAddress } from "./private-network";

/**
 * Runtime configuration for the vision reader.
 *
 * The reader is optional. When `LABEL_LENS_VISION_ENDPOINT` is unset the
 * application behaves exactly as before (local Tesseract only). When it is set,
 * every other value is validated up front and a malformed configuration is a
 * typed error rather than a silent fallback, so an operator who believes the
 * vision reader is active cannot be quietly running without it.
 *
 * Environment:
 *   LABEL_LENS_VISION_ENDPOINT   http(s)://host:port of an OpenAI-compatible
 *                                server (llama.cpp `llama-server`, vLLM, ...).
 *                                The host must be on a private network.
 *   LABEL_LENS_VISION_API_KEY    Bearer key the server was started with.
 *   LABEL_LENS_VISION_MODEL      Model identity recorded in provenance and sent
 *                                as the request `model` (e.g. qwen2.5-vl-7b-q8).
 *   LABEL_LENS_VISION_LABEL      Optional human label for the host recorded in
 *                                provenance instead of its address (e.g. orin-01).
 *   LABEL_LENS_VISION_TIMEOUT_MS Per-request timeout. Default 30000.
 *   LABEL_LENS_VISION_STRUCTURED_OUTPUT
 *                                "json_schema" (default) or "off" for servers
 *                                that reject response_format.
 */

export type StructuredOutputMode = "json_schema" | "off";

export interface VisionConfig {
  endpoint: URL;
  apiKey: string;
  model: string;
  hostLabel: string;
  timeoutMs: number;
  structuredOutput: StructuredOutputMode;
  /** Longest edge, in pixels, of any image sent to the model. */
  maxImageEdgePx: number;
  /** Small crops are upscaled so their shortest edge is at least this. */
  minImageEdgePx: number;
  maxResponseBytes: number;
  maxOutputTokens: number;
}

export type VisionConfigResult =
  | { state: "disabled" }
  | { state: "enabled"; config: VisionConfig }
  | { state: "invalid"; issues: string[] };

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 180_000;

function positiveInteger(raw: string | undefined, fallback: number): number | null {
  if (raw === undefined || raw.trim() === "") return fallback;
  if (!/^\d+$/.test(raw.trim())) return null;
  const value = Number(raw.trim());
  return value > 0 ? value : null;
}

/** Hostnames are checked again on every connection; literal IPs can be checked now. */
function hostIssue(hostname: string): string | null {
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (isIP(bare) && !isPrivateNetworkAddress(bare)) {
    return `LABEL_LENS_VISION_ENDPOINT host ${bare} is a public address. The vision reader only connects to private-network hosts.`;
  }
  return null;
}

export function resolveVisionConfig(
  env: Record<string, string | undefined> = process.env,
): VisionConfigResult {
  const rawEndpoint = env.LABEL_LENS_VISION_ENDPOINT?.trim();
  if (!rawEndpoint) return { state: "disabled" };

  const issues: string[] = [];
  let endpoint: URL | null = null;
  try {
    endpoint = new URL(rawEndpoint);
  } catch {
    issues.push("LABEL_LENS_VISION_ENDPOINT is not a valid URL.");
  }
  if (endpoint) {
    if (endpoint.protocol !== "http:" && endpoint.protocol !== "https:") {
      issues.push("LABEL_LENS_VISION_ENDPOINT must use http or https.");
    }
    if (endpoint.username || endpoint.password) {
      issues.push("LABEL_LENS_VISION_ENDPOINT must not embed credentials; use the API key.");
    }
    const issue = hostIssue(endpoint.hostname);
    if (issue) issues.push(issue);
  }

  const apiKey = env.LABEL_LENS_VISION_API_KEY?.trim() ?? "";
  if (apiKey.length < 16) {
    issues.push("LABEL_LENS_VISION_API_KEY must be set (at least 16 characters).");
  }

  const model = env.LABEL_LENS_VISION_MODEL?.trim() ?? "";
  if (!model) issues.push("LABEL_LENS_VISION_MODEL must name the served model.");

  const timeoutMs = positiveInteger(env.LABEL_LENS_VISION_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  if (timeoutMs === null || timeoutMs > MAX_TIMEOUT_MS) {
    issues.push(
      `LABEL_LENS_VISION_TIMEOUT_MS must be a whole number of milliseconds up to ${MAX_TIMEOUT_MS}.`,
    );
  }

  const structuredRaw = (env.LABEL_LENS_VISION_STRUCTURED_OUTPUT ?? "json_schema").trim();
  if (structuredRaw !== "json_schema" && structuredRaw !== "off") {
    issues.push('LABEL_LENS_VISION_STRUCTURED_OUTPUT must be "json_schema" or "off".');
  }

  if (issues.length > 0 || !endpoint || timeoutMs === null) {
    return { state: "invalid", issues };
  }

  const hostLabel = env.LABEL_LENS_VISION_LABEL?.trim() || "private-vision-host";
  return {
    state: "enabled",
    config: {
      endpoint,
      apiKey,
      model,
      hostLabel,
      timeoutMs,
      structuredOutput: structuredRaw as StructuredOutputMode,
      maxImageEdgePx: 1280,
      minImageEdgePx: 96,
      maxResponseBytes: 64 * 1024,
      maxOutputTokens: 1024,
    },
  };
}
