// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { safeInternalPath } from "./redirect-safety";

/**
 * Hostname portability proof (staging `pr143.ttb-test.com` → production
 * `ttb-test.com`). The application must be movable between origins through
 * environment configuration only — nothing in source may depend on a specific
 * hostname. See docs/deploy/hostname-promotion.md.
 */

const SRC_ROOT = path.join(process.cwd(), "src");
// Application source only: tests, fixtures, and documentation may legitimately
// mention hostnames as examples.
const SKIP_DIR = new Set(["fixtures", "docs"]);
const HOSTNAME_LITERALS = [/pr143/i, /ttb-test\.com/i];

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIR.has(entry)) continue;
      out.push(...sourceFiles(full));
      continue;
    }
    if (!/\.(ts|tsx|css)$/.test(entry)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry)) continue;
    out.push(full);
  }
  return out;
}

describe("hostname portability", () => {
  it("never hardcodes a staging or production hostname in application source", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC_ROOT)) {
      const text = readFileSync(file, "utf8");
      for (const pattern of HOSTNAME_LITERALS) {
        if (pattern.test(text)) {
          offenders.push(`${path.relative(process.cwd(), file)} matches ${pattern}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("produces the same internal redirect on any origin, and rejects absolute URLs for both", () => {
    // The app is deployed at each of these origins in turn (via BETTER_AUTH_URL /
    // deployment DNS) without any source change. Internal redirect validation is
    // origin-agnostic: a rooted path is accepted identically, and an absolute URL
    // to either origin is rejected in favour of the internal fallback.
    const origins = ["https://pr143.ttb-test.com", "https://ttb-test.com"];
    for (const origin of origins) {
      // A same-origin path the login flow would produce is accepted unchanged.
      expect(safeInternalPath("/agent", "/seller")).toBe("/agent");
      // An absolute URL to this origin is NOT treated as an internal path.
      expect(safeInternalPath(`${origin}/agent`, "/seller")).toBe("/seller");
      // A protocol-relative URL to this origin's host is rejected too.
      expect(safeInternalPath(`//${new URL(origin).host}/agent`, "/seller")).toBe("/seller");
    }
  });
});
