#!/usr/bin/env node
/**
 * Deterministic retrieval of the pinned upstream tessdata_best English model.
 *
 * The binary is intentionally NOT vendored in this repository. This script
 * reproduces exactly the file that was inspected during the blocked Issue #149
 * stronger-Tesseract investigation, into an untracked research-local cache.
 *
 * It downloads one pinned URL and nothing else. There is no model argument, no
 * URL argument, no fallback mirror, and no "nearest match" behaviour: the URL,
 * the expected byte size, and the expected sha256 are compiled in. On any
 * mismatch the downloaded file is deleted and the script exits non-zero.
 *
 * Runs no OCR and produces no experimental result.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Upstream repository, pinned to an immutable commit. Never parameterised. */
const UPSTREAM_REPO = "https://github.com/tesseract-ocr/tessdata_best";
const UPSTREAM_COMMIT = "9ddc24e750eec0994223a9edc3fcb434a2244f3b";
const UPSTREAM_FILE = "eng.traineddata";
const UPSTREAM_URL = `https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/${UPSTREAM_COMMIT}/${UPSTREAM_FILE}`;

/** Integrity expectations recorded during the blocked investigation. */
const EXPECTED_SHA256 = "8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba";
const EXPECTED_BYTE_SIZE = 15400601;

/** Untracked, research-local, outside src/ and outside the fixture tree. */
const CACHE_DIR = path.join(process.cwd(), ".local/ocr-research/traineddata/tessdata-best");
const CACHE_FILE = path.join(CACHE_DIR, UPSTREAM_FILE);

const LICENSE_NOTE =
  "Apache-2.0. See artifacts/issue-149-brand-stronger-tesseract-comparison/vendor/tessdata-best/LICENSE.";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function verifyExistingCache() {
  if (!existsSync(CACHE_FILE)) return false;
  const bytes = readFileSync(CACHE_FILE);
  return bytes.length === EXPECTED_BYTE_SIZE && sha256(bytes) === EXPECTED_SHA256;
}

function failClosed(reason, detail) {
  if (existsSync(CACHE_FILE)) {
    rmSync(CACHE_FILE, { force: true });
  }
  console.error(
    JSON.stringify(
      {
        status: "FAILED",
        reason,
        detail,
        downloadedFileDeleted: true,
        expected: { sha256: EXPECTED_SHA256, byteSize: EXPECTED_BYTE_SIZE },
        url: UPSTREAM_URL,
        note: "The retrieved bytes did not match the pinned expectations, so they were deleted rather than kept. No substitute model or URL is attempted.",
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

async function main() {
  if (verifyExistingCache()) {
    console.log(
      JSON.stringify(
        {
          status: "VERIFIED_CACHED",
          path: CACHE_FILE,
          sha256: EXPECTED_SHA256,
          byteSize: EXPECTED_BYTE_SIZE,
          upstream: { repository: UPSTREAM_REPO, commit: UPSTREAM_COMMIT, url: UPSTREAM_URL },
          license: LICENSE_NOTE,
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
    response = await fetch(UPSTREAM_URL, { redirect: "follow" });
  } catch (cause) {
    failClosed("NETWORK_ERROR", cause instanceof Error ? cause.message : String(cause));
    return;
  }
  if (!response.ok) {
    failClosed("HTTP_ERROR", `${response.status} ${response.statusText}`);
    return;
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  writeFileSync(CACHE_FILE, bytes);

  const actualSize = statSync(CACHE_FILE).size;
  if (actualSize !== EXPECTED_BYTE_SIZE) {
    failClosed("BYTE_SIZE_MISMATCH", `expected ${EXPECTED_BYTE_SIZE}, got ${actualSize}`);
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
        byteSize: actualSize,
        upstream: { repository: UPSTREAM_REPO, commit: UPSTREAM_COMMIT, url: UPSTREAM_URL },
        license: LICENSE_NOTE,
        downloaded: true,
        note: "Verified local path for a future, separately preregistered experiment. Nothing here authorises running one.",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  failClosed("UNEXPECTED_ERROR", error instanceof Error ? error.message : String(error));
});
