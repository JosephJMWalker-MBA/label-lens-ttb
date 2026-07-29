// Evaluation-only packet builder for the blinded Brand mechanism audit.
//
// Imports NOTHING from the production extractor, OCR engine, parser, ranking,
// or field-selection code. Reads only committed Phase 2 evidence and committed
// Brand crops, and emits a reader packet plus an out-of-packet anonymization map.
//
// This script does NOT run OCR, does NOT run any treatment, and does NOT produce
// labels. Labels must be produced by an annotator who has not seen the prior
// failure classes or hypotheses.
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const REPO = process.cwd();
const PHASE2 = path.join(REPO, "artifacts/brand-region-coverage-diagnosis/classifications.json");
const CROP_DIR = path.join(REPO, "artifacts/issue-149-brand-otsu-threshold/control/crops");
const OUT = path.join(REPO, "artifacts/issue-149-brand-mechanism-sublabels");
const PACKET = path.join(OUT, "reader-packet");

// Fixed salt so anonymous IDs are reproducible across rebuilds.
const SALT = "issue-149-brand-mechanism-sublabels-v1";

// Which Phase 2 primary categories feed which audit. This mapping lives ONLY in
// the builder and the out-of-packet anonymization map, never in reader material.
const GEOMETRIC_SOURCE_CATEGORY = "ORIENTATION_OR_SEGMENTATION_FAILURE";
const STYLIZATION_SOURCE_CATEGORIES = [
  "REGION_COVERED_NO_TEXT_RECOGNIZED",
  "REGION_COVERED_SEVERE_GLYPH_MISRECOGNITION",
];

function sha256File(p) {
  return createHash("sha256").update(readFileSync(p)).digest("hex");
}
function sha256Str(s) {
  return createHash("sha256").update(s).digest("hex");
}

// Deterministic, non-revealing item id derived from a salted hash of the case
// identity. Order is then sorted by the hash so item numbering does not follow
// case-id alphabetical order or Phase 2 listing order.
function anonId(caseKey) {
  return `item-${sha256Str(`${SALT}:${caseKey}`).slice(0, 8)}`;
}

function cropsForCase(caseId) {
  const all = readdirSync(CROP_DIR).filter((f) => f.endsWith(".png"));
  const exact = all.filter((f) => f === `${caseId}.png`);
  if (exact.length > 0) return exact;
  return all.filter((f) => f.startsWith(`${caseId}-region-`)).sort();
}

async function neutralOverlay(srcPath, destPath) {
  // Neutral horizontal reference lines only. No boxes around text, no
  // annotations, no color coding that could imply a expected answer. Purpose is
  // solely to let a reader judge baseline deviation against true horizontal.
  const meta = await sharp(srcPath).metadata();
  const w = meta.width;
  const h = meta.height;
  const step = Math.max(12, Math.round(h / 8));
  const stroke = Math.max(1, Math.round(Math.min(w, h) * 0.0035));
  const lines = [];
  for (let y = step; y < h; y += step) {
    lines.push(
      `<line x1="0" y1="${y}" x2="${w}" y2="${y}" stroke="#888888" stroke-width="${stroke}" stroke-dasharray="${stroke * 4},${stroke * 4}" opacity="0.55" />`,
    );
  }
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">${lines.join("")}</svg>`;
  const buf = await sharp(srcPath)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
  writeFileSync(destPath, buf);
}

// Files this builder generates. Everything else in OUT is hand-authored
// governance material (preregistration, contamination audit, limitations,
// provenance template, commands) and must survive a rebuild.
const GENERATED_FILES = [
  "case-freeze.json",
  "case-freeze.sha256",
  "anonymization-map.json",
  "packet-manifest.json",
  "packet-manifest.sha256",
];

