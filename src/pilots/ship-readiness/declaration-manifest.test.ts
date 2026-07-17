import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { sha256Hex } from "@/pipeline/extractor/image-integrity";

import {
  DECLARATION_MANIFEST_SCHEMA_VERSION,
  PRODUCT_BOUNDARY_STATEMENT,
  checkNoLeakage,
  computeCandidateAccounting,
  computeDeclarationInputDigest,
  computeEntryDigest,
  computeFullManifestDigest,
  createAuthorizedRootReader,
  eligibleMembershipFreezeAuthorized,
  isDeclarationProvenanceComplete,
  isSafeSourceRelRef,
  isSupportedDeclaredAlcohol,
  normalizeDeclaredAlcohol,
  normalizeDeclaredBrand,
  parseCandidateInputs,
  pilotExecutionAuthorized,
  sniffMediaType,
  validateDeclarationManifest,
  verifySourceBytes,
  verifySourcesAgainstInventory,
  verifySourcesWithReader,
  type DeclaredValue,
  type DeclarationEntry,
  type DeclarationManifest,
  type DeclarationTiming,
} from "./declaration-manifest";

function digest(seed: number): string {
  return seed.toString(16).padStart(64, "0");
}
function presentBrand(exact = "North Ridge"): DeclaredValue {
  return {
    exactSourceText: exact,
    normalizedComparisonForm: normalizeDeclaredBrand(exact),
    valueState: "PRESENT",
    uncertaintyState: "CERTAIN",
  };
}
function presentAlcohol(exact = "12.5% ALC./VOL."): DeclaredValue {
  return {
    exactSourceText: exact,
    normalizedComparisonForm: normalizeDeclaredAlcohol(exact),
    valueState: "PRESENT",
    uncertaintyState: "CERTAIN",
  };
}
function pendingValue(): DeclaredValue {
  return {
    exactSourceText: null,
    normalizedComparisonForm: null,
    valueState: "PENDING_INDEPENDENT_SOURCE",
    uncertaintyState: "UNCERTAIN",
  };
}
const FULL_TIMING: DeclarationTiming = {
  intakeStartTimestamp: "2026-07-16T00:05:00Z",
  intakeCompletionTimestamp: "2026-07-16T00:10:00Z",
  sourceSearchMs: 120000,
  transcriptionMs: 60000,
  verificationMs: 30000,
  totalIntakeBurdenMs: 210000,
};

