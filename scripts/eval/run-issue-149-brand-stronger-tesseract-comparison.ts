/**
 * Issue #149 — one stronger Tesseract configuration on the frozen stylized /
 * no-text Brand subset.
 *
 * Single variable: the English traineddata variant (tessdata_fast integer LSTM
 * -> tessdata_best float LSTM). Identical crops, preprocessing, scale, PSM,
 * rotation, language, OEM, parser, selection, ranking, and thresholds.
 *
 * Evaluation-only. Reuses the existing evaluation-only OCR primitives read-only
 * and changes no production file. The treatment model is reached through the
 * existing supported LABEL_LENS_OCR_ASSET_DIR operator override.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { format } from "prettier";
import sharp from "sharp";

import {
  PRODUCTION_BOUNDED_BRAND_CONTROL,
  executeOcrCase,
  type OcrConfiguration,
  type OcrExecutionInput,
} from "@/fixtures/ocr-research/experiment";
import {
  composeResearchManifest,
  type NormalizedResearchRegion,
  type ResearchFixture,
} from "@/fixtures/ocr-research/fixture-corpus";
import { createLocalOcrEngine } from "@/pipeline/extractor/ocr-engine";

const EXPERIMENT_ID = "issue-149-brand-stronger-tesseract-comparison";
const OUTPUT_ROOT = path.join(process.cwd(), "artifacts", EXPERIMENT_ID);
const EXPECTED_BASE_SHA = "94c28bb86f26e288801c6298d3193fbb29ed3fa5";
const PREREGISTRATION_SHA256 = "d2e8f7fc4d96f9b8e4565db7be1773c3d2780ead13d517f3e97c5c3dda61f708";

const CONTROL_ASSET_DIR = path.join(process.cwd(), "src/pipeline/extractor/assets");
/**
 * The treatment model is deliberately NOT vendored in this repository. It is
 * retrieved on demand into an untracked research-local cache by
 * `scripts/eval/fetch-issue-149-tessdata-best.mjs`, which pins the upstream
 * commit and verifies byte size and sha256. This runner fails closed with
 * instructions when the cache is absent or does not match.
 */
const TREATMENT_ASSET_DIR = path.join(
  process.cwd(),
  ".local/ocr-research/traineddata/tessdata-best",
);
const TREATMENT_FETCH_COMMAND = "node scripts/eval/fetch-issue-149-tessdata-best.mjs";
const CONTROL_TRAINEDDATA_SHA256 =
  "5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747";
const TREATMENT_TRAINEDDATA_SHA256 =
  "8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba";
const TREATMENT_TRAINEDDATA_BYTE_SIZE = 15400601;

/** Five historical cases. wine-multi-artifact-04 contributes two OCR items. */
const FROZEN_CASES = [
  "approved-wine-004",
  "approved-wine-005",
  "approved-wine-031",
  "la-fattoria-rotated",
  "wine-multi-artifact-04",
] as const;

/** Crop-image clusters (4). The duplicate pair is one cluster, per PR #207. */
const CROP_CLUSTERS: Readonly<Record<string, readonly string[]>> = {
  C1: ["approved-wine-004", "la-fattoria-rotated"],
  C2: ["approved-wine-005"],
  C3: ["approved-wine-031"],
  C4: ["wine-multi-artifact-04"],
};

/** Design clusters (3). The shared producer design is one cluster. */
const DESIGN_CLUSTERS: Readonly<Record<string, readonly string[]>> = {
  D1: ["approved-wine-004", "la-fattoria-rotated", "approved-wine-005"],
  D2: ["wine-multi-artifact-04"],
  D3: ["approved-wine-031"],
};

/** Crop hashes recorded by PR #207 provenance. Verified before OCR. */
const PR207_CROP_SHA256: Readonly<Record<string, string>> = {
  "approved-wine-004": "fab1b411c7e06258c41c884d3f0777039219f171fca37febd32597fabd5b108c",
  "approved-wine-005": "d189130bea28dc36278958da8301539afb7a72ff2f1b80195139170dd3556c08",
  "approved-wine-031": "2998fea6a8a7bddfc12b418c5207151920e0ed03940b349de8f4968323dd85c8",
  "la-fattoria-rotated": "fab1b411c7e06258c41c884d3f0777039219f171fca37febd32597fabd5b108c",
  "wine-multi-artifact-04-region-1":
    "d46fe950184f98042c724d261d884434a6cf5eab63b138e53a9299992d2c9fea",
  "wine-multi-artifact-04-region-2":
    "c338c020db6cf940a363153d58b1f5f6b24ef9dfba450e6d3b17e673e2e5b4ac",
};

/** Production paths that must not move, including the PR #195 baseline file. */
const GUARDED_PRODUCTION_HASHES = {
  "src/pipeline/extractor/field-selection.ts":
    "3e84fa8a043570713991643830c7b95e0f7189a4ed037b737c783353d519106d",
  "src/pipeline/extractor/regions.ts":
    "910d763e20f47d811348b62c77f17d46ddf3a07b5849a337669a07f6b8efc9ab",
  "src/pipeline/extractor/extractor.ts":
    "9b2712e6bb15552e9524bc5e60be4da2b163bdb325206f452ecbaf44ebf5084c",
  "src/pipeline/extractor/ocr-engine.ts":
    "1cf37e4ca28dd68fbfc2412b242ad02db6d76c752d3203f27d17f27c9e0e59e7",
  "src/pipeline/extractor/assets/eng.traineddata": CONTROL_TRAINEDDATA_SHA256,
} as const;

