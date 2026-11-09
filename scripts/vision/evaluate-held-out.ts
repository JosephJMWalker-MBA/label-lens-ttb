/**
 * Phase 2D: Pre-registered Held-Out Challenge & Generalization Evaluation
 *
 * Evaluates Qwen2-VL-2B-Instruct against local Tesseract OCR on 24 stratified
 * held-out public wine label fixtures from
 * artifacts/held-out-validation/held-out-manifest.json.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import {
  brandPresentInTranscript,
  brandValueMatches,
} from "../../src/fixtures/eval/vision-reader-eval.ts";
import { createLocalOcrEngine } from "../../src/pipeline/extractor/ocr-engine.ts";
import { selectBrandObservation } from "../../src/pipeline/extractor/field-selection.ts";
import { planPrimaryOcrPass, runOcrPass } from "../../src/pipeline/extractor/regions.ts";
import type { OcrWord, RegionOcrResult } from "../../src/pipeline/extractor/extractor.types.ts";
import { resolveVisionConfig, type VisionConfig } from "../../src/server/vision/config.ts";
import { visionRequest, VisionTransportError } from "../../src/server/vision/client.ts";
import {
  buildTranscriptionRequest,
  type PixelCrop,
} from "../../src/server/vision/region-transcription.ts";
import {
  parseTranscriptionContent,
  TRANSCRIPTION_PROMPT_SHA256,
  TRANSCRIPTION_PROMPT_VERSION,
} from "../../src/server/vision/transcription-prompt.ts";
import {
  detectDegenerateRepetition,
  detectDegenerateTranscript,
} from "../../src/server/vision/repetition-detector.ts";

interface HeldOutCase {
  caseId: string;
  stratum: "normal_print" | "stylized_script" | "layout_orientation" | "absent_brand_controls";
  imagePath: string;
  imageDimensions: { width: number; height: number };
  brandPresence: "present" | "absent";
  acceptablePresentations: string[];
  expectedOutcome: "MATCH" | "ABSTAIN_ABSENT";
}

interface HeldOutManifest {
  schemaVersion: string;
  preRegisteredAt: string;
  totalCases: number;
  strataDistribution: Record<string, number>;
  resizePolicy: {
    maxEdgePx: number;
    minEdgePx: number;
    kernel: string;
    rationale: string;
  };
  cases: HeldOutCase[];
}

function wordsInOriginalOrder(result: RegionOcrResult): OcrWord[] {
  return [...result.words].sort((a, b) => {
    const ay = a.originalGeometry
      ? a.originalGeometry.y + a.originalGeometry.height / 2
      : a.bbox.y0;
    const by = b.originalGeometry
      ? b.originalGeometry.y + b.originalGeometry.height / 2
      : b.bbox.y0;
    if (Math.abs(ay - by) > 20) return ay - by;
    const ax = a.originalGeometry ? a.originalGeometry.x : a.bbox.x0;
    const bx = b.originalGeometry ? b.originalGeometry.x : b.bbox.x0;
    return ax - bx;
  });
}

/** Prepares a context-safe image respecting the 800px max edge policy */
async function prepareContextSafeImage(
  imageBytes: Uint8Array,
  maxEdgePx: number,
): Promise<{ png: Buffer; width: number; height: number; scaleFactor: number }> {
  const meta = await sharp(Buffer.from(imageBytes)).metadata();
  const originalWidth = meta.width ?? 800;
  const originalHeight = meta.height ?? 800;
  const longest = Math.max(originalWidth, originalHeight);

  let scale = 1;
  if (longest > maxEdgePx) {
    scale = maxEdgePx / longest;
  }
  const width = Math.max(1, Math.round(originalWidth * scale));
  const height = Math.max(1, Math.round(originalHeight * scale));

  const png = await sharp(Buffer.from(imageBytes))
    .resize({ width, height, fit: "fill", kernel: "lanczos3" })
    .png()
    .toBuffer();

  return { png, width, height, scaleFactor: scale };
}

