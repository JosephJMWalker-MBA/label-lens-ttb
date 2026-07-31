/**
 * Issue #149 — the pre-isolation bundle scan proves an EXACT inventory.
 *
 * Non-OCR. Every bundle here is synthetic and built in this file. No real bundle
 * is constructed, no runtime is built, and no acquisition runs.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  TRUTH_KEY_INVENTORY_ASSET_PATH,
  TruthKeyInventoryError,
  type BundleFile,
  parseTruthKeyInventory,
  scanBundleForProhibitedContent,
} from "../../../scripts/eval/lib/issue-149-bundle-scan";

const ROOT = "artifacts/issue-149-brand-complete-evidence-acquisition";
const ASSET = path.join(ROOT, "runtime/truth-key-inventory.json");

const AUTHORITATIVE_BYTES = readFileSync(path.join(process.cwd(), ASSET));
const AUTHORITATIVE = parseTruthKeyInventory(AUTHORITATIVE_BYTES);
const AUTHORITATIVE_SHA = createHash("sha256").update(AUTHORITATIVE_BYTES).digest("hex");

const utf8 = (text: string) => Buffer.from(text, "utf8");

const ORDINARY_MODULE = utf8(`
export function persistCandidate(record) {
  return JSON.stringify(record);
}
`);

/**
 * The runtime scanner reads the inventory from the asset. It holds no literal
 * key list of its own, which is what makes the exactness check decidable.
 */
const SCANNER_MODULE = utf8(`
import { readFileSync } from "node:fs";
export function forbiddenKeys(assetPath) {
  return JSON.parse(readFileSync(assetPath, "utf8"));
}
export function scanEmitted(record, keys) {
  return keys.filter((key) => Object.hasOwn(record, key));
}
`);

function bundle(files: BundleFile[], assetBytes: Buffer = AUTHORITATIVE_BYTES) {
  return scanBundleForProhibitedContent({
    files: [
      { path: TRUTH_KEY_INVENTORY_ASSET_PATH, kind: "data", bytes: assetBytes },
      {
        path: "dist/acquisition/truth-isolation-scanner.js",
        kind: "executable",
        bytes: SCANNER_MODULE,
      },
      ...files,
    ],
    authoritativeInventory: AUTHORITATIVE,
    authoritativeInventorySha256:
      assetBytes === AUTHORITATIVE_BYTES
        ? AUTHORITATIVE_SHA
        : createHash("sha256").update(assetBytes).digest("hex"),
    historicalCaseIds: ["wine-042-charlotte", "wine-113-brookmere"],
    historicalFixturePaths: ["src/fixtures/eval/images/wine-042-charlotte.jpg"],
  });
}

const rules = (report: ReturnType<typeof bundle>) => report.violations.map((v) => v.rule);

