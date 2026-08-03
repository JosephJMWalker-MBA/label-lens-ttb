/* eslint-disable @typescript-eslint/no-explicit-any */

import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { brandNormalizedMatch, normalizedIncludes } from "./metrics";

import {
  runEvaluation,
  stableStringify,
} from "../../../scripts/eval/issue-149-post-freeze-evaluate-30775581351";

const ROOT = "artifacts/issue-149-brand-post-freeze-evaluation-30775581351";
const RAW_ROOT =
  "artifacts/issue-149-brand-complete-evidence-result-30775581351/raw-evidence/host-readable-output/raw";

function tempOutput(): string {
  return mkdtempSync(path.join(os.tmpdir(), "issue-149-post-freeze-eval-"));
}

function runTemp(): { root: string; current: any; aggregate: any; validation: any; history: any } {
  const root = tempOutput();
  runEvaluation(root);
  return {
    root,
    current: JSON.parse(readFileSync(path.join(root, "current-per-case-evaluation.json"), "utf8")),
    aggregate: JSON.parse(readFileSync(path.join(root, "aggregate-evaluation.json"), "utf8")),
    validation: JSON.parse(readFileSync(path.join(root, "evaluation-validation.json"), "utf8")),
    history: JSON.parse(readFileSync(path.join(root, "historical-cross-check.json"), "utf8")),
  };
}

describe("Issue #149 post-freeze Actor 3 evaluation", () => {
  it("performs the closed 115-case join and preserves absent-case accounting", () => {
    const { root, current, aggregate, validation } = runTemp();
    try {
      expect(current.cases).toHaveLength(115);
      expect(current.cases[0].opaqueItemId).toBe("item-0001");
      expect(current.cases[114].opaqueItemId).toBe("item-0115");
      expect(new Set(current.cases.map((entry: any) => entry.historicalCaseId)).size).toBe(115);
      expect(validation.brandPresentCount).toBe(105);
      expect(validation.brandAbsentCount).toBe(10);
      expect(aggregate.brandAbsent.denominator).toBe(10);
      expect(aggregate.brandAbsent).toHaveProperty("falseCertainty");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses frozen normalization behavior without aliases or fuzzy matching", () => {
    expect(brandNormalizedMatch("Chateau Bonneau", ["Château Bonneau"])).toBe(true);
    expect(normalizedIncludes("Produced by Duck Walk Vineyards", ["Duck Walk Vineyards"])).toBe(
      true,
    );
    expect(brandNormalizedMatch("Duck Walk", ["Duck Walk Vineyards"])).toBe(false);
  });

  it("does not apply a historical line cap when finding truth on reconstructed lines", () => {
    const { root, current } = runTemp();
    try {
      const caseWithLateTruth = current.cases.find(
        (entry: any) => entry.truthOnReconstructedLine && entry.truthBearingCandidates.length > 0,
      );
      expect(caseWithLateTruth).toBeTruthy();
      expect(
        current.cases.every((entry: any) => typeof entry.truthOnReconstructedLine === "boolean"),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps rejected truth-bearing candidates visible with ordered rejection details", () => {
    const { root, current } = runTemp();
    try {
      const rejected = current.cases.flatMap(
        (entry: any) => entry.filtersRejectingEachTruthBearingCandidate,
      );
      expect(rejected.length).toBeGreaterThan(0);
      expect(rejected[0]).toHaveProperty("stableCandidateId");
      expect(rejected[0]).toHaveProperty("candidateOrdinal");
      expect(rejected[0]).toHaveProperty("activeRejectionReasons");
      expect(rejected[0]).toHaveProperty("filterChecks");
      expect(rejected[0]).toHaveProperty("passId");
      expect(rejected[0]).toHaveProperty("passKind");
      expect(rejected[0]).toHaveProperty("assembly");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses rankedPosition rather than candidate ordinal for truth rank", () => {
    const { root, current } = runTemp();
    try {
      const ranked = current.cases.find((entry: any) =>
        entry.truthBearingCandidates.some(
          (candidate: any) =>
            typeof candidate.rankedPosition === "number" &&
            candidate.rankedPosition !== candidate.candidateOrdinal,
        ),
      );
      expect(ranked).toBeTruthy();
      const best = Math.min(
        ...ranked.truthBearingCandidates
          .map((candidate: any) => candidate.rankedPosition)
          .filter((rank: any) => typeof rank === "number"),
      );
      expect(ranked.truthRank.bestRankedPosition).toBe(best);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not let diagnostic alternates replace behavioral final authority", () => {
    const { root, current } = runTemp();
    try {
      const withAlternates = current.cases.find((entry: any) => {
        const selection = JSON.parse(
          readFileSync(
            `${RAW_ROOT}/primary/${entry.opaqueItemId}/${entry.opaqueItemId}.selection.json`,
            "utf8",
          ),
        );
        return (selection.selection?.observation?.alternates ?? []).length > 0;
      });
      expect(withAlternates).toBeTruthy();
      const selection = JSON.parse(
        readFileSync(
          `${RAW_ROOT}/primary/${withAlternates.opaqueItemId}/${withAlternates.opaqueItemId}.selection.json`,
          "utf8",
        ),
      );
      expect(withAlternates.finalAuthorityResult.selectedValue).toBe(
        selection.selection.observation.value ?? null,
      );
      expect(withAlternates.finalAuthorityResult.selectedValue).not.toBe(
        selection.selection.observation.alternates[0]?.value ?? "__none__",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("freezes the current result before historical comparison can influence it", () => {
    const { root, current, history } = runTemp();
    try {
      expect(current.currentResultFrozenBeforeHistoricalComparison).toBe(true);
      expect(history.currentResultHashFrozenBeforeLoadingPrior).toBe(true);
      expect(history.comparisonCodeCounts).toHaveProperty("CURRENT_RERUN_CONFIRMS_PRIOR_FIELD");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does not write into immutable raw evidence", () => {
    const before = statSync(`${RAW_ROOT}/primary/item-0001/item-0001.words.jsonl`).mtimeMs;
    const { root, validation } = runTemp();
    try {
      const after = statSync(`${RAW_ROOT}/primary/item-0001/item-0001.words.jsonl`).mtimeMs;
      expect(validation.immutableEvidenceWritten).toBe(false);
      expect(after).toBe(before);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("produces byte-identical output on two clean executions", () => {
    const a = tempOutput();
    const b = tempOutput();
    try {
      runEvaluation(a);
      runEvaluation(b);
      for (const file of [
        "evaluation-provenance.json",
        "current-per-case-evaluation.json",
        "current-per-case-evaluation.sha256",
        "aggregate-evaluation.json",
        "historical-cross-check.json",
        "evaluation-validation.json",
        "limitations.md",
      ]) {
        expect(readFileSync(path.join(a, file), "utf8")).toBe(
          readFileSync(path.join(b, file), "utf8"),
        );
      }
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });

  it("canonical JSON ordering is deterministic", () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
});

describe("Issue #149 committed post-freeze result directory", () => {
  it("contains only the required bounded output files once generated", () => {
    runEvaluation(ROOT);
    const files = [
      "evaluation-provenance.json",
      "current-per-case-evaluation.json",
      "current-per-case-evaluation.sha256",
      "aggregate-evaluation.json",
      "historical-cross-check.json",
      "evaluation-validation.json",
      "limitations.md",
    ];
    for (const file of files) {
      expect(statSync(path.join(ROOT, file)).isFile()).toBe(true);
    }
  });
});
