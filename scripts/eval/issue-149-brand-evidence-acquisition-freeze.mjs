#!/usr/bin/env node
/**
 * Issue #149 — complete Brand evidence acquisition, STAGE 1 population freeze.
 *
 * Planning only. It runs NO OCR and changes nothing in production.
 *
 * This script is the TRUSTED STAGING STEP. It necessarily knows which historical
 * image belongs to which opaque identifier, because it is what copies them. It
 * runs before, and outside, the acquisition process.
 *
 * It emits three separated things:
 *
 *   1. a TRUTH-FREE input manifest naming only opaque item IDs and generic
 *      staged filenames — no historical case ID, no fixture path;
 *   2. staged images under generic `item-NNNN.png` names in an untracked
 *      directory, which is the only thing the acquisition process ever sees;
 *   3. a POST-FREEZE id map, written outside every acquisition mount and outside
 *      every raw evidence directory, which the acquisition process must never
 *      import, read, resolve or receive.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const EXPERIMENT_ID = "issue-149-brand-complete-evidence-acquisition";
const ROOT = path.join(process.cwd(), "artifacts", EXPERIMENT_ID);
/** Post-freeze area. Deliberately a sibling of the contracts, never under raw/. */
const POST_FREEZE = path.join(ROOT, "post-freeze");
/**
 * The staged acquisition inputs. Untracked (.local is gitignored) so 115 image
 * copies never enter Git, and mounted read-only as the ONLY input the
 * acquisition process receives.
 */
const STAGED = path.join(process.cwd(), ".local/issue-149-acquisition-inputs");

const BASE = "546c3f279ce431a1fd8c0203df7a83553ea866ef";
const PR220_MERGE = "546c3f279ce431a1fd8c0203df7a83553ea866ef";
const FIELD_SELECTION_SHA256 = "8e05462a86449c5e7cd91993e213ed0447a2389aae6bd3216cefd1b4e895e79c";

const PR217 =
  "artifacts/issue-149-brand-current-baseline-failure-decomposition/per-case-attribution.json";
const PR218 =
  "artifacts/issue-149-brand-candidate-construction-filter-decomposition/population-freeze.json";
const EVAL_MANIFEST = "src/fixtures/eval/eval-manifest.json";

const EXPECTED_TOTAL = 115;
const EXPECTED_BRAND_PRESENT = 105;
const EXPECTED_BRAND_ABSENT = 10;

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const readJson = (p) => JSON.parse(readFileSync(path.join(process.cwd(), p), "utf8"));
const writeJson = (p, v) => writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);
const format = (files) =>
  execFileSync("npx", ["prettier", "--write", "--log-level", "warn", ...files], {
    stdio: "inherit",
  });

function halt(reason, detail) {
  console.error(JSON.stringify({ status: "HALTED", reason, detail, ocrRun: false }, null, 2));
  process.exit(1);
}

