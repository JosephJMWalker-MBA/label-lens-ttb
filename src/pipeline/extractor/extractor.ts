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
import { regionPreprocessing, runRegionOcr } from "./regions";

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
  const decoded = await verifyAndDecode(input.imageBytes, input.derivativeSha256);
  if (!decoded.ok) return decoded;

  let engine;
  try {
    engine = await createLocalOcrEngine();
  } catch (cause) {
    return err({
      code: "OCR_UNAVAILABLE",
      message: "Local OCR engine could not be initialized.",
      issues: [cause instanceof Error ? cause.message : String(cause)],
    });
  }

  let brand: FieldSelection;
  let alcohol: FieldSelection;
  try {
    const regions = await runRegionOcr(
      input.imageBytes,
      decoded.value.width,
      decoded.value.height,
      engine,
    );
    brand = selectBrandObservation(regions);
    alcohol = selectAlcoholObservation(regions);
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
    return err({
      code: "INVALID_RESPONSE",
      message: "Constructed analyzer response failed evidence-only validation.",
      issues: validated.error.issues,
    });
  }
  return ok(validated.value);
}

/**
 * Honest, deterministic provenance for the preprocessing variant behind each
 * selected field. The region source's coordinates already live in the
 * observation geometry; this records the preprocessing pipeline that produced
 * it, without extending the committed analyzer contract.
 */
function provenanceLimitations(brand: FieldSelection, alcohol: FieldSelection): string[] {
  const notes: string[] = [];
  if (brand.sourceRegion) {
    notes.push(
      `brandName selected from region ${brand.sourceRegion} via [${regionPreprocessing(brand.sourceRegion).join(", ")}]`,
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
  if (alcohol.sourceRegion) {
    notes.push(
      `alcoholStatement selected from region ${alcohol.sourceRegion} via [${regionPreprocessing(alcohol.sourceRegion).join(", ")}]`,
    );
  }
  return notes;
}
