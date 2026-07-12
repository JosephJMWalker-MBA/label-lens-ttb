import type { ClassifiedDoc, DocumentationDiagnostic } from "./types.ts";
import {
  extractLinks,
  headingSlug,
  headings,
  isBlank,
  isHeadingLine,
  isListItem,
  isTableRow,
  scanFences,
} from "./markdown.ts";

/**
 * Individual documentation-integrity checks. Each takes a classified document
 * (and, for links, a resolver) and returns structured diagnostics. Checks are
 * conservative by design: gating `error` severities aim for near-zero false
 * positives; softer signals are emitted as `warning`.
 */

const ACCEPTED_ADR_STATUSES = new Set([
  "accepted",
  "proposed",
  "superseded",
  "deprecated",
  "rejected",
]);

/** Words that cannot legitimately end a finished sentence. */
const DANGLING_WORDS = new Set([
  "and",
  "or",
  "but",
  "nor",
  "yet",
  "so",
  "for",
  "the",
  "a",
  "an",
  "to",
  "of",
  "in",
  "on",
  "at",
  "by",
  "from",
  "with",
  "as",
  "into",
  "onto",
  "upon",
  "per",
  "via",
  "than",
  "then",
  "that",
  "which",
  "who",
  "whose",
  "when",
  "while",
  "where",
  "because",
  "if",
  "unless",
  "until",
  "although",
  "though",
  "however",
  "therefore",
  "thus",
  "must",
  "should",
  "shall",
  "will",
  "would",
  "can",
  "could",
  "may",
  "might",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "has",
  "have",
  "had",
  "do",
  "does",
  "did",
]);

function lines(text: string): string[] {
  return text.split("\n");
}

// ---------------------------------------------------------------------------
// Fenced code integrity
// ---------------------------------------------------------------------------

export function checkFences(doc: ClassifiedDoc): DocumentationDiagnostic[] {
  const { regions } = scanFences(lines(doc.text));
  return regions
    .filter((r) => r.closeLine === null)
    .map((r) => ({
      code: "FENCE_UNCLOSED" as const,
      severity: "error" as const,
      file: doc.file,
      line: r.openLine + 1,
      message: `Fenced code block opened with "${r.marker}" is never closed before end of file.`,
    }));
}

// ---------------------------------------------------------------------------
// Abrupt truncation (at most one diagnostic per file, highest-confidence first)
// ---------------------------------------------------------------------------

