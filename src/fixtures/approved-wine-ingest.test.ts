import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  APPROVED_WINE_INVENTORY_PATH,
  CORPUS_DIR,
  CORPUS_INDEX_PATH,
  candidateEntries,
  loadApprovedWineInventory,
  loadCorpusIndex,
} from "./corpus-index.load";
import { TRUTH_LABEL_PROHIBITION } from "./corpus-index.types";

/**
 * Governance tests for the approved-wine corpus-acquisition slice. They prove
 * the 110 ingested screenshots are catalogued, identity-verified, and kept as
 * unannotated inventory — with NO invented expected answers.
 */

const inventory = loadApprovedWineInventory();
const index = loadCorpusIndex();
const candidates = candidateEntries(index);
const rawInventory = readFileSync(APPROVED_WINE_INVENTORY_PATH, "utf8");
const rawIndex = readFileSync(CORPUS_INDEX_PATH, "utf8");

function sha256(b: Buffer): string {
  return createHash("sha256").update(b).digest("hex");
}
function signatureOf(b: Buffer): "png" | "jpeg" | "unknown" {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  return "unknown";
}
function pngDims(b: Buffer) {
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}
function jpegDims(b: Buffer) {
  let o = 2;
  while (o < b.length) {
    if (b[o] !== 0xff) {
      o++;
      continue;
    }
    const m = b[o + 1];
    const len = b.readUInt16BE(o + 2);
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) {
      return { height: b.readUInt16BE(o + 5), width: b.readUInt16BE(o + 7) };
    }
    o += 2 + len;
  }
  throw new Error("no JPEG SOF marker");
}

describe("approved-wine ingestion — inventory and index shape", () => {
  it("1. has exactly 110 approved-wine candidate entries and inventory records", () => {
    expect(candidates.length).toBe(110);
    expect(inventory.records.length).toBe(110);
  });

  it("2. fixture ids are contiguous approved-wine-001..110", () => {
    const ids = candidates.map((c) => c.fixtureId).sort();
    const expected = Array.from(
      { length: 110 },
      (_, i) => `approved-wine-${String(i + 1).padStart(3, "0")}`,
    ).sort();
    expect(ids).toEqual(expected);
    const invIds = inventory.records.map((r) => r.fixtureId).sort();
    expect(invIds).toEqual(expected);
  });

  it("3. classifies 55 red (001-055) and 55 white (056-110)", () => {
    const red = candidates.filter((c) => c.wineColor === "red");
    const white = candidates.filter((c) => c.wineColor === "white");
    expect(red.length).toBe(55);
    expect(white.length).toBe(55);
    for (const c of candidates) {
      const n = Number(c.fixtureId.slice(-3));
      expect(c.wineColor).toBe(n <= 55 ? "red" : "white");
    }
  });
});

describe("approved-wine ingestion — on-disk image identity", () => {
  it("4. every candidate image exists on disk", () => {
    for (const c of candidates) {
      expect(existsSync(join(CORPUS_DIR, c.fixtureDir!, c.imageFilename!))).toBe(true);
    }
  });

  it("5. every image is a valid PNG or JPEG by signature", () => {
    for (const r of inventory.records) {
      const bytes = readFileSync(join(process.cwd(), r.committedPath));
      expect(signatureOf(bytes)).toBe(r.signature);
      expect(["png", "jpeg"]).toContain(signatureOf(bytes));
    }
  });

  it("6. image hash, byte size, width, and height match the inventory", () => {
    for (const r of inventory.records) {
      const bytes = readFileSync(join(process.cwd(), r.committedPath));
      expect(sha256(bytes)).toBe(r.sha256);
      expect(statSync(join(process.cwd(), r.committedPath)).size).toBe(r.byteSize);
      const dims = r.signature === "png" ? pngDims(bytes) : jpegDims(bytes);
      expect(dims.width).toBe(r.width);
      expect(dims.height).toBe(r.height);
    }
  });

  it("7. no two independent entries share the same hash", () => {
    const hashes = inventory.records.map((r) => r.sha256);
    expect(new Set(hashes).size).toBe(hashes.length);
  });
});

