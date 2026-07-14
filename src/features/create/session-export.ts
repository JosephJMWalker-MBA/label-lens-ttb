import type { ResolvedLabelRequirement } from "@/domain/requirements/requirement.types";
import { canonicalStringify } from "@/pipeline/export/json/canonical-stringify";

import { PROJECT_FACT_IDS, type ProjectFacts } from "./facts";
import { buildRequirementsSummary } from "./requirements-summary";

/**
 * Session export for a guided-facts project.
 *
 * Session-only by design. Nothing is persisted, no project is stored, and this
 * file is the artifact a later step — design, review, or a professional — would
 * consume. It reuses the repository's existing export pattern: the same
 * canonical serialization, and a SHA-256 integrity block over everything except
 * that block.
 *
 * The hash is computed with Web Crypto rather than `node:crypto`, because the
 * facts live in the browser and this slice adds no API. It is the same algorithm
 * over the same canonical bytes.
 *
 * **What the checksum is, and is not.** It is a plain SHA-256 over the canonical
 * payload. It detects a file that was *changed without the checksum being
 * recomputed* — an accidental edit, a truncated copy, a hand-tweaked field. It
 * is **not** a signature, **not** tamper resistance, and **not** proof of
 * authorship: anyone who edits the payload can recompute the hash with the same
 * committed logic and produce a file that verifies. Nothing here should be
 * described, in code or in UI, as making the artifact tamper-proof or attesting
 * to who produced it.
 *
 * The export keeps provenance separated, which is the whole point of it:
 *
 *   `declaredFacts`     — what the maker said. Assertions, not evidence.
 *   `citedRequirements` — what the merged registry states, with citations,
 *                         each carrying how that citation entered the system.
 *
 * Nothing in this file evaluates a fact against a requirement. There is no
 * status, score, verdict, or readiness figure, and there never may be.
 */

export const PROJECT_FACTS_EXPORT_TYPE = "label-lens-project-facts";
export const PROJECT_FACTS_SCHEMA_VERSION = "label-lens-project-facts.v1";
export const HASH_ALGORITHM = "SHA-256";
export const INTEGRITY_SCOPE = "export-payload-without-integrity";

/** Fixed, versioned advisory wording. A constant — never generated at runtime. */
export const PROJECT_FACTS_ADVISORY = Object.freeze({
  noticeId: "project-facts-advisory-notice",
  noticeVersion: "1.0.0",
  text:
    "This file records product facts you supplied and the cited requirements this system currently holds. " +
    "It is not a TTB approval, a legal opinion, or a determination that a label is complete or compliant. " +
    "Fields with no cited requirement here may still be required. A qualified human remains responsible for review and submission decisions.",
});

export interface ProjectFactsIntegrity {
  algorithm: typeof HASH_ALGORITHM;
  scope: typeof INTEGRITY_SCOPE;
  /** 64 lowercase hex characters. */
  value: string;
}

/**
 * How a citation entered the system, carried into the durable artifact.
 *
 * The registry distinguishes two fundamentally different paths to authority,
 * and a bare citation flattens them into one. That distinction is the point of
 * the whole design — **humans author authority** — so it must survive export.
 *
 * Today both seeded requirements are rule-derived, so nothing visible is lost
 * yet. But this schema is `v1` and the artifact is durable: the moment a
 * human-reviewed citation enters the registry, an export that recorded only the
 * citation would discard **who reviewed it and when**. A downstream reader could
 * no longer tell a citation a person put their name to from one derived
 * mechanically. The registry refuses to let a citation exist without one of
 * these provenances; the export must not quietly undo that.
 *
 * This is the export-safe projection: the human-authored variant carries the
 * reviewer and the review date, not a nested authority block — the citation and
 * snapshot date already sit on the requirement itself.
 */
export type ExportedAuthorityProvenance =
  | { kind: "registered-rule-authority"; ruleId: string }
  | { kind: "human-authored"; reviewedBy: string; reviewedAt: string };