function primaryEntry(n: number, over: Partial<DeclarationEntry> = {}): DeclarationEntry {
  return {
    runId: "ship-readiness-002",
    run002CaseId: `r2-case-${String(n).padStart(3, "0")}`,
    sourceImageRef: `ship-readiness-001/raw/r2-case-${String(n).padStart(3, "0")}.jpeg`,
    sourceImageSha256: digest(100 + n),
    sourceMediaType: "image/jpeg",
    sourceByteSize: 1000 + n,
    priorPilotIdentity: `pilot-wine-${String(n).padStart(3, "0")}`,
    declaredBrand: presentBrand(),
    declaredAlcohol: presentAlcohol(),
    declarationSourceType: "GENUINE_APPLICATION_PACKAGE",
    declarationSourceRef: "application-package/COLA-2026-000123",
    sourceAccessDate: "2026-07-16T00:00:00Z",
    recordedBy: { identity: "intake-operator-1", role: "controlled-intake" },
    recordedTimestamp: "2026-07-16T00:10:00Z",
    transcriptionMethod: "manual keyed from application package, double-checked",
    independenceStatement:
      "Established from the application package before any run-002 randomization, reviewer exposure, or machine pass.",
    timing: { ...FULL_TIMING },
    primaryBlindEligibilityState: "PRIMARY_BLIND_CANDIDATE",
    exclusionOrNonBlindReason: null,
    schemaVersion: DECLARATION_MANIFEST_SCHEMA_VERSION,
    manifestEntryDigest: null,
    ...over,
  };
}
function pendingEntry(n: number, over: Partial<DeclarationEntry> = {}): DeclarationEntry {
  return primaryEntry(n, {
    declaredBrand: pendingValue(),
    declaredAlcohol: pendingValue(),
    declarationSourceType: null,
    declarationSourceRef: null,
    sourceAccessDate: null,
    recordedBy: null,
    recordedTimestamp: null,
    transcriptionMethod: null,
    independenceStatement: null,
    timing: {
      intakeStartTimestamp: null,
      intakeCompletionTimestamp: null,
      sourceSearchMs: null,
      transcriptionMs: null,
      verificationMs: null,
      totalIntakeBurdenMs: null,
    },
    primaryBlindEligibilityState: "PENDING_SOURCE_VERIFICATION",
    ...over,
  });
}
function manifest(
  entries: DeclarationEntry[],
  over: Partial<DeclarationManifest> = {},
): DeclarationManifest {
  return {
    schemaVersion: DECLARATION_MANIFEST_SCHEMA_VERSION,
    runId: "ship-readiness-002",
    productBoundaryStatement: PRODUCT_BOUNDARY_STATEMENT,
    randomizationTimestamp: null,
    reviewerExposureTimestamp: null,
    machineExecutionTimestamp: null,
    expectedCandidateCount: entries.length,
    preparedAt: "2026-07-16T00:00:00Z",
    preparedBy: "test",
    entries,
    declarationInputDigest: null,
    fullManifestDigest: null,
    ...over,
  };
}
function sealed(m: DeclarationManifest): DeclarationManifest {
  return {
    ...m,
    declarationInputDigest: computeDeclarationInputDigest(m),
    fullManifestDigest: computeFullManifestDigest(m),
  };
}
const issuesOf = (input: unknown) => validateDeclarationManifest(input).issues.join("\n");

describe("declaration manifest — authorization + valid manifests", () => {
  it("keeps freeze and execution unauthorized", () => {
    expect(eligibleMembershipFreezeAuthorized).toBe(false);
    expect(pilotExecutionAuthorized).toBe(false);
  });

  it("validates a mixed manifest and counts only provenance-complete declarations", () => {
    const m = manifest([
      primaryEntry(1),
      pendingEntry(2),
      pendingEntry(3, {
        priorPilotIdentity: "pilot-wine-005",
        primaryBlindEligibilityState: "NON_BLIND_OPERATIONAL",
        exclusionOrNonBlindReason: "already exposed",
      }),
      pendingEntry(4, {
        primaryBlindEligibilityState: "EXCLUDED",
        exclusionOrNonBlindReason: "OUTSIDE_PRIMARY_BEVERAGE_SCOPE_CIDER",
      }),
    ]);
    expect(validateDeclarationManifest(m)).toEqual({ ok: true, issues: [] });
    expect(computeCandidateAccounting(m)).toMatchObject({
      totalCandidateImages: 4,
      primaryBlindCandidates: 1,
      pending: 1,
      nonBlindOperational: 1,
      excluded: 1,
      declarationsComplete: 1,
    });
  });

  it("accepts a complete controlled-transcription entry with its source type kept distinct", () => {
    const controlled = primaryEntry(1, {
      declarationSourceType: "CONTROLLED_INTAKE_TRANSCRIPTION",
      declarationSourceRef: "controlled-intake/session-2026-07-16",
    });
    const genuine = primaryEntry(2);
    const m = manifest([controlled, genuine]);
    expect(validateDeclarationManifest(m).ok).toBe(true);
    expect(isDeclarationProvenanceComplete(controlled, m)).toBe(true);
    expect(isDeclarationProvenanceComplete(genuine, m)).toBe(true);
    expect(controlled.declarationSourceType).not.toBe(genuine.declarationSourceType);
  });
});

