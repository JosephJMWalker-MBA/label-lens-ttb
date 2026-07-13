import { describe, expect, it } from "vitest";

import { appendHumanFieldConfirmation } from "@/pipeline/result/field-confirmation-history";
import { appendDisposition } from "@/pipeline/result/disposition";
import { assemblePrecheckResult } from "@/pipeline/result/assemble";
import { buildAssembleInput } from "@/pipeline/result/build.fixtures";
import type { PrecheckResult } from "@/pipeline/result/result.types";

import {
  buildJsonExport,
  recomputeExportMachineResultId,
  verifyExportIntegrity,
} from "./build-json-export";
import { payloadHash } from "./canonical-json";
import { parseJsonExport } from "./parse-json-export";
import type { PrecheckJsonExport } from "./json-export.types";

function baseResult(): PrecheckResult {
  const r = assemblePrecheckResult(buildAssembleInput());
  if (!r.ok) throw new Error("assembly failed");
  return r.value;
}

function resultWithBrandAlternate(): PrecheckResult {
  const base = JSON.parse(JSON.stringify(baseResult())) as PrecheckResult;
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

function exportOf(result: PrecheckResult): PrecheckJsonExport {
  const built = buildJsonExport(result);
  if (!built.ok) throw new Error("export failed");
  const verified = verifyExportIntegrity(built.value);
  if (!verified.ok) throw new Error("verify failed");
  return verified.value;
}

/** Re-checksum an export after a payload mutation, keeping a stale identity. */
function recheckSummed(exp: PrecheckJsonExport): string {
  const { integrity: _drop, ...payload } = exp;
  void _drop;
  const rebuilt: PrecheckJsonExport = {
    ...exp,
    integrity: { ...exp.integrity, value: payloadHash(payload) },
  };
  return JSON.stringify(rebuilt);
}

describe("export machine-result-id verification", () => {
  it("parses a valid, untampered export", () => {
    const text = JSON.stringify(exportOf(baseResult()));
    expect(parseJsonExport(text).ok).toBe(true);
  });

  it("recomputes the id from machine content, independent of the embedded field", () => {
    const exp = exportOf(baseResult());
    expect(recomputeExportMachineResultId(exp)).toBe(exp.generatedFrom.machineResultId);
  });

  it("rejects a changed declared alcohol that was re-checksummed with a stale id", () => {
    const exp = exportOf(baseResult());
    const tampered: PrecheckJsonExport = {
      ...exp,
      declaredFacts: {
        ...exp.declaredFacts,
        applicationAlcoholValue: { ...exp.declaredFacts.applicationAlcoholValue, value: "13" },
      },
    };
    const out = parseJsonExport(recheckSummed(tampered));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("MACHINE_RESULT_ID_MISMATCH");
  });

  it("rejects a changed finding that was re-checksummed", () => {
    const exp = exportOf(baseResult());
    const tampered: PrecheckJsonExport = {
      ...exp,
      findings: exp.findings.map((f, i) =>
        i === 0 ? { ...f, findingStatus: "FAIL" as typeof f.findingStatus } : f,
      ),
    };
    const out = parseJsonExport(recheckSummed(tampered));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("MACHINE_RESULT_ID_MISMATCH");
  });

  it("rejects a changed observation that was re-checksummed", () => {
    const exp = exportOf(baseResult());
    const tampered: PrecheckJsonExport = {
      ...exp,
      observations: {
        ...exp.observations,
        brandName: { ...exp.observations.brandName, value: "OTHER BRAND" },
      },
    };
    const out = parseJsonExport(recheckSummed(tampered));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("MACHINE_RESULT_ID_MISMATCH");
  });

  it("rejects a changed version-provenance that was re-checksummed", () => {
    const exp = exportOf(baseResult());
    const tampered: PrecheckJsonExport = {
      ...exp,
      versionManifest: { ...exp.versionManifest, parserVersion: "9.9.9" },
    };
    const out = parseJsonExport(recheckSummed(tampered));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("MACHINE_RESULT_ID_MISMATCH");
  });

  it("appending disposition changes the checksum but not the machine-result id", () => {
    const result = baseResult();
    const before = exportOf(result);
    const appended = appendDisposition(result, {
      dispositionId: "disposition-1",
      actorId: "reviewer-1",
      recordedAt: "2026-07-11T00:00:00Z",
      decision: "accepted_for_internal_use",
      reasonCode: "OK",
    });
    if (!appended.ok) throw new Error("append failed");
    const after = exportOf(appended.value);

    expect(after.integrity.value).not.toBe(before.integrity.value);
    expect(after.generatedFrom.machineResultId).toBe(before.generatedFrom.machineResultId);
    // The updated disposition export still parses and verifies.
    expect(parseJsonExport(JSON.stringify(after)).ok).toBe(true);
  });

  it("appending field confirmation changes the checksum but not the machine-result id", () => {
    const result = baseResult();
    const before = exportOf(result);
    const confirmed = appendHumanFieldConfirmation(result, {
      confirmationId: "field-confirmation-1",
      fieldId: "brandName",
      decisionType: "accepted-machine-reading",
      recordedAt: "2026-07-13T10:00:00Z",
    });
    if (!confirmed.ok) throw new Error("append failed");
    const after = exportOf(confirmed.value);

    expect(after.integrity.value).not.toBe(before.integrity.value);
    expect(after.generatedFrom.machineResultId).toBe(before.generatedFrom.machineResultId);
    expect(parseJsonExport(JSON.stringify(after)).ok).toBe(true);
  });

  it("keeps machine identity unchanged across all five confirmation actions, revisions, notes, and human geometry", () => {
    const base = baseResult();
    const actions = [
      appendHumanFieldConfirmation(base, {
        confirmationId: "field-confirmation-1",
        fieldId: "brandName",
        decisionType: "accepted-machine-reading",
        recordedAt: "2026-07-13T10:00:00Z",
        note: "Accepted as shown.",
        humanGeometry: {
          unit: "normalized-image-relative",
          provenance: "human-confirmed-machine-region",
          imageIndex: 0,
          x: 0.1,
          y: 0.1,
          width: 0.2,
          height: 0.1,
        },
      }),
      appendHumanFieldConfirmation(resultWithBrandAlternate(), {
        confirmationId: "field-confirmation-1",
        fieldId: "brandName",
        decisionType: "selected-alternate",
        alternateId: "brandName-alternate-1",
        recordedAt: "2026-07-13T10:00:00Z",
      }),
      appendHumanFieldConfirmation(base, {
        confirmationId: "field-confirmation-1",
        fieldId: "alcoholStatement",
        decisionType: "corrected-value",
        correctedValue: {
          fieldId: "alcoholStatement",
          rawValue: "12.5% alc./vol.",
          normalizedValue: "12.5% alc./vol.",
          parsed: { kind: "direct", basisPoints: 1250 },
        },
        recordedAt: "2026-07-13T10:00:00Z",
      }),
      appendHumanFieldConfirmation(base, {
        confirmationId: "field-confirmation-1",
        fieldId: "brandName",
        decisionType: "field-not-visible",
        recordedAt: "2026-07-13T10:00:00Z",
      }),
      appendHumanFieldConfirmation(base, {
        confirmationId: "field-confirmation-1",
        fieldId: "brandName",
        decisionType: "field-unreadable",
        recordedAt: "2026-07-13T10:00:00Z",
      }),
    ];

    for (const appended of actions) {
      if (!appended.ok) throw new Error("append failed");
      expect(appended.value.machineResultId).toBe(base.machineResultId);
    }

    const acceptedMachine = actions[0];
    if (!acceptedMachine.ok) throw new Error("append failed");

    const revised = appendHumanFieldConfirmation(acceptedMachine.value, {
      confirmationId: "field-confirmation-2",
      fieldId: "brandName",
      decisionType: "field-unreadable",
      recordedAt: "2026-07-13T10:05:00Z",
      note: "Revision after review.",
    });
    if (!revised.ok) throw new Error("revision append failed");
    expect(revised.value.machineResultId).toBe(base.machineResultId);
  });

  it("is byte-stable: identical machine content yields an identical id", () => {
    expect(exportOf(baseResult()).generatedFrom.machineResultId).toBe(
      exportOf(baseResult()).generatedFrom.machineResultId,
    );
  });
});
