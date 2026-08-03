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
 * The acquisition runtime must know the forbidden evidence keys in order to scan
 * its own emitted evidence. A blanket "no bundle file may contain the string
 * `isTruth`" rule would therefore reject the scanner as its own first violation.
 *
 * ## Why the inventory is an asset, not source text
 *
 * Amendment 5 tried to solve that by inspecting the scanner's SOURCE TEXT: it
 * checked that every frozen token appeared somewhere in the module and used a
 * regex to notice some additions. That proves neither direction. A key left only
 * in a comment satisfied the presence test, and an addition outside the regex's
 * recognized prefixes — `matchesExpectedResult`, say — widened the scanner
 * undetected.
 *
 * The inventory is now a **dedicated canonical data asset**. Its bytes are
 * hashed, its parsed array must equal the authoritative array exactly including
 * order, and executable code carries no duplicate literal list. Equality of a
 * parsed array is decidable; "does this token appear in this source file" is not
 * the same question.
 */
import { createHash } from "node:crypto";

/** The one path inside the bundle permitted to carry the inventory. */
export const TRUTH_KEY_INVENTORY_ASSET_PATH = "runtime/truth-key-inventory.json";

export class TruthKeyInventoryError extends Error {
  constructor(
    readonly code: "INVENTORY_NOT_JSON" | "INVENTORY_NOT_A_STRING_ARRAY",
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = "TruthKeyInventoryError";
  }
}

/**
 * Parse the canonical inventory asset. The asset is a bare JSON array of key
 * names in authoritative order — nothing else, so there is no envelope to
 * disagree about.
 */
export function parseTruthKeyInventory(bytes: Uint8Array | Buffer | string): string[] {
  const text = typeof bytes === "string" ? bytes : Buffer.from(bytes).toString("utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new TruthKeyInventoryError(
      "INVENTORY_NOT_JSON",
      cause instanceof Error ? cause.message : String(cause),
    );
  }
  if (!Array.isArray(parsed) || !parsed.every((entry) => typeof entry === "string")) {
    throw new TruthKeyInventoryError(
      "INVENTORY_NOT_A_STRING_ARRAY",
      `expected an array of strings, received ${JSON.stringify(parsed)}`,
    );
  }
  return parsed as string[];
}

export type BundleFileKind = "executable" | "data" | "binary";

export interface BundleFile {
  path: string;
  kind: BundleFileKind;
  /**
   * The file's RAW bytes. Historical identifiers are searched in the bytes, so a
   * value encoded in a binary asset cannot slip past a text-only scan.
   */
  bytes: Buffer;
}

export interface BundleScanInput {
  files: BundleFile[];
  /**
   * The authoritative ordered inventory, read by the host from the committed
   * asset. Supplied rather than hard-coded so this module carries no duplicate
   * literal list.
   */
  authoritativeInventory: string[];
  /** Exact byte SHA-256 of the authoritative asset, as recorded in the manifest. */
  authoritativeInventorySha256: string;
  /**
   * Historical identifiers and fixture paths that must not appear anywhere.
   * Supplied by trusted host preparation, which legitimately holds them; the
   * isolated runtime never receives this inventory.
   */
  historicalCaseIds: string[];
  historicalFixturePaths: string[];
  /** Defaults to the frozen asset path. */
  inventoryAssetPath?: string;
}

export interface BundleScanViolation {
  path: string;
  rule:
    | "HISTORICAL_CASE_ID"
    | "HISTORICAL_FIXTURE_PATH"
    | "INVENTORY_ASSET_MISSING"
    | "INVENTORY_ASSET_DIGEST_MISMATCH"
    | "INVENTORY_ASSET_UNPARSEABLE"
    | "INVENTORY_ARRAY_NOT_EQUAL"
    | "TRUTH_KEY_OUTSIDE_INVENTORY_ASSET";
  detail: string;
}

