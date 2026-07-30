#!/usr/bin/env node
/**
 * Issue #149 — fail-closed retrieval of the PP-OCRv6-small ONNX model from its
 * immutable Hugging Face revision (plan §17 Phase 0 step 7, §12.3).
 *
 * Downloads exactly one pinned URL. There is no model argument, no URL argument
 * and no revision argument: the URL, the expected full SHA-256 and the expected
 * byte size are compiled in. Any mismatch deletes the file and exits non-zero, so
 * no session can ever load unverified bytes.
 *
 * Runs no inference and reads no corpus.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const MODEL_REPO = "PaddlePaddle/PP-OCRv6_small_rec_onnx";
const MODEL_COMMIT = "b8f84f0b80c529de40b4fbb3544b84fa7233a513";
const MODEL_FILE = "inference.onnx";
const URL = `https://huggingface.co/${MODEL_REPO}/resolve/${MODEL_COMMIT}/${MODEL_FILE}`;

/** Frozen from the git-lfs pointer at the pinned immutable revision (§3.3). */
const EXPECTED_SHA256 = "5435fd747c9e0efe15a96d0b378d5bd157e9492ed8fd80edf08f30d02fa24634";
const EXPECTED_BYTES = 21159378;

const CACHE_DIR = path.join(process.cwd(), ".local/ocr-research/models/ppocrv6-small-rec-onnx");
const CACHE_FILE = path.join(CACHE_DIR, MODEL_FILE);

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function failClosed(reason, detail) {
  if (existsSync(CACHE_FILE)) rmSync(CACHE_FILE, { force: true });
  console.error(
    JSON.stringify(
      {
        status: "FAILED",
        reason,
        detail,
        downloadedFileDeleted: true,
        inferenceMustNotRun: true,
        expected: { sha256: EXPECTED_SHA256, byteSize: EXPECTED_BYTES },
        url: URL,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

function verifyCache() {
  if (!existsSync(CACHE_FILE)) return false;
  const bytes = readFileSync(CACHE_FILE);
  return bytes.length === EXPECTED_BYTES && sha256(bytes) === EXPECTED_SHA256;
}

async function main() {
  // Cached bytes are reverified on every invocation, never trusted by presence.
  if (verifyCache()) {
    console.log(
      JSON.stringify(
        {
          status: "VERIFIED_CACHED",
          path: CACHE_FILE,
          sha256: EXPECTED_SHA256,
          byteSize: EXPECTED_BYTES,
          modelRepository: MODEL_REPO,
          modelCommit: MODEL_COMMIT,
          license: "Apache-2.0 (model card frontmatter at the pinned revision)",
          downloaded: false,
        },
        null,
        2,
      ),
    );
    return;
  }

  mkdirSync(CACHE_DIR, { recursive: true });
  let response;
  try {
    response = await fetch(URL, { redirect: "follow" });
  } catch (cause) {
    failClosed("NETWORK_ERROR", cause instanceof Error ? cause.message : String(cause));
    return;
  }
  if (!response.ok) {
    failClosed("HTTP_ERROR", `${response.status} ${response.statusText}`);
    return;
  }
  writeFileSync(CACHE_FILE, Buffer.from(await response.arrayBuffer()));

  const actualBytes = statSync(CACHE_FILE).size;
  if (actualBytes !== EXPECTED_BYTES) {
    failClosed("BYTE_SIZE_MISMATCH", `expected ${EXPECTED_BYTES}, got ${actualBytes}`);
    return;
  }
  const actualSha = sha256(readFileSync(CACHE_FILE));
  if (actualSha !== EXPECTED_SHA256) {
    failClosed("SHA256_MISMATCH", `expected ${EXPECTED_SHA256}, got ${actualSha}`);
    return;
  }

  console.log(
    JSON.stringify(
      {
        status: "VERIFIED_DOWNLOADED",
        path: CACHE_FILE,
        sha256: actualSha,
        byteSize: actualBytes,
        modelRepository: MODEL_REPO,
        modelCommit: MODEL_COMMIT,
        license: "Apache-2.0 (model card frontmatter at the pinned revision)",
        downloaded: true,
      },
      null,
      2,
    ),
  );
}

main().catch((error) =>
  failClosed("UNEXPECTED_ERROR", error instanceof Error ? error.message : String(error)),
);
