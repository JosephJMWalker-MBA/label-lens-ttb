/**
 * `npm run vision:eval` — measure the private vision reader on the frozen wine
 * corpus that the Tesseract research (Issue #149) used.
 *
 *   --mode whole|bounded|both   default both
 *   --limit N                   only the first N whole-label cases
 *   --cases id1,id2             only these case ids
 *   --max-edge PX               longest edge for whole-label images (default 2048)
 *   --out DIR                   default .local-vision/eval-<timestamp>
 *
 * Truth is read here, in evaluation code, and is never sent to the reader:
 * the model sees pixels and the fixed transcription prompt only.
 */
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

import {
  alcoholPercentsInTranscript,
  brandPresentInTranscript,
  brandValueMatches,
  percentToBasisPoints,
  summarizeBoundedBrand,
  summarizeWholeLabel,
  type BoundedBrandCaseResult,
  type WholeLabelCaseResult,
} from "../../src/fixtures/eval/vision-reader-eval.ts";
import { sellerRegionCropPlan } from "../../src/pipeline/extractor/regions.ts";
import type { SellerRegionOcrTarget } from "../../src/pipeline/extractor/extractor.types.ts";
import { resolveVisionConfig, type VisionConfig } from "../../src/server/vision/config.ts";
import { transcribeRegion } from "../../src/server/vision/region-transcription.ts";
import { sellerRegionReadingFromTranscription } from "../../src/server/vision/seller-region-reading.ts";
import {
  TRANSCRIPTION_PROMPT_SHA256,
  TRANSCRIPTION_PROMPT_VERSION,
} from "../../src/server/vision/transcription-prompt.ts";

interface ManifestRecord {
  caseId: string;
  imagePath: string;
  status: string;
  beverageCategory: string;
  annotation?: {
    brand?: { presence: "present" | "absent"; acceptablePresentations: string[] };
    alcohol?: { presence: "present" | "absent"; acceptablePercents: number[] };
  };
}

interface ApprovedRegion {
  caseId: string;
  fixtureBrand: string;
  imagePath: string;
  imageWidth: number;
  imageHeight: number;
  occurrences: Array<{
    label: string;
    region: { x: number; y: number; width: number; height: number };
  }>;
}

