import { createHash } from "node:crypto";

import sharp from "sharp";

import type { VisionConfig } from "./config";
import { VisionTransportError, visionRequest } from "./client";
import {
  TRANSCRIPTION_JSON_SCHEMA,
  TRANSCRIPTION_PROMPT_ID,
  TRANSCRIPTION_PROMPT_SHA256,
  TRANSCRIPTION_PROMPT_VERSION,
  TRANSCRIPTION_SYSTEM_PROMPT,
  TRANSCRIPTION_USER_PROMPT,
  parseTranscriptionContent,
  type Legibility,
} from "./transcription-prompt";

/**
 * Bounded-region transcription.
 *
 * The seller has already told us *where* a label item is. That geometry is the
 * reader's biggest advantage: the model is shown only the pixels inside the
 * seller's (lightly padded) box, so it cannot drift to a more prominent line
 * elsewhere on the panel — the failure that dominated the Tesseract research
 * (Issue #149: brand text merged into neighbouring lines before selection).
 */

export interface PixelCrop {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface VisionReadProvenance {
  reader: "vision-llm";
  hostLabel: string;
  configuredModel: string;
  /** The `model` value the server reported, when it reports one. */
  servedModel: string | null;
  promptId: string;
  promptVersion: string;
  promptSha256: string;
  structuredOutput: VisionConfig["structuredOutput"];
  /** SHA-256 of the exact PNG bytes sent to the model. */
  sentImageSha256: string;
  sentImageSize: { width: number; height: number };
  responseSha256: string;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
}

export interface VisionTranscription {
  lines: string[];
  legibility: Legibility;
  provenance: VisionReadProvenance;
}

export type VisionTranscriptionErrorCode =
  VisionTransportError["code"] | "INVALID_CROP" | "UNPARSEABLE_RESPONSE";

export type VisionTranscriptionResult =
  | { ok: true; value: VisionTranscription }
  | { ok: false; code: VisionTranscriptionErrorCode; message: string };

const MAX_UPSCALE = 4;

/** Crop the padded region and size it for the model without distorting it. */
export async function prepareRegionImage(
  imageBytes: Uint8Array,
  crop: PixelCrop,
  limits: Pick<VisionConfig, "maxImageEdgePx" | "minImageEdgePx">,
): Promise<{ png: Buffer; width: number; height: number }> {
  const longest = Math.max(crop.width, crop.height);
  const shortest = Math.min(crop.width, crop.height);
  let scale = 1;
  if (longest > limits.maxImageEdgePx) {
    scale = limits.maxImageEdgePx / longest;
  } else if (shortest < limits.minImageEdgePx) {
    scale = Math.min(
      MAX_UPSCALE,
      limits.minImageEdgePx / shortest,
      limits.maxImageEdgePx / longest,
    );
  }
  const width = Math.max(1, Math.round(crop.width * scale));
  const height = Math.max(1, Math.round(crop.height * scale));
  const png = await sharp(Buffer.from(imageBytes))
    .extract(crop)
    .resize({ width, height, fit: "fill", kernel: "lanczos3" })
    .png()
    .toBuffer();
  return { png, width, height };
}

interface ChatCompletionBody {
  model?: unknown;
  choices?: Array<{ message?: { content?: unknown } }>;
  usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
}

function messageContent(body: unknown): string | null {
  const content = (body as ChatCompletionBody)?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  // Some servers return content parts.
  if (Array.isArray(content)) {
    const text = content.map((part) => (typeof part?.text === "string" ? part.text : "")).join("");
    return text || null;
  }
  return null;
}

function tokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

export function buildTranscriptionRequest(
  config: Pick<VisionConfig, "model" | "structuredOutput" | "maxOutputTokens">,
  png: Buffer,
): Record<string, unknown> {
  return {
    model: config.model,
    temperature: 0,
    top_p: 1,
    seed: 17,
    max_tokens: config.maxOutputTokens,
    stream: false,
    messages: [
      { role: "system", content: TRANSCRIPTION_SYSTEM_PROMPT },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: { url: `data:image/png;base64,${png.toString("base64")}` },
          },
          { type: "text", text: TRANSCRIPTION_USER_PROMPT },
        ],
      },
    ],
    ...(config.structuredOutput === "json_schema"
      ? {
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "label_region_transcription",
              strict: true,
              schema: TRANSCRIPTION_JSON_SCHEMA,
            },
          },
        }
      : {}),
  };
}

export async function transcribeRegion(
  config: VisionConfig,
  imageBytes: Uint8Array,
  crop: PixelCrop,
): Promise<VisionTranscriptionResult> {
  if (
    ![crop.left, crop.top, crop.width, crop.height].every(Number.isInteger) ||
    crop.width < 1 ||
    crop.height < 1
  ) {
    return { ok: false, code: "INVALID_CROP", message: "Region crop is not a valid pixel box." };
  }

  let prepared: { png: Buffer; width: number; height: number };
  try {
    prepared = await prepareRegionImage(imageBytes, crop, config);
  } catch {
    return {
      ok: false,
      code: "INVALID_CROP",
      message: "Region could not be cropped from the panel.",
    };
  }

  let result;
  try {
    result = await visionRequest(
      config,
      "POST",
      "/chat/completions",
      buildTranscriptionRequest(config, prepared.png),
    );
  } catch (error) {
    if (error instanceof VisionTransportError) {
      return { ok: false, code: error.code, message: error.message };
    }
    return { ok: false, code: "CONNECT_FAILED", message: "Vision request failed." };
  }

  const content = messageContent(result.body);
  const parsed = content === null ? null : parseTranscriptionContent(content);
  if (!parsed) {
    return {
      ok: false,
      code: "UNPARSEABLE_RESPONSE",
      message: "Vision host answered, but not with a transcription in the required shape.",
    };
  }

  const body = result.body as ChatCompletionBody;
  return {
    ok: true,
    value: {
      lines: parsed.lines,
      legibility: parsed.legibility,
      provenance: {
        reader: "vision-llm",
        hostLabel: config.hostLabel,
        configuredModel: config.model,
        servedModel: typeof body.model === "string" ? body.model.slice(0, 200) : null,
        promptId: TRANSCRIPTION_PROMPT_ID,
        promptVersion: TRANSCRIPTION_PROMPT_VERSION,
        promptSha256: TRANSCRIPTION_PROMPT_SHA256,
        structuredOutput: config.structuredOutput,
        sentImageSha256: createHash("sha256").update(prepared.png).digest("hex"),
        sentImageSize: { width: prepared.width, height: prepared.height },
        responseSha256: createHash("sha256")
          .update(content ?? "")
          .digest("hex"),
        latencyMs: result.latencyMs,
        promptTokens: tokenCount(body.usage?.prompt_tokens),
        completionTokens: tokenCount(body.usage?.completion_tokens),
      },
    },
  };
}
