import { createHmac, randomBytes } from "node:crypto";

const INTEGRITY_VERSION = "v1";
const INTEGRITY_ENV_KEY = "LABEL_LENS_INTEGRITY_SECRET";

const INTEGRITY_SYMBOL = Symbol.for("label-lens.integrity.dev-secret");

function getIntegritySecret(): string {
  const store = globalThis as Record<symbol, string | undefined>;
  
  if (process.env.NODE_ENV === "production") {
    const key = process.env[INTEGRITY_ENV_KEY];
    if (!key || key.length < 32) {
      throw new Error("LABEL_LENS_INTEGRITY_SECRET is not configured or too short in production");
    }
    return key;
  }
  
  if (process.env[INTEGRITY_ENV_KEY]) {
    return process.env[INTEGRITY_ENV_KEY] as string;
  }
  
  if (!store[INTEGRITY_SYMBOL]) {
    store[INTEGRITY_SYMBOL] = randomBytes(32).toString("hex");
  }
  
  return store[INTEGRITY_SYMBOL] as string;
}

/**
 * Signs canonical JSON package metadata with a versioned HMAC-SHA256 signature.
 * Prefix format: "v1:<hex-signature>"
 */
export function signRevision(canonicalJson: string): string {
  const secret = getIntegritySecret();
  const signature = createHmac("sha256", secret).update(canonicalJson).digest("hex");
  return `${INTEGRITY_VERSION}:${signature}`;
}

/**
 * Verifies a signature matches the computed HMAC-SHA256 for a given canonical JSON string.
 */
export function verifyRevision(canonicalJson: string, expectedSignature: string): boolean {
  const parts = expectedSignature.split(":");
  if (parts.length !== 2) {
    return false;
  }
  const [version, signature] = parts;
  if (version !== INTEGRITY_VERSION) {
    return false;
  }
  
  const secret = getIntegritySecret();
  const computed = createHmac("sha256", secret).update(canonicalJson).digest("hex");
  
  // Use constant-time comparison in crypto to prevent timing side-channel attacks
  try {
    const crypto = require("node:crypto");
    return crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(signature, "hex"));
  } catch {
    return computed === signature;
  }
}