/** Published Tesseract figures, shown for orientation only (different measures). */
const TESSERACT_REFERENCE = {
  source: "Issue #223 / product-strength audit, 2026-07-21 and 2026-09-09",
  brandTruthInRawOcr: "79/105 (substring match, not word-bounded; 2 known false positives)",
  brandNormalizedSelection: "29/105 (27.6%)",
  alcoholParsedAccuracy: "68/103 (66.0%)",
  alcoholAbsentFalsePositives: "0/13",
};

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function gitSha(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

async function wholeLabel(
  config: VisionConfig,
  records: ManifestRecord[],
): Promise<WholeLabelCaseResult[]> {
  const results: WholeLabelCaseResult[] = [];
  for (const [index, record] of records.entries()) {
    const bytes = new Uint8Array(await readFile(record.imagePath));
    const meta = await sharp(bytes).metadata();
    const outcome = await transcribeRegion(config, bytes, {
      left: 0,
      top: 0,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
    });
    const brandTruth = record.annotation?.brand;
    const alcoholTruth = record.annotation?.alcohol;
    const lines = outcome.ok ? outcome.value.lines : [];
    const found = outcome.ok ? alcoholPercentsInTranscript(lines) : [];
    const expected = (alcoholTruth?.acceptablePercents ?? []).map(percentToBasisPoints);
    const alcoholPresent = alcoholTruth?.presence === "present";
    const result: WholeLabelCaseResult = {
      caseId: record.caseId,
      ok: outcome.ok,
      errorCode: outcome.ok ? null : outcome.code,
      latencyMs: outcome.ok ? outcome.value.provenance.latencyMs : null,
      legibility: outcome.ok ? outcome.value.legibility : null,
      lineCount: lines.length,
      brand: {
        presence: brandTruth?.presence ?? "absent",
        observed:
          outcome.ok && brandTruth?.presence === "present"
            ? brandPresentInTranscript(lines, brandTruth.acceptablePresentations)
            : null,
      },
      alcohol: {
        presence: alcoholTruth?.presence ?? "absent",
        expectedBasisPoints: expected,
        foundBasisPoints: found,
        correct: outcome.ok && alcoholPresent ? found.some((bp) => expected.includes(bp)) : null,
        falsePositive: outcome.ok && !alcoholPresent ? found.length > 0 : null,
      },
    };
    results.push(result);
    const brandMark = result.brand.observed === null ? "-" : result.brand.observed ? "B✓" : "B✗";
    const alcMark =
      result.alcohol.correct === null
        ? result.alcohol.falsePositive
          ? "A!FP"
          : "A-"
        : result.alcohol.correct
          ? "A✓"
          : "A✗";
    console.log(
      `[whole ${index + 1}/${records.length}] ${record.caseId} ${outcome.ok ? `${brandMark} ${alcMark} ${result.latencyMs} ms` : `ERROR ${result.errorCode}`}`,
    );
  }
  return results;
}

async function boundedBrand(
  config: VisionConfig,
  regions: ApprovedRegion[],
  manifest: ManifestRecord[],
): Promise<BoundedBrandCaseResult[]> {
  const results: BoundedBrandCaseResult[] = [];
  for (const approved of regions) {
    const record = manifest.find((entry) => entry.imagePath === approved.imagePath);
    const acceptable = [
      approved.fixtureBrand,
      ...(record?.annotation?.brand?.acceptablePresentations ?? []),
    ];
    const bytes = new Uint8Array(await readFile(approved.imagePath));
    const meta = await sharp(bytes).metadata();
    const width = meta.width ?? approved.imageWidth;
    const height = meta.height ?? approved.imageHeight;
    for (const occurrence of approved.occurrences) {
      const target: SellerRegionOcrTarget = {
        categoryId: "brandName",
        regionId: `${approved.caseId}:${occurrence.label}`,
        panelId: "front",
        region: {
          unit: "normalized-panel-relative",
          provenance: "seller-selected-region",
          x: occurrence.region.x / width,
          y: occurrence.region.y / height,
          width: occurrence.region.width / width,
          height: occurrence.region.height / height,
        },
      };
      const plan = sellerRegionCropPlan(target, width, height);
      const outcome = plan
        ? await transcribeRegion(config, bytes, plan.crop)
        : ({ ok: false, code: "INVALID_CROP", message: "no plan" } as const);
      const reading = outcome.ok
        ? sellerRegionReadingFromTranscription({
            target,
            imageWidth: width,
            imageHeight: height,
            transcription: outcome.value,
            processedAt: new Date().toISOString(),
          })
        : null;
      const observedValue = reading?.observedValue ?? null;
      const result: BoundedBrandCaseResult = {
        caseId: approved.caseId,
        occurrence: occurrence.label,
        ok: outcome.ok,
        errorCode: outcome.ok ? null : outcome.code,
        latencyMs: outcome.ok ? outcome.value.provenance.latencyMs : null,
        observedValue,
        evidenceState: reading?.evidenceState ?? null,
        reliable: reading?.reliabilityState === "RELIABLE",
        matchesTruth: brandValueMatches(observedValue, acceptable),
      };
      results.push(result);
      console.log(
        `[bounded] ${approved.caseId} "${observedValue ?? ""}" ${result.matchesTruth ? "✓" : "✗"} ${result.reliable ? "reliable" : "unreliable"}`,
      );
    }
  }
  return results;
}

function markdown(report: Record<string, unknown>): string {
  return [
    "# Vision reader corpus evaluation",
    "",
    "```json",
    JSON.stringify(
      {
        provenance: report.provenance,
        wholeLabel: report.wholeLabelSummary,
        boundedBrand: report.boundedBrandSummary,
        tesseractReference: report.tesseractReference,
      },
      null,
      2,
    ),
    "```",
    "",
    "Whole-label numbers say whether the truth was *observed* in the transcript; they are not",
    "a selection accuracy. Bounded numbers run the exact production mapping on human-approved regions.",
    "",
  ].join("\n");
}

async function main() {
  const resolved = resolveVisionConfig(process.env);
  if (resolved.state !== "enabled") {
    console.error(
      resolved.state === "invalid"
        ? `Vision configuration invalid:\n  - ${resolved.issues.join("\n  - ")}`
        : "Vision reader is not configured. See deploy/orin/README.md.",
    );
    process.exitCode = 1;
    return;
  }
  const mode = arg("mode") ?? "both";
  const maxEdge = Number(arg("max-edge") ?? "2048");
  const limit = arg("limit") ? Number(arg("limit")) : undefined;
  const only = arg("cases")
    ?.split(",")
    .map((value) => value.trim());
  const outDir =
    arg("out") ??
    path.join(".local-vision", `eval-${new Date().toISOString().replace(/[:.]/g, "-")}`);

  const manifest = JSON.parse(await readFile("src/fixtures/eval/eval-manifest.json", "utf8")) as {
    records: ManifestRecord[];
  };
  let records = manifest.records.filter(
    (record) => record.status === "included" && record.beverageCategory === "wine",
  );
  if (only) records = records.filter((record) => only.includes(record.caseId));
  if (limit !== undefined) records = records.slice(0, limit);

  const approved = JSON.parse(
    await readFile("artifacts/brand-region-coverage-diagnosis/approved-regions.json", "utf8"),
  ) as { approvedRegions: ApprovedRegion[] };
  const regions = only
    ? approved.approvedRegions.filter((region) => only.includes(region.caseId))
    : approved.approvedRegions;

  const started = new Date().toISOString();
  const whole =
    mode === "whole" || mode === "both"
      ? await wholeLabel({ ...resolved.config, maxImageEdgePx: maxEdge }, records)
      : [];
  const bounded =
    mode === "bounded" || mode === "both"
      ? await boundedBrand(resolved.config, regions, manifest.records)
      : [];

  const report = {
    schemaVersion: "vision-reader-corpus-eval.v1",
    provenance: {
      gitSha: gitSha(),
      started,
      finished: new Date().toISOString(),
      hostLabel: resolved.config.hostLabel,
      configuredModel: resolved.config.model,
      promptVersion: TRANSCRIPTION_PROMPT_VERSION,
      promptSha256: TRANSCRIPTION_PROMPT_SHA256,
      structuredOutput: resolved.config.structuredOutput,
      wholeLabelMaxEdgePx: maxEdge,
      boundedMaxEdgePx: resolved.config.maxImageEdgePx,
    },
    wholeLabelSummary: whole.length ? summarizeWholeLabel(whole) : null,
    boundedBrandSummary: bounded.length ? summarizeBoundedBrand(bounded) : null,
    tesseractReference: TESSERACT_REFERENCE,
    wholeLabelCases: whole,
    boundedBrandCases: bounded,
  };

  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(outDir, "report.md"), markdown(report));
  console.log(
    JSON.stringify(
      { wholeLabel: report.wholeLabelSummary, boundedBrand: report.boundedBrandSummary },
      null,
      2,
    ),
  );
  console.log(`Wrote ${path.join(outDir, "report.json")}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
  process.exitCode = 1;
});
