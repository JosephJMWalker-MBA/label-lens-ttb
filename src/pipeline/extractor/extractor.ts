import { validateAnalyzerEvidenceResponse } from "@/pipeline/analyzer/analyzer.schema";
import {
  ANALYZER_EVIDENCE_SCHEMA_VERSION,
  type AnalyzerEvidenceResponse,
} from "@/pipeline/analyzer/analyzer.types";
import { err, ok, type Result } from "@/shared/result";

import type { ExtractionError, ExtractionInput } from "./extractor.types";
import {
  selectAlcoholObservation,
  selectBrandObservation,
  type FieldSelection,
} from "./field-selection";
import { verifyAndDecode } from "./image-integrity";
import { createLocalOcrEngine } from "./ocr-engine";
import {
  planPrimaryOcrPass,
  planRecoveryOcrPasses,
  planSellerRegionOcrPass,
  runOcrPass,
  sellerRegionCrop,
  sellerRegionCropPlan,
} from "./regions";
import type {
  RegionOcrResult,
  SellerRegionMachineReading,
  SellerRegionOcrTarget,
} from "./extractor.types";

export interface ExtractionDebug {
  decoded: { width: number; height: number; format: string };
  passes: Awaited<ReturnType<typeof runOcrPass>>[];
  primarySelections: { brand: FieldSelection; alcohol: FieldSelection };
  finalSelections: { brand: FieldSelection; alcohol: FieldSelection };
}

export interface DetailedExtractionResult {
  response: AnalyzerEvidenceResponse;
  debug: ExtractionDebug;
  sellerRegionReadings: SellerRegionMachineReading[];
}

/**
 * The local two-field extractor: image bytes → integrity check → deterministic
 * preprocessing + local OCR → brand/alcohol candidate selection → an
 * evidence-only analyzer response validated by the committed analyzer schema.
 *
 * It emits no rule outcome, never looks up fixture truth by hash/filename, and
 * generates no timestamp or random id — every mutable value is supplied.
 */
export async function extractLabelEvidence(
  input: ExtractionInput,
): Promise<Result<AnalyzerEvidenceResponse, ExtractionError>> {
  const detailed = await extractLabelEvidenceDetailed(input);
  return detailed.ok ? ok(detailed.value.response) : detailed;
}

