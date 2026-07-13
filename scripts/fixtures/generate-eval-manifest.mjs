import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { format, resolveConfig } from "prettier";
import sharp from "sharp";

import { FULL_CORPUS_RECORD_OVERRIDES } from "../../src/fixtures/eval/eval-full-corpus-overrides.mjs";

const REPO_ROOT = process.cwd();
const CORPUS_ROOT = path.join(REPO_ROOT, "tests/fixtures/precheck");
const OUT_MANIFEST = path.join(REPO_ROOT, "src/fixtures/eval/eval-manifest.json");
const BASELINE_SEED = path.join(REPO_ROOT, "src/fixtures/eval/eval-baseline-seed.json");
const APPROVED_INVENTORY = path.join(CORPUS_ROOT, "approved-wine-110-inventory.json");
const SUPPLEMENTAL_INVENTORY = path.join(CORPUS_ROOT, "supplemental-corpus-inventory.json");
const OUT_DIR = path.join(REPO_ROOT, "docs/extraction-full-corpus");
const CONTACT_SHEET_DIR = path.join(OUT_DIR, "contact-sheets");

const TODAY = "2026-07-12";
const QC_CHECKS = [
  "capitalization-and-punctuation",
  "varietal-not-brand",
  "producer-importer-bottler-not-brand",
  "proof-not-alcohol-by-volume",
  "rotated-or-vertical-alcohol",
  "absent-field-annotations",
  "genuine-ambiguity",
  "duplicate-labels",
];

const NON_WINE_OVERRIDES = new Map([
  ["wine-multi-artifact-01", "distilled-spirits"],
  ["wine-multi-artifact-02", "distilled-spirits"],
  ["wine-multi-artifact-03", "distilled-spirits"],
]);

const CHECKPOINT_EXCLUSION =
  "Checkpoint inventory record only: full-corpus annotation has not been completed for this wine image yet.";

const BASELINE_AMBIGUITY_REASONS = new Map([
  [
    "m-cellars-baseline",
    "The only clean 'M CELLARS' is the excluded bottler line, so the artwork does not support a single determinate brand presentation.",
  ],
  [
    "patricia-green-cellars",
    "The label is dense and the brand appears only through bottler-style text, so the artwork supports reviewer-facing uncertainty rather than a single clean brand mark.",
  ],
  [
    "amuninni-ferracane",
    "Competing prominent producer-style phrases remain materially plausible from the artwork alone.",
  ],
]);

