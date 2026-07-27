import { generateIssue149BoundedBaseline } from "@/fixtures/eval/issue-149-bounded-baseline";

generateIssue149BoundedBaseline().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
