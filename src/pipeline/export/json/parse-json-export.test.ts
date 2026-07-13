import { describe, expect, it } from "vitest";

import { assemblePrecheckResult } from "@/pipeline/result/assemble";
import { buildAssembleInput } from "@/pipeline/result/build.fixtures";

import { buildJsonExport } from "./build-json-export";
import { serializeExportCanonical, serializeExportPrettyNoncanonical } from "./canonical-json";
import type { PrecheckJsonExport } from "./json-export.types";
import { parseJsonExport } from "./parse-json-export";

function exportObject(): PrecheckJsonExport {
  const r = assemblePrecheckResult(buildAssembleInput());
  if (!r.ok) throw new Error("assembly failed");
  const e = buildJsonExport(r.value);
  if (!e.ok) throw new Error("export failed");
  return e.value;
}

function canonical(): string {
  return serializeExportCanonical(exportObject());
}

describe("parseJsonExport", () => {
  it("parses canonical serialized export text", () => {
    const out = parseJsonExport(canonical());
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.exportType).toBe("wine-precheck-result");
  });

  it("parses pretty (noncanonical) JSON to the same data", () => {
    const e = exportObject();
    const out = parseJsonExport(serializeExportPrettyNoncanonical(e));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.integrity.value).toBe(e.integrity.value);
  });

  it("accepts a Phase 5B export that predates field-confirmation history", () => {
    const legacy = JSON.parse(canonical());
    delete legacy.humanFieldConfirmationHistory;
    const out = parseJsonExport(JSON.stringify(legacy));
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.value.humanFieldConfirmationHistory).toEqual([]);
  });

  it("returns INVALID_JSON for malformed JSON", () => {
    const out = parseJsonExport("{not json");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("INVALID_JSON");
  });

  it("rejects unknown fields", () => {
    const tampered = JSON.parse(canonical());
    tampered.unexpected = true;
    const out = parseJsonExport(JSON.stringify(tampered));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("INVALID_EXPORT_SHAPE");
  });

  it("rejects an unsupported export schema version", () => {
    const tampered = JSON.parse(canonical());
    tampered.exportSchemaVersion = "precheck-json-export.v2";
    const out = parseJsonExport(JSON.stringify(tampered));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("UNSUPPORTED_EXPORT_SCHEMA_VERSION");
  });

  it("rejects an injected overall status or compliance percentage", () => {
    for (const key of ["overallStatus", "compliancePercentage"]) {
      const tampered = JSON.parse(canonical());
      tampered[key] = key === "overallStatus" ? "PASS" : 100;
      const out = parseJsonExport(JSON.stringify(tampered));
      expect(out.ok).toBe(false);
      if (!out.ok) expect(out.error.code).toBe("INVALID_EXPORT_SHAPE");
    }
  });

  it("rejects an injected government-authority disposition field", () => {
    const tampered = JSON.parse(canonical());
    tampered.humanDispositionHistory = [
      {
        dispositionId: "x",
        sequence: 1,
        actorId: "a",
        recordedAt: "t",
        decision: "approved_by_ttb",
        reasonCode: "r",
      },
    ];
    const out = parseJsonExport(JSON.stringify(tampered));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("INVALID_EXPORT_SHAPE");
  });

  it("rejects a missing integrity block", () => {
    const tampered = JSON.parse(canonical());
    delete tampered.integrity;
    const out = parseJsonExport(JSON.stringify(tampered));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("INVALID_EXPORT_SHAPE");
  });

  it("rejects a malformed integrity checksum", () => {
    const tampered = JSON.parse(canonical());
    tampered.integrity.value = "not-a-hash";
    const out = parseJsonExport(JSON.stringify(tampered));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("INVALID_EXPORT_SHAPE");
  });

  it("rejects a source-result-id mismatch when an expected id is supplied", () => {
    const out = parseJsonExport(canonical(), {
      expectedMachineResultId: "precheck-result.v1-" + "0".repeat(64),
    });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("SOURCE_RESULT_ID_MISMATCH");
  });
});