/** One cited requirement, copied from the registry. Never authored here. */
export interface ExportedRequirement {
  requirementId: string;
  version: string;
  fieldId: string;
  citation: string;
  snapshotDate: string;
  /** Which path this citation entered the system by. Never flattened away. */
  authorityProvenance: ExportedAuthorityProvenance;
  applicability: string;
  conditionExternalEvidence: string | null;
  checkedByRuleIds: string[];
  evaluableFromArtwork: boolean;
}

export interface ProjectFactsPayload {
  exportType: typeof PROJECT_FACTS_EXPORT_TYPE;
  schemaVersion: typeof PROJECT_FACTS_SCHEMA_VERSION;
  advisoryNotice: typeof PROJECT_FACTS_ADVISORY;
  /** The maker's assertions. */
  declaredFacts: Record<string, string | null>;
  /** The category the facts were recorded under, and whether we hold a profile. */
  category: { beverageType: string | null; requirementsProfileApplies: boolean };
  requirementsProfile: { id: string; version: string };
  /** Empty when the category has no profile in this system. */
  citedRequirements: ExportedRequirement[];
}

export interface ProjectFactsExport extends ProjectFactsPayload {
  integrity: ProjectFactsIntegrity;
}

export type ProjectFactsExportErrorCode =
  | "INVALID_JSON"
  | "INVALID_EXPORT_SHAPE"
  | "UNSUPPORTED_SCHEMA_VERSION"
  | "INTEGRITY_MISMATCH"
  | "CHECKSUM_UNAVAILABLE";

export interface ProjectFactsExportError {
  code: ProjectFactsExportErrorCode;
  message: string;
}

export type ExportResult<T> =
  { ok: true; value: T } | { ok: false; error: ProjectFactsExportError };

/** SHA-256 (lowercase hex) over the canonical serialization, via Web Crypto. */
async function sha256Hex(text: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("CHECKSUM_UNAVAILABLE");
  }
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Project a registry requirement into its export-safe form.
 *
 * Exhaustive over the provenance union, so a new authority path cannot be added
 * to the registry and silently vanish from the artifact: the compiler will
 * demand a case for it here.
 */
export function toExportedRequirement(requirement: ResolvedLabelRequirement): ExportedRequirement {
  const source = requirement.authorityProvenance;
  const authorityProvenance: ExportedAuthorityProvenance =
    source.kind === "registered-rule-authority"
      ? { kind: "registered-rule-authority", ruleId: source.ruleId }
      : {
          kind: "human-authored",
          reviewedBy: source.reviewedBy,
          reviewedAt: source.reviewedAt,
        };

  return {
    requirementId: requirement.requirementId,
    version: requirement.version,
    fieldId: requirement.fieldId,
    citation: requirement.authority.citation,
    snapshotDate: requirement.authority.snapshotDate,
    authorityProvenance,
    applicability: requirement.applicability,
    conditionExternalEvidence: requirement.conditionExternalEvidence,
    checkedByRuleIds: [...requirement.checkedByRuleIds],
    evaluableFromArtwork: requirement.evaluableFromArtwork,
  };
}

/** The payload, built deterministically. No timestamps, randomness, or environment. */
export function buildProjectFactsPayload(facts: ProjectFacts): ProjectFactsPayload {
  const summary = buildRequirementsSummary(facts);

  const declaredFacts: Record<string, string | null> = {};
  for (const id of PROJECT_FACT_IDS) declaredFacts[id] = facts[id];

  const citedRequirements: ExportedRequirement[] = summary.rows
    .map((row) => row.requirement)
    .filter((requirement): requirement is ResolvedLabelRequirement => requirement !== null)
    .map(toExportedRequirement);

  return {
    exportType: PROJECT_FACTS_EXPORT_TYPE,
    schemaVersion: PROJECT_FACTS_SCHEMA_VERSION,
    advisoryNotice: PROJECT_FACTS_ADVISORY,
    declaredFacts,
    category: {
      beverageType: summary.beverageType,
      requirementsProfileApplies: summary.categorySupported,
    },
    requirementsProfile: summary.requirementsProfile,
    citedRequirements,
  };
}

