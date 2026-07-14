import { createHash } from "node:crypto";
import { createServer } from "node:http";

import type { LocalVlmResolvedConfig } from "./local-vlm.types";
import { type Phase1DiagnosticReport } from "./phase1-diagnostic-types";
import { sendVisionAttentionTransportRequest } from "./vision-attention-diagnostic";

export interface ImageTransportWitness {
  requestContentType: string | null;
  rawRequestBody: string;
}

export interface ImageTransportDiagnosticEvidence extends ImageTransportWitness {
  requestMediaType: string | null;
  imageCount: number;
  imageMimeTypes: readonly string[];
  imageByteLengths: readonly number[];
  imageDigests: readonly string[];
  duplicateImageDigests: readonly string[];
}

export type ImageTransportDiagnosticReport =
  Phase1DiagnosticReport<ImageTransportDiagnosticEvidence>;

function normalizeMediaType(value: string | null): string | null {
  if (!value) return null;
  const [mediaType] = value.split(";");
  return mediaType?.trim().toLowerCase() ?? null;
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function extractImageDataUrls(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const messages = (payload as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return [];

  const urls: string[] = [];
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const content = (message as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (!part || typeof part !== "object") continue;
      if ((part as { type?: unknown }).type !== "image_url") continue;
      const imageUrl = (part as { image_url?: unknown }).image_url;
      if (!imageUrl || typeof imageUrl !== "object") continue;
      const url = (imageUrl as { url?: unknown }).url;
      if (typeof url === "string") urls.push(url);
    }
  }
  return urls;
}

function parseDataUrl(url: string): { mimeType: string | null; bytes: Uint8Array | null } {
  const match = /^data:([^;,]+);base64,([\s\S]+)$/u.exec(url);
  if (!match) {
    return { mimeType: null, bytes: null };
  }
  return {
    mimeType: match[1]?.trim().toLowerCase() ?? null,
    bytes: Uint8Array.from(Buffer.from(match[2] ?? "", "base64")),
  };
}

export function evaluateImageTransportWitness(args: {
  witness: ImageTransportWitness;
  expectedImageMimeType: string;
  maxImageBytes: number;
}): ImageTransportDiagnosticReport {
  const issues: string[] = [];
  const requestMediaType = normalizeMediaType(args.witness.requestContentType);

  if (requestMediaType !== "application/json") {
    issues.push(`wrong request media type: ${requestMediaType ?? "missing"}`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(args.witness.rawRequestBody);
  } catch (error) {
    return {
      layer: "image-transport",
      status: "FAIL",
      summary: "Image transport failed because the request body was malformed.",
      issues: [error instanceof Error ? error.message : String(error)],
      blockedBy: null,
      evidence: {
        requestContentType: args.witness.requestContentType,
        rawRequestBody: args.witness.rawRequestBody,
        requestMediaType,
        imageCount: 0,
        imageMimeTypes: [],
        imageByteLengths: [],
        imageDigests: [],
        duplicateImageDigests: [],
      },
    };
  }

  const imageDataUrls = extractImageDataUrls(payload);
  const parsedImages = imageDataUrls.map(parseDataUrl);
  const imageMimeTypes = parsedImages.map((image) => image.mimeType ?? "invalid");
  const imageByteLengths = parsedImages.map((image) => image.bytes?.byteLength ?? 0);
  const imageDigests = parsedImages.map((image) =>
    image.bytes === null ? "invalid" : sha256Hex(image.bytes),
  );
  const duplicateImageDigests = [...new Set(imageDigests)].filter(
    (digest) => digest !== "invalid" && imageDigests.filter((entry) => entry === digest).length > 1,
  );

  if (imageDataUrls.length === 0) {
    issues.push("no image supplied");
  }
  if (imageDataUrls.length > 1) {
    issues.push(`multiple images supplied: count=${imageDataUrls.length}`);
  }
  if (duplicateImageDigests.length > 0) {
    issues.push(`duplicate images detected: ${duplicateImageDigests.join(", ")}`);
  }

  for (const [index, image] of parsedImages.entries()) {
    if (image.mimeType === null || image.bytes === null) {
      issues.push(`malformed image payload at index ${index}`);
      continue;
    }
    if (image.mimeType !== args.expectedImageMimeType) {
      issues.push(
        `wrong mime type at index ${index}: expected ${args.expectedImageMimeType}, received ${image.mimeType}`,
      );
    }
    if (image.bytes.byteLength > args.maxImageBytes) {
      issues.push(
        `oversized image payload at index ${index}: ${image.bytes.byteLength} > ${args.maxImageBytes}`,
      );
    }
  }

  return {
    layer: "image-transport",
    status: issues.length === 0 ? "PASS" : "FAIL",
    summary:
      issues.length === 0
        ? "Image transport passed with one image, the expected media types, and no duplicates."
        : "Image transport failed the deterministic witness checks.",
    issues,
    blockedBy: null,
    evidence: {
      requestContentType: args.witness.requestContentType,
      rawRequestBody: args.witness.rawRequestBody,
      requestMediaType,
      imageCount: imageDataUrls.length,
      imageMimeTypes,
      imageByteLengths,
      imageDigests,
      duplicateImageDigests,
    },
  };
}

export async function runImageTransportDiagnostic(args: {
  config: LocalVlmResolvedConfig;
  imagePath: string;
  imageMediaType: string;
}): Promise<ImageTransportDiagnosticReport> {
  const witness: ImageTransportWitness = {
    requestContentType: null,
    rawRequestBody: "",
  };

  const server = createServer(async (request, response) => {
    witness.requestContentType =
      typeof request.headers["content-type"] === "string"
        ? request.headers["content-type"]
        : Array.isArray(request.headers["content-type"])
          ? (request.headers["content-type"][0] ?? null)
          : null;

    let requestBody = "";
    for await (const chunk of request) {
      requestBody += chunk.toString("utf8");
    }
    witness.rawRequestBody = requestBody;

    response.statusCode = 200;
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        choices: [{ message: { content: "OK" } }],
      }),
    );
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("failed to allocate transport witness port");
    }

    await sendVisionAttentionTransportRequest({
      config: args.config,
      port: address.port,
      signal: AbortSignal.timeout(args.config.requestTimeoutMs),
      imagePath: args.imagePath,
      imageLabel: "BLACK",
      imageMediaType: args.imageMediaType,
    });
  } catch (error) {
    return {
      layer: "image-transport",
      status: "FAIL",
      summary: "Image transport failed before the deterministic witness could capture the request.",
      issues: [error instanceof Error ? error.message : String(error)],
      blockedBy: null,
      evidence: {
        requestContentType: witness.requestContentType,
        rawRequestBody: witness.rawRequestBody,
        requestMediaType: normalizeMediaType(witness.requestContentType),
        imageCount: 0,
        imageMimeTypes: [],
        imageByteLengths: [],
        imageDigests: [],
        duplicateImageDigests: [],
      },
    };
  } finally {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    }
  }

  return evaluateImageTransportWitness({
    witness,
    expectedImageMimeType: args.imageMediaType,
    maxImageBytes: args.config.maxImageBytes,
  });
}
