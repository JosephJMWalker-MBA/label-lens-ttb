import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { assemblePrecheckResult } from "@/pipeline/result/assemble";
import { buildAssembleInput } from "@/pipeline/result/build.fixtures";

import { buildJsonExport } from "./build-json-export";
import { serializeExportCanonical } from "./canonical-json";
import type { PrecheckJsonExport } from "./json-export.types";

const DIR = join(process.cwd(), "src/pipeline/export/json");
const SOURCE_FILES = readdirSync(DIR).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));

function sourceOf(file: string): string {
  return readFileSync(join(DIR, file), "utf8");
}

function importsOf(source: string): string[] {
  return [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

function exportObject(): PrecheckJsonExport {
  const r = assemblePrecheckResult(buildAssembleInput());
  if (!r.ok) throw new Error("assembly failed");
  const e = buildJsonExport(r.value);
  if (!e.ok) throw new Error("export failed");
  return e.value;
}

describe("export module boundary", () => {
  it("writes no files and imports no download, PDF, UI, API, OCR, rule-exec, or network module", () => {
    for (const file of SOURCE_FILES) {
      for (const path of importsOf(sourceOf(file))) {
        expect(path).not.toMatch(
          /node:fs|fs\/promises|pdfkit|jspdf|pdf-lib|puppeteer|react|next\/|\/ui\b|api\/|extractor|ocr-engine|tesseract|orchestrator|registry|axios|node-fetch|openai|@anthropic/,
        );
      }
    }
  });

  it("uses no current time or randomness in source", () => {
    for (const file of SOURCE_FILES) {
      const source = sourceOf(file);
      expect(source).not.toMatch(
        /Date\.now|new Date\(|Math\.random|crypto\.randomUUID|performance\.now/,
      );
    }
  });

  it("emits no environment-specific paths, usernames, or diagnostics in output", () => {
    const serialized = serializeExportCanonical(exportObject());
    expect(serialized).not.toMatch(
      /\/Users\/|\/home\/|C:\\\\|process\.env|NODE_ENV|HOME=|USERNAME/,
    );
    expect(serialized).not.toMatch(/durationMs|elapsedMs|"log"|stack/i);
  });

  it("introduces no overall status, percentage, readiness/compliance score, or government disposition", () => {
    const serialized = serializeExportCanonical(exportObject());
    for (const banned of [
      "overallStatus",
      "compliancePercentage",
      "readinessScore",
      "complianceScore",
      "aggregateScore",
      "approved_by_ttb",
    ]) {
      expect(serialized).not.toContain(banned);
    }
  });

  it("includes no image or model bytes and keeps only bounded observations", () => {
    const e = exportObject();
    const serialized = serializeExportCanonical(e);
    // No base64 blobs / data URIs / traineddata references.
    expect(serialized).not.toMatch(/data:image|base64|traineddata|\.wasm/);
    // Only the two bounded fields are present as observations.
    expect(Object.keys(e.observations).sort()).toEqual([
      "alcoholStatement",
      "brandName",
      "provenance",
    ]);
  });
});
