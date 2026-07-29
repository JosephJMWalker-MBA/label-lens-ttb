/**
 * Issue #149 — PSM 7 versus the bounded Brand control on the five frozen
 * SEGMENTATION_SUSPECTED cases.
 *
 * Evaluation-only. One variable: page segmentation mode. The runner reuses the
 * existing evaluation-only OCR primitives read-only and changes no production
 * behavior. Raw OCR output for both runs is persisted before truth is read.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { format } from "prettier";
import sharp from "sharp";

import {
  OCR_EXPERIMENT_SCHEMA_VERSION,
  PRODUCTION_BOUNDED_BRAND_CONTROL,
  executeOcrCase,
  validateConfigurationIsolation,
  type OcrConfiguration,
  type OcrExecutionInput,
  type OcrExecutionResult,
} from "@/fixtures/ocr-research/experiment";
import {
  composeResearchManifest,
  type ResearchFixture,
} from "@/fixtures/ocr-research/fixture-corpus";
import { createLocalOcrEngine } from "@/pipeline/extractor/ocr-engine";

const EXPERIMENT_ID = "issue-149-brand-psm7-segmentation-attribution";
const OUTPUT_ROOT = path.join(process.cwd(), "artifacts", EXPERIMENT_ID);
const EXPECTED_BASE_SHA = "9b02a55690fe3df61870888ffee4907abc07d5e1";
const PREREGISTRATION_SHA256 = "df29caeec3b7369763d9769fbc1e0d87f3475d8dbb182a4ae498581fe64cacd4";

/** Frozen before any OCR. No case may be added, dropped, or substituted. */
const FROZEN_CASES = [
  "approved-wine-023",
  "approved-wine-027",
  "approved-wine-035",
  "approved-wine-085",
  "approved-wine-091",
] as const;

/** Production paths that must not move. Includes the PR #195 baseline file. */
const GUARDED_PRODUCTION_HASHES = {
  "src/pipeline/extractor/field-selection.ts":
    "3e84fa8a043570713991643830c7b95e0f7189a4ed037b737c783353d519106d",
  "src/pipeline/extractor/regions.ts":
    "910d763e20f47d811348b62c77f17d46ddf3a07b5849a337669a07f6b8efc9ab",
  "src/pipeline/extractor/extractor.ts":
    "9b2712e6bb15552e9524bc5e60be4da2b163bdb325206f452ecbaf44ebf5084c",
  "src/pipeline/extractor/ocr-engine.ts":
    "1cf37e4ca28dd68fbfc2412b242ad02db6d76c752d3203f27d17f27c9e0e59e7",
} as const;

/** Evaluation-only modules whose behavior the frozen design depends on. */
const FROZEN_EVALUATION_HASHES = {
  "src/fixtures/ocr-research/experiment.ts":
    "f6f0b167cb0a15e443b92b50c4f151aacd0b1dd04acf33e2b31018cb626aa806",
  "src/fixtures/ocr-research/fixture-corpus.ts":
    "c31aebe3bade0d39fed3031cdccfd5154556bc1d3c88be1bdccf7bc134576084",
} as const;

const TRAINEDDATA_PATH = "src/pipeline/extractor/assets/eng.traineddata";

const CONTROL: OcrConfiguration = Object.freeze({
  ...PRODUCTION_BOUNDED_BRAND_CONTROL,
  padding: Object.freeze({ ...PRODUCTION_BOUNDED_BRAND_CONTROL.padding }),
  psm: 11,
});

const TREATMENT: OcrConfiguration = Object.freeze({
  ...PRODUCTION_BOUNDED_BRAND_CONTROL,
  padding: Object.freeze({ ...PRODUCTION_BOUNDED_BRAND_CONTROL.padding }),
  psm: 7,
});

type Arm = "control" | "treatment";
type RunId = "primary" | "repeat";

