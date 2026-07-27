import { generateIssue149BrandGroupingRankingExperiment } from "../../src/fixtures/eval/issue-149-brand-grouping-ranking.ts";

void generateIssue149BrandGroupingRankingExperiment().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
