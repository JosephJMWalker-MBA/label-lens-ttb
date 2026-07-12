/**
 * Documentation-integrity CLI.
 *
 * Runs the validator over the tracked Markdown set and prints every diagnostic
 * in deterministic order, distinguishing known-baselined errors, new errors,
 * stale baseline entries, and warnings. It exits non-zero for any NEW error or
 * any STALE baseline entry, and zero when the only errors exactly match the
 * documented baseline. All paths are repository-relative — no absolute local
 * paths are printed.
 *
 * Run with: npm run docs:check
 */
import { KNOWN_DOC_ISSUES, issueKey } from "../src/docs/known-issues.ts";
import type { DocumentationDiagnostic } from "../src/docs/types.ts";
import { errorsOnly, validateDocumentation } from "../src/docs/validate.ts";

function line(d: DocumentationDiagnostic, note?: string): string {
  const loc = d.line ? `:${d.line}` : "";
  const detail = d.detail ? ` (${d.detail})` : "";
  const suffix = note ? `  [${note}]` : "";
  return `  ${d.code} ${d.file}${loc} — ${d.message}${detail}${suffix}`;
}

function section(title: string, body: string[]): void {
  process.stdout.write(`\n${title} (${body.length}):\n`);
  process.stdout.write(body.length ? `${body.join("\n")}\n` : "  (none)\n");
}

function main(): void {
  const diagnostics = validateDocumentation();
  const errors = errorsOnly(diagnostics);
  const warnings = diagnostics.filter((d) => d.severity === "warning");

  const baseKeys = new Set(KNOWN_DOC_ISSUES.map(issueKey));
  const liveKeys = new Set(errors.map(issueKey));
  const noteFor = new Map(KNOWN_DOC_ISSUES.map((k) => [issueKey(k), k.note]));

  const baselined = errors.filter((d) => baseKeys.has(issueKey(d)));
  const newErrors = errors.filter((d) => !baseKeys.has(issueKey(d)));
  const staleBaseline = KNOWN_DOC_ISSUES.filter((k) => !liveKeys.has(issueKey(k)));

  process.stdout.write("Documentation integrity check\n==============================\n");

  section(
    "Known baselined errors",
    baselined.map((d) => line(d, noteFor.get(issueKey(d)))),
  );
  section(
    "New errors",
    newErrors.map((d) => line(d)),
  );
  section(
    "Stale baseline entries (fixed docs — remove from KNOWN_DOC_ISSUES)",
    staleBaseline.map((k) => `  ${k.code} ${k.file} — no longer reproduces`),
  );
  section(
    "Warnings",
    warnings.map((d) => line(d)),
  );

  const failed = newErrors.length > 0 || staleBaseline.length > 0;
  process.stdout.write(
    `\nSummary: ${errors.length} error(s) [${baselined.length} baselined, ${newErrors.length} new], ` +
      `${staleBaseline.length} stale baseline, ${warnings.length} warning(s).\n`,
  );
  process.stdout.write(`Result: ${failed ? "FAIL" : "PASS"}\n`);
  process.exit(failed ? 1 : 0);
}

main();
