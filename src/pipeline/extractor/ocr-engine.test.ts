// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveLangPath, resolveCorePath } from "./ocr-engine";

const ORIGINAL_CWD = process.cwd();
const CLEANUP: string[] = [];

afterEach(() => {
  process.chdir(ORIGINAL_CWD);
  delete process.env.LABEL_LENS_OCR_ASSET_DIR;
  delete process.env.LABEL_LENS_OCR_CORE_DIR;
  while (CLEANUP.length) rmSync(CLEANUP.pop()!, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "ocr-resolve-"));
  CLEANUP.push(dir);
  return dir;
}

describe("resolveLangPath — deployment-relative, existence-verified", () => {
  it("resolves the vendored assets under the runtime app root by default", () => {
    const resolved = resolveLangPath();
    expect(resolved).toBe(path.join(process.cwd(), "src", "pipeline", "extractor", "assets"));
    expect(readFileSync(path.join(resolved, "eng.traineddata")).byteLength).toBeGreaterThan(0);
  });

  it("honors an explicit deployment-relative override", () => {
    const dir = tempDir();
    writeFileSync(path.join(dir, "eng.traineddata"), "x");
    process.env.LABEL_LENS_OCR_ASSET_DIR = dir;
    expect(resolveLangPath()).toBe(dir);
  });

  it("throws a path-free error when the language data is genuinely absent", () => {
    const empty = tempDir();
    process.chdir(empty); // no src/pipeline/extractor/assets here, no override
    try {
      resolveLangPath();
      throw new Error("expected resolveLangPath to throw");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      expect(message).toMatch(/eng\.traineddata/);
      // No absolute checkout/home path is leaked in the error.
      expect(message).not.toMatch(/\/Users\/|\/home\/|\/var\/folders\//);
    }
  });
});

describe("resolveCorePath — deployment-relative, existence-verified", () => {
  it("resolves the local Tesseract core under the runtime app root by default", () => {
    const resolved = resolveCorePath();
    expect(resolved).toBe(path.join(process.cwd(), "node_modules", "tesseract.js-core"));
    expect(readFileSync(path.join(resolved, "tesseract-core.wasm")).byteLength).toBeGreaterThan(0);
  });

  it("honors an explicit override and throws (path-free) when the core is absent", () => {
    const dir = tempDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "tesseract-core.wasm"), "x");
    process.env.LABEL_LENS_OCR_CORE_DIR = dir;
    expect(resolveCorePath()).toBe(dir);

    delete process.env.LABEL_LENS_OCR_CORE_DIR;
    process.chdir(tempDir());
    expect(() => resolveCorePath()).toThrow(/Tesseract WASM core/);
  });
});

describe("ocr-engine source is offline and free of build-machine paths", () => {
  const source = readFileSync(
    path.join(ORIGINAL_CWD, "src/pipeline/extractor/ocr-engine.ts"),
    "utf8",
  );

  it("does not derive asset paths from import.meta.url or createRequire", () => {
    // Check call sites, not the explanatory comments: the bundler bakes
    // fileURLToPath(import.meta.url) into an absolute build-machine path and
    // drops createRequire(...) from the server bundle.
    expect(source).not.toMatch(/fileURLToPath\(\s*import\.meta\.url/);
    expect(source).not.toMatch(/createRequire\(/);
    expect(source).not.toMatch(/from\s+["']node:module["']/);
  });

  it("resolves against the runtime app root and verifies existence", () => {
    expect(source).toMatch(/process\.cwd\(\)/);
    expect(source).toMatch(/existsSync/);
  });

  it("performs no network fetch and forces local, non-cached asset loading", () => {
    expect(source).not.toMatch(/https?:\/\/|fetch\(|cdn|unpkg|jsdelivr|tessdata.*http/i);
    expect(source).toMatch(/cacheMethod:\s*"none"/);
    expect(source).toMatch(/gzip:\s*false/);
  });
});
