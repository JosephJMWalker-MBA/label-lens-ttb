import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import sharp from "sharp";

import { COMMITTED_MANIFEST_PATH, loadResearchManifest } from "./fixture-corpus";

export const FIXTURE_INVENTORY_SCHEMA_VERSION = "ocr-research-fixture-inventory.v1" as const;

interface EvalRecord {
  caseId: string;
  imagePath: string;
  status: string;
  source?: { provenanceRefs?: string[]; usageStatus?: string };
  annotation?: {
    brand?: {
      presence?: string;
      acceptablePresentations?: string[];
      approxGeometry?: unknown[];
    };
    alcohol?: {
      presence?: string;
      acceptableStatements?: string[];
      acceptablePercents?: number[];
      approxGeometry?: unknown[];
    };
  };
}

export interface FixtureInventoryEntry {
  path: string;
  sha256: string;
  byteSize: number;
  width: number;
  height: number;
  mimeType: string;
  kind:
    | "governed-source-label"
    | "derived-ocr-artifact"
    | "review-or-documentation-image"
    | "other-image";
  fixtureIds: string[];
  provenanceReferences: string[];
  redistributionStatus:
    | "repository-governed-author-attested"
    | "repository-derived"
    | "repository-existing-license-unknown";
  truth: {
    brand: boolean;
    brandRegion: boolean;
    warningPresence: boolean;
    warningExactText: boolean;
    alcohol: boolean;
  };
  suitability: {
    boundedBrandExperiment: boolean;
    fullImageBrandExperiment: boolean;
    warningLocalizationExperiment: boolean;
    warningExactComparisonExperiment: boolean;
    alcoholExperiment: boolean;
  };
  duplicatePaths: string[];
  notes: string[];
}

export interface FixtureInventory {
  schemaVersion: typeof FIXTURE_INVENTORY_SCHEMA_VERSION;
  generatedFromGitTrackedFiles: true;
  entries: FixtureInventoryEntry[];
  summary: {
    imageCount: number;
    uniqueChecksumCount: number;
    duplicateImageCount: number;
    governedSourceLabelCount: number;
    boundedBrandEvaluableCount: number;
    fullImageBrandEvaluableCount: number;
    warningPresenceEvaluableCount: number;
    warningExactEvaluableCount: number;
    alcoholEvaluableCount: number;
  };
}

