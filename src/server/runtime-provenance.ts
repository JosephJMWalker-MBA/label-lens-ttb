import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ExecutableProvenance } from "@/domain/run/version-manifest.types";
import { resolveLangPath } from "@/pipeline/extractor/ocr-engine";
import { winePrecheckRegistry } from "@/pipeline/precheck/wine-precheck.profile";

/**
 * The single canonical runtime provenance source.
 *
 * Every layer — the analysis run, the analyzer invocation, orchestration, result
 * assembly, JSON export, and the readable report — derives its executable
 * identity from this one object, so adapter/OCR/model/parser/profile/rule/
 * authority/build identities cannot silently drift between files. The OCR model
 * identity is the SHA-256 of the actually vendored `eng.traineddata`, computed
 * once from the file at initialization and cached (never per token or per rule),
 * so it reflects the asset rather than any claimed release.
 */

const EXTRACTION_ADAPTER_ID = "local-two-field-extractor";
const EXTRACTION_ADAPTER_VERSION = "1.0.0";
const OCR_ENGINE_ID = "tesseract.js";
const OCR_ENGINE_VERSION = "7.0.0";
const OCR_MODEL_ID = "eng";
const PARSER_ID = "wine-alcohol-parse";
const PARSER_VERSION = "1.0.0";
const PACKAGE_VERSION = "0.1.0";
const TRAINEDDATA_FILE = "eng.traineddata";

/** Environment variable carrying a real deployed build commit, when available. */
const BUILD_COMMIT_ENV = "LABEL_LENS_BUILD_COMMIT";
/** Render automatically supplies the deployed Git commit when available. */
const RENDER_BUILD_COMMIT_ENV = "RENDER_GIT_COMMIT";

const AUTHORITIES = [
  { citation: "27 CFR 4.32; 27 CFR 4.33", snapshotDate: "2026-07-10" },
  { citation: "27 CFR 4.36", snapshotDate: "2026-07-10" },
] as const;

let cached: ExecutableProvenance | null = null;

/** Cached SHA-256 of the vendored language model, computed from the actual file. */
async function trainedDataSha256(): Promise<string> {
  const bytes = await readFile(join(resolveLangPath(), TRAINEDDATA_FILE));
  return createHash("sha256").update(bytes).digest("hex");
}

/** Honest application build identity: a real commit only when the env supplies one. */
function applicationBuild(): ExecutableProvenance["applicationBuild"] {
  const commit =
    resolveCommitFromEnv(BUILD_COMMIT_ENV) ?? resolveCommitFromEnv(RENDER_BUILD_COMMIT_ENV);
  if (commit && commit !== "") {
    return {
      packageVersion: PACKAGE_VERSION,
      gitCommitSha: commit,
      commitProvenance: "build-environment",
    };
  }
  return {
    packageVersion: PACKAGE_VERSION,
    commitProvenance: "unavailable-development-fallback",
  };
}

function resolveCommitFromEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value && value !== "" ? value : undefined;
}

/**
 * Build (and cache) the canonical executable provenance. Deterministic for
 * identical executable inputs: it reads no clock and generates no random id, and
 * the model digest is a pure function of the committed file.
 */
export async function getExecutableProvenance(): Promise<ExecutableProvenance> {
  if (cached) return cached;
  const modelSha256 = await trainedDataSha256();
  cached = {
    extractionAdapterId: EXTRACTION_ADAPTER_ID,
    extractionAdapterVersion: EXTRACTION_ADAPTER_VERSION,
    ocrEngine: {
      kind: "ocr",
      engineId: OCR_ENGINE_ID,
      engineVersion: OCR_ENGINE_VERSION,
      modelId: OCR_MODEL_ID,
      modelSha256,
    },
    parserId: PARSER_ID,
    parserVersion: PARSER_VERSION,
    ruleProfileId: winePrecheckRegistry.profileId,
    ruleProfileVersion: winePrecheckRegistry.profileVersion,
    rules: winePrecheckRegistry.ruleManifest(),
    authorities: AUTHORITIES.map((a) => ({ ...a })),
    applicationBuild: applicationBuild(),
  };
  return cached;
}

/** Test-only: clear the cache so a changed environment is re-read. */
export function resetExecutableProvenanceCache(): void {
  cached = null;
}
