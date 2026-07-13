"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { SAMPLE_DECLARED } from "@/features/precheck/sample";
import type {
  PrecheckServiceError,
  PrecheckServiceResponse,
} from "@/server/precheck-service.types";

import { nowMs, recordColdMs } from "./warm-timing";

/**
 * Runs the bundled verified M Cellars sample once through the real
 * `/api/precheck` path. This spends the unavoidable first-cold-start interval
 * productively: the same request that produces the tutorial's real result also
 * warms the server pipeline for the user's first upload.
 *
 * The state lives entirely inside the onboarding tree and is never written into
 * the user's PrecheckWorkspace form. Combined with the guards below, a sample
 * response can therefore never replace a newer user result.
 *
 * Concurrency guards:
 * - `inFlightRef` makes the fetch fire at most once at a time. This absorbs React
 *   Strict Mode's doubled effect invocation and any repeated `start()`.
 * - `seqRef` gives each attempt an identity; a response whose id is stale (a retry
 *   superseded it) is dropped.
 * - `mountedRef` drops any response that resolves after the workspace unmounts
 *   (e.g. the user pressed "Upload your label" while the sample was still in
 *   flight), so no state update lands on an unmounted tree.
 *
 * We deliberately let the single request run to completion rather than aborting
 * it on cleanup: under Strict Mode the cleanup fires between the doubled setups,
 * so aborting there would cancel the only request we start. Ignoring a late
 * response is the Strict-Mode-safe equivalent and still lets the request warm the
 * server.
 */

export type SampleWarmupState = "idle" | "requested" | "analyzing" | "ready" | "failed";

interface ApiSuccess {
  ok: true;
  data: PrecheckServiceResponse;
}
interface ApiFailure {
  ok: false;
  error: PrecheckServiceError;
}

export interface SampleWarmup {
  state: SampleWarmupState;
  response: PrecheckServiceResponse | null;
  error: string | null;
  /** Measured request→result duration in ms, once complete. Null until then. */
  coldMs: number | null;
  /** Start (or retry) the single sample run. A no-op while a run is in flight. */
  start: () => void;
}

const GENERIC_FAILURE = "The verified sample could not be reached.";

/**
 * @param active When true, the sample run starts automatically (a genuine first
 * visit). A replay passes `false` so it does not re-run a heavy sample; the user
 * can start it explicitly instead.
 */
export function useSampleWarmup(active: boolean): SampleWarmup {
  const [state, setState] = useState<SampleWarmupState>("idle");
  const [response, setResponse] = useState<PrecheckServiceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coldMs, setColdMs] = useState<number | null>(null);

  const inFlightRef = useRef(false);
  const seqRef = useRef(0);
  const mountedRef = useRef(true);
  const completedRef = useRef(false);

  const start = useCallback(() => {
    // Never launch a duplicate while one is running, and never re-run a run that
    // already succeeded. Both guards are synchronous so Strict Mode's second
    // effect invocation cannot slip a second request past a pending state update.
    if (inFlightRef.current || completedRef.current) return;
    inFlightRef.current = true;
    const seq = ++seqRef.current;
    const startedAt = nowMs();

    const body = new FormData();
    body.set("source", "sample");
    // Suggested declared values a reviewer could edit — never a bypass of
    // extraction. The displayed reading still comes from the live pipeline.
    body.set("brand", SAMPLE_DECLARED.brand);
    body.set("alcohol", SAMPLE_DECLARED.alcohol);

    setState("requested");
    setError(null);
    // The request is genuinely in flight now; this is a client-provable state.
    setState("analyzing");

    void (async () => {
      /** Apply a terminal update only if this attempt is still the live one. */
      const settle = (apply: () => void) => {
        if (!mountedRef.current || seq !== seqRef.current) return;
        apply();
      };
      try {
        const res = await fetch("/api/precheck", { method: "POST", body });
        const json = (await res.json()) as ApiSuccess | ApiFailure;
        const elapsed = nowMs() - startedAt;
        settle(() => {
          if (json.ok) {
            completedRef.current = true;
            setResponse(json.data);
            setColdMs(elapsed);
            setState("ready");
            recordColdMs(elapsed);
          } else {
            setError(json.error.message);
            setState("failed");
          }
        });
      } catch {
        settle(() => {
          setError(GENERIC_FAILURE);
          setState("failed");
        });
      } finally {
        // Free the in-flight latch for a retry, but only for the live attempt so a
        // stale settle cannot re-open it.
        if (seq === seqRef.current) inFlightRef.current = false;
      }
    })();
  }, []);

  // Auto-run exactly once when active (genuine first visit).
  useEffect(() => {
    if (active) start();
  }, [active, start]);

  // Track mount so a late response is ignored rather than updating an unmounted
  // tree. Re-affirm on (Strict Mode) re-setup.
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return { state, response, error, coldMs, start };
}
