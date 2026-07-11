#!/usr/bin/env node
/**
 * Bounded, reproducible ingestion of the author-provided approved-wine label
 * screenshots into the fixture corpus.
 *
 * This is a corpus-acquisition and provenance step only. It:
 *   - enumerates `wine label <n>.(jpeg|jpg|png)` for n = 1..110 in ~/Downloads
 *     (numeric suffix is NOT part of fixture identity: `wine label 7.jpeg`
 *      maps to `approved-wine-007`);
 *   - validates each file is a non-empty PNG/JPEG by signature and reads dims;
 *   - copies each byte-for-byte (no convert/resize/crop/recompress) to
 *     tests/fixtures/precheck/approved-wine-NNN/label.<ext>;
 *   - runs a bounded automated privacy metadata scan (embedded email/phone
 *     strings) — NOT OCR; pixel-level visual screening relies on author
 *     attestation and is flagged for second-pass review;
 *   - writes the machine-readable inventory (identity + provenance only, no
 *     expected answers, no local absolute paths);
 *   - appends 110 `candidate` entries to the versioned corpus index, preserving
 *     all existing entries.
 *
 * It never invents brand/alcohol answers, a TTB id, or a public-record claim.
 * Colors: 001–055 red, 056–110 white (author-provided classification).
 *
 * Usage:
 *   node scripts/fixtures/ingest-approved-wine.mjs            # ingest
 *   node scripts/fixtures/ingest-approved-wine.mjs --verify   # re-check only
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DOWNLOADS = join(process.env.HOME, "Downloads");
const CORPUS_DIR = join(REPO, "tests/fixtures/precheck");
const INDEX_PATH = join(CORPUS_DIR, "corpus-index.json");
const INVENTORY_PATH = join(CORPUS_DIR, "approved-wine-110-inventory.json");
const ACQUISITION_DATE = "2026-07-11";

const TRUTH_LABEL_PROHIBITION =
  "Truth labels and expectations in this entry are for evaluation and regression only. They MUST NOT be passed to the extractor or production service as inputs; expected declared values may reach downstream deterministic rules only through the existing declared-facts contract.";

const PROVENANCE =
  "Author-provided screenshot of previously approved wine-label artwork. Original external source bytes and public-record metadata were not retained in this ingestion step. Approval status is author-reported and has not been independently reverified by the ingestion script.";

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE = /(?:\+?1[\s.-])?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/;

function sha256(b) {
  return createHash("sha256").update(b).digest("hex");
}
function signature(b) {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
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

/** Locate the single source file for numeric suffix n (any accepted form). */
function sourceFor(n) {
  const files = readdirSync(DOWNLOADS);
  const re = new RegExp(`^wine label 0*${n}\\.(jpeg|jpg|png)$`);
  const matches = files.filter((f) => re.test(f));
  if (matches.length !== 1) {
    throw new Error(`expected exactly one source for ${n}, found ${matches.length}: ${matches}`);
  }
  return matches[0];
}

