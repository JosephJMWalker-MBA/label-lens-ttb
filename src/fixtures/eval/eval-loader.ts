import { readFileSync } from "node:fs";
import { join } from "node:path";

import { sha256Hex } from "@/pipeline/extractor/image-integrity";

import { CORPUS_DIR } from "../corpus-index.load";
import { validateEvalManifest } from "./eval-manifest.schema";
import type { EvalCase, IncludedEvalRecord, LoadedEvalManifest } from "./eval-manifest.types";

/**
 * Evaluation-only loader. Reads the versioned manifest and the referenced image
 * bytes from disk, verifying each image against its recorded SHA-256 so the
 * baseline always measures the exact committed pixels. Imported only by the
 * harness and its tests — never by production code.
 */

export const EVAL_MANIFEST_PATH = join(process.cwd(), "src/fixtures/eval/eval-manifest.json");

function brandApproxLocation(
  record: IncludedEvalRecord,
): EvalCase["brand"]["approxLocation"] | undefined {
  if (
    [
      "vertical-clockwise",
      "vertical-counterclockwise",
      "vertical-stacked",
      "rotated-180",
      "mixed",
    ].includes(record.annotation.brand.orientation)
  ) {
    return "rotated";
  }
  return undefined;
}

function alcoholApproxLocation(
  record: IncludedEvalRecord,
): EvalCase["alcohol"]["approxLocation"] | undefined {
  const strata = record.inspection.visualStrata;
  if (
    strata.includes("alcohol-at-side-or-rotated") ||
    strata.includes("vertical-mandatory-strip")
  ) {
    return "rotated";
  }
  if (strata.includes("alcohol-at-bottom")) return "bottom";
  return undefined;
}

function alcoholDetectionChallenge(record: IncludedEvalRecord): string | undefined {
  const characteristics =
    record.annotation.alcohol.presence === "present"
      ? record.annotation.alcohol.characteristics
      : [];
  if (characteristics.includes("no-percent-sign")) {
    return "the printed statement omits the percent sign";
  }
  if (characteristics.includes("split-token")) {
    return "the alcohol statement is split across multiple OCR tokens";
  }
  if (characteristics.includes("rotated-or-vertical")) {
    return "the alcohol statement is printed vertically or otherwise rotated";
  }
  return undefined;
}

function toCompatCase(record: IncludedEvalRecord): EvalCase {
  const imagePath = record.imagePath.replace(/^tests\/fixtures\/precheck\//, "");
  const segments = imagePath.split("/");
  const fixtureDir = segments.at(-2);
  const imageFilename = segments.at(-1);
  if (!fixtureDir || !imageFilename) {
    throw new Error(`invalid image path for included record ${record.caseId}: ${record.imagePath}`);
  }
  return {
    caseId: record.caseId,
    fixtureDir,
    imageFilename,
    expectedSha256: record.expectedSha256,
    source: `${record.source.authority}: ${record.source.description}`,
    usageStatus: record.source.usageStatus,
    strata: record.inspection.visualStrata,
    brand: {
      present: record.annotation.brand.presence === "present",
      acceptable:
        record.annotation.brand.presence === "present"
          ? record.annotation.brand.acceptablePresentations
          : [],
      knownAmbiguous: record.annotation.brand.genuinelyAmbiguous,
      approxLocation: brandApproxLocation(record),
      forbidden: record.annotation.brand.forbiddenPresentations,
      absenceReason:
        record.annotation.brand.presence === "absent"
          ? record.annotation.brand.absenceReason
          : undefined,
    },
    alcohol: {
      present: record.annotation.alcohol.presence === "present",
      acceptablePercents:
        record.annotation.alcohol.presence === "present"
          ? record.annotation.alcohol.acceptablePercents
          : [],
      acceptableText:
        record.annotation.alcohol.presence === "present"
          ? record.annotation.alcohol.acceptableStatements
          : [],
      approxLocation: alcoholApproxLocation(record),
      detectionChallenge: alcoholDetectionChallenge(record),
    },
    annotation: {
      annotatedBy: record.annotation.provenance.annotatedBy,
      annotatedOn: record.annotation.provenance.annotatedOn,
      method: record.annotation.provenance.method,
      notes: record.annotation.notes,
    },
  };
}

export function loadEvalManifest(): LoadedEvalManifest {
  const raw = readFileSync(EVAL_MANIFEST_PATH, "utf8");
  const result = validateEvalManifest(JSON.parse(raw));
  if (!result.ok) {
    throw new Error(`eval manifest invalid: ${result.error.issues.join("; ")}`);
  }
  const manifest = result.value;
  const cases = manifest.records
    .filter((record): record is IncludedEvalRecord => record.status === "included")
    .map(toCompatCase);
  return { ...manifest, cases };
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
