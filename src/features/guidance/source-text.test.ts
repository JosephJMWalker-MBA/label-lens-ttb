import { describe, expect, it } from "vitest";

import {
  isoFromLongDate,
  normalizeForQuote,
  pageContainsQuote,
  pageLastUpdated,
} from "./source-text";

const PAGE = `<!doctype html><html><head><title>Wine Labeling: Example | Agency</title>
<style>.x{color:red}</style><script>var q = "A brand name is fake";</script></head>
<body><h2>What are the formatting requirements <span>?</span></h2>
<p>A brand name is the name under which a wine
   is marketed &amp; sold.</p>
<p>Last updated: January 12, 2026</p></body></html>`;

describe("verbatim source matching", () => {
  it("ignores only whitespace runs and spaces that markup puts before punctuation", () => {
    expect(normalizeForQuote("  What are  the requirements ?\n")).toBe(
      "What are the requirements?",
    );
    expect(pageContainsQuote(PAGE, "What are the formatting requirements?")).toBe(true);
    expect(
      pageContainsQuote(PAGE, "A brand name is the name under which a wine is marketed & sold."),
    ).toBe(true);
  });

  it("does not match paraphrases, case changes, or text inside scripts", () => {
    expect(pageContainsQuote(PAGE, "A brand name is the name a wine is marketed under.")).toBe(
      false,
    );
    expect(pageContainsQuote(PAGE, "what are the formatting requirements?")).toBe(false);
    expect(pageContainsQuote(PAGE, "A brand name is fake")).toBe(false);
  });

  it("reads the page's own Last updated date", () => {
    expect(pageLastUpdated(PAGE)).toBe("2026-01-12");
    expect(pageLastUpdated("<p>No date here</p>")).toBeNull();
    expect(isoFromLongDate("March 1, 2021")).toBe("2021-03-01");
    expect(isoFromLongDate("Smarch 1, 2021")).toBeNull();
  });
});
