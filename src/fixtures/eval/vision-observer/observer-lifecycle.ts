import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { adaptObserverProposals } from "./observer-adapter";
import { createObserverDerivative } from "./observer-grid-renderer";
import { validateObserverRegionProposal } from "./observer-grid.schema";
import { guardObserverProposalGrid, guardVisionObserverResultContract } from "./observer-guards";
import type {
  CanonicalRegionProposal,
  GridSpec,
  ObserverAdapterError,
  ObserverDerivative,
  ObserverRegionProposal,
  ObservationRunMetadata,
  VisionObservationErrorRecord,
  VisionObserverAdapter,
  VisionObserverLifecycleResult,
  VisionObserverResult,
} from "./observer-grid.types";

interface RunVisionObserverLifecycleArgs {
  scenarioId: string;
  sourceArtifactRef: string;
  sourceBytes: Uint8Array;
  sourceMediaType: string;
  sourceWidth: number;
  sourceHeight: number;
  adapter: VisionObserverAdapter;
  gridSpec?: GridSpec;
  timeoutMs?: number;
  workspaceRoot?: string;
}

class VisionObserverTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`vision observer timed out after ${timeoutMs}ms`);
    this.name = "VisionObserverTimeoutError";
  }
}

function immutableErrorRecord(
  record: Omit<VisionObservationErrorRecord, "immutable" | "issues"> & {
    issues: readonly string[];
  },
): VisionObservationErrorRecord {
  return Object.freeze({
    immutable: true,
    code: record.code,
    stage: record.stage,
    message: record.message,
    issues: Object.freeze([...record.issues]),
  });
}

function derivativeErrorRecord(error: ObserverAdapterError): VisionObservationErrorRecord {
  const joined = `${error.message}\n${error.issues.join("\n")}`.toLowerCase();
  if (joined.includes("decode")) {
    return immutableErrorRecord({
      code: "DERIVATIVE_DECODE_FAILED",
      stage: "derivative",
      message: error.message,
      issues: error.issues,
    });
  }
  if (joined.includes("dimension")) {
    return immutableErrorRecord({
      code: "DERIVATIVE_DIMENSION_MISMATCH",
      stage: "derivative",
      message: error.message,
      issues: error.issues,
    });
  }
  return immutableErrorRecord({
    code: "DERIVATIVE_RENDER_FAILED",
    stage: "derivative",
    message: error.message,
    issues: error.issues,
  });
}

function observerOutputErrorRecord(
  message: string,
  issues: readonly string[],
): VisionObservationErrorRecord {
  return immutableErrorRecord({
    code: "INVALID_OBSERVER_OUTPUT",
    stage: "proposal-validate",
    message,
    issues,
  });
}

function geometryErrorRecord(
  message: string,
  issues: readonly string[],
): VisionObservationErrorRecord {
  return immutableErrorRecord({
    code: "INVALID_PROPOSAL_GEOMETRY",
    stage: "geometry",
    message,
    issues,
  });
}

function handoffErrorRecord(
  message: string,
  issues: readonly string[],
): VisionObservationErrorRecord {
  return immutableErrorRecord({
    code: "INVALID_OCR_HANDOFF",
    stage: "ocr-handoff",
    message,
    issues,
  });
}

function exceptionErrorRecord(error: unknown): VisionObservationErrorRecord {
  if (error && typeof error === "object" && "code" in error && "message" in error) {
    const code = typeof error.code === "string" ? error.code : null;
    const message = typeof error.message === "string" ? error.message : String(error);
    const issues =
      "issues" in error && Array.isArray(error.issues)
        ? error.issues.map((issue) => String(issue))
        : [message];
    if (code === "READINESS_TIMEOUT" || code === "REQUEST_TIMEOUT") {
      return immutableErrorRecord({
        code: "OBSERVER_TIMEOUT",
        stage: "observe",
        message,
        issues,
      });
    }
    if (code === "INVALID_OBSERVER_OUTPUT" || code === "RESPONSE_TOO_LARGE") {
      return immutableErrorRecord({
        code: "INVALID_OBSERVER_OUTPUT",
        stage: "proposal-validate",
        message,
        issues,
      });
    }
    return immutableErrorRecord({
      code: "OBSERVER_EXCEPTION",
      stage: "observe",
      message,
      issues,
    });
  }
  return immutableErrorRecord({
    code: "OBSERVER_EXCEPTION",
    stage: "observe",
    message: "Vision observer threw an exception.",
    issues: [error instanceof Error ? error.message : String(error)],
  });
}

function timeoutErrorRecord(timeoutMs: number): VisionObservationErrorRecord {
  return immutableErrorRecord({
    code: "OBSERVER_TIMEOUT",
    stage: "observe",
    message: "Vision observer timed out.",
    issues: [`timeoutMs=${timeoutMs}`],
  });
}

function shouldSkipWorkspaceCleanup(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "PROCESS_TERMINATION_FAILED",
  );
}

