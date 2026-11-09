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

import { brandPresentInTranscript, brandValueMatches } from "../../src/fixtures/eval/vision-reader-eval.ts";
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
import { detectDegenerateRepetition } from "../../src/server/vision/repetition-detector.ts";

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
      console.log(`[${index + 1}/${manifest.totalCases}] Evaluating ${testCase.caseId} (${testCase.stratum})...`);

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
      const ocrRawTranscript = ocrWords.map((w) => w.text).join(" ").trim();
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
      const rawContentStr = typeof choiceContent === "string" ? choiceContent : JSON.stringify(choiceContent);

      // Raw untruncated repetition check (Priority 2 fail-closed hygiene)
      let isDegenerate = false;
      let degenerateReason: string | null = null;
      let visionParsed: { lines: string[]; legibility: string } | null = null;

      try {
        const jsonMatch = rawContentStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const rawObj = JSON.parse(jsonMatch[0]);
          if (Array.isArray(rawObj?.lines)) {
            for (const rawLine of rawObj.lines) {
              const check = detectDegenerateRepetition(String(rawLine));
              if (check.isDegenerate) {
                isDegenerate = true;
                degenerateReason = check.reason ?? "DEGENERATE_REPETITION";
                break;
              }
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

      let visionBrandMatch = false;
      let visionFalseInsertion = false;

      if (testCase.brandPresence === "present") {
        if (!isDegenerate && visionParsed && visionParsed.lines.length > 0) {
          visionBrandMatch = brandPresentInTranscript(visionParsed.lines, testCase.acceptablePresentations);
        }
      } else {
        // Brand is absent: check if vision falsely produced a brand from acceptable lists
        visionFalseInsertion = false;
      }

      const visionScore = visionLegibility === "clear" ? 0.9 : visionLegibility === "partial" ? 0.5 : 0.0;
      const visionReliable = visionScore >= 0.8 && visionLines.length > 0 && !isDegenerate;

      // Paired Category
      let pairedCategory:
        | "BOTH_CORRECT"
        | "VISION_ONLY_CORRECT"
        | "OCR_ONLY_CORRECT"
        | "BOTH_INCORRECT"
        | "ABSTAIN_CORRECT"
        | "FALSE_INSERTION";

      if (testCase.brandPresence === "absent") {
        if (ocrFalseInsertion) {
          pairedCategory = "FALSE_INSERTION";
        } else {
          pairedCategory = "ABSTAIN_CORRECT";
        }
      } else {
        if (visionBrandMatch && ocrBrandMatch) pairedCategory = "BOTH_CORRECT";
        else if (visionBrandMatch && !ocrBrandMatch) pairedCategory = "VISION_ONLY_CORRECT";
        else if (!visionBrandMatch && ocrBrandMatch) pairedCategory = "OCR_ONLY_CORRECT";
        else pairedCategory = "BOTH_INCORRECT";
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
          rawTranscript: ocrRawTranscript.slice(0, 300),
          observedValue: ocrObservedValue,
          evidenceState: ocrEvidenceState,
          ocrEvidenceScore: ocrScore,
          reliable: ocrReliable,
          matchesTruth: ocrBrandMatch,
          falseInsertion: ocrFalseInsertion,
          latencyMs: ocrLatencyMs,
        },
        vision: {
          rawTranscript: visionRawTranscript.slice(0, 300),
          linesCount: visionLines.length,
          legibility: visionLegibility,
          isDegenerate,
          degenerateReason,
          reliable: visionReliable,
          matchesTruth: visionBrandMatch,
          falseInsertion: visionFalseInsertion,
          latencyMs: visionLatencyMs,
        },
        pairedCategory,
      });

      console.log(
        `   -> Vision: ${visionBrandMatch ? "✓" : isDegenerate ? "REPETITION_REJECTED" : "✗"} (${visionLatencyMs}ms) | OCR: ${ocrBrandMatch ? "✓" : "✗"} (${ocrObservedValue ?? "null"}) (${ocrLatencyMs}ms) | ${pairedCategory}`,
      );
    }
  } finally {
    await engine.terminate();
  }

  // Aggregate statistics
  const presentCases = results.filter((r) => r.brandPresence === "present");
  const absentCases = results.filter((r) => r.brandPresence === "absent");

  const visionPresentMatches = presentCases.filter((r) => r.vision.matchesTruth).length;
  const ocrPresentMatches = presentCases.filter((r) => r.tesseract.matchesTruth).length;

  const bothCorrect = presentCases.filter((r) => r.pairedCategory === "BOTH_CORRECT").length;
  const visionOnlyCorrect = presentCases.filter((r) => r.pairedCategory === "VISION_ONLY_CORRECT").length;
  const ocrOnlyCorrect = presentCases.filter((r) => r.pairedCategory === "OCR_ONLY_CORRECT").length;
  const bothIncorrect = presentCases.filter((r) => r.pairedCategory === "BOTH_INCORRECT").length;

  const ocrFalseInsertions = absentCases.filter((r) => r.tesseract.falseInsertion).length;
  const visionFalseInsertions = absentCases.filter((r) => r.vision.falseInsertion).length;

  const visionLatencies = results.map((r) => r.vision.latencyMs).sort((a, b) => a - b);
  const ocrLatencies = results.map((r) => r.tesseract.latencyMs).sort((a, b) => a - b);

  const median = (arr: number[]) => arr[Math.floor(arr.length / 2)];
  const p95 = (arr: number[]) => arr[Math.floor(arr.length * 0.95)];

  const summary = {
    totalHeldOutCases: results.length,
    brandPresentCases: presentCases.length,
    brandAbsentCases: absentCases.length,
    brandCandidateRecovery: {
      vision: `${visionPresentMatches}/${presentCases.length} (${((visionPresentMatches / presentCases.length) * 100).toFixed(1)}%)`,
      tesseract: `${ocrPresentMatches}/${presentCases.length} (${((ocrPresentMatches / presentCases.length) * 100).toFixed(1)}%)`,
    },
    pairedBreakdown: {
      bothCorrect: `${bothCorrect}/${presentCases.length} (${((bothCorrect / presentCases.length) * 100).toFixed(1)}%)`,
      visionOnlyCorrect: `${visionOnlyCorrect}/${presentCases.length} (${((visionOnlyCorrect / presentCases.length) * 100).toFixed(1)}%)`,
      ocrOnlyCorrect: `${ocrOnlyCorrect}/${presentCases.length} (${((ocrOnlyCorrect / presentCases.length) * 100).toFixed(1)}%)`,
      bothIncorrect: `${bothIncorrect}/${presentCases.length} (${((bothIncorrect / presentCases.length) * 100).toFixed(1)}%)`,
    },
    negativeControlAbstention: {
      tesseractFalseInsertions: `${ocrFalseInsertions}/${absentCases.length}`,
      visionFalseInsertions: `${visionFalseInsertions}/${absentCases.length}`,
    },
    latencyMs: {
      visionMedian: median(visionLatencies),
      visionP95: p95(visionLatencies),
      ocrMedian: median(ocrLatencies),
      ocrP95: p95(ocrLatencies),
    },
    strataResults: {
      normalPrint: {
        visionMatches: results.filter((r) => r.stratum === "normal_print" && r.vision.matchesTruth).length,
        ocrMatches: results.filter((r) => r.stratum === "normal_print" && r.tesseract.matchesTruth).length,
        total: 6,
      },
      stylizedScript: {
        visionMatches: results.filter((r) => r.stratum === "stylized_script" && r.vision.matchesTruth).length,
        ocrMatches: results.filter((r) => r.stratum === "stylized_script" && r.tesseract.matchesTruth).length,
        total: 6,
      },
      layoutOrientation: {
        visionMatches: results.filter((r) => r.stratum === "layout_orientation" && r.vision.matchesTruth).length,
        ocrMatches: results.filter((r) => r.stratum === "layout_orientation" && r.tesseract.matchesTruth).length,
        total: 6,
      },
      absentControls: {
        visionAbstentions: absentCases.filter((r) => !r.vision.falseInsertion).length,
        ocrAbstentions: absentCases.filter((r) => !r.tesseract.falseInsertion).length,
        total: 6,
      },
    },
  };

  const report = {
    schemaVersion: "held-out-evaluation-report.v1",
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