async function main() {
  // Clear ONLY generated output. A previous version removed all of OUT, which
  // silently destroyed hand-authored governance documents on rebuild.
  rmSync(PACKET, { recursive: true, force: true });
  for (const f of GENERATED_FILES) rmSync(path.join(OUT, f), { force: true });
  mkdirSync(path.join(PACKET, "images"), { recursive: true });
  mkdirSync(path.join(PACKET, "reference-lines"), { recursive: true });

  const phase2 = JSON.parse(readFileSync(PHASE2, "utf8"));
  const primary = phase2.cases.filter((c) => c.population === "primary");
  if (primary.length !== 10) {
    throw new Error(`expected 10 primary Phase 2 cases, found ${primary.length}`);
  }

  const geometricCases = primary.filter((c) => c.primaryCategory === GEOMETRIC_SOURCE_CATEGORY);
  const stylizationCases = primary.filter((c) =>
    STYLIZATION_SOURCE_CATEGORIES.includes(c.primaryCategory),
  );
  if (geometricCases.length !== 5 || stylizationCases.length !== 5) {
    throw new Error(`expected 5/5 split, got ${geometricCases.length}/${stylizationCases.length}`);
  }

  const freeze = {
    experimentId: "issue-149-brand-mechanism-sublabels",
    source: "artifacts/brand-region-coverage-diagnosis/classifications.json",
    sourceSha256: sha256File(PHASE2),
    frozenCaseCount: primary.length,
    audits: {
      geometric: geometricCases.map((c) => c.caseId).sort(),
      stylization: stylizationCases.map((c) => c.caseId).sort(),
    },
  };

  const mapEntries = [];
  const readerItems = { geometric: [], stylization: [] };

  for (const [audit, cases] of [
    ["geometric", geometricCases],
    ["stylization", stylizationCases],
  ]) {
    for (const c of cases) {
      const crops = cropsForCase(c.caseId);
      if (crops.length === 0) throw new Error(`no committed crop for ${c.caseId}`);
      for (const crop of crops) {
        const caseKey = crop.replace(/\.png$/, "");
        const id = anonId(caseKey);
        const src = path.join(CROP_DIR, crop);
        const destImg = path.join(PACKET, "images", `${id}.png`);
        copyFileSync(src, destImg);
        if (audit === "geometric") {
          await neutralOverlay(src, path.join(PACKET, "reference-lines", `${id}.png`));
        }
        readerItems[audit].push(id);
        mapEntries.push({
          itemId: id,
          audit,
          caseId: c.caseId,
          cropFile: crop,
          multiRegionCase: crops.length > 1,
          sourceCropSha256: sha256File(src),
        });
      }
    }
  }

  // Sort item ids so ordering carries no information about case identity.
  readerItems.geometric.sort();
  readerItems.stylization.sort();

  writeFileSync(path.join(OUT, "case-freeze.json"), `${JSON.stringify(freeze, null, 2)}\n`);
  writeFileSync(
    path.join(OUT, "case-freeze.sha256"),
    `${sha256File(path.join(OUT, "case-freeze.json"))}  case-freeze.json\n`,
  );
  writeFileSync(
    path.join(OUT, "anonymization-map.json"),
    `${JSON.stringify(
      {
        warning:
          "UNBLINDING KEY. Must not be given to the annotator before responses are recorded.",
        salt: SALT,
        entries: mapEntries.sort((a, b) => a.itemId.localeCompare(b.itemId)),
      },
      null,
      2,
    )}\n`,
  );

  // ---- reader-facing files ----
  writeFileSync(
    path.join(PACKET, "geometric-response-template.json"),
    `${JSON.stringify(
      {
        auditId: "geometry",
        annotatorId: "<fill in>",
        completedOn: "<YYYY-MM-DD>",
        responses: readerItems.geometric.map((id) => ({
          itemId: id,
          label: "<ORIENTATION_SUSPECTED | SEGMENTATION_SUSPECTED | AMBIGUOUS_SUBLABEL>",
          estimatedBaselineDegreesFromHorizontal: "<number>",
          confidence: "<high | medium | low>",
          rationale: "<geometry-only rationale>",
        })),
      },
      null,
      2,
    )}\n`,
  );

  writeFileSync(
    path.join(PACKET, "stylization-response-template.json"),
    `${JSON.stringify(
      {
        auditId: "typography",
        annotatorId: "<fill in>",
        completedOn: "<YYYY-MM-DD>",
        responses: readerItems.stylization.map((id) => ({
          itemId: id,
          decorativeScript: "<Y|N>",
          condensedOrExpanded: "<Y|N>",
          customLogotype: "<Y|N>",
          outlineOrShadow: "<Y|N>",
          archedOrCurvedBaseline: "<Y|N>",
          unusualLigature: "<Y|N>",
          extremeTextureOrContrast: "<Y|N>",
          overallStylized: "<Y|N>",
          confidence: "<high | medium | low>",
          rationale: "<appearance-only rationale>",
        })),
      },
      null,
      2,
    )}\n`,
  );

  writeFileSync(
    path.join(PACKET, "reader-instructions.md"),
    `# Reader instructions

You are reviewing cropped images of text taken from beverage-container labels.
Please answer only from what you can see. Two independent audits are included.
Complete them in order and do not revise Audit 1 after starting Audit 2.

Do not search for these images, look up any product, or try to identify a
company or product name. If you happen to recognize one, that must not influence
your answers. There is no expected or preferred answer for any item, and the
counts of each answer are not fixed.

## Audit 1 — geometry (${readerItems.geometric.length} items)

Use \`images/<itemId>.png\`. A copy with neutral dashed horizontal reference
lines is in \`reference-lines/<itemId>.png\` to help judge angles; the lines carry
no meaning beyond marking true horizontal.

Assign exactly one label per item:

- \`ORIENTATION_SUSPECTED\` — the visible text baseline deviates more than 15
  degrees from horizontal, or the text runs vertically / top-to-bottom.
- \`SEGMENTATION_SUSPECTED\` — the text is upright within 15 degrees, but is
  visually fragmented, split, curved, or grouped in a way that could plausibly
  confuse an automatic reader trying to group it into lines and words.
- \`AMBIGUOUS_SUBLABEL\` — appearance alone cannot distinguish the two.

Also record your estimated baseline angle from horizontal, your confidence, and
a one-line rationale based only on what you see.

Record answers in \`geometric-response-template.json\`.

## Audit 2 — typography (${readerItems.stylization.length} items)

Use \`images/<itemId>.png\`. For each item record Y or N for:

- decorative script
- condensed or expanded lettering
- custom logotype
- outline or shadow
- arched or curved baseline
- unusual ligature
- extreme texture or contrast effect

Then record an overall \`stylized\` Y/N, your confidence, and a one-line
rationale. Judge only visual appearance.

Record answers in \`stylization-response-template.json\`.

## Please do not

- Guess what the text says and answer based on the guess rather than appearance.
- Consult any other file in this repository, any prior analysis, or any tool
  output while annotating.
- Discuss the items with anyone who has worked on this project before your
  responses are saved.
`,
  );

  // ---- manifest over reader-facing files only ----
  const readerFiles = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else readerFiles.push(p);
    }
  };
  walk(PACKET);
  readerFiles.sort();

  const manifest = {
    experimentId: "issue-149-brand-mechanism-sublabels",
    generatedFrom: {
      phase2: "artifacts/brand-region-coverage-diagnosis/classifications.json",
      phase2Sha256: freeze.sourceSha256,
      cropSource: "artifacts/issue-149-brand-otsu-threshold/control/crops",
    },
    itemCounts: {
      geometric: readerItems.geometric.length,
      stylization: readerItems.stylization.length,
    },
    readerFiles: readerFiles.map((p) => ({
      path: path.relative(PACKET, p),
      sha256: sha256File(p),
    })),
  };
  const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(path.join(OUT, "packet-manifest.json"), manifestJson);
  writeFileSync(
    path.join(OUT, "packet-manifest.sha256"),
    `${sha256Str(manifestJson)}  packet-manifest.json\n`,
  );

  console.log(`frozen cases: ${freeze.frozenCaseCount}`);
  console.log(
    `reader items: geometric=${readerItems.geometric.length} stylization=${readerItems.stylization.length}`,
  );
  console.log(`packet manifest sha256: ${sha256Str(manifestJson)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
