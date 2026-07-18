// @vitest-environment node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { format, resolveConfig } from "prettier";
import { describe, expect, it } from "vitest";

import { runCaseArtifacts } from "./eval-harness";
import { loadEvalManifest } from "./eval-loader";
import {
  buildProductionAnalyzerParityFixture,
  compareProductionAnalyzerParity,
  ISSUE_131_BASE_COMMIT,
  PRODUCTION_PARITY_FIXTURE_PATH,
  type ProductionAnalyzerParityFixture,
  type ProductionAnalyzerParityInput,
} from "./production-parity";

const RUN =
  process.env.EVAL_PRODUCTION_PARITY === "1" || process.env.EVAL_CAPTURE_PRODUCTION_PARITY === "1";
const CAPTURE = process.env.EVAL_CAPTURE_PRODUCTION_PARITY === "1";
async function writeFormattedJson(filePath: string, value: unknown) {
  const config = (await resolveConfig(filePath)) ?? {};
  const formatted = await format(JSON.stringify(value), {
    ...config,
    filepath: filePath,
    parser: "json",
  });
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, formatted);
}

(RUN ? describe : describe.skip)("production analyzer full-corpus byte parity", () => {
  it(
    CAPTURE
      ? "captures the immutable Issue #131 pre-change analyzer responses"
      : "matches every analyzer response byte-for-byte against the Issue #131 baseline",
    async () => {
      const manifest = loadEvalManifest();
      const inputs: ProductionAnalyzerParityInput[] = [];
      for (const evalCase of manifest.cases) {
        const artifacts = await runCaseArtifacts(evalCase);
        inputs.push({
          caseId: evalCase.caseId,
          responseBytes: artifacts.productionResponseBytes,
          extractionError: artifacts.extractionError,
        });
      }
      const actual = buildProductionAnalyzerParityFixture(ISSUE_131_BASE_COMMIT, inputs);

      if (CAPTURE) {
        await writeFormattedJson(PRODUCTION_PARITY_FIXTURE_PATH, actual);
      } else {
        const expected = JSON.parse(
          readFileSync(PRODUCTION_PARITY_FIXTURE_PATH, "utf8"),
        ) as ProductionAnalyzerParityFixture;
        expect(compareProductionAnalyzerParity(expected, actual)).toEqual([]);
      }

      expect(actual.caseCount).toBe(manifest.cases.length);
    },
    20 * 60_000,
  );
});