async function observeWithTimeout(
  adapter: VisionObserverAdapter,
  input: Parameters<VisionObserverAdapter["observe"]>[0],
  timeoutMs: number,
): Promise<VisionObserverResult> {
  const controller = new AbortController();
  const timeoutId =
    Number.isFinite(timeoutMs) && timeoutMs > 0
      ? setTimeout(() => {
          controller.abort(new VisionObserverTimeoutError(timeoutMs));
        }, timeoutMs)
      : null;

  try {
    return await adapter.observe(input, controller.signal);
  } catch (error) {
    if (
      controller.signal.aborted &&
      controller.signal.reason instanceof VisionObserverTimeoutError &&
      (error === controller.signal.reason || error instanceof VisionObserverTimeoutError)
    ) {
      throw controller.signal.reason;
    }
    throw error;
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}

function buildRunMetadata(args: {
  observationRunId: string;
  adapter: VisionObserverAdapter;
  sourceImageSha256: string;
  overlaySha256: string | null;
  startedAt: string;
  completedAt: string;
  cleanupCompleted: boolean;
}): ObservationRunMetadata {
  return {
    observationRunId: args.observationRunId,
    adapterId: args.adapter.adapterId,
    adapterVersion: args.adapter.adapterVersion,
    promptId: args.adapter.promptId,
    promptVersion: args.adapter.promptVersion,
    sourceImageSha256: args.sourceImageSha256,
    overlaySha256: args.overlaySha256,
    startedAt: args.startedAt,
    completedAt: args.completedAt,
    cleanupCompleted: args.cleanupCompleted,
  };
}

export async function runVisionObserverLifecycle(
  args: RunVisionObserverLifecycleArgs,
): Promise<VisionObserverLifecycleResult> {
  const zeroSha256 = "0".repeat(64);
  const observationRunId = randomUUID();
  const startedAt = new Date().toISOString();
  const workspaceRoot = args.workspaceRoot ?? tmpdir();
  const workspaceDir = await mkdtemp(join(workspaceRoot, "vision-observer-"));

  let derivative: ObserverDerivative | null = null;
  let observerResult: VisionObserverResult | null = null;
  let canonicalProposals: CanonicalRegionProposal[] = [];
  let errorRecord: VisionObservationErrorRecord | null = null;
  let cleanupCompleted = false;
  let lifecycleError: unknown = null;

  try {
    const derivativeResult = await createObserverDerivative({
      sourceBytes: args.sourceBytes,
      sourceMediaType: args.sourceMediaType,
      expectedSourceWidth: args.sourceWidth,
      expectedSourceHeight: args.sourceHeight,
      workspaceDir,
      gridSpec: args.gridSpec,
    });
    if (!derivativeResult.ok) {
      errorRecord = derivativeErrorRecord(derivativeResult.error);
    } else {
      derivative = derivativeResult.value;

      await args.adapter.reset?.();

      const observed = await observeWithTimeout(
        args.adapter,
        {
          observationRunId,
          scenarioId: args.scenarioId,
          sourceArtifactRef: args.sourceArtifactRef,
          workspaceDir,
          overlayArtifactPath: derivative.overlayArtifactPath,
          overlayMediaType: derivative.mediaType,
          overlaySha256: derivative.overlaySha256,
          overlayWidth: derivative.width,
          overlayHeight: derivative.height,
          sourceImageSha256: derivative.sourceSha256,
        },
        args.timeoutMs ?? 0,
      );

      const resultGuard = guardVisionObserverResultContract({
        result: observed,
        expectedObservationRunId: observationRunId,
      });
      if (!resultGuard.ok) {
        errorRecord = observerOutputErrorRecord(
          resultGuard.error.message,
          resultGuard.error.issues,
        );
      } else {
        observerResult = resultGuard.value;

        const validatedProposals: ObserverRegionProposal[] = [];
        for (const candidate of observerResult.proposals) {
          const validated = validateObserverRegionProposal(candidate);
          if (!validated.ok) {
            errorRecord = observerOutputErrorRecord(
              validated.error.message,
              validated.error.issues,
            );
            break;
          }

          const gridGuard = guardObserverProposalGrid(validated.value, derivative.gridSpec);
          if (!gridGuard.ok) {
            errorRecord = observerOutputErrorRecord(
              gridGuard.error.message,
              gridGuard.error.issues,
            );
            break;
          }

          validatedProposals.push(validated.value);
        }

        if (errorRecord === null) {
          const adapted = adaptObserverProposals({
            derivative,
            proposals: validatedProposals,
            sourceArtifactRef: args.sourceArtifactRef,
          });
          if (!adapted.ok) {
            errorRecord =
              adapted.error.code === "INVALID_OCR_HANDOFF"
                ? handoffErrorRecord(adapted.error.message, adapted.error.issues)
                : geometryErrorRecord(adapted.error.message, adapted.error.issues);
          } else {
            canonicalProposals = adapted.value;
          }
        }
      }
    }
  } catch (error) {
    lifecycleError = error;
    errorRecord =
      error instanceof VisionObserverTimeoutError
        ? timeoutErrorRecord(args.timeoutMs ?? 0)
        : exceptionErrorRecord(error);
  } finally {
    if (shouldSkipWorkspaceCleanup(lifecycleError)) {
      cleanupCompleted = false;
    } else {
      try {
        await rm(workspaceDir, { recursive: true, force: true });
        cleanupCompleted = true;
      } catch {
        cleanupCompleted = false;
      }
    }
  }

  return {
    run: buildRunMetadata({
      observationRunId,
      adapter: args.adapter,
      sourceImageSha256: derivative?.sourceSha256 ?? zeroSha256,
      overlaySha256: derivative?.overlaySha256 ?? null,
      startedAt,
      completedAt: new Date().toISOString(),
      cleanupCompleted,
    }),
    derivative,
    observerResult,
    canonicalProposals: errorRecord === null ? canonicalProposals : [],
    errorRecord,
    workspaceDir,
  };
}