function lastWord(line: string): string {
  const m = line
    .replace(/[*_`>~]+/g, " ")
    .trim()
    .match(/([A-Za-z][A-Za-z'-]*)\s*[^A-Za-z]*$/);
  return m ? m[1].toLowerCase() : "";
}

function endsWithTerminalPunctuation(line: string): boolean {
  // Allow a terminal ., !, ? optionally wrapped by closing markdown/quotes.
  return /[.!?][)"'*_`\s]*$/.test(line.trimEnd());
}

export function checkTruncation(doc: ClassifiedDoc): DocumentationDiagnostic[] {
  const ls = lines(doc.text);
  const { inFence } = scanFences(ls);

  // Last non-blank line index.
  let last = ls.length - 1;
  while (last >= 0 && isBlank(ls[last])) last--;
  if (last < 0) return []; // empty file: not this check's concern

  // Ending inside an unclosed fence is already reported as FENCE_UNCLOSED.
  if (inFence[last]) return [];

  const L = ls[last];
  const at = last + 1;

  // Final heading with no body.
  if (isHeadingLine(L)) {
    return [
      {
        code: "TRUNC_EMPTY_FINAL_HEADING",
        severity: "error",
        file: doc.file,
        line: at,
        message: "The document ends on a heading with no body beneath it.",
        detail: L.trim(),
      },
    ];
  }

  // Corpus inventories legitimately end on table rows; skip prose-shaped checks.
  const structural = isTableRow(L) || isListItem(L);

  // Dangling conjunction/preposition/article/modal (works for prose or list).
  if (!endsWithTerminalPunctuation(L) && DANGLING_WORDS.has(lastWord(L))) {
    return [
      {
        code: "TRUNC_DANGLING_WORD",
        severity: "error",
        file: doc.file,
        line: at,
        message: `The document ends on "${lastWord(L)}", an incomplete-sentence word.`,
        detail: L.trim().slice(-80),
      },
    ];
  }

  // A dangling colon promises content that never arrives.
  if (!structural && /:\s*$/.test(L)) {
    return [
      {
        code: "TRUNC_TRAILING_COLON",
        severity: "error",
        file: doc.file,
        line: at,
        message: "The document ends on a dangling colon; the promised content is missing.",
        detail: L.trim().slice(-80),
      },
    ];
  }

  // A plain final paragraph with no terminal punctuation. Guarded to avoid
  // flagging tables, lists, headings, taglines, filenames, versions, and URLs.
  if (
    doc.docClass !== "corpus" &&
    !structural &&
    !endsWithTerminalPunctuation(L) &&
    isProseParagraph(L)
  ) {
    return [
      {
        code: "TRUNC_PROSE_NO_TERMINAL",
        severity: "error",
        file: doc.file,
        line: at,
        message: "The final paragraph ends without terminal punctuation; likely truncated.",
        detail: L.trim().slice(-80),
      },
    ];
  }

  return [];
}

/** Heuristic: a normal sentence-like paragraph line (>= 3 words, word-initial). */
function isProseParagraph(line: string): boolean {
  const t = line.trim();
  if (t.length === 0) return false;
  if (/^[>#|]/.test(t)) return false; // quote / heading / table
  if (/^!?\[/.test(t)) return false; // link/image-only line
  if (/^https?:\/\//i.test(t)) return false; // bare URL
  if (/[/\\]/.test(t) && /\.[a-z0-9]{1,5}$/i.test(t)) return false; // path/filename
  if (/^\d/.test(t)) return false; // version/number-led
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 3) return false; // taglines / short labels
  return /^[A-Za-z]/.test(t);
}

// ---------------------------------------------------------------------------
// Link integrity
// ---------------------------------------------------------------------------

export interface LinkResolver {
  /** True if a repo-relative path (already resolved) exists on disk. */
  exists(resolvedRepoPath: string): boolean;
  /** Heading slugs of a markdown file, or null if it is not a readable .md. */
  slugsOf(resolvedRepoPath: string): string[] | null;
  /** Resolve a link target (relative to the source file) to a repo path. */
  resolve(sourceFile: string, target: string): string;
}

const EXTERNAL_LINK = /^(https?:|mailto:|tel:|data:|ftp:)/i;

export function checkLinks(doc: ClassifiedDoc, resolver: LinkResolver): DocumentationDiagnostic[] {
  const ls = lines(doc.text);
  const { inFence } = scanFences(ls);
  const out: DocumentationDiagnostic[] = [];
  const selfSlugs = new Set(headings(ls, inFence).map((h) => headingSlug(h.text)));

  for (const link of extractLinks(ls, inFence)) {
    const target = link.target;
    if (target === "") {
      out.push({
        code: "LINK_EMPTY",
        severity: "error",
        file: doc.file,
        line: link.line + 1,
        message: `Empty ${link.isImage ? "image" : "link"} target.`,
      });
      continue;
    }
    if (EXTERNAL_LINK.test(target)) continue; // external/live/issue links are out of scope

    const [pathPartRaw, anchor] = splitAnchor(target);
    const pathPart = safeDecode(pathPartRaw);

    // Pure in-document anchor.
    if (pathPart === "") {
      if (anchor && !selfSlugs.has(anchor.toLowerCase())) {
        out.push({
          code: "LINK_ANCHOR_MISSING",
          severity: "error",
          file: doc.file,
          line: link.line + 1,
          message: `In-page anchor "#${anchor}" has no matching heading.`,
        });
      }
      continue;
    }

    const resolved = resolver.resolve(doc.file, pathPart);
    if (!resolver.exists(resolved)) {
      out.push({
        code: "LINK_BROKEN",
        severity: "error",
        file: doc.file,
        line: link.line + 1,
        message: `Broken repository link: ${target}`,
        detail: `resolved to ${resolved}`,
      });
      continue;
    }
    if (anchor && /\.md$/i.test(pathPart)) {
      const slugs = resolver.slugsOf(resolved);
      if (slugs && !slugs.includes(anchor.toLowerCase())) {
        out.push({
          code: "LINK_ANCHOR_MISSING",
          severity: "error",
          file: doc.file,
          line: link.line + 1,
          message: `Anchor "#${anchor}" not found in ${pathPart}.`,
        });
      }
    }
  }
  return out;
}

function splitAnchor(target: string): [string, string | null] {
  const i = target.indexOf("#");
  return i === -1 ? [target, null] : [target.slice(0, i), target.slice(i + 1)];
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// ---------------------------------------------------------------------------
// ADR identity and metadata (supports both the bullet and section formats)
// ---------------------------------------------------------------------------

export function checkAdrSet(adrDocs: ClassifiedDoc[]): DocumentationDiagnostic[] {
  const out: DocumentationDiagnostic[] = [];
  const byId = new Map<number, string[]>();

  for (const doc of adrDocs) {
    const ls = lines(doc.text);
    const { inFence } = scanFences(ls);
    const base = doc.file.split("/").pop() ?? doc.file;
    const fileIdMatch = /^(\d{3,4})-/.exec(base);
    const fileId = fileIdMatch ? Number(fileIdMatch[1]) : null;
    if (fileId !== null) byId.set(fileId, [...(byId.get(fileId) ?? []), doc.file]);

    const hs = headings(ls, inFence);
    const title = hs.find((h) => h.level === 1);
    if (!title) {
      out.push({
        code: "ADR_TITLE_MISSING",
        severity: "error",
        file: doc.file,
        message: "ADR has no level-1 title heading.",
      });
    } else {
      const headingId = /adr[\s-]?0*(\d+)/i.exec(title.text);
      if (headingId && fileId !== null && Number(headingId[1]) !== fileId) {
        out.push({
          code: "ADR_ID_MISMATCH",
          severity: "error",
          file: doc.file,
          line: title.line + 1,
          message: `ADR id in the heading (${headingId[1]}) does not match the filename id (${fileId}).`,
        });
      }
    }

    const status = extractAdrStatus(ls, inFence);
    if (status === null) {
      out.push({
        code: "ADR_STATUS_MISSING",
        severity: "error",
        file: doc.file,
        message: "ADR has no recognizable Status.",
      });
    } else if (!ACCEPTED_ADR_STATUSES.has(status.value.toLowerCase())) {
      out.push({
        code: "ADR_STATUS_INVALID",
        severity: "error",
        file: doc.file,
        line: status.line + 1,
        message: `ADR Status "${status.value}" is not a recognized value.`,
      });
    }

    // Date is required only for the bullet-metadata format; the older
    // section-format ADRs (## Status) predate the date convention (grandfathered).
    const bulletFormat = bulletMeta(doc.text, "status") !== null;
    const dateValue = bulletMeta(doc.text, "date");
    const hasDate = dateValue !== null && /\d{4}-\d{2}-\d{2}/.test(dateValue);
    if (bulletFormat && !hasDate) {
      out.push({
        code: "ADR_DATE_MISSING",
        severity: "warning",
        file: doc.file,
        message: "Bullet-format ADR has no `- Date: YYYY-MM-DD` line.",
      });
    }
  }

  for (const [id, files] of byId) {
    if (files.length > 1) {
      for (const f of files) {
        out.push({
          code: "ADR_ID_DUPLICATE",
          severity: "error",
          file: f,
          message: `ADR id ${String(id).padStart(4, "0")} is used by multiple files: ${files.join(", ")}.`,
        });
      }
    }
  }
  return out;
}

/**
 * Read a `- Key: value` bullet-metadata line, tolerating bold markers in either
 * position (`- **Key:** value`, `- Key: **value**`, `- Key: value`). Returns the
 * cleaned value, or null if the key is absent.
 */
function bulletMeta(text: string, key: string): string | null {
  const re = new RegExp(
    `^\\s*-\\s*\\*{0,2}\\s*${key}\\s*\\*{0,2}\\s*:\\s*\\*{0,2}\\s*(.+?)\\s*\\*{0,2}\\s*$`,
    "im",
  );
  const m = re.exec(text);
  return m ? m[1].replace(/[.*\s]+$/, "").trim() : null;
}

/**
 * The document's declared status, normalized to lowercase, or null if none is
 * declared. Reads the VALUE — a bare `## Status` heading with no value beneath it
 * (or a bullet with no value) is treated as no declared status, never as
 * "Accepted". Used to decide whether accepted-policy checks apply.
 */
export function readDeclaredStatus(text: string): string | null {
  const ls = text.split("\n");
  const { inFence } = scanFences(ls);
  const found = extractAdrStatus(ls, inFence);
  if (found === null) return null;
  const value = found.value.trim().toLowerCase();
  return value === "" ? null : value;
}

/** Status from either a `- Status:` bullet (any bold form) or a `## Status` section. */
function extractAdrStatus(
  ls: string[],
  inFence: boolean[],
): { value: string; line: number } | null {
  for (let i = 0; i < ls.length; i++) {
    if (inFence[i]) continue;
    const bullet = bulletMeta(ls[i], "status");
    if (bullet !== null) return { value: bullet, line: i };
    if (/^ {0,3}#{1,6}\s+status\s*$/i.test(ls[i])) {
      for (let j = i + 1; j < ls.length; j++) {
        if (isBlank(ls[j])) continue;
        // Another heading immediately below means the section carries no value.
        if (isHeadingLine(ls[j])) return null;
        return { value: ls[j].replace(/^[*\s]+|[*.\s]+$/g, "").trim(), line: j };
      }
      return null; // "## Status" at end of file with no value
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Accepted-policy structural completeness (bounded, non-substantive)
// ---------------------------------------------------------------------------

export function checkPolicy(doc: ClassifiedDoc): DocumentationDiagnostic[] {
  if (doc.docClass !== "policy") return [];
  const ls = lines(doc.text);
  const { inFence } = scanFences(ls);
  const hs = headings(ls, inFence);
  const out: DocumentationDiagnostic[] = [];
  if (!hs.some((h) => h.level === 1)) {
    out.push({
      code: "POLICY_TITLE_MISSING",
      severity: "error",
      file: doc.file,
      message: "Accepted policy has no level-1 title heading.",
    });
  }
  // A governing document should carry more than just a status line.
  const bodySections = hs.filter((h) => h.level >= 2 && !/^status$/i.test(h.text));
  if (bodySections.length < 1) {
    out.push({
      code: "POLICY_SECTION_MISSING",
      severity: "warning",
      file: doc.file,
      message: "Accepted policy has no substantive section beyond its status.",
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Structural sanity
// ---------------------------------------------------------------------------

export function checkStructure(doc: ClassifiedDoc): DocumentationDiagnostic[] {
  const ls = lines(doc.text);
  const { inFence } = scanFences(ls);
  const out: DocumentationDiagnostic[] = [];

  for (let i = 0; i < ls.length; i++) {
    if (inFence[i]) continue;
    const line = ls[i];

    // '#' run with no following space does not render as a heading.
    const noSpace = /^ {0,3}(#{1,6})([^#\s].*)$/.exec(line);
    if (noSpace && !/^\d/.test(noSpace[2])) {
      out.push({
        code: "HEADING_NO_SPACE",
        severity: "error",
        file: doc.file,
        line: i + 1,
        message: 'Heading marker "#" has no following space; it will not render as a heading.',
        detail: line.trim().slice(0, 60),
      });
    }

    // Malformed table separator row (only when clearly a separator).
    if (i > 0 && isTableRow(ls[i - 1]) && isSeparatorCandidate(line)) {
      const cells = line
        .trim()
        .replace(/^\||\|$/g, "")
        .split("|");
      if (cells.some((c) => !/^\s*:?-+:?\s*$/.test(c))) {
        out.push({
          code: "TABLE_SEPARATOR_INVALID",
          severity: "warning",
          file: doc.file,
          line: i + 1,
          message: "Table separator row is malformed (a column is not a valid `---` separator).",
        });
      }
    }
  }
  return out;
}

/** A line composed only of table-separator symbols (pipes/colons/dashes/space). */
function isSeparatorCandidate(line: string): boolean {
  const t = line.trim();
  return t.includes("|") && t.includes("-") && /^[|:\-\s]+$/.test(t);
}

// ---------------------------------------------------------------------------
// Duplicate heading anchors (warning: only ambiguous when such anchors are linked)
// ---------------------------------------------------------------------------

export function checkDuplicateAnchors(doc: ClassifiedDoc): DocumentationDiagnostic[] {
  const ls = lines(doc.text);
  const { inFence } = scanFences(ls);
  const seen = new Map<string, number>(); // slug -> first line (0-based)
  const out: DocumentationDiagnostic[] = [];
  for (const h of headings(ls, inFence)) {
    const slug = headingSlug(h.text);
    if (slug === "") continue;
    const first = seen.get(slug);
    if (first === undefined) {
      seen.set(slug, h.line);
    } else {
      out.push({
        code: "DOC_DUPLICATE_HEADING_ANCHOR",
        severity: "warning",
        file: doc.file,
        line: h.line + 1,
        message: `Heading anchor "#${slug}" is duplicated (first defined at line ${first + 1}); links to it are ambiguous.`,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Malformed inline link syntax
// ---------------------------------------------------------------------------

export function checkLinkSyntax(doc: ClassifiedDoc): DocumentationDiagnostic[] {
  const ls = lines(doc.text);
  const { inFence } = scanFences(ls);
  const out: DocumentationDiagnostic[] = [];
  for (let i = 0; i < ls.length; i++) {
    if (inFence[i]) continue;
    const line = ls[i];

    // A bracketed label followed by "(" but no closing ")" on the same line.
    if (/\][ \t]*\([^)]*$/.test(line) && !/^\s*\[[^\]]*\]:\s/.test(line)) {
      out.push({
        code: "LINK_MALFORMED",
        severity: "error",
        file: doc.file,
        line: i + 1,
        message: "Malformed link: an opening `](` has no closing `)` on this line.",
        detail: line.trim().slice(0, 60),
      });
      continue;
    }
    // A space between the label and its destination: `[text] (url)`.
    if (/\][ \t]+\(\S/.test(line)) {
      out.push({
        code: "LINK_MALFORMED",
        severity: "error",
        file: doc.file,
        line: i + 1,
        message: "Malformed link: whitespace between `]` and `(` breaks the link.",
        detail: line.trim().slice(0, 60),
      });
    }
  }
  return out;
}
