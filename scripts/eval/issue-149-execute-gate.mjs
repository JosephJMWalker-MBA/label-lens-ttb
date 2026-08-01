#!/usr/bin/env node
/**
 * Issue #149 — the execute-transition gate, run in the workflow.
 *
 * It COLLECTS facts from Git and the working tree, then hands them to the pure
 * decision function the tests drive. Collection and decision are separate so the
 * synthetic-history tests exercise the real rules rather than a restatement.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { evaluateExecuteTransition } from "./lib/issue-149-execute-authorization.mjs";

const ROOT = process.cwd();
const ART = "artifacts/issue-149-brand-complete-evidence-acquisition";
const AUTHORIZATION = path.join(ROOT, ART, "execute-authorization.json");
const MODE_FILE = path.join(ROOT, ART, "workflow-mode.txt");

const git = (args) =>
  execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });

const authorization = existsSync(AUTHORIZATION)
  ? JSON.parse(readFileSync(AUTHORIZATION, "utf8"))
  : null;
const reviewed = authorization?.reviewedImplementationSha ?? null;
const headSha = git(["rev-parse", "HEAD"]).trim();

let ancestor = false;
let changed = [];
if (typeof reviewed === "string" && /^[0-9a-f]{40}$/.test(reviewed)) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", reviewed, headSha], { cwd: ROOT });
    ancestor = true;
    changed = git(["diff", "--name-only", `${reviewed}..${headSha}`])
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  } catch {
    ancestor = false;
  }
}

const verdict = evaluateExecuteTransition({
  authorization,
  headSha,
  reviewedShaIsAncestorOfHead: ancestor,
  changedPathsSinceReviewedSha: changed,
  modeFileBytes: existsSync(MODE_FILE) ? readFileSync(MODE_FILE, "utf8") : "",
});

const report = {
  ...verdict,
  headSha,
  reviewedImplementationSha: reviewed,
  changedPathsSinceReviewedSha: changed,
};
if (verdict.ok) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.error(JSON.stringify(report, null, 2));
  process.exitCode = 1;
}
