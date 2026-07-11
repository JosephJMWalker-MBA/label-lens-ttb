import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Stateless, server-issued authorization for appending an operator disposition.
 *
 * The disposition-append endpoint accepts a client-submitted machine result and
 * recomputes its canonical `machineResultId` through the committed parser. That
 * recomputation proves the submitted content is internally self-consistent, but
 * NOT that this server ever produced it — a self-consistent record can be forged
 * offline. This token closes that gap: the server signs the recomputed
 * `machineResultId` with an HMAC-SHA256 secret it never discloses, so only a
 * result this server actually assembled carries a verifiable append token.
 *
 * The signed message is a bounded, versioned string:
 *
 *   append-token.v1:<machineResultId>
 *
 * The token is deterministic in the machineResultId, so it is stable across
 * successive disposition appends (immutable machine content ⇒ unchanged id ⇒
 * unchanged token). It authenticates provenance only; it is never a checksum and
 * never a substitute for the export's integrity hash.
 */

const TOKEN_VERSION = "append-token.v1";
const ENV_KEY = "LABEL_LENS_APPEND_SIGNING_KEY";
/** Minimum acceptable production secret length, in characters. */
const MIN_PRODUCTION_KEY_LENGTH = 32;

/** The public request field name the browser sends the token back in. */
export const APPEND_TOKEN_FIELD = "appendToken";

export type AppendTokenErrorCode =
  "APPEND_SIGNING_KEY_UNAVAILABLE" | "MISSING_APPEND_TOKEN" | "INVALID_APPEND_TOKEN";

export interface AppendTokenError {
  code: AppendTokenErrorCode;
}

type KeyResolution = { ok: true; key: string } | { ok: false; error: AppendTokenError };

/**
 * A process-local development secret. It is generated once per process and does
 * NOT survive a server restart, so development tokens issued before a restart
 * stop verifying after it. Production must supply a durable environment secret.
 *
 * It is cached on `globalThis` rather than in a module variable so that all
 * route handlers share one secret even when the dev server evaluates this module
 * in separate compilation graphs — otherwise a token issued by the pre-check
 * route would not verify in the disposition route.
 */
const DEV_KEY_SYMBOL = Symbol.for("label-lens.append-signing.dev-key");

function developmentSigningKey(): string {
  const store = globalThis as Record<symbol, string | undefined>;
  if (store[DEV_KEY_SYMBOL] === undefined) {
    store[DEV_KEY_SYMBOL] = randomBytes(32).toString("hex");
  }
  return store[DEV_KEY_SYMBOL] as string;
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Resolve the signing secret, or fail with APPEND_SIGNING_KEY_UNAVAILABLE. */
function resolveSigningKey(): KeyResolution {
  const fromEnv = process.env[ENV_KEY];
  if (typeof fromEnv === "string" && fromEnv.length > 0) {
    if (isProduction() && fromEnv.length < MIN_PRODUCTION_KEY_LENGTH) {
      return { ok: false, error: { code: "APPEND_SIGNING_KEY_UNAVAILABLE" } };
    }
    return { ok: true, key: fromEnv };
  }
  // Production must never fall back to a process-local secret.
  if (isProduction()) {
    return { ok: false, error: { code: "APPEND_SIGNING_KEY_UNAVAILABLE" } };
  }
  return { ok: true, key: developmentSigningKey() };
}

/** The bounded, versioned message that is signed for a given machine result. */
function messageFor(machineResultId: string): string {
  return `${TOKEN_VERSION}:${machineResultId}`;
}

function sign(key: string, machineResultId: string): string {
  return createHmac("sha256", key).update(messageFor(machineResultId)).digest("hex");
}

/**
 * Issue a server append-authorization token for an assembled machine result.
 * Fails with APPEND_SIGNING_KEY_UNAVAILABLE only when no signing secret is
 * available; a returned token is opaque to clients.
 */
export function issueAppendToken(
  machineResultId: string,
): { ok: true; token: string } | { ok: false; error: AppendTokenError } {
  const resolved = resolveSigningKey();
  if (!resolved.ok) return resolved;
  return { ok: true, token: sign(resolved.key, machineResultId) };
}

/**
 * Verify a client-submitted token authorizes appending to `machineResultId`
 * (the id the server recomputed from the submitted content). The comparison is
 * timing-safe. A missing token is MISSING_APPEND_TOKEN; a malformed or forged
 * token is INVALID_APPEND_TOKEN; an unavailable secret is
 * APPEND_SIGNING_KEY_UNAVAILABLE.
 */
export function verifyAppendToken(
  token: unknown,
  machineResultId: string,
): { ok: true } | { ok: false; error: AppendTokenError } {
  if (typeof token !== "string" || token.trim() === "") {
    return { ok: false, error: { code: "MISSING_APPEND_TOKEN" } };
  }
  const resolved = resolveSigningKey();
  if (!resolved.ok) return resolved;

  const expected = sign(resolved.key, machineResultId);
  // Reject anything that is not a same-length hex digest before comparing, so
  // timingSafeEqual always receives equal-length buffers.
  if (!/^[0-9a-f]+$/i.test(token) || token.length !== expected.length) {
    return { ok: false, error: { code: "INVALID_APPEND_TOKEN" } };
  }
  const matches = timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(expected, "hex"));
  if (!matches) return { ok: false, error: { code: "INVALID_APPEND_TOKEN" } };
  return { ok: true };
}
