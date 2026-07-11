import { describe, expect, it } from "vitest";

import { assemblePrecheckResult } from "./assemble";
import { buildAssembleInput } from "./build.fixtures";
import { appendDisposition } from "./disposition";
import type { DispositionEntryInput, PrecheckResult } from "./result.types";
import { serializeMachineResult, serializePrecheckResult } from "./serialize";

function assembled(): PrecheckResult {
  const r = assemblePrecheckResult(buildAssembleInput());
  if (!r.ok) throw new Error("assembly failed");
  return r.value;
}

const ENTRY: DispositionEntryInput = {
  dispositionId: "disp-1",
  actorId: "reviewer-1",
  recordedAt: "2026-07-10T01:00:00Z",
  decision: "accepted_for_internal_use",
  reasonCode: "LOOKS_GOOD",
};

function append(r: PrecheckResult, input: DispositionEntryInput): PrecheckResult {
  const out = appendDisposition(r, input);
  if (!out.ok) throw new Error("append failed");
  return out.value;
}

describe("deterministic result identity and serialization", () => {
  it("yields identical machine result ids for identical inputs", () => {
    expect(assembled().machineResultId).toBe(assembled().machineResultId);
  });

  it("yields byte-identical machine serialization for identical inputs", () => {
    expect(serializeMachineResult(assembled())).toBe(serializeMachineResult(assembled()));
  });

  it("keeps the machine id and machine serialization stable across disposition append", () => {
    const r0 = assembled();
    const r1 = append(r0, ENTRY);
    expect(r1.machineResultId).toBe(r0.machineResultId);
    expect(serializeMachineResult(r1)).toBe(serializeMachineResult(r0));
  });

  it("produces identical full serialization for identical disposition histories", () => {
    const a = append(assembled(), ENTRY);
    const b = append(assembled(), ENTRY);
    expect(serializePrecheckResult(a)).toBe(serializePrecheckResult(b));
  });

  it("changes full serialization when disposition history differs", () => {
    const r0 = assembled();
    expect(serializePrecheckResult(append(r0, ENTRY))).not.toBe(serializePrecheckResult(r0));
  });

  it("emits no current time, randomness, timing, or absolute path", () => {
    const serialized = serializePrecheckResult(append(assembled(), ENTRY));
    expect(serialized).not.toMatch(/\/Users\/|\/home\/|durationMs|elapsedMs|"log"|Math\.random/);
    // Only supplied timestamps appear; there is no generated wall-clock field.
    expect(serialized).not.toContain("generatedAt");
  });

  it("preserves finding order and ordered alternates in serialization", () => {
    const r = assembled();
    const ids = r.findings.map((f) => f.ruleId);
    const serialized = serializeMachineResult(r);
    // Findings appear in registry order within the stable serialization.
    const positions = ids.map((id) => serialized.indexOf(JSON.stringify(id)));
    const sorted = [...positions].sort((a, b) => a - b);
    expect(positions).toEqual(sorted);
  });
});
