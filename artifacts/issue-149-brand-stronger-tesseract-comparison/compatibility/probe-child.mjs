// Compatibility diagnostic ONLY. Uses a synthetic image; touches no corpus crop,
// reads no Brand truth, and produces no experimental evidence.
import sharp from "sharp";
const [, , langPath, legacyCoreFlag] = process.argv;
const legacyCore = legacyCoreFlag === "true";
const svg = Buffer.from(
  `<svg width="420" height="120" xmlns="http://www.w3.org/2000/svg">
     <rect width="420" height="120" fill="#ffffff"/>
     <text x="20" y="80" font-size="64" font-family="Helvetica, Arial, sans-serif" fill="#000000">SYNTHETIC</text>
   </svg>`,
);
const png = await sharp(svg).png().toBuffer();
const t = await import("tesseract.js");
const { simd, relaxedSimd } = await import("wasm-feature-detect");
const out = {
  langPath,
  legacyCore,
  simd: await simd(),
  relaxedSimd: await relaxedSimd(),
  initialized: false,
  producedWords: null,
  error: null,
};
try {
  const worker = await t.createWorker("eng", 1, {
    langPath,
    gzip: false,
    cacheMethod: "none",
    legacyCore,
    logger: () => {},
    errorHandler: () => {},
  });
  out.initialized = true;
  await worker.setParameters({ tessedit_pageseg_mode: "11" });
  const r = await worker.recognize(png, {}, { blocks: true });
  out.producedWords = (r.data.blocks ?? [])
    .flatMap((b) => b.paragraphs ?? [])
    .flatMap((p) => p.lines ?? [])
    .flatMap((l) => l.words ?? []).length;
  await worker.terminate();
} catch (e) {
  out.error = e instanceof Error ? e.message : String(e);
}
console.log(JSON.stringify(out));
