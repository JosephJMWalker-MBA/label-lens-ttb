import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import sharp from "sharp";
import { z } from "zod";

export const OCR_RESEARCH_FIXTURE_SCHEMA_VERSION = "ocr-research-fixture.v1" as const;
export const OCR_RESEARCH_MANIFEST_SCHEMA_VERSION = "ocr-research-manifest.v1" as const;

export const COMMITTED_FIXTURE_ROOT = "tests/fixtures/ocr-research";
export const PRIVATE_FIXTURE_ROOT = ".local/ocr-research/fixtures";
export const COMMITTED_MANIFEST_PATH = `${COMMITTED_FIXTURE_ROOT}/manifest.json`;
export const PRIVATE_MANIFEST_PATH = `${PRIVATE_FIXTURE_ROOT}/manifest.json`;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const nonEmpty = z.string().trim().min(1);

export const normalizedRegionSchema = z
  .object({
    unit: z.literal("normalized-panel-relative"),
    provenance: z.enum(["seller-selected-region", "human-approved-region"]),
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
    width: z.number().finite().gt(0).max(1),
    height: z.number().finite().gt(0).max(1),
    label: nonEmpty,
  })
  .strict()
  .superRefine((region, context) => {
    if (region.x + region.width > 1) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "region exceeds image width" });
    }
    if (region.y + region.height > 1) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "region exceeds image height" });
    }
  });

export type NormalizedResearchRegion = z.infer<typeof normalizedRegionSchema>;

export const truthEvidenceSourceSchema = z
  .object({
    kind: z.enum([
      "seller-declaration",
      "human-transcription",
      "human-approved-region",
      "public-record",
    ]),
    description: nonEmpty,
    reference: nonEmpty,
    wholeLabelReviewed: z.boolean(),
  })
  .strict();

const brandTruthSchema = z
  .object({
    acceptableValues: z.array(nonEmpty).min(1),
    evidenceSource: truthEvidenceSourceSchema,
  })
  .strict();

const warningTruthSchema = z
  .object({
    presence: z.enum(["present", "absent"]),
    expectedText: nonEmpty.nullable(),
    evidenceSource: truthEvidenceSourceSchema,
  })
  .strict()
  .superRefine((truth, context) => {
    if (truth.presence === "absent" && !truth.evidenceSource.wholeLabelReviewed) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "warning absence requires whole-label evidence",
      });
    }
  });

const alcoholTruthSchema = z
  .object({
    acceptableValues: z.array(nonEmpty).min(1),
    evidenceSource: truthEvidenceSourceSchema,
  })
  .strict();

export const researchFixtureSchema = z
  .object({
    schemaVersion: z.literal(OCR_RESEARCH_FIXTURE_SCHEMA_VERSION),
    fixtureId: z.string().regex(/^[a-z0-9][a-z0-9-]{4,80}$/),
    displayName: nonEmpty,
    mode: z.enum(["local-private", "committable"]),
    image: z
      .object({
        path: nonEmpty,
        ownership: z.enum(["fixture-original", "repository-reference"]),
        sha256: sha256Schema,
        byteSize: z.number().int().positive(),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        mimeType: z.enum(["image/png", "image/jpeg"]),
      })
      .strict(),
    provenance: z
      .object({
        sourceDescription: nonEmpty,
        sourceReference: nonEmpty,
        acquisitionMethod: nonEmpty,
        acquiredBy: nonEmpty,
        acquiredAt: nonEmpty.nullable(),
      })
      .strict(),
    redistribution: z
      .object({
        status: z.enum([
          "private-not-approved",
          "approved-for-repository",
          "existing-repository-governed",
        ]),
        license: nonEmpty,
        notes: nonEmpty,
      })
      .strict(),
    regions: z
      .object({
        brand: z.array(normalizedRegionSchema),
      })
      .strict(),
    truth: z
      .object({
        brand: brandTruthSchema.nullable(),
        warning: warningTruthSchema.nullable(),
        alcohol: alcoholTruthSchema.nullable(),
      })
      .strict(),
  })
  .strict()
  .superRefine((fixture, context) => {
    if (
      fixture.mode === "committable" &&
      fixture.redistribution.status === "private-not-approved"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "committable fixtures require repository redistribution approval",
      });
    }
    if (
      fixture.mode === "local-private" &&
      fixture.redistribution.status !== "private-not-approved"
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "local-private fixtures must remain private-not-approved",
      });
    }
  });