export interface BundleScanReport {
  ok: boolean;
  haltCode: "BUNDLE_PROHIBITED_CONTENT" | null;
  violations: BundleScanViolation[];
  inventoryAssetPath: string;
  inventoryAssetSha256: string;
  /** Recorded so the report itself states that no Brand inventory was involved. */
  brandStringsScanned: false;
}

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/**
 * Scan a built bundle. Returns a report; the caller halts on
 * `BUNDLE_PROHIBITED_CONTENT`.
 *
 * Governed Brand values are deliberately not a parameter of this function, so
 * the scan cannot be reconfigured into comparing evidence against Brand truth.
 */
export function scanBundleForProhibitedContent(input: BundleScanInput): BundleScanReport {
  const inventoryAssetPath = input.inventoryAssetPath ?? TRUTH_KEY_INVENTORY_ASSET_PATH;
  const violations: BundleScanViolation[] = [];

  // ---- The inventory asset -------------------------------------------------
  const asset = input.files.find((file) => file.path === inventoryAssetPath);
  if (asset === undefined) {
    violations.push({
      path: inventoryAssetPath,
      rule: "INVENTORY_ASSET_MISSING",
      detail: "the bundle carries no truth-key inventory asset at the frozen path",
    });
  } else {
    const digest = sha256(asset.bytes);
    if (digest !== input.authoritativeInventorySha256) {
      violations.push({
        path: asset.path,
        rule: "INVENTORY_ASSET_DIGEST_MISMATCH",
        detail: `manifest records ${input.authoritativeInventorySha256} but the bundled asset hashes to ${digest}`,
      });
    }
    let bundled: string[] | null = null;
    try {
      bundled = parseTruthKeyInventory(asset.bytes);
    } catch (error) {
      violations.push({
        path: asset.path,
        rule: "INVENTORY_ASSET_UNPARSEABLE",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    if (bundled !== null) {
      // Exact array equality, order included. Not "contains", not "mentions".
      const equal =
        bundled.length === input.authoritativeInventory.length &&
        bundled.every((key, index) => key === input.authoritativeInventory[index]);
      if (!equal) {
        violations.push({
          path: asset.path,
          rule: "INVENTORY_ARRAY_NOT_EQUAL",
          detail: `bundled inventory ${JSON.stringify(bundled)} does not equal the authoritative inventory ${JSON.stringify(input.authoritativeInventory)}`,
        });
      }
    }
  }

  // ---- Every file ----------------------------------------------------------
  for (const file of input.files) {
    // Rule 1 — historical identity, in RAW BYTES, everywhere, no exemption.
    for (const caseId of input.historicalCaseIds) {
      if (caseId.length > 0 && file.bytes.includes(Buffer.from(caseId, "utf8"))) {
        violations.push({
          path: file.path,
          rule: "HISTORICAL_CASE_ID",
          detail: `raw bytes contain the historical case identifier ${caseId}`,
        });
      }
    }
    for (const fixturePath of input.historicalFixturePaths) {
      if (fixturePath.length > 0 && file.bytes.includes(Buffer.from(fixturePath, "utf8"))) {
        violations.push({
          path: file.path,
          rule: "HISTORICAL_FIXTURE_PATH",
          detail: `raw bytes contain the historical fixture path ${fixturePath}`,
        });
      }
    }

    // Rule 2 — forbidden evidence keys live in the inventory asset and nowhere
    // else. Binary assets are covered too: a key name is a key name.
    if (file.path === inventoryAssetPath) continue;
    const text = file.bytes.toString("utf8");
    for (const key of input.authoritativeInventory) {
      if (new RegExp(`\\b${key}\\b`).test(text)) {
        violations.push({
          path: file.path,
          rule: "TRUTH_KEY_OUTSIDE_INVENTORY_ASSET",
          detail: `names the forbidden evidence key ${key}; only ${inventoryAssetPath} may carry the inventory`,
        });
      }
    }
  }

  return {
    ok: violations.length === 0,
    haltCode: violations.length === 0 ? null : "BUNDLE_PROHIBITED_CONTENT",
    violations,
    inventoryAssetPath,
    inventoryAssetSha256: input.authoritativeInventorySha256,
    brandStringsScanned: false,
  };
}