const CHECKPOINT_INCLUDED = new Map([
  [
    "approved-wine-004",
    {
      visualStrata: [
        "decorative-or-script-brand",
        "vertical-mandatory-strip",
        "alcohol-at-side-or-rotated",
        "front-label",
      ],
      notes:
        "Wrap-style La Fattoria Cabernet Sauvignon label with the alcohol statement printed on the vertical side strip.",
      brand: { acceptablePresentations: ["La Fattoria"] },
      alcohol: {
        acceptablePercents: [14],
        acceptableStatements: ["14% ALC", "14%"],
        characteristics: ["rotated-or-vertical"],
        orientation: "vertical-clockwise",
      },
    },
  ],
  [
    "approved-wine-005",
    {
      visualStrata: [
        "decorative-or-script-brand",
        "vertical-mandatory-strip",
        "alcohol-at-side-or-rotated",
        "front-label",
      ],
      notes:
        "Wrap-style La Fattoria Barbera label with the alcohol statement printed on the vertical side strip.",
      brand: { acceptablePresentations: ["La Fattoria"] },
      alcohol: {
        acceptablePercents: [14],
        acceptableStatements: ["14% ALC", "14%"],
        characteristics: ["rotated-or-vertical"],
        orientation: "vertical-clockwise",
      },
    },
  ],
  [
    "approved-wine-006",
    {
      visualStrata: ["simple-centered-brand", "low-contrast", "front-label", "alcohol-at-bottom"],
      notes:
        "Dark Horse Pinot Noir display panel with alcohol printed across the lower-right footer.",
      brand: { acceptablePresentations: ["Dark Horse"] },
      alcohol: {
        acceptablePercents: [13.5],
        acceptableStatements: ["ALC. 13.5% BY VOL.", "13.5%"],
        characteristics: ["decimal-value"],
        orientation: "horizontal",
      },
    },
  ],
  [
    "approved-wine-012",
    {
      visualStrata: ["simple-centered-brand", "front-label", "alcohol-at-bottom"],
      notes:
        "Cooley Bay Reserve Tempranillo label with a direct alcohol statement near the bottom.",
      brand: { acceptablePresentations: ["Cooley Bay"] },
      alcohol: {
        acceptablePercents: [13.8],
        acceptableStatements: ["Alcohol 13.8% by Volume", "13.8%"],
        characteristics: ["decimal-value"],
        orientation: "horizontal",
      },
    },
  ],
  [
    "approved-wine-014",
    {
      visualStrata: ["multi-line-brand", "back-label", "alcohol-at-bottom"],
      notes:
        "Tre Cori text-heavy label with the alcohol statement printed above the net-contents line.",
      brand: { acceptablePresentations: ["Tre Cori"] },
      alcohol: {
        acceptablePercents: [14],
        acceptableStatements: ["14% ALC. BY VOL.", "14%"],
        characteristics: [],
        orientation: "horizontal",
      },
    },
  ],
  [
    "approved-wine-016",
    {
      visualStrata: ["multi-line-brand", "back-label", "alcohol-at-bottom"],
      notes:
        "Marques de Navarro Malbec label with a bottom-row alcohol statement and producer text separated from the title block.",
      brand: { acceptablePresentations: ["Marques de Navarro"] },
      alcohol: {
        acceptablePercents: [13.5],
        acceptableStatements: ["ALC. 13.5% BY VOL.", "13.5%"],
        characteristics: ["decimal-value"],
        orientation: "horizontal",
      },
    },
  ],
  [
    "approved-wine-018",
    {
      visualStrata: ["multi-line-brand", "front-label", "dense-text", "alcohol-at-bottom"],
      notes:
        "Poqr Krya indigenous-blend label with the alcohol statement stacked in the left information column.",
      brand: { acceptablePresentations: ["Poqr Krya", "POQR KRYA"] },
      alcohol: {
        acceptablePercents: [13.5],
        acceptableStatements: ["Alc. 13.5% by Vol.", "13.5%"],
        characteristics: ["decimal-value"],
        orientation: "horizontal",
      },
    },
  ],
  [
    "approved-wine-019",
    {
      visualStrata: ["simple-centered-brand", "front-label", "alcohol-at-bottom"],
      notes:
        "Kyrios Malbec label with a clean title block and a direct alcohol statement on the lower edge.",
      brand: { acceptablePresentations: ["Kyrios"] },
      alcohol: {
        acceptablePercents: [13.5],
        acceptableStatements: ["Alc. 13.5 % by Vol.", "13.5%"],
        characteristics: ["decimal-value"],
        orientation: "horizontal",
      },
    },
  ],
  [
    "approved-wine-020",
    {
      visualStrata: ["simple-centered-brand", "back-label", "alcohol-at-bottom"],
      notes:
        "Courtieu / Chateau Courtieu text label with a comma-decimal alcohol statement near the lower-left corner.",
      brand: { acceptablePresentations: ["Courtieu", "Chateau Courtieu"] },
      alcohol: {
        acceptablePercents: [12.5],
        acceptableStatements: ["ALC. 12,5% BY VOL", "12.5%", "12,5%"],
        characteristics: ["decimal-value"],
        orientation: "horizontal",
      },
    },
  ],
]);

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

async function writeFormattedJson(filePath, value) {
  const config = (await resolveConfig(filePath)) ?? {};
  const formatted = await format(JSON.stringify(value), {
    ...config,
    filepath: filePath,
    parser: "json",
  });
  writeFileSync(filePath, formatted);
}

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function relRepo(filePath) {
  return path.relative(REPO_ROOT, filePath).split(path.sep).join("/");
}

function orientation(width, height) {
  if (width === height) return "square";
  return width > height ? "landscape" : "portrait";
}

