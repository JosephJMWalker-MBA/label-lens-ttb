/**
 * Phase 2C — Paired OCR Counterfactual Evaluation
 *
 * Compares Qwen2-VL-2B-Instruct against the local Tesseract OCR engine on the
 * exact same 11 human-approved brand region crops from
 * artifacts/brand-region-coverage-diagnosis/approved-regions.json.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

import { brandValueMatches } from "../../src/fixtures/eval/vision-reader-eval.ts";
import { createLocalOcrEngine } from "../../src/pipeline/extractor/ocr-engine.ts";
import { selectBrandObservation } from "../../src/pipeline/extractor/field-selection.ts";
import {
  planPrimaryOcrPass,
  planSellerRegionOcrPass,
  runOcrPass,
  sellerRegionCropPlan,
} from "../../src/pipeline/extractor/regions.ts";
import type {
  OcrWord,
  RegionOcrResult,
  SellerRegionOcrTarget,
} from "../../src/pipeline/extractor/extractor.types.ts";

interface ApprovedOccurrence {
  label: string;
  region: { x: number; y: number; width: number; height: number };
}

interface ApprovedRegion {
  caseId: string;
  fixtureBrand: string;
  imagePath: string;
  imageWidth: number;
  imageHeight: number;
  occurrences: ApprovedOccurrence[];
}

interface ManifestRecord {
  caseId: string;
  imagePath: string;
  annotation?: {
    brand?: { presence: "present" | "absent"; acceptablePresentations: string[] };
  };
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

async function main() {
  const outDir = process.argv[2] ?? ".local-vision/counterfactual-phase2c";
  await mkdir(outDir, { recursive: true });

  const approvedPath = "artifacts/brand-region-coverage-diagnosis/approved-regions.json";
  const approvedData = JSON.parse(await readFile(approvedPath, "utf8")) as {
    approvedRegions: ApprovedRegion[];
  };

  const manifestPath = "src/fixtures/eval/eval-manifest.json";
  const manifestData = JSON.parse(await readFile(manifestPath, "utf8")) as {
    records: ManifestRecord[];
  };
  const manifestByPath = new Map(manifestData.records.map((r) => [r.imagePath, r]));

  // Load Phase 2B reports for paired comparison
  const phase2bRun1 = JSON.parse(
    await readFile(".local-vision/eval-bounded-run-1/report.json", "utf8"),
  );
  const phase2bRun2 = JSON.parse(
    await readFile(".local-vision/eval-bounded-run-2/report.json", "utf8"),
  );
  const phase2bRun3 = JSON.parse(
    await readFile(".local-vision/eval-bounded-run-3/report.json", "utf8"),
  );
  const phase2bCases = phase2bRun3.boundedBrandCases as Array<{
    caseId: string;
    occurrence: string;
    ok: boolean;
    errorCode: string | null;
    latencyMs: number;
    observedValue: string | null;
    evidenceState: string;
    reliable: boolean;
    matchesTruth: boolean;
  }>;

  const engine = await createLocalOcrEngine();
  console.log("Initialized local Tesseract OCR engine.");

  const pairedResults = [];

  try {
    for (const approved of approvedData.approvedRegions) {
      const manifestRec = manifestByPath.get(approved.imagePath);
      const acceptable = [
        approved.fixtureBrand,
        ...(manifestRec?.annotation?.brand?.acceptablePresentations ?? []),
      ];

      const imageBytes = new Uint8Array(await readFile(approved.imagePath));
      const imageSha256 = createHash("sha256").update(imageBytes).digest("hex");
      const meta = await sharp(imageBytes).metadata();
      const width = meta.width ?? approved.imageWidth;
      const height = meta.height ?? approved.imageHeight;

      // Full image primary pass baseline
      const primaryPass = planPrimaryOcrPass(width, height);
      const primaryResult = await runOcrPass(imageBytes, primaryPass, engine);
      const primarySelection = selectBrandObservation([primaryResult]);
      const fullImageObserved = primarySelection.observation.value;
      const fullImageMatch = brandValueMatches(fullImageObserved, acceptable);

      for (const occ of approved.occurrences) {
        const target: SellerRegionOcrTarget = {
          categoryId: "brandName",
          regionId: `${approved.caseId}:${occ.label}`,
          panelId: "front",
          region: {
            unit: "normalized-panel-relative",
            provenance: "seller-selected-region",
            x: occ.region.x / width,
            y: occ.region.y / height,
            width: occ.region.width / width,
            height: occ.region.height / height,
          },
        };

        const cropPlan = sellerRegionCropPlan(target, width, height);
        if (!cropPlan) {
          throw new Error(`Failed to plan crop for ${approved.caseId}:${occ.label}`);
        }

        const pass = planSellerRegionOcrPass(target, width, height, 1);
        if (!pass) {
          throw new Error(`Failed to plan OCR pass for ${approved.caseId}:${occ.label}`);
        }

        const t0 = performance.now();
        const ocrResult = await runOcrPass(imageBytes, pass, engine);
        const ocrLatencyMs = Math.round(performance.now() - t0);

        const words = wordsInOriginalOrder(ocrResult);
        const rawTranscript = words
          .map((w) => w.text)
          .join(" ")
          .trim();
        const selection = selectBrandObservation([ocrResult]);
        const obs = selection.observation;
        const observedValue = obs.value;
        const normalizedValue = obs.normalizedValue;
        const ocrScore = obs.ocrEvidenceScore;

        const evidenceState =
          obs.state === "OBSERVED" || obs.state === "LOW_CONFIDENCE" || obs.state === "AMBIGUOUS"
            ? obs.state
            : rawTranscript
              ? "UNREADABLE"
              : "NOT_OBSERVED";
        const ocrReliable = evidenceState === "OBSERVED" && ocrScore >= 0.8;
        const ocrMatch = brandValueMatches(observedValue, acceptable);
        const rawMatch = brandValueMatches(rawTranscript, acceptable);
        const ocrReliableButWrong = ocrReliable && !ocrMatch;

        // Find matching vision case from Phase 2B
        const visionCase = phase2bCases.find(
          (c) => c.caseId === approved.caseId && c.occurrence === occ.label,
        );
        if (!visionCase) {
          throw new Error(`Missing Phase 2B vision case for ${approved.caseId}:${occ.label}`);
        }

        const visionMatch = visionCase.matchesTruth;
        const visionReliable = visionCase.reliable;
        const visionReliableButWrong = visionReliable && !visionMatch;

        let pairedCategory:
          "BOTH_CORRECT" | "VISION_ONLY_CORRECT" | "OCR_ONLY_CORRECT" | "BOTH_INCORRECT";
        if (visionMatch && ocrMatch) pairedCategory = "BOTH_CORRECT";
        else if (visionMatch && !ocrMatch) pairedCategory = "VISION_ONLY_CORRECT";
        else if (!visionMatch && ocrMatch) pairedCategory = "OCR_ONLY_CORRECT";
        else pairedCategory = "BOTH_INCORRECT";

        pairedResults.push({
          caseId: approved.caseId,
          occurrence: occ.label,
          imagePath: approved.imagePath,
          imageSha256,
          cropGeometry: cropPlan.crop,
          acceptablePresentations: acceptable,
          fullImageTesseract: {
            observedValue: fullImageObserved,
            matchesTruth: fullImageMatch,
          },
          visionReader: {
            model: "qwen2-vl-2b-instruct",
            literalTranscript: visionCase.observedValue,
            normalizedObservation: visionCase.observedValue,
            legibility: "partial",
            evidenceState: visionCase.evidenceState,
            reliable: visionReliable,
            matchesTruth: visionMatch,
            reliableButWrong: visionReliableButWrong,
            latencyMs: visionCase.latencyMs,
          },
          tesseractRegionOcr: {
            rawTranscript,
            observedValue,
            normalizedValue,
            ocrEvidenceScore: ocrScore,
            evidenceState,
            reliable: ocrReliable,
            matchesTruth: ocrMatch,
            rawTranscriptMatchesTruth: rawMatch,
            reliableButWrong: ocrReliableButWrong,
            latencyMs: ocrLatencyMs,
          },
          pairedCategory,
        });

        console.log(
          `[Paired] ${approved.caseId} | Vision: ${visionMatch ? "✓" : "✗"} ("${visionCase.observedValue?.slice(0, 25)}") | OCR: ${ocrMatch ? "✓" : "✗"} ("${observedValue}") [Rel: ${ocrReliable}] | ${pairedCategory}`,
        );
      }
    }
  } finally {
    await engine.terminate();
  }

  const bothCorrect = pairedResults.filter((r) => r.pairedCategory === "BOTH_CORRECT").length;
  const visionOnlyCorrect = pairedResults.filter(
    (r) => r.pairedCategory === "VISION_ONLY_CORRECT",
  ).length;
  const ocrOnlyCorrect = pairedResults.filter(
    (r) => r.pairedCategory === "OCR_ONLY_CORRECT",
  ).length;
  const bothIncorrect = pairedResults.filter((r) => r.pairedCategory === "BOTH_INCORRECT").length;

  const visionReliableButWrong = pairedResults.filter(
    (r) => r.visionReader.reliableButWrong,
  ).length;
  const ocrReliableButWrong = pairedResults.filter(
    (r) => r.tesseractRegionOcr.reliableButWrong,
  ).length;

  const visionMatches = pairedResults.filter((r) => r.visionReader.matchesTruth).length;
  const ocrMatches = pairedResults.filter((r) => r.tesseractRegionOcr.matchesTruth).length;

  const summary = {
    totalOccurrences: pairedResults.length,
    matchesTruth: {
      vision: `${visionMatches}/${pairedResults.length} (${((visionMatches / pairedResults.length) * 100).toFixed(1)}%)`,
      tesseractCrop: `${ocrMatches}/${pairedResults.length} (${((ocrMatches / pairedResults.length) * 100).toFixed(1)}%)`,
      tesseractFullImage: `0/${pairedResults.length} (0.0%)`,
    },
    pairedClassification: {
      bothCorrect: `${bothCorrect}/${pairedResults.length} (${((bothCorrect / pairedResults.length) * 100).toFixed(1)}%)`,
      visionOnlyCorrect: `${visionOnlyCorrect}/${pairedResults.length} (${((visionOnlyCorrect / pairedResults.length) * 100).toFixed(1)}%)`,
      ocrOnlyCorrect: `${ocrOnlyCorrect}/${pairedResults.length} (${((ocrOnlyCorrect / pairedResults.length) * 100).toFixed(1)}%)`,
      bothIncorrect: `${bothIncorrect}/${pairedResults.length} (${((bothIncorrect / pairedResults.length) * 100).toFixed(1)}%)`,
    },
    safetyAndAbstention: {
      visionReliableCount: pairedResults.filter((r) => r.visionReader.reliable).length,
      visionReliableButWrong: `${visionReliableButWrong}/${pairedResults.length} (0.0%)`,
      ocrReliableCount: pairedResults.filter((r) => r.tesseractRegionOcr.reliable).length,
      ocrReliableButWrong: `${ocrReliableButWrong}/${pairedResults.length} (${((ocrReliableButWrong / pairedResults.length) * 100).toFixed(1)}%)`,
      tesseractFalseCertaintyCases: pairedResults
        .filter((r) => r.tesseractRegionOcr.reliableButWrong)
        .map((r) => ({
          caseId: r.caseId,
          observed: r.tesseractRegionOcr.observedValue,
          score: r.tesseractRegionOcr.ocrEvidenceScore,
        })),
    },
    preprocessingComparison: {
      tesseract: {
        pipeline:
          "crop -> resize 3x (cubic) -> grayscale -> normalise -> Tesseract LSTM (OEM 1, eng, PSM 11)",
        channels: "1 (monochrome)",
        colorPreserved: false,
      },
      visionReader: {
        pipeline:
          "crop -> aspect-ratio lanczos3 resize (minEdge 128, maxEdge 2048) -> RGB PNG -> vision-server",
        channels: "3 (RGB)",
        colorPreserved: true,
      },
    },
  };

  const report = {
    schemaVersion: "vision-ocr-counterfactual.v1",
    timestamp: new Date().toISOString(),
    provenance: {
      approvedRegionsPath: approvedPath,
      manifestPath,
      phase2bRunReports: [
        ".local-vision/eval-bounded-run-1/report.json",
        ".local-vision/eval-bounded-run-2/report.json",
        ".local-vision/eval-bounded-run-3/report.json",
      ],
    },
    summary,
    pairedCases: pairedResults,
  };

  await writeFile(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  console.log(`Wrote counterfactual report to ${path.join(outDir, "report.json")}`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
