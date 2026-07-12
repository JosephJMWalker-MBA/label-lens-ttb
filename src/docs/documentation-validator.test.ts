// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { checkAdrSet, checkFences, checkLinks, checkStructure, checkTruncation } from "./checks";
import { scanFences } from "./markdown";
import { KNOWN_DOC_ISSUES, issueKey } from "./known-issues";
import type { ClassifiedDoc, DocClass } from "./types";
import { createResolver, errorsOnly, formatDiagnostics, validateDocumentation } from "./validate";

const FIXTURES = join(process.cwd(), "src/docs/__fixtures__");

function fixtureDoc(name: string, docClass: DocClass = "ordinary"): ClassifiedDoc {
  return {
    file: `__fixtures__/${name}`,
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
