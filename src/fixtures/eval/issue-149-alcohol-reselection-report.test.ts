// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "artifacts/issue-149-alcohol-reselection");

interface GovernedReport {
  cases: Array<{ eligible: boolean; checksumFamily: string }>;
  corpus: Record<string, number>;
  metrics: {
    detectionRecall: { total: number };
    falseReliableReads: { total: number };
  };
  productionParity: {
    status: string;
    expectedCaseCount: number;
    actualCaseCount: number;
    matchedCaseCount: number;
    mismatches: unknown[];
  };
}

interface BehaviorHashes {
  primaryRepeatControlMatch: boolean;
  primaryRepeatTreatmentMatch: boolean;
  controlTreatmentBehaviorallyIdenticalEveryEvaluableCase: boolean;
  brandChangedCaseCount: number;
  warningChangedCaseCount: number;
  traceChangedCaseCount: number;
  responseChangedCaseCount: number;
}

interface Decision {
  decision: string;
  reasons: string[];
  nextRecommendation: string | null;
  noProductionEnablement: boolean;
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(ROOT, relativePath), "utf8")) as T;
}

describe("Issue #149 Alcohol reselection governed report", () => {
  const control = readJson<GovernedReport>("control/report.json");
  const treatment = readJson<GovernedReport>("treatment/report.json");
  const repeatControl = readJson<GovernedReport>("repeat/control-report.json");
  const repeatTreatment = readJson<GovernedReport>("repeat/treatment-report.json");
  const hashes = readJson<BehaviorHashes>("behavior-hashes.json");
  const decision = readJson<Decision>("decision.json");

  it("reconciles corpus, eligibility, truth, and checksum-family totals", () => {
    for (const report of [control, treatment, repeatControl, repeatTreatment]) {
      expect(report.cases).toHaveLength(115);
      expect(report.corpus).toMatchObject({
        governedCaseCount: 115,
        evaluableCaseCount: 50,
        presentAlcoholCaseCount: 38,
        absenceControlCount: 12,
        checksumFamilyCount: 50,
      });
      const eligible = report.cases.filter((item) => item.eligible);
      expect(eligible).toHaveLength(50);
      expect(new Set(eligible.map((item) => item.checksumFamily)).size).toBe(50);
      expect(report.metrics.detectionRecall.total + report.metrics.falseReliableReads.total).toBe(
        50,
      );
    }
  });

  it("reproduces primary/repeat behavior and exact production parity", () => {
    expect(hashes.primaryRepeatControlMatch).toBe(true);
    expect(hashes.primaryRepeatTreatmentMatch).toBe(true);
    for (const report of [control, treatment, repeatControl, repeatTreatment]) {
      expect(report.productionParity).toMatchObject({
        status: "PASS",
        expectedCaseCount: 115,
        actualCaseCount: 115,
        matchedCaseCount: 115,
        mismatches: [],
      });
    }
  });

  it("proves the treatment is a no-op with no Brand, Warning, OCR-trace, or response delta", () => {
    expect(hashes.controlTreatmentBehaviorallyIdenticalEveryEvaluableCase).toBe(true);
    expect(hashes.brandChangedCaseCount).toBe(0);
    expect(hashes.warningChangedCaseCount).toBe(0);
    expect(hashes.traceChangedCaseCount).toBe(0);
    expect(hashes.responseChangedCaseCount).toBe(0);
  });

  it("applies the preregistered deterministic KILL rule and exactly one recommendation", () => {
    expect(decision.decision).toBe("KILL");
    expect(decision.reasons).toContain(
      "Control and treatment were behaviorally identical in every evaluable case.",
    );
    expect(decision.nextRecommendation).toMatch(/^Corpus expansion:/);
    expect(decision.noProductionEnablement).toBe(true);
  });

  it("reconciles per-case and raw-pass evidence totals", () => {
    const perCase = readFileSync(join(ROOT, "diff/per-case.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    const raw = readFileSync(join(ROOT, "raw-pass-evidence.jsonl"), "utf8").trim().split("\n");
    expect(perCase).toHaveLength(50);
    expect(perCase.every((item) => item.mechanism === "NO_MEANINGFUL_EFFECT")).toBe(true);
    expect(raw).toHaveLength(460);
  });
});