describe("declaration manifest — runtime fail-closed parsing (untrusted JSON)", () => {
  it("never throws and reports issues for null / non-object manifest", () => {
    expect(() => validateDeclarationManifest(null)).not.toThrow();
    expect(validateDeclarationManifest(null).ok).toBe(false);
    expect(issuesOf(null)).toMatch(/must be a JSON object/);
    expect(validateDeclarationManifest("nope").ok).toBe(false);
    expect(validateDeclarationManifest(42).ok).toBe(false);
  });

  it("rejects a null entry without throwing", () => {
    const m = { ...manifest([primaryEntry(1)]), entries: [null] };
    expect(() => validateDeclarationManifest(m)).not.toThrow();
    expect(issuesOf(m)).toMatch(/entries\[0\] must be an object/);
  });

  it("rejects missing declaredBrand / declaredAlcohol / timing without throwing", () => {
    for (const key of ["declaredBrand", "declaredAlcohol", "timing"]) {
      const e = { ...primaryEntry(1) } as Record<string, unknown>;
      delete e[key];
      const m = { ...manifest([]), entries: [e], expectedCandidateCount: 1 };
      expect(() => validateDeclarationManifest(m)).not.toThrow();
      expect(issuesOf(m)).toMatch(new RegExp(`entries\\[0\\]\\.${key} must be an object`));
    }
  });

  it("rejects malformed recordedBy", () => {
    const m = {
      ...manifest([]),
      entries: [{ ...primaryEntry(1), recordedBy: [1, 2, 3] }],
      expectedCandidateCount: 1,
    };
    expect(issuesOf(m)).toMatch(/recordedBy must be an object or null/);
  });

  it("rejects unknown keys at manifest and entry level", () => {
    expect(issuesOf({ ...manifest([primaryEntry(1)]), sneaky: 1 })).toMatch(
      /manifest: unknown key "sneaky"/,
    );
    const m = {
      ...manifest([]),
      entries: [{ ...primaryEntry(1), extra: 1 }],
      expectedCandidateCount: 1,
    };
    expect(issuesOf(m)).toMatch(/entries\[0\]: unknown key "extra"/);
  });

  it("recursively rejects nested machine output and nested prior reviewer answers", () => {
    const nestedMachine = {
      ...manifest([]),
      entries: [{ ...primaryEntry(1), timing: { ...FULL_TIMING, machineOutput: "leak" } }],
      expectedCandidateCount: 1,
    };
    expect(issuesOf(nestedMachine)).toMatch(
      /forbidden run-001-outcome\/machine-result key "machineOutput"/,
    );
    const nestedAnswer = {
      ...manifest([]),
      entries: [
        { ...primaryEntry(1), declaredBrand: { ...presentBrand(), reviewerAnswer: "Georgetown" } },
      ],
      expectedCandidateCount: 1,
    };
    expect(issuesOf(nestedAnswer)).toMatch(
      /forbidden run-001-outcome\/machine-result key "reviewerAnswer"/,
    );
  });

  it("rejects wrong primitive and collection types without throwing", () => {
    const wrongPrimitive = {
      ...manifest([]),
      entries: [{ ...primaryEntry(1), sourceByteSize: "big" }],
      expectedCandidateCount: 1,
    };
    expect(() => validateDeclarationManifest(wrongPrimitive)).not.toThrow();
    expect(issuesOf(wrongPrimitive)).toMatch(/sourceByteSize must be a positive integer/);
    const wrongCollection = {
      ...manifest([]),
      entries: [{ ...primaryEntry(1), declaredBrand: ["array-not-object"] }],
      expectedCandidateCount: 1,
    };
    expect(issuesOf(wrongCollection)).toMatch(/declaredBrand must be an object/);
    expect(issuesOf({ ...manifest([primaryEntry(1)]), entries: {} })).toMatch(
      /entries must be an array/,
    );
  });
});

