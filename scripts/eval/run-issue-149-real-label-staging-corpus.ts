import { generateIssue149RealLabelStagingCorpus } from "@/fixtures/eval/issue-149-real-label-staging-corpus";

generateIssue149RealLabelStagingCorpus().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
