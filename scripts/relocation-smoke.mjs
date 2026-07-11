#!/usr/bin/env node
/**
 * Production relocation smoke for the local OCR path.
 *
 * Proves that the standalone production server resolves its OCR assets
 * (vendored eng.traineddata, Tesseract core) from a deployment-relative root
 * rather than the build-machine checkout: it copies the standalone output to a
 * temp directory OUTSIDE the repository, starts `node server.js` there, and
 * drives the bundled M Cellars fixture through the real OCR pipeline via
 * POST /api/precheck (source=sample). It asserts a valid bounded response and
 * that no source-checkout absolute path leaks into the compiled OCR resolution
 * or the runtime response.
 *
 * Requires a prior `next build` (standalone output). Run: node scripts/relocation-smoke.mjs
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import http from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STANDALONE = path.join(REPO, ".next/standalone");
const STATIC_SRC = path.join(REPO, ".next/static");
const CHECKOUT_MARKER = "Documents/GitHub/label-lens-ttb/src/pipeline/extractor";

function fail(msg) {
  console.error(`RELOCATION SMOKE FAILED: ${msg}`);
  process.exit(1);
}

function post(port, body) {
  return new Promise((resolve, reject) => {
    const data = new URLSearchParams(body).toString();
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/api/precheck",
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "content-length": Buffer.byteLength(data),
        },
      },
      (res) => {
        let out = "";
        res.on("data", (c) => (out += c));
        res.on("end", () => resolve({ status: res.statusCode, text: out }));
      },
    );
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

/** Reserve a free ephemeral port so a stale server never answers on our behalf. */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

async function waitForReady(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await post(port, { source: "upload", brand: "", alcohol: "" });
      // Any HTTP response (even a 400) proves the server is up and routing.
      if (res.status) return true;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
  return false;
}

async function main() {
  if (!existsSync(STANDALONE)) fail("no .next/standalone output; run `npm run build` first.");

  const relocated = mkdtempSync(path.join(tmpdir(), "label-lens-relocate-"));
  let child;
  try {
    // 1. Copy the standalone output outside the checkout and satisfy Next's
    //    documented requirement to place `.next/static` beside the server.
    cpSync(STANDALONE, relocated, { recursive: true });
    if (existsSync(STATIC_SRC)) {
      cpSync(STATIC_SRC, path.join(relocated, ".next/static"), { recursive: true });
    }

    // 2. The relocated copy must not depend on the checkout for OCR assets.
    const relocatedTrained = path.join(relocated, "src/pipeline/extractor/assets/eng.traineddata");
    if (!existsSync(relocatedTrained)) fail("relocated output is missing eng.traineddata.");

    // 3. The compiled OCR resolution must carry no checkout absolute path.
    const routeJs = readFileSync(
      path.join(relocated, ".next/server/app/api/precheck/route.js"),
      "utf8",
    );
    if (routeJs.includes(CHECKOUT_MARKER)) {
      fail("compiled route embeds the checkout OCR asset path after relocation.");
    }

    // 4. Start the relocated production server on a freshly reserved ephemeral
    //    port (so no stale server from a prior run can answer for us) with an
    //    isolated cwd, defeating any accidental checkout/$HOME anchoring.
    const port = await freePort();
    child = spawn("node", ["server.js"], {
      cwd: relocated,
      env: { ...process.env, PORT: String(port), HOSTNAME: "127.0.0.1", NODE_ENV: "production" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let serverLog = "";
    child.stdout.on("data", (d) => (serverLog += d));
    child.stderr.on("data", (d) => (serverLog += d));

    if (!(await waitForReady(port, 30_000))) fail(`relocated server did not start:\n${serverLog}`);

    // 5. Drive the bundled M Cellars fixture through the REAL OCR path.
    const res = await post(port, { source: "sample", brand: "M CELLARS", alcohol: "12.5" });
    if (res.status !== 200)
      fail(
        `expected 200 from relocated OCR route, got ${res.status}: ${res.text}\n--- server log ---\n${serverLog}`,
      );

    const body = JSON.parse(res.text);
    if (!body.ok) fail(`relocated route returned an error: ${res.text}`);
    const data = body.data;

    // 6. Bounded, correct response from real OCR after relocation.
    const alcohol = data.observations?.alcoholStatement?.value;
    if (alcohol !== "12.5% ALC./VOL.") fail(`unexpected alcohol observation: ${alcohol}`);
    if (data.observations?.brandName?.state !== "AMBIGUOUS")
      fail(`expected AMBIGUOUS brand, got ${data.observations?.brandName?.state}`);
    const ocr = data.observations?.provenance?.ocrEngine;
    if (!ocr || ocr.engineId !== "tesseract.js")
      fail(`expected tesseract.js engine provenance, got ${JSON.stringify(ocr)}`);

    // 7. No checkout absolute path in the response or the server error log.
    if (res.text.includes(CHECKOUT_MARKER)) fail("response leaks the checkout OCR asset path.");
    if (serverLog.includes(CHECKOUT_MARKER)) fail("server log leaks the checkout OCR asset path.");

    console.log(
      `RELOCATION SMOKE PASSED: real OCR ran from ${relocated}; ` +
        `alcohol="${alcohol}", brand=${data.observations.brandName.state}, ocr=${ocr.engineId}@${ocr.engineVersion}.`,
    );
  } finally {
    if (child && !child.killed) child.kill("SIGKILL");
    rmSync(relocated, { recursive: true, force: true });
  }
}

main().catch((e) => fail(e?.stack || String(e)));
