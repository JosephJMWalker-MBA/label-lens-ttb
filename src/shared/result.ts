/**
 * A minimal typed result for expected (non-exceptional) failures.
 *
 * Pipeline stages return `Result` so callers must handle failure explicitly
 * instead of relying on thrown exceptions. Unexpected failures still throw and
 * are converted at the HTTP boundary. Richer variants (e.g. warnings) will be
 * introduced by the slice that first needs them.
 */
export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): { ok: true; value: T } {
  return { ok: true, value };
}

export function err<E>(error: E): { ok: false; error: E } {
  return { ok: false, error };
}
