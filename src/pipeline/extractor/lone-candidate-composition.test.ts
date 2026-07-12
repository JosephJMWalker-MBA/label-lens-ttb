import { describe, expect, it } from "vitest";

import { observationSchema } from "@/domain/evidence/evidence.schema";
import { brandNameRule } from "@/domain/rules/brand-name.rule";
import type { RuleContext } from "@/domain/rules/rule.types";
import { validateAnalyzerEvidenceResponse } from "@/pipeline/analyzer/analyzer.schema";
import type {
  AnalyzerEvidenceResponse,
  AnalyzerFieldObservation,
} from "@/pipeline/analyzer/analyzer.types";
import { buildJsonExport } from "@/pipeline/export/json/build-json-export";
import { buildReadableReport } from "@/pipeline/export/report/build-report";
import { assemblePrecheckResult } from "@/pipeline/result/assemble";
import {
  buildAnalyzer,
  buildAssembleInput,
  buildOrchestration,
} from "@/pipeline/result/build.fixtures";
import { validatePrecheckResult } from "@/pipeline/result/result.schema";

import type { OcrWord, RegionOcrResult, RegionTransform } from "./extractor.types";
import { selectBrandObservation } from "./field-selection";

/**
 * Composition coverage for the confirmed RDR-002 defect: a lone plausible but
 * unclassified brand candidate (e.g. `LIVE BOLDLY`, `NAPA VALLEY`) used to
 * become AMBIGUOUS with zero alternates, which the shared observation schema
 * rejected — so `extractLabelEvidence` returned INVALID_RESPONSE and usable
 * uncertainty was lost. These tests exercise the real composition
 * (selector → shared schema → analyzer response → rule → result/JSON/report),
 * not just the selector in isolation.
 */

const TRANSFORM: RegionTransform = {
  crop: { left: 0, top: 0, width: 400, height: 400 },
  rotate: 0,
  scale: 1,
  originalWidth: 400,
  originalHeight: 400,
};

function region(tokens: string[], height = 40): RegionOcrResult {
  let x = 0;
  const words: OcrWord[] = tokens.map((text) => {
    const w: OcrWord = {
      text,
      rawConfidence: 92,
      bbox: { x0: x, y0: 10, x1: x + 30, y1: 10 + height },
    };
    x += 34;
    return w;
  });
  return { regionName: "full-image", transform: TRANSFORM, words };
}

function brandOf(tokens: string[]): AnalyzerFieldObservation {
  return selectBrandObservation([region(tokens)]).observation;
}

/** A full analyzer response carrying `brandObs`, as extractLabelEvidence builds. */
function analyzerWith(brandObs: AnalyzerFieldObservation): AnalyzerEvidenceResponse {
  const base = buildAnalyzer();
  return { ...base, fields: { ...base.fields, brandName: brandObs } };
}

const SHA = "6829add3d99c61851028b2422bdd9672bb975183d198de5e280bc961f4a489e7";
function ruleCtx(observation: AnalyzerFieldObservation): RuleContext {
  return {
    declaredFacts: {
      applicationBrandName: {
        value: "SOME DECLARED BRAND",
        provenance: {
          sourceType: "public-certificate-form-field",
          sourceReference: "24205001000905",
          recordedBy: "op",
          recordedAt: "2026-07-10T00:00:00Z",
        },
      },
    },
    observations: { brandName: observation },
    evidenceStatus: "sufficient",
    run: {
      runId: "run-1",
      ruleProfileId: "wine-precheck",
      ruleProfileVersion: "1.0.0",
      derivativeSha256: SHA,
    },
    evidenceReferences: [],
  };
}

describe("lone-candidate brand uncertainty composition", () => {
  for (const tokens of [
    ["LIVE", "BOLDLY"],
    ["NAPA", "VALLEY"],
  ]) {
    const label = tokens.join(" ");
    describe(label, () => {
      const obs = brandOf(tokens);

      it("stays AMBIGUOUS, preserves the candidate, and is not OBSERVED", () => {
        expect(obs.state).toBe("AMBIGUOUS");
        expect(obs.state).not.toBe("OBSERVED");
        expect(obs.value).toBe(label); // uncertainty preserved, value traceable
        expect(obs.rawText).toBeTruthy();
        expect(obs.geometry).toBeDefined();
        expect(obs.ambiguityReason).toBe("single_unconfirmed_candidate");
      });

      it("is a lone candidate (no fabricated second candidate) yet schema-valid", () => {
        expect(obs.alternates.length).toBe(0);
        const parsed = observationSchema.safeParse(obs);
        expect(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues)).toBe(
          true,
        );
      });

      it("composes through the analyzer schema without INVALID_RESPONSE", () => {
        const validated = validateAnalyzerEvidenceResponse(analyzerWith(obs));
        expect(validated.ok).toBe(true);
      });

      it("drives a review-oriented brand finding, never a PASS", () => {
        const finding = brandNameRule.evaluate(ruleCtx(obs));
        expect(finding.findingStatus).toBe("NEEDS_REVIEW");
        expect(finding.findingStatus).not.toBe("PASS");
      });

      it("reaches result / JSON / report schemas as valid evidence", () => {
        const analyzer = analyzerWith(obs);
        const assembled = assemblePrecheckResult(
          buildAssembleInput({ analyzer, orchestration: buildOrchestration(analyzer) }),
        );
        expect(assembled.ok).toBe(true);
        if (!assembled.ok) return;
        expect(validatePrecheckResult(assembled.value).ok).toBe(true);
        expect(buildJsonExport(assembled.value).ok).toBe(true);
        const report = buildReadableReport({
          result: assembled.value,
          jsonChecksum: "0".repeat(64),
        });
        expect(report.ok).toBe(true);
      });
    });
  }

  it("no AMBIGUOUS observation carries an empty hidden value", () => {
    for (const tokens of [
      ["LIVE", "BOLDLY"],
      ["NAPA", "VALLEY"],
    ]) {
      const obs = brandOf(tokens);
      expect(obs.value).not.toBe("");
      expect(obs.value).not.toBeNull();
    }
  });
});

describe("lone-candidate fix preserves existing guards", () => {
  it("a genuine positively-signalled brand still becomes OBSERVED and composes", () => {
    const obs = brandOf(["STONEHILL", "ESTATE"]);
    expect(obs.state).toBe("OBSERVED");
    expect(obs.value).toBe("STONEHILL ESTATE");
    expect(obs.ambiguityReason).toBeUndefined();
    expect(observationSchema.safeParse(obs).success).toBe(true);
    expect(validateAnalyzerEvidenceResponse(analyzerWith(obs)).ok).toBe(true);
  });

  it("producer, website, and varietal lone lines never become OBSERVED", () => {
    // producer line is excluded (needs "by"); website/vintage/varietal excluded.
    expect(brandOf(["PRODUCED", "BY", "NORTHWIND", "WINERY"]).state).toBe("NOT_OBSERVED");
    expect(brandOf(["CRESTVIEW.COM"]).state).toBe("NOT_OBSERVED");
    expect(brandOf(["CABERNET", "SAUVIGNON"]).state).toBe("NOT_OBSERVED");
    expect(brandOf(["2019"]).state).toBe("NOT_OBSERVED");
  });

  it("slogan and appellation lone lines stay AMBIGUOUS uncertainty, schema-valid", () => {
    for (const tokens of [
      ["LIVE", "BOLDLY"],
      ["NAPA", "VALLEY"],
    ]) {
      const obs = brandOf(tokens);
      expect(obs.state).toBe("AMBIGUOUS");
      expect(observationSchema.safeParse(obs).success).toBe(true);
    }
  });
});
