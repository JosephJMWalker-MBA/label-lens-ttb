/**
 * Issue #149 — the ranked-array invariants, reached exactly.
 *
 * Non-OCR. Both `extractLabelEvidenceDetailed` and the complete-diagnostics
 * selector are mocked here; every other field-selection export stays real.
 *
 * ## Why a selector mock is necessary
 *
 * The Amendment 10 regression removed decisions only from
 * `debug.finalSelections.brand`. The adapter derives its own selection from the
 * passes, so that corruption halted at **parity** and never reached
 * `RANKED_MEMBERSHIP_INCONSISTENT` — the test proved the boundary rejects
 * corruption, not that the array invariant works.
 *
 * To reach the invariant the internally derived selection must be
 * parity-compatible with the authority yet structurally invalid. That means
 * controlling what the internal selector returns, which is what these mocks do —
 * without adding any runtime test-only export.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { extractLabelEvidenceDetailed, type ExtractionDebug } from "@/pipeline/extractor/extractor";
import type { ExtractionInput, RegionOcrResult } from "@/pipeline/extractor/extractor.types";
import {
  BRAND_FILTER_CHECK_ORDER,
  selectBrandObservationWithCompleteFilterDiagnostics,
  type BrandCandidateDiagnostic,
  type FieldSelection,
} from "@/pipeline/extractor/field-selection";

import {
  CandidateAdapterError,
  acquireProductionBrandEvidence,
} from "../../../scripts/eval/lib/issue-149-candidate-adapter";

vi.mock("@/pipeline/extractor/extractor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/pipeline/extractor/extractor")>()),
  extractLabelEvidenceDetailed: vi.fn(),
}));

vi.mock("@/pipeline/extractor/field-selection", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/pipeline/extractor/field-selection")>()),
  selectBrandObservationWithCompleteFilterDiagnostics: vi.fn(),
}));

const ladder = (failed: readonly string[] = []) =>
  BRAND_FILTER_CHECK_ORDER.map((check) => ({ check, failed: failed.includes(check) }));

const ocrConfidence = {
  aggregation: "mean",
  rawScale: "0-100",
  rawTokenConfidences: [92, 92],
  rawMean: 92,
  rawMin: 92,
  rawMax: 92,
  missingTokenCount: 0,
};

const provenance = {
  passId: "pass-1-full-image",
  passKind: "full-image-primary",
  triggerReasons: [],
  preprocessing: [],
  regionName: "full-image",
  supportingPassIds: ["pass-1-full-image"],
  supportingPassKinds: ["full-image-primary"],
  recoveryPassUsed: false,
};

const ranking = (score: number, valueKey: string) => ({
  strategy: "brand-mixed-prominence-score",
  orderingMode: "score-first",
  comparator: [
    { id: "score-eligibility", direction: "desc", value: true },
    { id: "ranking-score", direction: "desc", value: score },
    { id: "normalized-value-key", direction: "asc", value: valueKey },
  ],
  rankingScore: score,
  scoreFactors: [],
});

const score = (total: number) => ({
  positiveSignal: 1,
  meaningfulChars: 10,
  structure: 1,
  ocrEvidenceScore: 0.92,
  prominence: 60,
  area: 1000,
  centrality: 0.5,
  alignment: 0.5,
  lineProximity: 0.5,
  lowInformationPenalty: 0,
  residualPenalty: 0,
  total,
});

/** A kept, scored, ranked candidate. `decision` is supplied by each scenario. */
function keptCandidate(
  rawText: string,
  total: number,
  over: Partial<BrandCandidateDiagnostic> = {},
): BrandCandidateDiagnostic {
  return {
    rawText,
    cleanedValue: rawText,
    confidence: 0.92,
    ocrEvidenceScore: 0.92,
    ocrConfidence,
    prominence: 60,
    regionName: "full-image",
    passId: "pass-1-full-image",
    passKind: "full-image-primary",
    supportPassIds: ["pass-1-full-image"],
    candidateProvenance: provenance,
    assembly: "whole-line",
    lineIndexes: [0],
    kept: true,
    filterReason: "candidate-positive",
    score: score(total),
    ranking: ranking(total, rawText.toLowerCase().replace(/\s/g, "")),
    filterChecks: ladder(),
    activeRejectionReasons: [],
    ...over,
  } as unknown as BrandCandidateDiagnostic;
}

function rejectedCandidate(rawText: string): BrandCandidateDiagnostic {
  return {
    ...keptCandidate(rawText, 0),
    kept: false,
    filterReason: "producer-line",
    score: undefined,
    ranking: undefined,
    filterChecks: ladder(["producer-line"]),
    activeRejectionReasons: ["producer-line"],
  } as unknown as BrandCandidateDiagnostic;
}

function selectionOfCandidates(candidates: BrandCandidateDiagnostic[]): FieldSelection {
  return {
    observation: {
      state: "OBSERVED",
      value: candidates[0]?.rawText ?? null,
      confidence: 0.92,
      ocrEvidenceScore: 0.92,
      alternates: [],
    },
    sourceRegion: "full-image",
    source: null,
    supportingPassIds: ["pass-1-full-image"],
    recoveryPassUsed: false,
    brandDiagnostics: { lines: [], candidates },
  } as unknown as FieldSelection;
}

/**
 * The authority: the same selection with only the two complete-diagnostics
 * fields removed, so parity SUCCEEDS and execution reaches the array invariants.
 */