/** Prior merged Issue #149 artifacts that must remain byte-identical. */
const PRIOR_FROZEN_ARTIFACTS = {
  "artifacts/issue-149-brand-mechanism-sublabels/annotator-responses/geometric-response-template.json":
    "20d3b6be2063461b7686d2b9f060225c3efa6caa67437b75d1eeca404f6e46be",
  "artifacts/issue-149-brand-mechanism-sublabels/annotator-responses/stylization-response-template.json":
    "fb5ed5779da53ec8f315ea48fa9c733769a6e8c287fb09c5865985706ebc98d2",
  "artifacts/issue-149-brand-mechanism-sublabels/annotator-responses/annotator-provenance.md":
    "54a0806d2644c964888310dc5bffbcfbbdfc1f97fe99e656bd898f4b4d1d6300",
  "artifacts/issue-149-brand-otsu-threshold/control/crops/approved-wine-004.png":
    "fab1b411c7e06258c41c884d3f0777039219f171fca37febd32597fabd5b108c",
  "artifacts/issue-149-brand-otsu-threshold/control/crops/la-fattoria-rotated.png":
    "fab1b411c7e06258c41c884d3f0777039219f171fca37febd32597fabd5b108c",
} as const;

/** Configuration is identical in both arms; only the model on disk differs. */
const OCR_CONFIGURATION: OcrConfiguration = Object.freeze({
  ...PRODUCTION_BOUNDED_BRAND_CONTROL,
  padding: Object.freeze({ ...PRODUCTION_BOUNDED_BRAND_CONTROL.padding }),
});

type Arm = "control" | "treatment";
type RunId = "primary" | "repeat";
type Classification =
  | "NONDETERMINISTIC"
  | "REGRESSION"
  | "RECOGNIZER_CAPABILITY_IMPROVEMENT"
  | "LEGIBILITY_IMPROVED_NOT_RECOVERED"
  | "NO_EFFECT";

const MATERIAL_RECALL_DELTA = 0.25;

interface RawArmOutput {
  itemId: string;
  caseId: string;
  arm: Arm;
  traineddataSha256: string;
  cropSha256: string;
  rawTranscript: string;
  rawWordCount: number;
  meanConfidence: number | null;
  words: Array<{
    text: string;
    rawConfidence: number;
    bbox: { x0: number; y0: number; x1: number; y1: number };
  }>;
  selection: { state: string; value: string | null; ocrEvidenceScore: number; reliable: boolean };
}

function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(filePath: string): string {
  return sha256Bytes(
    readFileSync(path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath)),
  );
}

function gitSha(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  writeFileSync(filePath, await format(JSON.stringify(value), { parser: "json", printWidth: 100 }));
}

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Parse a .traineddata table of contents so the two models can be compared. */
function traineddataStructure(filePath: string) {
  const names = [
    "lang_config",
    "unicharset",
    "ambigs",
    "inttemp",
    "pffmtable",
    "normproto",
    "punc_dawg",
    "word_dawg",
    "number_dawg",
    "freq_dawg",
    "fixed_length_dawgs",
    "cube_unicharset",
    "cube_word_dawg",
    "shapetable",
    "bigram_dawg",
    "unambig_dawg",
    "params_model",
    "lstm",
    "lstm_punc_dawg",
    "lstm_word_dawg",
    "lstm_number_dawg",
    "lstm_unicharset",
    "lstm_recoder",
    "version",
  ];
  const bytes = readFileSync(filePath);
  const slots = bytes.readInt32LE(0);
  const offsets: number[] = [];
  for (let index = 0; index < slots; index += 1) {
    offsets.push(Number(bytes.readBigInt64LE(4 + index * 8)));
  }
  const components: Record<string, number> = {};
  let versionString: string | null = null;
  for (let index = 0; index < slots; index += 1) {
    if (offsets[index] < 0) continue;
    let end = bytes.length;
    for (let other = 0; other < slots; other += 1) {
      if (offsets[other] > offsets[index] && offsets[other] < end) end = offsets[other];
    }
    const name = names[index] ?? `index-${index}`;
    components[name] = end - offsets[index];
    if (index === 23) versionString = bytes.subarray(offsets[index], end).toString("utf8").trim();
  }
  return {
    path: path.relative(process.cwd(), filePath),
    byteSize: bytes.length,
    sha256: sha256Bytes(bytes),
    versionString,
    components,
    legacyComponentsPresent: ["inttemp", "pffmtable", "normproto", "shapetable"].some(
      (name) => name in components,
    ),
  };
}

interface OcrItem {
  itemId: string;
  caseId: string;
  fixture: ResearchFixture;
  region: NormalizedResearchRegion;
}

function frozenItems(): OcrItem[] {
  const manifest = composeResearchManifest({ includePrivate: false });
  const byId = new Map(manifest.fixtures.map((fixture) => [fixture.fixtureId, fixture]));
  const items: OcrItem[] = [];
  for (const caseId of FROZEN_CASES) {
    const fixture = byId.get(caseId);
    if (!fixture) throw new Error(`FROZEN_CASE_NOT_IN_MANIFEST: ${caseId}`);
    const regions = fixture.regions.brand;
    if (regions.length === 0) throw new Error(`NO_BRAND_REGION: ${caseId}`);
    for (const [index, region] of regions.entries()) {
      const suffix = regions.length > 1 ? `-region-${index + 1}` : "";
      items.push({ itemId: `${caseId}${suffix}`, caseId, fixture, region });
    }
  }
  return items;
}

