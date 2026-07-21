/**
 * READ-ONLY OCR matrix for the two confirmed digit errors.
 *
 * Runs tesseract.js against crops of the two target labels, varying ONE dimension
 * at a time (scale, page-segmentation mode, image treatment, character
 * constraints). Uses only the vendored eng.traineddata already in the repo — no
 * download, no new dependency, no external service, no VLM.
 *
 * Production code is not imported or modified; this mirrors the production
 * preprocessing chain (grayscale + normalise, cubic resize) so "production" rows
 * are comparable to what the pipeline actually does.
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";
import { createWorker } from "tesseract.js";

const LANG_PATH = path.join(process.cwd(), "src/pipeline/extractor/assets");
const OUT = process.argv[2];
const REPEATS = Number(process.env.REPEATS ?? 3);

const TARGETS = {
  "approved-wine-018": {
    image: "tests/fixtures/precheck/approved-wine-018/label.png",
    truth: 13.5,
    // Regions in SOURCE coordinates, derived from the recorded evidence geometry.
    regions: {
      line: { left: 100, top: 415, width: 220, height: 75 },
      markerAndNumber: { left: 100, top: 420, width: 135, height: 65 },
      numberOnly: { left: 125, top: 425, width: 85, height: 58 },
      padded: { left: 85, top: 405, width: 250, height: 95 },
    },
  },
  "approved-wine-037": {
    image: "tests/fixtures/precheck/approved-wine-037/label.jpeg",
    truth: 13.0,
    regions: {
      line: { left: 110, top: 765, width: 240, height: 62 },
      markerAndNumber: { left: 140, top: 770, width: 130, height: 55 },
      numberOnly: { left: 150, top: 775, width: 120, height: 45 },
      padded: { left: 95, top: 755, width: 270, height: 80 },
    },
  },
};

/** Image treatments. `production` mirrors the live preprocessing chain. */
const TREATMENTS = {
  production: (p) => p.grayscale().normalise(),
  grayscaleOnly: (p) => p.grayscale(),
  normalise: (p) => p.grayscale().normalise(),
  linearBoost: (p) => p.grayscale().linear(1.4, -20),
  otsu: (p) => p.grayscale().normalise().threshold(),
  thresholdFixed: (p) => p.grayscale().normalise().threshold(140),
  inverted: (p) => p.grayscale().negate().normalise(),
  invertedThreshold: (p) => p.grayscale().negate().normalise().threshold(),
};

const PSMS = { sparse: 11, singleLine: 7, singleWord: 8, singleBlock: 6 };

const WHITELISTS = {
  unrestricted: null,
  numeric: "0123456789.,%",
  numericPlusMarker: "0123456789.,% AaLlCcOoHhVvBbYy",
};

function parsePercent(text) {
  const m = String(text).match(/(\d{1,2}(?:[.,]\d{1,2})?)/);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

async function render(image, region, scale, treatment) {
  let p = sharp(image).extract(region);
  const meta = await sharp(image).extract(region).metadata();
  p = p.resize({ width: Math.max(1, Math.round(meta.width * scale)), kernel: "cubic" });
  return TREATMENTS[treatment](p).png().toBuffer();
}

async function main() {
  const worker = await createWorker("eng", 1, { langPath: LANG_PATH, gzip: false });
  const rows = [];

  for (const [caseId, cfg] of Object.entries(TARGETS)) {
    for (const [regionName, region] of Object.entries(cfg.regions)) {
      for (const scale of [1.5, 2, 3, 4]) {
        for (const [psmName, psm] of Object.entries(PSMS)) {
          for (const treatment of Object.keys(TREATMENTS)) {
            for (const [wlName, wl] of Object.entries(WHITELISTS)) {
              // Keep the matrix bounded: only sweep whitelists on the production
              // treatment and the two most promising treatments.
              if (
                wlName !== "unrestricted" &&
                !["production", "otsu", "inverted"].includes(treatment)
              )
                continue;
              const buf = await render(cfg.image, region, scale, treatment);
              await worker.setParameters({
                tessedit_pageseg_mode: String(psm),
                tessedit_char_whitelist: wl ?? "",
              });
              const texts = [];
              const confs = [];
              let ms = 0;
              for (let r = 0; r < REPEATS; r += 1) {
                const t0 = Date.now();
                const { data } = await worker.recognize(buf);
                ms += Date.now() - t0;
                texts.push(data.text.replace(/\s+/g, " ").trim());
                confs.push(data.confidence);
              }
              const uniq = [...new Set(texts)];
              const parsed = parsePercent(texts[0]);
              rows.push({
                caseId,
                region: regionName,
                scale,
                psm: psmName,
                treatment,
                whitelist: wlName,
                text: texts[0],
                confidence: Math.round(confs[0] ?? 0),
                parsed,
                recoveredTruth: parsed !== null && Math.abs(parsed - cfg.truth) < 0.05,
                deterministic: uniq.length === 1,
                distinctOutputs: uniq.length,
                msPerRun: Math.round(ms / REPEATS),
              });
            }
          }
        }
      }
    }
    process.stdout.write(`  ${caseId}: ${rows.filter((r) => r.caseId === caseId).length} runs\n`);
  }

  await worker.terminate();

  const headers = Object.keys(rows[0]);
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  writeFileSync(
    path.join(OUT, "ocr-matrix.csv"),
    [headers.join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\n") +
      "\n",
  );

  const summary = {};
  for (const caseId of Object.keys(TARGETS)) {
    const mine = rows.filter((r) => r.caseId === caseId);
    const win = mine.filter((r) => r.recoveredTruth);
    summary[caseId] = {
      truth: TARGETS[caseId].truth,
      totalRuns: mine.length,
      runsRecoveringTruth: win.length,
      deterministicWins: win.filter((r) => r.deterministic).length,
      winningConfigs: win.map((r) => ({
        region: r.region,
        scale: r.scale,
        psm: r.psm,
        treatment: r.treatment,
        whitelist: r.whitelist,
        text: r.text,
        confidence: r.confidence,
        deterministic: r.deterministic,
        msPerRun: r.msPerRun,
      })),
      productionLikeRows: mine
        .filter((r) => r.treatment === "production" && r.whitelist === "unrestricted")
        .map((r) => ({
          region: r.region,
          scale: r.scale,
          psm: r.psm,
          text: r.text,
          parsed: r.parsed,
        })),
    };
  }
  writeFileSync(path.join(OUT, "ocr-matrix-summary.json"), JSON.stringify(summary, null, 2) + "\n");

  for (const [caseId, s] of Object.entries(summary)) {
    console.log(`\n=== ${caseId} (truth ${s.truth}) ===`);
    console.log(
      `  runs: ${s.totalRuns} | recovering truth: ${s.runsRecoveringTruth} | deterministic wins: ${s.deterministicWins}`,
    );
    const seen = new Set();
    for (const w of s.winningConfigs) {
      const k = `${w.region}|${w.scale}|${w.psm}|${w.treatment}|${w.whitelist}`;
      if (seen.has(k)) continue;
      seen.add(k);
      console.log(
        `   + ${w.region} x${w.scale} psm=${w.psm} ${w.treatment} wl=${w.whitelist} -> ${JSON.stringify(w.text)} conf=${w.confidence} det=${w.deterministic} ${w.msPerRun}ms`,
      );
    }
  }
}

await main();
