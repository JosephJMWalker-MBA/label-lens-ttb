#!/usr/bin/env node
/**
 * Issue #149 Attempt 3 — deterministic synthetic sentinel generation.
 *
 * Harness correction 2. Attempt 2's positive sentinel ended in `9`, which both
 * models read as `H`. The new sentinel is `LABEL LENS 123`, whose digits are
 * built from unambiguous rectangle strokes.
 *
 * Glyphs are rasterised from explicit integer-coordinate rectangles straight
 * into a raw RGB buffer: no system font, no SVG renderer, no corpus-derived
 * pixels. Only PNG encoding is delegated to sharp.
 *
 * Generates both images twice and refuses to write unless the two independent
 * generations are byte-identical.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

const EXPERIMENT_ID = "issue-149-native-tesseract-float-compatibility-attempt-3";
const ROOT = path.join(process.cwd(), "artifacts", EXPERIMENT_ID);
const SYNTHETIC = path.join(ROOT, "synthetic");

const SENTINEL_TEXT = "LABEL LENS 123";
/** Same canvas and glyph metrics as Attempt 2, so only the digits changed. */
const CANVAS = { width: 1240, height: 220, marginX: 60, marginY: 60 };
const GLYPH = { width: 60, height: 100, stroke: 12, advance: 80 };

function glyphRects(character) {
  const { width: w, height: h, stroke: s } = GLYPH;
  const mid = Math.round((h - s) / 2);
  const right = w - s;
  switch (character) {
    case "L":
      return [
        [0, 0, s, h],
        [0, h - s, w, s],
      ];
    case "A":
      return [
        [0, 0, s, h],
        [right, 0, s, h],
        [0, 0, w, s],
        [0, mid, w, s],
      ];
    case "B":
      // Narrower top bowl than bottom bowl, so it cannot rasterise into an "8".
      return [
        [0, 0, s, h],
        [0, 0, w - 2 * s, s],
        [0, mid, w - s, s],
        [0, h - s, w - s, s],
        [w - 3 * s, 0, s, mid + s],
        [right - s, mid, s, h - mid],
      ];
    case "E":
      return [
        [0, 0, s, h],
        [0, 0, w, s],
        [0, mid, w, s],
        [0, h - s, w, s],
      ];
    case "S":
      return [
        [0, 0, w, s],
        [0, 0, s, mid + s],
        [0, mid, w, s],
        [right, mid, s, h - mid - s],
        [0, h - s, w, s],
      ];
    case "N": {
      const rects = [
        [0, 0, s, h],
        [right, 0, s, h],
      ];
      const steps = 10;
      const stepHeight = Math.floor(h / steps);
      for (let index = 0; index < steps; index += 1) {
        const x = Math.round((index * (w - s)) / (steps - 1));
        rects.push([x, index * stepHeight, s, stepHeight]);
      }
      return rects;
    }
    case "1":
      // Unchanged from Attempt 2, where it was read correctly.
      return [
        [Math.round((w - s) / 2), 0, s, h],
        [Math.round((w - s) / 2) - s, s, s, s],
        [Math.round(w / 4), h - s, Math.round(w / 2), s],
      ];
    case "2":
      // Top bar, upper-right stem, middle bar, lower-left stem, bottom bar.
      return [
        [0, 0, w, s],
        [right, 0, s, mid + s],
        [0, mid, w, s],
        [0, mid, s, h - mid],
        [0, h - s, w, s],
      ];
    case "3":
      // Three bars against a full right stem. No left stem, so it cannot be
      // confused with E, and the closed right side separates it from 2.
      return [
        [0, 0, w, s],
        [0, mid, w, s],
        [0, h - s, w, s],
        [right, 0, s, h],
      ];
    case " ":
      return [];
    default:
      throw new Error(`SYNTHETIC_GLYPH_UNDEFINED: ${character}`);
  }
}