describe("declaration manifest — provenance completeness", () => {
  it("does not count PRESENT values without provenance as complete", () => {
    const bare = pendingEntry(1, {
      declaredBrand: presentBrand(),
      declaredAlcohol: presentAlcohol(),
      primaryBlindEligibilityState: "NON_BLIND_OPERATIONAL",
      exclusionOrNonBlindReason: "exposed",
    });
    const m = manifest([bare]);
    expect(isDeclarationProvenanceComplete(bare, m)).toBe(false);
    expect(computeCandidateAccounting(m).declarationsComplete).toBe(0);
    expect(validateDeclarationManifest(m).ok).toBe(true);
  });

  it("treats pending source verification as incomplete", () => {
    const m = manifest([pendingEntry(1)]);
    expect(isDeclarationProvenanceComplete(m.entries[0], m)).toBe(false);
    expect(computeCandidateAccounting(m).declarationsComplete).toBe(0);
  });

  it("rejects a primary candidate with only total duration but missing start/completion/components", () => {
    const e = primaryEntry(1, {
      timing: {
        intakeStartTimestamp: null,
        intakeCompletionTimestamp: null,
        sourceSearchMs: null,
        transcriptionMs: null,
        verificationMs: null,
        totalIntakeBurdenMs: 210000,
      },
    });
    const out = issuesOf(manifest([e]));
    expect(out).toMatch(/requires timing.intakeStartTimestamp/);
    expect(out).toMatch(/requires timing.intakeCompletionTimestamp/);
    expect(out).toMatch(/requires a non-negative timing.sourceSearchMs/);
    expect(isDeclarationProvenanceComplete(e, manifest([e]))).toBe(false);
  });

  it("requires source access date, start, completion, and each component timing", () => {
    expect(issuesOf(manifest([primaryEntry(1, { sourceAccessDate: null })]))).toMatch(
      /requires a sourceAccessDate/,
    );
    expect(
      issuesOf(
        manifest([primaryEntry(1, { timing: { ...FULL_TIMING, intakeStartTimestamp: null } })]),
      ),
    ).toMatch(/requires timing.intakeStartTimestamp/);
    expect(
      issuesOf(
        manifest([
          primaryEntry(1, { timing: { ...FULL_TIMING, intakeCompletionTimestamp: null } }),
        ]),
      ),
    ).toMatch(/requires timing.intakeCompletionTimestamp/);
    expect(
      issuesOf(manifest([primaryEntry(1, { timing: { ...FULL_TIMING, verificationMs: null } })])),
    ).toMatch(/requires a non-negative timing.verificationMs/);
  });
});

describe("declaration manifest — original adversarial rejections", () => {
  const bad = (e: DeclarationEntry, re: RegExp) => expect(issuesOf(manifest([e]))).toMatch(re);

  it("rejects forbidden top-level machine key", () =>
    bad(
      { ...primaryEntry(1), machineBrand: "x" } as unknown as DeclarationEntry,
      /forbidden run-001-outcome\/machine-result key "machineBrand"/,
    ));
  it("rejects a source ref pointing at a prior reviewer answer", () =>
    bad(
      primaryEntry(1, { declarationSourceRef: "run-001/manual-baseline/pilot-wine-001" }),
      /forbidden provenance source/,
    ));
  it("rejects a declaration recorded after reviewer exposure", () =>
    expect(
      issuesOf(
        manifest([primaryEntry(1, { recordedTimestamp: "2026-07-16T09:00:00Z" })], {
          reviewerExposureTimestamp: "2026-07-16T08:00:00Z",
        }),
      ),
    ).toMatch(/before reviewerExposureTimestamp/));
  it("rejects a missing source reference on a primary candidate", () =>
    bad(primaryEntry(1, { declarationSourceRef: null }), /requires a declarationSourceRef/));
  it("rejects a duplicate image in the primary blind pool", () =>
    expect(
      issuesOf(manifest([primaryEntry(1), primaryEntry(2, { sourceImageSha256: digest(101) })])),
    ).toMatch(/primary-blind pool reuses image/));
  it("rejects an exposed case placed in the blind pool", () =>
    bad(
      primaryEntry(5, { priorPilotIdentity: "pilot-wine-005" }),
      /exposed prior identity pilot-wine-005 cannot be a PRIMARY_BLIND_CANDIDATE/,
    ));
  it("rejects whitespace-only declared values", () =>
    bad(
      primaryEntry(1, {
        declaredBrand: {
          exactSourceText: "   ",
          normalizedComparisonForm: "",
          valueState: "PRESENT",
          uncertaintyState: "CERTAIN",
        },
      }),
      /must be non-empty and not whitespace-only/,
    ));
  it("rejects uncontrolled normalization", () =>
    bad(
      primaryEntry(1, {
        declaredBrand: {
          exactSourceText: "North Ridge",
          normalizedComparisonForm: "totally-different",
          valueState: "PRESENT",
          uncertaintyState: "CERTAIN",
        },
      }),
      /not the governed normalization/,
    ));
  it("rejects a case-count mismatch", () =>
    expect(issuesOf(manifest([primaryEntry(1)], { expectedCandidateCount: 24 }))).toMatch(
      /must equal expectedCandidateCount 24/,
    ));

  it("detects post-seal field tampering via the entry digest", () => {
    const e = primaryEntry(1);
    const sealedEntry = { ...e, manifestEntryDigest: computeEntryDigest(e) };
    const tampered = { ...sealedEntry, sourceByteSize: sealedEntry.sourceByteSize + 1 };
    bad(tampered, /manifestEntryDigest does not match/);
  });
});

