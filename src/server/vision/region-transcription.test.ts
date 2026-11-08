// @vitest-environment node
import dns from "node:dns";
import http from "node:http";
import type { AddressInfo } from "node:net";

import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { VisionConfig } from "./config";
import { privateOnlyLookup, visionRequest } from "./client";
import { transcribeRegion } from "./region-transcription";
import { TRANSCRIPTION_PROMPT_SHA256, parseTranscriptionContent } from "./transcription-prompt";

interface Captured {
  headers: http.IncomingHttpHeaders;
  url: string | undefined;
  body: Record<string, unknown>;
}

const servers: http.Server[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

async function fakeVisionHost(
  respond: (captured: Captured, res: http.ServerResponse) => void,
): Promise<{ config: VisionConfig; captured: Captured[] }> {
  const captured: Captured[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      const entry = { headers: req.headers, url: req.url, body: text ? JSON.parse(text) : {} };
      captured.push(entry);
      respond(entry, res);
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const { port } = server.address() as AddressInfo;
  return {
    captured,
    config: {
      endpoint: new URL(`http://127.0.0.1:${port}`),
      apiKey: "test-key-0123456789",
      model: "test-vl-model",
      hostLabel: "test-host",
      timeoutMs: 2_000,
      structuredOutput: "json_schema",
      maxImageEdgePx: 1280,
      minImageEdgePx: 96,
      maxResponseBytes: 64 * 1024,
      maxOutputTokens: 512,
    },
  };
}

function chatReply(content: string) {
  return JSON.stringify({
    model: "served-model-id",
    choices: [{ message: { role: "assistant", content } }],
    usage: { prompt_tokens: 321, completion_tokens: 12 },
  });
}

async function panel(width = 600, height = 400): Promise<Uint8Array> {
  const png = await sharp({
    create: { width, height, channels: 3, background: { r: 250, g: 250, b: 250 } },
  })
    .png()
    .toBuffer();
  return new Uint8Array(png);
}

describe("transcribeRegion", () => {
  it("sends only the cropped region, with the transcription prompt and no seller value", async () => {
    const { config, captured } = await fakeVisionHost((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(chatReply('{"lines":["CEDAR RIDGE"],"legibility":"clear"}'));
    });

    const result = await transcribeRegion(config, await panel(), {
      left: 100,
      top: 50,
      width: 300,
      height: 60,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.lines).toEqual(["CEDAR RIDGE"]);
    expect(result.value.legibility).toBe("clear");
    expect(result.value.provenance).toMatchObject({
      reader: "vision-llm",
      hostLabel: "test-host",
      configuredModel: "test-vl-model",
      servedModel: "served-model-id",
      promptSha256: TRANSCRIPTION_PROMPT_SHA256,
      promptTokens: 321,
      completionTokens: 12,
      // 60px is under the 96px minimum edge, so the crop is upscaled 1.6x.
      sentImageSize: { width: 480, height: 96 },
    });

    expect(captured).toHaveLength(1);
    expect(captured[0].url).toBe("/v1/chat/completions");
    expect(captured[0].headers.authorization).toBe("Bearer test-key-0123456789");
    const body = captured[0].body;
    expect(body.temperature).toBe(0);
    expect(body.response_format).toMatchObject({ type: "json_schema" });
    const serialized = JSON.stringify(body.messages);
    expect(serialized).toContain("data:image/png;base64,");
    expect(serialized).not.toMatch(/brand|alcohol|CEDAR/i);
  });

  it("upscales very small crops so text is legible to the model", async () => {
    const { config } = await fakeVisionHost((_req, res) => {
      res.writeHead(200);
      res.end(chatReply('{"lines":["13.5% ALC/VOL"],"legibility":"clear"}'));
    });
    const result = await transcribeRegion(config, await panel(), {
      left: 10,
      top: 10,
      width: 80,
      height: 20,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.provenance.sentImageSize).toEqual({ width: 320, height: 80 });
  });

  it("omits response_format when structured output is off", async () => {
    const { config, captured } = await fakeVisionHost((_req, res) => {
      res.writeHead(200);
      res.end(chatReply('```json\n{"lines":["A"],"legibility":"partial"}\n```'));
    });
    const result = await transcribeRegion({ ...config, structuredOutput: "off" }, await panel(), {
      left: 0,
      top: 0,
      width: 200,
      height: 100,
    });
    expect(captured[0].body.response_format).toBeUndefined();
    expect(result.ok && result.value.legibility).toBe("partial");
  });

  it("returns typed failures for HTTP errors, unparseable replies, and timeouts", async () => {
    const crop = { left: 0, top: 0, width: 200, height: 100 };

    const failing = await fakeVisionHost((_req, res) => {
      res.writeHead(500);
      res.end("{}");
    });
    expect(await transcribeRegion(failing.config, await panel(), crop)).toMatchObject({
      ok: false,
      code: "HTTP_STATUS",
    });

    const rambling = await fakeVisionHost((_req, res) => {
      res.writeHead(200);
      res.end(chatReply("The label appears to be compliant."));
    });
    expect(await transcribeRegion(rambling.config, await panel(), crop)).toMatchObject({
      ok: false,
      code: "UNPARSEABLE_RESPONSE",
    });

    const slow = await fakeVisionHost(() => {
      // never answer
    });
    expect(
      await transcribeRegion({ ...slow.config, timeoutMs: 150 }, await panel(), crop),
    ).toMatchObject({ ok: false, code: "TIMEOUT" });
  });

  it("bounds the response size", async () => {
    const { config } = await fakeVisionHost((_req, res) => {
      res.writeHead(200);
      res.end(chatReply(`{"lines":["${"x".repeat(5000)}"],"legibility":"clear"}`));
    });
    const result = await transcribeRegion({ ...config, maxResponseBytes: 1024 }, await panel(), {
      left: 0,
      top: 0,
      width: 200,
      height: 100,
    });
    expect(result).toMatchObject({ ok: false, code: "RESPONSE_TOO_LARGE" });
  });

  it("rejects crops outside the image", async () => {
    const { config } = await fakeVisionHost((_req, res) => {
      res.writeHead(200);
      res.end(chatReply('{"lines":[],"legibility":"illegible"}'));
    });
    const result = await transcribeRegion(config, await panel(100, 100), {
      left: 50,
      top: 50,
      width: 200,
      height: 200,
    });
    expect(result).toMatchObject({ ok: false, code: "INVALID_CROP" });
  });
});

describe("private network enforcement", () => {
  it("refuses a public literal endpoint without connecting", async () => {
    await expect(
      visionRequest(
        {
          endpoint: new URL("http://8.8.8.8:8080"),
          apiKey: "k",
          timeoutMs: 1000,
          maxResponseBytes: 1000,
        },
        "GET",
        "/models",
      ),
    ).rejects.toMatchObject({ code: "NETWORK_REFUSED" });
  });

  it("refuses a hostname that resolves to a public address", async () => {
    vi.spyOn(dns, "lookup").mockImplementation(((
      _host: string,
      _options: unknown,
      callback: (error: null, addresses: Array<{ address: string; family: number }>) => void,
    ) =>
      callback(null, [{ address: "93.184.216.34", family: 4 }])) as unknown as typeof dns.lookup);

    const outcome = await new Promise<{ error: NodeJS.ErrnoException | null }>((resolve) =>
      privateOnlyLookup("looks-internal.lan", { all: true }, (error) => resolve({ error })),
    );
    expect(outcome.error).toMatchObject({ code: "NETWORK_REFUSED" });
  });

  it("passes private resolutions through in both lookup shapes", async () => {
    vi.spyOn(dns, "lookup").mockImplementation(((
      _host: string,
      _options: unknown,
      callback: (error: null, addresses: Array<{ address: string; family: number }>) => void,
    ) => callback(null, [{ address: "192.168.1.50", family: 4 }])) as unknown as typeof dns.lookup);

    const single = await new Promise<{ address: unknown; family: unknown }>((resolve) =>
      privateOnlyLookup("orin.local", {}, (_error, address, family) =>
        resolve({ address, family }),
      ),
    );
    expect(single).toEqual({ address: "192.168.1.50", family: 4 });
  });
});

describe("parseTranscriptionContent", () => {
  it("never repairs malformed output", () => {
    expect(parseTranscriptionContent('{"lines":"A","legibility":"clear"}')).toBeNull();
    expect(parseTranscriptionContent('{"lines":["A"],"legibility":"good"}')).toBeNull();
    expect(
      parseTranscriptionContent('{"lines":["A"],"legibility":"clear","verdict":"approved"}'),
    ).toBeNull();
  });

  it("cleans whitespace and drops empty lines, and treats an empty clear reading as illegible", () => {
    expect(
      parseTranscriptionContent('{"lines":["  CEDAR\\n RIDGE ",""],"legibility":"clear"}'),
    ).toEqual({
      lines: ["CEDAR RIDGE"],
      legibility: "clear",
    });
    expect(parseTranscriptionContent('{"lines":[" "],"legibility":"clear"}')).toEqual({
      lines: [],
      legibility: "illegible",
    });
  });
});
