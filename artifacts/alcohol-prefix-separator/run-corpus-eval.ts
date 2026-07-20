/**
 * Fixed-corpus evaluation runner for the alcohol-prefix-separator experiment.
 *
 * Runs the REAL extractor over every manifest case and writes a full report to
 * this artifact directory. It deliberately does NOT touch
 * `docs/extraction-full-corpus/**` or the committed production-parity fixture:
 * the parity assertion in `baseline-report.gen.test.ts` is designed to fail when
 * extraction output changes, which is precisely what a treatment run does. The
 * changed-case list is derived by diffing the two reports instead.
 *
 *   npx vite-node --config vitest.config.ts \
 *     artifacts/alcohol-prefix-separator/run-corpus-eval.ts <output.json>
 */
import { writeFileSync } from "node:fs";

import { runCaseArtifacts } from "@/fixtures/eval/eval-harness";
import { loadEvalManifest } from "@/fixtures/eval/eval-loader";
import type { CaseReport } from "@/fixtures/eval/eval-report.types";

async function main() {
  const out = process.argv[2];
  if (!out) throw new Error("usage: run-corpus-eval.ts <output.json>");

  const manifest = loadEvalManifest();
  const cases: CaseReport[] = [];
  const started = Date.now();

  for (const [index, evalCase] of manifest.cases.entries()) {
    // Sequential: bound peak memory and keep OCR workers from contending, exactly
    // as the committed generator does.
    const artifacts = await runCaseArtifacts(evalCase, { semanticScene: true });
    cases.push(artifacts.report);
    if ((index + 1) % 10 === 0 || index + 1 === manifest.cases.length) {
      process.stdout.write(`  ${index + 1}/${manifest.cases.length} cases\n`);
    }
  }

  // Keep only what the metric diff needs, so the artifact stays small and readable.
  const slim = cases.map((c) => ({
    caseId: c.caseId,
    strata: c.strata,
    latencyMs: c.latencyMs,
    alcohol: {
      state: c.alcohol?.state ?? null,
      value: c.alcohol?.value ?? null,
      present: c.alcohol?.present ?? null,
      acceptablePercents: c.alcohol?.acceptablePercents ?? null,
      parsedValue: c.alcohol?.parsedValue ?? null,
      detected: c.alcohol?.detected ?? null,
      parsedAccurate: c.alcohol?.parsedAccurate ?? null,
      failureClass: c.alcohol?.failureClass ?? null,
      candidateFilteringSubtype: c.alcohol?.candidateFilteringSubtype ?? null,
    },
    brand: {
      state: c.brand?.state ?? null,
      value: c.brand?.value ?? null,
      exactMatch: c.brand?.exactMatch ?? null,
      normalizedMatch: c.brand?.normalizedMatch ?? null,
      failureClass: c.brand?.failureClass ?? null,
    },
  }));

  writeFileSync(
    out,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), wallClockMs: Date.now() - started, cases: slim },
      null,
      2,
    ) + "\n",
  );
  process.stdout.write(`wrote ${out} (${slim.length} cases)\n`);
}

await main();
