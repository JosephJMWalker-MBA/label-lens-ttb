/**
 * Issue #149 — the pre-isolation bundle scan must not reject its own scanner.
 *
 * Non-OCR. Every bundle here is synthetic and built in this file. No real bundle
 * is constructed, no runtime is built, and no acquisition runs.
 */
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  PROHIBITED_TRUTH_KEYS,
  type BundleFile,
  scanBundleForProhibitedContent,
} from "../../../scripts/eval/lib/issue-149-bundle-scan";

const SCANNER_PATH = "dist/acquisition/truth-isolation-scanner.js";

const sha = (contents: string) =>
  createHash("sha256").update(Buffer.from(contents, "utf8")).digest("hex");

/** A faithful scanner module: it carries exactly the frozen inventory. */
const SCANNER_SOURCE = `
export const PROHIBITED_TRUTH_KEYS = ${JSON.stringify([...PROHIBITED_TRUTH_KEYS])};
export function scanEmittedEvidence(record) {
  return PROHIBITED_TRUTH_KEYS.filter((key) => Object.hasOwn(record, key));
}
`;

const ORDINARY_MODULE = `
export function persistCandidate(record) {
  return JSON.stringify(record);
}
`;

function bundle(files: BundleFile[], scannerSource = SCANNER_SOURCE) {
  return scanBundleForProhibitedContent({
    files: [{ path: SCANNER_PATH, kind: "executable", contents: scannerSource }, ...files],
    historicalCaseIds: ["wine-042-charlotte", "wine-113-brookmere"],
    historicalFixturePaths: ["src/fixtures/eval/images/wine-042-charlotte.jpg"],
    designatedScannerModulePath: SCANNER_PATH,
    designatedScannerSha256: sha(scannerSource),
  });
}

describe("Issue #149 bundle content scan", () => {
  it("passes a clean bundle whose scanner carries the exact frozen inventory", () => {
    // The whole point: a blanket string ban would fail here, on the scanner.
    const report = bundle([
      { path: "dist/acquisition/run.js", kind: "executable", contents: ORDINARY_MODULE },
      {
        path: "dist/acquisition/config.json",
        kind: "data",
        contents: JSON.stringify({ pageSegMode: 11, oem: 1 }),
      },
    ]);
    expect(report.violations).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.haltCode).toBeNull();
  });

  it("fails a truth-bearing data asset", () => {
    const report = bundle([
      {
        path: "dist/acquisition/seed.json",
        kind: "data",
        contents: JSON.stringify({ expectedBrand: "RED BRICK WINERY" }),
      },
    ]);
    expect(report.ok).toBe(false);
    expect(report.haltCode).toBe("BUNDLE_PROHIBITED_CONTENT");
    expect(report.violations.map((v) => v.rule)).toContain("TRUTH_KEY_IN_DATA_ASSET");
  });

  it("fails a historical identifier in executable code", () => {
    const report = bundle([
      {
        path: "dist/acquisition/run.js",
        kind: "executable",
        contents: 'const known = "wine-042-charlotte";',
      },
    ]);
    expect(report.ok).toBe(false);
    expect(report.violations.map((v) => v.rule)).toContain("HISTORICAL_CASE_ID");
  });

  it("fails a historical fixture path anywhere in the bundle", () => {
    for (const kind of ["executable", "data"] as const) {
      const report = bundle([
        {
          path: `dist/acquisition/x.${kind === "data" ? "json" : "js"}`,
          kind,
          contents: 'load("src/fixtures/eval/images/wine-042-charlotte.jpg")',
        },
      ]);
      expect(report.violations.map((v) => v.rule)).toContain("HISTORICAL_FIXTURE_PATH");
    }
  });

  it("fails the same inventory when it appears in another executable module", () => {
    const report = bundle([
      {
        path: "dist/acquisition/helpers.js",
        kind: "executable",
        contents: 'const keys = ["isTruth", "expectedBrand"];',
      },
    ]);
    expect(report.ok).toBe(false);
    const offence = report.violations.find(
      (v) => v.rule === "TRUTH_KEY_OUTSIDE_DESIGNATED_SCANNER",
    );
    expect(offence?.path).toBe("dist/acquisition/helpers.js");
  });

  it("fails a scanner whose inventory has been widened", () => {
    const widened = `${SCANNER_SOURCE}\nconst extra = ["truthSelectedValue"];\n`;
    const report = bundle([], widened);
    expect(report.ok).toBe(false);
    expect(report.violations.map((v) => v.rule)).toContain("SCANNER_INVENTORY_MUTATED");
  });

  it("fails a scanner that has quietly dropped a frozen key", () => {
    const narrowed = `
export const PROHIBITED_TRUTH_KEYS = ${JSON.stringify(
      [...PROHIBITED_TRUTH_KEYS].filter((key) => key !== "acceptableValues"),
    )};
`;
    const report = bundle([], narrowed);
    expect(report.ok).toBe(false);
    expect(
      report.violations.some(
        (v) => v.rule === "SCANNER_INVENTORY_MUTATED" && v.detail.includes("acceptableValues"),
      ),
    ).toBe(true);
  });

  it("fails when the scanner's bundled bytes do not match the manifest digest", () => {
    const report = scanBundleForProhibitedContent({
      files: [{ path: SCANNER_PATH, kind: "executable", contents: SCANNER_SOURCE }],
      historicalCaseIds: [],
      historicalFixturePaths: [],
      designatedScannerModulePath: SCANNER_PATH,
      designatedScannerSha256: "0".repeat(64),
    });
    expect(report.violations.map((v) => v.rule)).toContain("SCANNER_DIGEST_MISMATCH");
  });

  it("fails when the designated scanner is absent from the bundle", () => {
    const report = scanBundleForProhibitedContent({
      files: [{ path: "dist/acquisition/run.js", kind: "executable", contents: ORDINARY_MODULE }],
      historicalCaseIds: [],
      historicalFixturePaths: [],
      designatedScannerModulePath: SCANNER_PATH,
      designatedScannerSha256: sha(SCANNER_SOURCE),
    });
    expect(report.violations.map((v) => v.rule)).toContain("SCANNER_MODULE_MISSING");
  });

  it("never scans for legitimate Brand strings", () => {
    // A bundled sample transcript may contain Brand text. That is evidence, not
    // leakage, and the scan has no Brand inventory to compare against.
    const report = bundle([
      {
        path: "dist/acquisition/sample-transcript.json",
        kind: "data",
        contents: JSON.stringify({ rawText: "RED BRICK WINERY", cleanedValue: "RED BRICK WINERY" }),
      },
    ]);
    expect(report.violations).toEqual([]);
    expect(report.brandStringsScanned).toBe(false);
    // The scan input has no parameter through which a Brand inventory could be
    // supplied, so this cannot regress by configuration.
    expect(Object.keys(report)).not.toContain("brandStrings");
  });
});
