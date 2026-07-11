import { err, ok, type Result } from "@/shared/result";

import { analysisRunCreationInputSchema } from "./analysis-run.schema";
import type {
  AnalysisRun,
  AnalysisRunCreationInput,
  AnalysisRunError,
  HumanDispositionEntry,
  RunCheck,
} from "./analysis-run.types";
import type { ProcessingStatus } from "./run-status";

/** Recursively freeze an object graph so a created run cannot be mutated. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}

/**
 * Create one immutable analysis run.
 *
 * The version manifest and declared facts are captured now, before any
 * extraction or rule execution, and the whole run is deep-frozen. Checks begin
 * insufficient / not_run: nothing is sufficient until a later sufficiency gate
 * says so, per check.
 */
export function createAnalysisRun(
  input: AnalysisRunCreationInput,
): Result<AnalysisRun, AnalysisRunError> {
  const parsed = analysisRunCreationInputSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: "INVALID_INPUT",
      message: "Analysis run creation input failed validation.",
      issues: parsed.error.issues.map((issue) => {
        const path = issue.path.length ? issue.path.join(".") : "$";
        return `${path}: ${issue.message}`;
      }),
    });
  }

  const data = parsed.data;
  const checks: RunCheck[] = data.checkIds.map((checkId) => ({
    checkId,
    evidenceStatus: "insufficient",
    ruleExecutionStatus: "not_run_insufficient_evidence",
    findingStatus: "not_run",
    findingRef: null,
  }));

  const run: AnalysisRun = {
    runId: data.runId,
    createdAt: data.createdAt,
    product: data.product,
    sourceArtifact: data.sourceArtifact,
    sanitizedDerivative: data.sanitizedDerivative,
    declaredFacts: data.declaredFacts,
    versionManifest: data.versionManifest,
    processingStatus: "created",
    checks,
    dispositionHistory: [],
  };

  return ok(deepFreeze(run));
}

/** Return a new frozen run with an advanced processing status. */
export function withProcessingStatus(run: AnalysisRun, status: ProcessingStatus): AnalysisRun {
  return deepFreeze({ ...run, processingStatus: status });
}

export type RunCheckPatch = Partial<Omit<RunCheck, "checkId">>;

/** Return a new frozen run with one check updated. Throws on an unknown check. */
export function updateCheck(run: AnalysisRun, checkId: string, patch: RunCheckPatch): AnalysisRun {
  if (!run.checks.some((check) => check.checkId === checkId)) {
    throw new Error(`Unknown checkId: ${checkId}`);
  }
  const checks = run.checks.map((check) =>
    check.checkId === checkId ? { ...check, ...patch } : { ...check },
  );
  return deepFreeze({ ...run, checks });
}

/**
 * Append one human disposition entry, returning a new frozen run. History is
 * append-only: existing entries are never modified or removed.
 */
export function appendDisposition(run: AnalysisRun, entry: HumanDispositionEntry): AnalysisRun {
  const dispositionHistory = [...run.dispositionHistory, { ...entry }];
  return deepFreeze({ ...run, dispositionHistory });
}

/** Stable JSON serialization (sorted keys) for deterministic comparison. */
export function serializeAnalysisRun(run: AnalysisRun): string {
  return stableStringify(run);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
