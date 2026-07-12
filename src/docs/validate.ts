import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative, posix, sep } from "node:path";

import {
  checkAdrSet,
  checkFences,
  checkLinks,
  checkPolicy,
  checkStructure,
  checkTruncation,
  type LinkResolver,
} from "./checks";
import { headingSlug, headings, scanFences } from "./markdown";
import type { ClassifiedDoc, DocClass, DocumentationDiagnostic } from "./types";

/**
 * Deterministic discovery + classification + orchestration for the documentation
 * validator. Filesystem-based (no git, no network); results are stable and
 * machine-testable.
 */

export const REPO_ROOT = join(process.cwd());

/** Directories never scanned (build output, deps, generated, and test fixtures). */
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "coverage",
  "playwright-report",
  "test-results",
  "__fixtures__",
]);

/** Recursively find tracked-style Markdown files under a root, sorted. */
export function discoverMarkdown(root: string = REPO_ROOT): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (EXCLUDED_DIRS.has(entry.name)) continue;
        walk(join(dir, entry.name));
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
        found.push(toPosixRel(root, join(dir, entry.name)));
      }
    }
  };
  walk(root);
  return found.sort();
}

function toPosixRel(root: string, abs: string): string {
  return relative(root, abs).split(sep).join(posix.sep);
}

export function classify(file: string): DocClass {
  if (file === "README.md") return "readme";
  if (/^docs\/adr\/\d{3,4}-.*\.md$/.test(file)) return "adr";
  if (file === "docs/original-vision-and-scope.md") return "historical";
  if (file.startsWith("docs/corpus/")) return "corpus";
  if (file.startsWith("docs/research/")) return "research";
  if (file.startsWith("docs/reviews/")) return "review-artifact";
  return "ordinary";
}

/** Documents that self-declare an accepted governing status are policies. */
function refineClass(file: string, text: string, base: DocClass): DocClass {
  if (base !== "ordinary") return base;
  const hasStatus =
    /^\s*-\s*(\*\*)?status(\*\*)?\s*:\s*accepted/im.test(text) ||
    /^ {0,3}#{1,6}\s+status\s*$/im.test(text);
  return hasStatus ? "policy" : "ordinary";
}

export function loadDocs(root: string = REPO_ROOT): ClassifiedDoc[] {
  return discoverMarkdown(root).map((file) => {
    const text = readFileSync(join(root, file), "utf8");
    return { file, docClass: refineClass(file, text, classify(file)), text };
  });
}

export function createResolver(root: string = REPO_ROOT): LinkResolver {
  const slugCache = new Map<string, string[] | null>();
  return {
    resolve(sourceFile, target) {
      const abs = target.startsWith("/")
        ? join(root, target.slice(1))
        : join(root, dirname(sourceFile), target);
      return toPosixRel(root, abs);
    },
    exists(resolvedRepoPath) {
      try {
        return existsSync(join(root, resolvedRepoPath));
      } catch {
        return false;
      }
    },
    slugsOf(resolvedRepoPath) {
      if (slugCache.has(resolvedRepoPath)) return slugCache.get(resolvedRepoPath) ?? null;
      let slugs: string[] | null = null;
      try {
        const abs = join(root, resolvedRepoPath);
        if (/\.md$/i.test(resolvedRepoPath) && statSync(abs).isFile()) {
          const ls = readFileSync(abs, "utf8").split("\n");
          const { inFence } = scanFences(ls);
          slugs = headings(ls, inFence).map((h) => headingSlug(h.text));
        }
      } catch {
        slugs = null;
      }
      slugCache.set(resolvedRepoPath, slugs);
      return slugs;
    },
  };
}

/** Run every check over every discovered document. Deterministically ordered. */
export function validateDocumentation(root: string = REPO_ROOT): DocumentationDiagnostic[] {
  const docs = loadDocs(root);
  const resolver = createResolver(root);
  const diagnostics: DocumentationDiagnostic[] = [];

  for (const doc of docs) {
    diagnostics.push(...checkFences(doc));
    diagnostics.push(...checkTruncation(doc));
    diagnostics.push(...checkLinks(doc, resolver));
    diagnostics.push(...checkPolicy(doc));
    diagnostics.push(...checkStructure(doc));
  }
  diagnostics.push(...checkAdrSet(docs.filter((d) => d.docClass === "adr")));

  return diagnostics.sort(
    (a, b) =>
      a.file.localeCompare(b.file) || (a.line ?? 0) - (b.line ?? 0) || a.code.localeCompare(b.code),
  );
}

export const errorsOnly = (d: DocumentationDiagnostic[]) => d.filter((x) => x.severity === "error");

/** Human-readable CLI-style report grouped by file. */
export function formatDiagnostics(diagnostics: DocumentationDiagnostic[]): string {
  if (diagnostics.length === 0) return "Documentation integrity: no issues found.";
  const byFile = new Map<string, DocumentationDiagnostic[]>();
  for (const d of diagnostics) byFile.set(d.file, [...(byFile.get(d.file) ?? []), d]);

  const lines: string[] = [];
  const errors = diagnostics.filter((d) => d.severity === "error").length;
  const warnings = diagnostics.length - errors;
  lines.push(`Documentation integrity: ${errors} error(s), ${warnings} warning(s).`);
  for (const [file, ds] of [...byFile.entries()].sort()) {
    lines.push(`\n${file}`);
    for (const d of ds) {
      const loc = d.line ? `:${d.line}` : "";
      const tag = d.severity === "error" ? "ERROR" : "warn ";
      lines.push(
        `  ${tag} ${d.code} ${file}${loc} — ${d.message}${d.detail ? ` (${d.detail})` : ""}`,
      );
    }
  }
  return lines.join("\n");
}
