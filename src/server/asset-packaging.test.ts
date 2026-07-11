// @vitest-environment node
//
// Asset-packaging and route-hardening assertions for the completed slice.
//
// These fail clearly if a required runtime asset is missing, if the single
// processing route is misconfigured for Edge, or if a server-only module could
// leak into a client bundle. They add no platform-specific absolute paths.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const FIXTURE_DIR = join(ROOT, "tests/fixtures/precheck/m-cellars-24205001000905");
const OCR_FIXTURE = join(FIXTURE_DIR, "label-ocr-source.jpeg");
const TRAINEDDATA = join(ROOT, "src/pipeline/extractor/assets/eng.traineddata");

// Committed OCR-benchmark identity — kept in lockstep with the manifest and docs.
const EXPECTED_FIXTURE_SHA256 = "0b0ccec13bf6c533ec7928b017b140a0213fb4555812fea81d71872adb453713";
const EXPECTED_FIXTURE_DIMENSIONS = { pixelWidth: 2404, pixelHeight: 979 };

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("required runtime assets", () => {
  it("vendors the eng.traineddata OCR language data", () => {
    expect(existsSync(TRAINEDDATA)).toBe(true);
    expect(statSync(TRAINEDDATA).size).toBeGreaterThan(0);
  });

  it("bundles the M Cellars demonstration fixture with the expected identity", () => {
    expect(existsSync(OCR_FIXTURE)).toBe(true);
    expect(sha256(OCR_FIXTURE)).toBe(EXPECTED_FIXTURE_SHA256);
  });

  it("keeps the fixture manifest's OCR-benchmark identity in agreement with the file", () => {
    const manifest = JSON.parse(readFileSync(join(FIXTURE_DIR, "manifest.json"), "utf8"));
    expect(manifest.ocrBenchmarkDerivative.sha256).toBe(EXPECTED_FIXTURE_SHA256);
    expect(manifest.ocrBenchmarkDerivative.pixelWidth).toBe(EXPECTED_FIXTURE_DIMENSIONS.pixelWidth);
    expect(manifest.ocrBenchmarkDerivative.pixelHeight).toBe(
      EXPECTED_FIXTURE_DIMENSIONS.pixelHeight,
    );
  });
});

describe("Next.js packaging configuration", () => {
  const config = readFileSync(join(ROOT, "next.config.mjs"), "utf8");

  it("keeps the Node-only OCR/image packages external", () => {
    expect(config).toMatch(/serverExternalPackages/);
    expect(config).toMatch(/["']sharp["']/);
    expect(config).toMatch(/["']tesseract\.js["']/);
  });

  it("traces the vendored OCR assets and demo fixture for the pre-check route", () => {
    expect(config).toMatch(/outputFileTracingIncludes/);
    expect(config).toMatch(/\/api\/precheck/);
    expect(config).toMatch(/src\/pipeline\/extractor\/assets/);
    expect(config).toMatch(/label-ocr-source\.jpeg/);
  });

  it("traces the dynamically loaded Tesseract WASM core and worker script", () => {
    // These are loaded at runtime (not statically imported), so static tracing
    // misses them without an explicit include; a relocated build needs them.
    expect(config).toMatch(/tesseract\.js-core\/\*\.wasm/);
    expect(config).toMatch(/tesseract\.js\/src\/worker-script/);
  });

  it("emits a self-contained standalone server for relocatable deployment", () => {
    expect(config).toMatch(/output:\s*["']standalone["']/);
  });
});

describe("single hardened processing route", () => {
  const apiDir = join(ROOT, "src/app/api");

  function routeFiles(dir: string): string[] {
    const found: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) found.push(...routeFiles(full));
      else if (/^route\.(t|j)sx?$/.test(entry.name)) found.push(full);
    }
    return found;
  }

  it("exposes exactly one processing route: POST /api/precheck", () => {
    const routes = routeFiles(apiDir);
    expect(routes).toHaveLength(1);
    expect(routes[0]).toBe(join(apiDir, "precheck", "route.ts"));
    const source = readFileSync(routes[0], "utf8");
    expect(source).toMatch(/export\s+async\s+function\s+POST/);
  });

  it("declares the Node runtime and is not configured for Edge", () => {
    const source = readFileSync(join(apiDir, "precheck", "route.ts"), "utf8");
    expect(source).toMatch(/export\s+const\s+runtime\s*=\s*["']nodejs["']/);
    expect(source).not.toMatch(/["']edge["']/);
  });
});

describe("client bundle exclusion — no server-only module reachable from the browser feature", () => {
  const featureDir = join(ROOT, "src/features/precheck");
  const clientFiles = readdirSync(featureDir).filter(
    (f) => (f.endsWith(".ts") || f.endsWith(".tsx")) && !f.includes(".test."),
  );

  it("imports neither sharp, tesseract.js, traineddata, fs, nor the extractor/service implementation", () => {
    for (const file of clientFiles) {
      const source = readFileSync(join(featureDir, file), "utf8");
      const imports = [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
      for (const path of imports) {
        expect(path).not.toMatch(
          /^sharp$|tesseract|traineddata|^node:|fs\/promises|pipeline\/extractor|@\/server\/precheck-service$/,
        );
      }
    }
  });

  it("references the server response only as a type, never the service implementation", () => {
    for (const file of clientFiles) {
      const source = readFileSync(join(featureDir, file), "utf8");
      for (const match of source.matchAll(
        /^import\s+(type\s+)?[^;]*from\s+["']@\/server\/[^"']+["']/gm,
      )) {
        expect(match[1]).toBe("type ");
      }
    }
  });
});
