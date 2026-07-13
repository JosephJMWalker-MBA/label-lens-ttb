import type {
  AnalyzerFieldObservation,
  EvidenceGeometry,
} from "@/pipeline/analyzer/analyzer.types";
import { parseWineAlcoholStatement } from "@/domain/rules/wine-alcohol-parse";
import { err, ok, type Result } from "@/shared/result";

import type {
  EffectiveReviewedField,
  HumanAlcoholCorrectionDirectValue,
  HumanAlcoholCorrectionRangeValue,
  HumanBrandCorrectionValue,
  HumanCorrectedFieldValue,
  HumanFieldConfirmationEntry,
  HumanFieldGeometry,
  PrecheckResult,
  ResolvedFieldReview,
  ResolvedFieldReviews,
  ResolvedMachineAlternate,
  ReviewableFieldId,
} from "./result.types";

const CONTROL_CHAR = /[\u0000-\u001f\u007f]/;

export interface HumanCorrectionValidationError {
  message: string;
}

/** Stable per-observation alternate identity; never a displayed label alone. */
export function machineAlternateId(fieldId: ReviewableFieldId, index: number): string {
  return `${fieldId}-alternate-${index + 1}`;
}

/** Ordered alternate projection with stable ids, preserving machine ordering. */
export function resolveMachineAlternates(
  fieldId: ReviewableFieldId,
  observation: AnalyzerFieldObservation,
): ResolvedMachineAlternate[] {
  return observation.alternates.map((alternate, index) => ({
    alternateId: machineAlternateId(fieldId, index),
    ...alternate,
  }));
}

/** Latest append wins for the active confirmation of one field; history is preserved. */
export function activeConfirmationForField(
  result: Pick<PrecheckResult, "humanFieldConfirmationHistory">,
  fieldId: ReviewableFieldId,
): HumanFieldConfirmationEntry | null {
  const entries = result.humanFieldConfirmationHistory.filter((entry) => entry.fieldId === fieldId);
  return entries.length === 0 ? null : entries[entries.length - 1];
}

