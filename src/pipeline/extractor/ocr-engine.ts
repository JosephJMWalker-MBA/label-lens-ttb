import { existsSync } from "node:fs";
import path from "node:path";

import type { PrecheckDiagnosticTrace } from "@/shared/precheck-diagnostics";

import type { OcrWord } from "./extractor.types";

/**
 * A strictly local Tesseract adapter.
 *
 * Language data is vendored in the repo and the WASM core is resolved from
 * node_modules, so no traineddata, core, or worker asset is fetched over the
 * network at runtime. tesseract.js is imported dynamically so that pure
 * (non-OCR) code paths and tests never load the engine.
 *
 * Asset paths are resolved at runtime against the deployment application root
 * (`process.cwd()`), NOT against `import.meta.url`. The bundler compiles
 * `import.meta.url` into the build machine's absolute checkout path, which is
 * invalid once the production output is copied elsewhere or packaged for a
 * serverless runtime. Next's file tracing copies the vendored assets to the
 * same repo-relative location under the deployment root, so a cwd-anchored,
 * existence-verified lookup stays valid after relocation.
 */

/** File name of the vendored Tesseract English language data. */
const TRAINEDDATA = "eng.traineddata";
/** Repo-/trace-relative directory holding the vendored language data. */
const TRACED_ASSET_DIR = path.join("src", "pipeline", "extractor", "assets");
/** Repo-/trace-relative directory of the locally packaged Tesseract WASM core. */
const CORE_DIR = path.join("node_modules", "tesseract.js-core");
/** A core binary that is always present; used to verify the core directory. */
const CORE_MARKER = "tesseract-core.wasm";
/** Optional explicit overrides for operators who stage assets elsewhere. */
const ASSET_DIR_ENV = "LABEL_LENS_OCR_ASSET_DIR";
const CORE_DIR_ENV = "LABEL_LENS_OCR_CORE_DIR";

/** Build a deployment-relative candidate list rooted at the runtime app root. */
function candidateDirs(envName: string, tracedRelative: string): string[] {
  const dirs: string[] = [];
  const override = process.env[envName];
  if (override && override.trim() !== "") dirs.push(override);
  dirs.push(path.join(process.cwd(), tracedRelative));
  return dirs;
}

/**
 * Resolve the directory holding the vendored `eng.traineddata` from a
 * deployment-relative, existence-verified location. Throws (never returns a
 * guessed path) when the asset is genuinely absent, so the caller surfaces a
 * typed, path-free failure rather than a silent network fetch.
 */
export function resolveLangPath(): string {
  for (const dir of candidateDirs(ASSET_DIR_ENV, TRACED_ASSET_DIR)) {
    if (existsSync(path.join(dir, TRAINEDDATA))) return dir;
  }
  throw new Error(
    `Vendored OCR language data (${TRAINEDDATA}) was not found in any deployment-relative asset directory.`,
  );
}

/**
 * Resolve the local Tesseract WASM core directory relative to the deployment
 * application root, so a relocated build finds the copied `tesseract.js-core`
 * package rather than the original checkout's node_modules.
 *
 * This uses a cwd-anchored path rather than `require.resolve` on purpose: the
 * bundler drops `node:module` `createRequire` from the server bundle, which
 * would leave `require.resolve` undefined at runtime.
 */
export function resolveCorePath(): string {
  for (const dir of candidateDirs(CORE_DIR_ENV, CORE_DIR)) {
    if (existsSync(path.join(dir, CORE_MARKER))) return dir;
  }
  throw new Error(
    "Local Tesseract WASM core was not found in any deployment-relative node_modules directory.",
  );
}

async function resolveWorkerPath(): Promise<string> {
  const mod = await import("tesseract.js/src/worker/node/defaultOptions.js");
  const options = (mod.default ?? mod) as { workerPath?: unknown };
  const workerPath = typeof options.workerPath === "string" ? options.workerPath : "";
  if (workerPath && existsSync(workerPath)) return workerPath;
  throw new Error("Local Tesseract worker script could not be resolved.");
}

export interface OcrEngine {
  /** Recognize words in a preprocessed PNG buffer at the given page-seg mode. */
  recognizeWords(png: Buffer, pageSegMode: number): Promise<OcrWord[]>;
  terminate(): Promise<void>;
}

/** Page-seg modes used by the region strategy (Tesseract PSM values). */
export const PAGE_SEG = { SPARSE_TEXT: 11, SINGLE_LINE: 7 } as const;

export async function createLocalOcrEngine(
  diagnostics?: PrecheckDiagnosticTrace,
): Promise<OcrEngine> {
  let tesseract;
  try {
    tesseract = await import("tesseract.js");
  } catch (cause) {
    diagnostics?.fail("tesseract-worker-initialized", {
      layer: "ocr",
      code: "OCR_LIBRARY_UNAVAILABLE",
      issues: [cause instanceof Error ? cause.message : String(cause)],
    });
    throw cause;
  }

  let langPath: string;
  try {
    langPath = resolveLangPath();
  } catch (cause) {
    diagnostics?.fail("ocr-language-data-resolved", {
      layer: "ocr",
      code: "OCR_LANGUAGE_DATA_UNAVAILABLE",
      issues: [cause instanceof Error ? cause.message : String(cause)],
    });
    throw cause;
  }
  diagnostics?.reach("ocr-language-data-resolved", undefined, { once: true });

  let corePath: string;
  try {
    corePath = resolveCorePath();
  } catch (cause) {
    diagnostics?.fail("ocr-core-resolved", {
      layer: "ocr",
      code: "OCR_CORE_UNAVAILABLE",
      issues: [cause instanceof Error ? cause.message : String(cause)],
    });
    throw cause;
  }
  diagnostics?.reach("ocr-core-resolved", undefined, { once: true });

  try {
    await resolveWorkerPath();
  } catch (cause) {
    diagnostics?.fail("ocr-worker-script-resolved", {
      layer: "ocr",
      code: "OCR_WORKER_SCRIPT_UNAVAILABLE",
      issues: [cause instanceof Error ? cause.message : String(cause)],
    });
    throw cause;
  }
  diagnostics?.reach("ocr-worker-script-resolved", undefined, { once: true });

  // OEM 1 = LSTM only. All asset paths are local; nothing is downloaded.
  let worker;
  try {
    worker = await tesseract.createWorker("eng", 1, {
      langPath,
      gzip: false,
      cacheMethod: "none",
      corePath,
      logger: () => {},
      errorHandler: () => {},
    });
  } catch (cause) {
    diagnostics?.fail("tesseract-worker-initialized", {
      layer: "ocr",
      code: "OCR_WORKER_INIT_FAILED",
      issues: [cause instanceof Error ? cause.message : String(cause)],
    });
    throw cause;
  }
  diagnostics?.reach("tesseract-worker-initialized", undefined, { once: true });

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
