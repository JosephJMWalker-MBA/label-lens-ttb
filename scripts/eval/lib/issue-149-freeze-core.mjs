/**
 * Issue #149 — the Stage 1 trusted freeze/staging core.
 *
 * **Host-only. Never included in the runtime bundle and never present in Job B.**
 * This is trusted staging: it necessarily reads historical identity and the PR
 * #217 attribution artifact, and it is what copies images to opaque names. It
 * runs no OCR.
 *
 * The core takes its inputs EXPLICITLY rather than reading fixed paths, so the
 * real implementation — not a restatement of it — can be driven with mutated
 * governed-truth text and with virtual images that exist only in memory.
 * `loadSourceImage` is the ONLY channel through which image bytes enter: the
 * exact verified Buffer is what gets staged, and the core resolves no source path
 * against `process.cwd()`. An earlier revision verified through the loader and
 * then staged with a separate `copyFileSync` from the historical path, which
 * meant the injected loader was not actually the staging source. An earlier staging-independence test reimplemented the
 * ordering algorithm and could therefore have stayed green while the actual
 * script started depending on `acceptableValues`. That is the same structural
 * failure as a drift guard that restates the list it guards.
 *
 * It never calls `process.exit`. Failures throw `FreezeError`, so callers can
 * clean up and only the CLI boundary decides the exit code.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

export const EXPERIMENT_ID = "issue-149-brand-complete-evidence-acquisition";
export const BASE = "546c3f279ce431a1fd8c0203df7a83553ea866ef";
export const PR220_MERGE = "546c3f279ce431a1fd8c0203df7a83553ea866ef";
export const FIELD_SELECTION_SHA256 =
  "8e05462a86449c5e7cd91993e213ed0447a2389aae6bd3216cefd1b4e895e79c";

export const PR217_PATH =
  "artifacts/issue-149-brand-current-baseline-failure-decomposition/per-case-attribution.json";
export const PR218_PATH =
  "artifacts/issue-149-brand-candidate-construction-filter-decomposition/population-freeze.json";
export const EVAL_MANIFEST_PATH = "src/fixtures/eval/eval-manifest.json";

export const EXPECTED_TOTAL = 115;
export const EXPECTED_BRAND_PRESENT = 105;
export const EXPECTED_BRAND_ABSENT = 10;

/**
 * The canonical self-declared locations. These are what the artifacts SAY about
 * themselves, and they never vary with the output root — otherwise a temporary
 * run could not reproduce the committed bytes.
 */
export const DECLARED_STAGED_DIRECTORY = ".local/issue-149-acquisition-inputs";
export const DECLARED_ID_MAP_LOCATION = `artifacts/${EXPERIMENT_ID}/post-freeze/id-map.json`;

/** Staging-specific opacity keys. Not truth-bearing, but either defeats opacity. */
export const STAGING_PROHIBITED_INPUT_KEYS = ["caseId", "imagePath"];

/**
 * The ID-map access boundary, identical to `id-map-contract.json#accessBoundary`.
 *
 * Amendment 6 corrected the committed map but not this generator, which still
 * emitted `readableOnlyAfter`, `mountedIntoAcquisition` and
 * `importedByAcquisitionHarness`. Job A is preregistered to rerun the generator
 * and require bit-for-bit reproduction, so the two disagreeing meant Job A had to
 * either fail or overwrite the corrected map with stale metadata.
 */
export const ID_MAP_ACCESS_BOUNDARY = {
  supersededClaim: "readable only after both raw manifests are written",
  whyItWasFalse:
    "Trusted staging generates and verifies the map before isolated acquisition begins, and the map is committed on PR #219 where any checkout can read it. Unreadability was never the control.",
  trustedStagingMayReadGenerateAndVerify: true,
  insideStagedImageDirectory: false,
  insideRawEvidenceDirectory: false,
  mountedIntoIsolatedDiscovery: false,
  mountedIntoIsolatedExecution: false,
  importedByAcquisitionCode: false,
  mayNotBeUsedAgainstAcquiredEvidenceUntil:
    "both raw manifests are sealed AND the read-only identity-leak verification has run clean and is authorized",
  onlyActorAuthorizedToUseItForTruthBasedEvaluation: "actor 3, the post-freeze evaluation process",
  physicalInaccessibilityClaimed: false,
};

/**
 * A typed halt. The core NEVER calls `process.exit`: doing so from inside a `try`
 * terminates the process before `finally` can remove a temporary staging tree,
 * so cleanup on the failure path was not actually guaranteed.
 */
