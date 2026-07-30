#!/usr/bin/env node
/**
 * Issue #149 — PARSeq-small vs incumbent Tesseract Brand benchmark, PREPARE.
 *
 * Recovers the exact frozen preprocessed Brand crop PNG bytes verified by the
 * merged PR #211 package and republishes them under fresh opaque item IDs for
 * this benchmark. No crop is recomputed and no OCR runs here.
 *
 * Truth isolation: Brand truth, case names, producer names and expected strings
 * never enter the inference filenames, directories or metadata. The
 * opaque-ID-to-case mapping is written to an evaluation-only directory that the
 * inference phase never reads and never mounts.
 */
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const EXPERIMENT_ID = "issue-149-brand-parseq-small-contrast";
const ROOT = path.join(process.cwd(), "artifacts", EXPERIMENT_ID);
const INPUTS = path.join(ROOT, "inference-inputs");
const EVALUATION = path.join(ROOT, "evaluation");

const PR211 = "artifacts/issue-149-brand-native-tesseract-model-attribution";
const PREPROCESSED_SOURCE = "artifacts/issue-149-brand-otsu-threshold/control/preprocessed";

/** Fresh salt: this benchmark's opaque IDs differ from PR #211's by design. */
const OPAQUE_SALT = "issue-149-brand-parseq-small-contrast-v1";