/** Seal a payload: canonical text plus its integrity block. */
export async function sealProjectFactsExport(payload: ProjectFactsPayload): Promise<string> {
  const value = await sha256Hex(canonicalStringify(payload));
  const exported: ProjectFactsExport = {
    ...payload,
    integrity: { algorithm: HASH_ALGORITHM, scope: INTEGRITY_SCOPE, value },
  };
  return canonicalStringify(exported);
}

/** Canonical export text with its integrity block. */
export async function buildProjectFactsExport(facts: ProjectFacts): Promise<string> {
  return sealProjectFactsExport(buildProjectFactsPayload(facts));
}

/** Deterministic filename, derived from the checksum. Never from user text. */
export function projectFactsFilename(checksum: string): string {
  return `label-lens-project-facts-${PROJECT_FACTS_SCHEMA_VERSION}-${checksum}.json`;
}

function shapeError(message: string): ProjectFactsExportError {
  return { code: "INVALID_EXPORT_SHAPE", message };
}

/**
 * The hashed payload: everything the file carries except the integrity block.
 *
 * Every other key is preserved, including any this version does not know about,
 * so the checksum is recomputed over exactly what the file contains. Rebuilding
 * the payload from known keys only would leave an added key out of the hash, so
 * a file carrying one would still verify — and the check would be weaker than it
 * appears. This closes that gap for changes made *without* recomputing the
 * checksum; it does not make the file tamper-proof.
 */
function hashedPayload(exported: ProjectFactsExport): unknown {
  const clone: Record<string, unknown> = { ...exported };
  delete clone.integrity;
  return clone;
}

/**
 * Parse an export and re-verify its checksum with the committed logic.
 *
 * A file whose integrity does not recompute is rejected rather than partially
 * trusted: a facts record that has been edited outside this system is not the
 * record this system produced, and must not be presented as if it were.
 */
export async function parseProjectFactsExport(
  text: string,
): Promise<ExportResult<ProjectFactsExport>> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: { code: "INVALID_JSON", message: "The file is not valid JSON." } };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: shapeError("The file is not a project-facts export.") };
  }

  const candidate = parsed as Partial<ProjectFactsExport>;
  if (candidate.exportType !== PROJECT_FACTS_EXPORT_TYPE) {
    return { ok: false, error: shapeError("The file is not a project-facts export.") };
  }
  if (candidate.schemaVersion !== PROJECT_FACTS_SCHEMA_VERSION) {
    return {
      ok: false,
      error: {
        code: "UNSUPPORTED_SCHEMA_VERSION",
        message: "The file uses an export schema this version does not understand.",
      },
    };
  }
  const integrity = candidate.integrity;
  if (
    !integrity ||
    integrity.algorithm !== HASH_ALGORITHM ||
    integrity.scope !== INTEGRITY_SCOPE ||
    typeof integrity.value !== "string"
  ) {
    return { ok: false, error: shapeError("The file has no usable integrity block.") };
  }
  if (!candidate.declaredFacts || typeof candidate.declaredFacts !== "object") {
    return { ok: false, error: shapeError("The file records no declared facts.") };
  }

  let recomputed: string;
  try {
    recomputed = await sha256Hex(
      canonicalStringify(hashedPayload(candidate as ProjectFactsExport)),
    );
  } catch {
    return {
      ok: false,
      error: {
        code: "CHECKSUM_UNAVAILABLE",
        message: "The checksum could not be computed in this environment.",
      },
    };
  }
  if (recomputed !== integrity.value) {
    return {
      ok: false,
      error: {
        code: "INTEGRITY_MISMATCH",
        message: "The file's checksum does not match its contents. It has been changed.",
      },
    };
  }

  return { ok: true, value: candidate as ProjectFactsExport };
}
