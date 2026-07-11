import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CORPUS_DIR,
  CORPUS_INDEX_PATH,
  SUPPLEMENTAL_INVENTORY_PATH,
  categorySentinelEntries,
  loadCorpusIndex,
  loadSupplementalInventory,
  wineMultiArtifactEntries,
} from "./corpus-index.load";
import { TRUTH_LABEL_PROHIBITION } from "./corpus-index.types";

/**
 * Governance tests for the supplemental challenge + sentinel corpus slice. They
 * prove the 19 ingested records are catalogued, identity-verified, kept as
 * unannotated inventory with no invented answers, and cleanly separated from the
 * single-image approved-wine-110 benchmark.
 */

const index = loadCorpusIndex();
const inventory = loadSupplementalInventory();
const multi = wineMultiArtifactEntries(index);
const sentinels = categorySentinelEntries(index);
const rawInventory = readFileSync(SUPPLEMENTAL_INVENTORY_PATH, "utf8");
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

describe("supplemental corpus — counts and ids", () => {
  it("has exactly 10 wine multi-artifact challenge entries with contiguous ids 01..10", () => {
    expect(multi.length).toBe(10);
    const ids = multi.map((e) => e.fixtureId).sort();
    expect(ids).toEqual(
      Array.from(
        { length: 10 },
        (_, i) => `wine-multi-artifact-${String(i + 1).padStart(2, "0")}`,
      ).sort(),
    );
  });

  it("has exactly 3 agave-spirit, 3 ale, and 3 single-malt-whiskey sentinels", () => {
    const byCat = (c: string) => sentinels.filter((e) => e.sentinelCategory === c).length;
    expect(sentinels.length).toBe(9);
    expect(byCat("agave_spirit")).toBe(3);
    expect(byCat("ale")).toBe(3);
    expect(byCat("single_malt_whiskey")).toBe(3);
    for (const cat of ["agave-spirit", "ale", "single-malt-whiskey"]) {
      const ids = sentinels
        .filter((e) => e.fixtureId.startsWith(`category-sentinel-${cat}-`))
        .map((e) => e.fixtureId)
        .sort();
      expect(ids).toEqual(
        [1, 2, 3].map((i) => `category-sentinel-${cat}-${String(i).padStart(2, "0")}`),
      );
    }
  });

  it("the inventory has 19 records covering both groups", () => {
    expect(inventory.records.length).toBe(19);
    expect(
      inventory.records.filter((r) => r.corpusGroup === "wine_multi_artifact_challenge").length,
    ).toBe(10);
    expect(inventory.records.filter((r) => r.corpusGroup === "category_sentinel").length).toBe(9);
  });
});

describe("supplemental corpus — on-disk identity", () => {
  it("all 19 images exist with an extension matching their signature", () => {
    for (const r of inventory.records) {
      const p = join(process.cwd(), r.committedPath);
      expect(existsSync(p)).toBe(true);
      const bytes = readFileSync(p);
      expect(signatureOf(bytes)).toBe(r.signature);
      const ext = r.committedPath.split(".").pop();
      expect(ext).toBe(r.signature === "png" ? "png" : "jpeg");
    }
  });

  it("image hash, byte size, width, and height match the inventory", () => {
    for (const r of inventory.records) {
      const bytes = readFileSync(join(process.cwd(), r.committedPath));
      expect(sha256(bytes)).toBe(r.sha256);
      expect(statSync(join(process.cwd(), r.committedPath)).size).toBe(r.byteSize);
      const dims = r.signature === "png" ? pngDims(bytes) : jpegDims(bytes);
      expect(dims.width).toBe(r.width);
      expect(dims.height).toBe(r.height);
    }
  });

  it("all 19 hashes are unique", () => {
    const hashes = inventory.records.map((r) => r.sha256);
    expect(new Set(hashes).size).toBe(19);
  });
});

