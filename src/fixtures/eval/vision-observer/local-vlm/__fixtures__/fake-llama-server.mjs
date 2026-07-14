#!/usr/bin/env node

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 1) {
  const current = process.argv[index];
  if (!current.startsWith("--")) continue;
  const next = process.argv[index + 1];
  if (next && !next.startsWith("--")) {
    args.set(current.slice(2), next);
    index += 1;
  } else {
    args.set(current.slice(2), "1");
  }
}

if (args.get("spawned-child") === "1") {
  setInterval(() => {}, 1_000);
  process.on("SIGTERM", () => {});
  process.on("SIGINT", () => {});
} else if (args.get("version") === "1") {
  process.stdout.write("llama-server fake 0.0.0\n");
  process.exit(0);
}
if (args.get("spawned-child") !== "1" && args.get("version") !== "1") {
  const host = args.get("host") ?? "127.0.0.1";
  const port = Number(args.get("port"));
  const mode = args.get("mode") ?? "ok";
  const workspaceDir = args.get("workspace-dir") ?? process.cwd();
  const readyDelayMs = Number(args.get("ready-delay-ms") ?? "0");
  const requestDelayMs = Number(args.get("request-delay-ms") ?? "0");
  const logBytes = Number(args.get("log-bytes") ?? "0");
  const spawnChild = args.get("spawn-child") === "1";
  const ignoreTermOnce = args.get("ignore-term-once") === "1";
  const canary = args.get("canary") ?? "ALPHA ORCHID";
  const completionFailAtRung = args.get("completion-fail-at-rung") ?? null;
  const completionErrorAtRung = args.get("completion-error-at-rung") ?? null;

  mkdirSync(workspaceDir, { recursive: true });
  if (logBytes > 0) process.stderr.write("X".repeat(logBytes));

  let ignoredTerm = false;
  let child = null;
  if (spawnChild) {
    child = spawn(process.execPath, [new URL(import.meta.url).pathname, "--spawned-child", "1"], {
      detached: false,
      stdio: "ignore",
    });
    writeFileSync(join(workspaceDir, "spawned-child.pid"), `${child.pid ?? ""}\n`);
  }

  function refinementPayload() {
    return {
      observationRunId: "replace-me",
      proposals: [
        {
          observationId: "refinement-1",
          proposalId: "refinement-proposal-1",
          observationType: "text-like-region",
          source: "machine-observer",
          authority: "non-authoritative",
          purpose: "ocr-region-proposal",
          gridRange: {
            start: { column: "B", row: 2, columnIndex: 1, rowIndex: 1, id: "B2" },
            end: { column: "D", row: 4, columnIndex: 3, rowIndex: 3, id: "D4" },
            notation: "B2:D4",
          },
          observationRotation: 0,
          apparentOrientation: "horizontal",
          visibility: "full",
          reasonCodes: ["high_salience", "multi_line"],
          description: "generic text-like region near the center",
        },
      ],
    };
  }

  function isRefinementRequest(payload) {
    const system = String(payload?.messages?.[0]?.content ?? "");
    return system.includes("overlaid 5x5 refinement grid");
  }

  function firstImageDataUrl(payload) {
    const content = payload?.messages?.[1]?.content;
    if (!Array.isArray(content)) return null;
    for (const part of content) {
      if (part?.type === "image_url" && typeof part?.image_url?.url === "string") {
        return part.image_url.url;
      }
    }
    return null;
  }

  async function classifyBrightness(payload) {
    const imageDataUrl = firstImageDataUrl(payload);
    if (typeof imageDataUrl !== "string") return "MISSING";
    const match = /^data:[^;,]+;base64,([\s\S]+)$/u.exec(imageDataUrl);
    if (!match) return "INVALID";
    const imageBytes = Buffer.from(match[1] ?? "", "base64");
    const stats = await sharp(imageBytes).stats();
    const mean =
      stats.channels.reduce((sum, channel) => sum + channel.mean, 0) / stats.channels.length;
    return mean < 127.5 ? "BLACK" : "WHITE";
  }

  const responseForMode = async (payload) => {
    const base = isRefinementRequest(payload) ? refinementPayload() : validPayload();
    switch (mode) {
      case "attention-by-brightness":
        return await classifyBrightness(payload);
      case "attention-constant":
        return "BLACK";
      case "fenced-json":
        return `\`\`\`json\n${JSON.stringify(base)}\n\`\`\``;
      case "prose-wrapped":
        return `Here is the result:\n${JSON.stringify(base)}`;
      case "multiple-objects":
        return `${JSON.stringify(base)}\n${JSON.stringify(base)}`;
      case "malformed":
        return `{"observationRunId":`;
      case "prohibited-description":
        return JSON.stringify({
          ...base,
          proposals: [
            {
              ...base.proposals[0],
              description: "approved brand text near the top edge",
            },
          ],
        });
      case "duplicate-proposal-id":
        return JSON.stringify({
          ...base,
          proposals: [base.proposals[0], base.proposals[0]],
        });
      case "too-many-proposals":
        return JSON.stringify({
          ...base,
          proposals: Array.from({ length: 13 }, (_, idx) => ({
            ...base.proposals[0],
            proposalId: `proposal-${idx + 1}`,
            observationId: `obs-${idx + 1}`,
          })),
        });
      case "invalid-grid":
        return JSON.stringify({
          ...base,
          proposals: [
            {
              ...base.proposals[0],
              gridRange: {
                start: { column: "Z", row: 99, columnIndex: 25, rowIndex: 25, id: "Z99" },
                end: { column: "Z", row: 99, columnIndex: 25, rowIndex: 25, id: "Z99" },
                notation: "Z99",
              },
            },
          ],
        });
      default:
        return JSON.stringify(base);
    }
  };

  function validPayload() {
    return {
      observationRunId: "replace-me",
      proposals: [
        {
          observationId: "observation-1",
          proposalId: "proposal-1",
          observationType: "text-like-region",
          source: "machine-observer",
          authority: "non-authoritative",
          purpose: "ocr-region-proposal",
          gridRange: {
            start: { column: "B", row: 2, columnIndex: 1, rowIndex: 1, id: "B2" },
            end: { column: "D", row: 4, columnIndex: 3, rowIndex: 3, id: "D4" },
            notation: "B2:D4",
          },
          localRefinement: null,
          observationRotation: 0,
          apparentOrientation: "horizontal",
          visibility: "full",
          reasonCodes: ["high_salience", "multi_line"],
          description: `generic text-like region near ${canary.length > 0 ? "the center" : "the top"}`,
        },
      ],
    };
  }

  function completionPayloadWithoutCoordinates() {
    const base = validPayload().proposals[0];
    return {
      observationRunId: "replace-me",
      proposals: [
        {
          observationId: base.observationId,
          proposalId: base.proposalId,
          observationType: base.observationType,
          source: base.source,
          authority: base.authority,
          purpose: base.purpose,
          apparentOrientation: base.apparentOrientation,
          visibility: base.visibility,
          reasonCodes: base.reasonCodes,
          description: base.description,
        },
      ],
    };
  }

  function completionPayloadWithOneGridRegion() {
    const base = validPayload().proposals[0];
    return {
      observationRunId: "replace-me",
      proposals: [
        {
          observationId: base.observationId,
          proposalId: base.proposalId,
          observationType: base.observationType,
          source: base.source,
          authority: base.authority,
          purpose: base.purpose,
          gridRange: {
            start: { column: "A", row: 1, columnIndex: 0, rowIndex: 0, id: "A1" },
            end: { column: "A", row: 1, columnIndex: 0, rowIndex: 0, id: "A1" },
            notation: "A1",
          },
          localRefinement: null,
          observationRotation: 0,
          apparentOrientation: base.apparentOrientation,
          visibility: base.visibility,
          reasonCodes: ["high_salience"],
          description: base.description,
        },
      ],
    };
  }

  function singleProposalPayload(rung) {
    switch (rung) {
      case "empty-envelope-control":
        return {
          observationRunId: "replace-me",
          proposals: [],
        };
      case "empty-proposal-object":
        return {
          observationRunId: "replace-me",
          proposals: [{}],
        };
      case "one-fixed-discriminator":
        return {
          observationRunId: "replace-me",
          proposals: [{ observationType: "text-like-region" }],
        };
      case "identity-fields":
        return {
          observationRunId: "replace-me",
          proposals: [
            {
              observationId: "observation-1",
              proposalId: "proposal-1",
              observationType: "text-like-region",
            },
          ],
        };
      case "boundary-fields":
        return {
          observationRunId: "replace-me",
          proposals: [
            {
              observationId: "observation-1",
              proposalId: "proposal-1",
              observationType: "text-like-region",
              source: "machine-observer",
              authority: "non-authoritative",
              purpose: "ocr-region-proposal",
            },
          ],
        };
      case "visual-classification-fields":
        return {
          observationRunId: "replace-me",
          proposals: [
            {
              observationId: "observation-1",
              proposalId: "proposal-1",
              observationType: "text-like-region",
              source: "machine-observer",
              authority: "non-authoritative",
              purpose: "ocr-region-proposal",
              apparentOrientation: "horizontal",
              visibility: "full",
            },
          ],
        };
      case "reason-codes":
        return {
          observationRunId: "replace-me",
          proposals: [
            {
              observationId: "observation-1",
              proposalId: "proposal-1",
              observationType: "text-like-region",
              source: "machine-observer",
              authority: "non-authoritative",
              purpose: "ocr-region-proposal",
              apparentOrientation: "horizontal",
              visibility: "full",
              reasonCodes: ["high_salience"],
            },
          ],
        };
      case "description":
      case "guidance-load-control":
      default:
        return {
          observationRunId: "replace-me",
          proposals: [
            {
              observationId: "observation-1",
              proposalId: "proposal-1",
              observationType: "text-like-region",
              source: "machine-observer",
              authority: "non-authoritative",
              purpose: "ocr-region-proposal",
              apparentOrientation: "horizontal",
              visibility: "full",
              reasonCodes: ["high_salience"],
              description: "generic text-like region description",
            },
          ],
        };
    }
  }

  function requestParityContract(payload) {
    const system = String(payload?.messages?.[0]?.content ?? "");
    if (system.includes('"observationId": "string"')) {
      return "A";
    }
    if (system.includes("Use only these enum values:")) {
      return "C";
    }
    return "B";
  }

  function completionRung(payload) {
    const system = String(payload?.messages?.[0]?.content ?? "");
    if (system.includes("Return exactly one token: OK.")) return "one-token";
    if (system.includes("Return exactly one short sentence and nothing else.")) {
      return "one-short-sentence";
    }
    if (system.includes('Return exactly this JSON object and nothing else: {"ok":true}')) {
      return "minimal-json";
    }
    if (system.includes("Return exactly this empty observer envelope and nothing else.")) {
      return "empty-observer-envelope";
    }
    if (
      system.includes("Return exactly one observer proposal without any gridRange coordinates.")
    ) {
      return "one-observation-without-coordinates";
    }
    if (system.includes("Return exactly one observer proposal with exactly one gridRange.")) {
      return "one-observation-with-one-grid-region";
    }
    return "full-observer-schema";
  }

  function singleProposalRung(payload) {
    const system = String(payload?.messages?.[0]?.content ?? "");
    if (system.includes("Return exactly this empty observer envelope and nothing else.")) {
      return "empty-envelope-control";
    }
    if (system.includes("Use only these enum values:")) {
      return "guidance-load-control";
    }
    if (system.includes('"description": "generic text-like region description"')) {
      return "description";
    }
    if (system.includes('"reasonCodes": [')) {
      return "reason-codes";
    }
    if (system.includes('"apparentOrientation": "horizontal"')) {
      return "visual-classification-fields";
    }
    if (system.includes('"source": "machine-observer"')) {
      return "boundary-fields";
    }
    if (system.includes('"observationId": "observation-1"')) {
      return "identity-fields";
    }
    if (system.includes('"observationType": "text-like-region"')) {
      return "one-fixed-discriminator";
    }
    return "empty-proposal-object";
  }

  async function completionResponseForRung(payload, runId) {
    switch (completionRung(payload)) {
      case "one-token":
        return "OK";
      case "one-short-sentence":
        return "Visible artwork is present.";
      case "minimal-json":
        return '{"ok":true}';
      case "empty-observer-envelope":
        return JSON.stringify({
          observationRunId: runId,
          proposals: [],
        });
      case "one-observation-without-coordinates":
        return JSON.stringify({
          ...completionPayloadWithoutCoordinates(),
          observationRunId: runId,
        });
      case "one-observation-with-one-grid-region":
        return JSON.stringify({
          ...completionPayloadWithOneGridRegion(),
          observationRunId: runId,
        });
      default:
        return JSON.stringify(validPayload()).replace('"replace-me"', JSON.stringify(runId));
    }
  }

  async function singleProposalResponseForRung(payload, runId) {
    return JSON.stringify({
      ...singleProposalPayload(singleProposalRung(payload)),
      observationRunId: runId,
    });
  }

  async function requestParityResponseForContract(payload, runId) {
    if (requestParityContract(payload) === "A") {
      return JSON.stringify({
        ...completionPayloadWithoutCoordinates(),
        observationRunId: runId,
      });
    }
    return JSON.stringify({
      ...singleProposalPayload("description"),
      observationRunId: runId,
    });
  }

  let healthy = false;
  setTimeout(() => {
    healthy = true;
  }, readyDelayMs);

  const sockets = new Set();
  const server = createServer(async (req, res) => {
    if (req.url === "/health") {
      if (mode === "exit-before-ready" || !healthy) {
        res.statusCode = 503;
        res.end("not-ready");
        return;
      }
      res.statusCode = 200;
      res.end("ok");
      return;
    }

    if (req.url !== "/v1/chat/completions" || req.method !== "POST") {
      res.statusCode = 404;
      res.end("missing");
      return;
    }

    if (mode === "hang-request") {
      return;
    }

    let body = "";
    for await (const chunk of req) body += chunk.toString("utf8");
    const payload = JSON.parse(body);
    const instruction = payload.messages?.[1]?.content?.[0]?.text ?? "";
    const runIdLine = String(instruction).split(/\r?\n/, 1)[0] ?? "";
    const runId = runIdLine.split(": ")?.[1]?.trim() ?? "unknown";
    await new Promise((resolve) => setTimeout(resolve, requestDelayMs));
    writeFileSync(join(workspaceDir, "request.json"), body);
    const content =
      mode === "completion-ladder"
        ? await completionResponseForRung(payload, runId)
        : mode === "single-proposal-decomposition"
          ? await singleProposalResponseForRung(payload, runId)
          : mode === "request-parity-reproducibility"
            ? await requestParityResponseForContract(payload, runId)
            : (await responseForMode(payload)).replace('"replace-me"', JSON.stringify(runId));
    if (mode === "write-after-cancel") {
      setTimeout(() => {
        writeFileSync(join(workspaceDir, "after-cancel.txt"), "late-write\n");
      }, 50);
    }
    res.setHeader("content-type", "application/json");
    const transportPayload = JSON.stringify({
      choices: [{ message: { content }, finish_reason: "stop" }],
    });
    const activeCompletionRung =
      mode === "completion-ladder"
        ? completionRung(payload)
        : mode === "single-proposal-decomposition"
          ? singleProposalRung(payload)
          : mode === "request-parity-reproducibility"
            ? requestParityContract(payload)
            : null;
    if (activeCompletionRung !== null && completionFailAtRung === activeCompletionRung) {
      const cutoff = Math.max(1, Math.floor(transportPayload.length / 2));
      res.write(transportPayload.slice(0, cutoff));
      return;
    }
    if (activeCompletionRung !== null && completionErrorAtRung === activeCompletionRung) {
      res.statusCode = 500;
      res.end(
        JSON.stringify({
          error: {
            message: "simulated completion error",
          },
        }),
      );
      return;
    }
    res.end(transportPayload);
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => {
      sockets.delete(socket);
    });
  });

  process.once("SIGTERM", () => {
    if (ignoreTermOnce && !ignoredTerm) {
      ignoredTerm = true;
      return;
    }
    for (const socket of sockets) {
      socket.destroy();
    }
    server.close(() => process.exit(0));
  });
  process.once("SIGINT", () => {
    for (const socket of sockets) {
      socket.destroy();
    }
    server.close(() => process.exit(0));
  });

  server.listen(port, host, () => {
    if (mode === "exit-before-ready") {
      process.exit(2);
    }
  });
}