export async function extractLabelEvidenceDetailed(
  input: ExtractionInput,
): Promise<Result<DetailedExtractionResult, ExtractionError>> {
  const decoded = await verifyAndDecode(input.imageBytes, input.derivativeSha256);
  if (!decoded.ok) {
    input.diagnostics?.fail("image-decoded", {
      layer: "extractor",
      code: decoded.error.code,
      issues: decoded.error.issues,
    });
    return decoded;
  }
  input.diagnostics?.recordDecoded({
    width: decoded.value.width,
    height: decoded.value.height,
  });

  let engine;
  try {
    engine = await createLocalOcrEngine(input.diagnostics);
  } catch (cause) {
    return err({
      code: "OCR_UNAVAILABLE",
      message: "Local OCR engine could not be initialized.",
      issues: [cause instanceof Error ? cause.message : String(cause)],
    });
  }

  let brand: FieldSelection;
  let alcohol: FieldSelection;
  let primaryBrand: FieldSelection;
  let primaryAlcohol: FieldSelection;
  let passes: Awaited<ReturnType<typeof runOcrPass>>[] = [];
  let sellerRegionReadings: SellerRegionMachineReading[] = [];
  try {
    const primaryPass = await runOcrPass(
      input.imageBytes,
      planPrimaryOcrPass(decoded.value.width, decoded.value.height),
      engine,
      input.diagnostics,
    );
    primaryBrand = selectBrandObservation([primaryPass]);
    primaryAlcohol = selectAlcoholObservation([primaryPass]);

    passes = [primaryPass];
    const recoveryPasses = planRecoveryOcrPasses({
      primary: primaryPass,
      needsBrandRecovery: primaryBrand.observation.state === "NOT_OBSERVED",
      needsAlcoholRecovery: primaryAlcohol.observation.state === "NOT_OBSERVED",
    });
    for (const pass of recoveryPasses) {
      passes.push(await runOcrPass(input.imageBytes, pass, engine, input.diagnostics));
    }

    brand =
      primaryBrand.observation.state === "OBSERVED" ? primaryBrand : selectBrandObservation(passes);
    alcohol =
      primaryAlcohol.observation.state === "NOT_OBSERVED"
        ? selectAlcoholObservation(passes)
        : primaryAlcohol;
    sellerRegionReadings = [];
    for (const [targetIndex, target] of (input.sellerRegionTargets ?? []).entries()) {
      const pass = planSellerRegionOcrPass(
        target,
        decoded.value.width,
        decoded.value.height,
        passes.length + targetIndex + 1,
      );
      if (!pass) {
        sellerRegionReadings.push(invalidSellerRegionReading(input, target, decoded.value));
        continue;
      }
      const result = await runOcrPass(input.imageBytes, pass, engine, input.diagnostics);
      const selection =
        target.categoryId === "brandName"
          ? selectBrandObservation([result])
          : selectAlcoholObservation([result]);
      sellerRegionReadings.push(sellerRegionReadingFromSelection(input, target, result, selection));
    }
    input.diagnostics?.reach("field-selection-completed", undefined, { once: true });
  } catch (cause) {
    // A recognition or preprocessing failure after worker creation is a safe,
    // typed failure — never an unhandled throw. The worker is still terminated
    // in the finally below, so no OCR process leaks.
    return err({
      code: "OCR_FAILED",
      message: "Local OCR could not process the image.",
      issues: [cause instanceof Error ? cause.message : String(cause)],
    });
  } finally {
    // Best-effort termination: cleanup never masks the result or throws onward.
    try {
      await engine.terminate();
    } catch {
      // The worker is being discarded regardless; a terminate error is ignored.
    }
  }

  const limitations = provenanceLimitations(brand, alcohol);

  const response: AnalyzerEvidenceResponse = {
    schemaVersion: ANALYZER_EVIDENCE_SCHEMA_VERSION,
    provenance: {
      artifactRef: input.artifactRef,
      derivativeSha256: input.derivativeSha256,
      extractionAdapterId: input.extractionAdapterId,
      extractionAdapterVersion: input.extractionAdapterVersion,
      ocrEngine: input.ocrEngine,
      parserId: input.parserId,
      parserVersion: input.parserVersion,
      processedAt: input.processedAt,
    },
    fields: {
      brandName: brand.observation,
      alcoholStatement: alcohol.observation,
    },
    limitations,
  };

  const validated = validateAnalyzerEvidenceResponse(response);
  if (!validated.ok) {
    input.diagnostics?.fail("analyzer-validation-completed", {
      layer: "extractor",
      code: "INVALID_RESPONSE",
      issues: validated.error.issues,
    });
    return err({
      code: "INVALID_RESPONSE",
      message: "Constructed analyzer response failed evidence-only validation.",
      issues: validated.error.issues,
    });
  }
  input.diagnostics?.reach("analyzer-validation-completed", undefined, { once: true });
  return ok({
    response: validated.value,
    debug: {
      decoded: decoded.value,
      passes,
      primarySelections: { brand: primaryBrand, alcohol: primaryAlcohol },
      finalSelections: { brand, alcohol },
    },
    sellerRegionReadings,
  });
}

