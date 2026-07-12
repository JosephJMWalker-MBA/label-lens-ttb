import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { validateEvalManifest } from "./eval-manifest.schema";
import { EVAL_MANIFEST_PATH, loadEvalManifest } from "./eval-loader";

/**
 * The corpus-scale manifest must reconcile the full committed image inventory
 * while preserving the seeded 15-case baseline as the currently included
 * evaluation slice.
 */

const committed = JSON.parse(readFileSync(EVAL_MANIFEST_PATH, "utf8")) as unknown;

function goodRecord() {
  return {
    caseId: "approved-wine-001",
    imagePath: "tests/fixtures/precheck/approved-wine-001/label.png",
    expectedSha256: "a".repeat(64),
    image: { mediaType: "image/png", width: 975, height: 1500 },
    beverageCategory: "wine",
    source: {
      authority: "author-provided-local-acquisition",
      description: "approved wine fixture",
      usageStatus: "screenshot-metadata-screened-author-attested",
      provenanceRefs: ["tests/fixtures/precheck/approved-wine-110-inventory.json"],
    },
    inspection: {
      imageOrientation: "portrait",
      visualStrata: ["front-label"],
      reviewReasons: ["other"],
      notes: "Single-image front label candidate.",
    },
    status: "excluded_uncertain_truth",
    exclusionReason: "Checkpoint inventory record only pending full annotation.",
    duplicateOfCaseId: null,
    annotation: null,
    qualityControl: null,
  };
}

function manifestWith(records: unknown[]) {
  return {
    schemaVersion: "extraction-eval-manifest.v2",
    corpusRoot: "tests/fixtures/precheck",
    description: "checkpoint",
    records,
  };
}

describe("committed evaluation manifest", () => {
  it("validates", () => {
    expect(validateEvalManifest(committed).ok).toBe(true);
  });

  it("reconciles every discovered candidate image under tests/fixtures/precheck", () => {
    const manifest = loadEvalManifest();
    expect(manifest.records).toHaveLength(132);
    const paths = new Set(manifest.records.map((record) => record.imagePath));
    expect(paths.size).toBe(manifest.records.length);
    expect(paths).toContain(
      "tests/fixtures/precheck/m-cellars-24205001000905/label-ocr-source.jpeg",
    );
    expect(paths).toContain("tests/fixtures/precheck/m-cellars-24205001000905/label.png");
    expect(paths).toContain(
      "tests/fixtures/precheck/m-cellars-lowres-24205001000905/label-lowres.png",
    );
    expect(paths).toContain("tests/fixtures/precheck/wine-multi-artifact-10/label.png");
    expect(paths).toContain(
      "tests/fixtures/precheck/category-sentinel-single-malt-whiskey-03/label.jpeg",
    );
  });

  it("captures the visually corrected beverage-category counts", () => {
    const manifest = loadEvalManifest();
    const counts = manifest.records.reduce<Record<string, number>>((acc, record) => {
      acc[record.beverageCategory] = (acc[record.beverageCategory] ?? 0) + 1;
      return acc;
    }, {});
    expect(counts["wine"]).toBe(120);
    expect(counts["distilled-spirits"]).toBe(9);
    expect(counts["beer-or-malt-beverage"]).toBe(3);
    expect(
      manifest.records.find((record) => record.caseId === "wine-multi-artifact-01")
        ?.beverageCategory,
    ).toBe("distilled-spirits");
    expect(
      manifest.records.find((record) => record.caseId === "wine-multi-artifact-02")
        ?.beverageCategory,
    ).toBe("distilled-spirits");
    expect(
      manifest.records.find((record) => record.caseId === "wine-multi-artifact-03")
        ?.beverageCategory,
    ).toBe("distilled-spirits");
  });

  it("keeps only wine records in the currently included seeded baseline", () => {
    const manifest = loadEvalManifest();
    expect(manifest.cases).toHaveLength(15);
    expect(manifest.cases.some((record) => record.caseId === "luigi-giovanni-live")).toBe(true);
    expect(
      manifest.records
        .filter((record) => record.status === "included")
        .every((record) => record.beverageCategory === "wine"),
    ).toBe(true);
  });

  it("marks the M Cellars derivatives as duplicates of the canonical benchmark", () => {
    const manifest = loadEvalManifest();
    const referenceCrop = manifest.records.find(
      (record) => record.caseId === "m-cellars-reference-crop",
    );
    const lowres = manifest.records.find((record) => record.caseId === "m-cellars-lowres");
    expect(referenceCrop?.status).toBe("excluded_duplicate");
    expect(referenceCrop?.duplicateOfCaseId).toBe("m-cellars-baseline");
    expect(lowres?.status).toBe("excluded_duplicate");
    expect(lowres?.duplicateOfCaseId).toBe("m-cellars-baseline");
  });
});

describe("manifest validation rejects malformed corpus records", () => {
  it("accepts a well-formed excluded record", () => {
    expect(validateEvalManifest(manifestWith([goodRecord()])).ok).toBe(true);
  });

  it("rejects a missing beverage category", () => {
    const record = { ...goodRecord() } as Record<string, unknown>;
    delete record.beverageCategory;
    expect(validateEvalManifest(manifestWith([record])).ok).toBe(false);
  });

  it("rejects an included non-wine record", () => {
    const record = {
      ...goodRecord(),
      beverageCategory: "distilled-spirits",
      status: "included",
      exclusionReason: null,
      annotation: {
        brand: {
          presence: "present",
          acceptablePresentations: ["Blue Flag"],
          genuinelyAmbiguous: false,
          ambiguityReason: null,
          forbiddenPresentations: [],
          approxGeometry: [],
          orientation: "horizontal",
        },
        alcohol: {
          presence: "present",
          acceptablePercents: [45],
          acceptableStatements: ["45%"],
          characteristics: [],
          approxGeometry: [],
          orientation: "horizontal",
        },
        confidence: { overall: "high", brand: "high", alcohol: "high" },
        provenance: { annotatedBy: "x", annotatedOn: "2026-07-12", method: "manual inspection" },
        notes: "bad record",
      },
      qualityControl: {
        reviewedBy: "x",
        reviewedOn: "2026-07-12",
        method: "second-pass-visual-inspection",
        outcome: "confirmed",
        checks: [
          "capitalization-and-punctuation",
          "varietal-not-brand",
          "producer-importer-bottler-not-brand",
          "proof-not-alcohol-by-volume",
          "rotated-or-vertical-alcohol",
          "absent-field-annotations",
          "genuine-ambiguity",
          "duplicate-labels",
        ],
        corrections: [],
        notes: "bad record",
      },
      inspection: {
        imageOrientation: "portrait",
        visualStrata: ["front-label"],
        reviewReasons: [],
        notes: "bad record",
      },
    };
    expect(validateEvalManifest(manifestWith([record])).ok).toBe(false);
  });

  it("rejects outside-scope wine records", () => {
    const record = {
      ...goodRecord(),
      status: "excluded_outside_current_scope",
      inspection: {
        imageOrientation: "portrait",
        visualStrata: ["front-label"],
        reviewReasons: [],
        notes: "bad record",
      },
    };
    expect(validateEvalManifest(manifestWith([record])).ok).toBe(false);
  });

  it("rejects duplicate image paths", () => {
    const record = goodRecord();
    expect(
      validateEvalManifest(manifestWith([record, { ...record, caseId: "approved-wine-002" }])).ok,
    ).toBe(false);
  });
});
