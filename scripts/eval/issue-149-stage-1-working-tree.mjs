#!/usr/bin/env node
/**
 * Issue #149 — Stage 1 governed-package working-tree verification.
 *
 * Non-OCR. This is ORDINARY REPOSITORY CI HYGIENE, not an acquisition workflow.
 * It runs no acquisition, stages nothing and touches no image.
 *
 * ## Why this exists as a separate executable
 *
 * The previous check lived inside a test and INFERRED its own regime: a nonempty
 * `git status --porcelain` was read as "an amendment must be in progress", which
 * meant the strict assertion could never fail — anything that made the tree
 * dirty also switched the check into the lenient branch. A guard that a failure
 * disarms is not a guard.
 *
 * The mode is therefore explicit and never inferred:
 *
 *   --clean  the governed package must be byte-identical to HEAD. No exceptions,
 *            no allowance for "work in progress". This is what CI runs.
 *   --local  amendment work is in progress. Differing paths must all be inside
 *            the governed directory, and untracked files must be accounted for
 *            by the Stage 1 contract manifest. A path outside the package still
 *            fails.
 *
 * Neither mode is a default: with no mode, or with both, this exits nonzero.
 *
 * ## Why clean mode runs after the suite
 *
 * Verifying cleanliness before the tests proves nothing about the tests. This is
 * wired to the `posttest` lifecycle so it observes the tree the suite left
 * behind. `posttest` runs only when `test` succeeded, which is correct: a failing
 * suite is already reported, and its tree is not evidence.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

export const EXPERIMENT_ID = "issue-149-brand-complete-evidence-acquisition";
export const GOVERNED_DIRECTORY = `artifacts/${EXPERIMENT_ID}`;
export const MANIFEST_FILE = `${GOVERNED_DIRECTORY}/stage-1-contract-manifest.sha256`;

/** Halt codes. Each names one distinct failure; none is a catch-all. */
export const HALT_CODES = {
  NO_MODE: "STAGE_1_WORKING_TREE_MODE_NOT_SPECIFIED",
  AMBIGUOUS_MODE: "STAGE_1_WORKING_TREE_MODE_AMBIGUOUS",
  MANIFEST_UNVERIFIED: "STAGE_1_CONTRACT_MANIFEST_UNVERIFIED",
  DIRTY: "STAGE_1_GOVERNED_PACKAGE_DIRTY",
  OUTSIDE_PACKAGE: "STAGE_1_MODIFICATION_OUTSIDE_GOVERNED_PACKAGE",
  UNACCOUNTED: "STAGE_1_UNACCOUNTED_UNTRACKED_ARTIFACT",
};

/**
 * Mode selection. Exported and pure so the tests drive the REAL selector rather
 * than restating its rules.
 *
 * `CI=true` does NOT silently imply a mode here — `resolveMode` reports only what
 * the arguments say. The `posttest` script is what passes `--clean` in CI, and
 * `defaultModeForEnvironment` is the single place that decision is made.
 */
export function resolveMode(argv, env = {}) {
  // `--mode-from-env` is how the `posttest` lifecycle picks the regime: CI gets
  // the strict mode, a developer machine the lenient one. It reads the
  // ENVIRONMENT, never the working tree, so a dirty tree can never soften the
  // check that is meant to catch it.
  const expanded = argv.includes("--mode-from-env")
    ? [...argv.filter((a) => a !== "--mode-from-env"), defaultModeForEnvironment(env)]
    : argv;
  const clean = expanded.includes("--clean");
  const local = expanded.includes("--local");
  if (clean && local) {
    return {
      ok: false,
      code: HALT_CODES.AMBIGUOUS_MODE,
      detail: "--clean and --local are exclusive",
    };
  }
  const modeSource = argv.includes("--mode-from-env") ? "environment" : "argument";
  if (clean) return { ok: true, mode: "clean", modeSource };
  if (local) return { ok: true, mode: "local", modeSource };
  return {
    ok: false,
    code: HALT_CODES.NO_MODE,
    detail:
      "pass exactly one of --clean, --local or --mode-from-env; the mode is never inferred from Git status",
  };
}

/** CI runs the strict mode; a developer machine runs the lenient one. */
export function defaultModeForEnvironment(env) {
  return env.CI === "true" || env.CI === "1" ? "--clean" : "--local";
}

/**
 * Parse porcelain output.
 *
 * Only the trailing newline is stripped: `trim()` would eat the leading status
 * space of the first entry and shift every path by one character.
 */
export function parsePorcelain(raw) {
  return raw
    .replace(/\n+$/, "")
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => ({ status: line.slice(0, 2).trim(), file: line.slice(3).trim() }))
    .filter((entry) => entry.file.length > 0);
}

/**
 * The verdict, given already-collected facts. Pure, so the tests can supply a
 * dirty tree without dirtying the real one.
 */
