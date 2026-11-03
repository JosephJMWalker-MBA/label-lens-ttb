import { parseWineAlcoholStatement } from "@/domain/rules/wine-alcohol-parse";
import type {
  SellerRegionMachineReading,
  SellerRegionOcrTarget,
  SellerRegionReadingState,
} from "@/pipeline/extractor/extractor.types";
import { sellerRegionCropPlan } from "@/pipeline/extractor/regions";

import type { VisionConfig } from "./config";
import { transcribeRegion, type VisionTranscription } from "./region-transcription";
import { TRANSCRIPTION_PROMPT_VERSION } from "./transcription-prompt";

/**
 * Turns literal vision transcripts of seller-marked regions into the same
 * `SellerRegionMachineReading` records local OCR produces, so the rest of the
 * package workflow (two-stream comparison, seller guidance, agent detail,
 * signed exports) consumes them unchanged.
 *
 * The model only ever transcribes. Deciding what the transcript *means* for a
 * field happens here, deterministically:
 *   - brand: the region transcript is the observation (the seller marked it);
 *   - alcohol: the transcript must contain a statement the bounded wine parser
 *     accepts, otherwise there is no observed value.
 */

export const VISION_REGION_ADAPTER_ID = "private-vision-region-reader";
export const VISION_REGION_ADAPTER_VERSION = "1.0.0";

/**
 * Vision models do not return calibrated confidence. The evidence score is a
 * categorical mapping of the model's own legibility statement, chosen so that
 * only a "clear" reading clears the package workflow's 0.8 comparison floor.
 */
const LEGIBILITY_SCORE = { clear: 0.9, partial: 0.5, illegible: 0 } as const;

/** Transport failures that mean the host is unreachable for this request. */
const HOST_DOWN_CODES = new Set(["NETWORK_REFUSED", "CONNECT_FAILED", "TIMEOUT"]);

function findAlcoholStatement(lines: readonly string[]): string | null {
  for (const line of lines) {
    const parsed = parseWineAlcoholStatement(line);
    if (parsed.kind === "direct" || parsed.kind === "range") return line;
  }
  // Statements are sometimes broken across two printed lines ("ALC. 13.5%" / "BY VOL.").
  for (let index = 0; index + 1 < lines.length; index += 1) {
    const joined = `${lines[index]} ${lines[index + 1]}`;
    const parsed = parseWineAlcoholStatement(joined);
    if (parsed.kind === "direct" || parsed.kind === "range") return joined;
  }
  return null;
}

export function sellerRegionReadingFromTranscription(args: {
  target: SellerRegionOcrTarget;
  imageWidth: number;
  imageHeight: number;
  transcription: VisionTranscription;
  processedAt: string;
}): SellerRegionMachineReading | null {
  const { target, imageWidth, imageHeight, transcription } = args;
  const plan = sellerRegionCropPlan(target, imageWidth, imageHeight);
  if (!plan) return null;

  const transcript = transcription.lines.join(" ").trim();
  const isAlcohol = target.categoryId === "alcoholStatement";
  const observedValue = isAlcohol
    ? findAlcoholStatement(transcription.lines)
    : transcript === ""
      ? null
      : transcript;

  let evidenceState: SellerRegionReadingState;
  if (transcript === "") evidenceState = "NOT_OBSERVED";
  else if (observedValue === null || transcription.legibility === "illegible")
    evidenceState = "UNREADABLE";
  else if (transcription.legibility === "partial") evidenceState = "LOW_CONFIDENCE";
  else evidenceState = "OBSERVED";

  const score =
    evidenceState === "OBSERVED" || evidenceState === "LOW_CONFIDENCE"
      ? LEGIBILITY_SCORE[transcription.legibility]
      : 0;
  const reliable = evidenceState === "OBSERVED" && score >= 0.8;

  let failureReason: string | undefined;
  if (evidenceState === "NOT_OBSERVED") {
    failureReason = "The vision reader found no legible text inside the seller-selected region.";
  } else if (evidenceState === "UNREADABLE") {
    failureReason = isAlcohol
      ? "The vision reader transcribed text in the region, but it does not contain an alcohol statement in a supported form."
      : "The vision reader could not read the region clearly enough to transcribe it.";
  }

  return {
    categoryId: target.categoryId,
    regionId: target.regionId,
    panelId: target.panelId,
    sellerRegion: target.region,
    selectedRegionPixelGeometry: {
      ...plan.selectedRegionPixelGeometry,
      imageWidth,
      imageHeight,
    },
    cropPadding: plan.padding,
    scaleFactor: transcription.provenance.sentImageSize.width / Math.max(1, plan.crop.width),
    cropGeometry: { ...plan.crop, imageWidth, imageHeight },
    rawTranscript: transcript,
    observedValue,
    normalizedValue: observedValue,
    ocrEvidenceScore: score,
    evidenceState,
    reliabilityState: reliable ? "RELIABLE" : "UNRELIABLE",
    reliabilityReason: reliable
      ? "The vision reader transcribed the seller-selected region clearly."
      : "The vision reader did not produce a clear, usable value for this region.",
    failureReason,
    observationState: evidenceState,
    reader: "vision-llm",
    visionRead: {
      lines: transcription.lines,
      legibility: transcription.legibility,
      provenance: transcription.provenance,
    },
    passProvenance: null,
    extractionProvenance: {
      extractionAdapterId: VISION_REGION_ADAPTER_ID,
      extractionAdapterVersion: VISION_REGION_ADAPTER_VERSION,
      ocrEngine: {
        kind: "ocr",
        engineId: "openai-compatible-vision",
        engineVersion: TRANSCRIPTION_PROMPT_VERSION,
        modelId: transcription.provenance.configuredModel,
      },
      parserId: isAlcohol ? "wine-alcohol-parse" : "verbatim-region-transcript",
      parserVersion: "1.0.0",
      processedAt: args.processedAt,
    },
  };
}

