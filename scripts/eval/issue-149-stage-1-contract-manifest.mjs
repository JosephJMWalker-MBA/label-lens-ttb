#!/usr/bin/env node
/**
 * Issue #149 — Stage 1 contract-package manifest.
 *
 * Hashes the whole Stage 1 IMPLEMENTATION package — every contract, the freeze
 * script and every Stage 1 test — so a change to any of them cannot leave a
 * still-valid manifest behind.
 *
 * It deliberately does NOT hash the two transition controls (`workflow-mode.txt`
 * and `execute-authorization.json`). Those are the mutable controls that
 * authorize execution; the manifest binds the implementation they authorize. See
 * TRANSITION_CONTROL_EXCLUSIONS below and transition-control-governance.json.
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
  "scripts/eval/lib/issue-149-freeze-core.d.mts",
  "scripts/eval/lib/issue-149-freeze-core.mjs",
  "scripts/eval/lib/issue-149-stage2-source-closure.ts",
  "scripts/eval/lib/issue-149-candidate-adapter.ts",
  "scripts/eval/lib/issue-149-evidence-canonical.ts",
  "scripts/eval/lib/issue-149-run-evidence-writer.ts",
  "scripts/eval/issue-149-forensic-handoff.ts",
  "scripts/eval/issue-149-build-rehearsal-evidence.ts",
  "scripts/eval/issue-149-validate-rehearsal-attestation.ts",
];
const STAGE_1_TESTS = [
  "src/fixtures/eval/issue-149-acquisition-isolation.test.ts",
  "src/fixtures/eval/issue-149-acquisition-orchestration.test.ts",
  "src/fixtures/eval/issue-149-bundle-scan.test.ts",
  "src/fixtures/eval/issue-149-contract-consistency.test.ts",
  "src/fixtures/eval/issue-149-dependency-closure.test.ts",
  "src/fixtures/eval/issue-149-evidence-canonical.test.ts",
  "src/fixtures/eval/issue-149-freeze-core-loader.test.ts",
  "src/fixtures/eval/issue-149-frozen-vocabulary.test.ts",
  "src/fixtures/eval/issue-149-generated-artifact-reproducibility.test.ts",
  "src/fixtures/eval/issue-149-production-candidate-compatibility.test.ts",
  "src/fixtures/eval/issue-149-ranked-invariants.test.ts",
  "src/fixtures/eval/issue-149-stage2-source-closure.test.ts",
  "src/fixtures/eval/issue-149-staging-independence.test.ts",
  "src/fixtures/eval/issue-149-stage-1-manifest.test.ts",
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function walk(dir) {
  return readdirSync(path.join(process.cwd(), dir)).flatMap((entry) => {
    const relative = path.join(dir, entry);
    return statSync(path.join(process.cwd(), relative)).isDirectory() ? walk(relative) : [relative];
  });
}

/**
 * The two TRANSITION CONTROLS, excluded from the immutable manifest.
 *
 * The manifest binds the reviewed IMPLEMENTATION. These two files are the
 * intentionally mutable controls that authorize execution, and the authorized
 * transition commit is permitted to change exactly them and nothing else.
 *
 * Hashing them here made the transition impossible: changing them would make the
 * manifest stale, and the transition commit cannot also regenerate the manifest
 * because the execute gate would then see a third changed path and reject the
 * transition. The result was a transition that necessarily failed both ordinary
 * `npm test` and Job A's first step.
 *
 * Excluding them does NOT make them uncontrolled. Their integrity is enforced by
 * Git commit identity, exact control-state validation, exact changed-path
 * validation against the reviewed implementation SHA, full-history ancestry, and
 * external approval of the exact unpushed transition commit SHA. See
 * transition-control-governance.json.
 *
 * The set is EXACT — two full repository-relative paths. It is deliberately not
 * a filename pattern, a suffix, a directory or a mutability heuristic, because
 * any of those could silently grow to exclude a governed contract.
 */
export const TRANSITION_CONTROL_EXCLUSIONS = [
  "artifacts/issue-149-brand-complete-evidence-acquisition/workflow-mode.txt",
  "artifacts/issue-149-brand-complete-evidence-acquisition/execute-authorization.json",
];

/**
 * Every governed file, in sorted path order — the manifest itself and the two
 * transition controls excluded, and nothing else.
 */
export function stage1Files() {
  const governed = walk(ROOT).filter(
    (f) => f !== MANIFEST && !TRANSITION_CONTROL_EXCLUSIONS.includes(f),
  );
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
