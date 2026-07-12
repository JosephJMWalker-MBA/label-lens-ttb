// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

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
} from "./checks";
import { scanFences } from "./markdown";
import { KNOWN_DOC_ISSUES, issueKey } from "./known-issues";
import type { ClassifiedDoc, DocClass } from "./types";
import {
  createResolver,
  errorsOnly,
  formatDiagnostics,
  loadDocs,
  trackedMarkdown,
  validateDocumentation,
} from "./validate";

const FIXTURE_DIR = "src/docs/__fixtures__";
const FIXTURES = join(process.cwd(), FIXTURE_DIR);

/** A fixture as a classified doc, using its real repo path so links resolve. */
function fixtureDoc(name: string, docClass: DocClass = "ordinary"): ClassifiedDoc {
  return {
    file: `${FIXTURE_DIR}/${name}`,
    docClass,
    text: readFileSync(join(FIXTURES, name), "utf8"),
  };
}

function synthetic(file: string, text: string, docClass: DocClass = "adr"): ClassifiedDoc {
  return { file, docClass, text };
}

const codes = (ds: { code: string }[]) => ds.map((d) => d.code);

// ---------------------------------------------------------------------------
// Fence scanning primitives
// ---------------------------------------------------------------------------

describe("fence scanning", () => {
  it("closes a fence only with the same marker, at least as long", () => {
    const r = scanFences(["````ts", "```", "still code", "````"]).regions;
    expect(r).toHaveLength(1);
    expect(r[0].closeLine).toBe(3); // the shorter ``` did not close the ```` fence
  });

  it("supports tilde fences and reports an unclosed fence", () => {
    const r = scanFences(["~~~", "code", "no close"]).regions;
    expect(r[0].closeLine).toBeNull();
  });

  it("does not treat an indented-4+ line as a fence", () => {
    expect(scanFences(["    ```", "text"]).regions).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Regression fixtures (repository-independent proof of detection)
// ---------------------------------------------------------------------------

describe("truncation regression fixtures", () => {
  it("detects the operator-trust dangling-conjunction pattern exactly", () => {
    const ds = checkTruncation(fixtureDoc("truncated-dangling-conjunction.md", "policy"));
    expect(codes(ds)).toContain("TRUNC_DANGLING_WORD");
    expect(ds[0].message).toMatch(/"or"/);
  });

  it("detects a final heading with no body", () => {
    expect(codes(checkTruncation(fixtureDoc("truncated-empty-final-heading.md")))).toContain(
      "TRUNC_EMPTY_FINAL_HEADING",
    );
  });

  it("detects a dangling trailing colon", () => {
    expect(codes(checkTruncation(fixtureDoc("truncated-trailing-colon.md")))).toContain(
      "TRUNC_TRAILING_COLON",
    );
  });

  it("detects a prose paragraph with no terminal punctuation", () => {
    expect(codes(checkTruncation(fixtureDoc("truncated-prose-no-terminal.md")))).toContain(
      "TRUNC_PROSE_NO_TERMINAL",
    );
  });

  it("detects an unclosed fence", () => {
    expect(codes(checkFences(fixtureDoc("unclosed-fence.md")))).toContain("FENCE_UNCLOSED");
  });

  it("produces no truncation or fence diagnostics for a clean, complete document", () => {
    const clean = fixtureDoc("clean-complete.md", "policy");
    expect(checkTruncation(clean)).toHaveLength(0);
    expect(checkFences(clean)).toHaveLength(0);
    expect(checkStructure(clean)).toHaveLength(0);
  });
});

describe("link and structure fixtures", () => {
  it("flags broken and empty links but not external ones", () => {
    const doc = fixtureDoc("broken-and-empty-links.md");
    const ds = checkLinks(doc, createResolver());
    expect(codes(ds)).toEqual(expect.arrayContaining(["LINK_BROKEN", "LINK_EMPTY"]));
    const broken = ds.find((d) => d.code === "LINK_BROKEN");
    expect(broken?.line).toBeGreaterThan(0);
    expect(broken?.detail).toMatch(/resolved to/);
  });

  it("ignores http/mailto links and in-code links", () => {
    const doc = synthetic(
      "x.md",
      "See <https://example.com> and [ok](https://a.b) and [m](mailto:x@y.z).\n\n```\n[fake](./nope.md)\n```\n",
      "ordinary",
    );
    expect(checkLinks(doc, createResolver())).toHaveLength(0);
  });

  it("flags a heading with no space after #", () => {
    expect(codes(checkStructure(fixtureDoc("heading-no-space.md")))).toContain("HEADING_NO_SPACE");
  });
});

// ---------------------------------------------------------------------------
// ADR identity/metadata (supports both bullet and section formats)
// ---------------------------------------------------------------------------

describe("ADR checks", () => {
  it("accepts the bullet format with bold markers", () => {
    const ds = checkAdrSet([
      synthetic(
        "docs/adr/0009-x.md",
        "# ADR 0009: X\n\n- **Status:** Accepted\n- **Date:** 2026-07-10\n",
      ),
    ]);
    expect(ds).toHaveLength(0);
  });

  it("accepts the older section format and grandfathers its missing date", () => {
    const ds = checkAdrSet([
      synthetic(
        "docs/adr/0003-x.md",
        "# ADR-0003: X\n\n## Status\nAccepted\n\n## Context\nBody.\n",
      ),
    ]);
    expect(ds).toHaveLength(0);
  });

  it("flags an id mismatch between filename and heading", () => {
    const ds = checkAdrSet([
      synthetic("docs/adr/0007-x.md", "# ADR 0008: X\n\n- Status: Accepted\n- Date: 2026-07-10\n"),
    ]);
    expect(codes(ds)).toContain("ADR_ID_MISMATCH");
  });

  it("flags duplicate ADR ids across files", () => {
    const ds = checkAdrSet([
      synthetic("docs/adr/0002-a.md", "# ADR 0002: A\n\n- Status: Accepted\n- Date: 2026-07-10\n"),
      synthetic("docs/adr/0002-b.md", "# ADR 0002: B\n\n- Status: Accepted\n- Date: 2026-07-10\n"),
    ]);
    expect(ds.filter((d) => d.code === "ADR_ID_DUPLICATE")).toHaveLength(2);
  });

  it("flags missing and invalid status, and a missing title", () => {
    expect(
      codes(
        checkAdrSet([synthetic("docs/adr/0010-x.md", "# ADR 0010: X\n\n- Date: 2026-07-10\n")]),
      ),
    ).toContain("ADR_STATUS_MISSING");
    expect(
      codes(
        checkAdrSet([
          synthetic("docs/adr/0011-x.md", "# ADR 0011: X\n\n- Status: Maybe\n- Date: 2026-07-10\n"),
        ]),
      ),
    ).toContain("ADR_STATUS_INVALID");
    expect(codes(checkAdrSet([synthetic("docs/adr/0012-x.md", "No title here.\n")]))).toContain(
      "ADR_TITLE_MISSING",
    );
  });

  it("warns (not errors) when a bullet-format ADR omits its date", () => {
    const ds = checkAdrSet([
      synthetic("docs/adr/0013-x.md", "# ADR 0013: X\n\n- Status: Accepted\n"),
    ]);
    const date = ds.find((d) => d.code === "ADR_DATE_MISSING");
    expect(date?.severity).toBe("warning");
  });
});

// ---------------------------------------------------------------------------
// Live repository gate (deterministic; matched against an explicit baseline)
// ---------------------------------------------------------------------------

describe("live documentation integrity", () => {
  const diagnostics = validateDocumentation();
  const liveErrors = errorsOnly(diagnostics);

  it("matches the documented known-issue baseline exactly (new errors fail here)", () => {
    const liveKeys = new Set(liveErrors.map(issueKey));
    const baseKeys = new Set(KNOWN_DOC_ISSUES.map(issueKey));

    const newErrors = liveErrors.filter((d) => !baseKeys.has(issueKey(d)));
    const staleBaseline = KNOWN_DOC_ISSUES.filter((k) => !liveKeys.has(issueKey(k)));

    // A new, un-baselined error should fail CI — that is the validator's job.
    expect(newErrors, `\n${formatDiagnostics(newErrors)}`).toEqual([]);
    // A baseline entry that no longer reproduces means a doc was fixed; trim it.
    expect(staleBaseline.map(issueKey), "Remove fixed entries from KNOWN_DOC_ISSUES").toEqual([]);
  });

  it("runs the validator across the whole tracked doc set", () => {
    // Sanity: discovery actually found the documentation corpus.
    expect(validateDocumentation().length).toBeGreaterThanOrEqual(liveErrors.length);
  });
});

// ---------------------------------------------------------------------------
// Heading anchors, malformed links, duplicate anchors (Gap 3)
// ---------------------------------------------------------------------------

describe("heading-anchor links", () => {
  const ds = checkLinks(fixtureDoc("anchor-links.md"), createResolver());

  it("does not flag valid cross-file or in-page anchors", () => {
    // #second-heading (cross-file) and #anchors (in-page) both resolve.
    expect(ds.filter((d) => /second-heading|#anchors\b/.test(d.message))).toHaveLength(0);
  });

  it("flags a broken cross-file anchor as an error, not a warning", () => {
    const bad = ds.find(
      (d) => d.code === "LINK_ANCHOR_MISSING" && /missing-heading/.test(d.message),
    );
    expect(bad?.severity).toBe("error");
  });

  it("flags a broken in-page anchor as an error", () => {
    const bad = ds.find((d) => d.code === "LINK_ANCHOR_MISSING" && /#nope/.test(d.message));
    expect(bad?.severity).toBe("error");
  });
});

describe("duplicate heading anchors", () => {
  it("warns when two headings share a generated anchor", () => {
    const ds = checkDuplicateAnchors(fixtureDoc("duplicate-anchors.md"));
    expect(codes(ds)).toContain("DOC_DUPLICATE_HEADING_ANCHOR");
    expect(ds[0].severity).toBe("warning");
  });

  it("does not warn when all anchors are unique", () => {
    expect(checkDuplicateAnchors(fixtureDoc("anchor-target.md"))).toHaveLength(0);
  });
});

describe("malformed link syntax", () => {
  it("flags an unclosed link and a spaced destination", () => {
    const ds = checkLinkSyntax(fixtureDoc("malformed-link.md"));
    expect(ds.filter((d) => d.code === "LINK_MALFORMED").length).toBeGreaterThanOrEqual(2);
    expect(ds.every((d) => d.severity === "error")).toBe(true);
  });

  it("does not flag well-formed links", () => {
    expect(checkLinkSyntax(fixtureDoc("anchor-target.md"))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Accepted-policy structure and historical exemption (Gap 3 + Gap 4)
// ---------------------------------------------------------------------------

describe("accepted-policy structure", () => {
  it("accepts a complete accepted policy", () => {
    expect(checkPolicy(fixtureDoc("policy-valid.md", "policy"))).toHaveLength(0);
  });

  it("flags an accepted policy that has only a status and no section", () => {
    expect(codes(checkPolicy(fixtureDoc("policy-missing-section.md", "policy")))).toContain(
      "POLICY_SECTION_MISSING",
    );
  });

  it("exempts a historical document from current-policy completeness", () => {
    // Same content, classified historical: no policy checks apply.
    expect(checkPolicy(fixtureDoc("policy-missing-section.md", "historical"))).toHaveLength(0);
  });
});

describe("policy status parsing (Gap 4)", () => {
  it("normalizes the declared status value under the heading or bullet", () => {
    expect(readDeclaredStatus(readFixture("policy-valid.md"))).toBe("accepted");
    expect(readDeclaredStatus(readFixture("policy-proposed.md"))).toBe("proposed");
    expect(readDeclaredStatus(readFixture("policy-draft.md"))).toBe("draft");
    // A "## Status" heading with no value beneath must not be read as Accepted.
    expect(readDeclaredStatus(readFixture("policy-status-no-value.md"))).toBeNull();
  });

  it("classifies only Accepted documents as policies", () => {
    const cls = (name: string) => loadDocs([`${FIXTURE_DIR}/${name}`])[0].docClass;
    expect(cls("policy-valid.md")).toBe("policy");
    expect(cls("policy-proposed.md")).toBe("ordinary");
    expect(cls("policy-draft.md")).toBe("ordinary");
    expect(cls("policy-status-no-value.md")).toBe("ordinary");
  });
});

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8");
}

// ---------------------------------------------------------------------------
// Legitimate final table / code block (must NOT be flagged as truncation)
// ---------------------------------------------------------------------------

describe("legitimate non-prose endings", () => {
  it("does not flag a document ending in a table row", () => {
    expect(checkTruncation(fixtureDoc("ends-with-table.md"))).toHaveLength(0);
  });

  it("does not flag a document ending in a closed code block", () => {
    expect(checkTruncation(fixtureDoc("ends-with-codeblock.md"))).toHaveLength(0);
    expect(checkFences(fixtureDoc("ends-with-codeblock.md"))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tracked-only discovery ignores untracked files (Gap 2)
// ---------------------------------------------------------------------------

describe("tracked discovery", () => {
  const tmp = mkdtempSync(join(tmpdir(), "docs-track-"));
  afterAll(() => rmSync(tmp, { recursive: true, force: true }));

  it("returns tracked Markdown and ignores untracked scratch files", () => {
    execFileSync("git", ["-C", tmp, "init", "-q"]);
    execFileSync("git", ["-C", tmp, "config", "user.email", "t@t.t"]);
    execFileSync("git", ["-C", tmp, "config", "user.name", "t"]);
    writeFileSync(join(tmp, "tracked.md"), "# Tracked\n\nComplete.\n");
    writeFileSync(join(tmp, "untracked-scratch.md"), "# Scratch\n\nLocal only.\n");
    execFileSync("git", ["-C", tmp, "add", "tracked.md"]);
    execFileSync("git", ["-C", tmp, "commit", "-qm", "add tracked"]);

    const found = trackedMarkdown(tmp);
    expect(found).toContain("tracked.md");
    expect(found).not.toContain("untracked-scratch.md");
  });
});
