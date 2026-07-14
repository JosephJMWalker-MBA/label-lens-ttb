#!/usr/bin/env node

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

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

  const responseForMode = (payload) => {
    const base = isRefinementRequest(payload) ? refinementPayload() : validPayload();
    switch (mode) {
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

  let healthy = false;
  setTimeout(() => {
    healthy = true;
  }, readyDelayMs);

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
    const content = responseForMode(payload).replace('"replace-me"', JSON.stringify(runId));
    if (mode === "write-after-cancel") {
      setTimeout(() => {
        writeFileSync(join(workspaceDir, "after-cancel.txt"), "late-write\n");
      }, 50);
    }
    res.setHeader("content-type", "application/json");
    res.end(
      JSON.stringify({
        choices: [{ message: { content } }],
      }),
    );
  });

  process.once("SIGTERM", () => {
    if (ignoreTermOnce && !ignoredTerm) {
      ignoredTerm = true;
      return;
    }
    server.close(() => process.exit(0));
  });
  process.once("SIGINT", () => {
    server.close(() => process.exit(0));
  });

  server.listen(port, host, () => {
    if (mode === "exit-before-ready") {
      process.exit(2);
    }
  });
}
