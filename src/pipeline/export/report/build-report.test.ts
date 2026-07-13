import { describe, expect, it } from "vitest";

import { appendHumanFieldConfirmation } from "@/pipeline/result/field-confirmation-history";
import { appendDisposition } from "@/pipeline/result/disposition";
import { assemblePrecheckResult } from "@/pipeline/result/assemble";
import { buildAssembleInput } from "@/pipeline/result/build.fixtures";
import type { DispositionEntryInput, PrecheckResult } from "@/pipeline/result/result.types";

import { buildReadableReport, reportFilename } from "./build-report";
import { REPORT_SCHEMA_VERSION } from "./report.types";

function baseResult(): PrecheckResult {
  const r = assemblePrecheckResult(buildAssembleInput());
  if (!r.ok) throw new Error("assembly failed");
  return r.value;
}

function withDisposition(overrides: Partial<DispositionEntryInput> = {}): PrecheckResult {
  const appended = appendDisposition(baseResult(), {
    dispositionId: "disposition-1",
    actorId: "reviewer-7",
    recordedAt: "2026-07-11T09:00:00Z",
    decision: "escalated_for_human_review",
    reasonCode: "NEEDS_SECOND_LOOK",
    note: "Brand mark unclear.",
    references: { ruleIds: ["brand-name-canonical-comparison"], checkIds: ["brand-name-check"] },
    ...overrides,
  });
  if (!appended.ok) throw new Error("append failed");
  return appended.value;
}

function withFieldConfirmation(): PrecheckResult {
  const appended = appendHumanFieldConfirmation(baseResult(), {
    confirmationId: "field-confirmation-1",
    fieldId: "brandName",
    decisionType: "accepted-machine-reading",
    recordedAt: "2026-07-13T10:00:00Z",
  });
  if (!appended.ok) throw new Error("field confirmation failed");
  return appended.value;
}

const CHECKSUM = "a".repeat(64);

function html(result: PrecheckResult): string {
  const built = buildReadableReport({ result, jsonChecksum: CHECKSUM });
  if (!built.ok) throw new Error("report failed");
  return built.value.html;
}

describe("buildReadableReport", () => {
  it("derives a deterministic filename from the machine-result id only", () => {
    const result = baseResult();
    const built = buildReadableReport({ result, jsonChecksum: CHECKSUM });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.value.schemaVersion).toBe(REPORT_SCHEMA_VERSION);
    expect(built.value.filename).toBe(`label-lens-wine-precheck-${result.machineResultId}.html`);
    expect(built.value.filename).toMatch(
      /^label-lens-wine-precheck-precheck-result\.v1-[0-9a-f]{64}\.html$/,
    );
    // No timestamp or user filename in the export filename.
    expect(reportFilename(result).ok).toBe(true);
  });

  it("renders the advisory boundary and the machine/disposition separation", () => {
    const text = html(baseResult());
    expect(text).toMatch(/not a TTB approval/i);
    expect(text).toMatch(/does not change the automated findings/i);
    expect(text).toMatch(REPORT_SCHEMA_VERSION);
    expect(text).toMatch(new RegExp(CHECKSUM));
  });

  it("renders a separate reviewed-confirmation section without rewriting machine evidence", () => {
    const text = html(withFieldConfirmation());
    expect(text).toMatch(/Reviewed confirmation/);
    expect(text).toMatch(/Accepted machine reading/);
    expect(text).toMatch(/Machine observation remains preserved exactly/i);
  });

  it("includes all six findings in exact registry order", () => {
    const text = html(baseResult());
    const order = [
      "wine-alcohol-syntax",
      "brand-name-canonical-comparison",
      "wine-alcohol-declared-comparison",
      "wine-alcohol-actual-content-tolerance",
      "wine-alcohol-class-type-boundary",
      "wine-alcohol-omission-eligibility",
    ];
    const positions = order.map((id) => text.indexOf(id));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    // External-dependency explanations are present for the not_run checks.
    expect(text).toMatch(/External evidence required/);
  });

  it("renders the appended disposition history exactly", () => {
    const text = html(withDisposition());
    expect(text).toMatch(/Sequence 1/);
    expect(text).toMatch(/escalated_for_human_review/);
    expect(text).toMatch(/NEEDS_SECOND_LOOK/);
    expect(text).toMatch(/reviewer-7/);
    expect(text).toMatch(/2026-07-11T09:00:00Z/);
    expect(text).toMatch(/Brand mark unclear\./);
    expect(text).toMatch(/rule:brand-name-canonical-comparison/);
  });

  it("contains no overall verdict, score, or approval/rejection language", () => {
    const text = html(withDisposition());
    expect(text).not.toMatch(/\b(Approved|Rejected|Compliant|Noncompliant)\b/);
    expect(text).not.toMatch(/compliance (score|percentage)|readiness score|overall status/i);
  });

  it("carries no local paths, image/model bytes, logs, or timings", () => {
    const text = html(withDisposition());
    expect(text).not.toMatch(/\/Users\/|\/home\/|node_modules|traineddata|durationMs|\.wasm/);
  });

  it("is byte-identical for the same result, history, and schema version", () => {
    expect(html(withDisposition())).toBe(html(withDisposition()));
  });

  it("rejects a result whose machine-result id is not a stable identity", () => {
    const bad = { ...baseResult(), machineResultId: "not-a-valid-id" } as PrecheckResult;
    const built = buildReadableReport({ result: bad, jsonChecksum: CHECKSUM });
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error.code).toBe("INVALID_REPORT_IDENTITY");
  });
});
