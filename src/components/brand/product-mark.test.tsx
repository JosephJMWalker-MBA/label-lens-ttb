import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProductMark } from "./ProductMark";

const ROOT = process.cwd();

/**
 * The design rule this guards is narrow and deliberate:
 *
 *   **The product identity may not use approval symbolism.**
 *
 * A shield, a seal, a badge, a rosette, or a bare checkmark all say "an
 * authority has passed this". The product issues no approval, clearance, or
 * government decision, so its *identity* — the mark, the header, the branding,
 * and the front door — must never borrow that vocabulary. The mark is a print
 * registration target: the artwork is being inspected, not cleared.
 *
 * The rule is scoped to identity surfaces, and only those. It is NOT a
 * repository-wide ban on these glyphs: diagnostics, evidence panels, internal
 * status, reviewer utilities, and developer tooling may have entirely
 * legitimate reasons to use a check or a shield, and this test must not
 * pre-emptively forbid engineering it has no opinion about.
 *
 * If a new branding, navigation, or marketing surface is added, add it here.
 */
const IDENTITY_SURFACES = [
  "src/components/brand", // the mark itself
  "src/components/layout", // the global header and navigation branding
  "src/features/home", // the intent hub — the product's front door
  "src/app/page.tsx", // the route that renders it
];

/** Glyph names that assert an authority has passed judgement. */
const APPROVAL_GLYPHS = [
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

function sourceFilesUnder(path: string): string[] {
  if (!existsSync(path)) return [];
  if (!statSync(path).isDirectory()) return /\.tsx?$/.test(path) ? [path] : [];
  return readdirSync(path).flatMap((name) => sourceFilesUnder(join(path, name)));
}

/** Every non-test source file that makes up the product identity. */
function identitySources(): string[] {
  return IDENTITY_SURFACES.flatMap((surface) => sourceFilesUnder(join(ROOT, surface))).filter(
    (path) => !path.includes(".test."),
  );
}

/** Icon names a file imports from the icon set. */
function iconImports(source: string): string[] {
  return [...source.matchAll(/import\s*{([^}]*)}\s*from\s*["']lucide-react["']/g)]
    .flatMap((match) => match[1].split(","))
    .map((name) =>
      name
        .trim()
        .split(/\s+as\s+/)[0]
        .trim(),
    )
    .filter(Boolean);
}

describe("product identity", () => {
  it("covers the identity surfaces it claims to cover", () => {
    // An allowlist-scoped rule fails open: if a surface is renamed away, the
    // scan would silently inspect nothing and pass for the wrong reason. Assert
    // every declared surface still resolves, and that files were actually found.
    for (const surface of IDENTITY_SURFACES) {
      expect(existsSync(join(ROOT, surface)), `identity surface missing: ${surface}`).toBe(true);
    }
    expect(identitySources().length).toBeGreaterThan(0);
  });

  it("uses no approval symbolism in the product identity", () => {
    const offenders: string[] = [];
    for (const path of identitySources()) {
      // Inspect what is actually imported from the icon set, so the glyph name
      // appearing in prose (as it does in this file) is not a false positive.
      for (const icon of iconImports(readFileSync(path, "utf8"))) {
        if (APPROVAL_GLYPHS.includes(icon)) {
          offenders.push(`${path.replace(ROOT + "/", "")}: ${icon}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no longer carries the retired shield-and-checkmark mark in the identity", () => {
    for (const path of identitySources()) {
      expect(readFileSync(path, "utf8")).not.toMatch(/\bShieldCheck\b/);
    }
  });

  it("renders a decorative mark that is hidden from assistive technology", () => {
    const { container } = render(<ProductMark className="h-6 w-6" />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    // The mark is decorative: the header link supplies the accessible name.
    expect(svg!.getAttribute("aria-hidden")).toBe("true");
    expect(svg!.getAttribute("focusable")).toBe("false");
  });
});
