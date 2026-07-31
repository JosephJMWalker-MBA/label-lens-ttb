/**
 * Issue #149 — acquisition identity and truth-isolation contract.
 *
 * Non-OCR. These tests read the committed Stage 1 planning artifacts and assert
 * the filesystem separation the amended preregistration promises. They run no
 * recognizer and never open a governed truth file.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = "artifacts/issue-149-brand-complete-evidence-acquisition";
const INPUT_MANIFEST = path.join(ROOT, "truth-free-input-manifest.json");
const ID_MAP = path.join(ROOT, "post-freeze/id-map.json");

const read = (p: string) => JSON.parse(readFileSync(path.join(process.cwd(), p), "utf8"));

interface InputCase {
  opaqueItemId: string;
  stagedImageFileName: string;
  sourceImageSha256: string;
  sourceImageByteSize: number;
}
interface MapEntry {
  opaqueItemId: string;
  historicalCaseId: string;
  historicalImagePath: string;
  sourceImageSha256: string;
  sourceImageByteSize: number;
}

describe("Issue #149 acquisition identity and isolation", () => {
  const manifest = read(INPUT_MANIFEST) as {
    cases: InputCase[];
    stagedImageDirectory: string;
    stagedFilenamePattern: string;
  };
  const idMap = read(ID_MAP) as {
    map: MapEntry[];
    location: string;
    accessBoundary: Record<string, unknown>;
  };

  it("gives every case an opaque item-NNNN identifier, contiguous from 0001", () => {
    expect(manifest.cases).toHaveLength(115);
    const ids = manifest.cases.map((c) => c.opaqueItemId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(
      Array.from({ length: 115 }, (_, index) => `item-${String(index + 1).padStart(4, "0")}`),
    );
  });

  it("exposes only opaque identity and image provenance to acquisition", () => {
    for (const entry of manifest.cases) {
      expect(Object.keys(entry).sort()).toEqual([
        "opaqueItemId",
        "sourceImageByteSize",
        "sourceImageSha256",
        "stagedImageFileName",
      ]);
    }
  });

  it("stages every image under a generic opaque filename", () => {
    const pattern = new RegExp(manifest.stagedFilenamePattern);
    for (const entry of manifest.cases) {
      expect(entry.stagedImageFileName).toMatch(pattern);
      expect(entry.stagedImageFileName.startsWith(entry.opaqueItemId)).toBe(true);
    }
  });

  it("leaks no historical case ID or fixture path into the acquisition input", () => {
    const serialized = JSON.stringify(manifest.cases);
    for (const entry of idMap.map) {
      expect(serialized).not.toContain(entry.historicalCaseId);
      expect(serialized).not.toContain(entry.historicalImagePath);
    }
    for (const key of ["caseId", "imagePath", "truth", "acceptable", "brandPresent", "expected"]) {
      expect(serialized.toLowerCase()).not.toContain(key.toLowerCase());
    }
  });

  it("keeps the id map outside every acquisition input mount and raw evidence directory", () => {
    // The only mounted input is the staged image directory, which is untracked
    // and holds images only. The map lives under post-freeze/, a sibling of the
    // contracts, and never under raw/.
    const mapPath = idMap.location;
    expect(mapPath.startsWith(`${ROOT}/post-freeze/`)).toBe(true);
    expect(mapPath).not.toContain("/raw/");
    expect(mapPath.startsWith(manifest.stagedImageDirectory)).toBe(false);
    expect(existsSync(path.join(process.cwd(), ROOT, "raw"))).toBe(false);
  });

  it("declares the id map unreachable from acquisition", () => {
    expect(idMap.accessBoundary).toMatchObject({
      mountedIntoAcquisition: false,
      insideAcquisitionInputDirectory: false,
      insideRawEvidenceDirectory: false,
      importedByAcquisitionHarness: false,
    });
  });

  it("maps every opaque id back to exactly one historical case", () => {
    expect(idMap.map).toHaveLength(115);
    const opaque = idMap.map.map((e) => e.opaqueItemId);
    const historical = idMap.map.map((e) => e.historicalCaseId);
    expect(new Set(opaque).size).toBe(115);
    expect(new Set(historical).size).toBe(115);
    const byOpaque = new Map(idMap.map.map((e) => [e.opaqueItemId, e]));
    for (const entry of manifest.cases) {
      const mapped = byOpaque.get(entry.opaqueItemId);
      expect(mapped).toBeDefined();
      expect(mapped!.sourceImageSha256).toBe(entry.sourceImageSha256);
      expect(mapped!.sourceImageByteSize).toBe(entry.sourceImageByteSize);
    }
  });

  describe("future acquisition-runner import prohibition", () => {
    const RUNNERS = [
      "scripts/eval/issue-149-brand-evidence-acquisition-run.ts",
      "scripts/eval/issue-149-brand-evidence-acquisition-run.mjs",
    ];
    /**
     * A specifier is prohibited when its path reaches `fixtures/` or
     * `domain/rules/`, however it is spelled: `@/fixtures/…`,
     * `src/fixtures/…`, or a relative walk such as `../../src/fixtures/…`.
     * Matching on the segment rather than on a fixed prefix is what stops a
     * relative path from slipping past the guard.
     */
    const PROHIBITED_PATH_SEGMENTS = [/(?:^|\/)fixtures\//, /(?:^|\/)domain\/rules\//];

    function isProhibitedSpecifier(quoted: string): boolean {
      const specifier = quoted.slice(1, -1).replace(/^@\//, "");
      return PROHIBITED_PATH_SEGMENTS.some((pattern) => pattern.test(specifier));
    }
    const PROHIBITED_SYMBOLS = [
      "runCaseArtifacts",
      "runCase",
      "loadCaseImage",
      "buildCaseReport",
      "diagnosticsFor",
      "EvalCase",
    ];

    /** Import, re-export, `require(...)` and dynamic `import(...)` specifiers. */
    function moduleSpecifiers(source: string): string[] {
      const found: string[] = [];
      const patterns = [
        /\bfrom\s+(["'`][^"'`]+["'`])/g,
        /\bimport\s+(["'`][^"'`]+["'`])/g,
        /\brequire\s*\(\s*(["'`][^"'`]+["'`])\s*\)/g,
        /\bimport\s*\(\s*(["'`][^"'`]+["'`])\s*\)/g,
      ];
      for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) found.push(match[1]);
      }
      return found;
    }

    const present = RUNNERS.filter((file) => existsSync(path.join(process.cwd(), file)));

    it("records explicitly that no future runner exists yet", () => {
      if (present.length > 0) {
        // A runner has appeared: the prohibition below is what binds it.
        expect(present.length).toBeGreaterThan(0);
        return;
      }
      expect(present).toEqual([]);
    });

    it("fails any existing runner that imports a prohibited module", () => {
      const offences: string[] = [];
      for (const file of present) {
        const source = readFileSync(path.join(process.cwd(), file), "utf8");
        for (const specifier of moduleSpecifiers(source)) {
          if (isProhibitedSpecifier(specifier)) offences.push(`${file} imports ${specifier}`);
        }
      }
      expect(offences).toEqual([]);
    });

    it("fails any existing runner that references a prohibited symbol", () => {
      const offences: string[] = [];
      for (const file of present) {
        const source = readFileSync(path.join(process.cwd(), file), "utf8");
        for (const symbol of PROHIBITED_SYMBOLS) {
          if (new RegExp(`\\b${symbol}\\b`).test(source)) {
            offences.push(`${file} references ${symbol}`);
          }
        }
      }
      expect(offences).toEqual([]);
    });

    it("detects prohibited imports and symbols in synthetic sources", () => {
      // The detector is exercised directly, so "no runner exists" can never be
      // mistaken for "the guard works".
      const bad = [
        'import { runCaseArtifacts } from "@/fixtures/eval/eval-harness";',
        'const h = require("../../src/fixtures/eval/eval-harness");',
        'const m = await import("@/domain/rules/wine-alcohol-parse");',
        'export { x } from "src/fixtures/eval/metrics";',
      ];
      for (const source of bad) {
        expect(moduleSpecifiers(source).some(isProhibitedSpecifier)).toBe(true);
      }
      for (const symbol of PROHIBITED_SYMBOLS) {
        expect(new RegExp(`\\b${symbol}\\b`).test(bad.join("\n"))).toBe(
          symbol === "runCaseArtifacts",
        );
      }
      // Permitted specifiers must not be flagged, so the guard is not vacuous.
      for (const ok of [
        'import { createHash } from "node:crypto";',
        'import { extractLabelEvidenceDetailed } from "../../src/pipeline/extractor";',
      ]) {
        expect(moduleSpecifiers(ok).some(isProhibitedSpecifier)).toBe(false);
      }
    });

    it("does not claim transitive runtime isolation", () => {
      // Static source inspection cannot prove what a process can reach at run
      // time. The runtime bundle manifest and the discover gate own that.
      const contract = read(path.join(ROOT, "acquisition-runtime-isolation-contract.json")) as {
        discoverModeGate: { runsInsideTheSameRuntimeBoundaryAsExecute: boolean };
      };
      expect(contract.discoverModeGate.runsInsideTheSameRuntimeBoundaryAsExecute).toBe(true);
    });
  });
});