type CaseClassification =
  | "NONDETERMINISTIC"
  | "REGRESSION"
  | "SEGMENTATION_MECHANISM_CONFIRMED"
  | "LEGIBILITY_IMPROVED_NOT_RECOVERED"
  | "NO_EFFECT";

interface RawArmOutput {
  caseId: string;
  arm: Arm;
  psm: number;
  cropSha256: string;
  preprocessedSha256: string;
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
  return sha256Bytes(readFileSync(path.join(process.cwd(), filePath)));
}

function sha256Value(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
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

/** The repository's existing comparison normalization. Truth-side only. */
function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Mirrors `cropFor` in experiment.ts for the governed-brand-region case so crop
 * bytes can be frozen and verified before OCR runs. The run then asserts that
 * the bytes OCR actually consumed hash to these same values.
 */
function governedBrandCrop(
  fixture: ResearchFixture,
  configuration: OcrConfiguration,
): { left: number; top: number; width: number; height: number } {
  const region = fixture.regions.brand[0];
  if (!region) throw new Error(`MISSING_GOVERNED_REGION: ${fixture.fixtureId}`);
  const imageWidth = fixture.image.width;
  const imageHeight = fixture.image.height;
  const left = Math.floor(region.x * imageWidth);
  const top = Math.floor(region.y * imageHeight);
  const right = Math.ceil((region.x + region.width) * imageWidth);
  const bottom = Math.ceil((region.y + region.height) * imageHeight);
  const width = right - left;
  const height = bottom - top;
  if (width <= 0 || height <= 0) throw new Error(`INVALID_REGION_PIXELS: ${fixture.fixtureId}`);
  const padX = Math.max(
    configuration.padding.minPx,
    Math.round(width * configuration.padding.ratio),
  );
  const padY = Math.max(
    configuration.padding.minPx,
    Math.round(height * configuration.padding.ratio),
  );
  const paddedLeft = clamp(left - padX, 0, imageWidth - 1);
  const paddedTop = clamp(top - padY, 0, imageHeight - 1);
  const paddedRight = clamp(right + padX, paddedLeft + 1, imageWidth);
  const paddedBottom = clamp(bottom + padY, paddedTop + 1, imageHeight);
  return {
    left: paddedLeft,
    top: paddedTop,
    width: paddedRight - paddedLeft,
    height: paddedBottom - paddedTop,
  };
}

function frozenFixtures(): ResearchFixture[] {
  const manifest = composeResearchManifest({ includePrivate: false });
  const byId = new Map(manifest.fixtures.map((fixture) => [fixture.fixtureId, fixture]));
  return FROZEN_CASES.map((caseId) => {
    const fixture = byId.get(caseId);
    if (!fixture) throw new Error(`FROZEN_CASE_NOT_IN_MANIFEST: ${caseId}`);
    if (fixture.regions.brand.length !== 1) {
      throw new Error(`UNEXPECTED_BRAND_REGION_COUNT: ${caseId}`);
    }
    return fixture;
  });
}

function executionInput(fixture: ResearchFixture): OcrExecutionInput {
  return {
    caseId: fixture.fixtureId,
    fixtureId: fixture.fixtureId,
    imagePath: fixture.image.path,
    expectedSha256: fixture.image.sha256,
    image: {
      width: fixture.image.width,
      height: fixture.image.height,
      mimeType: fixture.image.mimeType,
    },
    region: fixture.regions.brand[0],
  };
}

interface Preflight {
  baseShaMatches: boolean;
  preregistrationFrozen: boolean;
  guardedProductionUnchanged: boolean;
  pr195BaselineUnchanged: boolean;
  frozenEvaluationModulesUnchanged: boolean;
  singleVariableIsolation: { changedVariables: string[]; declaredVariable: string };
}

function preflight(): Preflight {
  const isolation = validateConfigurationIsolation({
    schemaVersion: OCR_EXPERIMENT_SCHEMA_VERSION,
    experimentId: EXPERIMENT_ID,
    design: "one-variable-at-a-time",
    declaredVariable: "psm",
    control: CONTROL,
    treatment: TREATMENT,
  });
  const pr195File = "src/pipeline/extractor/field-selection.ts";
  return {
    baseShaMatches: gitSha() === EXPECTED_BASE_SHA,
    preregistrationFrozen:
      sha256File(path.join("artifacts", EXPERIMENT_ID, "preregistration.md")) ===
      PREREGISTRATION_SHA256,
    guardedProductionUnchanged: Object.entries(GUARDED_PRODUCTION_HASHES).every(
      ([filePath, expected]) => sha256File(filePath) === expected,
    ),
    pr195BaselineUnchanged: sha256File(pr195File) === GUARDED_PRODUCTION_HASHES[pr195File],
    frozenEvaluationModulesUnchanged: Object.entries(FROZEN_EVALUATION_HASHES).every(
      ([filePath, expected]) => sha256File(filePath) === expected,
    ),
    singleVariableIsolation: {
      changedVariables: isolation.isolation.changedVariables,
      declaredVariable: isolation.declaredVariable,
    },
  };
}

/** Crop bytes are frozen before OCR and re-verified against what OCR consumed. */
async function freezeCrops(fixtures: readonly ResearchFixture[]) {
  const entries = [];
  for (const fixture of fixtures) {
    const crop = governedBrandCrop(fixture, CONTROL);
    const treatmentCrop = governedBrandCrop(fixture, TREATMENT);
    if (JSON.stringify(crop) !== JSON.stringify(treatmentCrop)) {
      throw new Error(`CROP_GEOMETRY_DIFFERS_BETWEEN_ARMS: ${fixture.fixtureId}`);
    }
    const bytes = readFileSync(path.resolve(fixture.image.path));
    if (sha256Bytes(bytes) !== fixture.image.sha256) {
      throw new Error(`FIXTURE_CHECKSUM_MISMATCH: ${fixture.fixtureId}`);
    }
    const cropPng = await sharp(bytes).extract(crop).png().toBuffer();
    entries.push({
      caseId: fixture.fixtureId,
      sourceImagePath: fixture.image.path,
      sourceImageSha256: fixture.image.sha256,
      sourceImageSize: { width: fixture.image.width, height: fixture.image.height },
      governedBrandRegion: fixture.regions.brand[0],
      cropRect: crop,
      cropSha256: sha256Bytes(cropPng),
      cropIdenticalAcrossArms: true,
    });
  }
  const hashes = entries.map((entry) => entry.cropSha256);
  const distinct = new Set(hashes).size === entries.length;
  if (!distinct) throw new Error("FROZEN_CROPS_NOT_DISTINCT");
  return { entries, distinct };
}

async function runArmCase(
  fixture: ResearchFixture,
  configuration: OcrConfiguration,
  arm: Arm,
  engine: Awaited<ReturnType<typeof createLocalOcrEngine>>,
): Promise<{ raw: RawArmOutput; result: OcrExecutionResult }> {
  const result = await executeOcrCase(executionInput(fixture), configuration, engine);
  return {
    result,
    raw: {
      caseId: fixture.fixtureId,
      arm,
      psm: configuration.psm,
      cropSha256: sha256Bytes(result.artifacts.cropPng),
      preprocessedSha256: sha256Bytes(result.artifacts.preprocessedPng),
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
    },
  };
}

async function runOnce(
  fixtures: readonly ResearchFixture[],
  runId: RunId,
  frozenCropSha: ReadonlyMap<string, string>,
): Promise<RawArmOutput[]> {
  const engine = await createLocalOcrEngine();
  const outputs: RawArmOutput[] = [];
  try {
    for (const fixture of fixtures) {
      for (const [arm, configuration] of [
        ["control", CONTROL],
        ["treatment", TREATMENT],
      ] as const) {
        const { raw } = await runArmCase(fixture, configuration, arm, engine);
        const expected = frozenCropSha.get(fixture.fixtureId);
        if (raw.cropSha256 !== expected) {
          throw new Error(`CROP_BYTES_DIVERGED_FROM_FREEZE: ${runId}/${arm}/${fixture.fixtureId}`);
        }
        outputs.push(raw);
      }
    }
  } finally {
    await engine.terminate();
  }
  return outputs;
}

function armOf(outputs: readonly RawArmOutput[], caseId: string, arm: Arm): RawArmOutput {
  const found = outputs.find((item) => item.caseId === caseId && item.arm === arm);
  if (!found) throw new Error(`MISSING_ARM_OUTPUT: ${caseId}/${arm}`);
  return found;
}

function truthValues(fixture: ResearchFixture): string[] {
  return fixture.truth.brand?.acceptableValues ?? [];
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

/** Max over acceptable values of (matched truth tokens >= 3 chars) / (total). */
function usefulTokenRecall(
  transcript: string,
  expected: readonly string[],
): { recall: number | null; matchedTokens: number; totalTokens: number } {
  const haystack = normalize(transcript);
  let best: { recall: number | null; matchedTokens: number; totalTokens: number } = {
    recall: null,
    matchedTokens: 0,
    totalTokens: 0,
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
      best = { recall, matchedTokens: matched, totalTokens: tokens.length };
    }
  }
  return best;
}

function behaviorProjection(raw: RawArmOutput) {
  return {
    rawTranscript: raw.rawTranscript,
    words: raw.words,
    selection: raw.selection,
  };
}

interface CaseResult {
  case_id: string;
  crop_sha256: string;
  control_psm: number;
  control_raw: string;
  control_candidate: string | null;
  treatment_psm: number;
  treatment_raw: string;
  treatment_candidate: string | null;
  truth_in_raw_control: boolean;
  truth_in_raw_treatment: boolean;
  exact_match_control: boolean;
  exact_match_treatment: boolean;
  useful_token_recall_control: number | null;
  useful_token_recall_treatment: number | null;
  false_reliable_read_control: boolean;
  false_reliable_read_treatment: boolean;
  determinism_pass: boolean;
  classification: CaseClassification;
  classificationBasis: string;
  detail: {
    controlTokens: { matched: number; total: number };
    treatmentTokens: { matched: number; total: number };
    controlMeanConfidence: number | null;
    treatmentMeanConfidence: number | null;
    controlWordCount: number;
    treatmentWordCount: number;
    controlSelectionState: string;
    treatmentSelectionState: string;
    controlEvidenceScore: number;
    treatmentEvidenceScore: number;
  };
}

const MATERIAL_RECALL_DELTA = 0.25;

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
}): { classification: CaseClassification; basis: string } {
  if (!args.deterministic) {
    return {
      classification: "NONDETERMINISTIC",
      basis: "The exact repeat did not reproduce the primary run.",
    };
  }
  const recallDelta =
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
      basis: "Truth-bearing text present in the control transcript was lost under treatment.",
    };
  }
  if (args.falseReliableTreatment && !args.falseReliableControl) {
    return {
      classification: "REGRESSION",
      basis: "Treatment introduced a reliable Brand read that does not match truth.",
    };
  }
  if (recallDelta <= -MATERIAL_RECALL_DELTA) {
    return {
      classification: "REGRESSION",
      basis: `Useful token recall fell by ${Math.abs(recallDelta).toFixed(2)}, at or beyond the preregistered ${MATERIAL_RECALL_DELTA} threshold.`,
    };
  }
  if (args.exactTreatment && !args.exactControl && !args.falseReliableTreatment) {
    return {
      classification: "SEGMENTATION_MECHANISM_CONFIRMED",
      basis:
        "Treatment produced an exact Brand candidate that control did not, with no false reliable read.",
    };
  }
  if (!args.truthRawControl && args.truthRawTreatment) {
    return {
      classification: "LEGIBILITY_IMPROVED_NOT_RECOVERED",
      basis:
        "Treatment recovered truth-bearing text in the raw transcript without producing a valid Brand candidate.",
    };
  }
  if (recallDelta >= MATERIAL_RECALL_DELTA && args.matchedTreatment > args.matchedControl) {
    return {
      classification: "LEGIBILITY_IMPROVED_NOT_RECOVERED",
      basis: `Useful token recall rose by ${recallDelta.toFixed(2)} and by at least one whole truth token, without a valid Brand candidate.`,
    };
  }
  return {
    classification: "NO_EFFECT",
    basis: "Neither arm produced materially better truth-bearing or exact Brand evidence.",
  };
}

