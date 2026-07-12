import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, relative, posix, sep } from "node:path";

import {
  checkAdrSet,
  checkDuplicateAnchors,
  checkFences,
  checkLinks,
  checkLinkSyntax,
  checkPolicy,
  checkStructure,
  checkTruncation,
  readDeclaredStatus,
  type LinkResolver,
} from "./checks.ts";
import { headingSlug, headings, scanFences } from "./markdown.ts";
import type { ClassifiedDoc, DocClass, DocumentationDiagnostic } from "./types.ts";

/**
 * Deterministic discovery + classification + orchestration for the documentation
 * validator. Discovery uses the tracked Git file list (no untracked scratch
 * files, no build output); results are stable and machine-testable. No network.
 */

export const REPO_ROOT = join(process.cwd());

/** Paths never validated even though Git tracks them (intentionally broken fixtures). */
function isExcludedFromValidation(file: string): boolean {
  return file.includes("__fixtures__/") || file.startsWith("docs/extraction-full-corpus/");
}

/** Directories skipped by the filesystem fallback walk. */
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".next",
  ".git",
  "coverage",
  "playwright-report",
  "test-results",
  "__fixtures__",
]);

/**
 * The tracked Markdown files, from `git ls-files -- '*.md'`: deterministic,
 * sorted, repository-relative, and containing no untracked scratch files, build
 * output, or dependencies. If Git metadata is unavailable (e.g. running outside a
 * checkout), fall back to a bounded filesystem walk that excludes build/deps.
 */
export function trackedMarkdown(root: string = REPO_ROOT): string[] {
  let files: string[];
  try {
    const stdout = execFileSync("git", ["-C", root, "ls-files", "-z", "--", "*.md"], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
    files = stdout.split("\0").filter((f) => f.length > 0);
  } catch {
    files = walkMarkdown(root); // bounded fallback: no Git available
  }
  return files
    .map((f) => f.split(sep).join(posix.sep))
    .filter((f) => !isExcludedFromValidation(f))
    .sort();
}

/** Filesystem fallback used only when Git metadata is unavailable. */
function walkMarkdown(root: string): string[] {
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
  return found;
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

/**
 * Only a document whose declared status parses to `Accepted` is treated as an
 * accepted policy. A bare `## Status` heading, a non-Accepted value (Proposed,
 * Draft, …), or a missing value never makes a document a policy.
 */
function refineClass(text: string, base: DocClass): DocClass {
  if (base !== "ordinary") return base;
  return readDeclaredStatus(text) === "accepted" ? "policy" : "ordinary";
}

export function loadDocs(files: string[], root: string = REPO_ROOT): ClassifiedDoc[] {
  return files.map((file) => {
    const text = readFileSync(join(root, file), "utf8");
    return { file, docClass: refineClass(text, classify(file)), text };
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

export interface ValidateOptions {
  /** Repository root (default: process.cwd()). */
  root?: string;
  /**
   * Explicit repo-relative file list to validate, injected for tests. When
   * omitted, the tracked Git Markdown set is used.
   */
  files?: string[];
}

/** Run every check over every tracked document. Deterministically ordered. */
export function validateDocumentation(options: ValidateOptions = {}): DocumentationDiagnostic[] {
  const root = options.root ?? REPO_ROOT;
  const files = options.files ?? trackedMarkdown(root);
  const docs = loadDocs(files, root);
  const resolver = createResolver(root);
  const diagnostics: DocumentationDiagnostic[] = [];

  for (const doc of docs) {
    diagnostics.push(...checkFences(doc));
    diagnostics.push(...checkTruncation(doc));
    diagnostics.push(...checkLinks(doc, resolver));
    diagnostics.push(...checkLinkSyntax(doc));
    diagnostics.push(...checkPolicy(doc));
    diagnostics.push(...checkStructure(doc));
    diagnostics.push(...checkDuplicateAnchors(doc));
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