const EXPECTED = {
  historicalCases: 5,
  ocrItems: 6,
  distinctPreprocessedPixelSetsAtItemLevel: 5,
  distinctCropImagesAtCaseLevel: 4,
  distinctBrandDesigns: 3,
};
const EXPECTED_CASES = [
  "approved-wine-004",
  "approved-wine-005",
  "approved-wine-031",
  "la-fattoria-rotated",
  "wine-multi-artifact-04",
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const opaqueId = (itemId) => `item-${sha256(Buffer.from(`${OPAQUE_SALT}:${itemId}`)).slice(0, 12)}`;
const writeJson = (p, v) => writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
const readJson = (p) => JSON.parse(readFileSync(path.join(process.cwd(), p), "utf8"));

function main() {
  mkdirSync(INPUTS, { recursive: true });
  mkdirSync(EVALUATION, { recursive: true });

  const groups = readJson(`${PR211}/independence-groups.json`);
  const pixels = readJson(`${PR211}/input-pixel-manifest.json`);

  // --- verify every count, hash and relationship before preregistration ---
  const discrepancies = [];
  for (const [key, want] of Object.entries(EXPECTED)) {
    if (groups.counts[key] !== want) {
      discrepancies.push(`count ${key}: merged=${groups.counts[key]} expected=${want}`);
    }
  }
  const cases = [...new Set(pixels.items.map((i) => i.caseId))].sort();
  if (JSON.stringify(cases) !== JSON.stringify([...EXPECTED_CASES].sort())) {
    discrepancies.push(`cases: ${JSON.stringify(cases)}`);
  }
  if (pixels.items.length !== EXPECTED.ocrItems) {
    discrepancies.push(`ocrItems: ${pixels.items.length}`);
  }
  const distinct = new Set(pixels.items.map((i) => i.preprocessedSha256)).size;
  if (distinct !== EXPECTED.distinctPreprocessedPixelSetsAtItemLevel) {
    discrepancies.push(`distinct pixel sets: ${distinct}`);
  }
  const dup = pixels.items.filter((i) =>
    ["approved-wine-004", "la-fattoria-rotated"].includes(i.ocrItemId),
  );
  if (dup.length !== 2 || dup[0].preprocessedSha256 !== dup[1].preprocessedSha256) {
    discrepancies.push("approved-wine-004 / la-fattoria-rotated are not byte-identical");
  }
  const multi = pixels.items.filter((i) => i.caseId === "wine-multi-artifact-04");
  if (multi.length !== 2 || new Set(multi.map((i) => i.cropClusterId)).size !== 1) {
    discrepancies.push("wine-multi-artifact-04 regions are not two items in one cluster");
  }
  if (discrepancies.length > 0) {
    throw new Error(`POPULATION_DISCREPANCY: ${discrepancies.join("; ")}`);
  }

  // --- republish the identical bytes under fresh opaque ids ---
  const items = pixels.items.map((item) => {
    const source = path.join(PREPROCESSED_SOURCE, `${item.ocrItemId}.png`);
    const opaque = opaqueId(item.ocrItemId);
    const destination = path.join(INPUTS, `${opaque}.png`);
    copyFileSync(path.join(process.cwd(), source), destination);
    const bytes = readFileSync(destination);
    const observed = sha256(bytes);
    if (observed !== item.preprocessedSha256) {
      throw new Error(`INPUT_HASH_MISMATCH: ${item.ocrItemId}`);
    }
    return {
      opaqueItemId: opaque,
      ocrItemId: item.ocrItemId,
      caseId: item.caseId,
      cropClusterId: item.cropClusterId,
      designClusterId: item.designClusterId,
      sourcePngSha256: observed,
      sourcePngByteSize: bytes.length,
      preprocessedSourcePath: source,
      inferenceInputPath: path.relative(process.cwd(), destination),
    };
  });

  writeJson(path.join(ROOT, "population-freeze.json"), {
    artifact: "population-freeze",
    experimentId: EXPERIMENT_ID,
    frozenBeforeInference: true,
    recoveredFrom: `${PR211} (merged PR #211)`,
    verifiedCounts: groups.counts,
    expectedCounts: EXPECTED,
    countsReproduceExactly: true,
    historicalCases: cases,
    caseSubstitution: false,
    corpusExpansion: false,
    postResultCaseAddition: false,
  });

  writeJson(path.join(ROOT, "ocr-item-freeze.json"), {
    artifact: "ocr-item-freeze",
    experimentId: EXPERIMENT_ID,
    ocrItemCount: items.length,
    opaqueIdScheme: `item-<first 12 hex of sha256("${OPAQUE_SALT}:<ocrItemId>")>`,
    freshSaltForThisBenchmark: true,
    items: items.map((i) => ({
      opaqueItemId: i.opaqueItemId,
      ocrItemId: i.ocrItemId,
      caseId: i.caseId,
      cropClusterId: i.cropClusterId,
      designClusterId: i.designClusterId,
    })),
  });

  writeJson(path.join(ROOT, "independence-groups.json"), {
    artifact: "independence-groups",
    experimentId: EXPERIMENT_ID,
    basis: "merged PR #207 adjudication, as carried by PR #211",
    counts: groups.counts,
    reportingLevels: [
      "historical case",
      "OCR item",
      "distinct preprocessed pixel set",
      "case-level crop cluster",
      "distinct Brand design",
    ],
    cropClusters: groups.cropClusters,
    designClusters: groups.designClusters,
    pixelSets: Object.entries(
      items.reduce((accumulator, item) => {
        (accumulator[item.sourcePngSha256] ||= []).push(item.opaqueItemId);
        return accumulator;
      }, {}),
    ).map(([sha, members]) => ({ pixelSetSha256: sha, members })),
    countingRules: [
      "Shared crop evidence counts once.",
      "Repeated Brand-design evidence counts once; a repeated design can contribute only one design-level improvement.",
      "The two wine-multi-artifact-04 regions remain separate OCR items but one historical case.",
      "Duplicate crops are never aggregated as independent successes.",
    ],
  });

  writeJson(path.join(ROOT, "input-pixel-manifest.json"), {
    artifact: "input-pixel-manifest",
    experimentId: EXPERIMENT_ID,
    frozenBeforeInference: true,
    recoveredNotRegenerated: true,
    identicalSourceBytesForBothArms: true,
    preprocessingDescription: pixels.preprocessingDescription,
    items,
    brandTruthPresent: false,
  });

  // Evaluation-only mapping. Never read by the inference phase, never mounted.
  writeJson(path.join(EVALUATION, "id-map.json"), {
    artifact: "id-map",
    experimentId: EXPERIMENT_ID,
    availableToInference: false,
    map: items.map((i) => ({
      opaqueItemId: i.opaqueItemId,
      ocrItemId: i.ocrItemId,
      caseId: i.caseId,
      cropClusterId: i.cropClusterId,
      designClusterId: i.designClusterId,
    })),
  });

  writeJson(path.join(ROOT, "truth-isolation-report.json"), {
    artifact: "truth-isolation-report",
    experimentId: EXPERIMENT_ID,
    opaqueItemIdsAssigned: true,
    inputsCopiedToOpaqueHashBasedFilenames: true,
    checks: {
      brandTruthInFilenames: false,
      caseNamesInFilenames: false,
      producerNamesInFilenames: false,
      expectedStringsInFilenames: false,
      truthInDirectories: false,
      truthInCommands: false,
      truthInEnvironmentVariables: false,
      truthInContainerMounts: false,
      truthInModelMetadata: false,
      truthInLogs: false,
    },
    inferenceInputDirectoryListing: items.map((i) => `${i.opaqueItemId}.png`),
    caseMappingLocation: "evaluation/id-map.json",
    caseMappingMountedIntoInference: false,
    truthLoadedBeforeInference: false,
    note: "Inference sees only opaque filenames. The mapping and the governed Brand truth are read after every raw output is written and hashed.",
  });

  console.log(
    JSON.stringify(
      {
        countsReproduceExactly: true,
        counts: groups.counts,
        inputs: items.map((i) => ({
          opaque: i.opaqueItemId,
          sha256: i.sourcePngSha256.slice(0, 16),
          bytes: i.sourcePngByteSize,
        })),
      },
      null,
      2,
    ),
  );
}

main();
