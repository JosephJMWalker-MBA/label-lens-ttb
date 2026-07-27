import { generateIssue149SegmentationExperiment } from "@/fixtures/eval/issue-149-segmentation-experiment";

generateIssue149SegmentationExperiment().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
