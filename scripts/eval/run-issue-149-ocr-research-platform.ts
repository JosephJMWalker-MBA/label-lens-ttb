import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  PRODUCTION_BOUNDED_BRAND_CONTROL,
  experimentSchemaJson,
  reportSchemaJson,
  runOcrExperiment,
  type ExperimentDefinition,
} from "@/fixtures/ocr-research/experiment";
import {
  COMMITTED_MANIFEST_PATH,
  composeResearchManifest,
  writeApprovedRegionResearchManifest,
} from "@/fixtures/ocr-research/fixture-corpus";
import { writeFixtureInventory } from "@/fixtures/ocr-research/inventory";

const OUTPUT_ROOT = path.join(process.cwd(), "artifacts/issue-149-ocr-research-platform");

function gitSha(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
}

async function main() {
  mkdirSync(OUTPUT_ROOT, { recursive: true });
  writeApprovedRegionResearchManifest(path.join(process.cwd(), COMMITTED_MANIFEST_PATH));
  const manifest = composeResearchManifest({ includePrivate: false });
  const inventory = await writeFixtureInventory(OUTPUT_ROOT);
  writeFileSync(
    path.join(OUTPUT_ROOT, "control-config.json"),
    `${JSON.stringify(PRODUCTION_BOUNDED_BRAND_CONTROL, null, 2)}\n`,
  );
  writeFileSync(
    path.join(OUTPUT_ROOT, "experiment-schema.json"),
    `${JSON.stringify(experimentSchemaJson(), null, 2)}\n`,
  );
  writeFileSync(
    path.join(OUTPUT_ROOT, "report-schema.json"),
    `${JSON.stringify(reportSchemaJson(), null, 2)}\n`,
  );
  writeFileSync(path.join(OUTPUT_ROOT, "git-sha.txt"), `${gitSha()}\n`);

  const noOpDefinition: ExperimentDefinition = {
    schemaVersion: "ocr-research-experiment.v1",
    experimentId: "issue-149-bounded-brand-no-op",
    design: "one-variable-at-a-time",
    declaredVariable: "none",
    control: PRODUCTION_BOUNDED_BRAND_CONTROL,
    treatment: PRODUCTION_BOUNDED_BRAND_CONTROL,
  };
  const noOp = await runOcrExperiment({
    definition: noOpDefinition,
    manifest,
    outputRoot: path.join(OUTPUT_ROOT, "examples/no-op"),
  });

  let selected: Awaited<ReturnType<typeof runOcrExperiment>> | null = null;
  if (process.env.OCR_RESEARCH_RUN_SCALE_TREATMENT === "1") {
    selected = await runOcrExperiment({
      definition: {
        ...noOpDefinition,
        experimentId: "issue-149-bounded-brand-scale-4",
        declaredVariable: "scale",
        treatment: { ...PRODUCTION_BOUNDED_BRAND_CONTROL, scale: 4 },
      },
      manifest,
      outputRoot: path.join(OUTPUT_ROOT, "selected/brand-scale-4"),
    });
  }
  writeFileSync(
    path.join(OUTPUT_ROOT, "generated-summary.json"),
    `${JSON.stringify(
      {
        manifestFixtureCount: manifest.fixtures.length,
        inventory: inventory.summary,
        noOp: {
          eligibility: noOp.eligibility,
          metrics: noOp.control.metrics,
          diff: noOp.diff,
        },
        selected: selected
          ? {
              eligibility: selected.eligibility,
              controlMetrics: selected.control.metrics,
              treatmentMetrics: selected.treatment.metrics,
              diff: selected.diff,
            }
          : null,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
