#!/usr/bin/env node
/**
 * Issue #149 — Stage 1 contract-package manifest.
 *
 * Hashes the WHOLE Stage 1 contract package, not just the preregistration, so a
 * change to any contract, the freeze script or a Stage 1 test cannot leave a
 * still-valid manifest behind.
 *
 * `--verify` checks the committed manifest instead of rewriting it.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = "artifacts/issue-149-brand-complete-evidence-acquisition";
const MANIFEST = path.join(ROOT, "stage-1-contract-manifest.sha256");
const FREEZE_SCRIPT = "scripts/eval/issue-149-brand-evidence-acquisition-freeze.mjs";
const MANIFEST_SCRIPT = "scripts/eval/issue-149-stage-1-contract-manifest.mjs";
/**
 * The canonical helper lives under `scripts/eval/lib/` rather than
 * `src/fixtures/`, because the Stage 2 runner must import it and is prohibited
 * from importing anything under `src/fixtures/**`.
 */
const CANONICAL_LIBS = [
  "scripts/eval/lib/issue-149-bundle-scan.ts",
  "scripts/eval/lib/issue-149-candidate-adapter.ts",
  "scripts/eval/lib/issue-149-evidence-canonical.ts",
];
const STAGE_1_TESTS = [
  "src/fixtures/eval/issue-149-acquisition-isolation.test.ts",
  "src/fixtures/eval/issue-149-bundle-scan.test.ts",
  "src/fixtures/eval/issue-149-contract-consistency.test.ts",
  "src/fixtures/eval/issue-149-dependency-closure.test.ts",
  "src/fixtures/eval/issue-149-evidence-canonical.test.ts",
  "src/fixtures/eval/issue-149-frozen-vocabulary.test.ts",
  "src/fixtures/eval/issue-149-production-candidate-compatibility.test.ts",
  "src/fixtures/eval/issue-149-stage-1-manifest.test.ts",
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function walk(dir) {
  return readdirSync(path.join(process.cwd(), dir)).flatMap((entry) => {
    const relative = path.join(dir, entry);
    return statSync(path.join(process.cwd(), relative)).isDirectory() ? walk(relative) : [relative];
  });
}

/** Every governed file, in sorted path order, manifest itself excluded. */
export function stage1Files() {
  const governed = walk(ROOT).filter((f) => f !== MANIFEST);
  return [...governed, FREEZE_SCRIPT, MANIFEST_SCRIPT, ...CANONICAL_LIBS, ...STAGE_1_TESTS].sort();
}

export function stage1Entries() {
  return stage1Files().map((file) => ({
    path: file,
    sha256: sha256(readFileSync(path.join(process.cwd(), file))),
  }));
}

/** Aggregate over the sorted "sha  path" lines, so order is part of the hash. */
export function stage1Aggregate(entries = stage1Entries()) {
  return sha256(
    Buffer.from(entries.map((e) => `${e.sha256}  ${e.path}`).join("\n") + "\n", "utf8"),
  );
}

function render(entries) {
  const lines = entries.map((e) => `${e.sha256}  ${e.path}`);
  return `${lines.join("\n")}\n# aggregate ${stage1Aggregate(entries)}\n`;
}

function main() {
  const verify = process.argv.includes("--verify");
  const entries = stage1Entries();
  const rendered = render(entries);

  if (!verify) {
    writeFileSync(path.join(process.cwd(), MANIFEST), rendered);
    console.log(
      JSON.stringify(
        { status: "WRITTEN", files: entries.length, aggregate: stage1Aggregate(entries) },
        null,
        2,
      ),
    );
    return;
  }

  const committed = readFileSync(path.join(process.cwd(), MANIFEST), "utf8");
  if (committed !== rendered) {
    console.error(
      JSON.stringify(
        {
          status: "STAGE_1_CONTRACT_MANIFEST_STALE",
          detail:
            "The committed manifest does not match the current Stage 1 package. Regenerate it and record the new aggregate in the amendment.",
          expectedAggregate: stage1Aggregate(entries),
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }
  console.log(
    JSON.stringify(
      { status: "VERIFIED", files: entries.length, aggregate: stage1Aggregate(entries) },
      null,
      2,
    ),
  );
}

if (process.argv[1] && process.argv[1].endsWith("issue-149-stage-1-contract-manifest.mjs")) main();
