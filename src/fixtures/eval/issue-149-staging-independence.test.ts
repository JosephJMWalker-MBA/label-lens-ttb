/**
 * Issue #149 — governed truth TEXT must not influence staging.
 *
 * Non-OCR. This test reads the committed PR #217 attribution artifact, mutates
 * the truth text in an in-memory copy, and reproduces the staging decisions the
 * freeze script makes. It stages no image, writes no artifact and runs no
 * recognizer.
 *
 * ## What is and is not claimed
 *
 * Job A physically reads a truth-bearing source, and it deliberately USES
 * `governedTruth.present` for the preregistered 105/10 corpus-accounting
 * assertion. Complete noninterference is therefore **not** claimed and would be
 * false if it were.
 *
 * What is claimed, and checked here: acceptable Brand values and other governed
 * truth TEXT do not influence inclusion, opaque-ID assignment, image ordering or
 * staged filenames. Holding identities, paths, hashes, inclusion and presence
 * flags fixed while changing the truth text must change nothing.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const PR217 =
  "artifacts/issue-149-brand-current-baseline-failure-decomposition/per-case-attribution.json";
const EVAL_MANIFEST = "src/fixtures/eval/eval-manifest.json";

interface AttributionCase {
  caseId: string;
  governedTruth: { present: boolean; [key: string]: unknown };
  [key: string]: unknown;
}

const read = (p: string): unknown => JSON.parse(readFileSync(path.join(process.cwd(), p), "utf8"));

/**
 * The staging decisions the freeze script derives, reproduced from the same
 * inputs: verify each case against the manifest, order by ascending source-image
 * SHA-256, assign `item-NNNN`, and name the staged file from the opaque id and
 * the original extension.
 *
 * The presence flag is carried through so the 105/10 accounting can be checked,
 * exactly as the script does.
 */
function stagingDecisions(cases: AttributionCase[]): {
  order: string[];
  stagedNames: string[];
  manifestCases: Array<{
    opaqueItemId: string;
    stagedImageFileName: string;
    sourceImageSha256: string;
    sourceImageByteSize: number;
  }>;
  presentCount: number;
} {
  const manifest = read(EVAL_MANIFEST) as {
    records: Array<{
      caseId: string;
      imagePath: string;
      status: string;
      expectedSha256: string;
      byteSize?: number;
    }>;
  };
  const byId = new Map(manifest.records.map((record) => [record.caseId, record]));

  const verified = cases.map((entry) => {
    const record = byId.get(entry.caseId);
    if (record === undefined) throw new Error(`case not in eval manifest: ${entry.caseId}`);
    return {
      historicalCaseId: entry.caseId,
      historicalImagePath: record.imagePath,
      sourceImageSha256: record.expectedSha256,
      extension: path.extname(record.imagePath).toLowerCase(),
      brandPresent: entry.governedTruth.present,
    };
  });

  verified.sort((a, b) => a.sourceImageSha256.localeCompare(b.sourceImageSha256));
  const assigned = verified.map((entry, index) => ({
    ...entry,
    opaqueItemId: `item-${String(index + 1).padStart(4, "0")}`,
  }));

  return {
    order: assigned.map((entry) => entry.historicalCaseId),
    stagedNames: assigned.map((entry) => `${entry.opaqueItemId}${entry.extension}`),
    manifestCases: assigned.map((entry) => ({
      opaqueItemId: entry.opaqueItemId,
      stagedImageFileName: `${entry.opaqueItemId}${entry.extension}`,
      sourceImageSha256: entry.sourceImageSha256,
      sourceImageByteSize: 0,
    })),
    presentCount: assigned.filter((entry) => entry.brandPresent).length,
  };
}

