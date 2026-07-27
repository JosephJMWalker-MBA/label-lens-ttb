// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ALCOHOL_PRIMARY_CLASSIFICATIONS,
  BRAND_PRIMARY_CLASSIFICATIONS,
  buildCorpusReport,
  caseSchemaJson,
  metricsFor,
  REAL_LABEL_STAGING_CASES,
  WARNING_PRIMARY_CLASSIFICATIONS,
} from "./issue-149-real-label-staging-corpus";

describe("Issue #149 real-label staging corpus", () => {
  it("gives every case exactly one Brand primary classification", () => {
    for (const item of REAL_LABEL_STAGING_CASES) {
      expect(BRAND_PRIMARY_CLASSIFICATIONS).toContain(item.brandPrimaryClassification);
    }
  });

  it("gives every case exactly one Government Warning primary classification", () => {
    for (const item of REAL_LABEL_STAGING_CASES) {
      expect(WARNING_PRIMARY_CLASSIFICATIONS).toContain(item.warningPrimaryClassification);
    }
  });

  it("gives every case exactly one Alcohol primary classification", () => {
    for (const item of REAL_LABEL_STAGING_CASES) {
      expect(ALCOHOL_PRIMARY_CLASSIFICATIONS).toContain(item.alcoholPrimaryClassification);
    }
  });

  it("makes missing source images explicit and never fabricates fixture paths", () => {
    const unavailable = REAL_LABEL_STAGING_CASES.filter(
      (item) => item.sourceAvailability !== "GOVERNED_FIXTURE_AVAILABLE",
    );

    expect(unavailable).toHaveLength(7);
    for (const item of unavailable) {
      expect(item.governedFixturePath.value).toBeNull();
      expect(item.governedFixturePath.missingReason).toMatch(/not a governed redistributable/i);
      expect(item.provenance.sourceImagesCommitted).toBe(false);
    }
  });

  it("does not wire expected seller text into production OCR or Brand ranking", () => {
    const productionSelector = readFileSync(
      join(process.cwd(), "src/pipeline/extractor/field-selection.ts"),
      "utf8",
    );
    const packageAnalyzeRoute = readFileSync(
      join(process.cwd(), "src/app/api/package/analyze/route.ts"),
      "utf8",
    );

    expect(productionSelector).not.toMatch(/issue-149-real-label-staging-corpus/);
    expect(packageAnalyzeRoute).not.toMatch(/issue-149-real-label-staging-corpus/);
  });

  it("classifies APHRODITE as correct OCR plus conservative gate", () => {
    const aphrodite = REAL_LABEL_STAGING_CASES.find((item) => item.caseId === "aphrodite");

    expect(aphrodite).toMatchObject({
      boundedTranscript: { value: "APHRODITE" },
      selectedCandidate: { value: "APHRODITE" },
      brandPrimaryClassification: "BRAND_CORRECT_READ_CONSERVATIVE_GATE",
      authorityState: "AMBIGUOUS",
    });
  });

  it("classifies CHRISTMAS HAYRIDE warning as a correct pass", () => {
    const christmas = REAL_LABEL_STAGING_CASES.find((item) => item.caseId === "christmas-hayride");

    expect(christmas).toMatchObject({
      warningStatus: "PASS",
      warningPrimaryClassification: "WARNING_CORRECT_PASS",
      warningOcrConfidence: { value: 0.89 },
    });
  });

  it("classifies GARDEN CITY BEACH Brand as OCR recognition miss", () => {
    const garden = REAL_LABEL_STAGING_CASES.find((item) => item.caseId === "garden-city-beach");

    expect(garden).toMatchObject({
      boundedTranscript: { value: "CARDEN CITY LBEACK" },
      brandPrimaryClassification: "BRAND_OCR_RECOGNITION_MISS",
    });
  });

  it("classifies MINNEAPOLIS Brand as OCR recognition miss", () => {
    const minneapolis = REAL_LABEL_STAGING_CASES.find((item) => item.caseId === "minneapolis");

    expect(minneapolis).toMatchObject({
      boundedTranscript: { value: "MINNEADPOLIS" },
      brandPrimaryClassification: "BRAND_OCR_RECOGNITION_MISS",
    });
  });

  it("keeps contaminated warning cases distinct from warning OCR-only misses", () => {
    const contaminated = REAL_LABEL_STAGING_CASES.filter(
      (item) => item.warningPrimaryClassification === "WARNING_REGION_CONTAMINATED",
    ).map((item) => item.caseId);
    const ocrMisses = REAL_LABEL_STAGING_CASES.filter(
      (item) => item.warningPrimaryClassification === "WARNING_OCR_RECOGNITION_MISS",
    ).map((item) => item.caseId);

    expect(contaminated).toEqual(["luigi-giovanni", "the-golden-girls"]);
    expect(ocrMisses).toEqual(["minneapolis"]);
  });

  it("does not classify unavailable Alcohol evidence as not present", () => {
    for (const item of REAL_LABEL_STAGING_CASES) {
      if (item.alcoholPrimaryClassification === "ALCOHOL_NOT_EVALUATED") {
        expect(item.alcoholPrimaryClassification).not.toBe("ALCOHOL_NOT_PRESENT");
      }
    }
  });

  it("keeps metric totals equal to case totals", () => {
    const metrics = metricsFor(REAL_LABEL_STAGING_CASES);
    const total = REAL_LABEL_STAGING_CASES.length;

    expect(metrics.brand.totalCases).toBe(total);
    expect(metrics.warning.totalCases).toBe(total);
    expect(metrics.alcohol.totalCases).toBe(total);
    expect(Object.values(metrics.brand.classificationCounts).reduce((a, b) => a + b, 0)).toBe(
      total,
    );
    expect(Object.values(metrics.warning.classificationCounts).reduce((a, b) => a + b, 0)).toBe(
      total,
    );
    expect(Object.values(metrics.alcohol.classificationCounts).reduce((a, b) => a + b, 0)).toBe(
      total,
    );
  });

  it("derives recommendation deterministically from counts", () => {
    const report = buildCorpusReport();

    expect(report.metrics.summary.missingGovernedSourceImages).toBe(7);
    expect(report.analysis.recommendedNextExperiment).toBe("CORPUS_EXPANSION_REQUIRED");
    expect(report.analysis.deferredExperiments).toContain("BRAND_BOUNDED_PREPROCESSING");
  });

  it("builds deterministic artifact payloads", () => {
    const first = JSON.stringify(buildCorpusReport());
    const second = JSON.stringify(buildCorpusReport());

    expect(first).toBe(second);
  });

  it("publishes a schema with required primary classification fields", () => {
    const schema = caseSchemaJson();

    expect(schema).toMatchObject({
      type: "object",
      properties: {
        brandPrimaryClassification: { enum: BRAND_PRIMARY_CLASSIFICATIONS },
        warningPrimaryClassification: { enum: WARNING_PRIMARY_CLASSIFICATIONS },
        alcoholPrimaryClassification: { enum: ALCOHOL_PRIMARY_CLASSIFICATIONS },
      },
    });
  });

  it("records the corpus as measurement-only", () => {
    const report = buildCorpusReport();

    expect(report.config).toMatchObject({
      productionBehaviorChanged: false,
      sourceImagesCommitted: false,
      expectedSellerTextUsedAsProductionInput: false,
    });
  });
});
