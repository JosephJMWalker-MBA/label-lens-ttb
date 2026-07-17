import { describe, expect, it } from "vitest";

import {
  DECLARATION_MANIFEST_SCHEMA_VERSION,
  PRODUCT_BOUNDARY_STATEMENT,
  checkNoLeakage,
  computeCandidateAccounting,
  computeEntryDigest,
  computeManifestDigest,
  eligibleMembershipFreezeAuthorized,
  normalizeDeclaredAlcohol,
  normalizeDeclaredBrand,
  pilotExecutionAuthorized,
  validateDeclarationManifest,
  type DeclaredValue,
  type DeclarationEntry,
  type DeclarationManifest,
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

function primaryEntry(n: number, over: Partial<DeclarationEntry> = {}): DeclarationEntry {
  return {
    runId: "ship-readiness-002",
    run002CaseId: `r2-case-${String(n).padStart(3, "0")}`,
    sourceImageRef: `raw/r2-case-${String(n).padStart(3, "0")}.jpeg`,
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
      "Established from the application package before any run-002 randomization, reviewer exposure, or machine pass; not derived from machine output or prior answers.",
    timing: {
      intakeStartTimestamp: "2026-07-16T00:05:00Z",
      intakeCompletionTimestamp: "2026-07-16T00:10:00Z",
      sourceSearchMs: 120000,
      transcriptionMs: 60000,
      verificationMs: 30000,
      totalIntakeBurdenMs: 210000,
    },
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
    priorPilotIdentity: `pilot-wine-${String(n).padStart(3, "0")}`,
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
    manifestDigest: null,
    ...over,
  };
}

describe("declaration manifest — authorization + boundary", () => {
  it("keeps freeze and execution unauthorized in the schema layer", () => {
    expect(eligibleMembershipFreezeAuthorized).toBe(false);
    expect(pilotExecutionAuthorized).toBe(false);
  });

  it("validates a well-formed mixed manifest (primary + pending + non-blind + excluded)", () => {
    const m = manifest([
      primaryEntry(1),
      pendingEntry(2),
      pendingEntry(3, {
        priorPilotIdentity: "pilot-wine-005",
        primaryBlindEligibilityState: "NON_BLIND_OPERATIONAL",
        exclusionOrNonBlindReason: "already exposed during deployment verification",
      }),
      pendingEntry(4, {
        primaryBlindEligibilityState: "EXCLUDED",
        exclusionOrNonBlindReason: "OUTSIDE_PRIMARY_BEVERAGE_SCOPE_CIDER",
      }),
    ]);
    expect(validateDeclarationManifest(m)).toEqual({ ok: true, issues: [] });
    const acct = computeCandidateAccounting(m);
    expect(acct).toMatchObject({
      totalCandidateImages: 4,
      primaryBlindCandidates: 1,
      pending: 1,
      nonBlindOperational: 1,
      excluded: 1,
      declarationsComplete: 1,
    });
  });

  it("keeps digests stable and self-consistent", () => {
    const e = primaryEntry(1);
    const withDigest = { ...e, manifestEntryDigest: computeEntryDigest(e) };
    const m = manifest([withDigest]);
    const frozen = { ...m, manifestDigest: computeManifestDigest(m) };
    expect(validateDeclarationManifest(frozen)).toEqual({ ok: true, issues: [] });
  });

  it("requires the governed product-boundary statement", () => {
    const m = manifest([pendingEntry(1)], {
      productBoundaryStatement: "image-only autonomous extraction",
    });
    expect(validateDeclarationManifest(m).issues.join("\n")).toMatch(/productBoundaryStatement/);
  });
});

describe("declaration manifest — adversarial rejections", () => {
  const bad = (e: DeclarationEntry, re: RegExp) =>
    expect(validateDeclarationManifest(manifest([e])).issues.join("\n")).toMatch(re);

  it("rejects a declaration copied from machine output (forbidden key)", () => {
    const e = { ...primaryEntry(1), machineBrand: "leaked" } as unknown as DeclarationEntry;
    bad(e, /forbidden run-001-outcome\/machine-result key "machineBrand"/);
  });

  it("rejects a declaration copied from a prior reviewer answer (forbidden source + key)", () => {
    bad(
      primaryEntry(1, { declarationSourceRef: "run-001/manual-baseline/pilot-wine-001" }),
      /forbidden provenance source/,
    );
    const e = { ...primaryEntry(1), reviewerAnswer: "Georgetown" } as unknown as DeclarationEntry;
    bad(e, /forbidden run-001-outcome\/machine-result key "reviewerAnswer"/);
  });

  it("rejects a declaration recorded after reviewer exposure", () => {
    const m = manifest([primaryEntry(1, { recordedTimestamp: "2026-07-16T09:00:00Z" })], {
      reviewerExposureTimestamp: "2026-07-16T08:00:00Z",
    });
    expect(validateDeclarationManifest(m).issues.join("\n")).toMatch(
      /before reviewerExposureTimestamp/,
    );
  });

  it("rejects a missing source reference on a primary candidate", () => {
    bad(primaryEntry(1, { declarationSourceRef: null }), /requires a declarationSourceRef/);
  });

  it("rejects a duplicate image in the primary blind pool", () => {
    const a = primaryEntry(1);
    const b = primaryEntry(2, { sourceImageSha256: a.sourceImageSha256 });
    expect(validateDeclarationManifest(manifest([a, b])).issues.join("\n")).toMatch(
      /primary-blind pool reuses image/,
    );
  });

  it("rejects an exposed case placed in the blind pool", () => {
    bad(
      primaryEntry(5, {
        priorPilotIdentity: "pilot-wine-005",
        primaryBlindEligibilityState: "PRIMARY_BLIND_CANDIDATE",
      }),
      /exposed prior identity pilot-wine-005 cannot be a PRIMARY_BLIND_CANDIDATE/,
    );
  });

  it("rejects whitespace-only declared values", () => {
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
    );
  });

  it("rejects changed image bytes recorded after the entry digest (digest mismatch)", () => {
    const e = primaryEntry(1);
    const sealed = { ...e, manifestEntryDigest: computeEntryDigest(e) };
    const tampered = { ...sealed, sourceByteSize: sealed.sourceByteSize + 1 };
    bad(tampered, /manifestEntryDigest does not match/);
  });

  it("rejects uncontrolled normalization of the declared value", () => {
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
    );
  });

  it("rejects incomplete intake timing on a primary candidate", () => {
    bad(
      primaryEntry(1, {
        timing: {
          intakeStartTimestamp: null,
          intakeCompletionTimestamp: null,
          sourceSearchMs: null,
          transcriptionMs: null,
          verificationMs: null,
          totalIntakeBurdenMs: null,
        },
      }),
      /requires a non-negative totalIntakeBurdenMs/,
    );
  });

  it("rejects a case-count mismatch", () => {
    const m = manifest([primaryEntry(1)], { expectedCandidateCount: 24 });
    expect(validateDeclarationManifest(m).issues.join("\n")).toMatch(
      /must equal expectedCandidateCount 24/,
    );
  });

  it("rejects an alcohol declaration that is not a supported statement", () => {
    bad(
      primaryEntry(1, {
        declaredAlcohol: {
          exactSourceText: "Napa Valley",
          normalizedComparisonForm: "",
          valueState: "PRESENT",
          uncertaintyState: "CERTAIN",
        },
      }),
      /not a supported alcohol declaration syntax/,
    );
  });
});

describe("no-leakage gate", () => {
  it("passes for a clean pre-freeze manifest and fails on premature execution state", () => {
    const clean = manifest([pendingEntry(1), pendingEntry(2)]);
    expect(checkNoLeakage(clean)).toEqual({ ok: true, issues: [] });
    const premature = manifest([pendingEntry(1)], {
      randomizationTimestamp: "2026-07-16T10:00:00Z",
    });
    expect(checkNoLeakage(premature).issues.join("\n")).toMatch(
      /randomizationTimestamp must be null/,
    );
  });
});
