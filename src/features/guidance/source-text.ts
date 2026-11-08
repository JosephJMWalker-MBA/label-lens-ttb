/**
 * Pure text helpers shared by the source-verification script and its tests.
 * They decide what "appears verbatim on the page" means: the same characters in
 * the same order, ignoring only whitespace runs and spaces before punctuation
 * (which page markup inserts around inline elements).
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function normalizeForQuote(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([?.,;:!)\u201d])/g, "$1")
    .replace(/([(\u201c])\s+/g, "$1")
    .trim();
}

/** Visible text of an HTML page, without scripts, styles, or tags. */
export function pageText(html: string): string {
  const withoutCode = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ");
  const text = withoutCode
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&rsquo;/g, "\u2019")
    .replace(/&ldquo;/g, "\u201c")
    .replace(/&rdquo;/g, "\u201d")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)));
  return normalizeForQuote(text);
}

/** True when `quote` appears verbatim in the page text. */
export function pageContainsQuote(html: string, quote: string): boolean {
  return pageText(html).includes(normalizeForQuote(quote));
}

/** "January 12, 2026" → "2026-01-12"; null for anything else. */
export function isoFromLongDate(value: string): string | null {
  const match = /^(\w+) (\d{1,2}), (\d{4})$/.exec(value.trim());
  if (!match) return null;
  const month = MONTHS.indexOf(match[1]!);
  if (month < 0) return null;
  return `${match[3]}-${String(month + 1).padStart(2, "0")}-${match[2]!.padStart(2, "0")}`;
}

/** The page's own "Last updated" date as ISO, or null when the page shows none. */
export function pageLastUpdated(html: string): string | null {
  const label = /Last updated: (\w+ \d{1,2}, \d{4})/.exec(pageText(html))?.[1];
  return label ? isoFromLongDate(label) : null;
}