function trackedImages(): string[] {
  const output = execFileSync("git", ["ls-files", "-z"], {
    cwd: process.cwd(),
    encoding: "buffer",
  });
  return output
    .toString("utf8")
    .split("\0")
    .filter(Boolean)
    .filter((filePath) => /\.(?:png|jpe?g|webp|gif|tiff?|bmp)$/i.test(filePath))
    .sort();
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function imageKind(filePath: string): FixtureInventoryEntry["kind"] {
  if (
    /^tests\/fixtures\/precheck\/[^/]+\/(?:label|label-ocr-source|label-lowres)\./.test(filePath)
  ) {
    return "governed-source-label";
  }
  if (
    /^artifacts\/issue-149-/.test(filePath) ||
    /(?:crops|representative-ocr-inputs|representative-bounded-crops)\//.test(filePath)
  ) {
    return "derived-ocr-artifact";
  }
  if (/^(?:docs|artifacts)\//.test(filePath)) return "review-or-documentation-image";
  return "other-image";
}

function redistributionStatus(
  kind: FixtureInventoryEntry["kind"],
): FixtureInventoryEntry["redistributionStatus"] {
  if (kind === "governed-source-label") return "repository-governed-author-attested";
  if (kind === "derived-ocr-artifact") return "repository-derived";
  return "repository-existing-license-unknown";
}

function readEvalRecords(): EvalRecord[] {
  const evalPath = path.join(process.cwd(), "src/fixtures/eval/eval-manifest.json");
  if (!existsSync(evalPath)) return [];
  return (JSON.parse(readFileSync(evalPath, "utf8")) as { records: EvalRecord[] }).records;
}

function mCellarsWarningPaths(): Set<string> {
  const manifestPath = path.join(
    process.cwd(),
    "tests/fixtures/precheck/m-cellars-24205001000905/manifest.json",
  );
  if (!existsSync(manifestPath)) return new Set();
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    truthLabels?: { governmentWarning?: string };
    sourceChain?: { derivatives?: Array<{ filename?: string }> };
  };
  if (manifest.truthLabels?.governmentWarning !== "present") return new Set();
  return new Set(
    (manifest.sourceChain?.derivatives ?? [])
      .map((item) => item.filename)
      .filter((filename): filename is string => Boolean(filename))
      .map((filename) => `tests/fixtures/precheck/m-cellars-24205001000905/${filename}`),
  );
}

function researchByImagePath() {
  const manifest = loadResearchManifest(path.join(process.cwd(), COMMITTED_MANIFEST_PATH));
  const byPath = new Map<string, (typeof manifest.fixtures)[number][]>();
  for (const fixture of manifest.fixtures) {
    const current = byPath.get(fixture.image.path) ?? [];
    current.push(fixture);
    byPath.set(fixture.image.path, current);
  }
  return byPath;
}

export async function buildFixtureInventory(): Promise<FixtureInventory> {
  const evalByPath = new Map<string, EvalRecord[]>();
  for (const record of readEvalRecords()) {
    const current = evalByPath.get(record.imagePath) ?? [];
    current.push(record);
    evalByPath.set(record.imagePath, current);
  }
  const research = researchByImagePath();
  const warningPresencePaths = mCellarsWarningPaths();
  const intermediate: Omit<FixtureInventoryEntry, "duplicatePaths">[] = [];

  for (const filePath of trackedImages()) {
    const absolutePath = path.join(process.cwd(), filePath);
    const bytes = readFileSync(absolutePath);
    const metadata = await sharp(bytes).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error(`IMAGE_METADATA_MISSING: ${filePath}`);
    }
    const evalRecords = evalByPath.get(filePath) ?? [];
    const researchFixtures = research.get(filePath) ?? [];
    const brandTruth =
      evalRecords.some(
        (record) =>
          record.status === "included" &&
          record.annotation?.brand?.presence !== undefined &&
          (record.annotation.brand.acceptablePresentations?.length ?? 0) > 0,
      ) || researchFixtures.some((fixture) => fixture.truth.brand !== null);
    const alcoholTruth =
      evalRecords.some(
        (record) =>
          record.status === "included" &&
          record.annotation?.alcohol?.presence !== undefined &&
          ((record.annotation.alcohol.acceptableStatements?.length ?? 0) > 0 ||
            (record.annotation.alcohol.acceptablePercents?.length ?? 0) > 0),
      ) || researchFixtures.some((fixture) => fixture.truth.alcohol !== null);
    const brandRegion = researchFixtures.some((fixture) => fixture.regions.brand.length > 0);
    const warningPresence =
      warningPresencePaths.has(filePath) ||
      researchFixtures.some((fixture) => fixture.truth.warning !== null);
    const warningExact = researchFixtures.some(
      (fixture) => fixture.truth.warning !== null && fixture.truth.warning.expectedText !== null,
    );
    const kind = imageKind(filePath);
    const isSource = kind === "governed-source-label";
    const provenanceReferences = [
      ...new Set([
        ...evalRecords.flatMap((record) => record.source?.provenanceRefs ?? []),
        ...researchFixtures.map((fixture) => fixture.provenance.sourceReference),
      ]),
    ].sort();
    const notes: string[] = [];
    if (evalRecords.length > 0 && evalRecords.every((record) => record.status !== "included")) {
      notes.push("Evaluation manifest record exists but is not included.");
    }
    if (warningPresence && !warningExact) {
      notes.push("Warning presence is recorded, but exact prescribed-text truth is not governed.");
    }
    if (kind === "derived-ocr-artifact") {
      notes.push("Derived evidence image; not an independent source-label fixture.");
    }
    intermediate.push({
      path: filePath,
      sha256: sha256(bytes),
      byteSize: bytes.length,
      width: metadata.width,
      height: metadata.height,
      mimeType: metadata.format === "jpeg" ? "image/jpeg" : `image/${metadata.format ?? "unknown"}`,
      kind,
      fixtureIds: [
        ...new Set([
          ...evalRecords.map((record) => record.caseId),
          ...researchFixtures.map((fixture) => fixture.fixtureId),
        ]),
      ].sort(),
      provenanceReferences,
      redistributionStatus: redistributionStatus(kind),
      truth: {
        brand: brandTruth,
        brandRegion,
        warningPresence,
        warningExactText: warningExact,
        alcohol: alcoholTruth,
      },
      suitability: {
        boundedBrandExperiment: isSource && brandTruth && brandRegion,
        fullImageBrandExperiment: isSource && brandTruth,
        warningLocalizationExperiment: isSource && warningPresence,
        warningExactComparisonExperiment: isSource && warningExact,
        alcoholExperiment: isSource && alcoholTruth,
      },
      notes,
    });
  }

  const pathsByChecksum = new Map<string, string[]>();
  for (const entry of intermediate) {
    const current = pathsByChecksum.get(entry.sha256) ?? [];
    current.push(entry.path);
    pathsByChecksum.set(entry.sha256, current);
  }
  const entries: FixtureInventoryEntry[] = intermediate.map((entry) => ({
    ...entry,
    duplicatePaths: (pathsByChecksum.get(entry.sha256) ?? []).filter(
      (filePath) => filePath !== entry.path,
    ),
  }));
  const uniqueChecksumCount = pathsByChecksum.size;
  return {
    schemaVersion: FIXTURE_INVENTORY_SCHEMA_VERSION,
    generatedFromGitTrackedFiles: true,
    entries,
    summary: {
      imageCount: entries.length,
      uniqueChecksumCount,
      duplicateImageCount: entries.length - uniqueChecksumCount,
      governedSourceLabelCount: entries.filter((entry) => entry.kind === "governed-source-label")
        .length,
      boundedBrandEvaluableCount: entries.filter(
        (entry) => entry.suitability.boundedBrandExperiment,
      ).length,
      fullImageBrandEvaluableCount: entries.filter(
        (entry) => entry.suitability.fullImageBrandExperiment,
      ).length,
      warningPresenceEvaluableCount: entries.filter(
        (entry) => entry.suitability.warningLocalizationExperiment,
      ).length,
      warningExactEvaluableCount: entries.filter(
        (entry) => entry.suitability.warningExactComparisonExperiment,
      ).length,
      alcoholEvaluableCount: entries.filter((entry) => entry.suitability.alcoholExperiment).length,
    },
  };
}