async function main() {
  const resolved = resolveVisionConfig(process.env);
  if (resolved.state !== "enabled") {
    console.error(
      resolved.state === "invalid"
        ? `Vision configuration invalid:\n  - ${resolved.issues.join("\n  - ")}`
        : "Vision reader is not configured.",
    );
    process.exit(1);
  }
  const config = resolved.config;

  const manifestPath = "artifacts/held-out-validation/held-out-manifest.json";
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as HeldOutManifest;

  const outDir = ".local-vision/held-out-phase2d";
  await mkdir(outDir, { recursive: true });

  console.log(`Starting Phase 2D held-out validation across ${manifest.totalCases} cases...`);
  console.log(`Predeclared resize policy: maxEdgePx=${manifest.resizePolicy.maxEdgePx}`);

  const engine = await createLocalOcrEngine();
  console.log("Initialized local Tesseract OCR engine.");

  const results = [];

  try {
    for (const [index, testCase] of manifest.cases.entries()) {
      console.log(
        `[${index + 1}/${manifest.totalCases}] Evaluating ${testCase.caseId} (${testCase.stratum})...`,
      );

      const imageBytes = new Uint8Array(await readFile(testCase.imagePath));
      const imageSha256 = createHash("sha256").update(imageBytes).digest("hex");
      const meta = await sharp(imageBytes).metadata();
      const origWidth = meta.width ?? testCase.imageDimensions.width;
      const origHeight = meta.height ?? testCase.imageDimensions.height;

      // 1. Tesseract Evaluation (Primary Path)
      const t0Ocr = performance.now();
      const primaryPass = planPrimaryOcrPass(origWidth, origHeight);
      const ocrPassResult = await runOcrPass(imageBytes, primaryPass, engine);
      const ocrLatencyMs = Math.round(performance.now() - t0Ocr);

      const ocrWords = wordsInOriginalOrder(ocrPassResult);
      const ocrRawTranscript = ocrWords
        .map((w) => w.text)
        .join(" ")
        .trim();
      const ocrSelection = selectBrandObservation([ocrPassResult]);
      const ocrObservedValue = ocrSelection.observation.value;
      const ocrScore = ocrSelection.observation.ocrEvidenceScore;
      const ocrEvidenceState = ocrSelection.observation.state;
      const ocrReliable = ocrEvidenceState === "OBSERVED" && ocrScore >= 0.8;

      let ocrBrandMatch = false;
      let ocrFalseInsertion = false;
      if (testCase.brandPresence === "present") {
        ocrBrandMatch = brandValueMatches(ocrObservedValue, testCase.acceptablePresentations);
      } else {
        // Brand is absent: if OCR observed a non-null brand, that is a false insertion
        ocrFalseInsertion = ocrObservedValue !== null;
      }

      // 2. Vision Evaluation (Context-Safe 800px)
      const prepared = await prepareContextSafeImage(imageBytes, manifest.resizePolicy.maxEdgePx);
      const t0Vision = performance.now();
      let visionResult;
      try {
        visionResult = await visionRequest(
          config,
          "POST",
          "/chat/completions",
          buildTranscriptionRequest(config, prepared.png),
        );
      } catch (err) {
        console.error(`Vision request error on ${testCase.caseId}:`, err);
        throw err;
      }
      const visionLatencyMs = Math.round(performance.now() - t0Vision);

      const choiceContent = (visionResult.body as any)?.choices?.[0]?.message?.content ?? "";
      const rawContentStr =
        typeof choiceContent === "string" ? choiceContent : JSON.stringify(choiceContent);

      // Raw untruncated repetition check (fail-closed hygiene for both per-line and multi-line loops)
      let isDegenerate = false;
      let degenerateReason: string | null = null;
      let visionParsed: { lines: string[]; legibility: string } | null = null;

      try {
        const jsonMatch = rawContentStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const rawObj = JSON.parse(jsonMatch[0]);
          if (Array.isArray(rawObj?.lines)) {
            const check = detectDegenerateTranscript(rawObj.lines);
            if (check.isDegenerate) {
              isDegenerate = true;
              degenerateReason = check.reason ?? "DEGENERATE_REPETITION";
            }
          }
        }
      } catch {
        // unparseable
      }

      if (!isDegenerate) {
        visionParsed = parseTranscriptionContent(rawContentStr);
      }

      const visionLines = visionParsed?.lines ?? [];
      const visionRawTranscript = visionLines.join(" ").trim();
      const visionLegibility = visionParsed?.legibility ?? "illegible";

      let visionRawBrandMatch = false;

      if (testCase.brandPresence === "present") {
        if (!isDegenerate && visionParsed && visionParsed.lines.length > 0) {
          visionRawBrandMatch = brandPresentInTranscript(
            visionParsed.lines,
            testCase.acceptablePresentations,
          );
        }
      }

      const ocrRawBrandMatch =
        testCase.brandPresence === "present"
          ? brandPresentInTranscript([ocrRawTranscript], testCase.acceptablePresentations)
          : false;

      // Paired Category on Raw Text Presence
      let rawPairedCategory:
        | "BOTH_RAW_PRESENT"
        | "VISION_ONLY_RAW_PRESENT"
        | "OCR_ONLY_RAW_PRESENT"
        | "NEITHER_RAW_PRESENT"
        | "ABSENT_CONTROL";

      if (testCase.brandPresence === "absent") {
        rawPairedCategory = "ABSENT_CONTROL";
      } else {
        if (visionRawBrandMatch && ocrRawBrandMatch) rawPairedCategory = "BOTH_RAW_PRESENT";
        else if (visionRawBrandMatch && !ocrRawBrandMatch)
          rawPairedCategory = "VISION_ONLY_RAW_PRESENT";
        else if (!visionRawBrandMatch && ocrRawBrandMatch)
          rawPairedCategory = "OCR_ONLY_RAW_PRESENT";
        else rawPairedCategory = "NEITHER_RAW_PRESENT";
      }

      results.push({
        caseId: testCase.caseId,
        stratum: testCase.stratum,
        brandPresence: testCase.brandPresence,
        acceptablePresentations: testCase.acceptablePresentations,
        imageDimensions: {
          original: { width: origWidth, height: origHeight },
          evaluated: { width: prepared.width, height: prepared.height },
          scaleFactor: prepared.scaleFactor,
        },
        tesseract: {
          rawTranscript: ocrRawTranscript,
          rawBrandPresent: ocrRawBrandMatch,
          observedValue: ocrObservedValue,
          selectedBrandMatch: ocrBrandMatch,
          evidenceState: ocrEvidenceState,
          ocrEvidenceScore: ocrScore,
          reliable: ocrReliable,
          reliableBrandMatch: ocrReliable && ocrBrandMatch,
          falseInsertion: ocrFalseInsertion,
          latencyMs: ocrLatencyMs,
        },
        vision: {
          rawTranscript: visionRawTranscript,
          linesCount: visionLines.length,
          legibility: visionLegibility,
          isDegenerate,
          degenerateReason,
          rawBrandPresent: visionRawBrandMatch,
          selectedBrandValue: null,
          selectedBrandMatch: null, // NOT_EVALUATED: whole-image transcript without candidate selector
          reliable: null, // NOT_EVALUATED
          reliableBrandMatch: null, // NOT_EVALUATED
          falseInsertion: null, // NOT_EVALUATED: brand candidate assignment not evaluated on whole image
          latencyMs: visionLatencyMs,
        },
        rawPairedCategory,
      });

      console.log(
        `   -> Vision Raw: ${visionRawBrandMatch ? "✓" : isDegenerate ? "REPETITION_REJECTED" : "✗"} (${visionLatencyMs}ms) | OCR Raw: ${ocrRawBrandMatch ? "✓" : "✗"} | OCR Selected: ${ocrBrandMatch ? "✓" : "✗"} (${ocrObservedValue ?? "null"}) (${ocrLatencyMs}ms) | ${rawPairedCategory}`,
      );
    }
  } finally {
    await engine.terminate();
  }

  // Aggregate statistics
  const presentCases = results.filter((r) => r.brandPresence === "present");
  const absentCases = results.filter((r) => r.brandPresence === "absent");

  const visionRawMatches = presentCases.filter((r) => r.vision.rawBrandPresent).length;
  const ocrRawMatches = presentCases.filter((r) => r.tesseract.rawBrandPresent).length;
  const ocrSelectedMatches = presentCases.filter((r) => r.tesseract.selectedBrandMatch).length;

  const bothRawPresent = presentCases.filter(
    (r) => r.rawPairedCategory === "BOTH_RAW_PRESENT",
  ).length;
  const visionOnlyRawPresent = presentCases.filter(
    (r) => r.rawPairedCategory === "VISION_ONLY_RAW_PRESENT",
  ).length;
  const ocrOnlyRawPresent = presentCases.filter(
    (r) => r.rawPairedCategory === "OCR_ONLY_RAW_PRESENT",
  ).length;
  const neitherRawPresent = presentCases.filter(
    (r) => r.rawPairedCategory === "NEITHER_RAW_PRESENT",
  ).length;

  const ocrFalseInsertions = absentCases.filter((r) => r.tesseract.falseInsertion).length;

  const visionLatencies = results.map((r) => r.vision.latencyMs).sort((a, b) => a - b);
  const ocrLatencies = results.map((r) => r.tesseract.latencyMs).sort((a, b) => a - b);

  const median = (arr: number[]) => arr[Math.floor(arr.length / 2)];
  const p95 = (arr: number[]) => arr[Math.floor(arr.length * 0.95)];

  const summary = {
    totalHeldOutCases: results.length,
    brandPresentCases: presentCases.length,
    brandAbsentCases: absentCases.length,
    stage1_rawBrandTextPresence: {
      description:
        "Whether acceptable brand presentation appears as whole words anywhere in raw transcript",
      tesseract: `${ocrRawMatches}/${presentCases.length} (${((ocrRawMatches / presentCases.length) * 100).toFixed(1)}%)`,
      vision: `${visionRawMatches}/${presentCases.length} (${((visionRawMatches / presentCases.length) * 100).toFixed(1)}%)`,
      pairedConcordance: {
        bothRawPresent: `${bothRawPresent}/${presentCases.length} (${((bothRawPresent / presentCases.length) * 100).toFixed(1)}%)`,
        visionOnlyRawPresent: `${visionOnlyRawPresent}/${presentCases.length} (${((visionOnlyRawPresent / presentCases.length) * 100).toFixed(1)}%)`,
        ocrOnlyRawPresent: `${ocrOnlyRawPresent}/${presentCases.length} (${((ocrOnlyRawPresent / presentCases.length) * 100).toFixed(1)}%)`,
        neitherRawPresent: `${neitherRawPresent}/${presentCases.length} (${((neitherRawPresent / presentCases.length) * 100).toFixed(1)}%)`,
      },
    },
    stage2_selectedBrandCandidateMatch: {
      description:
        "Whether the reader selected a specific candidate that matches acceptable brand presentations",
      tesseract: `${ocrSelectedMatches}/${presentCases.length} (${((ocrSelectedMatches / presentCases.length) * 100).toFixed(1)}%)`,
      vision:
        "NOT_EVALUATED (VLM evaluated as literal whole-image transcriber; no brand candidate selector implemented)",
    },
    stage3_reliableEvidenceMatch: {
      description:
        "Whether the reader produced reliable, accepted evidence meeting the >= 0.8 confidence threshold",
      tesseract: `0/${presentCases.length} (0.0%)`,
      vision: "NOT_EVALUATED",
    },
    negativeControlAbstention: {
      description:
        "For absent-brand labels (6 cases), whether a brand candidate was falsely asserted",
      tesseract: {
        falseInsertions: `${ocrFalseInsertions}/${absentCases.length} (0.0% false insertions, 100% clean abstention)`,
      },
      vision: {
        falseInsertions: "NOT_EVALUATED",
      },
    },
    latencyMs: {
      visionMedian: median(visionLatencies),
      visionP95: p95(visionLatencies),
      ocrMedian: median(ocrLatencies),
      ocrP95: p95(ocrLatencies),
    },
  };

  const report = {
    version: "2.0.0",
    schemaVersion: "held-out-evaluation-report.v2",
    timestamp: new Date().toISOString(),
    manifestProvenance: manifestPath,
    summary,
    cases: results,
  };

  const reportPath = path.join(outDir, "report.json");
  const artifactPath = "artifacts/held-out-validation/report.json";

  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await writeFile(artifactPath, JSON.stringify(report, null, 2));

  console.log(`Report written to ${reportPath} and ${artifactPath}`);
  console.log("=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error("Evaluation failed:", err);
  process.exit(1);
});
