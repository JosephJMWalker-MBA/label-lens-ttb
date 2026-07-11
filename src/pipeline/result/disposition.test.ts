import { describe, expect, it } from "vitest";

import { assemblePrecheckResult } from "./assemble";
import { buildAssembleInput } from "./build.fixtures";
import { appendDisposition } from "./disposition";
import { dispositionHistorySchema } from "./result.schema";
import type { DispositionEntryInput, PrecheckResult } from "./result.types";

function result(): PrecheckResult {
  const r = assemblePrecheckResult(buildAssembleInput());
  if (!r.ok) throw new Error("assembly failed");
  return r.value;
}

function entry(overrides: Partial<DispositionEntryInput> = {}): DispositionEntryInput {
  return {
    dispositionId: "disp-1",
    actorId: "reviewer-1",
    recordedAt: "2026-07-10T01:00:00Z",
    decision: "accepted_for_internal_use",
    reasonCode: "LOOKS_GOOD",
    ...overrides,
  };
}

function append(r: PrecheckResult, input: DispositionEntryInput) {
  const out = appendDisposition(r, input);
  if (!out.ok) throw new Error(`append failed: ${JSON.stringify(out.error)}`);
  return out.value;
}

describe("appendDisposition", () => {
  it("starts with an empty history", () => {
    expect(result().humanDispositionHistory).toEqual([]);
  });

  it("appends one entry with an assigned sequence and supplied actor/timestamp", () => {
    const r = append(result(), entry());
    expect(r.humanDispositionHistory).toHaveLength(1);
    const e = r.humanDispositionHistory[0];
    expect(e).toMatchObject({
      dispositionId: "disp-1",
      sequence: 1,
      actorId: "reviewer-1",
      recordedAt: "2026-07-10T01:00:00Z",
      decision: "accepted_for_internal_use",
    });
  });

  it("keeps multiple entries contiguous and ordered", () => {
    const r1 = append(result(), entry({ dispositionId: "d1" }));
    const r2 = append(r1, entry({ dispositionId: "d2", decision: "correction_requested" }));
    const r3 = append(r2, entry({ dispositionId: "d3", decision: "escalated_for_human_review" }));
    expect(r3.humanDispositionHistory.map((e) => e.sequence)).toEqual([1, 2, 3]);
    expect(r3.humanDispositionHistory.map((e) => e.dispositionId)).toEqual(["d1", "d2", "d3"]);
  });

  it("leaves the original result unchanged after append", () => {
    const r0 = result();
    const before = JSON.stringify(r0.humanDispositionHistory);
    append(r0, entry());
    expect(JSON.stringify(r0.humanDispositionHistory)).toBe(before);
    expect(r0.humanDispositionHistory).toHaveLength(0);
  });

  it("rejects a duplicate disposition id", () => {
    const r1 = append(result(), entry({ dispositionId: "dup" }));
    const out = appendDisposition(r1, entry({ dispositionId: "dup" }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("DUPLICATE_DISPOSITION_ID");
  });

  it("does not alter machine findings or the machine result id", () => {
    const r0 = result();
    const r1 = append(r0, entry());
    expect(r1.machineResultId).toBe(r0.machineResultId);
    expect(JSON.stringify(r1.findings)).toBe(JSON.stringify(r0.findings));
  });

  it("cannot express TTB approval or official rejection (decision enum is bounded)", () => {
    const bad = { ...entry(), decision: "approved_by_ttb" as unknown as "no_action" };
    const out = appendDisposition(result(), bad);
    // The decision is not a valid internal-workflow decision, so the resulting
    // history fails validation.
    expect(out.ok).toBe(false);
  });
});

describe("dispositionHistorySchema", () => {
  it("rejects a non-contiguous sequence", () => {
    const bad = [
      {
        dispositionId: "a",
        sequence: 1,
        actorId: "x",
        recordedAt: "t",
        decision: "no_action",
        reasonCode: "r",
      },
      {
        dispositionId: "b",
        sequence: 3,
        actorId: "x",
        recordedAt: "t",
        decision: "no_action",
        reasonCode: "r",
      },
    ];
    expect(dispositionHistorySchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate disposition ids", () => {
    const bad = [
      {
        dispositionId: "a",
        sequence: 1,
        actorId: "x",
        recordedAt: "t",
        decision: "no_action",
        reasonCode: "r",
      },
      {
        dispositionId: "a",
        sequence: 2,
        actorId: "x",
        recordedAt: "t",
        decision: "no_action",
        reasonCode: "r",
      },
    ];
    expect(dispositionHistorySchema.safeParse(bad).success).toBe(false);
  });
});
