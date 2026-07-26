/**
 * Resolves Better Auth's `advanced.ipAddress` rate-limit config from two
 * optional, comma-separated environment variables:
 *
 * - `LABEL_LENS_TRUSTED_IP_HEADERS` — header names to read the client IP from,
 *   in priority order (Better Auth default: `x-forwarded-for` only).
 * - `LABEL_LENS_TRUSTED_PROXIES` — IP/CIDR entries for the proxy hop(s) that
 *   are allowed to sit in front of the app. Better Auth strips these from a
 *   forwarded-for chain (right to left) to find the first untrusted, and
 *   therefore trustworthy, client hop.
 *
 * Hostinger's managed "Web App" hosting product does not publish a stable,
 * documented reverse-proxy header or IP contract for this layer (checked
 * hostinger.com's own Node.js Web App hosting docs), so neither value is
 * hardcoded here — that would be exactly the "speculative Hostinger header
 * assumption committed as fact" this issue's guardrails forbid. An operator
 * who has confirmed the real values (via Hostinger support, or by inspecting
 * an authenticated diagnostic of live request headers) sets them as ordinary
 * deployment environment variables; until then this resolves to `undefined`
 * for both keys, which is byte-for-byte the same as omitting `ipAddress`
 * entirely — the existing shared-bucket fallback and its warning persist,
 * unchanged, rather than silently trusting an unverified header or proxy.
 */
export interface TrustedIpAddressConfig {
  ipAddressHeaders?: string[];
  trustedProxies?: string[];
}

export interface TrustedIpEnv {
  LABEL_LENS_TRUSTED_IP_HEADERS?: string;
  LABEL_LENS_TRUSTED_PROXIES?: string;
}

function parseCommaList(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const parsed = value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return parsed.length > 0 ? parsed : undefined;
}

export function resolveTrustedIpAddressConfig(env: TrustedIpEnv): TrustedIpAddressConfig {
  const ipAddressHeaders = parseCommaList(env.LABEL_LENS_TRUSTED_IP_HEADERS);
  const trustedProxies = parseCommaList(env.LABEL_LENS_TRUSTED_PROXIES);
  return {
    ...(ipAddressHeaders ? { ipAddressHeaders } : {}),
    ...(trustedProxies ? { trustedProxies } : {}),
  };
}