describe("approved-wine ingestion — no invented answers, unannotated", () => {
  it("8. no expected brand/alcohol answer appears in ingestion metadata", () => {
    for (const c of candidates) {
      expect(c.expectations).toBeNull();
      expect(c.expectedSupportedObservations).toEqual([]);
    }
    // Inventory carries only identity/provenance keys — no expected-answer keys.
    for (const r of inventory.records) {
      const keys = Object.keys(r);
      for (const forbidden of [
        "expectedBrand",
        "expectedAlcohol",
        "brand",
        "alcohol",
        "expectations",
      ]) {
        expect(keys).not.toContain(forbidden);
      }
    }
  });

  it("9. all candidates are unannotated", () => {
    for (const c of candidates) expect(c.annotationStatus).toBe("unannotated");
    for (const r of inventory.records) expect(r.annotationStatus).toBe("unannotated");
  });

  it("10. all have split status unassigned", () => {
    for (const c of candidates) expect(c.splitStatus).toBe("unassigned");
    for (const r of inventory.records) expect(r.splitStatus).toBe("unassigned");
  });

  it("11. all are disabled from mandatory real-OCR CI", () => {
    for (const c of candidates) expect(c.enabledForRealOcr).toBe(false);
    for (const r of inventory.records) expect(r.enabledForRealOcr).toBe(false);
    // And their multi-panel / decimal-comma mapping is still unmapped.
    for (const c of candidates) {
      expect(c.multiPanelStatus).toBe("unmapped");
      expect(c.decimalCommaStatus).toBe("unmapped");
    }
  });

  it("carries the unaltered truth-label prohibition on every candidate", () => {
    for (const c of candidates) expect(c.truthLabelProhibition).toBe(TRUTH_LABEL_PROHIBITION);
  });

  it("records the original Downloads filename and screenshot representation", () => {
    for (const r of inventory.records) {
      expect(r.originalDownloadsFilename).toMatch(/^wine label 0*\d+\.(jpe?g|png)$/i);
      expect(r.sourceRepresentation).toBe("screenshot");
    }
  });
});

describe("approved-wine ingestion — hygiene and scope", () => {
  it("12. no production module references the approved-wine inventory", () => {
    const SRC = join(process.cwd(), "src");
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
        if (d.isDirectory()) return d.name === "node_modules" ? [] : walk(join(dir, d.name));
        return /\.(ts|tsx)$/.test(d.name) ? [join(dir, d.name)] : [];
      });
    const productionFiles = walk(SRC).filter(
      (f) => !f.includes(".test.") && !f.includes(join("src", "fixtures") + "/"),
    );
    for (const f of productionFiles) {
      const src = readFileSync(f, "utf8");
      expect(src, `${f} references the inventory`).not.toMatch(/approved-wine.*inventory/i);
    }
  });

  it("13. no local absolute paths appear in the inventory or index", () => {
    expect(rawInventory).not.toMatch(/\/Users\/|\/home\//);
    // The 110 approved-wine slice must not introduce absolute paths in the index.
    expect(rawIndex).not.toMatch(/\/Users\/|\/home\//);
  });

  it("14. no prohibited file types or temp files under approved-wine dirs", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
        d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)],
      );
    const files = readdirSync(CORPUS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith("approved-wine-"))
      .flatMap((d) => walk(join(CORPUS_DIR, d.name)));
    expect(files.length).toBe(110); // exactly one label image per directory
    for (const f of files) {
      expect(f).toMatch(/\/label\.(jpe?g|png)$/i);
      expect(f).not.toMatch(/\.(DS_Store|txt|ocr|csv|pdf|json|tmp|swp)$|~$/i);
    }
  });

  it("15. original M Cellars, synthetic, and unavailable entries remain unchanged", () => {
    const preserved = index.entries.filter((e) => e.role !== "candidate").map((e) => e.fixtureId);
    expect(preserved).toContain("m-cellars-24205001000905");
    expect(preserved).toContain("m-cellars-lowres-24205001000905");
    expect(preserved).toContain("rainbow-hills-venom-19206001000867");
    // The 14 curated entries are still present and all carry expectations (or a
    // documented unavailable/synthetic shape) — i.e. none was converted to a candidate.
    expect(preserved.length).toBe(14);
    const synthetic = index.entries.filter((e) => e.domainOnlySynthetic);
    expect(synthetic.length).toBe(11);
  });

  it("privacy: no email or formatted phone strings in inventory/index text", () => {
    const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
    const phone = /(?<!\d)(?:\+?1[\s.-])?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/;
    expect(email.test(rawInventory)).toBe(false);
    expect(phone.test(rawInventory)).toBe(false);
    expect(email.test(rawIndex)).toBe(false);
    expect(phone.test(rawIndex)).toBe(false);
  });
});
