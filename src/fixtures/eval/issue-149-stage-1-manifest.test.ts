/**
 * Issue #149 — Stage 1 contract-package manifest verification.
 *
 * Non-OCR. Proves the manifest covers the whole governed package and cannot stay
 * valid once any contract changes.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { PERMITTED_TRANSITION_PATHS } from "../../../scripts/eval/lib/issue-149-execute-authorization.mjs";

/**
 * The two transition controls the manifest deliberately does not hash.
 *
 * Stated here from the transition gate's own permitted paths rather than
 * imported from the generator: what matters is that the generator's ACTUAL
 * output excludes exactly these, which the tests below derive from the manifest
 * and the directory on disk. That is a behavioural assertion — a generator that
 * exported the right constant and excluded something else would still fail.
 */
const TRANSITION_CONTROL_EXCLUSIONS = [...PERMITTED_TRANSITION_PATHS];

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

  it("lists each entry exactly once", () => {
    const listed = entries.map((e) => e.path);
    expect(new Set(listed).size).toBe(listed.length);
  });

  it("covers every governed artifact exactly once, in sorted path order", () => {
    const governed = walk(ROOT).filter(
      (f) => f !== MANIFEST && !TRANSITION_CONTROL_EXCLUSIONS.includes(f),
    );
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
      "scripts/eval/lib/issue-149-stage2-source-closure.ts",
      "scripts/eval/lib/issue-149-candidate-adapter.ts",
      "scripts/eval/lib/issue-149-evidence-canonical.ts",
      "src/fixtures/eval/issue-149-acquisition-isolation.test.ts",
      "src/fixtures/eval/issue-149-acquisition-orchestration.test.ts",
      "src/fixtures/eval/issue-149-bundle-scan.test.ts",
      "src/fixtures/eval/issue-149-contract-consistency.test.ts",
      "src/fixtures/eval/issue-149-dependency-closure.test.ts",
      "src/fixtures/eval/issue-149-evidence-canonical.test.ts",
      "src/fixtures/eval/issue-149-freeze-core-loader.test.ts",
      "src/fixtures/eval/issue-149-frozen-vocabulary.test.ts",
      "src/fixtures/eval/issue-149-generated-artifact-reproducibility.test.ts",
      "src/fixtures/eval/issue-149-production-candidate-compatibility.test.ts",
      "src/fixtures/eval/issue-149-ranked-invariants.test.ts",
      "src/fixtures/eval/issue-149-stage2-source-closure.test.ts",
      "src/fixtures/eval/issue-149-staging-independence.test.ts",
      "src/fixtures/eval/issue-149-stage-1-manifest.test.ts",
    ]) {
      expect(listed).toContain(file);
    }
  });

  it("omits no governed file except the two transition controls", () => {
    const governed = new Set(
      walk(ROOT).filter((f) => f !== MANIFEST && !TRANSITION_CONTROL_EXCLUSIONS.includes(f)),
    );
    const listed = new Set(entries.map((e) => e.path));
    const missing = [...governed].filter((f) => !listed.has(f));
    expect(missing).toEqual([]);
  });

  describe("the transition controls are governed separately, not ungoverned", () => {
    it("excludes EXACTLY the two transition controls, and nothing else", () => {
      // Derived from what the generator actually produced, not from a constant
      // it exports.
      // The manifest binds the immutable IMPLEMENTATION. Hashing the mutable
      // controls made the authorized transition impossible: changing them would
      // make the manifest stale, and the transition commit cannot regenerate it
      // without presenting a third changed path to the execute gate.
      expect([...TRANSITION_CONTROL_EXCLUSIONS].sort()).toEqual(
        [`${ROOT}/execute-authorization.json`, `${ROOT}/workflow-mode.txt`].sort(),
      );
      const listed = new Set(entries.map((e) => e.path));
      for (const control of TRANSITION_CONTROL_EXCLUSIONS) {
        expect(listed.has(control)).toBe(false);
      }

      // No THIRD path is excluded: everything else under the governed directory
      // that is not the manifest is listed.
      const everything = walk(ROOT).filter((f) => f !== MANIFEST);
      const excluded = everything.filter((f) => !listed.has(f));
      expect(excluded.sort()).toEqual([...TRANSITION_CONTROL_EXCLUSIONS].sort());
    });

    it("excludes exactly the paths the transition gate permits", () => {
      // The two sets must be the same set, derived independently: the manifest's
      // actual exclusions on one side, the gate's permitted paths on the other.
      // If the gate permitted a path the manifest still hashed, that transition
      // would break the manifest; if the manifest excluded a path the gate did
      // not permit, that file would be governed by neither.
      const listed = new Set(entries.map((e) => e.path));
      const actuallyExcluded = walk(ROOT)
        .filter((f) => f !== MANIFEST && !listed.has(f))
        .sort();
      expect(actuallyExcluded).toEqual([...PERMITTED_TRANSITION_PATHS].sort());
    });

    it("keeps both excluded files present, and records how they are governed", () => {
      for (const control of TRANSITION_CONTROL_EXCLUSIONS) {
        expect(existsSync(path.join(process.cwd(), control))).toBe(true);
      }
      const governance = JSON.parse(
        readFileSync(path.join(process.cwd(), ROOT, "transition-control-governance.json"), "utf8"),
      ) as {
        excludedFromTheStage1Manifest: string[];
        noOtherArtifactIsExcluded: boolean;
        exclusionSetEqualsPermittedTransitionPaths: boolean;
        exclusionDoesNotMeanUncontrolled: { controls: string[] };
      };
      expect(governance.excludedFromTheStage1Manifest.sort()).toEqual(
        [...TRANSITION_CONTROL_EXCLUSIONS].sort(),
      );
      expect(governance.noOtherArtifactIsExcluded).toBe(true);
      expect(governance.exclusionSetEqualsPermittedTransitionPaths).toBe(true);
      expect(governance.exclusionDoesNotMeanUncontrolled.controls.length).toBeGreaterThanOrEqual(5);
      // …and the governance record is itself inside the manifest.
      expect(entries.map((e) => e.path)).toContain(`${ROOT}/transition-control-governance.json`);
    });

    it("invalidates the manifest when an INCLUDED contract changes", () => {
      // The exclusion must not have weakened coverage of anything else.
      const contract = entries.find((e) => e.path.endsWith("/evidence-schema.json"));
      expect(contract).toBeDefined();
      const bytes = readFileSync(path.join(process.cwd(), contract!.path));
      expect(sha256(bytes)).toBe(contract!.sha256);
      expect(sha256(Buffer.concat([bytes, Buffer.from(" ")]))).not.toBe(contract!.sha256);
    });

    it("is NOT invalidated when a transition control changes", () => {
      // The whole point: an authorized transition changes these two files and
      // the immutable implementation manifest stays valid, because their
      // integrity is adjudicated by the transition controls instead.
      const listed = entries.map((e) => e.path);
      for (const control of TRANSITION_CONTROL_EXCLUSIONS) {
        expect(listed).not.toContain(control);
      }
      const recomputed = sha256(
        Buffer.from(entries.map((e) => `${e.sha256}  ${e.path}`).join("\n") + "\n", "utf8"),
      );
      expect(recomputed).toBe(aggregate);
    });
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