describe("supplemental corpus — governance invariants", () => {
  const all = [...multi, ...sentinels];

  it("no supplemental record has expectations or is enabled for real OCR", () => {
    expect(all.length).toBe(19);
    for (const e of all) {
      expect(e.expectations).toBeNull();
      expect(e.enabledForRealOcr).toBe(false);
      expect(e.domainOnlySynthetic).toBe(false);
      expect(e.syntheticEvidence).toBeNull();
      expect(e.expectedSupportedObservations).toEqual([]);
      expect(e.truthLabelProhibition).toBe(TRUTH_LABEL_PROHIBITION);
    }
  });

  it("wine multi-artifact records are wine, unannotated, and split-unassigned", () => {
    for (const e of multi) {
      expect(e.beverageCategory).toBe("wine");
      expect(e.annotationStatus).toBe("unannotated");
      expect(e.splitStatus).toBe("unassigned");
      expect(e.measurementEligibility).toEqual(["challenge_inventory"]);
      expect(e.sentinelCategory).toBeUndefined();
    }
  });

  it("category sentinels are out of current production scope (non-wine, sentinel-only)", () => {
    for (const e of sentinels) {
      expect(["agave_spirit", "ale", "single_malt_whiskey"]).toContain(e.beverageCategory);
      expect(e.beverageCategory).toBe(e.sentinelCategory);
      expect(e.measurementEligibility).toEqual(["sentinel_inventory"]);
      expect(e.annotationStatus).toBe("unannotated");
      // Sentinels carry no wine-specific fields.
      expect(e.wineColor).toBeUndefined();
      expect(e.multiPanelStatus).toBeUndefined();
      expect(e.decimalCommaStatus).toBeUndefined();
    }
  });

  it("inventory carries no expected-answer / OCR / public-record keys", () => {
    for (const r of inventory.records) {
      for (const k of Object.keys(r)) {
        expect(k).not.toMatch(/expected|brand|alcohol|ocr|ttbId|publicRecordId|declared/i);
      }
    }
  });
});

describe("supplemental corpus — hygiene and scope", () => {
  it("no production module imports the supplemental inventory or corpus truth", () => {
    const SRC = join(process.cwd(), "src");
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
        if (d.isDirectory()) return d.name === "node_modules" ? [] : walk(join(dir, d.name));
        return /\.(ts|tsx)$/.test(d.name) ? [join(dir, d.name)] : [];
      });
    const production = walk(SRC).filter(
      (f) => !f.includes(".test.") && !f.includes(join("src", "fixtures") + "/"),
    );
    for (const f of production) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/supplemental-corpus-inventory|corpus-index/);
    }
  });

  it("no local absolute paths in the supplemental inventory or index", () => {
    expect(rawInventory).not.toMatch(/\/Users\/|\/home\//);
    expect(rawIndex).not.toMatch(/\/Users\/|\/home\//);
  });

  it("commits exactly one label image per supplemental directory, no junk", () => {
    const dirs = readdirSync(CORPUS_DIR, { withFileTypes: true })
      .filter(
        (d) =>
          d.isDirectory() &&
          (d.name.startsWith("wine-multi-artifact-") || d.name.startsWith("category-sentinel-")),
      )
      .map((d) => d.name);
    expect(dirs.length).toBe(19);
    for (const d of dirs) {
      const files = readdirSync(join(CORPUS_DIR, d));
      expect(files.length).toBe(1);
      expect(files[0]).toMatch(/^label\.(jpe?g|png)$/);
    }
  });

  it("no email/phone strings in the supplemental inventory text", () => {
    const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
    const phone = /(?<!\d)(?:\+?1[\s.-])?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/;
    expect(email.test(rawInventory)).toBe(false);
    expect(phone.test(rawInventory)).toBe(false);
  });
});

describe("supplemental corpus — single-label boundary preserved", () => {
  it("keeps the approved-wine benchmark at exactly 110 single-label candidates", () => {
    expect(index.entries.filter((e) => e.role === "candidate").length).toBe(110);
  });

  it("total corpus index count is prior 124 plus 19 supplemental", () => {
    expect(index.entries.length).toBe(124 + 19);
  });

  it("supplemental records are excluded from the single-image benchmark eligibility", () => {
    for (const e of [...multi, ...sentinels]) {
      expect(e.measurementEligibility).not.toContain("corpus_inventory");
      expect(e.measurementEligibility).not.toContain("future_ocr_evaluation_candidate");
    }
  });
});
