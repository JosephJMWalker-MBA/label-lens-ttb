import { generateIssue149EnableBrandGroupingExperiment } from "../../src/fixtures/eval/issue-149-enable-brand-grouping.ts";

void generateIssue149EnableBrandGroupingExperiment().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
