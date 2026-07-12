// @vitest-environment node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runCase } from "./eval-harness";
import { loadEvalManifest } from "./eval-loader";
import type { CaseReport } from "./eval-report.types";
import { LIVE_BASELINE } from "./live-baseline";
import { buildReport, renderMarkdown } from "./report";

/**
 * Baseline report generator.
 *
 * This is a tool, not a CI test: it runs the REAL extractor over every
 * evaluation case (heavy, minutes of OCR) and writes the committed baseline
 * report. It is skipped unless EVAL_BASELINE=1, so the normal suite never pays
 * its cost. Regenerate with: `npm run eval:baseline`.
 */

const RUN = process.env.EVAL_BASELINE === "1";
const OUTPUT_DIR = join(process.cwd(), "docs/extraction-baseline");

(RUN ? describe : describe.skip)("extraction baseline generation", () => {
  it(
    "runs the real extractor on every case and writes the baseline report",
    async () => {
      const manifest = loadEvalManifest();
      const cases: CaseReport[] = [];
      for (const evalCase of manifest.cases) {
        // Sequential: bound peak memory and keep OCR workers from contending.
        cases.push(await runCase(evalCase));
      }
      const report = buildReport(cases, manifest.schemaVersion);

      mkdirSync(OUTPUT_DIR, { recursive: true });
      writeFileSync(
        join(OUTPUT_DIR, "report.json"),
        `${JSON.stringify({ ...report, liveBaseline: LIVE_BASELINE }, null, 2)}\n`,
      );
      writeFileSync(join(OUTPUT_DIR, "report.md"), `${renderMarkdown(report).trimEnd()}\n`);

      expect(report.cases.length).toBe(manifest.cases.length);
    },
    20 * 60_000,
  );
});
