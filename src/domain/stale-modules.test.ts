// @vitest-environment node
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { winePrecheckRegistry } from "@/pipeline/precheck/wine-precheck.profile";

const ROOT = process.cwd();

/** Recursively collect .ts/.tsx source files under a directory. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const SRC = join(ROOT, "src");
const allSources = sourceFiles(SRC);

describe("stale Slice-2 module cleanup", () => {
  it("has removed the government-warning constant and the proof normalizer", () => {
    expect(existsSync(join(SRC, "domain/rules/warning-text.ts"))).toBe(false);
    expect(existsSync(join(SRC, "domain/normalize/alcohol.ts"))).toBe(false);
    expect(existsSync(join(SRC, "domain/normalize/alcohol.test.ts"))).toBe(false);
  });

  it("leaves no production import or export referencing the deleted modules", () => {
    // Exclude test files, which legitimately name the modules in assertions.
    for (const file of allSources.filter((f) => !f.includes(".test."))) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/rules\/warning-text|normalize\/alcohol\b/);
      expect(source).not.toMatch(/REQUIRED_GOVERNMENT_WARNING|WARNING_HEADING|normalizeAlcohol/);
    }
  });
});

describe("no false implemented-capability surface", () => {
  it("runs no government-warning rule in the committed wine profile", () => {
    const ruleIds = winePrecheckRegistry.ruleManifest().map((r) => r.ruleId);
    expect(ruleIds).toEqual([
      "wine-alcohol-syntax",
      "brand-name-canonical-comparison",
      "wine-alcohol-declared-comparison",
      "wine-alcohol-actual-content-tolerance",
      "wine-alcohol-class-type-boundary",
      "wine-alcohol-omission-eligibility",
    ]);
    for (const id of ruleIds) {
      expect(id).not.toMatch(/warning|government/i);
    }
  });

  it("carries no proof normalizer dependency in the pre-check rule/pipeline path", () => {
    const pathFiles = allSources.filter(
      (f) =>
        (f.includes("/domain/rules/") ||
          f.includes("/pipeline/precheck/") ||
          f.includes("/server/")) &&
        !f.includes(".test."),
    );
    for (const file of pathFiles) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/domain\/normalize\/alcohol/);
    }
  });

  it("has no UI source claiming seven-field extraction or distilled-spirits execution", () => {
    for (const file of allSources.filter(
      (f) => f.includes("/features/") && !f.includes(".test."),
    )) {
      const source = readFileSync(file, "utf8");
      expect(source).not.toMatch(/seven[- ]field|distilled[- ]spirit/i);
      // A compliance score/percentage is never presented as a feature. (The UI
      // legitimately disclaims "no overall status", so that phrase is allowed.)
      expect(source).not.toMatch(/compliance (score|percentage)|readiness score/i);
    }
  });
});

describe("acceptance documentation accurately describes the two-field scope", () => {
  const doc = readFileSync(join(ROOT, "docs/slice-3-acceptance.md"), "utf8");

  it("states the current domestic-wine, brand + alcohol two-field scope", () => {
    expect(doc).toMatch(/domestic wine/i);
    expect(doc).toMatch(/exactly two/i);
    expect(doc).toMatch(/brand may be \*\*AMBIGUOUS\*\*/);
  });

  it("states that government-warning execution and proof normalization are not implemented", () => {
    expect(doc).toMatch(/[Gg]overnment-warning execution is not implemented/);
    expect(doc).toMatch(/[Nn]o proof normalization/);
  });

  it("states that no overall compliance verdict exists", () => {
    expect(doc).toMatch(/[Nn]o overall compliance verdict/i);
  });

  it("keeps the fixture identity note verifiable and non-empty", () => {
    expect(statSync(join(ROOT, "docs/slice-3-acceptance.md")).size).toBeGreaterThan(0);
  });
});