export class FreezeError extends Error {
  constructor(code, detail) {
    super(`${code}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
    this.name = "FreezeError";
    this.code = code;
    this.detail = detail;
    this.ocrRun = false;
  }
}

export const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const writeJson = (file, value) => writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);

const format = (files) =>
  execFileSync("npx", ["prettier", "--write", "--log-level", "warn", ...files], {
    stdio: "inherit",
  });

/**
 * Generate the three Stage 1 artifacts.
 *
 * @param {object} input
 * @param {object} input.pr217          PR #217 attribution data (truth-bearing).
 * @param {object} input.pr218          PR #218 population data.
 * @param {object} input.evalManifest   The evaluation manifest data.
 * @param {(imagePath: string) => Buffer} input.loadSourceImage
 * @param {string[]} input.forbiddenEvidenceKeys  The canonical inventory.
 * @param {object} input.out            Output destinations: root, postFreeze, staged.
 */
export function generateStageOneArtifacts({
  pr217,
  pr218,
  evalManifest,
  loadSourceImage,
  forbiddenEvidenceKeys,
  out,
}) {
  mkdirSync(out.root, { recursive: true });
  mkdirSync(out.postFreeze, { recursive: true });

  const byId = new Map(evalManifest.records.map((record) => [record.caseId, record]));

  if (pr217.cases.length !== EXPECTED_TOTAL) {
    throw new FreezeError("POPULATION_DISCREPANCY", {
      expected: EXPECTED_TOTAL,
      observed: pr217.cases.length,
    });
  }

  // The ONLY use of governed truth in staging: the preregistered 105/10
  // corpus-accounting assertion. Acceptable values and truth text are never read.
  const present = pr217.cases.filter((entry) => entry.governedTruth.present);
  const absent = pr217.cases.filter((entry) => !entry.governedTruth.present);
  if (present.length !== EXPECTED_BRAND_PRESENT || absent.length !== EXPECTED_BRAND_ABSENT) {
    throw new FreezeError("PRESENCE_SPLIT_DISCREPANCY", {
      expectedPresent: EXPECTED_BRAND_PRESENT,
      observedPresent: present.length,
      expectedAbsent: EXPECTED_BRAND_ABSENT,
      observedAbsent: absent.length,
    });
  }
  for (const id of pr218.frozenCaseIds) {
    if (!pr217.cases.some((entry) => entry.caseId === id)) {
      throw new FreezeError("PR218_CASE_NOT_IN_POPULATION", id);
    }
  }

  // Verify every image, then order by image digest so the opaque sequence is
  // deterministic and carries no ordering signal from the historical names.
  const verified = pr217.cases.map((entry) => {
    const record = byId.get(entry.caseId);
    if (!record) throw new FreezeError("CASE_NOT_IN_EVAL_MANIFEST", entry.caseId);
    if (record.status !== "included") {
      throw new FreezeError("CASE_NOT_INCLUDED", { caseId: entry.caseId, status: record.status });
    }
    let bytes;
    try {
      bytes = loadSourceImage(record.imagePath);
    } catch (cause) {
      throw new FreezeError("SOURCE_IMAGE_MISSING", {
        caseId: entry.caseId,
        detail: cause instanceof Error ? cause.message : String(cause),
      });
    }
    const observed = sha256(bytes);
    if (observed !== record.expectedSha256) {
      throw new FreezeError("SOURCE_IMAGE_SHA256_MISMATCH", {
        caseId: entry.caseId,
        expected: record.expectedSha256,
        observed,
      });
    }
    return {
      historicalCaseId: entry.caseId,
      historicalImagePath: record.imagePath,
      sourceImageSha256: observed,
      sourceImageByteSize: bytes.length,
      extension: path.extname(record.imagePath).toLowerCase(),
      brandPresent: entry.governedTruth.present,
      // The EXACT verified bytes, held transiently. These — not a second read of
      // the historical path — are what get written to the opaque staged file, so
      // there is one source-image byte channel rather than two. Never serialized
      // into any artifact.
      bytes,
    };
  });

  verified.sort((a, b) => a.sourceImageSha256.localeCompare(b.sourceImageSha256));
  const assigned = verified.map((entry, index) => ({
    ...entry,
    opaqueItemId: `item-${String(index + 1).padStart(4, "0")}`,
  }));
  if (new Set(assigned.map((entry) => entry.opaqueItemId)).size !== assigned.length) {
    throw new FreezeError("OPAQUE_ID_COLLISION", "opaque identifiers are not unique");
  }

  // ---- stage the images under generic names, untracked ----
  rmSync(out.staged, { recursive: true, force: true });
  mkdirSync(out.staged, { recursive: true });
  for (const entry of assigned) {
    const stagedName = `${entry.opaqueItemId}${entry.extension}`;
    const destination = path.join(out.staged, stagedName);
    // Write the same Buffer that was verified. The core resolves no source path
    // of its own: `loadSourceImage` is the only way bytes enter it.
    writeFileSync(destination, entry.bytes);
    const written = readFileSync(destination);
    if (!written.equals(entry.bytes) || sha256(written) !== entry.sourceImageSha256) {
      throw new FreezeError("STAGED_COPY_NOT_BYTE_IDENTICAL", stagedName);
    }
    entry.stagedImageFileName = stagedName;
    // Release the transient bytes as soon as they are on disk.
    delete entry.bytes;
  }

  // ---- the acquisition input: opaque identity and image provenance only ----
  const inputCases = assigned.map((entry) => ({
    opaqueItemId: entry.opaqueItemId,
    stagedImageFileName: entry.stagedImageFileName,
    sourceImageSha256: entry.sourceImageSha256,
    sourceImageByteSize: entry.sourceImageByteSize,
  }));

  // Fail closed if any historical identifier or path survived into the input.
  const serialized = JSON.stringify(inputCases);
  const leaked = [];
  for (const entry of assigned) {
    if (serialized.includes(entry.historicalCaseId)) leaked.push(entry.historicalCaseId);
    if (serialized.includes(entry.historicalImagePath)) leaked.push(entry.historicalImagePath);
  }
  for (const key of [...forbiddenEvidenceKeys, ...STAGING_PROHIBITED_INPUT_KEYS]) {
    if (serialized.toLowerCase().includes(key.toLowerCase())) leaked.push(`key:${key}`);
  }
  if (leaked.length > 0) {
    throw new FreezeError("HISTORICAL_IDENTITY_IN_ACQUISITION_INPUT", [...new Set(leaked)]);
  }

  const stagedListing = readdirSync(out.staged).sort();
  for (const name of stagedListing) {
    for (const entry of assigned) {
      if (name.includes(entry.historicalCaseId)) {
        throw new FreezeError("HISTORICAL_ID_IN_STAGED_FILENAME", name);
      }
    }
    if (!/^item-\d{4}\.[a-z0-9]+$/.test(name)) {
      throw new FreezeError("STAGED_FILENAME_NOT_OPAQUE", name);
    }
  }

  writeJson(path.join(out.root, "truth-free-input-manifest.json"), {
    artifact: "truth-free-input-manifest",
    experimentId: EXPERIMENT_ID,
    stage: 1,
    base: BASE,
    purpose:
      "The complete and only input the acquisition process receives. Opaque identity and image provenance, nothing else.",
    stagedImageDirectory: DECLARED_STAGED_DIRECTORY,
    stagedImageDirectoryTracked: false,
    stagedImageDirectoryNote:
      "Untracked so 115 image copies never enter Git. It is the only path mounted into the acquisition container, read-only.",
    containsHistoricalCaseIds: false,
    containsHistoricalFixturePaths: false,
    containsGovernedBrandTruth: false,
    containsAcceptableValues: false,
    containsPriorPerCaseClassifications: false,
    containsPr217OrPr218Records: false,
    fieldsPerCase: [
      "opaqueItemId",
      "stagedImageFileName",
      "sourceImageSha256",
      "sourceImageByteSize",
    ],
    opaqueIdScheme:
      "item-NNNN, 1-based and zero-padded to four digits, assigned in ascending order of source-image SHA-256 so the sequence is deterministic and carries no ordering signal from the historical names",
    leakScan: {
      historicalIdsFound: [],
      historicalPathsFound: [],
      prohibitedKeysFound: [],
      passed: true,
    },
    stagedFilenamePattern: "^item-\\d{4}\\.[a-z0-9]+$",
    stagedListing,
    caseCount: inputCases.length,
    cases: inputCases,
  });

  // ---- the post-freeze mapping, deliberately elsewhere ----
  writeJson(path.join(out.postFreeze, "id-map.json"), {
    artifact: "post-freeze-id-map",
    experimentId: EXPERIMENT_ID,
    accessBoundary: ID_MAP_ACCESS_BOUNDARY,
    location: DECLARED_ID_MAP_LOCATION,
    entryCount: assigned.length,
    amendedBy: "preregistration-amendment-9.md",
    map: assigned.map((entry) => ({
      opaqueItemId: entry.opaqueItemId,
      historicalCaseId: entry.historicalCaseId,
      historicalImagePath: entry.historicalImagePath,
      sourceImageSha256: entry.sourceImageSha256,
      sourceImageByteSize: entry.sourceImageByteSize,
    })),
  });

  writeJson(path.join(out.root, "population-freeze.json"), {
    artifact: "population-freeze",
    experimentId: EXPERIMENT_ID,
    stage: 1,
    ocrRun: false,
    base: BASE,
    pr220MergeCommit: PR220_MERGE,
    fieldSelectionSha256: FIELD_SELECTION_SHA256,
    frozenFrom: [PR217_PATH, PR218_PATH],
    corpusSource: EVAL_MANIFEST_PATH,
    expectedCounts: {
      total: EXPECTED_TOTAL,
      brandPresent: EXPECTED_BRAND_PRESENT,
      brandAbsent: EXPECTED_BRAND_ABSENT,
    },
    verifiedCounts: {
      total: assigned.length,
      brandPresent: assigned.filter((entry) => entry.brandPresent).length,
      brandAbsent: assigned.filter((entry) => !entry.brandPresent).length,
    },
    distinctSourceImages: new Set(assigned.map((entry) => entry.sourceImageSha256)).size,
    everyImageHashVerified: true,
    totalSourceImageBytes: assigned.reduce((sum, entry) => sum + entry.sourceImageByteSize, 0),
    pr218SubsetCaseCount: pr218.frozenCaseIds.length,
    pr218SubsetIsSubsetOfPopulation: true,
    casesExpanded: false,
    casesSubstituted: false,
    casesExcluded: false,
    historicalIdentityLocation: "post-freeze/id-map.json only",
    brandPresenceFlagNote:
      "brandPresent appears in this accounting artifact and in the post-freeze area only. It is NOT written into the acquisition input and NOT derivable from an opaque identifier.",
    haltConditions: [
      "an unexpected case count",
      "a missing or additional case",
      "an image hash or byte-size mismatch",
      "a case whose manifest status is not `included`",
      "a PR #218 frozen case absent from this population",
      "an opaque identifier collision",
      "a historical case ID, fixture path or prohibited key surviving into the acquisition input",
      "a staged filename that is not the opaque pattern",
    ],
  });

  const written = {
    truthFreeInputManifest: path.join(out.root, "truth-free-input-manifest.json"),
    populationFreeze: path.join(out.root, "population-freeze.json"),
    idMap: path.join(out.postFreeze, "id-map.json"),
  };
  format(Object.values(written));

  return {
    written,
    stagedListing,
    summary: {
      total: assigned.length,
      brandPresent: assigned.filter((entry) => entry.brandPresent).length,
      brandAbsent: assigned.filter((entry) => !entry.brandPresent).length,
      opaqueIdRange: `${assigned[0].opaqueItemId}..${assigned.at(-1).opaqueItemId}`,
      stagedFilesVerified: stagedListing.length,
      totalSourceImageBytes: assigned.reduce((sum, entry) => sum + entry.sourceImageByteSize, 0),
    },
  };
}

/**
 * Regenerate into a temporary root and compare EXACT BYTES against the expected
 * artifacts. Throws `FreezeError("STAGE_1_GENERATED_ARTIFACT_DRIFT")` on any
 * mismatch; the caller owns cleanup and the exit code.
 *
 * `expected` is a parameter so a test can point the real implementation at
 * deliberately mutated copies and observe a genuine failure.
 */
export function compareGeneratedArtifacts({ generated, expected }) {
  const compared = [
    [
      "truth-free-input-manifest.json",
      expected.truthFreeInputManifest,
      generated.truthFreeInputManifest,
    ],
    ["population-freeze.json", expected.populationFreeze, generated.populationFreeze],
    ["post-freeze/id-map.json", expected.idMap, generated.idMap],
  ];

  const drifted = [];
  for (const [name, expectedPath, generatedPath] of compared) {
    const expectedBytes = readFileSync(expectedPath);
    const generatedBytes = readFileSync(generatedPath);
    if (!expectedBytes.equals(generatedBytes)) {
      drifted.push({
        artifact: name,
        expectedSha256: sha256(expectedBytes),
        regeneratedSha256: sha256(generatedBytes),
        expectedBytes: expectedBytes.length,
        regeneratedBytes: generatedBytes.length,
      });
    }
  }

  if (drifted.length > 0) throw new FreezeError("STAGE_1_GENERATED_ARTIFACT_DRIFT", drifted);
  return compared.map(([name]) => name);
}
