/**
 * Issue #149 — Stage 1 contract-package manifest verification.
 *
 * Non-OCR. Proves the manifest covers the whole governed package and cannot stay
 * valid once any contract changes.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = "artifacts/issue-149-brand-complete-evidence-acquisition";
const MANIFEST = path.join(ROOT, "stage-1-contract-manifest.sha256");

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

function walk(dir: string): string[] {
  return readdirSync(path.join(process.cwd(), dir)).flatMap((entry) => {
    const relative = path.join(dir, entry);
    return statSync(path.join(process.cwd(), relative)).isDirectory() ? walk(relative) : [relative];
  });
}

function parseManifest(): { entries: Array<{ sha256: string; path: string }>; aggregate: string } {
  const text = readFileSync(path.join(process.cwd(), MANIFEST), "utf8");
  const entries: Array<{ sha256: string; path: string }> = [];
  let aggregate = "";
  for (const line of text.split("\n")) {
    if (line.startsWith("# aggregate ")) {
      aggregate = line.slice("# aggregate ".length).trim();
      continue;
    }
    if (!line.trim()) continue;
    const [digest, file] = line.split("  ");
    entries.push({ sha256: digest, path: file });
  }
  return { entries, aggregate };
}

describe("Issue #149 Stage 1 contract manifest", () => {
  const { entries, aggregate } = parseManifest();

  it("covers every governed artifact exactly once, in sorted path order", () => {
    const governed = walk(ROOT).filter((f) => f !== MANIFEST);
    const listed = entries.map((e) => e.path);

    for (const file of governed) expect(listed).toContain(file);
    expect(new Set(listed).size).toBe(listed.length);
    expect(listed).toEqual([...listed].sort());
  });

  it("includes the authoritative forbidden-key inventory asset", () => {
    expect(entries.map((e) => e.path)).toContain(`${ROOT}/runtime/truth-key-inventory.json`);
  });

  it("includes the committed post-freeze id map", () => {
    expect(entries.map((e) => e.path)).toContain(`${ROOT}/post-freeze/id-map.json`);
  });

  it("keeps the canonical helper outside src/fixtures, where the runner may import it", () => {
    const listed = entries.map((e) => e.path);
    expect(listed).toContain("scripts/eval/lib/issue-149-evidence-canonical.ts");
    expect(listed).toContain("scripts/eval/lib/issue-149-bundle-scan.ts");
    expect(listed).toContain("scripts/eval/lib/issue-149-candidate-adapter.ts");
    expect(listed).toContain("scripts/eval/lib/issue-149-freeze-core.mjs");
    expect(
      listed.some((f) => f.startsWith("src/fixtures/eval/issue-149-candidate-canonical")),
    ).toBe(false);
  });

  it("includes the freeze script, the canonical helper and every Stage 1 contract test", () => {
    const listed = entries.map((e) => e.path);
    for (const file of [
      "scripts/eval/issue-149-brand-evidence-acquisition-freeze.mjs",
      "scripts/eval/issue-149-stage-1-contract-manifest.mjs",
      "scripts/eval/lib/issue-149-bundle-scan.ts",
      "scripts/eval/lib/issue-149-freeze-core.d.mts",
      "scripts/eval/lib/issue-149-freeze-core.mjs",
      "scripts/eval/lib/issue-149-candidate-adapter.ts",
      "scripts/eval/lib/issue-149-evidence-canonical.ts",
      "src/fixtures/eval/issue-149-acquisition-isolation.test.ts",
      "src/fixtures/eval/issue-149-bundle-scan.test.ts",
      "src/fixtures/eval/issue-149-contract-consistency.test.ts",
      "src/fixtures/eval/issue-149-dependency-closure.test.ts",
      "src/fixtures/eval/issue-149-evidence-canonical.test.ts",
      "src/fixtures/eval/issue-149-frozen-vocabulary.test.ts",
      "src/fixtures/eval/issue-149-generated-artifact-reproducibility.test.ts",
      "src/fixtures/eval/issue-149-production-candidate-compatibility.test.ts",
      "src/fixtures/eval/issue-149-staging-independence.test.ts",
      "src/fixtures/eval/issue-149-stage-1-manifest.test.ts",
    ]) {
      expect(listed).toContain(file);
    }
  });

  it("omits no governed file", () => {
    const governed = new Set(walk(ROOT).filter((f) => f !== MANIFEST));
    const listed = new Set(entries.map((e) => e.path));
    const missing = [...governed].filter((f) => !listed.has(f));
    expect(missing).toEqual([]);
  });

  it("verifies every recorded hash against the file on disk", () => {
    const mismatches: string[] = [];
    for (const entry of entries) {
      const actual = sha256(readFileSync(path.join(process.cwd(), entry.path)));
      if (actual !== entry.sha256) mismatches.push(entry.path);
    }
    expect(mismatches).toEqual([]);
  });

  it("carries an aggregate over the sorted lines", () => {
    expect(aggregate).toMatch(/^[0-9a-f]{64}$/);
    const recomputed = sha256(
      Buffer.from(entries.map((e) => `${e.sha256}  ${e.path}`).join("\n") + "\n", "utf8"),
    );
    expect(recomputed).toBe(aggregate);
  });

  it("cannot stay valid after a contract changes", () => {
    // Flipping one byte of one entry must change the aggregate, so a stale
    // manifest is detectable rather than silently passing.
    const mutated = entries.map((e, index) =>
      index === 0
        ? { ...e, sha256: `${e.sha256.slice(0, 63)}${e.sha256.endsWith("0") ? "1" : "0"}` }
        : e,
    );
    const mutatedAggregate = sha256(
      Buffer.from(mutated.map((e) => `${e.sha256}  ${e.path}`).join("\n") + "\n", "utf8"),
    );
    expect(mutatedAggregate).not.toBe(aggregate);
  });
});