function caseIdFor(relPath, seedByRelPath) {
  const seeded = seedByRelPath.get(relPath);
  if (seeded) return seeded.caseId;
  if (relPath === "tests/fixtures/precheck/m-cellars-24205001000905/label.png") {
    return "m-cellars-reference-crop";
  }
  if (relPath === "tests/fixtures/precheck/m-cellars-lowres-24205001000905/label-lowres.png") {
    return "m-cellars-lowres";
  }
  return relPath.split("/").at(-2);
}

function beverageCategory(caseId) {
  if (NON_WINE_OVERRIDES.has(caseId)) return NON_WINE_OVERRIDES.get(caseId);
  if (caseId.startsWith("category-sentinel-agave-spirit")) return "distilled-spirits";
  if (caseId.startsWith("category-sentinel-single-malt-whiskey")) return "distilled-spirits";
  if (caseId.startsWith("category-sentinel-ale")) return "beer-or-malt-beverage";
  return "wine";
}

function sourceFor(relPath) {
  if (relPath.startsWith("tests/fixtures/precheck/approved-wine-")) {
    return {
      authority: "author-provided-local-acquisition",
      description:
        "Author-provided public-registry screenshot or downloaded display derivative of previously approved wine-label artwork.",
      usageStatus: "screenshot-metadata-screened-author-attested",
      provenanceRefs: [
        "tests/fixtures/precheck/approved-wine-110-inventory.json",
        "docs/corpus/approved-wine-110.md",
        "docs/corpus/approved-wine-110-review-queue.md",
      ],
    };
  }
  if (
    relPath.startsWith("tests/fixtures/precheck/wine-multi-artifact-") ||
    relPath.startsWith("tests/fixtures/precheck/category-sentinel-")
  ) {
    return {
      authority: "author-provided-local-acquisition",
      description:
        "Author-provided public-registry screenshot or downloaded display derivative retained in the supplemental challenge/sentinel corpus.",
      usageStatus: "screenshot-metadata-screened-author-attested",
      provenanceRefs: [
        "tests/fixtures/precheck/supplemental-corpus-inventory.json",
        "docs/corpus/supplemental-challenge-and-sentinels.md",
      ],
    };
  }
  if (relPath === "tests/fixtures/precheck/m-cellars-lowres-24205001000905/label-lowres.png") {
    return {
      authority: "Alcohol and Tobacco Tax and Trade Bureau",
      description:
        "Repository-generated low-resolution derivative of the screened M Cellars OCR benchmark.",
      usageStatus: "derived-from-screened-parent",
      provenanceRefs: ["tests/fixtures/precheck/m-cellars-lowres-24205001000905/manifest.json"],
    };
  }
  return {
    authority: "Alcohol and Tobacco Tax and Trade Bureau",
    description: "Screened public-registry derivative of approved M Cellars label artwork.",
    usageStatus: "screened-approved",
    provenanceRefs: ["tests/fixtures/precheck/m-cellars-24205001000905/manifest.json"],
  };
}

function defaultVisualStrata(relPath, category) {
  if (category !== "wine") return ["out-of-scope-category"];
  if (relPath.includes("/wine-multi-artifact-")) return ["multi-panel"];
  if (relPath.includes("label-lowres")) return ["low-resolution"];
  return ["front-label"];
}

function lineReason(text) {
  return text.replace(/\s+/g, " ").trim();
}

function seedBrand(seedCase) {
  return {
    presence: "present",
    acceptablePresentations: seedCase.brand.acceptable,
    genuinelyAmbiguous: seedCase.brand.knownAmbiguous,
    ambiguityReason: seedCase.brand.knownAmbiguous
      ? (BASELINE_AMBIGUITY_REASONS.get(seedCase.caseId) ??
        seedCase.annotation.notes ??
        "Artwork-level ambiguity preserved from the baseline seed.")
      : null,
    forbiddenPresentations: seedCase.brand.forbidden ?? [],
    approxGeometry: [],
    orientation:
      seedCase.brand.approxLocation === "side" || seedCase.brand.approxLocation === "rotated"
        ? "unknown"
        : "horizontal",
  };
}

