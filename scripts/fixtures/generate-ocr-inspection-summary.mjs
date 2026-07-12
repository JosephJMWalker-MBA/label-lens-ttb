import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";
import { createWorker } from "tesseract.js";

const REPO_ROOT = process.cwd();
const MANIFEST_PATH = path.join(REPO_ROOT, "src/fixtures/eval/eval-manifest.json");
const OUT_DIR = path.join(REPO_ROOT, "docs/extraction-full-corpus");
const OUT_JSONL = path.join(OUT_DIR, "ocr-summary.jsonl");
const OUT_MD = path.join(OUT_DIR, "ocr-summary.md");
const TRAINEDDATA_DIR = path.join(REPO_ROOT, "src/pipeline/extractor/assets");
const CORE_PATH = path.join(REPO_ROOT, "node_modules/tesseract.js-core");

function midY(word) {
  return (word.bbox.y0 + word.bbox.y1) / 2;
}

function lineText(words) {
  return words
    .map((word) => word.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function groupLines(words) {
  const ordered = [...words].sort((a, b) => midY(a) - midY(b) || a.bbox.x0 - b.bbox.x0);
  const lines = [];
  const tolerance = 22;
  for (const word of ordered) {
    const y = midY(word);
    let line = lines.find((candidate) => Math.abs(midY(candidate[0]) - y) <= tolerance);
    if (!line) {
      line = [];
      lines.push(line);
    }
    line.push(word);
  }
  return lines.map((line) => line.sort((a, b) => a.bbox.x0 - b.bbox.x0));
}

function alcoholPreview(lines) {
  return lines
    .map((line) => lineText(line))
    .filter((text) => /(\d{1,2}(?:[.,]\d{1,2})?\s*%|ALC\.?|BY VOL|VOL\.?|alcohol)/i.test(text))
    .slice(0, 6);
}

async function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const wineRecords = manifest.records
    .filter((record) => record.beverageCategory === "wine")
    .sort((a, b) => a.caseId.localeCompare(b.caseId));

  const worker = await createWorker("eng", 1, {
    langPath: TRAINEDDATA_DIR,
    corePath: CORE_PATH,
    gzip: false,
    cacheMethod: "none",
    logger: () => {},
    errorHandler: () => {},
  });
  await worker.setParameters({ tessedit_pageseg_mode: "11" });

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_JSONL, "");

  const markdown = [
    "# OCR Inspection Summary",
    "",
    "Bounded local OCR preview over every wine-classified image in the corpus-scale manifest.",
    "",
  ];

  for (const [index, record] of wineRecords.entries()) {
    const imagePath = path.join(REPO_ROOT, record.imagePath);
    const png = await sharp(imagePath)
      .flatten({ background: "#ffffff" })
      .resize({ width: 1400, withoutEnlargement: true })
      .png()
      .toBuffer();
    const result = await worker.recognize(png, {}, { blocks: true });
    const words = [];
    for (const block of result.data.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const line of paragraph.lines ?? []) {
          for (const word of line.words ?? []) {
            if (!word.text || !word.text.trim()) continue;
            words.push({
              text: word.text.trim(),
              bbox: { x0: word.bbox.x0, y0: word.bbox.y0, x1: word.bbox.x1, y1: word.bbox.y1 },
            });
          }
        }
      }
    }

    const grouped = groupLines(words);
    const linePreview = grouped
      .map((line) => lineText(line))
      .filter((line) => line.length > 0)
      .slice(0, 18);
    const alcoholLines = alcoholPreview(grouped);
    const row = {
      caseId: record.caseId,
      imagePath: record.imagePath,
      beverageCategory: record.beverageCategory,
      status: record.status,
      linePreview,
      alcoholPreview: alcoholLines,
    };
    writeFileSync(OUT_JSONL, `${JSON.stringify(row)}\n`, { flag: "a" });

    markdown.push(`## ${record.caseId}`);
    markdown.push("");
    markdown.push(`- Status: \`${record.status}\``);
    markdown.push(`- Image: \`${record.imagePath}\``);
    markdown.push(`- First lines: ${linePreview.slice(0, 8).join(" | ") || "none"}`);
    markdown.push(`- Alcohol-like lines: ${alcoholLines.join(" | ") || "none"}`);
    markdown.push("");
    console.error(`${index + 1}/${wineRecords.length} ${record.caseId}`);
  }

  await worker.terminate();
  writeFileSync(OUT_MD, `${markdown.join("\n")}\n`);
  console.log(`Wrote ${path.relative(REPO_ROOT, OUT_JSONL)}`);
  console.log(`Wrote ${path.relative(REPO_ROOT, OUT_MD)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
