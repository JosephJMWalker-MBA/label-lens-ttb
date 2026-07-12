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
 * Full-corpus evaluation report generator.
 *
 * This is a tool, not a CI test: it runs the REAL extractor over every
 * included evaluation case (heavy, minutes of OCR) and writes the committed
 * full-corpus report. The historical `eval:baseline` command name is retained
 * for now. It is skipped unless EVAL_BASELINE=1, so the normal suite never
 * pays its cost. Regenerate with: `npm run eval:baseline`.
 */

const RUN = process.env.EVAL_BASELINE === "1";
const OUTPUT_DIR = join(process.cwd(), "docs/extraction-full-corpus");

(RUN ? describe : describe.skip)("full-corpus extraction evaluation generation", () => {
  it(
    "runs the real extractor on every included case and writes the full-corpus report",
    async () => {
      const manifest = loadEvalManifest();
      const cases: CaseReport[] = [];
      for (const evalCase of manifest.cases) {
        // Sequential: bound peak memory and keep OCR workers from contending.
        cases.push(await runCase(evalCase));
      }
      const report = buildReport(cases, manifest);

      mkdirSync(OUTPUT_DIR, { recursive: true });
      writeFileSync(
        join(OUTPUT_DIR, "extractor-report.json"),
        `${JSON.stringify({ ...report, liveBaseline: LIVE_BASELINE }, null, 2)}\n`,
      );
      writeFileSync(
        join(OUTPUT_DIR, "extractor-report.md"),
        `${renderMarkdown(report).trimEnd()}\n`,
      );

      expect(report.cases.length).toBe(manifest.cases.length);
    },
    20 * 60_000,
  );
});