function alcoholCharacteristics(seedCase) {
  const out = new Set();
  if (
    [
      "vertical-clockwise",
      "vertical-counterclockwise",
      "vertical-stacked",
      "rotated-180",
      "mixed",
    ].includes(seedAlcoholOrientation(seedCase))
  ) {
    out.add("rotated-or-vertical");
  }
  if (seedCase.strata.includes("split-alcohol-tokens")) out.add("split-token");
  if (
    typeof seedCase.alcohol.detectionChallenge === "string" &&
    seedCase.alcohol.detectionChallenge.toLowerCase().includes("omits the percent sign")
  ) {
    out.add("no-percent-sign");
  }
  if (seedCase.alcohol.acceptablePercents.some((value) => !Number.isInteger(value))) {
    out.add("decimal-value");
  }
  return [...out];
}

function seedAlcoholOrientation(seedCase) {
  if (seedCase.caseId === "luigi-giovanni-live") return "horizontal";
  if (seedCase.caseId === "la-fattoria-rotated") return "vertical-clockwise";
  return seedCase.alcohol.approxLocation === "side" || seedCase.alcohol.approxLocation === "rotated"
    ? "mixed"
    : "horizontal";
}

function seedAlcohol(seedCase) {
  if (!seedCase.alcohol.present) {
    return {
      presence: "absent",
      acceptablePercents: [],
      acceptableStatements: [],
      characteristics: [],
      absenceReason: "No supported alcohol statement appears on the artwork.",
      approxGeometry: [],
      orientation: "not-applicable",
    };
  }
  return {
    presence: "present",
    acceptablePercents: seedCase.alcohol.acceptablePercents,
    acceptableStatements: seedCase.alcohol.acceptableText,
    characteristics: alcoholCharacteristics(seedCase),
    approxGeometry: [],
    orientation: seedAlcoholOrientation(seedCase),
  };
}

function seedInspection(seedCase, fallback) {
  return {
    imageOrientation: fallback.imageOrientation,
    visualStrata: [...new Set([...seedCase.strata, ...fallback.visualStrata])],
    reviewReasons: [],
    notes:
      seedCase.annotation.notes ??
      "Baseline seed case carried forward into the corpus-scale inventory.",
  };
}

function seedRecord(discovered, seedCase) {
  const fallback = {
    imageOrientation: orientation(discovered.image.width, discovered.image.height),
    visualStrata: defaultVisualStrata(discovered.imagePath, discovered.beverageCategory),
  };
  return {
    caseId: seedCase.caseId,
    imagePath: discovered.imagePath,
    expectedSha256: discovered.expectedSha256,
    image: discovered.image,
    beverageCategory: discovered.beverageCategory,
    source: discovered.source,
    inspection: seedInspection(seedCase, fallback),
    status: "included",
    exclusionReason: null,
    duplicateOfCaseId: null,
    annotation: {
      brand: seedBrand(seedCase),
      alcohol: seedAlcohol(seedCase),
      confidence: {
        overall: seedCase.brand.knownAmbiguous ? "medium" : "high",
        brand: seedCase.brand.knownAmbiguous ? "medium" : "high",
        alcohol: "high",
      },
      provenance: {
        annotatedBy: seedCase.annotation.annotatedBy,
        annotatedOn: seedCase.annotation.annotatedOn,
        method: seedCase.annotation.method,
      },
      notes:
        seedCase.annotation.notes ??
        "Baseline seed case retained during corpus-scale inventory migration.",
    },
    qualityControl: {
      reviewedBy: "Codex",
      reviewedOn: TODAY,
      method: "second-pass-visual-inspection",
      outcome: "confirmed",
      checks: QC_CHECKS,
      corrections: [],
      notes:
        "Seeded baseline annotation rechecked while migrating the manifest to corpus-scale accounting.",
    },
  };
}

function manualIncludedRecord(discovered, override) {
  return manualOverrideRecord(discovered, {
    status: "included",
    inspection: {
      visualStrata: override.visualStrata,
      reviewReasons: [],
      notes: override.notes,
    },
    annotation: {
      brand: {
        presence: "present",
        acceptablePresentations: override.brand.acceptablePresentations,
        genuinelyAmbiguous: false,
        ambiguityReason: null,
        forbiddenPresentations: [],
        approxGeometry: [],
        orientation: "horizontal",
      },
      alcohol: {
        presence: "present",
        acceptablePercents: override.alcohol.acceptablePercents,
        acceptableStatements: override.alcohol.acceptableStatements,
        characteristics: override.alcohol.characteristics,
        approxGeometry: [],
        orientation: override.alcohol.orientation,
      },
      confidence: { overall: "high", brand: "high", alcohol: "high" },
      notes: override.notes,
    },
  });
}

