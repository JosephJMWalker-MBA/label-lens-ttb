#!/usr/bin/env node
/**
 * Issue #149 — PP-OCRv6-small ONNX versus frozen incumbent Tesseract Brand
 * evidence: population staging and Arm A carry-forward.
 *
 * Deterministic and evaluation-only. It runs NO inference, downloads NO model,
 * and reads NO Brand truth. It:
 *
 *   1. verifies the six frozen source PNGs against the merged PR #214
 *      input-pixel-manifest.json, by SHA-256 and byte size, fail-closed;
 *   2. verifies the population structure (5 cases / 6 items / 5 pixel sets /
 *      4 crop clusters / 3 designs) and fails closed on any discrepancy;
 *   3. stages byte-identical copies under fresh opaque identifiers derived from
 *      a new experiment-specific salt;
 *   4. copies the twelve frozen Arm A raw outputs verbatim and proves each one
 *      matches the SHA-256 recorded in PR #214's raw-output-manifest.json;
 *   5. writes the evaluation-only identifier map, which the inference phase
 *      never reads and which is never mounted into a container.
 *
 * Re-running it is safe: every check is recomputed from the merged sources.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const EXPERIMENT_ID = "issue-149-brand-ppocrv6-small-onnx-contrast";
const ROOT = path.join(process.cwd(), "artifacts", EXPERIMENT_ID);
const INPUTS = path.join(ROOT, "inference-inputs");
const ARM_A_FROZEN = path.join(ROOT, "arm-a-frozen");
const EVALUATION = path.join(ROOT, "evaluation");

/** Merged PR #214 package. Read-only here; never modified. */
const PR214 = "artifacts/issue-149-brand-parseq-small-contrast";
const PR214_PIXELS = `${PR214}/input-pixel-manifest.json`;
const PR214_POPULATION = `${PR214}/population-freeze.json`;
const PR214_RAW_MANIFEST = `${PR214}/raw-output-manifest.json`;
const PR214_RESULTS = `${PR214}/per-item-results.json`;
const PR214_ARM_A = `${PR214}/arm-a-provenance.json`;

/** Fresh salt. Deliberately different from PR #214's, so identifiers do not carry over. */
const OPAQUE_SALT = "issue-149-brand-ppocrv6-small-onnx-contrast-v1";

/** Frozen expectations. Not read from the source files, so a drifted source fails. */
const EXPECTED = {
  historicalCases: 5,
  ocrItems: 6,
  distinctPixelSetsAtItemLevel: 5,
  distinctCropClustersAtCaseLevel: 4,
  distinctBrandDesigns: 3,
  armARawFiles: 12,
};

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = (p) => JSON.parse(readFileSync(path.join(process.cwd(), p), "utf8"));
const writeJson = (p, v) => writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);

/**
 * Format the written artifacts before anything hashes them. Without this, a later
 * `prettier --write` would change bytes that the preregistration and manifests
 * have already committed to, and the two would chase each other.
 */
const format = (files) =>
  execFileSync("npx", ["prettier", "--write", "--log-level", "warn", ...files], {
    stdio: "inherit",
  });
const opaqueId = (ocrItemId) =>
  `item-${sha256(Buffer.from(`${OPAQUE_SALT}:${ocrItemId}`)).slice(0, 12)}`;

function fail(reason, detail) {
  console.error(
    JSON.stringify({ status: "BLOCKED", reason, detail, inferenceMustNotRun: true }, null, 2),
  );
  process.exit(1);
}