function authorityFor(selection: FieldSelection): FieldSelection {
  const clone = structuredClone(selection) as unknown as {
    brandDiagnostics: { candidates: Array<Record<string, unknown>> };
  };
  for (const candidate of clone.brandDiagnostics.candidates) {
    delete candidate.filterChecks;
    delete candidate.activeRejectionReasons;
  }
  return clone as unknown as FieldSelection;
}

const pass = { passId: "pass-1-full-image" } as unknown as RegionOcrResult;

const input = { artifactRef: "item-0001" } as unknown as ExtractionInput;

/** Drive the public API with a controlled internally derived selection. */
async function acquireWith(selection: FieldSelection) {
  const debug = {
    decoded: { width: 1, height: 1, format: "png" },
    passes: [pass],
    primarySelections: { brand: { observation: { state: "NOT_OBSERVED" } }, alcohol: {} },
    finalSelections: { brand: authorityFor(selection), alcohol: {} },
  } as unknown as ExtractionDebug;

  vi.mocked(extractLabelEvidenceDetailed).mockResolvedValue({
    ok: true,
    value: { response: {}, debug, sellerRegionReadings: [] },
  } as never);
  vi.mocked(selectBrandObservationWithCompleteFilterDiagnostics).mockReturnValue(selection);

  return acquireProductionBrandEvidence(input);
}

beforeEach(() => {
  vi.mocked(extractLabelEvidenceDetailed).mockReset();
  vi.mocked(selectBrandObservationWithCompleteFilterDiagnostics).mockReset();
});

describe("Issue #149 ranked-array invariants, reached past parity", () => {
  it("halts with RANKED_MEMBERSHIP_INCONSISTENT when a kept population has no decision", async () => {
    // Kept, scored and ranked, but no candidate carries a decision. Parity
    // succeeds by construction, so this reaches the array invariant.
    const selection = selectionOfCandidates([
      keptCandidate("RED BRICK WINERY", 9),
      keptCandidate("SILVER OAK CELLARS", 8),
    ]);
    await expect(acquireWith(selection)).rejects.toMatchObject({
      code: "RANKED_MEMBERSHIP_INCONSISTENT",
    });
    await expect(acquireWith(selection)).rejects.toThrow(/no final ranked member/);
  });

  it("halts with RANKED_MEMBERSHIP_INCONSISTENT on a decision attached to a rejected candidate", async () => {
    const rejectedWithDecision = {
      ...rejectedCandidate("PRODUCED AND BOTTLED BY"),
      decision: "alternate",
    } as unknown as BrandCandidateDiagnostic;
    const selection = selectionOfCandidates([
      keptCandidate("RED BRICK WINERY", 9, { decision: "selected" } as never),
      rejectedWithDecision,
    ]);
    await expect(acquireWith(selection)).rejects.toMatchObject({
      code: "RANKED_MEMBERSHIP_INCONSISTENT",
    });
  });

  it("halts with RANKED_POSITION_PARITY_FAILURE on two selected candidates", async () => {
    const selection = selectionOfCandidates([
      keptCandidate("RED BRICK WINERY", 9, { decision: "selected" } as never),
      keptCandidate("SILVER OAK CELLARS", 8, { decision: "selected" } as never),
    ]);
    await expect(acquireWith(selection)).rejects.toMatchObject({
      code: "RANKED_POSITION_PARITY_FAILURE",
    });
  });

  it("succeeds when a deduplicated kept candidate has no decision but another survives", async () => {
    const selection = selectionOfCandidates([
      keptCandidate("RED BRICK WINERY", 9, { decision: "selected" } as never),
      // Same Brand from another pass: kept and scored, removed by deduplication.
      keptCandidate("RED BRICK WINERY", 9),
    ]);
    const result = await acquireWith(selection);
    if (!result.ok) throw new Error("expected success");

    const positions = result.value.candidateRecords.map((record) => record.rankedPosition);
    expect(positions).toEqual([0, null]);
    expect(result.value.candidateRecords[0].selected).toBe(true);
    // The deduplicated candidate keeps its ranking evidence.
    expect(result.value.candidateRecords[1].rankingEligible).toBe(true);
    expect(result.value.candidateRecords[1].ranking).not.toBeNull();
  });

  it("still halts at parity when the AUTHORITY disagrees, before the array invariants", async () => {
    // The complementary case, stated honestly: corrupting only the authority
    // halts at parity. That is correct behaviour, and it is why the invariant
    // tests above control the derived selection instead.
    const selection = selectionOfCandidates([
      keptCandidate("RED BRICK WINERY", 9, { decision: "selected" } as never),
    ]);
    const debug = {
      decoded: { width: 1, height: 1, format: "png" },
      passes: [pass],
      primarySelections: { brand: { observation: { state: "NOT_OBSERVED" } }, alcohol: {} },
      finalSelections: { brand: selectionOfCandidates([]), alcohol: {} },
    } as unknown as ExtractionDebug;
    vi.mocked(extractLabelEvidenceDetailed).mockResolvedValue({
      ok: true,
      value: { response: {}, debug, sellerRegionReadings: [] },
    } as never);
    vi.mocked(selectBrandObservationWithCompleteFilterDiagnostics).mockReturnValue(selection);

    await expect(acquireProductionBrandEvidence(input)).rejects.toMatchObject({
      code: "BRAND_DIAGNOSTIC_SELECTION_PARITY_FAILURE",
    });
  });

  it("adds no runtime test-only export to reach these paths", async () => {
    const namespace = await import("../../../scripts/eval/lib/issue-149-candidate-adapter");
    expect(Object.keys(namespace).sort()).toEqual([
      "CandidateAdapterError",
      "acquireProductionBrandEvidence",
    ]);
    expect(CandidateAdapterError).toBeDefined();
  });
});
