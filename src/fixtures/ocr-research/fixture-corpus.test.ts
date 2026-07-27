import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import {
  composeResearchManifest,
  importResearchFixture,
  loadResearchManifest,
  parseResearchFixture,
} from "./fixture-corpus";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), "label-lens-ocr-fixture-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function sourceImage(directory: string): Promise<string> {
  mkdirSync(directory, { recursive: true });
  const filePath = path.join(directory, "source.png");
  await sharp({
    create: {
      width: 80,
      height: 40,
      channels: 3,
      background: { r: 240, g: 240, b: 240 },
    },
  })
    .png()
    .toFile(filePath);
  return filePath;
}

function baseOptions(sourcePath: string, rootDir: string) {
  return {
    sourcePath,
    rootDir,
    mode: "committable" as const,
    displayName: "Deterministic label",
    provenance: {
      sourceDescription: "Author-provided test label",
      sourceReference: "test://fixture",
      acquisitionMethod: "test generation",
      acquiredBy: "fixture test",
      acquiredAt: "2026-07-27",
    },
    redistribution: {
      status: "approved-for-repository" as const,
      license: "test-only",
      notes: "Generated entirely inside this test.",
    },
    regions: {
      brand: [
        {
          unit: "normalized-panel-relative" as const,
          provenance: "seller-selected-region" as const,
          x: 0.1,
          y: 0.1,
          width: 0.5,
          height: 0.5,
          label: "Brand",
        },
      ],
    },
    truth: {
      brand: {
        acceptableValues: ["TEST BRAND"],
        evidenceSource: {
          kind: "human-transcription" as const,
          description: "Visible generated text",
          reference: "test://truth",
          wholeLabelReviewed: false,
        },
      },
      warning: null,
      alcohol: null,
    },
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("governed OCR fixture ingestion", () => {
  it("derives a stable fixture ID, checksum, dimensions, MIME type, and preserved original", async () => {
    const firstRoot = temporaryDirectory();
    const secondRoot = temporaryDirectory();
    const sourcePath = await sourceImage(firstRoot);
    const first = await importResearchFixture(baseOptions(sourcePath, path.join(firstRoot, "out")));
    const second = await importResearchFixture(
      baseOptions(sourcePath, path.join(secondRoot, "out")),
    );

    expect(first.fixture.fixtureId).toBe(second.fixture.fixtureId);
    expect(first.fixture.image.sha256).toBe(second.fixture.image.sha256);
    expect(first.fixture.image).toMatchObject({
      width: 80,
      height: 40,
      mimeType: "image/png",
      ownership: "fixture-original",
    });
    const original = readFileSync(sourcePath);
    const copied = readFileSync(path.join(first.fixtureDirectory, "original.png"));
    expect(copied.equals(original)).toBe(true);
    expect(first.fixture.image.sha256).toBe(createHash("sha256").update(original).digest("hex"));
  });

  it("rejects a duplicate checksum across the governed manifest", async () => {
    const root = temporaryDirectory();
    const sourcePath = await sourceImage(root);
    const options = baseOptions(sourcePath, path.join(root, "out"));
    await importResearchFixture(options);
    await expect(importResearchFixture(options)).rejects.toThrow(/DUPLICATE_CHECKSUM/);
  });

  it("keeps local-private and committable manifests separate and excludes private by default", async () => {
    const root = temporaryDirectory();
    const committedRoot = path.join(root, "committed");
    const privateRoot = path.join(root, "private");
    const committedSource = await sourceImage(path.join(root, "source-a"));
    await importResearchFixture(baseOptions(committedSource, committedRoot));
    const privateSource = await sharp({
      create: {
        width: 81,
        height: 41,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .png()
      .toBuffer();
    const privatePath = path.join(root, "private-source.png");
    await sharp(privateSource).toFile(privatePath);
    await importResearchFixture({
      ...baseOptions(privatePath, privateRoot),
      mode: "local-private",
      redistribution: {
        status: "private-not-approved",
        license: "not-cleared",
        notes: "Must not be committed.",
      },
    });

    const committedOnly = composeResearchManifest({
      committedPath: path.join(committedRoot, "manifest.json"),
      privatePath: path.join(privateRoot, "manifest.json"),
    });
    const combined = composeResearchManifest({
      committedPath: path.join(committedRoot, "manifest.json"),
      privatePath: path.join(privateRoot, "manifest.json"),
      includePrivate: true,
    });
    expect(committedOnly.fixtures).toHaveLength(1);
    expect(committedOnly.fixtures[0].mode).toBe("committable");
    expect(combined.fixtures).toHaveLength(2);
    expect(combined.fixtures.map((fixture) => fixture.mode).sort()).toEqual([
      "committable",
      "local-private",
    ]);
  });

  it("rejects malformed provenance, impossible coordinates, truth without a source, and unsafe absence claims", () => {
    const valid = {
      schemaVersion: "ocr-research-fixture.v1",
      fixtureId: "label-1234567890abcdef",
      displayName: "Validation fixture",
      mode: "committable",
      image: {
        path: "tests/example.png",
        ownership: "fixture-original",
        sha256: "a".repeat(64),
        byteSize: 1,
        width: 10,
        height: 10,
        mimeType: "image/png",
      },
      provenance: {
        sourceDescription: "Source",
        sourceReference: "reference",
        acquisitionMethod: "manual",
        acquiredBy: "operator",
        acquiredAt: null,
      },
      redistribution: {
        status: "approved-for-repository",
        license: "approved",
        notes: "Approved for the repository.",
      },
      regions: { brand: [] },
      truth: { brand: null, warning: null, alcohol: null },
    };
    expect(() =>
      parseResearchFixture({
        ...valid,
        provenance: { ...valid.provenance, sourceDescription: "" },
      }),
    ).toThrow();
    expect(() =>
      parseResearchFixture({
        ...valid,
        regions: {
          brand: [
            {
              unit: "normalized-panel-relative",
              provenance: "seller-selected-region",
              x: 0.8,
              y: 0,
              width: 0.3,
              height: 0.5,
              label: "Outside",
            },
          ],
        },
      }),
    ).toThrow(/exceeds image width/);
    expect(() =>
      parseResearchFixture({
        ...valid,
        truth: { brand: { acceptableValues: ["BRAND"] }, warning: null, alcohol: null },
      }),
    ).toThrow();
    expect(() =>
      parseResearchFixture({
        ...valid,
        truth: {
          brand: null,
          alcohol: null,
          warning: {
            presence: "absent",
            expectedText: null,
            evidenceSource: {
              kind: "human-transcription",
              description: "Only a crop was inspected.",
              reference: "test://crop",
              wholeLabelReviewed: false,
            },
          },
        },
      }),
    ).toThrow(/whole-label evidence/);
  });

  it("persists a schema-valid manifest without mixing image bytes into metadata", async () => {
    const root = temporaryDirectory();
    const sourcePath = await sourceImage(root);
    const imported = await importResearchFixture(baseOptions(sourcePath, path.join(root, "out")));
    const manifest = loadResearchManifest(imported.manifestPath);
    expect(manifest.fixtures).toEqual([imported.fixture]);
    expect(JSON.stringify(manifest)).not.toContain(readFileSync(sourcePath).toString("base64"));
  });
});