describe("Issue #149 bundle content scan", () => {
  it("carries the ten authoritative keys in the committed asset", () => {
    expect(AUTHORITATIVE).toEqual([
      "isTruth",
      "matchesTruth",
      "truthInRawOcr",
      "truthOnReconstructedLine",
      "truthFilterReasons",
      "expectedBrand",
      "acceptableValues",
      "brandPresent",
      "historicalCaseId",
      "historicalImagePath",
    ]);
  });

  it("passes a clean bundle whose scanner reads the asset instead of embedding it", () => {
    // A blanket string ban would fail here on the scanner. It passes because the
    // scanner carries no literal inventory at all.
    const report = bundle([
      { path: "dist/acquisition/run.js", kind: "executable", bytes: ORDINARY_MODULE },
      {
        path: "dist/acquisition/config.json",
        kind: "data",
        bytes: utf8(JSON.stringify({ pageSegMode: 11, oem: 1 })),
      },
    ]);
    expect(report.violations).toEqual([]);
    expect(report.ok).toBe(true);
    expect(report.haltCode).toBeNull();
  });

  it("fails a WIDENED inventory", () => {
    const widened = utf8(`${JSON.stringify([...AUTHORITATIVE, "matchesExpectedResult"])}\n`);
    expect(rules(bundle([], widened))).toContain("INVENTORY_ARRAY_NOT_EQUAL");
  });

  it("fails an additional matches… or acceptable… key the old regex would have missed", () => {
    // Amendment 5's regex recognized `truth…`, `expected…`, `acceptable…` and
    // `isTruth`. `matchesExpectedResult` starts with none of those prefixes and
    // would have widened the scanner undetected. Array equality has no prefixes.
    for (const added of ["matchesExpectedResult", "acceptableBrandValues", "reviewerVerdict"]) {
      const widened = utf8(`${JSON.stringify([...AUTHORITATIVE, added])}\n`);
      expect(rules(bundle([], widened))).toContain("INVENTORY_ARRAY_NOT_EQUAL");
    }
  });

  it("fails a NARROWED inventory", () => {
    const narrowed = utf8(
      `${JSON.stringify(AUTHORITATIVE.filter((key) => key !== "acceptableValues"))}\n`,
    );
    expect(rules(bundle([], narrowed))).toContain("INVENTORY_ARRAY_NOT_EQUAL");
  });

  it("fails a REORDERED inventory, because order is part of the equality", () => {
    const reordered = utf8(`${JSON.stringify([...AUTHORITATIVE].reverse())}\n`);
    expect(rules(bundle([], reordered))).toContain("INVENTORY_ARRAY_NOT_EQUAL");
  });

  it("does not accept a required key that survives only in a comment", () => {
    // The Amendment 5 bypass: the presence test was satisfied by any occurrence
    // of the token, including one in a comment, while the operative list was
    // short. Now the operative list IS the asset, and a comment is not an array
    // element — so the narrowed asset still fails, and the module that mentions
    // the key in prose is itself a violation.
    const narrowed = utf8(
      `${JSON.stringify(AUTHORITATIVE.filter((key) => key !== "acceptableValues"))}\n`,
    );
    const report = bundle(
      [
        {
          path: "dist/acquisition/notes.js",
          kind: "executable",
          bytes: utf8("// acceptableValues is handled elsewhere\n"),
        },
      ],
      narrowed,
    );
    expect(rules(report)).toContain("INVENTORY_ARRAY_NOT_EQUAL");
    expect(rules(report)).toContain("TRUTH_KEY_OUTSIDE_INVENTORY_ASSET");
  });

  it("fails the inventory duplicated into another module or asset", () => {
    for (const kind of ["executable", "data"] as const) {
      const report = bundle([
        {
          path: `dist/acquisition/copy.${kind === "data" ? "json" : "js"}`,
          kind,
          bytes: AUTHORITATIVE_BYTES,
        },
      ]);
      expect(rules(report)).toContain("TRUTH_KEY_OUTSIDE_INVENTORY_ASSET");
    }
  });

  it("fails a truth-bearing data asset", () => {
    const report = bundle([
      {
        path: "dist/acquisition/seed.json",
        kind: "data",
        bytes: utf8(JSON.stringify({ expectedBrand: "RED BRICK WINERY" })),
      },
    ]);
    expect(report.ok).toBe(false);
    expect(report.haltCode).toBe("BUNDLE_PROHIBITED_CONTENT");
    expect(rules(report)).toContain("TRUTH_KEY_OUTSIDE_INVENTORY_ASSET");
  });

  it("fails a historical identifier in executable code", () => {
    const report = bundle([
      {
        path: "dist/acquisition/run.js",
        kind: "executable",
        bytes: utf8('const known = "wine-042-charlotte";'),
      },
    ]);
    expect(rules(report)).toContain("HISTORICAL_CASE_ID");
  });

  it("fails a historical identifier encoded in a BINARY asset", () => {
    // A text-only scan would miss this. The scan searches raw bytes.
    const binary = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      utf8("wine-113-brookmere"),
      Buffer.from([0x00, 0xff, 0x00, 0xff]),
    ]);
    const report = bundle([{ path: "dist/acquisition/model.bin", kind: "binary", bytes: binary }]);
    expect(rules(report)).toContain("HISTORICAL_CASE_ID");
  });

  it("fails a historical fixture path anywhere in the bundle", () => {
    for (const kind of ["executable", "data", "binary"] as const) {
      const report = bundle([
        {
          path: `dist/acquisition/x.${kind}`,
          kind,
          bytes: utf8('load("src/fixtures/eval/images/wine-042-charlotte.jpg")'),
        },
      ]);
      expect(rules(report)).toContain("HISTORICAL_FIXTURE_PATH");
    }
  });

  it("fails when the asset digest does not match the manifest", () => {
    const report = scanBundleForProhibitedContent({
      files: [{ path: TRUTH_KEY_INVENTORY_ASSET_PATH, kind: "data", bytes: AUTHORITATIVE_BYTES }],
      authoritativeInventory: AUTHORITATIVE,
      authoritativeInventorySha256: "0".repeat(64),
      historicalCaseIds: [],
      historicalFixturePaths: [],
    });
    expect(report.violations.map((v) => v.rule)).toContain("INVENTORY_ASSET_DIGEST_MISMATCH");
  });

  it("fails when the inventory asset is absent or unparseable", () => {
    const absent = scanBundleForProhibitedContent({
      files: [{ path: "dist/acquisition/run.js", kind: "executable", bytes: ORDINARY_MODULE }],
      authoritativeInventory: AUTHORITATIVE,
      authoritativeInventorySha256: AUTHORITATIVE_SHA,
      historicalCaseIds: [],
      historicalFixturePaths: [],
    });
    expect(absent.violations.map((v) => v.rule)).toContain("INVENTORY_ASSET_MISSING");

    expect(rules(bundle([], utf8("not json")))).toContain("INVENTORY_ASSET_UNPARSEABLE");
    expect(() => parseTruthKeyInventory('{"keys":[]}')).toThrow(TruthKeyInventoryError);
    expect(() => parseTruthKeyInventory("[1,2]")).toThrow(TruthKeyInventoryError);
  });

  it("never scans for legitimate Brand strings", () => {
    // A bundled sample transcript may contain Brand text. That is evidence, not
    // leakage, and the scan has no Brand inventory to compare against.
    const report = bundle([
      {
        path: "dist/acquisition/sample-transcript.json",
        kind: "data",
        bytes: utf8(
          JSON.stringify({ rawText: "RED BRICK WINERY", cleanedValue: "RED BRICK WINERY" }),
        ),
      },
    ]);
    expect(report.violations).toEqual([]);
    expect(report.brandStringsScanned).toBe(false);
    // There is no parameter through which a Brand inventory could be supplied,
    // so this cannot regress by configuration.
    expect(Object.keys(report)).not.toContain("brandStrings");
  });
});
