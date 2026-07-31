/**
 * Issue #149 — pre-isolation bundle content scan, frozen at Stage 1.
 *
 * Evaluation-only and non-OCR. This is the reference implementation of the scan
 * frozen in
 * `artifacts/issue-149-brand-complete-evidence-acquisition/acquisition-runtime-isolation-contract.json`.
 * It runs in **phase 1 trusted host preparation**, on the built runtime bundle,
 * before anything is mounted.
 *
 * It imports no production module, no governed truth and no fixture, and lives
 * outside `src/fixtures/**` for the same reason the canonical helper does.
 *
 * ## Why the scan is scoped rather than blanket
 *
 * The acquisition runtime must itself carry the prohibited-key inventory, because
 * scanning its own emitted evidence for those keys is one of its jobs. A blanket
 * "no bundle file may contain the string `isTruth`" rule would therefore reject
 * the truth-isolation scanner as its own first violation.
 *
 * The frozen scope, chosen and fixed here:
 *
 * 1. **Every** bundle file — executable or data — is scanned for historical case
 *    IDs and historical fixture paths. There is no legitimate reason for either
 *    to appear anywhere in the bundle.
 * 2. **Data and configuration assets** are scanned for prohibited truth-bearing
 *    JSON keys. A data asset has no reason to name them.
 * 3. **Executable code** may contain the prohibited-key inventory in exactly one
 *    place: the designated truth-isolation scanner module, whose path and
 *    SHA-256 are recorded in the bundle manifest. Anywhere else is a violation.
 * 4. Inside that module the inventory must be **exactly** the frozen set —
 *    additional keys or mutated spellings are violations, so the exemption cannot
 *    be widened by editing the scanner.
 * 5. Governed Brand strings are **never** an input to this scan. A legitimate
 *    transcript may contain the Brand text; that is evidence, not leakage.
 */
import { createHash } from "node:crypto";

/** The emitted-field ban, frozen in `truth-isolation-plan.json#emittedFieldBan`. */
export const PROHIBITED_TRUTH_KEYS = [
  "isTruth",
  "matchesTruth",
  "truthInRawOcr",
  "truthOnReconstructedLine",
  "truthFilterReasons",
  "expectedBrand",
  "acceptableValues",
] as const;

export type ProhibitedTruthKey = (typeof PROHIBITED_TRUTH_KEYS)[number];

export type BundleFileKind = "executable" | "data";

export interface BundleFile {
  path: string;
  kind: BundleFileKind;
  /** File contents as text. Binary assets are hashed, not scanned, upstream. */
  contents: string;
}

export interface BundleScanInput {
  files: BundleFile[];
  /**
   * The historical identifiers and fixture paths that must not appear anywhere.
   * Supplied by trusted host preparation, which legitimately holds them; the
   * isolated runtime never receives this inventory.
   */
  historicalCaseIds: string[];
  historicalFixturePaths: string[];
  /** The one executable module permitted to carry the prohibited-key inventory. */
  designatedScannerModulePath: string;
  /** Its SHA-256, as recorded in the bundle manifest. */
  designatedScannerSha256: string;
}

export interface BundleScanViolation {
  path: string;
  rule:
    | "HISTORICAL_CASE_ID"
    | "HISTORICAL_FIXTURE_PATH"
    | "TRUTH_KEY_IN_DATA_ASSET"
    | "TRUTH_KEY_OUTSIDE_DESIGNATED_SCANNER"
    | "SCANNER_INVENTORY_MUTATED"
    | "SCANNER_MODULE_MISSING"
    | "SCANNER_DIGEST_MISMATCH";
  detail: string;
}

export interface BundleScanReport {
  ok: boolean;
  haltCode: "BUNDLE_PROHIBITED_CONTENT" | null;
  violations: BundleScanViolation[];
  /** Recorded so the report itself proves which module held the exemption. */
  designatedScannerModulePath: string;
  designatedScannerSha256: string;
  brandStringsScanned: false;
}

const wordBoundary = (key: string): RegExp => new RegExp(`\\b${key}\\b`);

