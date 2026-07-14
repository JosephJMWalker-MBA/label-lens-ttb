// @vitest-environment node
import { writeFile } from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";

import { resolveLocalVlmConfig } from "./llama-server-config";
import {
  evaluateImageTransportWitness,
  runImageTransportDiagnostic,
} from "./image-transport-diagnostic";
import {
  cleanupDir,
  localVlmEnv,
  tempDir,
  writeFakeModel,
  writeFakeServerWrapper,
} from "./local-vlm-test-helpers";

const CLEANUP: string[] = [];

afterEach(() => {
  while (CLEANUP.length > 0) cleanupDir(CLEANUP.pop()!);
});

async function pngBytes(color: string) {
  return await sharp({
    create: {
      width: 16,
      height: 16,
      channels: 3,
      background: color,
    },
  })
    .png()
    .toBuffer();
}

async function pngDataUrl(color: string) {
  const bytes = await pngBytes(color);
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

async function diagnosticConfig() {
  const dir = tempDir();
  CLEANUP.push(dir);
  const executable = writeFakeServerWrapper(dir);
  const model = writeFakeModel(dir);
  const resolved = await resolveLocalVlmConfig(
    localVlmEnv({
      executablePath: executable.path,
      executableSha256: executable.sha256,
      modelPath: model.path,
      modelSha256: model.sha256,
    }),
  );
  expect(resolved.ok).toBe(true);
  if (!resolved.ok) throw new Error("config failed");
  return resolved.value;
}

describe("image transport diagnostic", () => {
  it("captures one image with the expected media types", async () => {
    const config = await diagnosticConfig();
    const dir = tempDir();
    CLEANUP.push(dir);
    const imagePath = `${dir}/transport.png`;
    const bytes = await pngBytes("#000000");
    await writeFile(imagePath, bytes);

    const report = await runImageTransportDiagnostic({
      config,
      imagePath,
      imageMediaType: "image/png",
    });

    expect(report.status).toBe("PASS");
    expect(report.evidence.requestMediaType).toBe("application/json");
    expect(report.evidence.imageCount).toBe(1);
    expect(report.evidence.imageMimeTypes).toEqual(["image/png"]);
    expect(report.evidence.imageByteLengths[0]).toBe(bytes.byteLength);
    const payload = JSON.parse(report.evidence.rawRequestBody) as {
      max_tokens: number;
      messages: Array<{ content: unknown }>;
    };
    expect(payload.max_tokens).toBe(8);
    expect(payload.messages[0]?.content).toBe(
      "You are running a vision attention diagnostic. Return exactly one token: BLACK or WHITE.",
    );
    expect(payload.messages[1]?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "text",
          text: expect.stringMatching(
            /run id: vision-attention-black[\s\S]*If the image is predominantly black, return BLACK\. If the image is predominantly white, return WHITE\. Return exactly one token\./,
          ),
        }),
      ]),
    );
  });

  it("rejects duplicate images in the witness body", async () => {
    const imageDataUrl = await pngDataUrl("#ffffff");
    const report = evaluateImageTransportWitness({
      witness: {
        requestContentType: "application/json",
        rawRequestBody: JSON.stringify({
          messages: [
            { role: "system", content: "transport witness" },
            {
              role: "user",
              content: [
                { type: "text", text: "duplicate test" },
                { type: "image_url", image_url: { url: imageDataUrl } },
                { type: "image_url", image_url: { url: imageDataUrl } },
              ],
            },
          ],
        }),
      },
      expectedImageMimeType: "image/png",
      maxImageBytes: 6_000_000,
    });

    expect(report.status).toBe("FAIL");
    expect(report.issues).toContain("multiple images supplied: count=2");
    expect(report.issues.some((issue) => issue.startsWith("duplicate images detected:"))).toBe(
      true,
    );
  });

  it("fails when the image mime type does not match the expected type", async () => {
    const png = await pngBytes("#ffffff");
    const report = evaluateImageTransportWitness({
      witness: {
        requestContentType: "application/json; charset=utf-8",
        rawRequestBody: JSON.stringify({
          messages: [
            { role: "system", content: "transport witness" },
            {
              role: "user",
              content: [
                { type: "text", text: "mime test" },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/jpeg;base64,${png.toString("base64")}`,
                  },
                },
              ],
            },
          ],
        }),
      },
      expectedImageMimeType: "image/png",
      maxImageBytes: 6_000_000,
    });

    expect(report.status).toBe("FAIL");
    expect(report.issues).toContain(
      "wrong mime type at index 0: expected image/png, received image/jpeg",
    );
  });
});
