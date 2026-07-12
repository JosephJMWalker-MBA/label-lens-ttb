/**
 * Small, dependency-free Markdown scanning helpers. These are intentionally
 * conservative: they recognize the structures the integrity checks need (fenced
 * code regions, links, headings) without attempting a full CommonMark parser.
 */

export interface FenceRegion {
  /** 0-based line index of the opening fence. */
  openLine: number;
  /** 0-based line index of the closing fence, or null if never closed. */
  closeLine: number | null;
  marker: string; // the run of ``` or ~~~ that opened it
}

export interface FenceScan {
  /** For each line index, whether it is inside a fenced code block. */
  inFence: boolean[];
  regions: FenceRegion[];
}

const FENCE_OPEN = /^( {0,3})(`{3,}|~{3,})(.*)$/;

/**
 * Scan fenced code blocks. A fence opens on ``` / ~~~ (>= 3) and closes only on
 * the same marker character, at least as long, with nothing but whitespace after
 * it. An info string on the opener is fine; a "closer" that carries extra text or
 * is shorter does not close the block (it is content).
 */
export function scanFences(lines: string[]): FenceScan {
  const inFence: boolean[] = new Array(lines.length).fill(false);
  const regions: FenceRegion[] = [];
  let open: { marker: string; char: string; len: number; line: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (open === null) {
      const m = FENCE_OPEN.exec(line);
      if (m) {
        open = { marker: m[2], char: m[2][0], len: m[2].length, line: i };
        inFence[i] = true; // the fence markers themselves count as "in fence"
      }
    } else {
      inFence[i] = true;
      const closer = new RegExp(`^ {0,3}(\\${open.char}{${open.len},})\\s*$`);
      if (closer.test(line)) {
        regions.push({ openLine: open.line, closeLine: i, marker: open.marker });
        open = null;
      }
    }
  }
  if (open !== null) {
    regions.push({ openLine: open.line, closeLine: null, marker: open.marker });
  }
  return { inFence, regions };
}

export interface MarkdownLink {
  line: number; // 0-based
  raw: string;
  target: string; // path portion, with any #anchor kept
  isImage: boolean;
}

const LINK_RE = /(!?)\[[^\]]*\]\(([^)]*)\)/g;

/** Extract inline links/images outside fenced code. Titles are stripped. */
export function extractLinks(lines: string[], inFence: boolean[]): MarkdownLink[] {
  const out: MarkdownLink[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (inFence[i]) continue;
    const line = lines[i];
    LINK_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = LINK_RE.exec(line)) !== null) {
      // Ignore an escaped opening bracket: "\[" is not a link.
      if (m.index > 0 && line[m.index - 1] === "\\") continue;
      const inside = m[2].trim();
      out.push({
        line: i,
        raw: m[0],
        target: stripLinkTitle(inside),
        isImage: m[1] === "!",
      });
    }
  }
  return out;
}

/** Reduce a link destination to its path/anchor, dropping any title. */
function stripLinkTitle(inside: string): string {
  if (inside.startsWith("<")) {
    const end = inside.indexOf(">");
    return end === -1 ? inside.slice(1) : inside.slice(1, end);
  }
  // A title is introduced by whitespace then a quote: `path "Title"`.
  const spaceQuote = inside.search(/\s+["']/);
  return (spaceQuote === -1 ? inside : inside.slice(0, spaceQuote)).trim();
}

/** GitHub-style heading anchor slug. */
export function headingSlug(headingText: string): string {
  return headingText
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

const HEADING_RE = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;

/** All headings with 0-based line index, level, and text (outside fences). */
export function headings(
  lines: string[],
  inFence: boolean[],
): { line: number; level: number; text: string }[] {
  const out: { line: number; level: number; text: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (inFence[i]) continue;
    const m = HEADING_RE.exec(lines[i]);
    if (m) out.push({ line: i, level: m[1].length, text: m[2].trim() });
  }
  return out;
}

export function isBlank(line: string): boolean {
  return line.trim() === "";
}

export function isHeadingLine(line: string): boolean {
  return HEADING_RE.test(line);
}

export function isListItem(line: string): boolean {
  return /^ {0,3}([-*+]|\d+[.)])\s+/.test(line);
}

export function isTableRow(line: string): boolean {
  return /\|/.test(line);
}

export function isBlockquote(line: string): boolean {
  return /^ {0,3}>/.test(line);
}