function normalizeReviewText(raw: string): string {
  return raw.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** Brand correction is intentionally permissive: reject only structural garbage. */
export function validateHumanBrandCorrection(
  rawValue: string,
): Result<HumanBrandCorrectionValue, HumanCorrectionValidationError> {
  if (rawValue.trim().length === 0) {
    return err({ message: "Enter a brand value before saving a correction." });
  }
  if (CONTROL_CHAR.test(rawValue)) {
    return err({ message: "Brand corrections cannot include control characters." });
  }
  return ok({
    fieldId: "brandName",
    rawValue,
    normalizedValue: normalizeReviewText(rawValue).toUpperCase(),
  });
}

/**
 * Alcohol corrections must still be a bounded wine alcohol statement; a person
 * may correct the machine, but the field cannot become arbitrary prose.
 */
export function validateHumanAlcoholCorrection(
  rawValue: string,
): Result<
  HumanAlcoholCorrectionDirectValue | HumanAlcoholCorrectionRangeValue,
  HumanCorrectionValidationError
> {
  if (rawValue.trim().length === 0) {
    return err({ message: "Enter an alcohol statement before saving a correction." });
  }
  if (CONTROL_CHAR.test(rawValue)) {
    return err({ message: "Alcohol corrections cannot include control characters." });
  }
  const normalizedValue = normalizeReviewText(rawValue);
  const parsed = parseWineAlcoholStatement(rawValue);
  switch (parsed.kind) {
    case "direct":
      return ok({
        fieldId: "alcoholStatement",
        rawValue,
        normalizedValue,
        parsed: { kind: "direct", basisPoints: parsed.basisPoints },
      });
    case "range":
      return ok({
        fieldId: "alcoholStatement",
        rawValue,
        normalizedValue,
        parsed: {
          kind: "range",
          lowerBasisPoints: parsed.lowerBasisPoints,
          upperBasisPoints: parsed.upperBasisPoints,
        },
      });
    case "proof":
      return err({ message: "Proof is not a supported wine alcohol statement for this field." });
    case "malformed":
    default:
      return err({
        message:
          "Enter a parseable wine alcohol statement such as 12.5% alc./vol. or a supported range.",
      });
  }
}

export function validateHumanCorrectedValue(
  fieldId: ReviewableFieldId,
  rawValue: string,
): Result<HumanCorrectedFieldValue, HumanCorrectionValidationError> {
  return fieldId === "brandName"
    ? validateHumanBrandCorrection(rawValue)
    : validateHumanAlcoholCorrection(rawValue);
}

function reviewStateForObservationState(
  state: AnalyzerFieldObservation["state"],
): EffectiveReviewedField["state"] {
  if (state === "AMBIGUOUS") return "AMBIGUOUS";
  if (state === "NOT_OBSERVED") return "NOT_OBSERVED";
  return "OBSERVED";
}

function observationForField(
  result: Pick<PrecheckResult, "observations">,
  fieldId: ReviewableFieldId,
): AnalyzerFieldObservation {
  return fieldId === "brandName"
    ? result.observations.brandName
    : result.observations.alcoholStatement;
}

function effectiveFromMachine(
  fieldId: ReviewableFieldId,
  observation: AnalyzerFieldObservation,
): EffectiveReviewedField {
  return {
    fieldId,
    state: reviewStateForObservationState(observation.state),
    source: { kind: "machine-observation" },
    value: observation.value,
    normalizedValue: observation.normalizedValue ?? null,
    machineObservationState: observation.state,
    machineObservationValue: observation.value,
    humanConfirmed: false,
    ocrEvidenceScore: observation.value !== null ? observation.ocrEvidenceScore : undefined,
    ...(observation.ocrConfidence !== undefined
      ? { ocrConfidence: observation.ocrConfidence }
      : {}),
    machineGeometryPresent: observation.geometry !== undefined,
  };
}

/**
 * Convert machine geometry to normalized human-review geometry without changing
 * the machine observation itself.
 */
export function normalizedHumanGeometryFromMachine(
  geometry: EvidenceGeometry,
  provenance: HumanFieldGeometry["provenance"] = "human-confirmed-machine-region",
): HumanFieldGeometry {
  return {
    unit: "normalized-image-relative",
    provenance,
    imageIndex: geometry.imageIndex,
    x: geometry.x / geometry.imageWidth,
    y: geometry.y / geometry.imageHeight,
    width: geometry.width / geometry.imageWidth,
    height: geometry.height / geometry.imageHeight,
  };
}

function effectiveFromConfirmation(
  fieldId: ReviewableFieldId,
  observation: AnalyzerFieldObservation,
  confirmation: HumanFieldConfirmationEntry,
  alternates: ResolvedMachineAlternate[],
): EffectiveReviewedField {
  switch (confirmation.decisionType) {
    case "accepted-machine-reading":
      return {
        fieldId,
        state: "HUMAN_CONFIRMED",
        source: { kind: "accepted-machine-reading" },
        value: observation.value,
        normalizedValue: observation.normalizedValue ?? null,
        machineObservationState: observation.state,
        machineObservationValue: observation.value,
        humanConfirmed: true,
        ocrEvidenceScore: observation.value !== null ? observation.ocrEvidenceScore : undefined,
        ...(observation.ocrConfidence !== undefined
          ? { ocrConfidence: observation.ocrConfidence }
          : {}),
        machineGeometryPresent: observation.geometry !== undefined,
        ...(confirmation.humanGeometry !== undefined
          ? { humanGeometry: confirmation.humanGeometry }
          : {}),
      };
    case "selected-alternate": {
      const alternate = alternates.find((item) => item.alternateId === confirmation.alternateId);
      return {
        fieldId,
        state: "HUMAN_CONFIRMED",
        source: { kind: "selected-alternate", alternateId: confirmation.alternateId },
        value: alternate?.value ?? null,
        normalizedValue: alternate?.value ?? null,
        machineObservationState: observation.state,
        machineObservationValue: observation.value,
        humanConfirmed: true,
        ocrEvidenceScore: alternate?.ocrEvidenceScore,
        ocrConfidence: alternate?.ocrConfidence,
        machineGeometryPresent: observation.geometry !== undefined,
        ...(confirmation.humanGeometry !== undefined
          ? { humanGeometry: confirmation.humanGeometry }
          : {}),
      };
    }
    case "corrected-value":
      return {
        fieldId,
        state: "HUMAN_CONFIRMED",
        source: { kind: "corrected-value" },
        value: confirmation.correctedValue.rawValue,
        normalizedValue: confirmation.correctedValue.normalizedValue,
        machineObservationState: observation.state,
        machineObservationValue: observation.value,
        humanConfirmed: true,
        machineGeometryPresent: observation.geometry !== undefined,
        correctedValue: confirmation.correctedValue,
        ...(confirmation.humanGeometry !== undefined
          ? { humanGeometry: confirmation.humanGeometry }
          : {}),
      };
    case "field-not-visible":
      return {
        fieldId,
        state: "NOT_VISIBLE",
        source: { kind: "field-not-visible" },
        value: null,
        normalizedValue: null,
        machineObservationState: observation.state,
        machineObservationValue: observation.value,
        humanConfirmed: true,
        machineGeometryPresent: observation.geometry !== undefined,
        ...(confirmation.humanGeometry !== undefined
          ? { humanGeometry: confirmation.humanGeometry }
          : {}),
      };
    case "field-unreadable":
      return {
        fieldId,
        state: "UNREADABLE",
        source: { kind: "field-unreadable" },
        value: null,
        normalizedValue: null,
        machineObservationState: observation.state,
        machineObservationValue: observation.value,
        humanConfirmed: true,
        machineGeometryPresent: observation.geometry !== undefined,
        ...(confirmation.humanGeometry !== undefined
          ? { humanGeometry: confirmation.humanGeometry }
          : {}),
      };
  }
}

export function resolveFieldReview(
  result: Pick<PrecheckResult, "observations" | "humanFieldConfirmationHistory">,
  fieldId: ReviewableFieldId,
): ResolvedFieldReview {
  const machineObservation = observationForField(result, fieldId);
  const machineAlternates = resolveMachineAlternates(fieldId, machineObservation);
  const activeConfirmation = activeConfirmationForField(result, fieldId);
  const effective = activeConfirmation
    ? effectiveFromConfirmation(fieldId, machineObservation, activeConfirmation, machineAlternates)
    : effectiveFromMachine(fieldId, machineObservation);

  return {
    fieldId,
    machineObservation,
    machineAlternates,
    activeConfirmation,
    effective,
  };
}

export function resolveFieldReviews(
  result: Pick<PrecheckResult, "observations" | "humanFieldConfirmationHistory">,
): ResolvedFieldReviews {
  return {
    brandName: resolveFieldReview(result, "brandName"),
    alcoholStatement: resolveFieldReview(result, "alcoholStatement"),
  };
}