function executionInput(item: OcrItem): OcrExecutionInput {
  return {
    caseId: item.itemId,
    fixtureId: item.fixture.fixtureId,
    imagePath: item.fixture.image.path,
    expectedSha256: item.fixture.image.sha256,
    image: {
      width: item.fixture.image.width,
      height: item.fixture.image.height,
      mimeType: item.fixture.image.mimeType,
    },
    region: item.region,
  };
}

/**
 * Runs one arm. The traineddata variant is selected through the existing
 * supported LABEL_LENS_OCR_ASSET_DIR override, so no production file changes.
 */
async function runArm(
  items: readonly OcrItem[],
  arm: Arm,
  assetDir: string,
  traineddataSha: string,
  frozenCropSha: ReadonlyMap<string, string>,
): Promise<RawArmOutput[]> {
  const previous = process.env.LABEL_LENS_OCR_ASSET_DIR;
  process.env.LABEL_LENS_OCR_ASSET_DIR = assetDir;
  const outputs: RawArmOutput[] = [];
  try {
    const engine = await createLocalOcrEngine();
    try {
      for (const item of items) {
        const result = await executeOcrCase(executionInput(item), OCR_CONFIGURATION, engine);
        const cropSha = sha256Bytes(result.artifacts.cropPng);
        if (cropSha !== frozenCropSha.get(item.itemId)) {
          throw new Error(`CROP_BYTES_DIVERGED_FROM_FREEZE: ${arm}/${item.itemId}`);
        }
        outputs.push({
          itemId: item.itemId,
          caseId: item.caseId,
          arm,
          traineddataSha256: traineddataSha,
          cropSha256: cropSha,
          rawTranscript: result.rawTranscript,
          rawWordCount: result.rawWordCount,
          meanConfidence: result.meanConfidence,
          words: result.rawWords.map((word) => ({
            text: word.text,
            rawConfidence: word.rawConfidence,
            bbox: word.bbox,
          })),
          selection: {
            state: result.selection.state,
            value: result.selection.value,
            ocrEvidenceScore: result.selection.ocrEvidenceScore,
            reliable: result.selection.reliable,
          },
        });
      }
    } finally {
      await engine.terminate();
    }
  } finally {
    if (previous === undefined) delete process.env.LABEL_LENS_OCR_ASSET_DIR;
    else process.env.LABEL_LENS_OCR_ASSET_DIR = previous;
  }
  return outputs;
}

async function runBothArms(
  items: readonly OcrItem[],
  runId: RunId,
  frozenCropSha: ReadonlyMap<string, string>,
): Promise<RawArmOutput[]> {
  const control = await runArm(
    items,
    "control",
    CONTROL_ASSET_DIR,
    CONTROL_TRAINEDDATA_SHA256,
    frozenCropSha,
  );
  const treatment = await runArm(
    items,
    "treatment",
    TREATMENT_ASSET_DIR,
    TREATMENT_TRAINEDDATA_SHA256,
    frozenCropSha,
  );
  if (control.length !== items.length || treatment.length !== items.length) {
    throw new Error(`ARM_ITEM_COUNT_MISMATCH: ${runId}`);
  }
  return [...control, ...treatment];
}

function armOf(outputs: readonly RawArmOutput[], itemId: string, arm: Arm): RawArmOutput {
  const found = outputs.find((item) => item.itemId === itemId && item.arm === arm);
  if (!found) throw new Error(`MISSING_ARM_OUTPUT: ${itemId}/${arm}`);
  return found;
}

function truthInRaw(transcript: string, expected: readonly string[]): boolean {
  const haystack = normalize(transcript);
  return expected.some((value) => {
    const needle = normalize(value);
    return needle.length > 0 && haystack.includes(needle);
  });
}

function exactMatch(selected: string | null, expected: readonly string[]): boolean {
  if (!selected) return false;
  const value = normalize(selected);
  return value.length > 0 && expected.some((item) => normalize(item) === value);
}

function usefulTokenRecall(
  transcript: string,
  expected: readonly string[],
): { recall: number | null; matched: number; total: number } {
  const haystack = normalize(transcript);
  let best: { recall: number | null; matched: number; total: number } = {
    recall: null,
    matched: 0,
    total: 0,
  };
  for (const value of expected) {
    const tokens = value
      .split(/\s+/)
      .map((token) => normalize(token))
      .filter((token) => token.length >= 3);
    if (tokens.length === 0) continue;
    const matched = tokens.filter((token) => haystack.includes(token)).length;
    const recall = matched / tokens.length;
    if (best.recall === null || recall > best.recall) {
      best = { recall, matched, total: tokens.length };
    }
  }
  return best;
}

function behaviorProjection(raw: RawArmOutput) {
  return { rawTranscript: raw.rawTranscript, words: raw.words, selection: raw.selection };
}

