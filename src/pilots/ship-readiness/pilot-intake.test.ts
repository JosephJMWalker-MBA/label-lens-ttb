import { describe, expect, it } from "vitest";

import {
  PILOT_INTAKE_SCHEMA_VERSION,
  expectedAnswersAuthorized,
  generateCounterbalancedOrder,
  realPilotExecutionAuthorized,
  reviewOrderIsReproducible,
  scanCaseForForbiddenKeys,
  validatePilotManifest,
  type PilotCaseEntry,
  type PilotManifest,
} from "./pilot-intake";

function digest(seed: number): string {
  return seed.toString(16).padStart(64, "0");
}

function caseEntry(n: number, overrides: Partial<PilotCaseEntry> = {}): PilotCaseEntry {
  const id = `pilot-wine-${String(n).padStart(3, "0")}`;
  return {
    pilotId: id,
    localFilenameRef: `${id}.jpeg`,
    sourceDigest: digest(n),
    mediaType: "image/jpeg",
    byteSize: 1000 + n,
    width: 900,
    height: 600,
    orientationMetadata: "none",
    derivative: null,
    provenanceStatus: "PENDING_HUMAN_CONFIRMATION",
    intakeStatus: "INCLUDED",
    exclusionOrPendingReason: null,
    challengeTags: ["CLEAN_SIMPLE"],
    challengeTagNote: null,
    nearDuplicateSuspicion: null,
    preparedAt: "2026-07-16T00:00:00Z",
    preparedBy: "test",
    containsExpectedValues: false,
    containsOcrOrModelOutput: false,
    containsComplianceJudgment: false,
    ...overrides,
  };
}

function manifest(count = 24, overrides: Partial<PilotManifest> = {}): PilotManifest {
  return {
    schemaVersion: PILOT_INTAKE_SCHEMA_VERSION,
    pilotCorpusId: "ship-readiness-001",
    expectedCaseCount: count,
    firstId: 1,
    lastId: count,
    preparedAt: "2026-07-16T00:00:00Z",
    preparedBy: "test",
    cases: Array.from({ length: count }, (_, i) => caseEntry(i + 1)),
    ...overrides,
  };
}

describe("pilot intake authorization + schema", () => {
  it("keeps execution and expected answers unauthorized in the schema layer", () => {
    expect(realPilotExecutionAuthorized).toBe(false);
    expect(expectedAnswersAuthorized).toBe(false);
  });

  it("validates a complete 24-case manifest with all IDs represented once", () => {
    expect(validatePilotManifest(manifest())).toEqual({ ok: true, issues: [] });
  });

  it("fails when a numbered ID is missing or duplicated", () => {
    const missing = manifest();
    const dropped = { ...missing, cases: missing.cases.slice(0, 23) };
    expect(validatePilotManifest(dropped).issues.join("\n")).toMatch(/missing required pilotId pilot-wine-024/);

    const dup = manifest();
    const withDup = { ...dup, cases: [...dup.cases.slice(0, 23), caseEntry(1)] };
    expect(validatePilotManifest(withDup).issues.join("\n")).toMatch(/duplicate pilotId pilot-wine-001/);
  });

  it("flags duplicate source digests rather than accepting them silently", () => {
    const m = manifest();
    const collided = { ...m, cases: [...m.cases.slice(0, 23), caseEntry(24, { sourceDigest: digest(1) })] };
    expect(validatePilotManifest(collided).issues.join("\n")).toMatch(/duplicate sourceDigest/);
  });

  it("requires an explicit reason for EXCLUDED_WITH_REASON and PENDING_HUMAN_DECISION", () => {
    const m = manifest();
    const bad = {
      ...m,
      cases: [
        caseEntry(1, { intakeStatus: "EXCLUDED_WITH_REASON", exclusionOrPendingReason: null }),
        ...m.cases.slice(1),
      ],
    };
    expect(validatePilotManifest(bad).issues.join("\n")).toMatch(/EXCLUDED_WITH_REASON requires an explicit reason/);
  });

  it("keeps excluded and pending cases represented in the denominator", () => {
    const m = manifest();
    const withDispositions = {
      ...m,
      cases: [
        caseEntry(1, { intakeStatus: "EXCLUDED_WITH_REASON", exclusionOrPendingReason: "duplicate of pilot-wine-002" }),
        caseEntry(2, { intakeStatus: "PENDING_HUMAN_DECISION", exclusionOrPendingReason: "beverage scope: cider" }),
        ...m.cases.slice(2),
      ],
    };
    const result = validatePilotManifest(withDispositions);
    expect(result.ok).toBe(true);
    expect(withDispositions.cases).toHaveLength(24); // exclusions remain present
  });

  it("rejects forbidden expected-value / model-output keys at runtime (JSON boundary)", () => {
    const smuggled = { ...caseEntry(1), alcoholValue: "12.5", ocrText: "leaked" };
    expect(scanCaseForForbiddenKeys(smuggled, 0).length).toBeGreaterThanOrEqual(2);
    const m = manifest();
    const contaminated = { ...m, cases: [smuggled as unknown as PilotCaseEntry, ...m.cases.slice(1)] };
    expect(validatePilotManifest(contaminated).issues.join("\n")).toMatch(/forbidden expected-value/);
  });

  it("does not throw on a structurally malformed manifest", () => {
    const broken = { ...manifest(), cases: undefined as unknown as PilotManifest["cases"] };
    expect(() => validatePilotManifest(broken)).not.toThrow();
    expect(validatePilotManifest(broken).ok).toBe(false);
  });
});

describe("counterbalanced review order", () => {
  const ids = Array.from({ length: 20 }, (_, i) => `pilot-wine-${String(i + 1).padStart(3, "0")}`);

  it("splits first-mode as evenly as possible and covers every case twice", () => {
    const order = generateCounterbalancedOrder(ids, 42);
    expect(order.manualFirstCount).toBe(10);
    expect(order.assistedFirstCount).toBe(10);
    expect(order.sequence).toHaveLength(ids.length * 2);
    for (const id of ids) {
      const steps = order.sequence.filter((s) => s.pilotId === id);
      expect(steps).toHaveLength(2);
      expect(new Set(steps.map((s) => s.mode)).size).toBe(2); // one of each mode
    }
  });

  it("never schedules a case's two modes back-to-back (washout via two blocks)", () => {
    const order = generateCounterbalancedOrder(ids, 7);
    for (let i = 1; i < order.sequence.length; i += 1) {
      expect(order.sequence[i].pilotId).not.toBe(order.sequence[i - 1].pilotId);
    }
    expect(order.sequence.slice(0, ids.length).every((s) => s.block === 1)).toBe(true);
  });

  it("is deterministic and reproducible from the recorded seed", () => {
    const a = generateCounterbalancedOrder(ids, 123);
    const b = generateCounterbalancedOrder(ids, 123);
    expect(a.sequence).toEqual(b.sequence);
    expect(reviewOrderIsReproducible(a)).toBe(true);
    const different = generateCounterbalancedOrder(ids, 124);
    expect(JSON.stringify(different.sequence)).not.toBe(JSON.stringify(a.sequence));
  });
});
