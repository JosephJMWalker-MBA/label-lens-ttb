import { describe, expect, it } from "vitest";

import { assemblePrecheckResult } from "@/pipeline/result/assemble";
import { buildAssembleInput } from "@/pipeline/result/build.fixtures";
import { appendDisposition } from "@/pipeline/result/disposition";
import type { DispositionEntryInput, PrecheckResult } from "@/pipeline/result/result.types";

import { buildJsonExport } from "./build-json-export";
import { canonicalStringify, serializeExportCanonical } from "./canonical-json";
import { parseJsonExport } from "./parse-json-export";
import type { PrecheckJsonExport } from "./json-export.types";

function result(): PrecheckResult {
  const r = assemblePrecheckResult(buildAssembleInput());
  if (!r.ok) throw new Error("assembly failed");
  return r.value;
}

function exportOf(r: PrecheckResult): PrecheckJsonExport {
  const e = buildJsonExport(r);
  if (!e.ok) throw new Error(`export failed: ${JSON.stringify(e.error)}`);
  return e.value;
}

const ENTRY: DispositionEntryInput = {
  dispositionId: "disp-1",
  actorId: "reviewer-1",
  recordedAt: "2026-07-10T01:00:00Z",
  decision: "accepted_for_internal_use",
  reasonCode: "LOOKS_GOOD",
};

function withDisposition(r: PrecheckResult): PrecheckResult {
  const out = appendDisposition(r, ENTRY);
  if (!out.ok) throw new Error("append failed");
  return out.value;
}

/** Re-parse an export after mutating a deep-cloned copy. */
function parseMutated(e: PrecheckJsonExport, mutate: (clone: PrecheckJsonExport) => void) {
  const clone = JSON.parse(JSON.stringify(e)) as PrecheckJsonExport;
  mutate(clone);
  return parseJsonExport(serializeExportCanonical(clone));
}

describe("buildJsonExport — build & fidelity", () => {
  it("builds a valid export with the correct schema and type", () => {
    const e = exportOf(result());
    expect(e.exportSchemaVersion).toBe("precheck-json-export.v1");
    expect(e.exportType).toBe("wine-precheck-result");
    expect(e.mode).toBe("wine-precheck");
  });

  it("preserves the source machine-result id and result schema version", () => {
    const r = result();
    const e = exportOf(r);
    expect(e.generatedFrom.machineResultId).toBe(r.machineResultId);
    expect(e.generatedFrom.resultSchemaVersion).toBe("precheck-result.v1");
  });

  it("preserves the profile identity and exact six-rule manifest", () => {
    const e = exportOf(result());
    expect(e.profile.id).toBe("wine-precheck");
    expect(e.profile.ruleManifest.map((x) => x.ruleId)).toEqual([
      "wine-alcohol-syntax",
      "brand-name-canonical-comparison",
      "wine-alcohol-declared-comparison",
      "wine-alcohol-actual-content-tolerance",
      "wine-alcohol-class-type-boundary",
      "wine-alcohol-omission-eligibility",
    ]);
  });

  it("preserves findings in registry order with actual-content rules not_run", () => {
    const e = exportOf(result());
    expect(e.findings.map((f) => f.ruleId)).toEqual(e.profile.ruleManifest.map((x) => x.ruleId));
    for (const id of [
      "wine-alcohol-actual-content-tolerance",
      "wine-alcohol-class-type-boundary",
      "wine-alcohol-omission-eligibility",
    ]) {
      expect(e.findings.find((f) => f.ruleId === id)!.ruleExecutionStatus).toBe(
        "not_run_external_dependency",
      );
    }
  });

  it("preserves observations, declared facts, assessments, and advisory notice", () => {
    const e = exportOf(result());
    expect(e.observations.brandName.value).toBe("M CELLARS");
    expect(e.observations.alcoholStatement.value).toBe("12.5% ALC./VOL.");
    expect(e.observations.brandName.geometry).toBeDefined();
    expect(e.declaredFacts.applicationAlcoholValue.value).toBe("12.5");
    expect(e.evidenceAssessments.map((a) => a.checkId).sort()).toEqual([
      "brand-name-check",
      "wine-alcohol-check",
    ]);
    expect(e.advisoryNotice.text).toMatch(/not a TTB approval/i);
  });

  it("supports empty and nonempty disposition history", () => {
    expect(exportOf(result()).humanDispositionHistory).toEqual([]);
    const e = exportOf(withDisposition(result()));
    expect(e.humanDispositionHistory).toHaveLength(1);
    expect(e.humanDispositionHistory[0].decision).toBe("accepted_for_internal_use");
  });

  it("preserves authority citations and dates", () => {
    const e = exportOf(result());
    const cited = e.findings.find((f) => f.ruleId === "wine-alcohol-syntax")!;
    expect(cited.authority.citation).toBe("27 CFR 4.36");
    expect(cited.authority.snapshotDate).toBe("2026-07-10");
  });
});

describe("buildJsonExport — integrity", () => {
  it("produces identical export objects, canonical JSON, and hashes for identical results", () => {
    const a = exportOf(result());
    const b = exportOf(result());
    expect(canonicalStringify(a)).toBe(canonicalStringify(b));
    expect(a.integrity.value).toBe(b.integrity.value);
    expect(a.integrity.value).toMatch(/^[0-9a-f]{64}$/);
  });

  it("changes the export checksum when disposition is appended but keeps the machine id", () => {
    const base = exportOf(result());
    const appended = exportOf(withDisposition(result()));
    expect(appended.integrity.value).not.toBe(base.integrity.value);
    expect(appended.generatedFrom.machineResultId).toBe(base.generatedFrom.machineResultId);
  });

  it("rejects a changed finding status", () => {
    const out = parseMutated(exportOf(result()), (c) => {
      c.findings[0] = { ...c.findings[0], findingStatus: "FAIL" };
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("INTEGRITY_MISMATCH");
  });

  it("rejects a changed declared alcohol value", () => {
    const out = parseMutated(exportOf(result()), (c) => {
      c.declaredFacts.applicationAlcoholValue = {
        ...c.declaredFacts.applicationAlcoholValue,
        value: "13",
      };
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("INTEGRITY_MISMATCH");
  });

  it("rejects a changed observation value", () => {
    const out = parseMutated(exportOf(result()), (c) => {
      c.observations.brandName = { ...c.observations.brandName, value: "OTHER" };
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("INTEGRITY_MISMATCH");
  });

  it("rejects a reordered rule manifest", () => {
    const out = parseMutated(exportOf(result()), (c) => {
      c.profile.ruleManifest = [...c.profile.ruleManifest].reverse();
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("INTEGRITY_MISMATCH");
  });

  it("rejects one-character tampering in the payload", () => {
    const e = exportOf(result());
    const out = parseMutated(e, (c) => {
      c.advisoryNotice = { ...c.advisoryNotice, text: c.advisoryNotice.text + "." };
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("INTEGRITY_MISMATCH");
  });
});
