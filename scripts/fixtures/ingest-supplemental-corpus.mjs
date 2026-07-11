#!/usr/bin/env node
/**
 * Bounded, reproducible ingestion of the supplemental challenge and sentinel
 * corpus into the fixture corpus.
 *
 * Two disjoint groups, kept separate from the single-image approved-wine-110
 * benchmark:
 *   - wine multi-artifact challenge (10): one committed screenshot each that
 *     shows multiple visible label panels / divided package information. Still
 *     ONE committed source image — never stitched, split, cropped, or treated as
 *     multiple uploaded artifacts.
 *   - category sentinels (9): out-of-scope non-wine labels (agave spirit, ale,
 *     single-malt whiskey), inventory only, for future scope-boundary testing.
 *     Not evidence any of those categories is implemented.
 *
 * It preserves bytes exactly (no convert/resize/recompress), preflights all 19
 * before mutating anything, runs a bounded privacy scan over TEXT-BEARING
 * metadata only (no OCR), writes a dedicated inventory, and appends corpus-index
 * entries without disturbing existing entries. It never reads or invents
 * expected answers and never touches production extraction code.
 *
 * Usage:
 *   node scripts/fixtures/ingest-supplemental-corpus.mjs            # ingest
 *   node scripts/fixtures/ingest-supplemental-corpus.mjs --verify   # re-check
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DOWNLOADS = join(process.env.HOME, "Downloads");
const CORPUS_DIR = join(REPO, "tests/fixtures/precheck");
const INDEX_PATH = join(CORPUS_DIR, "corpus-index.json");
const INVENTORY_PATH = join(CORPUS_DIR, "supplemental-corpus-inventory.json");
const ACQUISITION_DATE = "2026-07-11";

const TRUTH_LABEL_PROHIBITION =
  "Truth labels and expectations in this entry are for evaluation and regression only. They MUST NOT be passed to the extractor or production service as inputs; expected declared values may reach downstream deterministic rules only through the existing declared-facts contract.";

const PROVENANCE =
  "Author-provided public-registry screenshot or downloaded display derivative of previously approved label artwork. The delivered PNG/JPEG format may differ from the original applicant-submitted format. Original external source bytes and public-record metadata were not retained in this ingestion step. Approval status is author-reported and has not been independently reverified by the ingestion script.";

// Ingestion groups: [source basename prefix, count, group, sentinelCategory|null, fixture prefix]
const GROUPS = [
  {
    prefix: "wine-multi-artifact",
    n: 10,
    group: "wine_multi_artifact_challenge",
    sentinel: null,
    dir: "wine-multi-artifact",
  },
  {
    prefix: "agave-spirit-label",
    n: 3,
    group: "category_sentinel",
    sentinel: "agave_spirit",
    dir: "category-sentinel-agave-spirit",
  },
  {
    prefix: "ale-label",
    n: 3,
    group: "category_sentinel",
    sentinel: "ale",
    dir: "category-sentinel-ale",
  },
  {
    prefix: "single-malt-whiskey-label",
    n: 3,
    group: "category_sentinel",
    sentinel: "single_malt_whiskey",
    dir: "category-sentinel-single-malt-whiskey",
  },
];

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(?<!\d)(?:\+?1[\s.-])?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/;

function sha256(b) {
  return createHash("sha256").update(b).digest("hex");
}
function signature(b) {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
    return "png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
  return "unknown";
}
function pngDims(b) {
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}
function jpegDims(b) {
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
/** Text-bearing metadata regions only (NOT compressed image data, NOT OCR). */
function metadataText(b, sig) {
  let out = "";
  if (sig === "png") {
    let o = 8;
    while (o + 8 <= b.length) {
      const len = b.readUInt32BE(o);
      const type = b.toString("latin1", o + 4, o + 8);
      if (["tEXt", "iTXt", "zTXt", "eXIf"].includes(type))
        out += " " + b.toString("latin1", o + 8, o + 8 + len);
      if (type === "IEND") break;
      o += 12 + len;
    }
  } else {
    let o = 2;
    while (o + 4 <= b.length) {
      if (b[o] !== 0xff) {
        o++;
        continue;
      }
      const m = b[o + 1];
      if (m === 0xd9 || m === 0xda) break; // EOI / start of compressed scan
      const len = b.readUInt16BE(o + 2);
      if ((m >= 0xe0 && m <= 0xef) || m === 0xfe)
        out += " " + b.toString("latin1", o + 4, o + 2 + len);
      o += 2 + len;
    }
  }
  return out.replace(/[^\x20-\x7e]+/g, " ");
}

