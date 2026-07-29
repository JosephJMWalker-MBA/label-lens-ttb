#!/usr/bin/env node
/**
 * Issue #149 — fail-closed retrieval of the explicitly licensed PARSeq-small
 * checkpoint from its immutable Hugging Face revision.
 *
 * Downloads exactly one pinned URL. There is no model argument, no URL argument,
 * no revision argument and no fallback: the URL, the expected full SHA-256 and
 * the expected byte size are compiled in. Any mismatch deletes the file and
 * exits non-zero, so no inference can run against unverified bytes.
 *
 * Runs no inference and reads no corpus.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const MODEL_REPO = "baudm/parseq-small";
const MODEL_COMMIT = "a1526c3d63740e460153987f9aaf6b86aa199dc1";
const MODEL_FILE = "pytorch_model.bin";
const URL = `https://huggingface.co/${MODEL_REPO}/resolve/${MODEL_COMMIT}/${MODEL_FILE}`;

/** Frozen from the LFS pointer at the pinned immutable revision. */
const EXPECTED_SHA256 = "bb5792a68e367476abca029cbf8699abc805f3d3dc7e57aae45c8ec4f7b7cd00";
const EXPECTED_BYTES = 95392675;

const CACHE_DIR = path.join(process.cwd(), ".local/ocr-research/models/parseq-small");
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
          license: "Apache-2.0 (model card at the pinned revision)",
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
        license: "Apache-2.0 (model card at the pinned revision)",
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
