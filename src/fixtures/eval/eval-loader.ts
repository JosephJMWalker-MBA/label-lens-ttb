import { readFileSync } from "node:fs";
import { join } from "node:path";

import { sha256Hex } from "@/pipeline/extractor/image-integrity";

import { CORPUS_DIR } from "../corpus-index.load";
import { validateEvalManifest } from "./eval-manifest.schema";
import type { EvalCase, EvalManifest } from "./eval-manifest.types";

/**
 * Evaluation-only loader. Reads the versioned manifest and the referenced image
 * bytes from disk, verifying each image against its recorded SHA-256 so the
 * baseline always measures the exact committed pixels. Imported only by the
 * harness and its tests — never by production code.
 */

export const EVAL_MANIFEST_PATH = join(process.cwd(), "src/fixtures/eval/eval-manifest.json");

export function loadEvalManifest(): EvalManifest {
  const raw = readFileSync(EVAL_MANIFEST_PATH, "utf8");
  const result = validateEvalManifest(JSON.parse(raw));
  if (!result.ok) {
    throw new Error(`eval manifest invalid: ${result.error.issues.join("; ")}`);
  }
  return result.value;
}

/** Absolute path to a case's image within the committed corpus. */
export function caseImagePath(evalCase: EvalCase): string {
  return join(CORPUS_DIR, evalCase.fixtureDir, evalCase.imageFilename);
}

export interface LoadedCaseImage {
  bytes: Uint8Array;
  sha256: string;
}

/**
 * Read a case's image bytes and verify integrity. Throws if the bytes do not
 * match the manifest SHA — a silently-swapped fixture would corrupt the
 * baseline. The verified SHA is the value fed to the extractor as
 * `derivativeSha256`, so extraction never learns the fixture identity.
 */
export function loadCaseImage(evalCase: EvalCase): LoadedCaseImage {
  const bytes = new Uint8Array(readFileSync(caseImagePath(evalCase)));
  const sha256 = sha256Hex(bytes);
  if (sha256 !== evalCase.expectedSha256) {
    throw new Error(
      `image integrity mismatch for ${evalCase.caseId}: expected ${evalCase.expectedSha256}, got ${sha256}`,
    );
  }
  return { bytes, sha256 };
}