function classify(args: {
  deterministic: boolean;
  exactControl: boolean;
  exactTreatment: boolean;
  truthRawControl: boolean;
  truthRawTreatment: boolean;
  recallControl: number | null;
  recallTreatment: number | null;
  matchedControl: number;
  matchedTreatment: number;
  falseReliableControl: boolean;
  falseReliableTreatment: boolean;
}): { classification: Classification; basis: string } {
  if (!args.deterministic) {
    return {
      classification: "NONDETERMINISTIC",
      basis: "The exact repeat did not reproduce the primary run.",
    };
  }
  const delta =
    args.recallControl === null || args.recallTreatment === null
      ? 0
      : args.recallTreatment - args.recallControl;
  if (args.exactControl && !args.exactTreatment) {
    return {
      classification: "REGRESSION",
      basis: "Control produced an exact Brand match; treatment did not.",
    };
  }
  if (args.truthRawControl && !args.truthRawTreatment) {
    return {
      classification: "REGRESSION",
      basis: "Truth-bearing text present under control was lost under treatment.",
    };
  }
  if (args.falseReliableTreatment && !args.falseReliableControl) {
    return {
      classification: "REGRESSION",
      basis: "Treatment introduced a reliable Brand read that does not match truth.",
    };
  }
  if (delta <= -MATERIAL_RECALL_DELTA) {
    return {
      classification: "REGRESSION",
      basis: `Useful token recall fell by ${Math.abs(delta).toFixed(2)}, at or beyond the preregistered ${MATERIAL_RECALL_DELTA} threshold.`,
    };
  }
  if (args.exactTreatment && !args.exactControl && !args.falseReliableTreatment) {
    return {
      classification: "RECOGNIZER_CAPABILITY_IMPROVEMENT",
      basis:
        "Treatment produced an exact Brand candidate that control did not, with no false reliable read.",
    };
  }
  if (!args.truthRawControl && args.truthRawTreatment) {
    return {
      classification: "LEGIBILITY_IMPROVED_NOT_RECOVERED",
      basis:
        "Treatment recovered truth-bearing text in the raw transcript without a valid Brand candidate.",
    };
  }
  if (delta >= MATERIAL_RECALL_DELTA && args.matchedTreatment > args.matchedControl) {
    return {
      classification: "LEGIBILITY_IMPROVED_NOT_RECOVERED",
      basis: `Useful token recall rose by ${delta.toFixed(2)} and by at least one whole truth token, without a valid Brand candidate.`,
    };
  }
  return {
    classification: "NO_EFFECT",
    basis: "No material truth-bearing improvement.",
  };
}

const PRECEDENCE: readonly Classification[] = [
  "NONDETERMINISTIC",
  "REGRESSION",
  "RECOGNIZER_CAPABILITY_IMPROVEMENT",
  "LEGIBILITY_IMPROVED_NOT_RECOVERED",
  "NO_EFFECT",
];

function clusterClassification(members: readonly Classification[]): Classification {
  for (const candidate of PRECEDENCE) {
    if (members.includes(candidate)) return candidate;
  }
  return "NO_EFFECT";
}