describe("declaration manifest — dual sealing semantics", () => {
  it("declarationInputDigest ignores preparer + lifecycle timestamps; fullManifestDigest binds them", () => {
    const base = manifest([primaryEntry(1)]);
    const inputD = computeDeclarationInputDigest(base);
    const fullD = computeFullManifestDigest(base);
    const changedPreparer = { ...base, preparedBy: "someone-else" };
    const changedLifecycle = { ...base, randomizationTimestamp: "2026-07-16T12:00:00Z" };
    expect(computeDeclarationInputDigest(changedPreparer)).toBe(inputD);
    expect(computeDeclarationInputDigest(changedLifecycle)).toBe(inputD);
    expect(computeFullManifestDigest(changedPreparer)).not.toBe(fullD);
    expect(computeFullManifestDigest(changedLifecycle)).not.toBe(fullD);
    const changedValue = manifest([
      primaryEntry(1, { declaredBrand: presentBrand("Different Brand") }),
    ]);
    expect(computeDeclarationInputDigest(changedValue)).not.toBe(inputD);
    expect(computeFullManifestDigest(changedValue)).not.toBe(fullD);
  });

  it("validation detects a tampered fullManifestDigest and a tampered declarationInputDigest", () => {
    const m = sealed(manifest([primaryEntry(1)]));
    expect(validateDeclarationManifest(m)).toEqual({ ok: true, issues: [] });
    expect(issuesOf({ ...m, preparedBy: "attacker" })).toMatch(/fullManifestDigest does not match/);
    expect(
      issuesOf({ ...m, entries: [primaryEntry(1, { declaredBrand: presentBrand("Tamper") })] }),
    ).toMatch(/declarationInputDigest does not match/);
  });
});

describe("declaration manifest — alcohol input compatibility", () => {
  it("accepts bare bounded numeric declared alcohol (deployed workflow form)", () => {
    for (const bare of ["12", "12.5", "9", "0", "14.0"]) {
      expect(isSupportedDeclaredAlcohol(bare)).toBe(true);
      const m = manifest([
        primaryEntry(1, {
          declaredAlcohol: {
            exactSourceText: bare,
            normalizedComparisonForm: normalizeDeclaredAlcohol(bare),
            valueState: "PRESENT",
            uncertaintyState: "CERTAIN",
          },
        }),
      ]);
      expect(validateDeclarationManifest(m).ok).toBe(true);
      expect(m.entries[0].declaredAlcohol.exactSourceText).toBe(bare);
    }
  });
  it("still accepts marker forms and rejects non-alcohol text", () => {
    expect(isSupportedDeclaredAlcohol("12.5% ALC./VOL.")).toBe(true);
    expect(isSupportedDeclaredAlcohol("13% by volume")).toBe(true);
    expect(isSupportedDeclaredAlcohol("Napa Valley")).toBe(false);
    expect(isSupportedDeclaredAlcohol("Route 66 Red")).toBe(false);
    expect(isSupportedDeclaredAlcohol("120")).toBe(false);
  });
});

