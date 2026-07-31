/**
 * Issue #149 — governed truth TEXT must not influence the REAL staging generator.
 *
 * Non-OCR. This test drives `generateStageOneArtifacts` — the actual
 * implementation the freeze script and `--check` both call — with mutated
 * governed-truth text, writing only into unique temporary directories. It
 * modifies no tracked artifact and no real staging directory, and runs no
 * recognizer.
 *
 * An earlier version of this test reimplemented the staging algorithm and even
 * substituted `sourceImageByteSize: 0`. It could therefore have stayed green
 * while the real script began depending on `acceptableValues` — the same
 * structural failure as a drift guard that restates the list it guards. Nothing
 * here restates the algorithm.
 *
 * ## What is and is not claimed
 *
 * Job A physically reads a truth-bearing source and deliberately USES
 * `governedTruth.present` for the preregistered 105/10 corpus-accounting
 * assertion. Complete noninterference is **not** claimed and would be false.
 *
 * What is claimed, and driven through the real core here: acceptable Brand values
 * and every other governed truth field do not influence opaque ordering, staged
 * filenames, the truth-free manifest or the generated ID map.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  EVAL_MANIFEST_PATH,
  FreezeError,
  PR217_PATH,
  PR218_PATH,
  generateStageOneArtifacts,
} from "../../../scripts/eval/lib/issue-149-freeze-core.mjs";

const ROOT = "artifacts/issue-149-brand-complete-evidence-acquisition";
const MUTATED_TEXT = "MUTATED-TRUTH-TEXT-DO-NOT-STAGE-ON-THIS";
const MUTATED_ACCEPTABLE = "MUTATED-ACCEPTABLE-VALUE-DO-NOT-STAGE-ON-THIS";

const read = (p: string): unknown => JSON.parse(readFileSync(path.join(process.cwd(), p), "utf8"));
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

interface AttributionCase {
  caseId: string;
  governedTruth: { present: boolean; [key: string]: unknown };
  [key: string]: unknown;
}

const scratchDirectories: string[] = [];
afterAll(() => {
  for (const directory of scratchDirectories) rmSync(directory, { recursive: true, force: true });
});

/** Run the REAL core against temporary outputs and read back what it wrote. */
function runRealCore(pr217: { cases: AttributionCase[] }) {
  const scratch = mkdtempSync(path.join(tmpdir(), "issue-149-staging-independence-"));
  scratchDirectories.push(scratch);
  const generated = generateStageOneArtifacts({
    pr217,
    pr218: read(PR218_PATH) as Parameters<typeof generateStageOneArtifacts>[0]["pr218"],
    evalManifest: read(EVAL_MANIFEST_PATH) as Parameters<
      typeof generateStageOneArtifacts
    >[0]["evalManifest"],
    loadSourceImage: (imagePath: string) => readFileSync(path.join(process.cwd(), imagePath)),
    forbiddenEvidenceKeys: read(`${ROOT}/runtime/truth-key-inventory.json`) as string[],
    out: {
      root: path.join(scratch, "artifacts"),
      postFreeze: path.join(scratch, "artifacts/post-freeze"),
      staged: path.join(scratch, "staged"),
    },
  });
  return {
    scratch,
    stagedListing: generated.stagedListing as string[],
    manifest: JSON.parse(readFileSync(generated.written.truthFreeInputManifest, "utf8")) as {
      cases: Array<{
        opaqueItemId: string;
        stagedImageFileName: string;
        sourceImageSha256: string;
        sourceImageByteSize: number;
      }>;
    },
    idMap: JSON.parse(readFileSync(generated.written.idMap, "utf8")) as {
      map: Array<{ opaqueItemId: string; historicalCaseId: string; sourceImageByteSize: number }>;
    },
    manifestBytes: readFileSync(generated.written.truthFreeInputManifest),
    idMapBytes: readFileSync(generated.written.idMap),
    populationBytes: readFileSync(generated.written.populationFreeze),
  };
}