function evaluate(
  fixtures: readonly ResearchFixture[],
  primary: readonly RawArmOutput[],
  repeat: readonly RawArmOutput[],
): CaseResult[] {
  return fixtures.map((fixture) => {
    const caseId = fixture.fixtureId;
    const expected = truthValues(fixture);
    if (expected.length === 0) throw new Error(`MISSING_BRAND_TRUTH: ${caseId}`);
    const control = armOf(primary, caseId, "control");
    const treatment = armOf(primary, caseId, "treatment");
    const repeatControl = armOf(repeat, caseId, "control");
    const repeatTreatment = armOf(repeat, caseId, "treatment");

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
      matchedControl: controlRecall.matchedTokens,
      matchedTreatment: treatmentRecall.matchedTokens,
      falseReliableControl,
      falseReliableTreatment,
    });

    return {
      case_id: caseId,
      crop_sha256: control.cropSha256,
      control_psm: control.psm,
      control_raw: control.rawTranscript,
      control_candidate: control.selection.value,
      treatment_psm: treatment.psm,
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
        controlTokens: { matched: controlRecall.matchedTokens, total: controlRecall.totalTokens },
        treatmentTokens: {
          matched: treatmentRecall.matchedTokens,
          total: treatmentRecall.totalTokens,
        },
        controlMeanConfidence: control.meanConfidence,
        treatmentMeanConfidence: treatment.meanConfidence,
        controlWordCount: control.rawWordCount,
        treatmentWordCount: treatment.rawWordCount,
        controlSelectionState: control.selection.state,
        treatmentSelectionState: treatment.selection.state,
        controlEvidenceScore: control.selection.ocrEvidenceScore,
        treatmentEvidenceScore: treatment.selection.ocrEvidenceScore,
      },
    };
  });
}

