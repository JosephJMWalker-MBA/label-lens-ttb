/**
 * Bounded, browser-native measurement of the pre-check path's cold vs. warm
 * latency — recorded separately so we can tell whether the first-visit sample
 * warm-up actually helped the user's first real upload.
 *
 * Definitions (per the productive cold-start design):
 * - "cold": the first-visit verified sample run. It pays server initialization.
 * - "warm": the user's first real upload afterwards, on the now-warm service.
 *
 * We measure request→trustworthy-result duration with `performance.now()` (not
 * time-to-animation) and persist the pair in `sessionStorage` so the comparison
 * survives the onboarding→upload transition within a single session. There is no
 * server call, no account, and nothing identifying is stored.
 */

export interface PrecheckTiming {
  /** Duration of the first-visit sample warm-up, in ms. Null until measured. */
  coldMs: number | null;
  /** Duration of the first real upload after warm-up, in ms. Null until measured. */
  warmMs: number | null;
}

const STORAGE_KEY = "label-lens.precheck-timing.v1";

const EMPTY: PrecheckTiming = { coldMs: null, warmMs: null };

/** A monotonic clock reading in ms; 0 where `performance` is unavailable. */
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
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...EMPTY };
    const parsed = JSON.parse(raw) as Partial<PrecheckTiming>;
    return {
      coldMs: isFiniteMs(parsed.coldMs) ? parsed.coldMs : null,
      warmMs: isFiniteMs(parsed.warmMs) ? parsed.warmMs : null,
    };
  } catch {
    return { ...EMPTY };
  }
}

function write(timing: PrecheckTiming): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(timing));
  } catch {
    // Storage unavailable (private mode, SSR, tests): measurement is best-effort
    // and never blocks the workflow.
  }
}

/** The current recorded cold/warm pair. */
export function getPrecheckTiming(): PrecheckTiming {
  return read();
}

/**
 * Record the cold warm-up duration. Only the first cold measurement in a session
 * is kept, so a replay of onboarding never overwrites the genuine first-visit
 * number.
 */
export function recordColdMs(ms: number): void {
  if (!isFiniteMs(ms)) return;
  const current = read();
  if (current.coldMs !== null) return;
  write({ ...current, coldMs: ms });
}

/**
 * Record the warm-run duration. Only recorded once, and only after a cold run
 * exists — otherwise the upload is not a genuine "warm" comparison and is left
 * unmeasured rather than mislabeled.
 */
export function recordWarmMs(ms: number): void {
  if (!isFiniteMs(ms)) return;
  const current = read();
  if (current.coldMs === null || current.warmMs !== null) return;
  write({ ...current, warmMs: ms });
}

/** True once the service has been warmed by a completed cold sample run. */
export function isServiceWarm(): boolean {
  return read().coldMs !== null;
}

/** Reset all recorded timing (used by tests and by an explicit replay reset). */
export function clearPrecheckTiming(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