function rasterise(text) {
  const { width, height, marginX, marginY } = CANVAS;
  const channels = 3;
  const data = Buffer.alloc(width * height * channels, 0xff);
  const paint = (rect, originX, originY) => {
    const [rx, ry, rw, rh] = rect;
    for (let y = originY + ry; y < originY + ry + rh; y += 1) {
      if (y < 0 || y >= height) continue;
      for (let x = originX + rx; x < originX + rx + rw; x += 1) {
        if (x < 0 || x >= width) continue;
        const offset = (y * width + x) * channels;
        data[offset] = 0;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
      }
    }
  };
  for (const [index, character] of [...text].entries()) {
    const originX = marginX + index * GLYPH.advance;
    for (const rect of glyphRects(character)) paint(rect, originX, marginY);
  }
  return data;
}

async function encodePng(raw) {
  return sharp(raw, { raw: { width: CANVAS.width, height: CANVAS.height, channels: 3 } })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
}

async function generate() {
  return {
    positive: await encodePng(rasterise(SENTINEL_TEXT)),
    blank: await encodePng(rasterise(" ".repeat(SENTINEL_TEXT.length))),
  };
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

async function main() {
  mkdirSync(SYNTHETIC, { recursive: true });

  const first = await generate();
  const second = await generate();
  const deterministic = first.positive.equals(second.positive) && first.blank.equals(second.blank);
  if (!deterministic) {
    throw new Error("SYNTHETIC_REGENERATION_NOT_DETERMINISTIC");
  }

  writeFileSync(path.join(SYNTHETIC, "positive.png"), first.positive);
  writeFileSync(path.join(SYNTHETIC, "blank.png"), first.blank);
  const positiveSha = sha256(first.positive);
  const blankSha = sha256(first.blank);
  writeFileSync(path.join(SYNTHETIC, "positive.png.sha256"), `${positiveSha}  positive.png\n`);
  writeFileSync(path.join(SYNTHETIC, "blank.png.sha256"), `${blankSha}  blank.png\n`);

  const spec = {
    artifact: "synthetic-input-spec",
    experimentId: EXPERIMENT_ID,
    attempt: 3,
    harnessCorrection:
      "Attempt 2's sentinel ended in 9, which both models read as H. The digits are now 1, 2 and 3, each built from unambiguous rectangle strokes. Letters are unchanged from Attempt 2, where all of them were read correctly.",
    generator: "scripts/eval/issue-149-attempt-3-generate-inputs.mjs",
    method:
      "Explicit integer-coordinate rectangles rasterised directly into a raw RGB buffer, then PNG-encoded by sharp. No system font, no SVG renderer, no corpus-derived pixels.",
    fontIdentity: "none — vector rectangle strokes defined in glyphRects()",
    canvas: CANVAS,
    glyphMetrics: GLYPH,
    pngEncoding: { compressionLevel: 9, adaptiveFiltering: false, palette: false },
    sharpVersion: sharp.versions.sharp,
    deterministicRegenerationVerified: deterministic,
    expectedPositiveTranscript: SENTINEL_TEXT,
    expectedBlankTranscript: "",
    images: [
      {
        name: "positive.png",
        kind: "positive sentinel",
        text: SENTINEL_TEXT,
        rotationDegrees: 0,
        stylized: false,
        sha256: positiveSha,
        byteSize: first.positive.length,
      },
      {
        name: "blank.png",
        kind: "blank negative",
        text: null,
        rotationDegrees: 0,
        stylized: false,
        sha256: blankSha,
        byteSize: first.blank.length,
        note: "identical dimensions and background to the positive image, with no glyphs painted",
      },
    ],
  };
  writeFileSync(path.join(ROOT, "synthetic-input-spec.json"), `${JSON.stringify(spec, null, 2)}\n`);

  console.log(
    JSON.stringify(
      {
        deterministic,
        positiveSha,
        blankSha,
        positiveBytes: first.positive.length,
        blankBytes: first.blank.length,
      },
      null,
      2,
    ),
  );
}

main();
