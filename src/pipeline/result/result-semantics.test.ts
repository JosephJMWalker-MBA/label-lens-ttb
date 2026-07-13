/* eslint-disable @typescript-eslint/no-explicit-any -- deliberate deep mutation of cloned records to construct contradictory candidates */
import { describe, expect, it } from "vitest";

import { buildJsonExport, verifyExportIntegrity } from "@/pipeline/export/json/build-json-export";
import { payloadHash } from "@/pipeline/export/json/canonical-json";
import { parseJsonExport } from "@/pipeline/export/json/parse-json-export";

import { assemblePrecheckResult } from "./assemble";
import { buildAssembleInput } from "./build.fixtures";
import { appendDisposition } from "./disposition";
import { validatePrecheckResult } from "./result.schema";
import type { PrecheckResult } from "./result.types";

function result(): PrecheckResult {
  const r = assemblePrecheckResult(buildAssembleInput());
  if (!r.ok) throw new Error("assembly failed");
  return r.value;
}

/** A deep, mutable clone of the valid result as a plain object. */
function clone(): Record<string, any> {
  return JSON.parse(JSON.stringify(result()));
}

function rejects(mutate: (r: Record<string, any>) => void) {
  const candidate = clone();
  mutate(candidate);
  expect(validatePrecheckResult(candidate).ok).toBe(false);
}

describe("precheckResultSchema — cross-object semantic invariants", () => {
  it("accepts the valid canonical result", () => {
    expect(validatePrecheckResult(clone()).ok).toBe(true);
  });

  it("rejects findings out of manifest order", () => {
    rejects((r) => {
      [r.findings[0], r.findings[1]] = [r.findings[1], r.findings[0]];
    });
  });

  it("rejects a finding rule version that differs from the manifest", () => {
    rejects((r) => {
      r.findings[0].ruleVersion = "9.9.9";
    });
  });

  it("rejects a finding profile identity that differs from the result", () => {
    rejects((r) => {
      r.findings[0].profileVersion = "9.9.9";
    });
  });

  it("rejects duplicate finding rule ids", () => {
    rejects((r) => {
      r.findings[1].ruleId = r.findings[0].ruleId;
    });
  });

  it("rejects an evidence reference to an unknown field", () => {
    rejects((r) => {
      const ref = r.findings.find((f: any) => f.evidenceReferences.length > 0);
      ref.evidenceReferences[0].fieldId = "notAField";
    });
  });

  it("rejects an evidence reference whose state differs from the observation", () => {
    rejects((r) => {
      const finding = r.findings.find((f: any) => f.evidenceReferences.length > 0);
      finding.evidenceReferences[0].observationState = "NOT_OBSERVED";
    });
  });

  it("rejects a disposition referencing a nonexistent rule id", () => {
    rejects((r) => {
      r.humanDispositionHistory = [
        {
          dispositionId: "disposition-1",
          sequence: 1,
          actorId: "reviewer-1",
          recordedAt: "2026-07-11T00:00:00Z",
          decision: "no_action",
          reasonCode: "R",
          references: { ruleIds: ["no-such-rule"] },
        },
      ];
    });
  });
});

describe("shared invariants across result and export", () => {
  it("rejects a re-checksummed export carrying a contradictory observation before treating it valid", () => {
    const built = buildJsonExport(result());
    if (!built.ok) throw new Error("export failed");
    const verified = verifyExportIntegrity(built.value);
    if (!verified.ok) throw new Error("verify failed");

    const tampered: any = JSON.parse(JSON.stringify(verified.value));
    // NOT_OBSERVED must not carry a value: a contradictory record.
    tampered.observations.brandName = {
      state: "NOT_OBSERVED",
      value: "SNEAKED IN",
      confidence: 0,
      ocrEvidenceScore: 0,
      alternates: [],
    };
    const { integrity, ...payload } = tampered;
    tampered.integrity = { ...integrity, value: payloadHash(payload) };

    const out = parseJsonExport(JSON.stringify(tampered));
    expect(out.ok).toBe(false);
    // Rejected by shared shape/semantic validation, not merely the checksum.
    if (!out.ok) expect(out.error.code).toBe("INVALID_EXPORT_SHAPE");
  });

  it("a valid disposition-updated export still parses", () => {
    const appended = appendDisposition(result(), {
      dispositionId: "disposition-1",
      actorId: "reviewer-1",
      recordedAt: "2026-07-11T00:00:00Z",
      decision: "accepted_for_internal_use",
      reasonCode: "OK",
    });
    if (!appended.ok) throw new Error("append failed");
    const built = buildJsonExport(appended.value);
    if (!built.ok) throw new Error("export failed");
    expect(parseJsonExport(JSON.stringify(built.value)).ok).toBe(true);
  });
});