function findSource(base) {
  const re = new RegExp(`^${base}\\.(jpeg|jpg|png)$`, "i");
  const m = readdirSync(DOWNLOADS).filter((f) => re.test(f));
  if (m.length === 0) throw new Error(`MISSING source ${base}.(jpeg|jpg|png)`);
  if (m.length > 1) throw new Error(`DUPLICATE source ${base}: ${m.join(", ")}`);
  return m[0];
}

/** Full preflight of all 19 before any repository mutation. */
function preflight() {
  const items = [];
  const seen = new Map();
  for (const g of GROUPS) {
    for (let i = 1; i <= g.n; i++) {
      const two = String(i).padStart(2, "0");
      const base = `${g.prefix}-${two}`;
      const original = findSource(base);
      const bytes = readFileSync(join(DOWNLOADS, original));
      if (bytes.length === 0) throw new Error(`EMPTY ${original}`);
      const sig = signature(bytes);
      if (sig === "unknown") throw new Error(`BAD SIGNATURE ${original}`);
      const ext = original.slice(original.lastIndexOf(".") + 1).toLowerCase();
      const sigExtOk =
        (sig === "png" && ext === "png") || (sig === "jpeg" && (ext === "jpeg" || ext === "jpg"));
      if (!sigExtOk) throw new Error(`EXT/SIG MISMATCH ${original} ext=${ext} sig=${sig}`);
      const dims = sig === "png" ? pngDims(bytes) : jpegDims(bytes);
      const hash = sha256(bytes);
      if (seen.has(hash)) throw new Error(`DUPLICATE HASH ${original} == ${seen.get(hash)}`);
      seen.set(hash, original);
      const meta = metadataText(bytes, sig);
      if (EMAIL.test(meta) || PHONE.test(meta)) {
        throw new Error(`PRIVACY: email/phone in metadata of ${original} — requires human review`);
      }
      const committedExt = sig === "png" ? "png" : "jpeg";
      const fixtureId = `${g.dir}-${two}`;
      items.push({
        g,
        i,
        two,
        base,
        original,
        bytes,
        sig,
        ext,
        committedExt,
        dims,
        hash,
        fixtureId,
      });
    }
  }
  if (items.length !== 19) throw new Error(`expected 19, preflighted ${items.length}`);
  return items;
}

function inventoryRecord(it) {
  return {
    fixtureId: it.fixtureId,
    originalDownloadsFilename: it.original,
    committedPath: `tests/fixtures/precheck/${it.fixtureId}/label.${it.committedExt}`,
    corpusGroup: it.g.group,
    sentinelCategory: it.g.sentinel,
    sourceRepresentation: "public_registry_screenshot_or_display_derivative",
    signature: it.sig,
    mediaType: it.sig === "png" ? "image/png" : "image/jpeg",
    sha256: it.hash,
    byteSize: it.bytes.length,
    width: it.dims.width,
    height: it.dims.height,
    acquisitionDate: ACQUISITION_DATE,
    annotationStatus: "unannotated",
    evaluationStatus: "inventory_only",
  };
}

