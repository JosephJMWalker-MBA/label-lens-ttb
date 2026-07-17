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
import { planPrimaryOcrPass, planRecoveryOcrPasses, runOcrPass } from "./regions";

export interface ExtractionDebug {
  decoded: { width: number; height: number; format: string };
  passes: Awaited<ReturnType<typeof runOcrPass>>[];
  primarySelections: { brand: FieldSelection; alcohol: FieldSelection };
  finalSelections: { brand: FieldSelection; alcohol: FieldSelection };
}

export interface DetailedExtractionResult {
  response: AnalyzerEvidenceResponse;
  debug: ExtractionDebug;
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
  });
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