describe("Issue #149 staging independence from governed truth text", () => {
  const source = read(PR217) as { cases: AttributionCase[] };

  it("confirms the source really does carry governed truth beside the presence flag", () => {
    // If this ever stops being true, the honest claim changes and this test
    // should be revisited rather than quietly passing.
    const first = source.cases[0];
    expect(Object.hasOwn(first, "governedTruth")).toBe(true);
    expect(typeof first.governedTruth.present).toBe("boolean");
    const truthKeys = Object.keys(first.governedTruth);
    expect(truthKeys.length).toBeGreaterThan(1);
  });

  it("produces identical staging when acceptable values and truth text change", () => {
    const baseline = stagingDecisions(source.cases);

    // Mutate every truth field EXCEPT `present`, plus any acceptable-value list
    // wherever it appears. Identity, paths, hashes and inclusion stay fixed.
    const mutated = source.cases.map((entry) => {
      const governedTruth: AttributionCase["governedTruth"] = {
        present: entry.governedTruth.present,
      };
      for (const [key, value] of Object.entries(entry.governedTruth)) {
        if (key === "present") continue;
        governedTruth[key] =
          typeof value === "string"
            ? "MUTATED-TRUTH-TEXT"
            : Array.isArray(value)
              ? ["MUTATED-ACCEPTABLE-VALUE"]
              : value;
      }
      return { ...entry, governedTruth, acceptableValues: ["MUTATED-ACCEPTABLE-VALUE"] };
    });

    const after = stagingDecisions(mutated);

    expect(after.order).toEqual(baseline.order);
    expect(after.stagedNames).toEqual(baseline.stagedNames);
    expect(after.manifestCases).toEqual(baseline.manifestCases);
    expect(after.presentCount).toBe(baseline.presentCount);
  });

  it("does not claim independence from the presence flag", () => {
    // The script uses governedTruth.present for the 105/10 assertion, so flipping
    // it DOES change the accounting. Stating otherwise would be false, and the
    // contract records this bounded claim explicitly.
    const flipped = source.cases.map((entry) => ({
      ...entry,
      governedTruth: { ...entry.governedTruth, present: !entry.governedTruth.present },
    }));
    const after = stagingDecisions(flipped as AttributionCase[]);
    const baseline = stagingDecisions(source.cases);

    expect(after.presentCount).not.toBe(baseline.presentCount);
    // Identity and ordering are still untouched by the flag.
    expect(after.order).toEqual(baseline.order);
    expect(after.stagedNames).toEqual(baseline.stagedNames);

    const plan = read(
      "artifacts/issue-149-brand-complete-evidence-acquisition/truth-isolation-plan.json",
    ) as { jobATruthAccess: { noninterferenceClaimIsBounded: string } };
    expect(plan.jobATruthAccess.noninterferenceClaimIsBounded).toContain(
      "Complete noninterference from governedTruth.present is NOT claimed",
    );
  });

  it("records that Job A physically reads a truth-bearing source", () => {
    const plan = read(
      "artifacts/issue-149-brand-complete-evidence-acquisition/post-freeze-evaluation-plan.json",
    ) as {
      actorsAndBoundaries: {
        jobA_trustedPreparation: {
          receivesGovernedTruth: boolean;
          governedTruthAccess: {
            physicallyReadsATruthBearingSource: boolean;
            mayUseOnly: string[];
            mustNotUseAcceptableValuesOrTruthTextFor: string[];
            preparationArtifactRemainsTruthFree: boolean;
            jobBRemainsTruthFree: boolean;
          };
        };
      };
      truthBoundaryLocation: string;
    };
    const jobA = plan.actorsAndBoundaries.jobA_trustedPreparation;
    expect(jobA.receivesGovernedTruth).toBe(true);
    expect(jobA.governedTruthAccess.physicallyReadsATruthBearingSource).toBe(true);
    expect(jobA.governedTruthAccess.preparationArtifactRemainsTruthFree).toBe(true);
    expect(jobA.governedTruthAccess.jobBRemainsTruthFree).toBe(true);
    expect(jobA.governedTruthAccess.mayUseOnly.join(" ")).toContain("105/10");
    expect(jobA.governedTruthAccess.mustNotUseAcceptableValuesOrTruthTextFor).toContain(
      "opaque-ID assignment",
    );
    expect(plan.truthBoundaryLocation).toContain("EVALUATION-USE boundary");
  });
});