export type ResearchFixture = z.infer<typeof researchFixtureSchema>;

export const researchManifestSchema = z
  .object({
    schemaVersion: z.literal(OCR_RESEARCH_MANIFEST_SCHEMA_VERSION),
    description: nonEmpty,
    fixtures: z.array(researchFixtureSchema),
  })
  .strict()
  .superRefine((manifest, context) => {
    const ids = new Set<string>();
    const checksums = new Set<string>();
    for (const [index, fixture] of manifest.fixtures.entries()) {
      if (ids.has(fixture.fixtureId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fixtures", index, "fixtureId"],
          message: `duplicate fixture ID ${fixture.fixtureId}`,
        });
      }
      ids.add(fixture.fixtureId);
      if (checksums.has(fixture.image.sha256)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["fixtures", index, "image", "sha256"],
          message: `duplicate image checksum ${fixture.image.sha256}`,
        });
      }
      checksums.add(fixture.image.sha256);
    }
  });

export type ResearchManifest = z.infer<typeof researchManifestSchema>;

export interface FixtureImportOptions {
  sourcePath: string;
  mode: ResearchFixture["mode"];
  displayName: string;
  provenance: ResearchFixture["provenance"];
  redistribution: ResearchFixture["redistribution"];
  regions?: ResearchFixture["regions"];
  truth?: ResearchFixture["truth"];
  rootDir?: string;
  manifestPaths?: string[];
}