function renderInventory(inventory: FixtureInventory): string {
  const summary = inventory.summary;
  const boundedRows = inventory.entries
    .filter((entry) => entry.suitability.boundedBrandExperiment)
    .map(
      (entry) =>
        `| ${entry.path} | ${entry.sha256} | ${entry.width}×${entry.height} | Brand + governed region |`,
    )
    .join("\n");
  return `# Repository image and fixture inventory

This inventory is generated from every Git-tracked raster image. Generated OCR crops and review screenshots remain listed, but only independent governed source-label images can be experiment inputs.

## Summary

- Images: ${summary.imageCount}
- Unique checksums: ${summary.uniqueChecksumCount}
- Duplicate image paths: ${summary.duplicateImageCount}
- Governed source-label images: ${summary.governedSourceLabelCount}
- Bounded Brand evaluable: ${summary.boundedBrandEvaluableCount}
- Full-image Brand evaluable: ${summary.fullImageBrandEvaluableCount}
- Warning-presence evaluable: ${summary.warningPresenceEvaluableCount}
- Warning exact-text evaluable: ${summary.warningExactEvaluableCount}
- Alcohol evaluable: ${summary.alcoholEvaluableCount}

## Bounded Brand experiment corpus

| Path | SHA-256 | Dimensions | Fixed truth |
| --- | --- | --- | --- |
${boundedRows}

The machine-readable \`fixture-inventory.json\` contains every path, checksum, dimension, MIME type, truth/region availability, provenance references, redistribution status, duplicates, and field-specific suitability.
`;
}

export async function writeFixtureInventory(outputDirectory: string): Promise<FixtureInventory> {
  const inventory = await buildFixtureInventory();
  writeFileSync(
    path.join(outputDirectory, "fixture-inventory.json"),
    `${JSON.stringify(inventory, null, 2)}\n`,
  );
  writeFileSync(path.join(outputDirectory, "fixture-inventory.md"), renderInventory(inventory));
  return inventory;
}