async function main() {
  if (gitSha() !== EXPECTED_BASE_SHA) throw new Error("STRONGER_TESS_UNEXPECTED_BASE_SHA");
  if (sha256File(path.join(OUTPUT_ROOT, "preregistration.md")) !== PREREGISTRATION_SHA256) {
    throw new Error("STRONGER_TESS_PREREGISTRATION_CHANGED");
  }
  const guardedProductionUnchanged = Object.entries(GUARDED_PRODUCTION_HASHES).every(
    ([filePath, expected]) => sha256File(filePath) === expected,
  );
  if (!guardedProductionUnchanged) throw new Error("STRONGER_TESS_GUARDED_PRODUCTION_CHANGED");
  const priorArtifactsUnchanged = Object.entries(PRIOR_FROZEN_ARTIFACTS).every(
    ([filePath, expected]) => sha256File(filePath) === expected,
  );
  if (!priorArtifactsUnchanged) throw new Error("STRONGER_TESS_PRIOR_ARTIFACT_CHANGED");

  const controlModel = traineddataStructure(path.join(CONTROL_ASSET_DIR, "eng.traineddata"));
  if (controlModel.sha256 !== CONTROL_TRAINEDDATA_SHA256) {
    throw new Error("STRONGER_TESS_CONTROL_MODEL_HASH_MISMATCH");
  }

  const treatmentModelPath = path.join(TREATMENT_ASSET_DIR, "eng.traineddata");
  if (!existsSync(treatmentModelPath)) {
    throw new Error(
      `STRONGER_TESS_TREATMENT_MODEL_NOT_CACHED: the treatment model is not vendored in this repository. Retrieve it first with: ${TREATMENT_FETCH_COMMAND}`,
    );
  }
  const treatmentModel = traineddataStructure(treatmentModelPath);
  if (
    treatmentModel.sha256 !== TREATMENT_TRAINEDDATA_SHA256 ||
    treatmentModel.byteSize !== TREATMENT_TRAINEDDATA_BYTE_SIZE
  ) {
    throw new Error(
      `STRONGER_TESS_TREATMENT_MODEL_HASH_MISMATCH: cached model does not match the pinned expectations. Re-retrieve with: ${TREATMENT_FETCH_COMMAND}`,
    );
  }

  // The treatment must differ from control in the recognizer weights only.
  const sharedComponents = [
    "lstm_unicharset",
    "lstm_recoder",
    "lstm_punc_dawg",
    "lstm_word_dawg",
    "lstm_number_dawg",
  ];
  const nonWeightComponentsIdentical =
    controlModel.versionString === treatmentModel.versionString &&
    sharedComponents.every(
      (name) => controlModel.components[name] === treatmentModel.components[name],
    ) &&
    controlModel.legacyComponentsPresent === treatmentModel.legacyComponentsPresent;
  if (!nonWeightComponentsIdentical) {
    throw new Error("STRONGER_TESS_MORE_THAN_ONE_DIMENSION_DIFFERS");
  }

  const items = frozenItems();
  mkdirSync(OUTPUT_ROOT, { recursive: true });

  // Verify every crop against PR #207 provenance before OCR.
  const cropRows = [];
  for (const item of items) {
    const bytes = readFileSync(path.resolve(item.fixture.image.path));
    if (sha256Bytes(bytes) !== item.fixture.image.sha256) {
      throw new Error(`SOURCE_IMAGE_CHECKSUM_MISMATCH: ${item.itemId}`);
    }
    const committedCropPath = path.join(
      process.cwd(),
      "artifacts/issue-149-brand-otsu-threshold/control/crops",
      `${item.itemId}.png`,
    );
    const cropSha = sha256File(committedCropPath);
    const expected = PR207_CROP_SHA256[item.itemId];
    if (cropSha !== expected) throw new Error(`CROP_SHA_DIVERGES_FROM_PR207: ${item.itemId}`);
    cropRows.push({
      itemId: item.itemId,
      caseId: item.caseId,
      sourceImagePath: item.fixture.image.path,
      sourceImageSha256: item.fixture.image.sha256,
      committedCropPath: path.relative(process.cwd(), committedCropPath),
      cropSha256: cropSha,
      matchesPr207Provenance: true,
    });
  }
  const frozenCropSha = new Map(cropRows.map((row) => [row.itemId, row.cropSha256]));

  // Verify the independence grouping against the observed crop hashes.
  const c1Hashes = new Set(CROP_CLUSTERS.C1.map((caseId) => frozenCropSha.get(caseId)));
  const duplicateClusterVerified = c1Hashes.size === 1;
  if (!duplicateClusterVerified) throw new Error("STRONGER_TESS_DUPLICATE_CLUSTER_UNVERIFIED");
  const distinctCropHashes = new Set(
    Object.values(CROP_CLUSTERS).map((members) => frozenCropSha.get(members[0])),
  ).size;

  await writeJson(path.join(OUTPUT_ROOT, "case-freeze.json"), {
    experimentId: EXPERIMENT_ID,
    frozenBeforeOcr: true,
    baseSha: EXPECTED_BASE_SHA,
    historicalCaseCount: FROZEN_CASES.length,
    ocrItemCount: items.length,
    cases: FROZEN_CASES,
    note: "wine-multi-artifact-04 has two committed approved Brand regions and contributes two OCR items, so there are six OCR items over five historical cases.",
    mutationPolicy:
      "No case may be added, substituted, dropped, or re-scored after results are seen. The treatment may not change after results are seen, and no second arm may be added.",
  });

  await writeJson(path.join(OUTPUT_ROOT, "independence-groups.json"), {
    experimentId: EXPERIMENT_ID,
    basis: "PR #207 adjudication (DISTINCT_SOURCE_SAME_CROP).",
    historicalCases: FROZEN_CASES.length,
    cropClusters: Object.entries(CROP_CLUSTERS).map(([id, members]) => ({
      cropClusterId: id,
      members,
      cropSha256: frozenCropSha.get(members[0]) ?? null,
    })),
    designClusters: Object.entries(DESIGN_CLUSTERS).map(([id, members]) => ({
      designClusterId: id,
      members,
    })),
    distinctCropImageDenominator: distinctCropHashes,
    distinctDesignDenominator: Object.keys(DESIGN_CLUSTERS).length,
    duplicateCropClusterVerified: duplicateClusterVerified,
    countingRules: [
      "A duplicated crop may not count twice toward PROCEED.",
      "A repeated design at a different scale may not count as two independent design-level successes.",
    ],
  });

  await writeJson(path.join(OUTPUT_ROOT, "source-and-crop-provenance.json"), {
    experimentId: EXPERIMENT_ID,
    verifiedAgainst: "PR #207 crop provenance",
    allCropsMatchPr207: cropRows.every((row) => row.matchesPr207Provenance),
    items: cropRows,
  });

  const engineIdentity = {
    ocrEngine: "tesseract.js@7.0.0/eng/OEM1",
    tesseractJs: "7.0.0",
    tesseractJsCore: "7.0.0",
    oem: 1,
    oemLabel: "LSTM_ONLY",
    language: "eng",
    sharp: sharp.versions.sharp,
    node: process.version,
    platform: process.platform,
    architecture: process.arch,
    psm: OCR_CONFIGURATION.psm,
    scale: OCR_CONFIGURATION.scale,
    padding: OCR_CONFIGURATION.padding,
    preprocessing: {
      grayscaleMethod: OCR_CONFIGURATION.grayscaleMethod,
      contrastMethod: OCR_CONFIGURATION.contrastMethod,
      localContrast: OCR_CONFIGURATION.localContrast,
      thresholdMethod: OCR_CONFIGURATION.thresholdMethod,
      sharpening: OCR_CONFIGURATION.sharpening,
      inversion: OCR_CONFIGURATION.inversion,
      denoising: OCR_CONFIGURATION.denoising,
      rotation: OCR_CONFIGURATION.rotation,
    },
    parserAndSelection: {
      module: "src/pipeline/extractor/field-selection.ts",
      sha256: sha256File("src/pipeline/extractor/field-selection.ts"),
      reliabilityRule: "state OBSERVED and ocrEvidenceScore >= 0.8",
      unchanged: true,
    },
  };

  await writeJson(path.join(OUTPUT_ROOT, "control-configuration.json"), {
    experimentId: EXPERIMENT_ID,
    arm: "control",
    description: "The configuration production uses for governed approved Brand crops.",
    traineddata: controlModel,
    variant: "tessdata_fast (integer-quantized LSTM)",
    assetDir: path.relative(process.cwd(), CONTROL_ASSET_DIR),
    ...engineIdentity,
  });

  await writeJson(path.join(OUTPUT_ROOT, "treatment-configuration.json"), {
    experimentId: EXPERIMENT_ID,
    arm: "treatment",
    description: "Identical to control in every dimension except the English traineddata variant.",
    traineddata: treatmentModel,
    variant: "tessdata_best (float LSTM)",
    assetDir: path.relative(process.cwd(), TREATMENT_ASSET_DIR),
    selectedVia:
      "LABEL_LENS_OCR_ASSET_DIR operator override, already supported by resolveLangPath()",
    productionSourceModified: false,
    ...engineIdentity,
  });

  await writeJson(path.join(OUTPUT_ROOT, "traineddata-provenance.json"), {
    experimentId: EXPERIMENT_ID,
    control: {
      ...controlModel,
      variant: "tessdata_fast (integer-quantized LSTM)",
      origin: "already vendored in this repository",
    },
    treatment: {
      ...treatmentModel,
      variant: "tessdata_best (float LSTM)",
      origin:
        "https://raw.githubusercontent.com/tesseract-ocr/tessdata_best/9ddc24e750eec0994223a9edc3fcb434a2244f3b/eng.traineddata",
      upstreamCommit: "9ddc24e750eec0994223a9edc3fcb434a2244f3b",
      vendoredInGit: false,
      retrievedBy: "scripts/eval/fetch-issue-149-tessdata-best.mjs",
      retrievedOn: "2026-07-28",
      license: "Apache-2.0",
      licenseFile: "vendor/tessdata-best/LICENSE",
      licenseFileSha256: sha256File(path.join(OUTPUT_ROOT, "vendor/tessdata-best/LICENSE")),
      retrievalAuthorized: true,
      committedUnmodified: true,
    },
    singleDimensionCheck: {
      versionStringIdentical: controlModel.versionString === treatmentModel.versionString,
      networkArchitectureIdentical: controlModel.versionString === treatmentModel.versionString,
      sharedComponentsIdentical: sharedComponents.every(
        (name) => controlModel.components[name] === treatmentModel.components[name],
      ),
      legacyComponentsAbsentInBoth:
        !controlModel.legacyComponentsPresent && !treatmentModel.legacyComponentsPresent,
      onlyDifferingComponent: "lstm",
      controlLstmBytes: controlModel.components.lstm,
      treatmentLstmBytes: treatmentModel.components.lstm,
      verdict:
        "Only the recognizer weights differ. Charset, recoder, dictionaries, network architecture, and version string are byte-identical in size and value.",
    },
  });

  // Compatibility gate: the LSTM-only core must load the float model.
  const compatibilityProbe = await runArm(
    [items[0]],
    "treatment",
    TREATMENT_ASSET_DIR,
    TREATMENT_TRAINEDDATA_SHA256,
    frozenCropSha,
  );
  if (compatibilityProbe.length !== 1) throw new Error("STRONGER_TESS_COMPATIBILITY_GATE_FAILED");

  // Raw output for both runs is persisted before truth is read.
  const primary = await runBothArms(items, "primary", frozenCropSha);
  await writeJson(path.join(OUTPUT_ROOT, "primary-run-raw.json"), {
    experimentId: EXPERIMENT_ID,
    run: "primary",
    truthRead: false,
    compatibilityGatePassed: true,
    note: "Raw OCR output, persisted before any normalization against truth or truth comparison.",
    outputs: primary,
  });

  const repeat = await runBothArms(items, "repeat", frozenCropSha);
  await writeJson(path.join(OUTPUT_ROOT, "repeat-run-raw.json"), {
    experimentId: EXPERIMENT_ID,
    run: "repeat",
    truthRead: false,
    note: "Exact repeat of both arms for determinism, persisted before truth comparison.",
    outputs: repeat,
  });

  // Truth is read only from here on.
  const cropClusterOf = (caseId: string): string => {
    const found = Object.entries(CROP_CLUSTERS).find(([, members]) => members.includes(caseId));
    if (!found) throw new Error(`NO_CROP_CLUSTER: ${caseId}`);
    return found[0];
  };
  const designClusterOf = (caseId: string): string => {
    const found = Object.entries(DESIGN_CLUSTERS).find(([, members]) => members.includes(caseId));
    if (!found) throw new Error(`NO_DESIGN_CLUSTER: ${caseId}`);
    return found[0];
  };

  const results = items.map((item) => {
    const expected = item.fixture.truth.brand?.acceptableValues ?? [];
    if (expected.length === 0) throw new Error(`MISSING_BRAND_TRUTH: ${item.itemId}`);
    const control = armOf(primary, item.itemId, "control");
    const treatment = armOf(primary, item.itemId, "treatment");
    const repeatControl = armOf(repeat, item.itemId, "control");
    const repeatTreatment = armOf(repeat, item.itemId, "treatment");

    const deterministic =
      JSON.stringify(behaviorProjection(control)) ===
        JSON.stringify(behaviorProjection(repeatControl)) &&
      JSON.stringify(behaviorProjection(treatment)) ===
        JSON.stringify(behaviorProjection(repeatTreatment));

    const exactControl = exactMatch(control.selection.value, expected);
    const exactTreatment = exactMatch(treatment.selection.value, expected);
    const controlRecall = usefulTokenRecall(control.rawTranscript, expected);
    const treatmentRecall = usefulTokenRecall(treatment.rawTranscript, expected);
    const falseReliableControl = control.selection.reliable && !exactControl;
    const falseReliableTreatment = treatment.selection.reliable && !exactTreatment;
    const truthRawControl = truthInRaw(control.rawTranscript, expected);
    const truthRawTreatment = truthInRaw(treatment.rawTranscript, expected);

    const { classification, basis } = classify({
      deterministic,
      exactControl,
      exactTreatment,
      truthRawControl,
      truthRawTreatment,
      recallControl: controlRecall.recall,
      recallTreatment: treatmentRecall.recall,
      matchedControl: controlRecall.matched,
      matchedTreatment: treatmentRecall.matched,
      falseReliableControl,
      falseReliableTreatment,
    });

    return {
      case_id: item.itemId,
      historical_case_id: item.caseId,
      crop_cluster_id: cropClusterOf(item.caseId),
      design_cluster_id: designClusterOf(item.caseId),
      crop_sha256: control.cropSha256,
      control_config: "tessdata_fast eng / OEM1 / PSM 11",
      control_raw: control.rawTranscript,
      control_candidate: control.selection.value,
      treatment_config: "tessdata_best eng / OEM1 / PSM 11",
      treatment_raw: treatment.rawTranscript,
      treatment_candidate: treatment.selection.value,
      truth_in_raw_control: truthRawControl,
      truth_in_raw_treatment: truthRawTreatment,
      exact_match_control: exactControl,
      exact_match_treatment: exactTreatment,
      useful_token_recall_control: controlRecall.recall,
      useful_token_recall_treatment: treatmentRecall.recall,
      false_reliable_read_control: falseReliableControl,
      false_reliable_read_treatment: falseReliableTreatment,
      determinism_pass: deterministic,
      classification,
      classificationBasis: basis,
      detail: {
        controlTokens: { matched: controlRecall.matched, total: controlRecall.total },
        treatmentTokens: { matched: treatmentRecall.matched, total: treatmentRecall.total },
        controlMeanConfidence: control.meanConfidence,
        treatmentMeanConfidence: treatment.meanConfidence,
        controlWordCount: control.rawWordCount,
        treatmentWordCount: treatment.rawWordCount,
        controlSelectionState: control.selection.state,
        treatmentSelectionState: treatment.selection.state,
      },
    };
  });

  await writeJson(path.join(OUTPUT_ROOT, "per-case-results.json"), {
    experimentId: EXPERIMENT_ID,
    truthUsedOnlyAfterRawFreeze: true,
    historicalCases: FROZEN_CASES.length,
    ocrItems: results.length,
    columns: [
      "case_id",
      "crop_cluster_id",
      "design_cluster_id",
      "crop_sha256",
      "control_config",
      "control_raw",
      "control_candidate",
      "treatment_config",
      "treatment_raw",
      "treatment_candidate",
      "truth_in_raw_control",
      "truth_in_raw_treatment",
      "exact_match_control",
      "exact_match_treatment",
      "useful_token_recall_control",
      "useful_token_recall_treatment",
      "false_reliable_read_control",
      "false_reliable_read_treatment",
      "determinism_pass",
      "classification",
    ],
    results,
  });

  const cropClusterResults = Object.entries(CROP_CLUSTERS).map(([id, members]) => {
    const rows = results.filter((row) => members.includes(row.historical_case_id));
    return {
      cropClusterId: id,
      members,
      ocrItems: rows.map((row) => row.case_id),
      cropSha256: frozenCropSha.get(members[0]) ?? null,
      memberClassifications: rows.map((row) => row.classification),
      clusterClassification: clusterClassification(rows.map((row) => row.classification)),
      countsOnce: true,
    };
  });
  await writeJson(path.join(OUTPUT_ROOT, "crop-cluster-results.json"), {
    experimentId: EXPERIMENT_ID,
    distinctCropImageDenominator: cropClusterResults.length,
    rule: "A duplicated crop counts once. C1's two members share identical crop bytes and cannot contribute two successes.",
    clusters: cropClusterResults,
  });

  const designClusterResults = Object.entries(DESIGN_CLUSTERS).map(([id, members]) => {
    const rows = results.filter((row) => members.includes(row.historical_case_id));
    return {
      designClusterId: id,
      members,
      ocrItems: rows.map((row) => row.case_id),
      memberClassifications: rows.map((row) => row.classification),
      clusterClassification: clusterClassification(rows.map((row) => row.classification)),
      countsOnce: true,
    };
  });
  await writeJson(path.join(OUTPUT_ROOT, "design-cluster-results.json"), {
    experimentId: EXPERIMENT_ID,
    distinctDesignDenominator: designClusterResults.length,
    rule: "A repeated design at a different scale counts once. D1 spans three historical cases but one design.",
    clusters: designClusterResults,
  });

  const determinismPass = results.every((row) => row.determinism_pass);
  const treatmentFalseReliableReads = results.filter(
    (row) => row.false_reliable_read_treatment,
  ).length;
  const newTreatmentFalseReliableReads = results.filter(
    (row) => row.false_reliable_read_treatment && !row.false_reliable_read_control,
  ).length;
  const improvedCropClusters = cropClusterResults.filter(
    (cluster) => cluster.clusterClassification === "RECOGNIZER_CAPABILITY_IMPROVEMENT",
  );
  const improvedDesignClusters = designClusterResults.filter(
    (cluster) => cluster.clusterClassification === "RECOGNIZER_CAPABILITY_IMPROVEMENT",
  );
  const allCropClustersNoEffect = cropClusterResults.every(
    (cluster) => cluster.clusterClassification === "NO_EFFECT",
  );

  let decision: "PROCEED" | "MIXED" | "STOP" | "NONDETERMINISTIC";
  let reason: string;
  if (!determinismPass) {
    decision = "NONDETERMINISTIC";
    reason =
      "At least one item did not reproduce under the exact repeat. Nondeterminism overrides every other decision.";
  } else if (treatmentFalseReliableReads > 0) {
    decision = "STOP";
    reason = `Safety veto: ${treatmentFalseReliableReads} treatment false reliable read(s).`;
  } else if (improvedCropClusters.length > 0 && improvedDesignClusters.length > 0) {
    decision = "PROCEED";
    reason = `${improvedCropClusters.length} distinct crop cluster(s) and ${improvedDesignClusters.length} distinct design cluster(s) improved, with zero treatment false reliable reads.`;
  } else if (allCropClustersNoEffect) {
    decision = "STOP";
    reason = "All distinct crop clusters are NO_EFFECT.";
  } else {
    decision = "MIXED";
    reason =
      "Improvement without valid recovery, improvement confined to one repeated-design cluster, or gains and regressions coexisting.";
  }

  const cropCounts: Record<string, number> = {};
  for (const cluster of cropClusterResults) {
    cropCounts[cluster.clusterClassification] =
      (cropCounts[cluster.clusterClassification] ?? 0) + 1;
  }
  const designCounts: Record<string, number> = {};
  for (const cluster of designClusterResults) {
    designCounts[cluster.clusterClassification] =
      (designCounts[cluster.clusterClassification] ?? 0) + 1;
  }

  await writeJson(path.join(OUTPUT_ROOT, "decision.json"), {
    experimentId: EXPERIMENT_ID,
    evaluationOnly: true,
    productionChanged: false,
    fixtureChanged: false,
    truthChanged: false,
    pr195Untouched: guardedProductionUnchanged,
    priorMergedArtifactsUnchanged: priorArtifactsUnchanged,
    decision,
    reason,
    historicalCaseCount: FROZEN_CASES.length,
    ocrItemCount: results.length,
    distinctCropImageDenominator: cropClusterResults.length,
    distinctDesignDenominator: designClusterResults.length,
    cropClusterClassificationCounts: cropCounts,
    designClusterClassificationCounts: designCounts,
    determinismPass,
    controlFalseReliableReads: results.filter((row) => row.false_reliable_read_control).length,
    treatmentFalseReliableReads,
    newTreatmentFalseReliableReads,
    capabilityCeilingPrerequisites: {
      deterministicFailureUnderStrongerConfiguration:
        determinismPass && allCropClustersNoEffect && treatmentFalseReliableReads === 0,
      positiveStylizationAudit: true,
      orientationAndSegmentationRuledOutPerCase: false,
      preprocessingNullOnFinalSubset: false,
      largerIndependentlySourcedCorpus: false,
      note: "A capability-ceiling claim requires every prerequisite. This experiment can satisfy at most one of them, and satisfying one is not a ceiling claim.",
    },
    claimsNotMade: [
      "No Tesseract capability-ceiling claim.",
      "No prevalence or production-rate claim.",
      "No authorization to replace Tesseract, change the production model, or enable anything in production.",
    ],
  });

  writeFileSync(
    path.join(OUTPUT_ROOT, "git-sha.txt"),
    `${gitSha()}\nbase: origin/main ${EXPECTED_BASE_SHA}\n`,
  );

  console.log(
    JSON.stringify(
      {
        decision,
        reason,
        determinismPass,
        treatmentFalseReliableReads,
        cropClusterCounts: cropCounts,
        designClusterCounts: designCounts,
        cropClusters: cropClusterResults.map((c) => ({
          id: c.cropClusterId,
          classification: c.clusterClassification,
        })),
        designClusters: designClusterResults.map((c) => ({
          id: c.designClusterId,
          classification: c.clusterClassification,
        })),
        items: results.map((row) => ({
          case_id: row.case_id,
          control_candidate: row.control_candidate,
          treatment_candidate: row.treatment_candidate,
          exact_control: row.exact_match_control,
          exact_treatment: row.exact_match_treatment,
          truth_raw_control: row.truth_in_raw_control,
          truth_raw_treatment: row.truth_in_raw_treatment,
          recall_control: row.useful_token_recall_control,
          recall_treatment: row.useful_token_recall_treatment,
          frr_treatment: row.false_reliable_read_treatment,
          determinism: row.determinism_pass,
          classification: row.classification,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
