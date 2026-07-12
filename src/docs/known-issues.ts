import type { DiagnosticCode } from "./types";

/**
 * Known, pre-existing documentation defects on `main` that this validator (Issue
 * #28) surfaced. Each is a genuine truncation in a governing/architecture
 * document whose missing content is substantive policy prose — repairing it is
 * an authoring task, out of scope for this validator PR, so the defects are
 * recorded here as explicit debt rather than silently rewritten.
 *
 * The gating test asserts the live ERROR set equals this baseline exactly:
 *   - a NEW error not listed here fails CI (the point of the validator);
 *   - a listed entry that no longer reproduces also fails, so this list must be
 *     trimmed when a document is fixed (the debt can only shrink).
 *
 * Do NOT add entries to silence a real new problem — fix the document instead.
 */
export interface KnownIssue {
  file: string;
  code: DiagnosticCode;
  note: string;
}

export const KNOWN_DOC_ISSUES: readonly KnownIssue[] = [
  {
    file: "docs/compliance-readiness.md",
    code: "FENCE_UNCLOSED",
    note: "File is truncated mid-diagram inside an unclosed ```text fence.",
  },
  {
    file: "docs/compliance-rule-taxonomy.md",
    code: "TRUNC_PROSE_NO_TERMINAL",
    note: 'Ends mid-sentence: "…These rules allow differences that do not".',
  },
  {
    file: "docs/ocr-reliability-strategy.md",
    code: "TRUNC_DANGLING_WORD",
    note: 'Ends mid-sentence: "The pipeline must".',
  },
  {
    file: "docs/operator-trust-and-throughput.md",
    code: "TRUNC_DANGLING_WORD",
    note: 'The historically truncated operator-trust policy: ends on "…results, or".',
  },
  {
    file: "docs/system-governance.md",
    code: "TRUNC_EMPTY_FINAL_HEADING",
    note: 'Ends on an empty "## Governance Principle" heading with no body.',
  },
];

/** Stable key for comparing diagnostics against the baseline. */
export function issueKey(x: { file: string; code: string }): string {
  return `${x.file}::${x.code}`;
}
