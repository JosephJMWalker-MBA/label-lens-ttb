import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const DIR = join(process.cwd(), "src/features/precheck");
const SOURCE_FILES = readdirSync(DIR).filter(
  (f) => (f.endsWith(".ts") || f.endsWith(".tsx")) && !f.includes(".test."),
);

function sourceOf(file: string): string {
  return readFileSync(join(DIR, file), "utf8");
}

function importsOf(source: string): string[] {
  return [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

describe("browser component boundary", () => {
  it("imports no Node-only OCR/image/extractor/filesystem module", () => {
    for (const file of SOURCE_FILES) {
      for (const path of importsOf(sourceOf(file))) {
        expect(path).not.toMatch(
          /^sharp$|tesseract|traineddata|node:fs|node:crypto|node:path|fs\/promises|pipeline\/extractor|precheck-service$|pdfkit|jspdf|pdf-lib/,
        );
      }
    }
  });

  it("only imports the server response as a type, never the service implementation", () => {
    for (const file of SOURCE_FILES) {
      const source = sourceOf(file);
      // Any reference to the server module must be a type-only import.
      const serverImports = [
        ...source.matchAll(/^import\s+(type\s+)?[^;]*from\s+["']@\/server\/[^"']+["']/gm),
      ];
      for (const match of serverImports) {
        expect(match[1]).toBe("type ");
      }
    }
  });

  it("references no absolute paths, logs, timings, or environment diagnostics", () => {
    for (const file of SOURCE_FILES) {
      const source = sourceOf(file);
      expect(source).not.toMatch(
        /\/Users\/|\/home\/|process\.env|console\.(log|error)|durationMs|performance\.now/,
      );
    }
  });

  it("contains no append-signing implementation or secret reference", () => {
    for (const file of SOURCE_FILES) {
      const source = sourceOf(file);
      // The browser only carries the opaque token string through as
      // `response.appendToken` — never any HMAC, secret, or signing module.
      expect(source).not.toMatch(/createHmac|LABEL_LENS_APPEND_SIGNING_KEY|append-token/i);
      for (const path of importsOf(source)) {
        expect(path).not.toMatch(/append-token/);
      }
    }
  });
});
