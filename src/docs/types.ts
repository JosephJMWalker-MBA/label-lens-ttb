/**
 * Deterministic documentation-integrity validator (Issue #28).
 *
 * The repository treats documentation, ADRs, policies, and review artifacts as
 * part of the governed system. This validator catches mechanical/structural
 * documentation failures — broken links, malformed fences, ADR-identity drift,
 * abrupt truncation — that ordinary TypeScript tests do not. It requires no
 * network access and no external Markdown parser.
 */

/** Stable diagnostic codes. Kept stable so results are machine-testable. */
export const DIAGNOSTIC_CODES = [
  // Link integrity
  "LINK_BROKEN", // repo-relative link target does not exist
  "LINK_EMPTY", // empty link/image target where not intentional
  "LINK_ANCHOR_MISSING", // target file exists but the #anchor heading does not
  // Fenced code integrity
  "FENCE_UNCLOSED", // a fenced code block is never closed before EOF
  // ADR identity/metadata
  "ADR_ID_DUPLICATE", // two ADR files share the same numeric id
  "ADR_ID_MISMATCH", // filename id != heading id
  "ADR_TITLE_MISSING", // no level-1 title heading
  "ADR_STATUS_MISSING", // no recognizable status
  "ADR_STATUS_INVALID", // status value not in the accepted set
  "ADR_DATE_MISSING", // bullet-format ADR without a date (warning)
  // Accepted-policy structural completeness
  "POLICY_TITLE_MISSING",
  "POLICY_STATUS_MISSING",
  "POLICY_SECTION_MISSING", // fewer than the bounded minimum of substantive sections
  // Abrupt truncation (a file ending inside an unclosed fence is reported as
  // FENCE_UNCLOSED above).
  "TRUNC_EMPTY_FINAL_HEADING", // final heading has no body
  "TRUNC_DANGLING_WORD", // ends on a conjunction/preposition/article/modal
  "TRUNC_PROSE_NO_TERMINAL", // final prose paragraph ends without terminal punctuation
  "TRUNC_TRAILING_COLON", // final line ends with a dangling colon (promised content missing)
  // Structural sanity
  "HEADING_NO_SPACE", // '#' run with no following space (won't render as a heading)
  "TABLE_SEPARATOR_INVALID", // a table separator row is malformed
] as const;

export type DiagnosticCode = (typeof DIAGNOSTIC_CODES)[number];

export type Severity = "error" | "warning";

/** One structured, file-specific diagnostic. */
export interface DocumentationDiagnostic {
  code: DiagnosticCode;
  severity: Severity;
  /** Repository-relative POSIX path of the source document. */
  file: string;
  /** 1-based line number, when the problem anchors to a line. */
  line?: number;
  message: string;
  /** Optional extra context (e.g. the resolved path that was attempted). */
  detail?: string;
}

/** How a document is classified; different classes get different checks. */
export type DocClass =
  | "readme"
  | "adr"
  | "policy" // self-declares an accepted governing status
  | "review-artifact"
  | "historical" // preserved background (e.g. original-vision-and-scope)
  | "corpus" // corpus inventories (mostly tables)
  | "research"
  | "ordinary";

export interface ClassifiedDoc {
  file: string;
  docClass: DocClass;
  text: string;
}