function decide(results: readonly CaseResult[]) {
  const counts: Record<CaseClassification, number> = {
    NONDETERMINISTIC: 0,
    REGRESSION: 0,
    SEGMENTATION_MECHANISM_CONFIRMED: 0,
    LEGIBILITY_IMPROVED_NOT_RECOVERED: 0,
    NO_EFFECT: 0,
  };
  for (const result of results) counts[result.classification] += 1;

  const treatmentFalseReliableReads = results.filter(
    (item) => item.false_reliable_read_treatment,
  ).length;
  const newTreatmentFalseReliableReads = results.filter(
    (item) => item.false_reliable_read_treatment && !item.false_reliable_read_control,
  ).length;
  const controlFalseReliableReads = results.filter(
    (item) => item.false_reliable_read_control,
  ).length;
  const determinismPass = results.every((item) => item.determinism_pass);

  let decision: "PROCEED" | "MIXED" | "STOP" | "NONDETERMINISTIC";
  let reason: string;
  if (!determinismPass) {
    decision = "NONDETERMINISTIC";
    reason =
      "At least one case did not reproduce under the exact repeat. Nondeterminism overrides every other conclusion.";
  } else if (treatmentFalseReliableReads > 0) {
    decision = "STOP";
    reason = `Safety veto: ${treatmentFalseReliableReads} treatment false reliable read(s). This outranks any improvement.`;
  } else if (counts.SEGMENTATION_MECHANISM_CONFIRMED > 0) {
    decision = "PROCEED";
    reason = `${counts.SEGMENTATION_MECHANISM_CONFIRMED} case(s) confirmed the segmentation mechanism with zero treatment false reliable reads.`;
  } else if (counts.NO_EFFECT === results.length) {
    decision = "STOP";
    reason = "All five cases were NO_EFFECT: control and treatment are equivalently unsuccessful.";
  } else {
    decision = "MIXED";
    reason =
      "Improvement without valid recovery, or gains and regressions coexisting, with no confirmed mechanism.";
  }

  return {
    decision,
    reason,
    counts,
    caseCount: results.length,
    determinismPass,
    controlFalseReliableReads,
    treatmentFalseReliableReads,
    newTreatmentFalseReliableReads,
    safetyVetoes: {
      newTreatmentFalseReliableReadStopsBranch: newTreatmentFalseReliableReads > 0,
      regressionFromCorrectControlEvidence: results.some(
        (item) => item.classification === "REGRESSION",
      ),
      confidenceCountedAsImprovement: false,
      bestOfTwoUsed: false,
      postHocCaseSelectionUsed: false,
      frozenCaseSetAltered: false,
    },
  };
}