describe("Issue #149 staging independence, driven through the real core", () => {
  const source = read(PR217_PATH) as { cases: AttributionCase[] };

  it("confirms the source really does carry governed truth beside the presence flag", () => {
    // If this stops being true the honest claim changes, and this test should be
    // revisited rather than quietly passing.
    const first = source.cases[0];
    expect(Object.hasOwn(first, "governedTruth")).toBe(true);
    expect(typeof first.governedTruth.present).toBe("boolean");
    expect(Object.keys(first.governedTruth).length).toBeGreaterThan(1);
  });

  it("produces identical staging when acceptable values and truth text change", () => {
    const baseline = runRealCore(clone(source));

    // Mutate every governed-truth field EXCEPT `present`, plus acceptable values
    // wherever they appear. Identity, inclusion, image paths, hashes and bytes
    // are untouched.
    const mutatedSource = clone(source);
    for (const entry of mutatedSource.cases) {
      for (const [key, value] of Object.entries(entry.governedTruth)) {
        if (key === "present") continue;
        entry.governedTruth[key] =
          typeof value === "string"
            ? MUTATED_TEXT
            : Array.isArray(value)
              ? [MUTATED_ACCEPTABLE]
              : value;
      }
      (entry as Record<string, unknown>).acceptableValues = [MUTATED_ACCEPTABLE];
    }
    const mutated = runRealCore(mutatedSource);

    // Opaque ordering, staged filenames, and the complete manifest cases —
    // including the REAL byte sizes, not a substituted zero.
    expect(mutated.stagedListing).toEqual(baseline.stagedListing);
    expect(mutated.manifest.cases).toEqual(baseline.manifest.cases);
    expect(mutated.manifest.cases.every((entry) => entry.sourceImageByteSize > 0)).toBe(true);
    expect(mutated.idMap.map).toEqual(baseline.idMap.map);

    // Byte-for-byte equality of the truth-free outputs is the strongest form.
    expect(mutated.manifestBytes.equals(baseline.manifestBytes)).toBe(true);
    expect(mutated.idMapBytes.equals(baseline.idMapBytes)).toBe(true);
    expect(mutated.populationBytes.equals(baseline.populationBytes)).toBe(true);

    // And none of the mutated text reached any output.
    for (const bytes of [mutated.manifestBytes, mutated.idMapBytes, mutated.populationBytes]) {
      expect(bytes.includes(Buffer.from(MUTATED_TEXT, "utf8"))).toBe(false);
      expect(bytes.includes(Buffer.from(MUTATED_ACCEPTABLE, "utf8"))).toBe(false);
    }
  }, 300_000);

  it("halts on a flipped presence flag, which is the bounded use it does make", () => {
    // The core uses governedTruth.present for the 105/10 assertion, so flipping
    // it must halt. Claiming complete independence would be false.
    const flipped = clone(source);
    for (const entry of flipped.cases) {
      entry.governedTruth.present = !entry.governedTruth.present;
    }
    let thrown: unknown;
    try {
      runRealCore(flipped);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(FreezeError);
    expect((thrown as InstanceType<typeof FreezeError>).code).toBe("PRESENCE_SPLIT_DISCREPANCY");
    expect((thrown as InstanceType<typeof FreezeError>).ocrRun).toBe(false);

    const plan = read(`${ROOT}/truth-isolation-plan.json`) as {
      jobATruthAccess: { noninterferenceClaimIsBounded: string };
    };
    expect(plan.jobATruthAccess.noninterferenceClaimIsBounded).toContain(
      "Complete noninterference from governedTruth.present is NOT claimed",
    );
  }, 300_000);

  it("restates no part of the staging algorithm", () => {
    // The guard against this test drifting from the implementation it checks.
    // The markers are assembled from fragments so this assertion does not match
    // its own source text.
    const whole = readFileSync(
      path.join(process.cwd(), "src/fixtures/eval/issue-149-staging-independence.test.ts"),
      "utf8",
    );
    // Skip the header comment, which legitimately QUOTES the superseded practice
    // it exists to warn against.
    const self = whole.slice(whole.indexOf("import { mkdtempSync"));
    expect(self).toContain("generateStageOneArtifacts");
    const restatements = [
      ["locale", "Compare"],
      ["pad", "Start"],
      ["sourceImageByteSize", ": 0"],
      ["item-", "${String("],
    ].map((parts) => parts.join(""));
    for (const restatement of restatements) {
      expect(self.includes(restatement), `restates ${restatement}`).toBe(false);
    }
  });

  it("records that Job A physically reads a truth-bearing source", () => {
    const plan = read(`${ROOT}/post-freeze-evaluation-plan.json`) as {
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
