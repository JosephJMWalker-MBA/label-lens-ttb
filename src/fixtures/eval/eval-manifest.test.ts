import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { validateEvalManifest } from "./eval-manifest.schema";
import { EVAL_STRATA } from "./eval-manifest.types";
import { EVAL_MANIFEST_PATH, loadEvalManifest } from "./eval-loader";

/**
 * Manifest integrity: the committed evaluation set validates, covers the
 * required strata at the required size, and the schema rejects malformed
 * annotations (a silently-broken case would produce a dishonest baseline).
 */

const committed = JSON.parse(readFileSync(EVAL_MANIFEST_PATH, "utf8")) as unknown;

function goodCase() {
  return {
    caseId: "c1",
    fixtureDir: "approved-wine-001",
    imageFilename: "label.png",
    expectedSha256: "a".repeat(64),
    source: "approved fixture",
    usageStatus: "screened-approved",
    strata: ["simple-centered-brand"],
    brand: { acceptable: ["Brand"], knownAmbiguous: false },
    alcohol: { present: true, acceptablePercents: [14], acceptableText: ["14%"] },
    annotation: { annotatedBy: "x", annotatedOn: "2026-07-12", method: "inspection" },
  };
}

function manifestWith(caseObj: unknown) {
  return { schemaVersion: "extraction-eval-manifest.v1", description: "d", cases: [caseObj] };
}

describe("committed evaluation manifest", () => {
  it("validates", () => {
    expect(validateEvalManifest(committed).ok).toBe(true);
  });

  it("holds 12–20 cases", () => {
    const m = loadEvalManifest();
    expect(m.cases.length).toBeGreaterThanOrEqual(12);
    expect(m.cases.length).toBeLessThanOrEqual(20);
  });

  it("covers every required stratum at least once", () => {
    const m = loadEvalManifest();
    const covered = new Set(m.cases.flatMap((c) => c.strata));
    for (const stratum of EVAL_STRATA) {
      expect(covered, `stratum ${stratum} is uncovered`).toContain(stratum);
    }
  });

  it("includes the documented live case and at least one genuinely-ambiguous case", () => {
    const m = loadEvalManifest();
    expect(m.cases.some((c) => c.caseId === "luigi-giovanni-live")).toBe(true);
    expect(m.cases.some((c) => c.brand.knownAmbiguous)).toBe(true);
    expect(m.cases.some((c) => !c.alcohol.present)).toBe(true);
  });
});

describe("manifest validation rejects malformed annotations", () => {
  it("accepts a well-formed case", () => {
    expect(validateEvalManifest(manifestWith(goodCase())).ok).toBe(true);
  });

  it("rejects an empty acceptable-brand list", () => {
    const c = goodCase();
    c.brand.acceptable = [];
    expect(validateEvalManifest(manifestWith(c)).ok).toBe(false);
  });

  it("rejects present alcohol with no acceptable percents", () => {
    const c = goodCase();
    c.alcohol = { present: true, acceptablePercents: [], acceptableText: [] };
    expect(validateEvalManifest(manifestWith(c)).ok).toBe(false);
  });

  it("rejects absent alcohol that still carries percents", () => {
    const c = goodCase();
    c.alcohol = { present: false, acceptablePercents: [13], acceptableText: [] };
    expect(validateEvalManifest(manifestWith(c)).ok).toBe(false);
  });

  it("rejects a malformed sha256", () => {
    const c = goodCase();
    c.expectedSha256 = "not-a-hash";
    expect(validateEvalManifest(manifestWith(c)).ok).toBe(false);
  });

  it("rejects an unknown stratum", () => {
    const c = goodCase();
    c.strata = ["not-a-real-stratum"] as unknown as typeof c.strata;
    expect(validateEvalManifest(manifestWith(c)).ok).toBe(false);
  });

  it("rejects an unknown extra field (strict)", () => {
    const c = { ...goodCase(), surprise: true };
    expect(validateEvalManifest(manifestWith(c)).ok).toBe(false);
  });

  it("rejects duplicate case ids", () => {
    const m = {
      schemaVersion: "extraction-eval-manifest.v1",
      description: "d",
      cases: [goodCase(), goodCase()],
    };
    expect(validateEvalManifest(m).ok).toBe(false);
  });
});
