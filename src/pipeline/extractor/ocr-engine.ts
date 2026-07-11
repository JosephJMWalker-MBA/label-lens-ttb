import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { OcrWord } from "./extractor.types";

/**
 * A strictly local Tesseract adapter.
 *
 * Language data is vendored beside this module and the WASM core is resolved
 * from node_modules, so no traineddata, core, or worker asset is fetched over
 * the network at runtime. tesseract.js is imported dynamically so that pure
 * (non-OCR) code paths and tests never load the engine.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Directory holding the vendored `eng.traineddata`. */
export const LANG_PATH = path.join(HERE, "assets");

export interface OcrEngine {
  /** Recognize words in a preprocessed PNG buffer at the given page-seg mode. */
  recognizeWords(png: Buffer, pageSegMode: number): Promise<OcrWord[]>;
  terminate(): Promise<void>;
}

/** Page-seg modes used by the region strategy (Tesseract PSM values). */
export const PAGE_SEG = { SPARSE_TEXT: 11, SINGLE_LINE: 7 } as const;

export async function createLocalOcrEngine(): Promise<OcrEngine> {
  const tesseract = await import("tesseract.js");
  const require = createRequire(import.meta.url);
  const corePath = path.dirname(require.resolve("tesseract.js-core/package.json"));

  // OEM 1 = LSTM only. All asset paths are local; nothing is downloaded.
  const worker = await tesseract.createWorker("eng", 1, {
    langPath: LANG_PATH,
    gzip: false,
    cacheMethod: "none",
    corePath,
    logger: () => {},
    errorHandler: () => {},
  });

  return {
    async recognizeWords(png: Buffer, pageSegMode: number): Promise<OcrWord[]> {
      await worker.setParameters({ tessedit_pageseg_mode: String(pageSegMode) as never });
      const result = await worker.recognize(png, {}, { blocks: true });
      const words: OcrWord[] = [];
      for (const block of result.data.blocks ?? []) {
        for (const paragraph of block.paragraphs ?? []) {
          for (const line of paragraph.lines ?? []) {
            for (const word of line.words ?? []) {
              if (!word.text || !word.text.trim()) continue;
              words.push({
                text: word.text,
                rawConfidence: word.confidence,
                bbox: {
                  x0: word.bbox.x0,
                  y0: word.bbox.y0,
                  x1: word.bbox.x1,
                  y1: word.bbox.y1,
                },
              });
            }
          }
        }
      }
      return words;
    },
    async terminate() {
      await worker.terminate();
    },
  };
}