function main() {
  mkdirSync(INPUTS, { recursive: true });
  mkdirSync(ARM_A_FROZEN, { recursive: true });
  mkdirSync(EVALUATION, { recursive: true });

  const pixels = readJson(PR214_PIXELS);
  const population = readJson(PR214_POPULATION);
  const rawManifest = readJson(PR214_RAW_MANIFEST);

  // ---- population structure -------------------------------------------
  const counts = population.verifiedCounts;
  const structure = {
    historicalCases: counts.historicalCases,
    ocrItems: counts.ocrItems,
    distinctPixelSetsAtItemLevel: counts.distinctPreprocessedPixelSetsAtItemLevel,
    distinctCropClustersAtCaseLevel: counts.distinctCropImagesAtCaseLevel,
    distinctBrandDesigns: counts.distinctBrandDesigns,
  };
  for (const [key, expected] of Object.entries(EXPECTED)) {
    if (key === "armARawFiles") continue;
    if (structure[key] !== expected) {
      fail(
        "POPULATION_DISCREPANCY",
        `${key}: expected ${expected}, merged source says ${structure[key]}`,
      );
    }
  }
  if (pixels.items.length !== EXPECTED.ocrItems) {
    fail(
      "POPULATION_DISCREPANCY",
      `pixel manifest lists ${pixels.items.length} items, expected ${EXPECTED.ocrItems}`,
    );
  }

  // ---- six source PNGs, verified against PR #214 -----------------------
  const items = pixels.items.map((item) => {
    const source = item.preprocessedSourcePath;
    let bytes;
    try {
      bytes = readFileSync(path.join(process.cwd(), source));
    } catch (cause) {
      fail(
        "SOURCE_PNG_MISSING",
        `${source}: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
      return null;
    }
    const observedSha = sha256(bytes);
    if (observedSha !== item.sourcePngSha256) {
      fail(
        "SOURCE_PNG_SHA256_MISMATCH",
        `${source}: expected ${item.sourcePngSha256}, observed ${observedSha}`,
      );
    }
    if (bytes.length !== item.sourcePngByteSize) {
      fail(
        "SOURCE_PNG_BYTE_SIZE_MISMATCH",
        `${source}: expected ${item.sourcePngByteSize}, observed ${bytes.length}`,
      );
    }

    const opaque = opaqueId(item.ocrItemId);
    const destination = path.join(INPUTS, `${opaque}.png`);
    copyFileSync(path.join(process.cwd(), source), destination);
    const staged = readFileSync(destination);
    if (sha256(staged) !== observedSha || staged.length !== bytes.length) {
      fail("STAGED_COPY_NOT_BYTE_IDENTICAL", destination);
    }

    return {
      opaqueItemId: opaque,
      priorOpaqueItemId: item.opaqueItemId,
      ocrItemId: item.ocrItemId,
      caseId: item.caseId,
      cropClusterId: item.cropClusterId,
      designClusterId: item.designClusterId,
      sourcePngSha256: observedSha,
      sourcePngByteSize: bytes.length,
      preprocessedSourcePath: source,
      pr214VerifiedSha256: item.sourcePngSha256,
      pr214VerifiedByteSize: item.sourcePngByteSize,
      matchesPr214: true,
      inferenceInputPath: path.relative(process.cwd(), destination),
    };
  });

  // Identifiers must actually be fresh, not accidentally equal to PR #214's.
  const collisions = items.filter((i) => i.opaqueItemId === i.priorOpaqueItemId);
  if (collisions.length > 0) {
    fail(
      "OPAQUE_ID_NOT_FRESH",
      collisions.map((i) => i.ocrItemId),
    );
  }
  if (new Set(items.map((i) => i.opaqueItemId)).size !== items.length) {
    fail("OPAQUE_ID_COLLISION", "two OCR items produced the same opaque identifier");
  }

  const distinctPixelSets = new Set(items.map((i) => i.sourcePngSha256)).size;
  if (distinctPixelSets !== EXPECTED.distinctPixelSetsAtItemLevel) {
    fail(
      "PIXEL_SET_DISCREPANCY",
      `expected ${EXPECTED.distinctPixelSetsAtItemLevel}, observed ${distinctPixelSets}`,
    );
  }

  const cropClusters = {};
  const designClusters = {};
  for (const item of items) {
    (cropClusters[item.cropClusterId] ||= new Set()).add(item.caseId);
    (designClusters[item.designClusterId] ||= new Set()).add(item.caseId);
  }
  if (Object.keys(cropClusters).length !== EXPECTED.distinctCropClustersAtCaseLevel) {
    fail("CROP_CLUSTER_DISCREPANCY", Object.keys(cropClusters));
  }
  if (Object.keys(designClusters).length !== EXPECTED.distinctBrandDesigns) {
    fail("DESIGN_CLUSTER_DISCREPANCY", Object.keys(designClusters));
  }

  // ---- Arm A carry-forward, hash-verified against PR #214 --------------
  const armARecorded = new Map(
    rawManifest.files
      .filter((entry) => entry.path.startsWith("raw/A-"))
      .map((entry) => [entry.path, entry.sha256]),
  );
  if (armARecorded.size !== EXPECTED.armARawFiles) {
    fail(
      "ARM_A_FILE_COUNT_DISCREPANCY",
      `expected ${EXPECTED.armARawFiles}, manifest lists ${armARecorded.size}`,
    );
  }

  const carried = [];
  for (const [relative, recordedSha] of [...armARecorded].sort()) {
    const source = `${PR214}/${relative}`;
    let bytes;
    try {
      bytes = readFileSync(path.join(process.cwd(), source));
    } catch (cause) {
      fail(
        "ARM_A_FILE_MISSING",
        `${source}: ${cause instanceof Error ? cause.message : String(cause)}`,
      );
      return;
    }
    const observedSha = sha256(bytes);
    if (observedSha !== recordedSha) {
      fail(
        "ARM_A_SHA256_MISMATCH",
        `${source}: PR #214 manifest says ${recordedSha}, observed ${observedSha}`,
      );
    }
    const basename = path.basename(relative);
    copyFileSync(path.join(process.cwd(), source), path.join(ARM_A_FROZEN, basename));
    if (sha256(readFileSync(path.join(ARM_A_FROZEN, basename))) !== recordedSha) {
      fail("ARM_A_COPY_NOT_BYTE_IDENTICAL", basename);
    }
    const parsed = JSON.parse(bytes.toString("utf8"));
    carried.push({
      file: basename,
      sourcePath: source,
      pr214RecordedSha256: recordedSha,
      observedSha256: observedSha,
      matches: true,
      priorOpaqueItemId: parsed.opaqueItemId,
      run: parsed.run,
      outputFingerprint: parsed.outputFingerprint,
      sourcePngSha256: parsed.sourcePngSha256,
    });
  }

  // Every carried Arm A file must belong to a frozen item, and every item must
  // have exactly one primary and one repeat.
  const priorIds = new Set(items.map((i) => i.priorOpaqueItemId));
  for (const entry of carried) {
    if (!priorIds.has(entry.priorOpaqueItemId)) {
      fail("ARM_A_ITEM_NOT_IN_POPULATION", entry.file);
    }
  }
  for (const item of items) {
    const runs = carried
      .filter((c) => c.priorOpaqueItemId === item.priorOpaqueItemId)
      .map((c) => c.run)
      .sort();
    if (JSON.stringify(runs) !== JSON.stringify(["primary", "repeat"])) {
      fail("ARM_A_RUN_PAIR_INCOMPLETE", `${item.ocrItemId}: ${JSON.stringify(runs)}`);
    }
  }

  // Arm A source pixels must be the same bytes this experiment stages.
  for (const entry of carried) {
    const item = items.find((i) => i.priorOpaqueItemId === entry.priorOpaqueItemId);
    if (entry.sourcePngSha256 !== item.sourcePngSha256) {
      fail(
        "ARM_A_SOURCE_PIXEL_MISMATCH",
        `${entry.file}: ${entry.sourcePngSha256} vs ${item.sourcePngSha256}`,
      );
    }
  }

  // ---- artifacts -------------------------------------------------------
  writeJson(path.join(ROOT, "population-freeze.json"), {
    artifact: "population-freeze",
    experimentId: EXPERIMENT_ID,
    frozenBeforeInference: true,
    recoveredFrom: "artifacts/issue-149-brand-parseq-small-contrast (merged PR #214)",
    expectedCounts: {
      historicalCases: EXPECTED.historicalCases,
      ocrItems: EXPECTED.ocrItems,
      distinctPixelSetsAtItemLevel: EXPECTED.distinctPixelSetsAtItemLevel,
      distinctCropClustersAtCaseLevel: EXPECTED.distinctCropClustersAtCaseLevel,
      distinctBrandDesigns: EXPECTED.distinctBrandDesigns,
    },
    verifiedCounts: structure,
    countsReproduceExactly: true,
    historicalCases: population.historicalCases,
    caseSubstitution: false,
    corpusExpansion: false,
    postResultCaseAddition: false,
    recroppingPerformed: false,
    newExamplesAdded: false,
    failClosedRule:
      "Any discrepancy between the frozen expectations compiled into the prepare script and the merged PR #214 source halts before staging. The expectations are not read from the source file, so a drifted source cannot silently redefine the population.",
  });

  writeJson(path.join(ROOT, "input-pixel-manifest.json"), {
    artifact: "input-pixel-manifest",
    experimentId: EXPERIMENT_ID,
    frozenBeforeInference: true,
    recoveredNotRegenerated: true,
    verifiedAgainst: PR214_PIXELS,
    allSixVerifyAgainstPr214: true,
    preprocessingDescription: pixels.preprocessingDescription,
    armAConsumesTheseBytes:
      "Arm A does not re-consume them: its evidence is carried forward frozen from PR #214, which consumed exactly these bytes. The recorded per-file sourcePngSha256 values are re-verified to match.",
    armBConsumesTheseBytes: true,
    opaqueIdScheme: `item-<first 12 hex of sha256("${OPAQUE_SALT}:<ocrItemId>")>`,
    freshSaltForThisBenchmark: true,
    priorSaltReused: false,
    items,
    distinctPixelSetsAtItemLevel: distinctPixelSets,
    brandTruthPresent: false,
  });

  writeJson(path.join(ROOT, "independence-groups.json"), {
    artifact: "independence-groups",
    experimentId: EXPERIMENT_ID,
    basis: "PR #207 adjudication, carried through PR #211 and PR #214 unchanged",
    counts: {
      historicalCases: EXPECTED.historicalCases,
      ocrItems: EXPECTED.ocrItems,
      distinctPixelSetsAtItemLevel: distinctPixelSets,
      distinctCropClustersAtCaseLevel: Object.keys(cropClusters).length,
      distinctBrandDesigns: Object.keys(designClusters).length,
    },
    cropClusters: Object.entries(cropClusters).map(([id, cases]) => ({
      cropClusterId: id,
      cases: [...cases].sort(),
      ocrItems: items.filter((i) => i.cropClusterId === id).map((i) => i.opaqueItemId),
      countsOnce: true,
    })),
    designClusters: Object.entries(designClusters).map(([id, cases]) => ({
      designClusterId: id,
      cases: [...cases].sort(),
      ocrItems: items.filter((i) => i.designClusterId === id).map((i) => i.opaqueItemId),
      countsOnce: true,
    })),
    countingRules: [
      "The duplicate C1 crop counts once: approved-wine-004 and la-fattoria-rotated are byte-identical pixels.",
      "A repeated Brand design counts once at design level.",
      "Results are reported separately by OCR item, distinct pixel set, crop cluster, historical case and Brand design.",
      "No averaging may conceal an item-level material regression.",
      "Any material regression within a repeated Brand design makes that design a regression; an improvement in the same design does not cancel it.",
    ],
  });

  writeJson(path.join(ROOT, "arm-a-carryforward.json"), {
    artifact: "arm-a-carryforward",
    experimentId: EXPERIMENT_ID,
    arm: "A",
    role: "frozen incumbent evidence",
    tesseractRerun: false,
    currentCodeTesseractExecutionAuthorized: false,
    sourceExperiment: "issue-149-brand-parseq-small-contrast (merged PR #214)",
    sourceCommit: "5161a58e02341753a31c2ab889b148b2cecedf81",
    engine: "tesseract.js 7.0.0 / tesseract.js-core 7.0.0",
    oem: 1,
    psm: 11,
    traineddataSha256: "5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747",
    traineddataPath: "src/pipeline/extractor/assets/eng.traineddata",
    dpiFlag: "none — the incumbent evaluation path sets none",
    executionPath: readJson(PR214_ARM_A).executionPath,
    carriedFiles: carried,
    carriedFileCount: carried.length,
    everyFileMatchesPr214: carried.every((c) => c.matches),
    verification: {
      method:
        "Each file's SHA-256 is recomputed from the merged PR #214 tree and compared with the value recorded in that PR's raw-output-manifest.json. The copy in arm-a-frozen/ is then re-hashed after writing.",
      recordedInPr214Manifest: PR214_RAW_MANIFEST,
      mismatchPolicy:
        "any mismatch halts before staging completes; nothing is written past the failure",
    },
    retainedValues: [
      "raw transcript",
      "word sequence",
      "word text and boxes",
      "original Tesseract confidence values",
      "warnings",
      "latency",
      "output fingerprint",
    ],
    perItemValuesSource: PR214_RESULTS,
    identifierNote:
      "The carried files keep PR #214's opaque identifiers, because renaming them would break the hashes that prove they are unaltered. The mapping to this experiment's fresh identifiers lives in evaluation/id-map.json and is never mounted into inference.",
    productionBehaviourChanged: false,
  });

  // Evaluation-only mapping. The inference phase never reads this file and no
  // container is ever given a path to it.
  writeJson(path.join(EVALUATION, "id-map.json"), {
    artifact: "id-map",
    experimentId: EXPERIMENT_ID,
    availableToInference: false,
    purpose:
      "Post-inference evaluation only: maps this experiment's opaque item id back to the historical case, the clusters, and PR #214's opaque id for the carried Arm A evidence.",
    map: items.map((i) => ({
      opaqueItemId: i.opaqueItemId,
      priorOpaqueItemId: i.priorOpaqueItemId,
      ocrItemId: i.ocrItemId,
      caseId: i.caseId,
      cropClusterId: i.cropClusterId,
      designClusterId: i.designClusterId,
    })),
  });

  format(
    [
      "population-freeze.json",
      "input-pixel-manifest.json",
      "independence-groups.json",
      "arm-a-carryforward.json",
    ].map((f) => path.join(ROOT, f)),
  );
  format([path.join(EVALUATION, "id-map.json")]);

  const listing = readdirSync(INPUTS).sort();
  console.log(
    JSON.stringify(
      {
        status: "STAGED",
        counts: {
          ...structure,
          distinctPixelSetsObserved: distinctPixelSets,
          armAFilesCarried: carried.length,
        },
        inferenceInputDirectoryListing: listing,
        opaqueIds: items.map((i) => ({ item: i.ocrItemId, opaque: i.opaqueItemId })),
        modelDownloaded: false,
        inferencePerformed: false,
        tesseractExecuted: false,
        brandTruthRead: false,
      },
      null,
      2,
    ),
  );
}

main();