function manualOverrideRecord(discovered, override) {
  const base = {
    caseId: discovered.caseId,
    imagePath: discovered.imagePath,
    expectedSha256: discovered.expectedSha256,
    image: discovered.image,
    beverageCategory: discovered.beverageCategory,
    source: discovered.source,
    inspection: {
      imageOrientation: orientation(discovered.image.width, discovered.image.height),
      visualStrata: override.inspection.visualStrata,
      reviewReasons: override.inspection.reviewReasons,
      notes: override.inspection.notes,
    },
  };

  if (override.status !== "included") {
    return {
      ...base,
      status: override.status,
      exclusionReason: override.exclusionReason,
      duplicateOfCaseId: null,
      annotation: null,
      qualityControl: null,
    };
  }

  return {
    ...base,
    status: "included",
    exclusionReason: null,
    duplicateOfCaseId: null,
    annotation: {
      brand: override.annotation.brand,
      alcohol: override.annotation.alcohol,
      confidence: override.annotation.confidence,
      provenance: {
        annotatedBy: "Codex",
        annotatedOn: TODAY,
        method:
          "manual inspection of the committed fixture image aided by bounded local OCR preview",
      },
      notes: override.annotation.notes,
    },
    qualityControl: {
      reviewedBy: "Codex",
      reviewedOn: TODAY,
      method: "second-pass-visual-inspection",
      outcome: "confirmed",
      checks: QC_CHECKS,
      corrections: [],
      notes: "Full-corpus annotation confirmed after direct image review and bounded OCR preview.",
    },
  };
}

function duplicateRecord(discovered, duplicateOfCaseId, reason) {
  return {
    caseId: discovered.caseId,
    imagePath: discovered.imagePath,
    expectedSha256: discovered.expectedSha256,
    image: discovered.image,
    beverageCategory: discovered.beverageCategory,
    source: discovered.source,
    inspection: {
      imageOrientation: orientation(discovered.image.width, discovered.image.height),
      visualStrata: defaultVisualStrata(discovered.imagePath, discovered.beverageCategory),
      reviewReasons: ["possible-duplicate-artwork"],
      notes: lineReason(reason),
    },
    status: "excluded_duplicate",
    exclusionReason: lineReason(reason),
    duplicateOfCaseId,
    annotation: null,
    qualityControl: null,
  };
}

function excludedRecord(discovered, status, reason, reviewReasons = []) {
  return {
    caseId: discovered.caseId,
    imagePath: discovered.imagePath,
    expectedSha256: discovered.expectedSha256,
    image: discovered.image,
    beverageCategory: discovered.beverageCategory,
    source: discovered.source,
    inspection: {
      imageOrientation: orientation(discovered.image.width, discovered.image.height),
      visualStrata: defaultVisualStrata(discovered.imagePath, discovered.beverageCategory),
      reviewReasons,
      notes: lineReason(reason),
    },
    status,
    exclusionReason: lineReason(reason),
    duplicateOfCaseId: null,
    annotation: null,
    qualityControl: null,
  };
}

async function discoverImages(seedByRelPath) {
  const records = [];
  const dirs = readdirSync(CORPUS_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const dir of dirs) {
    const fullDir = path.join(CORPUS_ROOT, dir);
    const files = readdirSync(fullDir)
      .filter((name) => /\.(?:png|jpe?g)$/i.test(name))
      .sort();
    for (const file of files) {
      const absPath = path.join(fullDir, file);
      const imagePath = relRepo(absPath);
      const buffer = readFileSync(absPath);
      const meta = await sharp(buffer).metadata();
      const caseId = caseIdFor(imagePath, seedByRelPath);
      records.push({
        caseId,
        imagePath,
        expectedSha256: sha256Hex(buffer),
        image: {
          mediaType: file.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg",
          width: meta.width,
          height: meta.height,
        },
        beverageCategory: beverageCategory(caseId),
        source: sourceFor(imagePath),
      });
    }
  }
  return records;
}