function main() {
  mkdirSync(ROOT, { recursive: true });
  mkdirSync(POST_FREEZE, { recursive: true });

  const pr217 = readJson(PR217);
  const pr218 = readJson(PR218);
  const manifest = readJson(EVAL_MANIFEST);
  const byId = new Map(manifest.records.map((r) => [r.caseId, r]));

  if (pr217.cases.length !== EXPECTED_TOTAL) {
    halt("POPULATION_DISCREPANCY", { expected: EXPECTED_TOTAL, observed: pr217.cases.length });
  }
  const present = pr217.cases.filter((c) => c.governedTruth.present);
  const absent = pr217.cases.filter((c) => !c.governedTruth.present);
  if (present.length !== EXPECTED_BRAND_PRESENT || absent.length !== EXPECTED_BRAND_ABSENT) {
    halt("PRESENCE_SPLIT_DISCREPANCY", {
      expectedPresent: EXPECTED_BRAND_PRESENT,
      observedPresent: present.length,
      expectedAbsent: EXPECTED_BRAND_ABSENT,
      observedAbsent: absent.length,
    });
  }
  for (const id of pr218.frozenCaseIds) {
    if (!pr217.cases.some((c) => c.caseId === id)) halt("PR218_CASE_NOT_IN_POPULATION", id);
  }

  // Verify every image, then order by image digest so the opaque sequence is
  // deterministic and carries no ordering signal from the historical names.
  const verified = pr217.cases.map((c) => {
    const record = byId.get(c.caseId);
    if (!record) halt("CASE_NOT_IN_EVAL_MANIFEST", c.caseId);
    if (record.status !== "included") {
      halt("CASE_NOT_INCLUDED", { caseId: c.caseId, status: record.status });
    }
    let bytes;
    try {
      bytes = readFileSync(path.join(process.cwd(), record.imagePath));
    } catch (cause) {
      halt("SOURCE_IMAGE_MISSING", {
        caseId: c.caseId,
        detail: cause instanceof Error ? cause.message : String(cause),
      });
    }
    const observed = sha256(bytes);
    if (observed !== record.expectedSha256) {
      halt("SOURCE_IMAGE_SHA256_MISMATCH", {
        caseId: c.caseId,
        expected: record.expectedSha256,
        observed,
      });
    }
    return {
      historicalCaseId: c.caseId,
      historicalImagePath: record.imagePath,
      sourceImageSha256: observed,
      sourceImageByteSize: bytes.length,
      extension: path.extname(record.imagePath).toLowerCase(),
      brandPresent: c.governedTruth.present,
    };
  });

  verified.sort((a, b) => a.sourceImageSha256.localeCompare(b.sourceImageSha256));
  const assigned = verified.map((entry, index) => ({
    ...entry,
    opaqueItemId: `item-${String(index + 1).padStart(4, "0")}`,
  }));
  if (new Set(assigned.map((e) => e.opaqueItemId)).size !== assigned.length) {
    halt("OPAQUE_ID_COLLISION", "opaque identifiers are not unique");
  }

  // ---- stage the images under generic names, untracked ----
  rmSync(STAGED, { recursive: true, force: true });
  mkdirSync(STAGED, { recursive: true });
  for (const entry of assigned) {
    const stagedName = `${entry.opaqueItemId}${entry.extension}`;
    const destination = path.join(STAGED, stagedName);
    copyFileSync(path.join(process.cwd(), entry.historicalImagePath), destination);
    const staged = readFileSync(destination);
    if (sha256(staged) !== entry.sourceImageSha256) {
      halt("STAGED_COPY_NOT_BYTE_IDENTICAL", stagedName);
    }
    entry.stagedImageFileName = stagedName;
  }

  // ---- the acquisition input: opaque identity and image provenance only ----
  const inputCases = assigned.map((e) => ({
    opaqueItemId: e.opaqueItemId,
    stagedImageFileName: e.stagedImageFileName,
    sourceImageSha256: e.sourceImageSha256,
    sourceImageByteSize: e.sourceImageByteSize,
  }));

  // Fail closed if any historical identifier or path survived into the input.
  const serialized = JSON.stringify(inputCases);
  const leaked = [];
  for (const e of assigned) {
    if (serialized.includes(e.historicalCaseId)) leaked.push(e.historicalCaseId);
    if (serialized.includes(e.historicalImagePath)) leaked.push(e.historicalImagePath);
  }
  for (const key of ["truth", "acceptable", "brandPresent", "expected", "caseId", "imagePath"]) {
    if (serialized.toLowerCase().includes(key.toLowerCase())) leaked.push(`key:${key}`);
  }
  if (leaked.length > 0) halt("HISTORICAL_IDENTITY_IN_ACQUISITION_INPUT", [...new Set(leaked)]);

  const stagedListing = readdirSync(STAGED).sort();
  for (const name of stagedListing) {
    for (const e of assigned) {
      if (name.includes(e.historicalCaseId)) halt("HISTORICAL_ID_IN_STAGED_FILENAME", name);
    }
    if (!/^item-\d{4}\.[a-z0-9]+$/.test(name)) halt("STAGED_FILENAME_NOT_OPAQUE", name);
  }

  writeJson(path.join(ROOT, "truth-free-input-manifest.json"), {
    artifact: "truth-free-input-manifest",
    experimentId: EXPERIMENT_ID,
    stage: 1,
    base: BASE,
    purpose:
      "The complete and only input the acquisition process receives. Opaque identity and image provenance, nothing else.",
    stagedImageDirectory: path.relative(process.cwd(), STAGED),
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
  writeJson(path.join(POST_FREEZE, "id-map.json"), {
    artifact: "post-freeze-id-map",
    experimentId: EXPERIMENT_ID,
    accessBoundary: {
      mountedIntoAcquisition: false,
      insideAcquisitionInputDirectory: false,
      insideRawEvidenceDirectory: false,
      readableOnlyAfter:
        "both the primary and repeat raw-evidence manifests are written, hashed and verified",
      importedByAcquisitionHarness: false,
    },
    location: path.relative(process.cwd(), path.join(POST_FREEZE, "id-map.json")),
    entryCount: assigned.length,
    map: assigned.map((e) => ({
      opaqueItemId: e.opaqueItemId,
      historicalCaseId: e.historicalCaseId,
      historicalImagePath: e.historicalImagePath,
      sourceImageSha256: e.sourceImageSha256,
      sourceImageByteSize: e.sourceImageByteSize,
    })),
  });

  writeJson(path.join(ROOT, "population-freeze.json"), {
    artifact: "population-freeze",
    experimentId: EXPERIMENT_ID,
    stage: 1,
    ocrRun: false,
    base: BASE,
    pr220MergeCommit: PR220_MERGE,
    fieldSelectionSha256: FIELD_SELECTION_SHA256,
    frozenFrom: [PR217, PR218],
    corpusSource: EVAL_MANIFEST,
    expectedCounts: {
      total: EXPECTED_TOTAL,
      brandPresent: EXPECTED_BRAND_PRESENT,
      brandAbsent: EXPECTED_BRAND_ABSENT,
    },
    verifiedCounts: {
      total: assigned.length,
      brandPresent: assigned.filter((e) => e.brandPresent).length,
      brandAbsent: assigned.filter((e) => !e.brandPresent).length,
    },
    distinctSourceImages: new Set(assigned.map((e) => e.sourceImageSha256)).size,
    everyImageHashVerified: true,
    totalSourceImageBytes: assigned.reduce((n, e) => n + e.sourceImageByteSize, 0),
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

  format([
    path.join(ROOT, "truth-free-input-manifest.json"),
    path.join(ROOT, "population-freeze.json"),
    path.join(POST_FREEZE, "id-map.json"),
  ]);

  console.log(
    JSON.stringify(
      {
        status: "STAGE_1_POPULATION_FROZEN",
        total: assigned.length,
        brandPresent: assigned.filter((e) => e.brandPresent).length,
        brandAbsent: assigned.filter((e) => !e.brandPresent).length,
        opaqueIdRange: `${assigned[0].opaqueItemId}..${assigned.at(-1).opaqueItemId}`,
        stagedImageDirectory: path.relative(process.cwd(), STAGED),
        stagedImageDirectoryTracked: false,
        stagedFilesVerified: stagedListing.length,
        historicalIdentityInAcquisitionInput: false,
        idMapLocation: path.relative(process.cwd(), path.join(POST_FREEZE, "id-map.json")),
        totalSourceImageBytes: assigned.reduce((n, e) => n + e.sourceImageByteSize, 0),
        ocrRun: false,
      },
      null,
      2,
    ),
  );
}

main();
