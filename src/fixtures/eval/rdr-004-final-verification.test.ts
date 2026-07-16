// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { EvalReport } from "./eval-report.types";
import {
  OBSERVATION_QUALITY_BENCHMARK_IMPLEMENTATION_STATUS,
  OBSERVATION_QUALITY_PRIMARY_REVIEWER_COUNT,
  OBSERVATION_QUALITY_TOTAL_SCORED_ITEMS,
  productionPromptChangeAuthorized,
  realExecutionAuthorized,
} from "./vision-observer/local-vlm/observation-quality-benchmark-protocol";

function loadCommittedReport(): EvalReport {
  return JSON.parse(
    readFileSync(join(process.cwd(), "docs/extraction-full-corpus/extractor-report.json"), "utf8"),
  ) as EvalReport;
}

function loadCommittedMarkdown(): string {
  return readFileSync(
    join(process.cwd(), "docs/extraction-full-corpus/extractor-report.md"),
    "utf8",
  );
}

describe("RDR-004 final current-state verification", () => {
  describe("historical extraction failures that must not be restated as current", () => {
    it("locks the repaired absent-brand safety result", () => {
      const report = loadCommittedReport();

      expect(report.aggregate.absentBrandCount).toBe(10);
      expect(report.aggregate.absentBrandFalsePositiveRate).toBe(0);
      expect(report.aggregate.brandCorrectAbstentionRate).toBe(1);
      expect(report.aggregate.brandFalseCertaintyRate).toBe(0);
      expect(report.aggregate.brandFalseAbstentionRate).toBe(0);
    });

    it("locks the current alcohol and orientation baseline rather than the earlier raw baseline", () => {
      const report = loadCommittedReport();
      const sideRotated = report.breakdowns.alcoholSlices.find(
        (slice) => slice.key === "side-or-rotated",
      );
      const verticalStrip = report.breakdowns.alcoholSlices.find(
        (slice) => slice.key === "vertical-strip",
      );

      expect(report.aggregate.alcoholDetectionRecall).toBeCloseTo(0.6078431372549019);
      expect(report.aggregate.alcoholParsedValueAccuracy).toBeCloseTo(0.5686274509803921);
      expect(sideRotated).toMatchObject({
        presentCaseCount: 12,
        detectedCount: 3,
        parsedAccurateCount: 2,
      });
      expect(verticalStrip).toMatchObject({
        presentCaseCount: 5,
        detectedCount: 0,
        parsedAccurateCount: 0,
      });
    });
  });

  describe("findings that remain open", () => {
    it("keeps the current report limitation and non-readiness language visible", () => {
      const markdown = loadCommittedMarkdown();

      expect(markdown).toContain(
        "This report is not evidence that the current extractor is production-ready.",
      );
      expect(markdown).toContain(
        "No field in this report is a calibrated correctness probability",
      );
    });

    it("detects the still-overbroad recovery-pass heading until it is corrected", () => {
      const markdown = loadCommittedMarkdown();

      expect(markdown).toContain("Recovery passes that never improve outcomes");
      expect(markdown).toContain("Left edge strip 270°");
    });

    it("keeps the observation-quality protocol explicitly synthetic and unauthorized", () => {
      expect(OBSERVATION_QUALITY_BENCHMARK_IMPLEMENTATION_STATUS).toBe(
        "SLICE_1_TYPES_ONLY",
      );
      expect(OBSERVATION_QUALITY_PRIMARY_REVIEWER_COUNT).toBe(1);
      expect(OBSERVATION_QUALITY_TOTAL_SCORED_ITEMS).toBe(64);
      expect(realExecutionAuthorized).toBe(false);
      expect(productionPromptChangeAuthorized).toBe(false);
    });
  });
});