async function main() {
  const flags = preflight();
  if (!flags.preregistrationFrozen) throw new Error("PSM7_PREREGISTRATION_CHANGED");
  if (!flags.guardedProductionUnchanged) throw new Error("PSM7_GUARDED_PRODUCTION_PATH_CHANGED");
  if (!flags.frozenEvaluationModulesUnchanged) throw new Error("PSM7_EVALUATION_MODULE_CHANGED");
  if (
    flags.singleVariableIsolation.changedVariables.length !== 1 ||
    flags.singleVariableIsolation.changedVariables[0] !== "psm"
  ) {
    throw new Error("PSM7_SINGLE_VARIABLE_ISOLATION_FAILED");
  }

  const fixtures = frozenFixtures();
  mkdirSync(OUTPUT_ROOT, { recursive: true });

  await writeJson(path.join(OUTPUT_ROOT, "case-freeze.json"), {
    experimentId: EXPERIMENT_ID,
    frozenBeforeOcr: true,
    baseSha: EXPECTED_BASE_SHA,
    evidenceBasis: {
      mergedPr: 205,
      geometryLabel: "SEGMENTATION_SUSPECTED",
      geometryLabelCount: "5/5",
      psm13Eligible: false,
      orientationExperimentAuthorized: false,
      annotator: "single isolated model reader; labels provisional",
    },
    caseCount: FROZEN_CASES.length,
    cases: fixtures.map((fixture) => ({
      caseId: fixture.fixtureId,
      fixtureId: fixture.fixtureId,
      sourceImagePath: fixture.image.path,
      sourceImageSha256: fixture.image.sha256,
      brandRegionCount: fixture.regions.brand.length,
    })),
    mutationPolicy:
      "No case may be added, substituted, dropped, or re-scored after results are seen. Post-hoc case selection and best-of-two reporting are prohibited.",
  });

  await writeJson(path.join(OUTPUT_ROOT, "configuration-freeze.json"), {
    experimentId: EXPERIMENT_ID,
    frozenBeforeOcr: true,
    design: "one-variable-at-a-time",
    declaredVariable: "psm",
    changedVariables: flags.singleVariableIsolation.changedVariables,
    control: { ...CONTROL, configurationHash: sha256Value(CONTROL) },
    treatment: { ...TREATMENT, configurationHash: sha256Value(TREATMENT) },
    controlProvenance:
      "PRODUCTION_BOUNDED_BRAND_CONTROL; psm 11 is PAGE_SEG.SPARSE_TEXT, the mode production uses for governed region passes.",
    engine: {
      ocrEngine: "tesseract.js@7.0.0/eng/OEM1",
      tesseractJs: "7.0.0",
      tesseractJsCore: "7.0.0",
      sharp: sharp.versions.sharp,
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      traineddata: {
        path: TRAINEDDATA_PATH,
        sha256: sha256File(TRAINEDDATA_PATH),
        vendored: true,
        networkFetch: false,
      },
    },
    excluded: [
      "no PSM sweep",
      "no PSM 13",
      "no rotation change",
      "no preprocessing change",
      "no crop change",
      "no model or traineddata change",
      "no parser, ranking, threshold, normalization, or selection change",
    ],
    preflight: flags,
  });

  const crops = await freezeCrops(fixtures);
  const frozenCropSha = new Map(crops.entries.map((entry) => [entry.caseId, entry.cropSha256]));
  await writeJson(path.join(OUTPUT_ROOT, "crop-provenance.json"), {
    experimentId: EXPERIMENT_ID,
    frozenBeforeOcr: true,
    cropsDistinct: crops.distinct,
    cropCount: crops.entries.length,
    identicalCropPixelsAcrossArms: true,
    verificationRule:
      "The crop bytes handed to OCR are re-hashed during each run and must equal these values for both arms; any mismatch fails the run closed.",
    crops: crops.entries,
  });

  // Raw OCR output is persisted before truth is read.
  const primary = await runOnce(fixtures, "primary", frozenCropSha);
  await writeJson(path.join(OUTPUT_ROOT, "primary-run-raw.json"), {
    experimentId: EXPERIMENT_ID,
    run: "primary",
    truthRead: false,
    note: "Raw OCR output, persisted before any normalization against truth or truth comparison.",
    outputs: primary,
  });

  const repeat = await runOnce(fixtures, "repeat", frozenCropSha);
  await writeJson(path.join(OUTPUT_ROOT, "repeat-run-raw.json"), {
    experimentId: EXPERIMENT_ID,
    run: "repeat",
    truthRead: false,
    note: "Exact repeat of both arms for determinism, persisted before truth comparison.",
    outputs: repeat,
  });

  // Truth is read only from here on, for evaluation.
  const results = evaluate(fixtures, primary, repeat);
  await writeJson(path.join(OUTPUT_ROOT, "per-case-results.json"), {
    experimentId: EXPERIMENT_ID,
    truthUsedOnlyAfterRawFreeze: true,
    columns: [
      "case_id",
      "crop_sha256",
      "control_psm",
      "control_raw",
      "control_candidate",
      "treatment_psm",
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
    ],
    results,
  });

  const decision = decide(results);
  await writeJson(path.join(OUTPUT_ROOT, "decision.json"), {
    experimentId: EXPERIMENT_ID,
    evaluationOnly: true,
    productionChanged: false,
    pr195Untouched: flags.pr195BaselineUnchanged,
    ...decision,
    claimsNotMade: [
      "No causal claim that segmentation is the dominant Brand bottleneck.",
      "No prevalence or production-rate claim; n=5 mechanism-existence test only.",
      "No Tesseract capability-ceiling claim under any outcome.",
      "No claim about the separate stylized-typeface subset.",
    ],
    authorizedNext:
      "PSM 7 success authorizes only a separately preregistered policy experiment. Failure moves the question toward recognizer/traineddata capability or another separately preregistered segmentation configuration, not a sweep.",
  });

  writeFileSync(
    path.join(OUTPUT_ROOT, "git-sha.txt"),
    `${gitSha()}\nbase: origin/main ${EXPECTED_BASE_SHA}\n`,
  );

  console.log(
    JSON.stringify(
      {
        outputRoot: path.relative(process.cwd(), OUTPUT_ROOT),
        preflight: flags,
        cropsDistinct: crops.distinct,
        decision,
        results: results.map((item) => ({
          case_id: item.case_id,
          control_candidate: item.control_candidate,
          treatment_candidate: item.treatment_candidate,
          exact_match_control: item.exact_match_control,
          exact_match_treatment: item.exact_match_treatment,
          truth_in_raw_control: item.truth_in_raw_control,
          truth_in_raw_treatment: item.truth_in_raw_treatment,
          useful_token_recall_control: item.useful_token_recall_control,
          useful_token_recall_treatment: item.useful_token_recall_treatment,
          false_reliable_read_treatment: item.false_reliable_read_treatment,
          determinism_pass: item.determinism_pass,
          classification: item.classification,
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