export function evaluateWorkingTree({ mode, entries, manifestedPaths }) {
  if (mode === "clean") {
    // Governed-package scope. This is the post-suite "the tests changed nothing"
    // assertion, not a claim about the rest of the repository.
    if (entries.length === 0)
      return { ok: true, status: "STAGE_1_GOVERNED_PACKAGE_CLEAN", mode, differingPaths: [] };
    return {
      ok: false,
      code: HALT_CODES.DIRTY,
      mode,
      detail: entries.map((entry) => `${entry.status} ${entry.file}`),
    };
  }

  const outside = entries.filter((entry) => !entry.file.startsWith(`${GOVERNED_DIRECTORY}/`));
  if (outside.length > 0) {
    return {
      ok: false,
      code: HALT_CODES.OUTSIDE_PACKAGE,
      mode,
      detail: outside.map((entry) => entry.file),
    };
  }
  const unaccounted = entries
    .filter((entry) => entry.status === "??")
    .map((entry) => entry.file)
    .filter((file) => !manifestedPaths.has(file));
  if (unaccounted.length > 0) {
    return { ok: false, code: HALT_CODES.UNACCOUNTED, mode, detail: unaccounted };
  }
  return {
    ok: true,
    status: "STAGE_1_LOCAL_AMENDMENT_CONFINED_TO_GOVERNED_PACKAGE",
    mode,
    differingPaths: entries.map((entry) => entry.file),
  };
}

/** Paths the committed Stage 1 manifest accounts for. */
export function manifestedPathsFrom(manifestText) {
  return new Set(
    manifestText
      .split("\n")
      .filter((line) => !line.startsWith("#") && line.trim().length > 0)
      .map((line) => line.split("  ")[1])
      .filter((file) => typeof file === "string" && file.length > 0),
  );
}

function run(command, args) {
  return execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
}

export function verifyWorkingTree(argv, { cwd = process.cwd(), env = process.env } = {}) {
  const selected = resolveMode(argv, env);
  if (!selected.ok)
    return { status: "HALTED", reason: selected.code, detail: selected.detail, ocrRun: false };

  // The manifest verification comes FIRST. A clean Git status over a package
  // whose recorded digests no longer match is not an intact package.
  let manifestStatus;
  try {
    manifestStatus = JSON.parse(
      run("node", ["scripts/eval/issue-149-stage-1-contract-manifest.mjs", "--verify"]),
    );
  } catch (cause) {
    return {
      status: "HALTED",
      reason: HALT_CODES.MANIFEST_UNVERIFIED,
      detail: cause instanceof Error ? cause.message : String(cause),
      ocrRun: false,
    };
  }
  if (manifestStatus.status !== "VERIFIED") {
    return {
      status: "HALTED",
      reason: HALT_CODES.MANIFEST_UNVERIFIED,
      detail: manifestStatus,
      ocrRun: false,
    };
  }

  // SCOPE, stated exactly:
  //
  // - `--local` claims every difference is confined to the governed package, so
  //   it must ask Git about the WHOLE REPOSITORY. The previous implementation
  //   scoped `git status` to the governed directory, which made
  //   STAGE_1_MODIFICATION_OUTSIDE_GOVERNED_PACKAGE unreachable in real CLI
  //   execution: an outside modification could never enter `entries` at all.
  // - `--clean` deliberately checks the governed package ONLY. It is a
  //   post-suite assertion that the tests left the package untouched, not a
  //   repository-wide cleanliness claim, and this file does not describe it as
  //   one.
  const entries = parsePorcelain(
    selected.mode === "local"
      ? run("git", ["status", "--porcelain"])
      : run("git", ["status", "--porcelain", "--", GOVERNED_DIRECTORY]),
  );
  // The WORKING-TREE manifest, not HEAD's. An amendment that adds a governed
  // artifact records it in the manifest before it is committed, and reading
  // HEAD's copy would reject every such amendment. This is not a loophole: the
  // manifest verification above already proved this manifest's recorded digests
  // match the files on disk, so an entry cannot be added without the file.
  const manifestedPaths = manifestedPathsFrom(readFileSync(path.join(cwd, MANIFEST_FILE), "utf8"));

  const verdict = evaluateWorkingTree({ mode: selected.mode, entries, manifestedPaths });

  if (!verdict.ok) {
    return {
      status: "HALTED",
      reason: verdict.code,
      mode: verdict.mode,
      detail: verdict.detail,
      ocrRun: false,
    };
  }
  return {
    status: verdict.status,
    mode: verdict.mode,
    governedDirectory: path.relative(cwd, path.join(cwd, GOVERNED_DIRECTORY)),
    modeSource: selected.modeSource,
    statusScope: selected.mode === "local" ? "repository" : "governed-package",
    manifestVerified: true,
    differingPaths: verdict.differingPaths,
    acquisitionRun: false,
    ocrRun: false,
  };
}

// ---- the only boundary that decides an exit code ---------------------------
if (
  process.argv[1] !== undefined &&
  process.argv[1].endsWith("issue-149-stage-1-working-tree.mjs")
) {
  const result = verifyWorkingTree(process.argv.slice(2));
  if (result.status === "HALTED") {
    console.error(JSON.stringify(result, null, 2));
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(result, null, 2));
  }
}
