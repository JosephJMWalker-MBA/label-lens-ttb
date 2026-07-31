/**
 * Issue #149 — canonical candidate fingerprint, frozen at Stage 1.
 *
 * Evaluation-only and non-OCR. This is the reference implementation of the
 * algorithm frozen in
 * `artifacts/issue-149-brand-complete-evidence-acquisition/candidate-fingerprint-contract.json`.
 * Stage 2's acquisition must use it rather than reimplementing the rules.
 *
 * It imports no production module, no governed truth and no fixture.
 */
import { createHash } from "node:crypto";

export const CANDIDATE_CANONICALIZATION_VERSION = "issue-149-candidate-canonical-v1";

/** Derived fields excluded from the preimage, because including them is circular. */
export const CANDIDATE_FINGERPRINT_EXCLUDED_KEYS = [
  "canonicalRecordSha256",
  "stableCandidateId",
] as const;

export class CandidateCanonicalizationError extends Error {
  constructor(
    readonly code: "UNDEFINED_ARRAY_VALUE" | "NON_FINITE_NUMBER",
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = "CandidateCanonicalizationError";
  }
}

type Json = unknown;

/**
 * Canonical JSON: keys recursively sorted, array order preserved, undefined
 * object properties omitted, no whitespace. Fails closed on an undefined array
 * value or a non-finite number rather than silently emitting `null`, which is
 * what `JSON.stringify` would do.
 */
export function canonicalize(value: Json, path = "$"): string {
  if (value === null) return "null";

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new CandidateCanonicalizationError("NON_FINITE_NUMBER", `${path} is ${String(value)}`);
    }
    return JSON.stringify(value);
  }

  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);

  if (Array.isArray(value)) {
    const parts = value.map((entry, index) => {
      if (entry === undefined) {
        throw new CandidateCanonicalizationError(
          "UNDEFINED_ARRAY_VALUE",
          `${path}[${index}] is undefined`,
        );
      }
      return canonicalize(entry, `${path}[${index}]`);
    });
    return `[${parts.join(",")}]`;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort();
    const parts = keys.map(
      (key) => `${JSON.stringify(key)}:${canonicalize(record[key], `${path}.${key}`)}`,
    );
    return `{${parts.join(",")}}`;
  }

  // `undefined` at the top level, functions, symbols and bigints are not valid
  // evidence values and are rejected rather than coerced.
  throw new CandidateCanonicalizationError(
    "UNDEFINED_ARRAY_VALUE",
    `${path} has unsupported type ${typeof value}`,
  );
}

/** The preimage: the record minus exactly the two derived fields. */
export function fingerprintPreimage(record: Record<string, unknown>): Record<string, unknown> {
  const preimage: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if ((CANDIDATE_FINGERPRINT_EXCLUDED_KEYS as readonly string[]).includes(key)) continue;
    preimage[key] = value;
  }
  return preimage;
}

/** Lowercase 64-character SHA-256 over the UTF-8 canonical bytes. */
export function canonicalRecordSha256(record: Record<string, unknown>): string {
  return createHash("sha256")
    .update(Buffer.from(canonicalize(fingerprintPreimage(record)), "utf8"))
    .digest("hex");
}

export class CandidateRecordError extends Error {
  constructor(
    readonly code:
      | "MISSING_OPAQUE_ITEM_ID"
      | "MISSING_CANDIDATE_ORDINAL"
      | "MISSING_DIGEST"
      | "MALFORMED_DIGEST"
      | "DIGEST_DOES_NOT_MATCH_RECORD",
    detail: string,
  ) {
    super(`${code}: ${detail}`);
    this.name = "CandidateRecordError";
  }
}

const LOWER_HEX_64 = /^[0-9a-f]{64}$/;

/**
 * Build the stable id. Fails closed.
 *
 * The digest is REQUIRED and is re-derived from the complete record before the
 * id is returned, so a partial object cannot yield a valid-looking id. An
 * earlier revision made the digest optional and computed it from whatever it was
 * given, which meant `{ opaqueItemId, candidateOrdinal }` alone produced a
 * plausible 64-hex id that was never derived from the evidence.
 */
export function stableCandidateId(record: Record<string, unknown>): string {
  const opaqueItemId = record.opaqueItemId;
  const candidateOrdinal = record.candidateOrdinal;
  const digest = record.canonicalRecordSha256;

  if (typeof opaqueItemId !== "string" || opaqueItemId.length === 0) {
    throw new CandidateRecordError(
      "MISSING_OPAQUE_ITEM_ID",
      "opaqueItemId must be a non-empty string",
    );
  }
  if (typeof candidateOrdinal !== "number" || !Number.isInteger(candidateOrdinal)) {
    throw new CandidateRecordError(
      "MISSING_CANDIDATE_ORDINAL",
      "candidateOrdinal must be an integer",
    );
  }
  if (digest === undefined || digest === null) {
    throw new CandidateRecordError(
      "MISSING_DIGEST",
      "canonicalRecordSha256 is required; a stable id may not be built from identity fields alone",
    );
  }
  if (typeof digest !== "string" || !LOWER_HEX_64.test(digest)) {
    throw new CandidateRecordError(
      "MALFORMED_DIGEST",
      `canonicalRecordSha256 must be lowercase 64-hex, received ${JSON.stringify(digest)}`,
    );
  }
  const recomputed = canonicalRecordSha256(record);
  if (recomputed !== digest) {
    throw new CandidateRecordError(
      "DIGEST_DOES_NOT_MATCH_RECORD",
      `supplied ${digest} but the complete record canonicalizes to ${recomputed}`,
    );
  }
  return `${opaqueItemId}:${candidateOrdinal}:${digest}`;
}

/**
 * The preferred entry point: take a complete evidence record and return it with
 * both derived fields attached. There is no path here that produces an id from
 * identity fields alone.
 */
export function finalizeCandidateRecord(
  completeEvidenceRecord: Record<string, unknown>,
): Record<string, unknown> {
  if (Object.hasOwn(completeEvidenceRecord, "canonicalRecordSha256")) {
    throw new CandidateRecordError(
      "MALFORMED_DIGEST",
      "finalizeCandidateRecord expects an unfinalized record; canonicalRecordSha256 is already present",
    );
  }
  const digest = canonicalRecordSha256(completeEvidenceRecord);
  const finalized = { ...completeEvidenceRecord, canonicalRecordSha256: digest };
  return { ...finalized, stableCandidateId: stableCandidateId(finalized) };
}
