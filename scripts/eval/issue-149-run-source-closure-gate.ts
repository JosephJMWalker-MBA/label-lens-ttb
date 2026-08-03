/**
 * Issue #149 — run the tested source-closure analyzer over a supplied file list.
 *
 * A thin CLI over `analyzeStage2SourceClosure` so Job A drives the SAME
 * implementation the Stage 1 tests exercise, rather than a second copy of the
 * rules. It prints the report as JSON and never exits nonzero itself: Job A owns
 * the verdict.
 */
import { readFileSync } from "node:fs";

import { analyzeStage2SourceClosure } from "./lib/issue-149-stage2-source-closure";

const files = process.argv.slice(2).filter((argument) => argument.endsWith(".ts"));
const report = analyzeStage2SourceClosure({
  files: files.map((file) => ({ path: file, contents: readFileSync(file, "utf8") })),
});
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
