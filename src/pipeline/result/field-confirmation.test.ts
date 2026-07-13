import { describe, expect, it } from "vitest";

import { appendHumanFieldConfirmation } from "./field-confirmation-history";
import {
  normalizedHumanGeometryFromMachine,
  resolveFieldReview,
  validateHumanAlcoholCorrection,
  validateHumanBrandCorrection,
} from "./field-confirmation";
import { assemblePrecheckResult } from "./assemble";
import { buildAssembleInput } from "./build.fixtures";
import type { PrecheckResult } from "./result.types";

function result(): PrecheckResult {
  const assembled = assemblePrecheckResult(buildAssembleInput());
  if (!assembled.ok) throw new Error("assembly failed");
  return assembled.value;
}

function withBrandAlternates(): PrecheckResult {
  const base = JSON.parse(JSON.stringify(result())) as PrecheckResult;
  base.observations.brandName.state = "AMBIGUOUS";
  base.observations.brandName.alternates = [
    {
      value: "M CELLARS ALT",
      confidence: 0.88,
      ocrEvidenceScore: 0.88,
      ocrConfidence: {
        aggregation: "mean",
        rawScale: "0-100",
        rawTokenConfidences: [88],
        rawMean: 88,
        rawMin: 88,
        rawMax: 88,
        missingTokenCount: 0,
      },
      candidateProvenance: {
        passId: "pass-1-edge",
        passKind: "left-edge-strip-rot270",
        triggerReasons: ["edge-text-heuristic"],
        preprocessing: ["crop:edge-strip", "rotate:270", "grayscale"],
        regionName: "brand-alt",
        supportingPassIds: ["pass-1-edge"],
        supportingPassKinds: ["left-edge-strip-rot270"],
        recoveryPassUsed: true,
      },
      ranking: {
        strategy: "brand-mixed-prominence-score",
        orderingMode: "score-first",
        comparator: [
          { id: "score-eligibility", direction: "desc", value: true },
          { id: "ranking-score", direction: "desc", value: 4.8 },
        ],
        rankingScore: 4.8,
      },
      geometry: {
        imageIndex: 0,
        x: 15,
        y: 24,
        width: 95,
        height: 28,
        imageWidth: 494,
        imageHeight: 214,
      },
    },
  ];
  return base;
}

describe("appendHumanFieldConfirmation", () => {
  it("preserves machine observations when a machine reading is accepted", () => {
    const before = result();
    const snapshot = JSON.stringify(before.observations);
    const out = appendHumanFieldConfirmation(before, {
      confirmationId: "field-confirmation-1",
      fieldId: "brandName",
      decisionType: "accepted-machine-reading",
      recordedAt: "2026-07-13T10:00:00Z",
    });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(JSON.stringify(out.value.observations)).toBe(snapshot);
  });

  it("rejects a fabricated alternate identifier", () => {
    const out = appendHumanFieldConfirmation(withBrandAlternates(), {
      confirmationId: "field-confirmation-1",
      fieldId: "brandName",
      decisionType: "selected-alternate",
      alternateId: "brandName-alternate-99",
      recordedAt: "2026-07-13T10:00:00Z",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("INVALID_FIELD_CONFIRMATION");
  });

  it("rejects a corrected value whose field payload does not match the confirmed field", () => {
    const brand = validateHumanBrandCorrection("M CELLARS");
    if (!brand.ok) throw new Error("brand validation failed");
    const out = appendHumanFieldConfirmation(result(), {
      confirmationId: "field-confirmation-1",
      fieldId: "alcoholStatement",
      decisionType: "corrected-value",
      correctedValue: brand.value,
      recordedAt: "2026-07-13T10:00:00Z",
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("INVALID_FIELD_CONFIRMATION");
  });
});

describe("resolveFieldReview", () => {
  it("accepting a machine reading references the machine observation and preserves OCR evidence", () => {
    const base = result();
    const appended = appendHumanFieldConfirmation(base, {
      confirmationId: "field-confirmation-1",
      fieldId: "brandName",
      decisionType: "accepted-machine-reading",
      recordedAt: "2026-07-13T10:00:00Z",
      humanGeometry: normalizedHumanGeometryFromMachine(base.observations.brandName.geometry!),
    });
    if (!appended.ok) throw new Error("append failed");
    const review = resolveFieldReview(appended.value, "brandName");
    expect(review.effective.state).toBe("HUMAN_CONFIRMED");
    expect(review.effective.source.kind).toBe("accepted-machine-reading");
    expect(review.effective.value).toBe(base.observations.brandName.value);
    expect(review.effective.ocrEvidenceScore).toBe(base.observations.brandName.ocrEvidenceScore);
  });

  it("selected alternate resolves only within the same observation", () => {
    const base = withBrandAlternates();
    const appended = appendHumanFieldConfirmation(base, {
      confirmationId: "field-confirmation-1",
      fieldId: "brandName",
      decisionType: "selected-alternate",
      alternateId: "brandName-alternate-1",
      recordedAt: "2026-07-13T10:00:00Z",
    });
    if (!appended.ok) throw new Error("append failed");
    const review = resolveFieldReview(appended.value, "brandName");
    expect(review.effective.source.kind).toBe("selected-alternate");
    expect(review.effective.value).toBe("M CELLARS ALT");
    expect(review.effective.ocrEvidenceScore).toBe(0.88);
  });

  it("human-corrected values do not inherit OCR confidence", () => {
    const corrected = validateHumanAlcoholCorrection("12.5% alc./vol.");
    if (!corrected.ok) throw new Error("alcohol validation failed");
    const appended = appendHumanFieldConfirmation(result(), {
      confirmationId: "field-confirmation-1",
      fieldId: "alcoholStatement",
      decisionType: "corrected-value",
      correctedValue: corrected.value,
      recordedAt: "2026-07-13T10:00:00Z",
    });
    if (!appended.ok) throw new Error("append failed");
    const review = resolveFieldReview(appended.value, "alcoholStatement");
    expect(review.effective.source.kind).toBe("corrected-value");
    expect(review.effective.ocrEvidenceScore).toBeUndefined();
    expect(review.effective.ocrConfidence).toBeUndefined();
  });

  it("keeps not-visible and unreadable distinct from each other and from machine abstention", () => {
    const base = JSON.parse(JSON.stringify(result())) as PrecheckResult;
    base.observations.brandName.state = "NOT_OBSERVED";
    base.observations.brandName.value = null;
    const machine = resolveFieldReview(base, "brandName");
    expect(machine.effective.state).toBe("NOT_OBSERVED");

    const notVisible = appendHumanFieldConfirmation(base, {
      confirmationId: "field-confirmation-1",
      fieldId: "brandName",
      decisionType: "field-not-visible",
      recordedAt: "2026-07-13T10:00:00Z",
    });
    if (!notVisible.ok) throw new Error("append failed");
    expect(resolveFieldReview(notVisible.value, "brandName").effective.state).toBe("NOT_VISIBLE");

    const unreadable = appendHumanFieldConfirmation(base, {
      confirmationId: "field-confirmation-1",
      fieldId: "brandName",
      decisionType: "field-unreadable",
      recordedAt: "2026-07-13T10:00:00Z",
    });
    if (!unreadable.ok) throw new Error("append failed");
    expect(resolveFieldReview(unreadable.value, "brandName").effective.state).toBe("UNREADABLE");
  });
});
