// @vitest-environment node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { format, resolveConfig } from "prettier";
import { describe, expect, it } from "vitest";

import { runCaseArtifacts } from "./eval-harness";
import { loadEvalManifest } from "./eval-loader";
import type { CaseReport } from "./eval-report.types";
import { LIVE_BASELINE } from "./live-baseline";
import {
  buildProductionAnalyzerParityFixture,
  buildProductionAnalyzerParityProof,
  ISSUE_131_BASE_COMMIT,
  PRODUCTION_PARITY_FIXTURE_PATH,
  type ProductionAnalyzerParityFixture,
  type ProductionAnalyzerParityInput,
} from "./production-parity";
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

async function writeFormattedJson(filePath: string, value: unknown) {
  const config = (await resolveConfig(filePath)) ?? {};
  const formatted = await format(JSON.stringify(value), {
    ...config,
    filepath: filePath,
    parser: "json",
  });
  writeFileSync(filePath, formatted);
}

(RUN ? describe : describe.skip)("full-corpus extraction evaluation generation", () => {
  it(
    "runs the real extractor on every included case and writes the full-corpus report",
    async () => {
      const manifest = loadEvalManifest();
      const cases: CaseReport[] = [];
      const parityInputs: ProductionAnalyzerParityInput[] = [];
      for (const evalCase of manifest.cases) {
        // Sequential: bound peak memory and keep OCR workers from contending.
        const artifacts = await runCaseArtifacts(evalCase, { semanticScene: true });
        cases.push(artifacts.report);
        parityInputs.push({
          caseId: evalCase.caseId,
          responseBytes: artifacts.productionResponseBytes,
          extractionError: artifacts.extractionError,
        });
      }
      const expectedParity = JSON.parse(
        readFileSync(PRODUCTION_PARITY_FIXTURE_PATH, "utf8"),
      ) as ProductionAnalyzerParityFixture;
      const actualParity = buildProductionAnalyzerParityFixture(
        ISSUE_131_BASE_COMMIT,
        parityInputs,
      );
      const productionParity = buildProductionAnalyzerParityProof(expectedParity, actualParity);
      expect(productionParity.status).toBe("PASS");
      expect(productionParity.mismatches).toEqual([]);
      const report = buildReport(cases, manifest, productionParity);

      mkdirSync(OUTPUT_DIR, { recursive: true });
      await writeFormattedJson(join(OUTPUT_DIR, "extractor-report.json"), {
        ...report,
        liveBaseline: LIVE_BASELINE,
      });
      writeFileSync(
        join(OUTPUT_DIR, "extractor-report.md"),
        `${renderMarkdown(report).trimEnd()}\n`,
      );

      expect(report.cases.length).toBe(manifest.cases.length);
    },
    20 * 60_000,
  );
});
