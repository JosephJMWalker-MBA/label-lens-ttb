import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * TEMPORARY diagnostic (issue #183). Exists only to identify Hostinger's live
 * reverse-proxy header/hop behavior so Better Auth's trusted client-IP config
 * (issue #164) can be set from observed evidence instead of a guess. Must be
 * removed once that evidence has been collected and documented — see
 * docs/deployment.md "Temporary Hostinger proxy header diagnostic (issue #183)".
 *
 * Hard privacy rule for every function in this file: never accept, retain, or
 * return a raw header value, cookie, `authorization` value, session token,
 * user identity, query string, or request body. Only a keyed HMAC digest of a
 * normalized value may leave this module, and only so two observations can be
 * compared as "same" or "different" — never so the underlying value can be
 * recovered.
 */

/** Header names checked for presence only; values are never returned raw. */
export const CANDIDATE_PROXY_HEADERS = [
  "x-forwarded-for",
  "x-real-ip",
  "forwarded",
  "cf-connecting-ip",
  "true-client-ip",
  "x-client-ip",
  "fastly-client-ip",
  "x-cluster-client-ip",
] as const;

export interface ProxyDiagnosticHeaderReport {
  header: string;
  present: boolean;
  /** Number of comma-separated hops in the header's normalized value (0 if absent). */
  hopCount: number;
  /** One HMAC-SHA256 hex digest per hop, in header order. Never the raw hop value. */
  hopDigests: string[];
}

export interface ProxyDiagnosticReport {
  correlationId: string;
  observedAt: string;
  headers: ProxyDiagnosticHeaderReport[];
  /**
   * Next.js Route Handlers receive a standard Web `Request`/`Headers` object
   * with no access to the underlying TCP socket, so the direct peer address
   * cannot be observed from this runtime layer. Recorded explicitly (as
   * `false`/`null`) rather than approximated, so the deployment doc's
   * evidence table isn't silently missing a row.
   */
  peerAddressAvailable: false;
  peerAddressDigest: null;
}

function digestHop(hop: string, hmacSecret: string): string {
  return createHmac("sha256", hmacSecret).update(hop.trim().toLowerCase()).digest("hex");
}

function reportForHeader(
  headers: Headers,
  header: string,
  hmacSecret: string,
): ProxyDiagnosticHeaderReport {
  const raw = headers.get(header);
  if (raw === null) {
    return { header, present: false, hopCount: 0, hopDigests: [] };
  }
  const hops = raw
    .split(",")
    .map((hop) => hop.trim())
    .filter((hop) => hop.length > 0);
  return {
    header,
    present: true,
    hopCount: hops.length,
    hopDigests: hops.map((hop) => digestHop(hop, hmacSecret)),
  };
}

/**
 * Builds the bounded, redacted diagnostic report for one request. The shape
 * is fixed (no arbitrary header dump), and every value that could identify a
 * real client is either a boolean, a count, or a keyed one-way digest.
 */
export function buildProxyDiagnosticReport(
  headers: Headers,
  hmacSecret: string,
  now: () => Date = () => new Date(),
): ProxyDiagnosticReport {
  return {
    correlationId: randomUUID(),
    observedAt: now().toISOString(),
    headers: CANDIDATE_PROXY_HEADERS.map((header) => reportForHeader(headers, header, hmacSecret)),
    peerAddressAvailable: false,
    peerAddressDigest: null,
  };
}

/**
 * Constant-time operator-token comparison. Both sides are hashed to a fixed
 * length first so comparison time never leaks how many leading characters of
 * a guessed token matched, and so a length mismatch never short-circuits.
 */
export function verifyDiagnosticToken(provided: string, configured: string): boolean {
  if (provided.length === 0 || configured.length === 0) return false;
  const providedDigest = createHash("sha256").update(provided).digest();
  const configuredDigest = createHash("sha256").update(configured).digest();
  return timingSafeEqual(providedDigest, configuredDigest);
}