function build() {
  const inventory = [];
  const candidates = [];
  const quarantine = [];
  const seenHashes = new Map();

  for (let n = 1; n <= 110; n++) {
    const original = sourceFor(n);
    const bytes = readFileSync(join(DOWNLOADS, original));
    if (bytes.length === 0) throw new Error(`${original} is empty`);
    const sig = signature(bytes);
    if (sig === "unknown") throw new Error(`${original} is not a valid PNG/JPEG by signature`);
    const ext = sig === "png" ? "png" : "jpeg";
    const mediaType = sig === "png" ? "image/png" : "image/jpeg";
    const dims = sig === "png" ? pngDims(bytes) : jpegDims(bytes);
    const hash = sha256(bytes);

    // Bounded automated privacy metadata scan (NOT OCR): reject embedded
    // email/phone strings in the raw bytes. Record only the reason.
    const asText = bytes.toString("latin1");
    if (EMAIL.test(asText) || PHONE.test(asText)) {
      quarantine.push({ original, reason: "embedded email/phone-like string in image bytes" });
      continue;
    }
    if (seenHashes.has(hash)) {
      throw new Error(`duplicate hash: ${original} == ${seenHashes.get(hash)} (${hash})`);
    }
    seenHashes.set(hash, original);

    const id = `approved-wine-${String(n).padStart(3, "0")}`;
    const color = n <= 55 ? "red" : "white";
    const committed = `label.${ext}`;
    const relDir = `approved-wine-${String(n).padStart(3, "0")}`;

    // Copy byte-for-byte.
    const outDir = join(CORPUS_DIR, relDir);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, committed), bytes);

    inventory.push({
      fixtureId: id,
      originalDownloadsFilename: original,
      committedPath: `tests/fixtures/precheck/${relDir}/${committed}`,
      color,
      sourceRepresentation: "screenshot",
      signature: sig,
      mediaType,
      sha256: hash,
      byteSize: bytes.length,
      width: dims.width,
      height: dims.height,
      enabledForRealOcr: false,
      annotationStatus: "unannotated",
      splitStatus: "unassigned",
      multiPanelStatus: "unmapped",
      decimalCommaStatus: "unmapped",
    });

    candidates.push({
      fixtureId: id,
      displayName: `Approved wine label ${String(n).padStart(3, "0")} (${color})`,
      beverageCategory: "wine",
      sourceAuthority: "author-provided-local-acquisition",
      publicRecordId: null,
      role: "candidate",
      imageFilename: committed,
      manifestFilename: null,
      fixtureDir: relDir,
      privacyReviewStatus: "screenshot-metadata-screened-author-attested",
      availability: "available",
      unavailableReason: null,
      derivedFromFixtureId: null,
      testDimensions: ["corpus inventory of independent approved-label screenshots"],
      challengeTags: [],
      expectedSupportedObservations: [],
      knownAmbiguity: null,
      unsupportedFieldsNote:
        "No expected brand, alcohol, varietal, appellation, vintage, net-contents, or domestic/imported facts are recorded; this record is unannotated inventory. " +
        PROVENANCE,
      enabledForRealOcr: false,
      domainOnlySynthetic: false,
      syntheticEvidence: null,
      expectations: null,
      truthLabelProhibition: TRUTH_LABEL_PROHIBITION,
      wineColor: color,
      sourceStratum: "approved_artwork_screenshot",
      independence: "independent_real_label",
      measurementEligibility: [
        "corpus_inventory",
        "future_ocr_evaluation_candidate",
        "future_annotation_candidate",
      ],
      annotationStatus: "unannotated",
      splitStatus: "unassigned",
      multiPanelStatus: "unmapped",
      decimalCommaStatus: "unmapped",
      acquisitionDate: ACQUISITION_DATE,
    });
  }

  return { inventory, candidates, quarantine };
}

const verifyOnly = process.argv.includes("--verify");
const { inventory, candidates, quarantine } = build();

if (quarantine.length > 0) {
  console.error(`QUARANTINED ${quarantine.length}:`);
  for (const q of quarantine) console.error(`  ${q.original}: ${q.reason}`);
}
if (inventory.length !== 110) {
  console.error(`ACCEPTED ${inventory.length}/110 — stopping (not all accepted).`);
  process.exit(1);
}

if (!verifyOnly) {
  // Inventory file.
  writeFileSync(
    INVENTORY_PATH,
    JSON.stringify(
      {
        schemaId: "approved-wine-inventory",
        schemaVersion: "approved-wine-inventory.v1",
        acquisitionDate: ACQUISITION_DATE,
        description:
          "Identity and provenance inventory for 110 author-provided approved-wine label screenshots. No expected answers. Evaluation-only.",
        records: inventory,
      },
      null,
      2,
    ) + "\n",
  );

  // Merge candidate entries into the corpus index, preserving existing entries.
  const index = JSON.parse(readFileSync(INDEX_PATH, "utf8"));
  const existing = index.entries.filter((e) => !e.fixtureId.startsWith("approved-wine-"));
  index.entries = [...existing, ...candidates];
  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + "\n");
}

// Size stats.
const sizes = inventory.map((r) => r.byteSize).sort((a, b) => a - b);
const total = sizes.reduce((a, b) => a + b, 0);
const ws = inventory.map((r) => r.width);
const hs = inventory.map((r) => r.height);
console.log(`accepted: ${inventory.length}, quarantined: ${quarantine.length}`);
console.log(
  `red: ${inventory.filter((r) => r.color === "red").length}, white: ${inventory.filter((r) => r.color === "white").length}`,
);
console.log(
  `png: ${inventory.filter((r) => r.signature === "png").length}, jpeg: ${inventory.filter((r) => r.signature === "jpeg").length}`,
);
console.log(`total bytes: ${total} (${(total / 1048576).toFixed(2)} MiB)`);
console.log(
  `smallest: ${sizes[0]}, largest: ${sizes[sizes.length - 1]}, median: ${sizes[Math.floor(sizes.length / 2)]}`,
);
console.log(
  `width range: ${Math.min(...ws)}-${Math.max(...ws)}, height range: ${Math.min(...hs)}-${Math.max(...hs)}`,
);