export interface VisionRegionPassSummary {
  attempted: number;
  read: number;
  fellBack: number;
  hostUnavailable: boolean;
}

/**
 * Read every seller region on one panel with the vision reader. Any region the
 * reader cannot handle keeps its local-OCR reading, annotated with why, so a
 * vision outage degrades the analysis instead of failing it. After the first
 * sign the host is down, remaining regions skip straight to local OCR rather
 * than waiting out one timeout each.
 */
export async function readSellerRegionsWithVision(args: {
  config: VisionConfig;
  imageBytes: Uint8Array;
  imageWidth: number;
  imageHeight: number;
  targets: readonly SellerRegionOcrTarget[];
  localReadings: readonly SellerRegionMachineReading[];
  processedAt: string;
  /** Set when an earlier panel in the same analysis already found the host down. */
  hostUnavailable?: boolean;
  transcribe?: typeof transcribeRegion;
}): Promise<{ readings: SellerRegionMachineReading[]; summary: VisionRegionPassSummary }> {
  const transcribe = args.transcribe ?? transcribeRegion;
  const readings: SellerRegionMachineReading[] = [];
  const summary: VisionRegionPassSummary = {
    attempted: 0,
    read: 0,
    fellBack: 0,
    hostUnavailable: args.hostUnavailable ?? false,
  };

  for (const target of args.targets) {
    const local = args.localReadings.find(
      (reading) => reading.regionId === target.regionId && reading.panelId === target.panelId,
    );
    const fallback = (code: string, message: string): void => {
      summary.fellBack += 1;
      if (local) {
        readings.push({ ...local, reader: "local-ocr", visionFallback: { code, message } });
      }
    };

    const plan = sellerRegionCropPlan(target, args.imageWidth, args.imageHeight);
    if (!plan) {
      // Local OCR already recorded this as an invalid region.
      if (local) readings.push({ ...local, reader: "local-ocr" });
      continue;
    }
    if (summary.hostUnavailable) {
      fallback("HOST_UNAVAILABLE", "The vision host was unreachable earlier in this analysis.");
      continue;
    }

    summary.attempted += 1;
    const result = await transcribe(args.config, args.imageBytes, plan.crop);
    if (!result.ok) {
      if (HOST_DOWN_CODES.has(result.code)) summary.hostUnavailable = true;
      fallback(result.code, result.message);
      continue;
    }
    const reading = sellerRegionReadingFromTranscription({
      target,
      imageWidth: args.imageWidth,
      imageHeight: args.imageHeight,
      transcription: result.value,
      processedAt: args.processedAt,
    });
    if (!reading) {
      fallback("INVALID_CROP", "The region could not be mapped for the vision reader.");
      continue;
    }
    summary.read += 1;
    readings.push(reading);
  }

  return { readings, summary };
}
