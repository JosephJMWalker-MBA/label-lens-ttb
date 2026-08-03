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

  it("never reads a governed-truth property other than `present`", () => {
    // The direct proof. Every governedTruth object is wrapped in a Proxy that
    // throws on any access except `present`, so a successful run is evidence that
    // the real core reads nothing else — stronger than hoping a mutation shows up
    // in an output.
    const violations: string[] = [];
    const guarded = clone(source);
    for (const entry of guarded.cases) {
      const truth = entry.governedTruth;
      entry.governedTruth = new Proxy(truth, {
        get(target, property, receiver) {
          if (property === "present") return Reflect.get(target, property, receiver);
          // Vitest and structuredClone probe a few well-known symbols; only
          // string property reads are governed-truth accesses.
          if (typeof property === "symbol") return Reflect.get(target, property, receiver);
          violations.push(`get ${String(property)}`);
          throw new Error(`governed truth property read: ${String(property)}`);
        },
        ownKeys() {
          violations.push("ownKeys");
          throw new Error("governed truth enumerated");
        },
        getOwnPropertyDescriptor(target, property) {
          if (property === "present") {
            return Reflect.getOwnPropertyDescriptor(target, property);
          }
          violations.push(`descriptor ${String(property)}`);
          throw new Error(`governed truth descriptor read: ${String(property)}`);
        },
      }) as AttributionCase["governedTruth"];
    }

    // The guard must be load-bearing: reading any other property throws.
    const probe = guarded.cases[0].governedTruth;
    expect(probe.present).toBe(source.cases[0].governedTruth.present);
    expect(() => (probe as Record<string, unknown>).acceptableValues).toThrow(
      /governed truth property read/,
    );
    expect(() => Object.keys(probe)).toThrow(/governed truth enumerated/);
    violations.length = 0;

    const guardedRun = runRealCore(guarded);
    expect(violations).toEqual([]);

    // And it produced the same truth-free outputs as an unguarded run.
    const baseline = runRealCore(clone(source));
    expect(guardedRun.manifestBytes.equals(baseline.manifestBytes)).toBe(true);
    expect(guardedRun.idMapBytes.equals(baseline.idMapBytes)).toBe(true);
    expect(guardedRun.populationBytes.equals(baseline.populationBytes)).toBe(true);
  }, 300_000);

  it("produces identical staging when EVERY non-present truth field changes", () => {
    const baseline = runRealCore(clone(source));

    // Recursively mutate every non-`present` leaf: strings get a sentinel,
    // booleans invert, finite numbers change, arrays and nested objects are
    // traversed. An earlier version changed only strings and arrays, so
    // `knownAmbiguous: false` — a real field in the frozen source — went
    // untouched.
    const visited: string[] = [];
    let booleansChanged = 0;
    const mutate = (value: unknown, at: string): unknown => {
      if (Array.isArray(value))
        return value.map((entry, index) => mutate(entry, `${at}[${index}]`));
      if (value !== null && typeof value === "object") {
        const out: Record<string, unknown> = {};
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
          out[key] = mutate(child, `${at}.${key}`);
        }
        return out;
      }
      visited.push(at);
      if (typeof value === "string") return MUTATED_TEXT;
      if (typeof value === "boolean") {
        booleansChanged += 1;
        return !value;
      }
      if (typeof value === "number" && Number.isFinite(value)) return value + 7;
      return value;
    };

    const mutatedSource = clone(source);
    for (const entry of mutatedSource.cases) {
      const governedTruth: AttributionCase["governedTruth"] = {
        present: entry.governedTruth.present,
      };
      for (const [key, value] of Object.entries(entry.governedTruth)) {
        if (key === "present") continue;
        governedTruth[key] = mutate(value, key);
      }
      entry.governedTruth = governedTruth;
      (entry as Record<string, unknown>).acceptableValues = [MUTATED_ACCEPTABLE];
    }

    // The mutation really did reach a boolean, and specifically knownAmbiguous.
    expect(booleansChanged).toBeGreaterThan(0);
    const frozenFirst = source.cases[0].governedTruth;
    if (Object.hasOwn(frozenFirst, "knownAmbiguous")) {
      expect(visited.some((at) => at.startsWith("knownAmbiguous"))).toBe(true);
      expect(mutatedSource.cases[0].governedTruth.knownAmbiguous).toBe(!frozenFirst.knownAmbiguous);
    }
    // Every non-present field of the first case was visited.
    for (const key of Object.keys(frozenFirst).filter((key) => key !== "present")) {
      expect(
        visited.some((at) => at === key || at.startsWith(`${key}.`) || at.startsWith(`${key}[`)),
      ).toBe(true);
    }

    const mutated = runRealCore(mutatedSource);
    expect(mutated.stagedListing).toEqual(baseline.stagedListing);
    expect(mutated.manifest.cases).toEqual(baseline.manifest.cases);
    expect(mutated.manifest.cases.every((entry) => entry.sourceImageByteSize > 0)).toBe(true);
    expect(mutated.idMap.map).toEqual(baseline.idMap.map);
    expect(mutated.manifestBytes.equals(baseline.manifestBytes)).toBe(true);
    expect(mutated.idMapBytes.equals(baseline.idMapBytes)).toBe(true);
    expect(mutated.populationBytes.equals(baseline.populationBytes)).toBe(true);

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
