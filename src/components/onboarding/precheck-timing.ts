/**
 * Bounded, browser-native measurement of the pre-check experience.
 *
 * These are observed-sequence durations, not claims about server temperature. A
 * completed sample request does NOT prove the next request reaches the same
 * initialized host process, so nothing here (or its callers) may assert that the
 * service is "warm" or that a later request will be faster. The sample is
 * intended to create an opportunity for process reuse where hosting permits;
 * that reuse is not proven by the client.
 *
 * All measurements use `performance.now()` (ms since navigation start) and are
 * persisted in `sessionStorage` so the sequence survives the onboarding→upload
 * transition within one session. There is no telemetry vendor, no applicant
 * data, and nothing is transmitted to a server.
 */

export interface PrecheckTiming {
  /** Navigation/hydration → meaningful application shell. */
  shellReadyMs: number | null;
  /** Sample request start → trustworthy sample result (request duration). */
  sampleRequestMs: number | null;
  /** Navigation → the first trustworthy sample result is shown. */
  firstTrustworthyResultMs: number | null;
  /** First real upload that followed a completed sample (request duration). */
  firstUploadAfterSampleMs: number | null;
  /** First real upload with no completed sample beforehand (request duration). */
  firstUploadWithoutSampleMs: number | null;
}

/** sessionStorage key; also read directly by Playwright to verify the lifecycle. */
export const PRECHECK_TIMING_KEY = "label-lens.precheck-timing.v1";

const EMPTY: PrecheckTiming = {
  shellReadyMs: null,
  sampleRequestMs: null,
  firstTrustworthyResultMs: null,
  firstUploadAfterSampleMs: null,
  firstUploadWithoutSampleMs: null,
};

type TimingField = keyof PrecheckTiming;

/** Monotonic clock reading in ms since navigation start; 0 where unavailable. */
export function nowMs(): number {
  try {
    return performance.now();
  } catch {
    return 0;
  }
}

function isFiniteMs(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function read(): PrecheckTiming {
  try {
    const raw = window.sessionStorage.getItem(PRECHECK_TIMING_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<PrecheckTiming>;
    const out: PrecheckTiming = { ...EMPTY };
    for (const key of Object.keys(EMPTY) as TimingField[]) {
      out[key] = isFiniteMs(parsed[key]) ? (parsed[key] as number) : null;
    }
    return out;
  } catch {
    return { ...EMPTY };
  }
}

function write(timing: PrecheckTiming): void {
  try {
    window.sessionStorage.setItem(PRECHECK_TIMING_KEY, JSON.stringify(timing));
  } catch {
    // Storage unavailable (private mode, SSR, tests): measurement is best-effort
    // and never blocks the workflow.
  }
}

/** Record a field's first measurement; later measurements of the same field are ignored. */
function recordOnce(field: TimingField, ms: number): void {
  if (!isFiniteMs(ms)) return;
  const current = read();
  if (current[field] !== null) return;
  write({ ...current, [field]: ms });
}

/** The current recorded measurements. */
export function getPrecheckTiming(): PrecheckTiming {
  return read();
}

export function recordShellReadyMs(ms: number): void {
  recordOnce("shellReadyMs", ms);
}

export function recordSampleRequestMs(ms: number): void {
  recordOnce("sampleRequestMs", ms);
}

export function recordFirstTrustworthyResultMs(ms: number): void {
  recordOnce("firstTrustworthyResultMs", ms);
}

export function recordFirstUploadAfterSampleMs(ms: number): void {
  recordOnce("firstUploadAfterSampleMs", ms);
}

export function recordFirstUploadWithoutSampleMs(ms: number): void {
  recordOnce("firstUploadWithoutSampleMs", ms);
}

/**
 * True once a sample run has completed in this session. This is an observed
 * fact about sequence only — it does NOT assert anything about host state or
 * that a subsequent request will be faster.
 */
export function hasCompletedSampleRun(): boolean {
  return read().sampleRequestMs !== null;
}

/** Reset all recorded timing (tests and explicit resets). */
export function clearPrecheckTiming(): void {
  try {
    window.sessionStorage.removeItem(PRECHECK_TIMING_KEY);
  } catch {
    // ignore
  }
}