function wordsInOriginalOrder(result: RegionOcrResult) {
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

function extractionProvenance(
  input: ExtractionInput,
): SellerRegionMachineReading["extractionProvenance"] {
  return {
    extractionAdapterId: input.extractionAdapterId,
    extractionAdapterVersion: input.extractionAdapterVersion,
    ocrEngine: input.ocrEngine,
    parserId: input.parserId,
    parserVersion: input.parserVersion,
    processedAt: input.processedAt,
  };
}

function invalidSellerRegionReading(
  input: ExtractionInput,
  target: SellerRegionOcrTarget,
  decoded: { width: number; height: number },
): SellerRegionMachineReading {
  const crop = sellerRegionCrop(target, decoded.width, decoded.height) ?? {
    left: 0,
    top: 0,
    width: 0,
    height: 0,
  };
  const cropPlan = sellerRegionCropPlan(target, decoded.width, decoded.height);
  return {
    categoryId: target.categoryId,
    regionId: target.regionId,
    panelId: target.panelId,
    sellerRegion: target.region,
    selectedRegionPixelGeometry: cropPlan
      ? {
          ...cropPlan.selectedRegionPixelGeometry,
          imageWidth: decoded.width,
          imageHeight: decoded.height,
        }
      : undefined,
    cropPadding: cropPlan?.padding,
    scaleFactor: cropPlan?.scale,
    cropGeometry: { ...crop, imageWidth: decoded.width, imageHeight: decoded.height },
    rawTranscript: "",
    observedValue: null,
    ocrEvidenceScore: 0,
    evidenceState: "INVALID_REGION",
    reliabilityState: "UNRELIABLE",
    reliabilityReason: "Seller-selected region could not be mapped to a usable OCR crop.",
    failureReason: "Seller-selected region could not be mapped to a usable OCR crop.",
    passProvenance: null,
    extractionProvenance: extractionProvenance(input),
  };
}

function sellerRegionReadingFromSelection(
  input: ExtractionInput,
  target: SellerRegionOcrTarget,
  result: RegionOcrResult,
  selection: FieldSelection,
): SellerRegionMachineReading {
  const observation = selection.observation;
  const rawTranscript = wordsInOriginalOrder(result)
    .map((word) => word.text)
    .join(" ")
    .trim();
  const cropPlan = sellerRegionCropPlan(
    target,
    result.transform.originalWidth,
    result.transform.originalHeight,
  );
  const evidenceState =
    observation.state === "OBSERVED" ||
    observation.state === "LOW_CONFIDENCE" ||
    observation.state === "AMBIGUOUS"
      ? observation.state
      : rawTranscript
        ? "UNREADABLE"
        : "NOT_OBSERVED";
  return {
    categoryId: target.categoryId,
    regionId: target.regionId,
    panelId: target.panelId,
    sellerRegion: target.region,
    selectedRegionPixelGeometry: cropPlan
      ? {
          ...cropPlan.selectedRegionPixelGeometry,
          imageWidth: result.transform.originalWidth,
          imageHeight: result.transform.originalHeight,
        }
      : undefined,
    cropPadding: cropPlan?.padding,
    scaleFactor: result.transform.scale,
    cropGeometry: {
      ...result.transform.crop,
      imageWidth: result.transform.originalWidth,
      imageHeight: result.transform.originalHeight,
    },
    rawTranscript,
    observedValue: observation.value,
    normalizedValue: observation.normalizedValue,
    ocrEvidenceScore: observation.ocrEvidenceScore,
    evidenceState,
    reliabilityState:
      evidenceState === "OBSERVED" && observation.ocrEvidenceScore >= 0.8
        ? "RELIABLE"
        : "UNRELIABLE",
    reliabilityReason:
      evidenceState === "OBSERVED" && observation.ocrEvidenceScore >= 0.8
        ? "Bounded OCR produced an observed value above the machine confidence floor."
        : "Bounded OCR did not produce a high-confidence observed value.",
    failureReason:
      evidenceState === "UNREADABLE" || evidenceState === "NOT_OBSERVED"
        ? "Bounded OCR did not establish a usable value inside the seller-selected region."
        : undefined,
    observationState: observation.state,
    selectedGeometry: observation.geometry,
    passProvenance: {
      passId: result.passId,
      passKind: result.passKind,
      regionName: result.regionName,
      triggerReasons: result.triggerReasons,
      preprocessing: result.preprocessing,
      pageSegMode: result.pageSegMode,
      transform: result.transform,
      transformedSize: result.transformedSize,
      timings: result.timings,
    },
    extractionProvenance: extractionProvenance(input),
  };
}

/**
 * Honest, deterministic provenance for the preprocessing variant behind each
 * selected field. The region source's coordinates already live in the
 * observation geometry; this records the preprocessing pipeline that produced
 * it, without extending the committed analyzer contract.
 */
function provenanceLimitations(brand: FieldSelection, alcohol: FieldSelection): string[] {
  const notes: string[] = [];
  if (brand.source) {
    notes.push(
      `brandName selected from region ${brand.source.regionName} via [${brand.source.preprocessing.join(", ")}]`,
    );
  } else if (brand.brandDiagnostics?.abstentionReason) {
    notes.push(`brandName abstained: ${brand.brandDiagnostics.abstentionReason}`);
    const rejected = brand.brandDiagnostics.lines
      .filter((line) => !line.kept && line.cleanedValue)
      .slice(0, 3)
      .map((line) => `"${line.cleanedValue}" [${line.reason}]`);
    if (rejected.length > 0) {
      notes.push(`brandName rejected candidates: ${rejected.join(", ")}`);
    }
  }
  if (alcohol.source) {
    notes.push(
      `alcoholStatement selected from region ${alcohol.source.regionName} via [${alcohol.source.preprocessing.join(", ")}]`,
    );
  }
  return notes;
}
