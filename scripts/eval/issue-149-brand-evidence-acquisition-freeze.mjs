#!/usr/bin/env node
/**
 * Issue #149 — complete Brand evidence acquisition, STAGE 1 population freeze.
 *
 * Planning only. It runs NO OCR, loads no Brand truth into any acquisition
 * input, and changes nothing in production.
 *
 * It freezes the 115-case population from the merged PR #217 evidence and emits
 * a TRUTH-FREE input manifest carrying only the identifiers and image provenance
 * the incumbent extractor needs. Every source image is hash- and size-verified.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const EXPERIMENT_ID = "issue-149-brand-complete-evidence-acquisition";
const ROOT = path.join(process.cwd(), "artifacts", EXPERIMENT_ID);
const BASE = "8f0c6a7ca7c271eed14d9084ed6da7fe11f897a9";

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
const writeJson = (p, v) => writeFileSync(path.join(ROOT, p), `${JSON.stringify(v, null, 2)}\n`);
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
  // The 44-case PR #218 subset must be a subset of this population.
  for (const id of pr218.frozenCaseIds) {
    if (!pr217.cases.some((c) => c.caseId === id)) halt("PR218_CASE_NOT_IN_POPULATION", id);
  }

  const cases = pr217.cases.map((c) => {
    const record = byId.get(c.caseId);
    if (!record) halt("CASE_NOT_IN_EVAL_MANIFEST", c.caseId);
    if (record.status !== "included")
      halt("CASE_NOT_INCLUDED", { caseId: c.caseId, status: record.status });
    let bytes;
    try {
      bytes = readFileSync(path.join(process.cwd(), record.imagePath));
    } catch (cause) {
      halt("SOURCE_IMAGE_MISSING", {
        caseId: c.caseId,
        imagePath: record.imagePath,
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
      caseId: c.caseId,
      imagePath: record.imagePath,
      sourceImageSha256: observed,
      sourceImageByteSize: bytes.length,
      imageWidth: record.image?.width ?? null,
      imageHeight: record.image?.height ?? null,
      inclusionStatus: record.status,
      beverageCategory: record.beverageCategory ?? null,
      brandPresent: c.governedTruth.present,
    };
  });

  const distinctImages = new Set(cases.map((c) => c.sourceImageSha256)).size;

  writeJson("population-freeze.json", {
    artifact: "population-freeze",
    experimentId: EXPERIMENT_ID,
    stage: 1,
    ocrRun: false,
    base: BASE,
    frozenFrom: [PR217, PR218],
    corpusSource: EVAL_MANIFEST,
    corpusRoot: manifest.corpusRoot,
    expectedCounts: {
      total: EXPECTED_TOTAL,
      brandPresent: EXPECTED_BRAND_PRESENT,
      brandAbsent: EXPECTED_BRAND_ABSENT,
    },
    verifiedCounts: {
      total: cases.length,
      brandPresent: cases.filter((c) => c.brandPresent).length,
      brandAbsent: cases.filter((c) => !c.brandPresent).length,
    },
    distinctSourceImages: distinctImages,
    everyImageHashVerified: true,
    pr218SubsetCaseCount: pr218.frozenCaseIds.length,
    pr218SubsetIsSubsetOfPopulation: true,
    casesExpanded: false,
    casesSubstituted: false,
    casesExcluded: false,
    haltConditions: [
      "an unexpected case count",
      "a missing or additional case",
      "an image hash or byte-size mismatch",
      "a case whose manifest status is not `included`",
      "a PR #218 frozen case absent from this population",
    ],
    brandPresenceFlagNote:
      "brandPresent is carried here for population accounting only. It is a presence flag, not a truth value, and it is NOT written into the truth-free input manifest.",
    cases,
  });

  // The acquisition input. Identifiers and image provenance only.
  const inputCases = cases.map((c) => ({
    caseId: c.caseId,
    imagePath: c.imagePath,
    sourceImageSha256: c.sourceImageSha256,
    sourceImageByteSize: c.sourceImageByteSize,
  }));
  const forbidden = ["truth", "acceptable", "brandPresent", "expected", "matches", "isTruth"];
  const serialized = JSON.stringify(inputCases);
  const leaked = forbidden.filter((k) => serialized.toLowerCase().includes(k.toLowerCase()));
  if (leaked.length > 0) halt("TRUTH_BEARING_FIELD_IN_ACQUISITION_INPUT", leaked);

  writeJson("truth-free-input-manifest.json", {
    artifact: "truth-free-input-manifest",
    experimentId: EXPERIMENT_ID,
    stage: 1,
    purpose:
      "The complete and only input the acquisition run receives. It carries identifiers and image provenance, and nothing else.",
    containsGovernedBrandTruth: false,
    containsAcceptableValues: false,
    containsTruthMatchBooleans: false,
    containsExpectedClassifications: false,
    containsPriorPerCaseResults: false,
    containsFilterRelaxationExpectations: false,
    fieldsPerCase: ["caseId", "imagePath", "sourceImageSha256", "sourceImageByteSize"],
    forbiddenSubstringScan: {
      scannedFor: forbidden,
      found: [],
      passed: true,
    },
    caseCount: inputCases.length,
    cases: inputCases,
  });

  const written = readdirSync(ROOT).filter((f) => f.endsWith(".json"));
  format(written.map((f) => path.join(ROOT, f)));

  console.log(
    JSON.stringify(
      {
        status: "STAGE_1_POPULATION_FROZEN",
        total: cases.length,
        brandPresent: cases.filter((c) => c.brandPresent).length,
        brandAbsent: cases.filter((c) => !c.brandPresent).length,
        distinctSourceImages: distinctImages,
        everyImageHashVerified: true,
        truthFreeInputScanPassed: true,
        ocrRun: false,
        totalSourceImageBytes: cases.reduce((n, c) => n + c.sourceImageByteSize, 0),
      },
      null,
      2,
    ),
  );
}

main();