function inventorySummary(records) {
  const byCategory = {};
  const byStatus = {};
  for (const record of records) {
    byCategory[record.beverageCategory] = (byCategory[record.beverageCategory] ?? 0) + 1;
    byStatus[record.status] = (byStatus[record.status] ?? 0) + 1;
  }
  return {
    discoveredCandidateImages: records.length,
    byCategory,
    byStatus,
    includedWine: records.filter((record) => record.status === "included").length,
    excludedUncertainTruthWine: records.filter(
      (record) =>
        record.beverageCategory === "wine" && record.status === "excluded_uncertain_truth",
    ).length,
    nonWine: records.filter((record) => record.beverageCategory !== "wine").length,
  };
}

async function writeInventoryReport(records) {
  const summary = inventorySummary(records);
  mkdirSync(OUT_DIR, { recursive: true });
  await writeFormattedJson(path.join(OUT_DIR, "inventory.json"), summary);

  const lines = [];
  lines.push("# Full Corpus Evaluation Inventory");
  lines.push("");
  lines.push(
    "This inventory reconciles every committed candidate image under `tests/fixtures/precheck` into the full Issue #57 evaluation manifest.",
  );
  lines.push("");
  lines.push(`- Discovered candidate images: **${summary.discoveredCandidateImages}**`);
  lines.push(`- Wine images: **${summary.byCategory["wine"] ?? 0}**`);
  lines.push(`- Distilled-spirits images: **${summary.byCategory["distilled-spirits"] ?? 0}**`);
  lines.push(
    `- Beer or malt beverage images: **${summary.byCategory["beer-or-malt-beverage"] ?? 0}**`,
  );
  lines.push(`- Included wine evaluation records: **${summary.includedWine}**`);
  lines.push(
    `- Wine records excluded as uncertain truth: **${summary.excludedUncertainTruthWine}**`,
  );
  lines.push("");
  lines.push("## Visual corrections discovered during inventory");
  lines.push("");
  lines.push(
    "- `wine-multi-artifact-01`, `wine-multi-artifact-02`, and `wine-multi-artifact-03` are visually non-wine distilled-spirit labels despite their supplemental inventory grouping.",
  );
  lines.push(
    "- `m-cellars-reference-crop` and `m-cellars-lowres` are materially duplicate derivatives of the canonical `m-cellars-baseline` artwork and remain excluded from scoring.",
  );
  lines.push("");
  writeFileSync(path.join(OUT_DIR, "inventory.md"), `${lines.join("\n")}\n`);
}

function escapeXml(text) {
  return text.replace(/[<>&"']/g, (char) => {
    return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[char];
  });
}

async function writeContactSheets(records, slug) {
  const outDir = path.join(CONTACT_SHEET_DIR, slug);
  mkdirSync(outDir, { recursive: true });
  for (const name of readdirSync(outDir).filter((entry) => entry.endsWith(".png"))) {
    rmSync(path.join(outDir, name));
  }
  const cols = 3;
  const rows = 4;
  const thumbW = 360;
  const thumbH = 300;
  const labelH = 104;
  const cellW = thumbW;
  const cellH = thumbH + labelH;
  const perPage = cols * rows;
  const sorted = [...records].sort((a, b) => a.caseId.localeCompare(b.caseId));

  for (let offset = 0; offset < sorted.length; offset += perPage) {
    const page = sorted.slice(offset, offset + perPage);
    const base = sharp({
      create: {
        width: cols * cellW,
        height: rows * cellH,
        channels: 3,
        background: "#f4f1ea",
      },
    });
    const composites = [];
    for (const [index, record] of page.entries()) {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const left = col * cellW;
      const top = row * cellH;
      const imageBuffer = await sharp(path.join(REPO_ROOT, record.imagePath))
        .flatten({ background: "#ffffff" })
        .resize({ width: thumbW - 16, height: thumbH - 16, fit: "contain", background: "#ffffff" })
        .extend({ top: 8, bottom: 8, left: 8, right: 8, background: "#ffffff" })
        .png()
        .toBuffer();
      composites.push({ input: imageBuffer, left, top });
      const label = `
        <svg width="${cellW}" height="${labelH}">
          <rect x="0" y="0" width="${cellW}" height="${labelH}" fill="#1f2937" />
          <text x="12" y="26" font-size="18" font-family="Menlo, monospace" fill="#f9fafb">${escapeXml(record.caseId)}</text>
          <text x="12" y="52" font-size="14" font-family="Menlo, monospace" fill="#cbd5e1">${escapeXml(record.beverageCategory)}</text>
          <text x="12" y="74" font-size="14" font-family="Menlo, monospace" fill="#cbd5e1">${escapeXml(record.status)}</text>
          <text x="12" y="96" font-size="12" font-family="Menlo, monospace" fill="#94a3b8">${escapeXml(record.imagePath.split("/").slice(-2).join("/"))}</text>
        </svg>`;
      composites.push({ input: Buffer.from(label), left, top: top + thumbH });
    }
    await base
      .composite(composites)
      .png()
      .toFile(
        path.join(outDir, `contact-sheet-${String(offset / perPage + 1).padStart(2, "0")}.png`),
      );
  }
}