describe("declaration manifest — source-byte integrity", () => {
  const jpeg = (tag = 1) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, tag]);
  const png = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
  function realSourceEntry(n: number, bytes: Uint8Array): DeclarationEntry {
    return primaryEntry(n, {
      sourceImageSha256: sha256Hex(bytes),
      sourceByteSize: bytes.length,
      sourceMediaType: sniffMediaType(bytes)!,
    });
  }

  it("sniffs media type from magic bytes", () => {
    expect(sniffMediaType(jpeg())).toBe("image/jpeg");
    expect(sniffMediaType(png())).toBe("image/png");
    expect(sniffMediaType(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("passes a valid source and fails changed bytes, wrong size, wrong digest, wrong media", () => {
    const bytes = jpeg(1);
    expect(verifySourceBytes(realSourceEntry(1, bytes), bytes)).toEqual([]);
    expect(verifySourceBytes(realSourceEntry(1, bytes), jpeg(2)).join()).toMatch(/sha256 mismatch/);
    expect(
      verifySourceBytes(
        { ...realSourceEntry(1, bytes), sourceByteSize: bytes.length + 5 },
        bytes,
      ).join(),
    ).toMatch(/byte size mismatch/);
    expect(
      verifySourceBytes(
        { ...realSourceEntry(1, bytes), sourceImageSha256: digest(7) },
        bytes,
      ).join(),
    ).toMatch(/sha256 mismatch/);
    expect(
      verifySourceBytes(
        { ...realSourceEntry(1, bytes), sourceMediaType: "image/png" },
        bytes,
      ).join(),
    ).toMatch(/media type mismatch/);
  });

  it("rejects missing files and path traversal via the confined reader", () => {
    expect(isSafeSourceRelRef("ship-readiness-001/raw/x.jpeg")).toBe(true);
    expect(isSafeSourceRelRef("../escape.jpeg")).toBe(false);
    expect(isSafeSourceRelRef("/abs/x.jpeg")).toBe(false);
    const bytes = jpeg(1);
    const m = manifest([
      realSourceEntry(1, bytes),
      primaryEntry(2, { sourceImageRef: "../escape.jpeg" }),
    ]);
    const missing = verifySourcesWithReader(m, () => null);
    expect(missing.results[0].issues.join()).toMatch(/not found under the authorized root/);
    const traversal = verifySourcesWithReader(m, (ref) =>
      ref === m.entries[0].sourceImageRef ? bytes : null,
    );
    expect(traversal.results[1].issues.join()).toMatch(/not a safe in-root relative path/);
  });

  it("verifies against a trusted inventory and flags mismatch", () => {
    const bytes = jpeg(1);
    const e = realSourceEntry(1, bytes);
    const m = manifest([e]);
    expect(
      verifySourcesAgainstInventory(m, [
        { sha256: e.sourceImageSha256, sizeBytes: e.sourceByteSize },
      ]).ok,
    ).toBe(true);
    expect(verifySourcesAgainstInventory(m, []).results[0].issues.join()).toMatch(
      /not present in the trusted inventory/,
    );
    expect(
      verifySourcesAgainstInventory(m, [
        { sha256: e.sourceImageSha256, sizeBytes: e.sourceByteSize + 1 },
      ]).results[0].issues.join(),
    ).toMatch(/byte size mismatch against trusted inventory/);
  });
});

describe("no-leakage gate", () => {
  it("passes for a clean manifest and fails on premature lifecycle state or nested leakage", () => {
    expect(checkNoLeakage(manifest([pendingEntry(1)]))).toEqual({ ok: true, issues: [] });
    expect(
      checkNoLeakage(
        manifest([pendingEntry(1)], { randomizationTimestamp: "2026-07-16T10:00:00Z" }),
      ).issues.join(),
    ).toMatch(/randomizationTimestamp must be null/);
    const nested = {
      ...manifest([pendingEntry(1)]),
      entries: [{ ...pendingEntry(1), timing: { ...pendingEntry(1).timing, adjudication: "x" } }],
    } as unknown as DeclarationManifest;
    expect(checkNoLeakage(nested).issues.join()).toMatch(
      /forbidden run-001-outcome\/machine-result key "adjudication"/,
    );
  });
});

describe("declaration manifest — exact per-field type validation (all states)", () => {
  it("type-checks manifest metadata without throwing", () => {
    expect(issuesOf({ ...manifest([pendingEntry(1)]), preparedAt: 7 })).toMatch(
      /preparedAt must be a string/,
    );
    expect(issuesOf({ ...manifest([pendingEntry(1)]), preparedBy: {} })).toMatch(
      /preparedBy must be a string/,
    );
    expect(issuesOf({ ...manifest([pendingEntry(1)]), randomizationTimestamp: {} })).toMatch(
      /randomizationTimestamp must be a string or null/,
    );
    expect(() =>
      validateDeclarationManifest({ ...manifest([pendingEntry(1)]), preparedAt: 7 }),
    ).not.toThrow();
  });

  it("type-checks pending / non-primary entry fields, not only primary candidates", () => {
    const bad = (over: Record<string, unknown>, re: RegExp) => {
      const m = {
        ...manifest([]),
        entries: [{ ...pendingEntry(1), ...over }],
        expectedCandidateCount: 1,
      };
      expect(() => validateDeclarationManifest(m)).not.toThrow();
      expect(issuesOf(m)).toMatch(re);
    };
    bad({ declarationSourceRef: 12 }, /declarationSourceRef must be a string or null/);
    bad({ recordedBy: { identity: 1, role: [] } }, /recordedBy\.identity must be a string/);
    bad({ recordedBy: { identity: 1, role: [] } }, /recordedBy\.role must be a string/);
    bad(
      { transcriptionMethod: { machine_output: "x" } },
      /transcriptionMethod must be a string or null/,
    );
    bad({ priorPilotIdentity: [] }, /priorPilotIdentity must be a string or null/);
    bad({ exclusionOrNonBlindReason: false }, /exclusionOrNonBlindReason must be a string or null/);
  });

  it("rejects a non-null normalizedComparisonForm on a non-PRESENT value", () => {
    const m = manifest([
      pendingEntry(1, {
        declaredBrand: {
          exactSourceText: null,
          normalizedComparisonForm: "should-be-null",
          valueState: "PENDING_INDEPENDENT_SOURCE",
          uncertaintyState: "UNCERTAIN",
        },
      }),
    ]);
    expect(issuesOf(m)).toMatch(
      /normalizedComparisonForm must be null unless valueState is PRESENT/,
    );
  });
});

describe("candidate-input fail-closed parsing", () => {
  const goodCandidate = {
    run002CaseId: "r2-case-001",
    sourceImageRef: "ship-readiness-001/raw/pilot-wine-001.jpeg",
    sourceImageSha256: digest(1),
    sourceMediaType: "image/jpeg",
    sourceByteSize: 1000,
    priorPilotIdentity: "pilot-wine-001",
    eligibility: "PENDING_SOURCE_VERIFICATION",
    reason: "pending",
  };
  const parseIssues = (raw: unknown) => parseCandidateInputs(raw).issues.join("\n");

  it("accepts a valid candidate array (reason optional)", () => {
    const { reason: _r, ...noReason } = goodCandidate;
    void _r;
    const parsed = parseCandidateInputs([goodCandidate, noReason]);
    expect(parsed.ok).toBe(true);
    expect(parsed.candidates).toHaveLength(2);
    expect(parsed.candidates[1].reason).toBeNull();
  });

  it("fails closed on null, object-not-array, and a null candidate without throwing", () => {
    expect(() => parseCandidateInputs(null)).not.toThrow();
    expect(parseIssues(null)).toMatch(/candidates must be an array/);
    expect(parseIssues({})).toMatch(/candidates must be an array/);
    expect(parseIssues([null])).toMatch(/candidates\[0\] must be an object/);
  });

  it("rejects missing fields, wrong types, unknown fields, invalid eligibility, malformed reason", () => {
    expect(parseIssues([{ ...goodCandidate, run002CaseId: undefined }])).toMatch(
      /run002CaseId must match/,
    );
    expect(parseIssues([{ ...goodCandidate, sourceByteSize: "big" }])).toMatch(
      /sourceByteSize must be a positive integer/,
    );
    expect(parseIssues([{ ...goodCandidate, extra: 1 }])).toMatch(
      /candidates\[0\]: unknown key "extra"/,
    );
    expect(parseIssues([{ ...goodCandidate, eligibility: "MADE_UP" }])).toMatch(
      /eligibility must be a valid eligibility state/,
    );
    expect(parseIssues([{ ...goodCandidate, reason: 5 }])).toMatch(
      /reason must be a string, null, or omitted/,
    );
    expect(parseIssues([{ ...goodCandidate, sourceImageSha256: "TOOSHORT" }])).toMatch(
      /sourceImageSha256 must be a 64-char/,
    );
  });
});

describe("authorized-root reader — symlink escape", () => {
  const jpeg = (tag = 1) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, tag]);

  it("reads a legitimate in-root file but refuses an in-root symlink pointing outside the root", () => {
    const root = mkdtempSync(join(tmpdir(), "authroot-"));
    const outside = mkdtempSync(join(tmpdir(), "outside-"));
    mkdirSync(join(root, "raw"));
    const good = jpeg(1);
    writeFileSync(join(root, "raw", "real.jpeg"), Buffer.from(good));
    writeFileSync(join(outside, "secret.jpeg"), Buffer.from(jpeg(9)));
    symlinkSync(join(outside, "secret.jpeg"), join(root, "raw", "link.jpeg"));

    const reader = createAuthorizedRootReader(root);
    expect(reader("raw/real.jpeg")).not.toBeNull(); // legit in-root file is read
    expect(reader("raw/link.jpeg")).toBeNull(); // escaping symlink refused, outside file never read
    expect(reader("../escape.jpeg")).toBeNull(); // lexical traversal refused

    // End to end: verification fails for the symlinked entry.
    const linked: DeclarationEntry = {
      ...primaryEntry(2),
      sourceImageRef: "raw/link.jpeg",
      sourceImageSha256: sha256Hex(jpeg(9)),
      sourceByteSize: jpeg(9).length,
    };
    const report = verifySourcesWithReader(manifest([linked]), reader);
    expect(report.ok).toBe(false);
    expect(report.results[0].issues.join()).toMatch(/not found under the authorized root/);
  });
});

