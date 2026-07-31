/**
 * Type declarations for the Stage 1 governed-package working-tree verifier.
 *
 * The verifier is `.mjs` because npm's `posttest` lifecycle runs it directly
 * under `node`. This sidecar exists so the Stage 1 contract tests can drive the
 * REAL selector and evaluator under TypeScript rather than reimplementing them.
 */

export declare const EXPERIMENT_ID: string;
export declare const GOVERNED_DIRECTORY: string;
export declare const MANIFEST_FILE: string;

export declare const HALT_CODES: {
  NO_MODE: string;
  AMBIGUOUS_MODE: string;
  MANIFEST_UNVERIFIED: string;
  DIRTY: string;
  OUTSIDE_PACKAGE: string;
  UNACCOUNTED: string;
};

export type WorkingTreeMode = "clean" | "local";

export interface PorcelainEntry {
  status: string;
  file: string;
}

export type ModeResolution =
  | { ok: true; mode: WorkingTreeMode; modeSource: "argument" | "environment" }
  | { ok: false; code: string; detail: string };

export type WorkingTreeVerdict =
  | { ok: true; status: string; mode: WorkingTreeMode; differingPaths: string[] }
  | { ok: false; code: string; mode: WorkingTreeMode; detail: string[] };

export declare function resolveMode(
  argv: string[],
  env?: Record<string, string | undefined>,
): ModeResolution;

export declare function defaultModeForEnvironment(
  env: Record<string, string | undefined>,
): "--clean" | "--local";

export declare function parsePorcelain(raw: string): PorcelainEntry[];

export declare function evaluateWorkingTree(input: {
  mode: WorkingTreeMode;
  entries: PorcelainEntry[];
  manifestedPaths: Set<string>;
}): WorkingTreeVerdict;

export declare function manifestedPathsFrom(manifestText: string): Set<string>;

export declare function verifyWorkingTree(
  argv: string[],
  options?: { cwd?: string; env?: Record<string, string | undefined> },
): Record<string, unknown>;