/**
 * A key inventory is "mutated" if the module names anything outside the frozen
 * set that looks like a truth key, or omits one of the frozen keys. Both matter:
 * an extra key widens the exemption, and a missing key means the runtime's own
 * scan is incomplete.
 */
function inventoryProblems(contents: string): string[] {
  const problems: string[] = [];
  for (const key of PROHIBITED_TRUTH_KEYS) {
    if (!wordBoundary(key).test(contents)) {
      problems.push(`the designated scanner does not carry the frozen key ${key}`);
    }
  }
  // Anything of the shape "truthSomething" or "expectedSomething" that is not in
  // the frozen list is an unapproved addition to the inventory.
  const frozen = new Set<string>(PROHIBITED_TRUTH_KEYS);
  for (const match of contents.matchAll(/\b(?:truth|expected|acceptable|isTruth)[A-Za-z]*\b/g)) {
    const token = match[0];
    if (!frozen.has(token) && token !== "truth" && token !== "expected") {
      problems.push(`the designated scanner names ${token}, which is not in the frozen inventory`);
    }
  }
  return problems;
}

/**
 * Scan a built bundle. Returns a report; the caller halts on
 * `BUNDLE_PROHIBITED_CONTENT`.
 *
 * Governed Brand strings are deliberately not a parameter of this function.
 */
export function scanBundleForProhibitedContent(input: BundleScanInput): BundleScanReport {
  const violations: BundleScanViolation[] = [];

  const scanner = input.files.find((file) => file.path === input.designatedScannerModulePath);
  if (scanner === undefined) {
    violations.push({
      path: input.designatedScannerModulePath,
      rule: "SCANNER_MODULE_MISSING",
      detail: "the bundle manifest names a designated scanner module that is not in the bundle",
    });
  } else {
    const digest = createHash("sha256").update(Buffer.from(scanner.contents, "utf8")).digest("hex");
    if (digest !== input.designatedScannerSha256) {
      violations.push({
        path: scanner.path,
        rule: "SCANNER_DIGEST_MISMATCH",
        detail: `bundle manifest records ${input.designatedScannerSha256} but the bundled module hashes to ${digest}`,
      });
    }
    for (const problem of inventoryProblems(scanner.contents)) {
      violations.push({
        path: scanner.path,
        rule: "SCANNER_INVENTORY_MUTATED",
        detail: problem,
      });
    }
  }

  for (const file of input.files) {
    // Rule 1 — historical identity, everywhere, no exemption.
    for (const caseId of input.historicalCaseIds) {
      if (caseId.length > 0 && file.contents.includes(caseId)) {
        violations.push({
          path: file.path,
          rule: "HISTORICAL_CASE_ID",
          detail: `contains the historical case identifier ${caseId}`,
        });
      }
    }
    for (const fixturePath of input.historicalFixturePaths) {
      if (fixturePath.length > 0 && file.contents.includes(fixturePath)) {
        violations.push({
          path: file.path,
          rule: "HISTORICAL_FIXTURE_PATH",
          detail: `contains the historical fixture path ${fixturePath}`,
        });
      }
    }

    // Rules 2 and 3 — the truth-key inventory.
    const isDesignatedScanner = file.path === input.designatedScannerModulePath;
    for (const key of PROHIBITED_TRUTH_KEYS) {
      if (!wordBoundary(key).test(file.contents)) continue;
      if (file.kind === "data") {
        violations.push({
          path: file.path,
          rule: "TRUTH_KEY_IN_DATA_ASSET",
          detail: `data asset names the prohibited truth-bearing key ${key}`,
        });
        continue;
      }
      if (!isDesignatedScanner) {
        violations.push({
          path: file.path,
          rule: "TRUTH_KEY_OUTSIDE_DESIGNATED_SCANNER",
          detail: `executable module names ${key}; only ${input.designatedScannerModulePath} may carry the inventory`,
        });
      }
    }
  }

  return {
    ok: violations.length === 0,
    haltCode: violations.length === 0 ? null : "BUNDLE_PROHIBITED_CONTENT",
    violations,
    designatedScannerModulePath: input.designatedScannerModulePath,
    designatedScannerSha256: input.designatedScannerSha256,
    brandStringsScanned: false,
  };
}
