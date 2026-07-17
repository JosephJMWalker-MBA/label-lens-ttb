// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPrecheckDiagnosticTrace } from "@/shared/precheck-diagnostics";

import { createLocalOcrEngine, resolveLangPath, resolveCorePath } from "./ocr-engine";

const MOCKS = vi.hoisted(() => ({
  workerPathInspectionFails: false,
  createWorker: vi.fn(),
}));

vi.mock("tesseract.js", () => ({ createWorker: MOCKS.createWorker }));
vi.mock("tesseract.js/src/worker/node/defaultOptions.js", () => ({
  default: {
    get workerPath() {
      if (MOCKS.workerPathInspectionFails) throw new Error("worker probe failed");
      return process.execPath;
    },
  },
}));

const ORIGINAL_CWD = process.cwd();
const CLEANUP: string[] = [];

function successfulWorker() {
  return {
    setParameters: vi.fn().mockResolvedValue(undefined),
    recognize: vi.fn().mockResolvedValue({ data: { blocks: [] } }),
    terminate: vi.fn().mockResolvedValue(undefined),
  };
}

beforeEach(() => {
  MOCKS.workerPathInspectionFails = false;
  MOCKS.createWorker.mockReset().mockResolvedValue(successfulWorker());
});

afterEach(() => {
  process.chdir(ORIGINAL_CWD);
  delete process.env.LABEL_LENS_OCR_ASSET_DIR;
  delete process.env.LABEL_LENS_OCR_CORE_DIR;
  delete process.env.LABEL_LENS_PRECHECK_DIAGNOSTICS;
  while (CLEANUP.length) rmSync(CLEANUP.pop()!, { recursive: true, force: true });
  vi.restoreAllMocks();
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

describe("diagnostic worker-script inspection", () => {
  it("does not inspect worker defaults when diagnostics are disabled", async () => {
    MOCKS.workerPathInspectionFails = true;

    const engine = await createLocalOcrEngine();

    expect(MOCKS.createWorker).toHaveBeenCalledOnce();
    await engine.terminate();
  });

  it("records probe-only unavailability without changing successful worker creation", async () => {
    process.env.LABEL_LENS_PRECHECK_DIAGNOSTICS = "1";
    MOCKS.workerPathInspectionFails = true;
    const writes: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });

    const engine = await createLocalOcrEngine(createPrecheckDiagnosticTrace());

    expect(MOCKS.createWorker).toHaveBeenCalledOnce();
    const probe = writes
      .map((line) => JSON.parse(line.replace(/^PRECHECK_DIAGNOSTIC /, "").trim()))
      .find((event) => event.boundary === "ocr-worker-script-resolved");
    expect(probe).toMatchObject({
      status: "probe-unavailable",
      error: { code: "OCR_WORKER_SCRIPT_PROBE_UNAVAILABLE" },
    });
    expect(writes.join("\n")).not.toContain("OCR_WORKER_INIT_FAILED");
    await engine.terminate();
  });

  it("preserves the original createWorker failure with diagnostics disabled or enabled", async () => {
    const workerFailure = new Error("original createWorker failure");
    MOCKS.workerPathInspectionFails = true;
    MOCKS.createWorker.mockRejectedValue(workerFailure);

    await expect(createLocalOcrEngine()).rejects.toBe(workerFailure);

    process.env.LABEL_LENS_PRECHECK_DIAGNOSTICS = "1";
    const writes: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      writes.push(String(chunk));
      return true;
    });
    await expect(createLocalOcrEngine(createPrecheckDiagnosticTrace())).rejects.toBe(workerFailure);

    expect(MOCKS.createWorker).toHaveBeenCalledTimes(2);
    expect(writes.join("\n")).toContain("OCR_WORKER_SCRIPT_PROBE_UNAVAILABLE");
    expect(writes.join("\n")).toContain("OCR_WORKER_INIT_FAILED");
  });
});