async function main() {
  const baselineSeed = readJson(BASELINE_SEED);
  const seedByRelPath = new Map(
    baselineSeed.cases.map((seedCase) => [
      `tests/fixtures/precheck/${seedCase.fixtureDir}/${seedCase.imageFilename}`,
      seedCase,
    ]),
  );

  const discovered = await discoverImages(seedByRelPath);
  const records = discovered.map((record) => {
    const seedCase = seedByRelPath.get(record.imagePath);
    if (seedCase) return seedRecord(record, seedCase);
    const override = CHECKPOINT_INCLUDED.get(record.caseId);
    if (override) return manualIncludedRecord(record, override);
    const fullCorpusOverride = FULL_CORPUS_RECORD_OVERRIDES[record.caseId];
    if (fullCorpusOverride) return manualOverrideRecord(record, fullCorpusOverride);
    if (record.caseId === "m-cellars-reference-crop") {
      return duplicateRecord(
        record,
        "m-cellars-baseline",
        "Reference crop of the same M Cellars artwork already scored as m-cellars-baseline.",
      );
    }
    if (record.caseId === "m-cellars-lowres") {
      return duplicateRecord(
        record,
        "m-cellars-baseline",
        "Deterministic low-resolution derivative of the same M Cellars artwork already scored as m-cellars-baseline.",
      );
    }
    if (record.beverageCategory !== "wine") {
      return excludedRecord(
        record,
        "excluded_outside_current_scope",
        "Visually classified as a non-wine beverage label and therefore outside the current wine-extractor evaluation scope.",
      );
    }
    return excludedRecord(record, "excluded_uncertain_truth", CHECKPOINT_EXCLUSION, ["other"]);
  });

  const manifest = {
    schemaVersion: "extraction-eval-manifest.v2",
    corpusRoot: "tests/fixtures/precheck",
    description:
      "Corpus-scale evaluation manifest for Issue #57. Every committed candidate image is reconciled here, with the full wine corpus annotated except for the three labels whose alcohol truth remains indeterminate from the committed artwork.",
    records,
  };

  mkdirSync(path.dirname(OUT_MANIFEST), { recursive: true });
  await writeFormattedJson(OUT_MANIFEST, manifest);
  await writeInventoryReport(records);
  await writeContactSheets(
    records.filter((record) => record.status === "included"),
    "included-wine",
  );
  await writeContactSheets(
    records.filter((record) => record.beverageCategory === "wine" && record.status !== "included"),
    "excluded-wine",
  );
  await writeContactSheets(
    records.filter((record) => record.beverageCategory !== "wine"),
    "non-wine",
  );
  await writeContactSheets(
    records.filter(
      (record) =>
        record.inspection.reviewReasons.length > 0 &&
        [
          "excluded_uncertain_truth",
          "excluded_unreadable",
          "excluded_usage_or_provenance_concern",
          "excluded_other",
        ].includes(record.status),
    ),
    "human-review-queue",
  );
  console.log(`Wrote ${relRepo(OUT_MANIFEST)}`);
  console.log(`Wrote ${relRepo(OUT_DIR)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
