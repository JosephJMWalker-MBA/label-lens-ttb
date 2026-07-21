/** READ-ONLY cost probe: time the two bounded re-reads for every OBSERVED case. */
import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { createLocalOcrEngine } from "@/pipeline/extractor/ocr-engine";

const R = JSON.parse(
  readFileSync("artifacts/alcohol-corroborated-contradiction/reread-evidence.json", "utf8"),
);
const M = JSON.parse(readFileSync("src/fixtures/eval/eval-manifest.json", "utf8"));

async function main() {
  const engine = await createLocalOcrEngine();
  const rows: any[] = [];
  for (const r of R) {
    if (!r.eligible || r.alcohol.state !== "OBSERVED") continue;
    const img = M.records.find((m: any) => m.caseId === r.caseId).imagePath;
    const t0 = performance.now();
    const png = await sharp(img)
      .extract(r.cropA.region)
      .resize({ width: Math.max(1, Math.round(r.cropA.region.width * 3)), kernel: "cubic" })
      .grayscale()
      .normalise()
      .png()
      .toBuffer();
    const tPre = performance.now() - t0;
    const t1 = performance.now();
    await engine.recognizeWords(png, 8);
    const ms8 = performance.now() - t1;
    const t2 = performance.now();
    await engine.recognizeWords(png, 11);
    const ms11 = performance.now() - t2;
    rows.push({
      caseId: r.caseId,
      cropPx: r.cropA.region.width * r.cropA.region.height,
      preprocessMs: Math.round(tPre),
      ocrPsm8Ms: Math.round(ms8),
      ocrPsm11Ms: Math.round(ms11),
      totalAddedMs: Math.round(tPre + ms8 + ms11),
      baselineLatencyMs: r.alcohol.latencyMs ?? null,
    });
  }
  await engine.terminate();
  writeFileSync(
    "artifacts/alcohol-corroborated-contradiction/latency-probe.json",
    JSON.stringify(rows, null, 2) + "\n",
  );
  const t = rows.map((x) => x.totalAddedMs).sort((a, b) => a - b);
  const p = (q: number) => t[Math.min(t.length - 1, Math.floor(t.length * q))];
  console.log(`eligible=${rows.length} addedOcrCalls=${rows.length * 2}`);
  console.log(
    `added ms per eligible case: min=${t[0]} median=${p(0.5)} p95=${p(0.95)} max=${t.at(-1)}`,
  );
  console.log(`total added ms across corpus: ${t.reduce((a, b) => a + b, 0)}`);
}
void main();
