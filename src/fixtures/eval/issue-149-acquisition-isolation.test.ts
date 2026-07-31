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

  it("keeps no acquisition script importing or referencing the id map", () => {
    const acquisitionFacing = ["scripts/eval/issue-149-brand-evidence-acquisition-freeze.mjs"];
    for (const file of acquisitionFacing) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8");
      // The freeze script is the TRUSTED STAGING STEP and legitimately writes the
      // map. What must never happen is an acquisition-side read of it.
      expect(source).not.toContain("readFileSync(ID_MAP");
      expect(source).not.toContain('post-freeze/id-map.json", "utf8")');
    }
  });
});