function corpusEntry(it) {
  const isSentinel = it.g.group === "category_sentinel";
  const common = {
    fixtureId: it.fixtureId,
    displayName: isSentinel
      ? `Category sentinel — ${it.g.sentinel.replace(/_/g, " ")} ${it.two}`
      : `Wine multi-artifact challenge ${it.two}`,
    beverageCategory: isSentinel ? it.g.sentinel : "wine",
    sourceAuthority: "author-provided-local-acquisition",
    publicRecordId: null,
    role: isSentinel ? "category_sentinel" : "wine_multi_artifact_candidate",
    imageFilename: `label.${it.committedExt}`,
    manifestFilename: null,
    fixtureDir: it.fixtureId,
    privacyReviewStatus: "screenshot-metadata-screened-author-attested",
    availability: "available",
    unavailableReason: null,
    derivedFromFixtureId: null,
    testDimensions: isSentinel
      ? [`out-of-scope category sentinel inventory (${it.g.sentinel})`]
      : [
          "wine multi-artifact challenge inventory (multiple visible label panels in one screenshot)",
        ],
    challengeTags: [],
    expectedSupportedObservations: [],
    knownAmbiguity: null,
    unsupportedFieldsNote: isSentinel
      ? `Out-of-scope non-wine category sentinel (${it.g.sentinel}); NOT a wine record, NOT evidence the category is implemented, and never run through the domestic-wine rules. ${PROVENANCE}`
      : `One committed screenshot showing multiple visible label panels / divided package information; NOT part of the single-image approved-wine-110 benchmark and never split or stitched. No expected answers. ${PROVENANCE}`,
    enabledForRealOcr: false,
    domainOnlySynthetic: false,
    syntheticEvidence: null,
    expectations: null,
    truthLabelProhibition: TRUTH_LABEL_PROHIBITION,
    sourceStratum: "approved_artwork_screenshot",
    independence: "independent_real_label",
    measurementEligibility: [isSentinel ? "sentinel_inventory" : "challenge_inventory"],
    annotationStatus: "unannotated",
    splitStatus: "unassigned",
    acquisitionDate: ACQUISITION_DATE,
  };
  if (isSentinel) common.sentinelCategory = it.g.sentinel;
  return common;
}

const verifyOnly = process.argv.includes("--verify");
const items = preflight();

if (!verifyOnly) {
  // Transactional-ish: preflight already complete for all 19 above.
  for (const it of items) {
    const outDir = join(CORPUS_DIR, it.fixtureId);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `label.${it.committedExt}`), it.bytes);
  }

  writeFileSync(
    INVENTORY_PATH,
    JSON.stringify(
      {
        schemaId: "supplemental-corpus-inventory",
        schemaVersion: "supplemental-corpus-inventory.v1",
        acquisitionDate: ACQUISITION_DATE,
        description:
          "Identity and provenance inventory for the supplemental wine multi-artifact challenge (10) and out-of-scope category sentinel (9) corpus. No expected answers. Evaluation-only.",
        records: items.map(inventoryRecord),
      },
      null,
      2,
    ) + "\n",
  );

  const index = JSON.parse(readFileSync(INDEX_PATH, "utf8"));
  const supplementalRoles = new Set(["wine_multi_artifact_candidate", "category_sentinel"]);
  const kept = index.entries.filter((e) => !supplementalRoles.has(e.role));
  index.entries = [...kept, ...items.map(corpusEntry)];
  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + "\n");
}

// Report.
const byGroup = items.reduce((a, it) => {
  a[it.g.group] = (a[it.g.group] || 0) + 1;
  return a;
}, {});
const sizes = items.map((it) => it.bytes.length).sort((a, b) => a - b);
console.log(`preflight OK: ${items.length} files`);
console.log(`groups:`, byGroup);
console.log(
  `png: ${items.filter((it) => it.sig === "png").length}, jpeg: ${items.filter((it) => it.sig === "jpeg").length}`,
);
console.log(
  `total bytes: ${sizes.reduce((a, b) => a + b, 0)} (${(sizes.reduce((a, b) => a + b, 0) / 1048576).toFixed(2)} MiB)`,
);
console.log(
  `smallest: ${sizes[0]}, largest: ${sizes[sizes.length - 1]}, median: ${sizes[Math.floor(sizes.length / 2)]}`,
);
