/**
 * Issue #149 — `loadSourceImage` must be the ONLY source-image byte channel.
 *
 * Non-OCR. Every input here is synthetic and every image is virtual: the paths do
 * not exist on disk. If the core resolved source images itself — as it did when
 * it verified through the loader and then staged with a separate `copyFileSync`
 * from the historical path — this test could not pass at all.
 *
 * It writes only into a unique temporary directory and touches no tracked file.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { generateStageOneArtifacts } from "../../../scripts/eval/lib/issue-149-freeze-core.mjs";

const ROOT = "artifacts/issue-149-brand-complete-evidence-acquisition";
const CORE = "scripts/eval/lib/issue-149-freeze-core.mjs";
const TOTAL = 115;
const PRESENT = 105;

const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

const scratchDirectories: string[] = [];
afterAll(() => {
  for (const directory of scratchDirectories) rmSync(directory, { recursive: true, force: true });
});

/** 115 virtual cases with the frozen 105/10 split and unique image bytes. */
function synthetic() {
  const cases = [];
  const records = [];
  const bytesByPath = new Map<string, Buffer>();

  for (let index = 0; index < TOTAL; index += 1) {
    const caseId = `virtual-case-${String(index).padStart(3, "0")}`;
    const imagePath = `virtual/does-not-exist/${caseId}.png`;
    // Unique, deterministic, and NOT derived from anything on disk.
    const bytes = Buffer.from(`VIRTUAL-IMAGE-${index}-${"x".repeat(index + 1)}`, "utf8");
    bytesByPath.set(imagePath, bytes);

    cases.push({
      caseId,
      governedTruth: {
        present: index < PRESENT,
        acceptableValues: [`ACCEPTABLE-${index}`],
        note: "virtual",
      },
    });
    records.push({
      caseId,
      imagePath,
      status: "included",
      expectedSha256: sha256(bytes),
    });
  }

  return {
    pr217: { cases },
    pr218: { frozenCaseIds: [cases[0].caseId, cases[1].caseId] },
    evalManifest: { records },
    bytesByPath,
  };
}

describe("Issue #149 freeze core stages solely from the injected loader", () => {
  const fixture = synthetic();
  const opened: string[] = [];

  const scratch = mkdtempSync(path.join(tmpdir(), "issue-149-virtual-loader-"));
  scratchDirectories.push(scratch);

  const result = generateStageOneArtifacts({
    pr217: fixture.pr217 as never,
    pr218: fixture.pr218 as never,
    evalManifest: fixture.evalManifest as never,
    loadSourceImage: (imagePath: string) => {
      opened.push(imagePath);
      const bytes = fixture.bytesByPath.get(imagePath);
      if (bytes === undefined) throw new Error(`unexpected image path: ${imagePath}`);
      return bytes;
    },
    forbiddenEvidenceKeys: JSON.parse(
      readFileSync(path.join(process.cwd(), ROOT, "runtime/truth-key-inventory.json"), "utf8"),
    ) as string[],
    out: {
      root: path.join(scratch, "artifacts"),
      postFreeze: path.join(scratch, "artifacts/post-freeze"),
      staged: path.join(scratch, "staged"),
    },
  });

  it("stages all 115 virtual images with no file on disk to copy from", () => {
    for (const imagePath of fixture.bytesByPath.keys()) {
      expect(existsSync(path.join(process.cwd(), imagePath))).toBe(false);
    }
    expect(result.summary.total).toBe(TOTAL);
    expect(result.summary.brandPresent).toBe(PRESENT);
    expect(result.summary.brandAbsent).toBe(TOTAL - PRESENT);
    expect(result.stagedListing).toHaveLength(TOTAL);
    expect(readdirSync(path.join(scratch, "staged")).sort()).toEqual(result.stagedListing);
  });

  it("asks the loader for every image exactly once", () => {
    expect(opened).toHaveLength(TOTAL);
    expect(new Set(opened).size).toBe(TOTAL);
    expect(new Set(opened)).toEqual(new Set(fixture.bytesByPath.keys()));
  });

  it("writes the exact injected Buffer to each opaque staged file", () => {
    const manifest = JSON.parse(readFileSync(result.written.truthFreeInputManifest, "utf8")) as {
      cases: Array<{
        opaqueItemId: string;
        stagedImageFileName: string;
        sourceImageSha256: string;
        sourceImageByteSize: number;
      }>;
    };
    const idMap = JSON.parse(readFileSync(result.written.idMap, "utf8")) as {
      map: Array<{ opaqueItemId: string; historicalImagePath: string }>;
    };
    const pathById = new Map(
      idMap.map.map((entry) => [entry.opaqueItemId, entry.historicalImagePath]),
    );

    expect(manifest.cases).toHaveLength(TOTAL);
    for (const entry of manifest.cases) {
      const injected = fixture.bytesByPath.get(pathById.get(entry.opaqueItemId)!)!;
      const staged = readFileSync(path.join(scratch, "staged", entry.stagedImageFileName));
      expect(staged.equals(injected)).toBe(true);
      expect(entry.sourceImageSha256).toBe(sha256(injected));
      expect(entry.sourceImageByteSize).toBe(injected.length);
    }
  });

  it("never serializes the transient bytes into any artifact", () => {
    for (const file of Object.values(result.written)) {
      const contents = readFileSync(file, "utf8");
      expect(contents).not.toContain("VIRTUAL-IMAGE-");
      expect(contents).not.toContain('"bytes"');
    }
  });

  it("resolves no source image itself", () => {
    // The structural counterpart: the core has no second byte channel.
    const source = readFileSync(path.join(process.cwd(), CORE), "utf8");
    const code = source.slice(source.indexOf("import {"));
    expect(code).not.toContain("copyFileSync");
    expect(code).not.toMatch(/process\.cwd\(\)/);
    expect(code).toContain("loadSourceImage");
  });
});
