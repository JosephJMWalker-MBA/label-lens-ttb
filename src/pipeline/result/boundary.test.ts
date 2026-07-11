import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ADVISORY_NOTICE } from "./advisory-notice";
import { RESULT_DISPOSITION_DECISIONS } from "./result.types";

const DIR = join(process.cwd(), "src/pipeline/result");
const SOURCE_FILES = readdirSync(DIR).filter(
  (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.endsWith(".fixtures.ts"),
);

function sourceOf(file: string): string {
  return readFileSync(join(DIR, file), "utf8");
}

function importsOf(source: string): string[] {
  return [...source.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
}

describe("result module boundary", () => {
  it("imports no PDF, download/file-writing, UI, API, OCR, or external-AI dependency", () => {
    for (const file of SOURCE_FILES) {
      for (const path of importsOf(sourceOf(file))) {
        expect(path).not.toMatch(
          /pdfkit|jspdf|pdf-lib|puppeteer|node:fs|fs\/promises|axios|node-fetch|openai|@anthropic|react|next\/|\/ui\b|api\/|extractor|ocr-engine|tesseract/,
        );
      }
    }
  });

  it("declares no overall status, percentage, readiness/compliance score, or timing field", () => {
    for (const file of SOURCE_FILES) {
      const source = sourceOf(file);
      expect(source).not.toMatch(
        /overallStatus|compliancePercentage|readinessScore|complianceScore|aggregateScore|stageTimings|processingMs|durationMs|elapsedMs/,
      );
    }
  });

  it("uses only internal-workflow disposition decisions, never government authority", () => {
    for (const decision of RESULT_DISPOSITION_DECISIONS) {
      expect(decision).not.toMatch(/ttb|approved|rejected|compliant|certified/i);
    }
  });

  it("advisory notice disclaims TTB approval and legal determination", () => {
    expect(ADVISORY_NOTICE.text).toMatch(/not a TTB approval/i);
    expect(ADVISORY_NOTICE.text).toMatch(/legal opinion|regulatory disposition/i);
    expect(ADVISORY_NOTICE.noticeVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("emits no government-approval decision tokens in source", () => {
    for (const file of SOURCE_FILES) {
      const source = sourceOf(file);
      expect(source).not.toMatch(/approved_by_ttb|"rejected"|"compliant"|"noncompliant"/);
    }
  });
});
