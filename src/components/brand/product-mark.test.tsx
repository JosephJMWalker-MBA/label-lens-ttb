import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProductMark } from "./ProductMark";

const SRC = join(process.cwd(), "src");

/**
 * Approval-style glyphs. A shield, a seal, a badge, a rosette, or a bare
 * checkmark all say "an authority has passed this" — which the product never
 * does. The mark is a print registration target: it says the artwork is being
 * inspected, not that it has been cleared.
 */
const FORBIDDEN_ICONS = [
  "ShieldCheck",
  "ShieldAlert",
  "BadgeCheck",
  "CheckCircle",
  "CheckCircle2",
  "CircleCheck",
  "CircleCheckBig",
  "Award",
  "Medal",
  "Stamp",
  "Verified",
  "Gavel",
  "Landmark",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(name) || name.includes(".test.")) return [];
    return [path];
  });
}

describe("product identity", () => {
  it("uses no approval-style glyph anywhere in the product", () => {
    const offenders: string[] = [];
    for (const path of sourceFiles(SRC)) {
      const source = readFileSync(path, "utf8");
      // Only inspect what is actually imported from the icon set, so the word
      // appearing in a comment (as it does in this file's own guidance) is not
      // a false positive.
      const lucideImports = [
        ...source.matchAll(/import\s*{([^}]*)}\s*from\s*["']lucide-react["']/g),
      ]
        .flatMap((m) => m[1].split(","))
        .map((s) =>
          s
            .trim()
            .split(/\s+as\s+/)[0]
            .trim(),
        )
        .filter(Boolean);
      for (const icon of lucideImports) {
        if (FORBIDDEN_ICONS.includes(icon)) {
          offenders.push(`${path.replace(SRC, "src")}: ${icon}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("retires ShieldCheck from the codebase entirely", () => {
    for (const path of sourceFiles(SRC)) {
      expect(readFileSync(path, "utf8")).not.toMatch(/\bShieldCheck\b/);
    }
  });

  it("renders a decorative mark that is hidden from assistive technology", () => {
    const { container } = render(<ProductMark className="h-6 w-6" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    // The mark is decorative: the header supplies the accessible name.
    expect(svg!.getAttribute("aria-hidden")).toBe("true");
    expect(svg!.getAttribute("focusable")).toBe("false");
  });
});