export interface FixtureImportResult {
  fixture: ResearchFixture;
  fixtureDirectory: string;
  manifestPath: string;
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function posixPath(value: string): string {
  return value.split(path.sep).join("/");
}

function recordedPath(filePath: string): string {
  const relative = path.relative(process.cwd(), filePath);
  return relative.startsWith("..") ? posixPath(filePath) : posixPath(relative);
}

function emptyManifest(): ResearchManifest {
  return {
    schemaVersion: OCR_RESEARCH_MANIFEST_SCHEMA_VERSION,
    description:
      "Governed OCR research fixtures. Truth is evaluation-only and never passed to OCR.",
    fixtures: [],
  };
}

export function parseResearchFixture(value: unknown): ResearchFixture {
  return researchFixtureSchema.parse(value);
}

export function parseResearchManifest(value: unknown): ResearchManifest {
  return researchManifestSchema.parse(value);
}

export function loadResearchManifest(manifestPath: string): ResearchManifest {
  if (!existsSync(manifestPath)) return emptyManifest();
  return parseResearchManifest(JSON.parse(readFileSync(manifestPath, "utf8")) as unknown);
}

function writeManifest(manifestPath: string, manifest: ResearchManifest): void {
  mkdirSync(path.dirname(manifestPath), { recursive: true });
  writeFileSync(manifestPath, `${JSON.stringify(parseResearchManifest(manifest), null, 2)}\n`);
}

export function composeResearchManifest(
  options: {
    committedPath?: string;
    privatePath?: string;
    includePrivate?: boolean;
  } = {},
): ResearchManifest {
  const committed = loadResearchManifest(
    options.committedPath ?? path.join(process.cwd(), COMMITTED_MANIFEST_PATH),
  );
  const privateManifest = options.includePrivate
    ? loadResearchManifest(options.privatePath ?? path.join(process.cwd(), PRIVATE_MANIFEST_PATH))
    : emptyManifest();
  return parseResearchManifest({
    schemaVersion: OCR_RESEARCH_MANIFEST_SCHEMA_VERSION,
    description: options.includePrivate
      ? "Combined committed and local-private OCR research fixtures."
      : "Committed OCR research fixtures only.",
    fixtures: [...committed.fixtures, ...privateManifest.fixtures].sort((left, right) =>
      left.fixtureId.localeCompare(right.fixtureId),
    ),
  });
}

function manifestPathsForImport(
  options: FixtureImportOptions,
  targetManifestPath: string,
): string[] {
  if (options.manifestPaths) return [...new Set([...options.manifestPaths, targetManifestPath])];
  if (options.rootDir) return [targetManifestPath];
  return [
    path.join(process.cwd(), COMMITTED_MANIFEST_PATH),
    path.join(process.cwd(), PRIVATE_MANIFEST_PATH),
  ];
}

export async function importResearchFixture(
  options: FixtureImportOptions,
): Promise<FixtureImportResult> {
  const sourcePath = path.resolve(options.sourcePath);
  if (!existsSync(sourcePath) || !statSync(sourcePath).isFile()) {
    throw new Error(`SOURCE_IMAGE_NOT_FOUND: ${sourcePath}`);
  }
  const bytes = readFileSync(sourcePath);
  const digest = sha256(bytes);
  const metadata = await sharp(bytes).metadata();
  if (
    !metadata.width ||
    !metadata.height ||
    !Number.isSafeInteger(metadata.width) ||
    !Number.isSafeInteger(metadata.height) ||
    metadata.width <= 0 ||
    metadata.height <= 0
  ) {
    throw new Error("INVALID_IMAGE_DIMENSIONS");
  }
  if (metadata.format !== "png" && metadata.format !== "jpeg") {
    throw new Error(`UNSUPPORTED_IMAGE_MIME: ${metadata.format ?? "unknown"}`);
  }

  const fixtureId = `label-${digest.slice(0, 16)}`;
  const rootDir = path.resolve(
    options.rootDir ??
      (options.mode === "committable" ? COMMITTED_FIXTURE_ROOT : PRIVATE_FIXTURE_ROOT),
  );
  const fixtureDirectory = path.join(rootDir, fixtureId);
  const extension = metadata.format === "jpeg" ? "jpeg" : "png";
  const destination = path.join(fixtureDirectory, `original.${extension}`);
  const manifestPath = path.join(rootDir, "manifest.json");
  const fixture: ResearchFixture = parseResearchFixture({
    schemaVersion: OCR_RESEARCH_FIXTURE_SCHEMA_VERSION,
    fixtureId,
    displayName: options.displayName,
    mode: options.mode,
    image: {
      path: recordedPath(destination),
      ownership: "fixture-original",
      sha256: digest,
      byteSize: bytes.length,
      width: metadata.width,
      height: metadata.height,
      mimeType: metadata.format === "jpeg" ? "image/jpeg" : "image/png",
    },
    provenance: options.provenance,
    redistribution: options.redistribution,
    regions: options.regions ?? { brand: [] },
    truth: options.truth ?? { brand: null, warning: null, alcohol: null },
  });

  for (const candidatePath of manifestPathsForImport(options, manifestPath)) {
    const candidate = loadResearchManifest(candidatePath);
    const duplicate = candidate.fixtures.find((entry) => entry.image.sha256 === digest);
    if (duplicate) {
      throw new Error(`DUPLICATE_CHECKSUM: ${duplicate.fixtureId}`);
    }
  }

  mkdirSync(fixtureDirectory, { recursive: true });
  copyFileSync(sourcePath, destination);
  const targetManifest = loadResearchManifest(manifestPath);
  writeManifest(manifestPath, {
    ...targetManifest,
    fixtures: [...targetManifest.fixtures, fixture].sort((left, right) =>
      left.fixtureId.localeCompare(right.fixtureId),
    ),
  });
  writeFileSync(
    path.join(fixtureDirectory, "metadata.json"),
    `${JSON.stringify(fixture, null, 2)}\n`,
  );
  return { fixture, fixtureDirectory, manifestPath };
}

interface ApprovedRegionRecord {
  caseId: string;
  fixtureBrand: string;
  imagePath: string;
  imageWidth: number;
  imageHeight: number;
  note: string;
  occurrences: Array<{
    label: string;
    region: { x: number; y: number; width: number; height: number };
  }>;
}

interface ApprovedRegionFile {
  approvedBy: string;
  approvedOn: string;
  approvedRegions: ApprovedRegionRecord[];
}

interface EvalManifestRecord {
  caseId: string;
  imagePath: string;
  expectedSha256: string;
  image: { mediaType: "image/png" | "image/jpeg"; width: number; height: number };
  annotation?: {
    brand?: { acceptablePresentations?: string[] };
  };
}

export function buildApprovedRegionResearchManifest(
  options: {
    approvedRegionsPath?: string;
    evalManifestPath?: string;
  } = {},
): ResearchManifest {
  const approvedPath =
    options.approvedRegionsPath ??
    path.join(process.cwd(), "artifacts/brand-region-coverage-diagnosis/approved-regions.json");
  const evalPath =
    options.evalManifestPath ?? path.join(process.cwd(), "src/fixtures/eval/eval-manifest.json");
  const approved = JSON.parse(readFileSync(approvedPath, "utf8")) as ApprovedRegionFile;
  const evalManifest = JSON.parse(readFileSync(evalPath, "utf8")) as {
    records: EvalManifestRecord[];
  };
  const evalByPath = new Map(evalManifest.records.map((entry) => [entry.imagePath, entry]));

  const fixtures = approved.approvedRegions.map((entry) => {
    const evaluation = evalByPath.get(entry.imagePath);
    if (!evaluation) throw new Error(`MISSING_EVAL_RECORD: ${entry.imagePath}`);
    const bytes = readFileSync(path.join(process.cwd(), entry.imagePath));
    if (sha256(bytes) !== evaluation.expectedSha256) {
      throw new Error(`CHECKSUM_MISMATCH: ${entry.imagePath}`);
    }
    const acceptableValues = [
      ...new Set([
        entry.fixtureBrand,
        ...(evaluation.annotation?.brand?.acceptablePresentations ?? []),
      ]),
    ];
    return parseResearchFixture({
      schemaVersion: OCR_RESEARCH_FIXTURE_SCHEMA_VERSION,
      fixtureId: entry.caseId,
      displayName: `${entry.fixtureBrand} approved Brand region`,
      mode: "committable",
      image: {
        path: entry.imagePath,
        ownership: "repository-reference",
        sha256: evaluation.expectedSha256,
        byteSize: bytes.length,
        width: entry.imageWidth,
        height: entry.imageHeight,
        mimeType: evaluation.image.mediaType,
      },
      provenance: {
        sourceDescription:
          "Existing governed approved-wine repository fixture with a reader-approved Brand region.",
        sourceReference: "artifacts/brand-region-coverage-diagnosis/approved-regions.json",
        acquisitionMethod: "migration from the governed approved-wine evaluation corpus",
        acquiredBy: approved.approvedBy,
        acquiredAt: approved.approvedOn,
      },
      redistribution: {
        status: "existing-repository-governed",
        license: "unknown-existing-repository-fixture",
        notes:
          "Already committed under the author-attested corpus policy; this manifest makes no new license claim.",
      },
      regions: {
        brand: entry.occurrences.map((occurrence) => ({
          unit: "normalized-panel-relative",
          provenance: "human-approved-region",
          x: occurrence.region.x / entry.imageWidth,
          y: occurrence.region.y / entry.imageHeight,
          width: occurrence.region.width / entry.imageWidth,
          height: occurrence.region.height / entry.imageHeight,
          label: occurrence.label,
        })),
      },
      truth: {
        brand: {
          acceptableValues,
          evidenceSource: {
            kind: "human-approved-region",
            description: entry.note,
            reference: "artifacts/brand-region-coverage-diagnosis/approved-regions.json",
            wholeLabelReviewed: false,
          },
        },
        warning: null,
        alcohol: null,
      },
    });
  });

  return parseResearchManifest({
    schemaVersion: OCR_RESEARCH_MANIFEST_SCHEMA_VERSION,
    description:
      "Ten governed real-label Brand failures with reader-approved regions. Evaluation truth is isolated from OCR inputs.",
    fixtures,
  });
}

export function writeApprovedRegionResearchManifest(
  manifestPath = path.join(process.cwd(), COMMITTED_MANIFEST_PATH),
): ResearchManifest {
  const manifest = buildApprovedRegionResearchManifest();
  writeManifest(manifestPath, manifest);
  return manifest;
}
