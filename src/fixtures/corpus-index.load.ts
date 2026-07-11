import { readFileSync } from "node:fs";
import { join } from "node:path";

import { validateFixtureCorpusIndex } from "./corpus-index.schema";
import type { CorpusEntry, FixtureCorpusIndex } from "./corpus-index.types";

/**
 * Test/evaluation-only loader for the fixture corpus index.
 *
 * This module reads from disk (`node:fs`) and is imported exclusively by test
 * and evaluation code. It must never be reachable from production extraction or
 * service modules — the truth-boundary tests enforce that.
 */

export const CORPUS_DIR = join(process.cwd(), "tests/fixtures/precheck");
export const CORPUS_INDEX_PATH = join(CORPUS_DIR, "corpus-index.json");
export const APPROVED_WINE_INVENTORY_PATH = join(CORPUS_DIR, "approved-wine-110-inventory.json");

export function loadCorpusIndex(): FixtureCorpusIndex {
  const raw = readFileSync(CORPUS_INDEX_PATH, "utf8");
  const result = validateFixtureCorpusIndex(JSON.parse(raw));
  if (!result.ok) throw new Error(`corpus index invalid: ${JSON.stringify(result.error)}`);
  return result.value;
}

export function realOcrEntries(index: FixtureCorpusIndex): CorpusEntry[] {
  return index.entries.filter((e) => e.enabledForRealOcr);
}

export function syntheticEntries(index: FixtureCorpusIndex): CorpusEntry[] {
  return index.entries.filter((e) => e.domainOnlySynthetic);
}

export function candidateEntries(index: FixtureCorpusIndex): CorpusEntry[] {
  return index.entries.filter((e) => e.role === "candidate");
}

/** One record in the approved-wine inventory (identity + provenance only). */
export interface ApprovedWineInventoryRecord {
  fixtureId: string;
  originalDownloadsFilename: string;
  committedPath: string;
  color: "red" | "white";
  sourceRepresentation: "screenshot";
  signature: "png" | "jpeg";
  mediaType: "image/png" | "image/jpeg";
  sha256: string;
  byteSize: number;
  width: number;
  height: number;
  enabledForRealOcr: boolean;
  annotationStatus: "unannotated" | "annotated";
  splitStatus: string;
  multiPanelStatus: string;
  decimalCommaStatus: string;
}

export interface ApprovedWineInventory {
  schemaId: "approved-wine-inventory";
  schemaVersion: "approved-wine-inventory.v1";
  acquisitionDate: string;
  description: string;
  records: ApprovedWineInventoryRecord[];
}

export function loadApprovedWineInventory(): ApprovedWineInventory {
  return JSON.parse(readFileSync(APPROVED_WINE_INVENTORY_PATH, "utf8")) as ApprovedWineInventory;
}