describe("timing interval + burden consistency (predicate and validation agree)", () => {
  it("rejects a reversed intake interval in both the predicate and validation and excludes it from complete", () => {
    const reversed = primaryEntry(1, {
      primaryBlindEligibilityState: "NON_BLIND_OPERATIONAL",
      exclusionOrNonBlindReason: "exposed",
      timing: {
        ...FULL_TIMING,
        intakeStartTimestamp: "2026-07-16T00:10:00Z",
        intakeCompletionTimestamp: "2026-07-16T00:05:00Z",
      },
    });
    const m = manifest([reversed]);
    expect(isDeclarationProvenanceComplete(reversed, m)).toBe(false);
    expect(computeCandidateAccounting(m).declarationsComplete).toBe(0);
    expect(issuesOf(m)).toMatch(/intakeCompletionTimestamp is before intakeStartTimestamp/);
  });

  it("rejects component totals exceeding total burden in both the predicate and validation", () => {
    const overSum = primaryEntry(1, {
      timing: { ...FULL_TIMING, totalIntakeBurdenMs: 100000 }, // < 120000 + 60000 + 30000
    });
    expect(isDeclarationProvenanceComplete(overSum, manifest([overSum]))).toBe(false);
    expect(issuesOf(manifest([overSum]))).toMatch(
      /totalIntakeBurdenMs must be at least the sum of source-search \+ transcription \+ verification/,
    );
  });
});
