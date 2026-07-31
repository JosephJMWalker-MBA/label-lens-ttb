/**
 * Issue #149 — Stage 1 contract-consistency sweep.
 *
 * Non-OCR. Fails if a CURRENT, non-historical contract still describes the
 * superseded design. Historical amendment records are allowed to contain the old
 * language, because that is their job.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import {
  AUTHORIZED_ADAPTER_MODULE,
  RUNNER_ENTRY_PATH,
} from "../../../scripts/eval/lib/issue-149-stage2-source-closure";
import { describe, expect, it } from "vitest";

import { parseTruthKeyInventory } from "../../../scripts/eval/lib/issue-149-bundle-scan";
import { CANDIDATE_EVIDENCE_REQUIRED_KEYS } from "../../../scripts/eval/lib/issue-149-evidence-canonical";

const ROOT = "artifacts/issue-149-brand-complete-evidence-acquisition";

/** Records whose purpose is to preserve superseded language. */
const HISTORICAL_FILES = new Set([
  "preregistration-amendment.md",
  "preregistration-amendment-2.md",
  "preregistration-amendment-3.md",
  "preregistration-amendment-4.md",
  "preregistration-amendment-5.md",
  "preregistration-amendment-6.md",
  "preregistration-amendment-7.md",
  "preregistration-amendment-8.md",
  "preregistration-amendment-9.md",
  "preregistration-amendment-10.md",
  "preregistration-amendment-11.md",
  "branch-pointer-incident.md",
  "amendment-linkage.json",
  "amendment-2-linkage.json",
  "amendment-3-linkage.json",
  "amendment-4-linkage.json",
  "amendment-5-linkage.json",
  "amendment-6-linkage.json",
  "amendment-7-linkage.json",
  "amendment-8-linkage.json",
  "amendment-9-linkage.json",
  "amendment-10-linkage.json",
  "amendment-11-linkage.json",
]);

/**
 * `git-sha.txt` is deliberately NOT exempt. It mixes CURRENT and HISTORICAL
 * entries, and the point of the file is that its CURRENT block states the
 * current amendment. Exempting it wholesale is what let it sit at "amendment 2"
 * while the package was at Amendment 4, faithfully hashed by the manifest.
 */
const CURRENT_AMENDMENT = 12;

/**
 * A line may mention a superseded term when it is explicitly marking it as
 * prohibited, corrected or historical. This is what separates "we still do
 * this" from "we must not do this".
 */
const ALLOWED_MARKERS = [
  "prohibit",
  "Prohibit",
  "never",
  "Never",
  "historical",
  "Historical",
  "HISTORICAL",
  "historicalNote",
  "correctionOf",
  "corrected",
  "superseded",
  "not use",
  "notPresentIn",
  "priorClaim",
  "priorDefect",
  "priorContradiction",
  "correction",
  "whyWrong",
  "PreviousStatement",
  "does not use",
];

const STALE_TERMS = [
  "runCaseArtifacts",
  "ExtractionDebug.finalSelections.brand.brandDiagnostics.candidates",
  "single recorded filterReason",
  "short-circuit blocker",
  "capability3 partially satisfied",
  "PARTIALLY satisfied",
  "raw/<run>/<caseId>",
  "per-pass caseId",
  "8f0c6a7ca7c271eed14d9084ed6da7fe11f897a9",
  // Superseded by Amendment 3.
  "exactly four mounts",
  "tmpfs-only",
  "twenty-one compared fields",
  "21-field allowlist",
  "contents: write",
  // Superseded by Amendment 4. These are CONCEPTS, not only the exact old
  // sentences: each phrase below is a distinct way the package used to state a
  // conclusion that is no longer true.
  "2026-01-01T00:00:00.000Z",
  "authoritativeFilterReason",
  "module-local and unexported",
  "cannot be re-evaluated offline",
  "most consequential limitation",
  "remains an upper bound",
  "still *an upper bound*",
  "The harness consumes",
  "The harness does not recompute",
  "moved from partial to satisfied",
  "satisfied only because PR #220 merged",
  'amendedBy": "preregistration-amendment-2',
  "src/fixtures/eval/issue-149-candidate-canonical",
];

const read = (p: string): unknown => JSON.parse(readFileSync(path.join(process.cwd(), p), "utf8"));

const sha256 = (p: string): string =>
  createHash("sha256")
    .update(readFileSync(path.join(process.cwd(), p)))
    .digest("hex");

function walk(dir: string): string[] {
  return readdirSync(path.join(process.cwd(), dir)).flatMap((entry) => {
    const relative = path.join(dir, entry);
    return statSync(path.join(process.cwd(), relative)).isDirectory() ? walk(relative) : [relative];
  });
}

describe("Issue #149 Stage 1 contract consistency", () => {
  const files = walk(ROOT).filter((f) => /\.(json|md|sh|txt)$/.test(f));

  it("sweeps a non-trivial set of governed artifacts", () => {
    expect(files.length).toBeGreaterThanOrEqual(20);
  });

  it("leaves no superseded design language in a current contract", () => {
    const offences: string[] = [];
    for (const file of files) {
      if (HISTORICAL_FILES.has(path.basename(file))) continue;
      const lines = readFileSync(path.join(process.cwd(), file), "utf8").split("\n");
      lines.forEach((line, index) => {
        for (const term of STALE_TERMS) {
          if (!line.includes(term)) continue;
          // Prose wraps and JSON arrays put the term on a bare line, so the
          // marker is looked for in a small window rather than on the exact
          // line. The window is deliberately tight: it admits a wrapped
          // prohibition, not a distant unrelated one.
          const window = lines.slice(Math.max(0, index - 2), index + 3).join(" ");
          if (ALLOWED_MARKERS.some((marker) => window.includes(marker))) continue;
          offences.push(`${file}:${index + 1} — "${term}"`);
        }
      });
    }
    expect(offences).toEqual([]);
  });

  it("states the current base everywhere it states a base", () => {
    const current = "546c3f279ce431a1fd8c0203df7a83553ea866ef";
    const freeze = JSON.parse(
      readFileSync(path.join(process.cwd(), ROOT, "population-freeze.json"), "utf8"),
    );
    const incumbent = JSON.parse(
      readFileSync(path.join(process.cwd(), ROOT, "incumbent-configuration-freeze.json"), "utf8"),
    );
    expect(freeze.base).toBe(current);
    expect(incumbent.base).toBe(current);
  });

  it("names the direct extractor route and prohibits the harness route", () => {
    const contract = JSON.parse(
      readFileSync(path.join(process.cwd(), ROOT, "acquisition-invocation-contract.json"), "utf8"),
    );
    // The route is unchanged in substance; what changed is who makes the call.
    // The runner's one call is acquireProductionBrandEvidence, and the direct
    // extractor call happens inside it — the runner is prohibited from making
    // that call itself, so the contract must not instruct it to.
    expect(contract.route).toContain("acquireProductionBrandEvidence");
    expect(contract.route).toContain("extractLabelEvidenceDetailed");
    expect(contract.requiredInvocationSteps.at(-1)).toContain(
      "acquireProductionBrandEvidence(extractionInput)",
    );
    expect(contract.requiredInvocationSteps.join(" ")).not.toContain(
      ["call ", "extractLabelEvidenceDetailed", " directly"].join(""),
    );
    expect(contract.extractionInputImmutability.identityIsNotPreserved).toContain("toBe(input)");
    expect(contract.prohibitedRoute.symbols).toContain("runCaseArtifacts");
    expect(contract.prohibitedRoute.modules).toContain("src/fixtures/eval/**");
    expect(contract.extractionInputBinding.artifactRef).toContain("opaqueItemId");
  });

  it("obtains complete diagnostics by an exact-pass-set call, not from debug", () => {
    const parity = JSON.parse(
      readFileSync(path.join(process.cwd(), ROOT, "brand-diagnostic-parity-contract.json"), "utf8"),
    );
    expect(parity.howCompleteDiagnosticsAreObtained.unconditionalAllPassesProhibited).toBe(true);
    expect(parity.parityAssertion.haltCode).toBe("BRAND_DIAGNOSTIC_SELECTION_PARITY_FAILURE");
    expect(parity.parityAssertion.authority).toContain("debug.finalSelections.brand");
    expect(parity.candidateEvidenceSource.isThe).toContain("diagnosticSelection");
  });

  it("states capability 3 as replay-satisfiable, neither partial nor overclaimed", () => {
    const decision = read(path.join(ROOT, "decision-rules.json")) as {
      evidenceCompletenessVerdict: { expectedOutcomeStatedInAdvance: { capability3: string } };
    };
    const capability =
      decision.evidenceCompletenessVerdict.expectedOutcomeStatedInAdvance.capability3;
    // Amendment 3 corrected this. Complete rejection reasons alone do not answer
    // a counterfactual; what makes capability 3 reachable is the preserved
    // ordered RegionOcrResult array, which a later governed selector can replay.
    expect(capability).toContain("SATISFIABLE");
    expect(capability).toContain("RegionOcrResult");
    expect(capability).not.toContain("PARTIALLY");
  });

  it("compares the complete diagnostics arrays for determinism", () => {
    const determinism = JSON.parse(
      readFileSync(path.join(process.cwd(), ROOT, "determinism-rules.json"), "utf8"),
    );
    const candidateLevel = determinism.comparisonLevels.find(
      (level: { level: string }) => level.level === "candidate decisions",
    );
    expect(candidateLevel.compare).toContain("filterChecks");
    expect(candidateLevel.compare).toContain("activeRejectionReasons");
  });

  it("describes the Stage 1 isolation tests as static, not runtime proof", () => {
    const plan = JSON.parse(
      readFileSync(path.join(process.cwd(), ROOT, "truth-isolation-plan.json"), "utf8"),
    );
    expect(plan.stage1TestsAre.isRuntimeProof).toBe(false);
    expect(plan.stage1TestsAre.kind).toContain("static");
  });

  it("names no schema field caseId anywhere in a current contract", () => {
    // Amendment 2 only banned the PHRASE "per-pass caseId". A schema could still
    // have declared a key literally called `caseId`, so the keys themselves are
    // walked. `historicalCaseId` stays legal: it names the historical identity in
    // the post-freeze map, which is exactly where that identity belongs.
    const offences: string[] = [];

    function walkKeys(value: unknown, file: string, at: string): void {
      if (Array.isArray(value)) {
        value.forEach((entry, index) => walkKeys(entry, file, `${at}[${index}]`));
        return;
      }
      if (value === null || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (/caseid/i.test(key) && !/^historical/.test(key) && !/^contains/.test(key)) {
          offences.push(`${file} — key ${at}.${key}`);
        }
        walkKeys(child, file, `${at}.${key}`);
      }
    }

    for (const file of files.filter((f) => f.endsWith(".json"))) {
      if (HISTORICAL_FILES.has(path.basename(file))) continue;
      walkKeys(read(file), file, "$");
    }
    expect(offences).toEqual([]);
  });

  it("names the per-pass identifier opaqueItemId in the raw schema", () => {
    const raw = read(path.join(ROOT, "raw-ocr-contract.json")) as {
      perPassFields: Record<string, unknown>;
    };
    expect(Object.hasOwn(raw.perPassFields, "opaqueItemId")).toBe(true);
    expect(Object.hasOwn(raw.perPassFields, "caseId")).toBe(false);
  });

  it("allows the historical identity only inside the post-freeze map", () => {
    const map = read(`${ROOT}/post-freeze/id-map.json`) as { map: Array<Record<string, unknown>> };
    expect(Object.hasOwn(map.map[0], "historicalCaseId")).toBe(true);
    expect(Object.hasOwn(map.map[0], "caseId")).toBe(false);
  });

  describe("frozen ExtractionInput identities", () => {
    const incumbent = read(path.join(ROOT, "incumbent-configuration-freeze.json")) as {
      extractionInputIdentities: Record<string, unknown>;
    };
    const invocation = read(path.join(ROOT, "acquisition-invocation-contract.json")) as {
      extractionInputBinding: Record<string, string>;
    };
    const identities = incumbent.extractionInputIdentities;

    it("carries a non-blank value for every identity the binding names", () => {
      for (const key of [
        "extractionAdapterId",
        "extractionAdapterVersion",
        "parserId",
        "parserVersion",
        "processedAt",
      ]) {
        const value = identities[key];
        expect(typeof value).toBe("string");
        expect(String(value).trim().length).toBeGreaterThan(0);
        // The binding must quote the frozen literal, not merely gesture at it.
        expect(invocation.extractionInputBinding[key]).toContain(String(value));
      }
      expect(identities.ocrEngine).toMatchObject({
        kind: "ocr",
        engineId: "tesseract.js",
        engineVersion: "7.0.0",
        modelId: "eng",
      });
      expect(identities.invented).toBe(false);
      expect(identities.noneInferredAtRuntime).toBe(true);
    });

    it("takes every identity from the incumbent evaluation harness, not from invention", () => {
      // The literals must actually exist in the repository they claim to come
      // from; otherwise "frozen from the incumbent" is an unchecked assertion.
      const harness = readFileSync(
        path.join(process.cwd(), "src/fixtures/eval/eval-harness.ts"),
        "utf8",
      );
      for (const literal of [
        String(identities.extractionAdapterId),
        String(identities.parserId),
        String(identities.processedAt),
        "tesseract.js",
      ]) {
        expect(harness).toContain(literal);
      }
      expect(String(identities.derivedFrom)).toContain("eval-harness.ts");
    });

    it("omits sellerRegionTargets and diagnostics rather than inventing them", () => {
      expect(invocation.extractionInputBinding.sellerRegionTargets).toBe("omitted");
      expect(invocation.extractionInputBinding.diagnostics).toBe("omitted");
    });
  });

  describe("exactly one processedAt value", () => {
    const FROZEN = "2026-07-12T00:00:00Z";

    it("declares the frozen literal once and contradicts it nowhere", () => {
      const incumbent = read(path.join(ROOT, "incumbent-configuration-freeze.json")) as {
        extractionInputIdentities: { processedAt: string };
        fixedProcessedAt: string;
      };
      expect(incumbent.extractionInputIdentities.processedAt).toBe(FROZEN);
      // The former top-level literal is gone; the key now points at the one
      // authoritative value rather than carrying a second, different one.
      expect(incumbent.fixedProcessedAt).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
      expect(incumbent.fixedProcessedAt).toContain("extractionInputIdentities.processedAt");
    });

    it("contains no ISO timestamp other than the frozen literal in any current contract", () => {
      // A recursive scan, because Amendment 3's tests only inspected the nested
      // value and the contradicting top-level literal passed CI unnoticed.
      const ISO = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g;
      const offences: string[] = [];
      for (const file of files) {
        if (HISTORICAL_FILES.has(path.basename(file))) continue;
        const text = readFileSync(path.join(process.cwd(), file), "utf8");
        for (const match of text.match(ISO) ?? []) {
          if (match !== FROZEN) offences.push(`${file} — ${match}`);
        }
      }
      expect(offences).toEqual([]);
    });

    it("resolves every current processedAt declaration to the one literal", () => {
      const declarations: string[] = [];
      const walkFor = (value: unknown, file: string): void => {
        if (Array.isArray(value)) {
          value.forEach((entry) => walkFor(entry, file));
          return;
        }
        if (value === null || typeof value !== "object") return;
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
          if (/^processedAt$/i.test(key) && typeof child === "string") declarations.push(child);
          walkFor(child, file);
        }
      };
      for (const file of files.filter((f) => f.endsWith(".json"))) {
        if (HISTORICAL_FILES.has(path.basename(file))) continue;
        walkFor(read(file), file);
      }
      expect(declarations.length).toBeGreaterThan(0);
      // A declaration may add a source pointer, but every timestamp it names
      // must be the one frozen literal.
      for (const declaration of declarations) {
        const stamps = declaration.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g) ?? [];
        expect(stamps).toEqual([FROZEN]);
      }
    });
  });

  it("keeps the canonical helper outside src/fixtures and permits the runner to import it", () => {
    const invocation = read(path.join(ROOT, "acquisition-invocation-contract.json")) as {
      permittedImports: string[];
      prohibitedImportPrefixes: string[];
      canonicalHelperImport: { path: string; required: boolean };
    };
    expect(invocation.canonicalHelperImport.path).toBe(
      "scripts/eval/lib/issue-149-evidence-canonical.ts",
    );
    expect(invocation.canonicalHelperImport.required).toBe(true);
    expect(invocation.permittedImports).toContain("scripts/eval/lib/issue-149-evidence-canonical");
    // The helper must not sit under any prefix the same contract prohibits.
    for (const prefix of invocation.prohibitedImportPrefixes) {
      expect(invocation.canonicalHelperImport.path.startsWith(prefix)).toBe(false);
    }
    expect(existsSync(path.join(process.cwd(), invocation.canonicalHelperImport.path))).toBe(true);
    expect(
      existsSync(path.join(process.cwd(), "src/fixtures/eval/issue-149-candidate-canonical.ts")),
    ).toBe(false);
  });

  it("names every required own property of a candidate evidence record", () => {
    const decision = read(path.join(ROOT, "candidate-decision-contract.json")) as {
      requiredOwnPropertiesBeforeFinalization: string[];
      perCandidatePersisted: Record<string, string>;
    };
    const required = decision.requiredOwnPropertiesBeforeFinalization;
    expect(new Set(required)).toEqual(new Set(CANDIDATE_EVIDENCE_REQUIRED_KEYS));
    // The contract and the implementation must agree, or the schema is decorative.
    expect(required).toContain("regionName");
    expect(required).toContain("ranking");
    expect(required).toContain("filterReason");
    expect(required as string[]).not.toContain("authoritativeFilterReason");
    for (const key of required) {
      expect(Object.hasOwn(decision.perCandidatePersisted, key)).toBe(true);
    }
  });

  it("removes evidence fields unavailable through the frozen interface", () => {
    const raw = read(path.join(ROOT, "raw-ocr-contract.json")) as {
      perPassFields: Record<string, unknown>;
      unavailableThroughTheFrozenInterface: Record<string, { available: boolean }>;
      itemLevelFailureEvidence: { persistedOnFailure: Record<string, string> };
    };
    for (const gone of ["cropPixelSha256", "warningsAndErrors"]) {
      expect(Object.hasOwn(raw.perPassFields, gone)).toBe(false);
      expect(raw.unavailableThroughTheFrozenInterface[gone].available).toBe(false);
    }
    for (const key of [
      "opaqueItemId",
      "sourceImageSha256",
      "errorCode",
      "errorMessage",
      "issues",
    ]) {
      expect(Object.hasOwn(raw.itemLevelFailureEvidence.persistedOnFailure, key)).toBe(true);
    }
  });

  it("separates artifact integrity from semantic determinism", () => {
    const determinism = read(path.join(ROOT, "determinism-rules.json")) as {
      threeSeparateConcepts: {
        fullArtifactIntegrity: { expectedToMatchBetweenPrimaryAndRepeat: boolean };
        semanticPassFingerprint: { excludesExactly: string[] };
      };
      excludedFromTheSemanticEqualityGate: { timings: string[]; runMetadata: string[] };
    };
    expect(
      determinism.threeSeparateConcepts.fullArtifactIntegrity
        .expectedToMatchBetweenPrimaryAndRepeat,
    ).toBe(false);
    expect(determinism.threeSeparateConcepts.semanticPassFingerprint.excludesExactly).toEqual([
      "timings",
    ]);
    expect(determinism.excludedFromTheSemanticEqualityGate.runMetadata.length).toBeGreaterThan(0);
  });

  it("owns the transitive dependency proof in host preparation, not in discovery", () => {
    const isolation = read(path.join(ROOT, "acquisition-runtime-isolation-contract.json")) as {
      runtimeBundle: {
        dependencyClosureGate: {
          required: boolean;
          ownedBy: string;
          failIfAnyTransitiveSourceInputIsUnderOrDerivedFrom: string[];
          sourceMapsAndEmbeddedSources: {
            embeddedSourceContentFromProhibitedPathsPermitted: boolean;
          };
        };
      };
    };
    const gate = isolation.runtimeBundle.dependencyClosureGate;
    expect(gate.required).toBe(true);
    expect(gate.ownedBy).toContain("phase 1");
    expect(
      gate.sourceMapsAndEmbeddedSources.embeddedSourceContentFromProhibitedPathsPermitted,
    ).toBe(false);
    for (const prohibited of [
      "src/fixtures/**",
      "tests/**",
      "artifacts/**",
      "src/domain/rules/**",
    ]) {
      expect(gate.failIfAnyTransitiveSourceInputIsUnderOrDerivedFrom).toContain(prohibited);
    }
  });

  it("protects evidence by byte equality, not by a false access claim", () => {
    const plan = read(path.join(ROOT, "post-freeze-evaluation-plan.json")) as {
      actorsAndBoundaries: {
        actor2_postRunCommitProcess: {
          isNotTheOcrProcess: boolean;
          physicalInaccessibilityClaimed: boolean;
          mayOperateInARepositoryCheckout: boolean;
          theControlThatActuallyProtectsTheEvidence: string;
          anyChangedByteFailsVerification: boolean;
          truthIsNotAnInputToItsOperation: boolean;
          mustDo: string[];
          mustNotDo: string[];
        };
      };
    };
    const actor2 = plan.actorsAndBoundaries.actor2_postRunCommitProcess;
    expect(actor2.isNotTheOcrProcess).toBe(true);
    // The map is committed on this branch, so "cannot reach it" would be false.
    expect(actor2.physicalInaccessibilityClaimed).toBe(false);
    expect(actor2.mayOperateInARepositoryCheckout).toBe(true);
    expect(actor2.theControlThatActuallyProtectsTheEvidence).toContain("immutable-byte equality");
    expect(actor2.anyChangedByteFailsVerification).toBe(true);
    expect(actor2.truthIsNotAnInputToItsOperation).toBe(true);
    expect(actor2.mustDo.join(" ")).toContain("commit exactly those immutable bytes");
    for (const forbidden of ["transform", "filter", "regenerate", "re-serialize", "reorder"]) {
      expect(actor2.mustNotDo.join(" ").toLowerCase()).toContain(forbidden);
    }
  });

  it("states the truth-boundary chronology accurately, including trusted staging", () => {
    const plan = read(path.join(ROOT, "truth-isolation-plan.json")) as {
      orderingRule?: string;
      truthBoundaryChronology: {
        supersededClaim: string;
        whyItWasFalse: string;
        phase1TrustedStaging: {
          mayRead: string[];
          isOutsideTheAcquisitionProcess: boolean;
          governedTruthAccess: { physicallyReadsATruthBearingSource: boolean };
        };
        phase2IsolatedAcquisition: { cannotScanFor: string; receivesNo: string[] };
        phase3ReadOnlyIdentityLeakVerification: {
          mayRead: string[];
          mayNot: string[];
          onHit: string;
          isNotPostFreezeEvaluation: boolean;
        };
      };
    };
    // The false global ordering claim is gone, not merely reworded around.
    expect(plan.orderingRule).toBeUndefined();
    const chronology = plan.truthBoundaryChronology;
    expect(chronology.whyItWasFalse).toContain("Trusted staging");
    expect(chronology.phase1TrustedStaging.isOutsideTheAcquisitionProcess).toBe(true);
    expect(chronology.phase1TrustedStaging.mayRead.join(" ")).toContain("historical identity");
    expect(
      chronology.phase1TrustedStaging.governedTruthAccess.physicallyReadsATruthBearingSource,
    ).toBe(true);
    expect(chronology.phase2IsolatedAcquisition.receivesNo.join(" ")).toContain(
      "post-freeze ID map",
    );
    expect(chronology.phase2IsolatedAcquisition.cannotScanFor).toContain("historical case IDs");

    const verifier = chronology.phase3ReadOnlyIdentityLeakVerification;
    expect(verifier.mayRead.join(" ")).toContain("inventory");
    expect(verifier.onHit).toBe("TRUTH_ISOLATION_FAILURE");
    expect(verifier.isNotPostFreezeEvaluation).toBe(true);
    for (const forbidden of ["modify", "rewrite", "replace"]) {
      expect(verifier.mayNot.join(" ").toLowerCase()).toContain(forbidden);
    }
  });

  it("scopes the bundle scan to an asset, not to scanner source text", () => {
    const isolation = read(path.join(ROOT, "acquisition-runtime-isolation-contract.json")) as {
      runtimeBundle: {
        dependencyClosureGate: {
          preIsolationBundleScan: {
            selfTriggeringDefect: string;
            sourceTextInferenceDefect: string;
            frozenScope: string[];
            inventoryAsset: {
              bundlePath: string;
              authoritativeCopy: string;
              exactByteSha256: string;
              executableCodeCarriesNoDuplicateLiteralInventory: boolean;
            };
            brandStringsNeverScanned: boolean;
            referenceImplementation: string;
          };
          bundleManifestMustRecord: string[];
        };
      };
    };
    const gate = isolation.runtimeBundle.dependencyClosureGate;
    const scan = gate.preIsolationBundleScan;
    expect(scan.selfTriggeringDefect).toContain("truth-isolation scanner");
    expect(scan.sourceTextInferenceDefect).toContain("COMMENT");
    expect(scan.inventoryAsset.executableCodeCarriesNoDuplicateLiteralInventory).toBe(true);
    expect(scan.inventoryAsset.exactByteSha256).toBe(
      sha256(`${ROOT}/runtime/truth-key-inventory.json`),
    );
    expect(existsSync(path.join(process.cwd(), scan.inventoryAsset.authoritativeCopy))).toBe(true);
    expect(scan.brandStringsNeverScanned).toBe(true);
    expect(existsSync(path.join(process.cwd(), scan.referenceImplementation))).toBe(true);
    expect(scan.frozenScope.join(" ")).toContain("RAW BYTES of every bundle file");
    expect(scan.frozenScope.join(" ")).toContain("exact array equality");
    expect(gate.bundleManifestMustRecord.join(" ")).toContain("truth-key inventory asset path");
  });

  it("allows the incumbent's own mandatory rules dependency by path and hash", () => {
    const isolation = read(path.join(ROOT, "acquisition-runtime-isolation-contract.json")) as {
      runtimeBundle: {
        dependencyClosureGate: {
          frozenExceptions: Array<{ path: string; sha256: string; transitiveImports: string[] }>;
          failIfAnyTransitiveSourceInputIsUnderOrDerivedFrom: string[];
          productionSourceBaseDriftGate: { haltCode: string };
        };
      };
    };
    const gate = isolation.runtimeBundle.dependencyClosureGate;
    expect(gate.failIfAnyTransitiveSourceInputIsUnderOrDerivedFrom).toContain(
      "src/domain/rules/**",
    );
    expect(gate.frozenExceptions).toHaveLength(1);
    expect(gate.frozenExceptions[0].path).toBe("src/domain/rules/wine-alcohol-parse.ts");
    expect(gate.frozenExceptions[0].sha256).toBe(sha256("src/domain/rules/wine-alcohol-parse.ts"));
    expect(gate.frozenExceptions[0].transitiveImports).toEqual([]);
    expect(gate.productionSourceBaseDriftGate.haltCode).toBe("PRODUCTION_SOURCE_DRIFTED_FROM_BASE");
  });

  it("keeps git-sha.txt current, and does not exempt it from the sweep", () => {
    const gitSha = readFileSync(path.join(process.cwd(), ROOT, "git-sha.txt"), "utf8");
    expect(HISTORICAL_FILES.has("git-sha.txt")).toBe(false);
    expect(gitSha).toContain(`CURRENT — stage 1, amendment ${CURRENT_AMENDMENT}`);
    expect(gitSha.match(/^CURRENT/gm) ?? []).toHaveLength(1);
    for (const earlier of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      expect(gitSha).toContain(`HISTORICAL — amendment ${earlier}`);
    }
    expect(gitSha).toContain("No governed 115-case acquisition OCR");
    expect(gitSha).toContain("pre-existing bundled-image OCR tests");
  });

  it("states the no-OCR claim precisely wherever a current document makes it", () => {
    const offences: string[] = [];
    for (const file of files) {
      if (HISTORICAL_FILES.has(path.basename(file))) continue;
      const text = readFileSync(path.join(process.cwd(), file), "utf8");
      // An unqualified claim says no OCR ran without naming the governed corpus
      // and without disclosing the ordinary suite's bundled-image tests.
      for (const unqualified of [
        /\bNo OCR has run\b/,
        /\bNo OCR executed\b/,
        /\bNo acquisition OCR has run\b/,
      ]) {
        if (unqualified.test(text)) offences.push(`${file} — ${unqualified.source}`);
      }
    }
    expect(offences).toEqual([]);
    // Prose wraps, so these assertions are whitespace-insensitive.
    const limitations = readFileSync(
      path.join(process.cwd(), ROOT, "limitations.md"),
      "utf8",
    ).replace(/\s+/g, " ");
    expect(limitations).toContain("governed 115-case acquisition");
    expect(limitations).toContain("pre-existing bundled-image OCR tests");
    // And it states what HAS run rather than implying nothing has.
    expect(limitations).toContain("trusted freeze/staging generator");
  });

  it("keeps host-only steps out of the isolated discovery description", () => {
    const workflow = readFileSync(path.join(process.cwd(), ROOT, "workflow-plan.md"), "utf8");
    const discover = workflow.slice(
      workflow.indexOf("## Mode `discover`"),
      workflow.indexOf("## Mode `execute`"),
    );
    expect(discover.length).toBeGreaterThan(0);
    // The prohibition is stated inside the discover section; the steps must not
    // then perform the thing prohibited.
    expect(discover).toContain("Inside isolated discovery, do not");
    expect(discover).toContain("exactly four experiment-controlled data mounts");
    const steps = discover.slice(discover.indexOf("verify only what is actually mounted"));
    for (const hostOnly of [
      "re-run the freeze script",
      "preregistration.sha256",
      "post-freeze/id-map.json",
    ]) {
      expect(steps).not.toContain(hostOnly);
    }
  });

  it("records the branch-pointer incident as an audit event", () => {
    const incident = readFileSync(
      path.join(process.cwd(), ROOT, "branch-pointer-incident.md"),
      "utf8",
    );
    expect(incident).toContain("8b36245ec0eb7df68bc2812614d1c10d4a475baa");
    expect(incident).toContain("HEAD:<remote-branch>");
    expect(incident).toContain("No commit was lost");
    expect(incident).toContain("audit event, not an experimental result");
  });

  it("stamps every operative contract with the current amendment", () => {
    // Amendment 5's evidence-schema.json sat at "amendment 4" while the manifest
    // faithfully hashed it. A per-file assertion is cheaper than noticing later.
    const stale: string[] = [];
    for (const file of files.filter((f) => f.endsWith(".json"))) {
      if (HISTORICAL_FILES.has(path.basename(file))) continue;
      const contract = read(file) as { amendedBy?: string };
      if (contract.amendedBy === undefined) continue;
      if (contract.amendedBy !== `preregistration-amendment-${CURRENT_AMENDMENT}.md`) {
        stale.push(`${file} — ${contract.amendedBy}`);
      }
    }
    expect(stale).toEqual([]);
  });

  describe("one authoritative forbidden-key inventory", () => {
    const ASSET = `${ROOT}/runtime/truth-key-inventory.json`;
    const assetBytes = readFileSync(path.join(process.cwd(), ASSET));
    const authoritative = parseTruthKeyInventory(assetBytes);
    const assetSha = sha256(ASSET);

    it("is a bare canonical array, and the asset is the only place the keys are written", () => {
      expect(assetBytes.toString("utf8")).toBe(`${JSON.stringify(authoritative)}\n`);
      expect(authoritative.length).toBeGreaterThan(0);
      expect(authoritative.every((key) => typeof key === "string" && key.length > 0)).toBe(true);
    });

    it("is referenced by path and hash, never restated, in every operative contract", () => {
      // Amendment 6 declared the asset authoritative and then copied the array
      // into four contracts and this test — four more places to drift. The
      // contracts now carry the path, the digest and the count, and nothing else.
      for (const file of [
        "truth-isolation-plan.json",
        "evidence-schema.json",
        "raw-ocr-contract.json",
        "acquisition-runtime-isolation-contract.json",
      ]) {
        const contract = read(path.join(ROOT, file)) as {
          forbiddenEvidenceKeyInventory?: Record<string, unknown>;
          runtimeBundle?: {
            dependencyClosureGate: { forbiddenEvidenceKeyInventory: Record<string, unknown> };
          };
        };
        const inventory =
          contract.forbiddenEvidenceKeyInventory ??
          contract.runtimeBundle?.dependencyClosureGate.forbiddenEvidenceKeyInventory;
        expect(inventory, `${file} declares no inventory`).toBeDefined();
        expect(inventory!.authoritativeAsset).toBe(ASSET);
        expect(inventory!.assetSha256).toBe(assetSha);
        expect(inventory!.keyCount).toBe(authoritative.length);
        expect(inventory!.keysNotRestatedHere).toBe(true);
        // The literal keys must NOT appear anywhere in the contract.
        const serialized = JSON.stringify(contract);
        for (const key of authoritative) {
          expect(serialized.includes(`"${key}"`), `${file} restates ${key}`).toBe(false);
        }
      }
    });

    it("is read, not restated, by the freeze script and the bundle scanner", () => {
      const freeze = readFileSync(
        path.join(process.cwd(), "scripts/eval/issue-149-brand-evidence-acquisition-freeze.mjs"),
        "utf8",
      );
      expect(freeze).toContain('path.join(ROOT, "runtime/truth-key-inventory.json")');
      for (const key of authoritative) {
        expect(freeze.includes(`"${key}"`), `freeze script restates ${key}`).toBe(false);
      }
      const scanner = readFileSync(
        path.join(process.cwd(), "scripts/eval/lib/issue-149-bundle-scan.ts"),
        "utf8",
      );
      for (const key of authoritative) {
        expect(scanner.includes(`"${key}"`), `bundle scanner restates ${key}`).toBe(false);
      }
    });

    it("distinguishes prohibited field NAMES from historical VALUES", () => {
      const plan = read(path.join(ROOT, "truth-isolation-plan.json")) as {
        forbiddenEvidenceKeyInventory: { fieldNamesVersusValues: string };
      };
      expect(plan.forbiddenEvidenceKeyInventory.fieldNamesVersusValues).toContain(
        "read-only identity-leak verifier",
      );
      const schema = read(path.join(ROOT, "evidence-schema.json")) as {
        truthIsolationAssertion: {
          inBoundaryKeyAndFileScan: string;
          postSealHistoricalValueScan: string;
        };
      };
      expect(schema.truthIsolationAssertion.postSealHistoricalValueScan).toContain("AFTER");
      expect(schema.truthIsolationAssertion.inBoundaryKeyAndFileScan).toContain("KEY");
    });
  });

  it("corrects the ID-map access boundary in both the contract and the map", () => {
    for (const file of [`${ROOT}/id-map-contract.json`, `${ROOT}/post-freeze/id-map.json`]) {
      const record = read(file) as {
        accessBoundary: {
          trustedStagingMayReadGenerateAndVerify: boolean;
          mountedIntoIsolatedDiscovery: boolean;
          mountedIntoIsolatedExecution: boolean;
          importedByAcquisitionCode: boolean;
          insideStagedImageDirectory: boolean;
          insideRawEvidenceDirectory: boolean;
          physicalInaccessibilityClaimed: boolean;
          mayNotBeUsedAgainstAcquiredEvidenceUntil: string;
          onlyActorAuthorizedToUseItForTruthBasedEvaluation: string;
        };
      };
      const boundary = record.accessBoundary;
      expect(boundary.trustedStagingMayReadGenerateAndVerify).toBe(true);
      expect(boundary.mountedIntoIsolatedDiscovery).toBe(false);
      expect(boundary.mountedIntoIsolatedExecution).toBe(false);
      expect(boundary.importedByAcquisitionCode).toBe(false);
      expect(boundary.insideStagedImageDirectory).toBe(false);
      expect(boundary.insideRawEvidenceDirectory).toBe(false);
      expect(boundary.physicalInaccessibilityClaimed).toBe(false);
      expect(boundary.mayNotBeUsedAgainstAcquiredEvidenceUntil).toContain("sealed");
      expect(boundary.onlyActorAuthorizedToUseItForTruthBasedEvaluation).toContain("actor 3");
      // The false global rule must be gone, not merely reworded around.
      expect(JSON.stringify(boundary)).not.toContain("readableOnlyAfter");
    }
  });

  describe("three separate workflow jobs", () => {
    const plan = read(path.join(ROOT, "post-freeze-evaluation-plan.json")) as {
      actorsAndBoundaries: {
        jobA_trustedPreparation: {
          checksOutTheRepository: boolean;
          mayReadHistoricalIdentityAndTheEvaluationManifest: boolean;
          isNotTruthFreeItself: boolean;
          emitsTruthFreePreparationArtifactContainingOnly: string[];
          mustNotPlaceInThatArtifact: string[];
        };
        jobB_isolatedDiscoverOrExecute: {
          checksOutTheRepository: boolean;
          receivesTheRepositoryWorkspace: boolean;
          receivesOnly: string;
          gitHubTokenOrRepositoryCredentialEntersTheContainer: boolean;
          receivesTheIdMap: boolean;
        };
        jobC_readOnlyIdentityLeakVerifier: {
          receives: string[];
          doesNotReceive: string[];
          mayNot: string[];
          cleanReportIsAMandatoryPreconditionFor: string[];
          reportLocation: string;
        };
        actor2_postRunCommitProcess: { preconditions: string[] };
        actor3_postFreezeEvaluationProcess: {
          preconditions: string[];
          physicalExclusivityClaimed: boolean;
          isTheOnlyActorAuthorizedToUseTheMapOrGovernedTruthForEvaluation: boolean;
        };
      };
    };
    const actors = plan.actorsAndBoundaries;

    it("keeps Job A trusted rather than calling the whole workflow truth-free", () => {
      const a = actors.jobA_trustedPreparation;
      expect(a.checksOutTheRepository).toBe(true);
      expect(a.mayReadHistoricalIdentityAndTheEvaluationManifest).toBe(true);
      expect(a.isNotTruthFreeItself).toBe(true);
      expect(a.emitsTruthFreePreparationArtifactContainingOnly).toHaveLength(5);
      expect(a.mustNotPlaceInThatArtifact.join(" ")).toContain("post-freeze ID map");
    });

    it("gives Job B no checkout, no workspace and no credential", () => {
      const b = actors.jobB_isolatedDiscoverOrExecute;
      expect(b.checksOutTheRepository).toBe(false);
      expect(b.receivesTheRepositoryWorkspace).toBe(false);
      expect(b.gitHubTokenOrRepositoryCredentialEntersTheContainer).toBe(false);
      expect(b.receivesTheIdMap).toBe(false);
      expect(b.receivesOnly).toContain("truth-free preparation artifact");
    });

    it("gives Job C an identifier inventory and no truth, and makes its report a precondition", () => {
      const c = actors.jobC_readOnlyIdentityLeakVerifier;
      expect(c.receives.join(" ")).toContain("historical case-ID and fixture-path inventory");
      expect(c.doesNotReceive.join(" ")).toContain("acceptable Brand values");
      expect(c.doesNotReceive.join(" ")).toContain("governed truth labels");
      expect(c.mayNot.join(" ").toLowerCase()).toContain("modify");
      expect(c.reportLocation).toContain("outside raw/");
      expect(c.cleanReportIsAMandatoryPreconditionFor).toEqual([
        "actor 2 committing evidence",
        "actor 3 beginning post-freeze evaluation",
      ]);
    });

    it("requires the clean verifier report before commitment and before evaluation", () => {
      expect(actors.actor2_postRunCommitProcess.preconditions.join(" ")).toContain(
        "identity-leak report",
      );
      expect(actors.actor3_postFreezeEvaluationProcess.preconditions.join(" ")).toContain(
        "identity-leak report",
      );
    });

    it("states actor 3's exclusivity as authorization, not physical access", () => {
      const three = actors.actor3_postFreezeEvaluationProcess;
      expect(three.physicalExclusivityClaimed).toBe(false);
      expect(three.isTheOnlyActorAuthorizedToUseTheMapOrGovernedTruthForEvaluation).toBe(true);
    });
  });

  it("shows Job A as physically reading governed truth", () => {
    const plan = read(path.join(ROOT, "post-freeze-evaluation-plan.json")) as {
      actorsAndBoundaries: {
        jobA_trustedPreparation: {
          receivesGovernedTruth: boolean;
          governedTruthAccess: {
            physicallyReadsATruthBearingSource: boolean;
            supersededClaim: string;
            mayUseOnly: string[];
            mustNotUseAcceptableValuesOrTruthTextFor: string[];
            noninterferenceClaimIsBounded: string;
            firstPhysicalAccessToATruthBearingSourceOccursIn: string;
            evaluationUseTruthBoundaryRemains: string;
          };
        };
      };
      truthBoundaryLocation: string;
    };
    const access = plan.actorsAndBoundaries.jobA_trustedPreparation.governedTruthAccess;
    expect(plan.actorsAndBoundaries.jobA_trustedPreparation.receivesGovernedTruth).toBe(true);
    expect(access.physicallyReadsATruthBearingSource).toBe(true);
    expect(access.supersededClaim).toContain("no governed truth");
    expect(access.firstPhysicalAccessToATruthBearingSourceOccursIn).toContain("Job A");
    expect(access.evaluationUseTruthBoundaryRemains).toContain("actor 2 and actor 3");
    expect(access.noninterferenceClaimIsBounded).toContain("NOT claimed");
    expect(plan.truthBoundaryLocation).toContain("EVALUATION-USE");
  });

  it("defines final ranked membership as decision, not as the presence of ranking", () => {
    const contract = read(path.join(ROOT, "candidate-decision-contract.json")) as {
      finalRankedMembership: {
        membershipIs: string;
        notThePresenceOfRanking: boolean;
        orderedBy: string;
        tieOrder: string;
        selectedCandidate: string;
        arrayLevelInvariantsEnforcedIn: string;
        haltCodes: Record<string, string>;
      };
      supportProvenanceLevel: {
        completePostDeduplicationMergedSupportForEveryFinalRankedCandidate: {
          available: boolean;
          notReconstructedInTheAdapter: boolean;
        };
      };
    };
    const membership = contract.finalRankedMembership;
    expect(membership.membershipIs).toContain("decision is defined");
    expect(membership.notThePresenceOfRanking).toBe(true);
    expect(membership.orderedBy).toContain("compareCandidateRanking");
    expect(membership.orderedBy).toContain("NOT rankingScore alone");
    expect(membership.tieOrder).toContain("original diagnostic-array order");
    expect(membership.selectedCandidate).toContain("position 0");
    expect(membership.arrayLevelInvariantsEnforcedIn).toContain("module-private");
    expect(membership.arrayLevelInvariantsEnforcedIn).toContain("acquireProductionBrandEvidence");
    expect(Object.keys(membership.haltCodes)).toEqual([
      "RANKED_MEMBERSHIP_INCONSISTENT",
      "RANKED_POSITION_PARITY_FAILURE",
    ]);

    const support =
      contract.supportProvenanceLevel
        .completePostDeduplicationMergedSupportForEveryFinalRankedCandidate;
    expect(support.available).toBe(false);
    expect(support.notReconstructedInTheAdapter).toBe(true);
  });

  it("makes generator reproducibility a mandatory Job A precondition", () => {
    const workflow = readFileSync(path.join(process.cwd(), ROOT, "workflow-plan.md"), "utf8");
    expect(workflow).toContain("--check");
    expect(workflow).toContain("STAGE_1_GENERATED_ARTIFACT_DRIFT");
    expect(workflow).toContain("mandatory precondition");
    const commands = readFileSync(path.join(process.cwd(), ROOT, "commands.sh"), "utf8");
    expect(commands).toContain(
      "node scripts/eval/issue-149-brand-evidence-acquisition-freeze.mjs --check",
    );
  });

  it("names the extractor-owning function as the only public Brand evidence API", () => {
    for (const file of [
      "acquisition-invocation-contract.json",
      "candidate-decision-contract.json",
      "candidate-fingerprint-contract.json",
      "evidence-schema.json",
    ]) {
      const contract = read(path.join(ROOT, file)) as {
        candidateEmissionApi: {
          module: string;
          function: string;
          firstArgument: string;
          theRunnerSuppliesNo: string[];
          theRunnerNeverCalls: string[];
          opaqueIdentitySource: string;
          extractorInvokedExactlyOncePerItem: boolean;
          noRetryPath: boolean;
          internalSteps: string[];
          supersededRoutes: string[];
          runtimeExportSurface: string[];
          haltCodes: Record<string, string>;
        };
      };
      const api = contract.candidateEmissionApi;
      expect(api.module).toBe("scripts/eval/lib/issue-149-candidate-adapter.ts");
      expect(api.function).toBe("acquireProductionBrandEvidence");
      expect(api.firstArgument).toContain("ExtractionInput");
      expect(api.firstArgument).toContain("NOT ExtractionDebug");
      expect(api.theRunnerSuppliesNo).toContain("ExtractionDebug");
      expect(api.theRunnerSuppliesNo).toContain("FieldSelection");
      expect(api.theRunnerNeverCalls).toContain("extractLabelEvidenceDetailed");
      expect(api.opaqueIdentitySource).toContain("input.artifactRef");
      expect(api.extractorInvokedExactlyOncePerItem).toBe(true);
      expect(api.noRetryPath).toBe(true);
      expect(api.internalSteps.join(" ")).toContain("exactly once");
      expect(api.supersededRoutes).toHaveLength(3);
      expect(api.runtimeExportSurface).toEqual([
        "CandidateAdapterError",
        "acquireProductionBrandEvidence",
      ]);
      for (const code of ["MALFORMED_ARTIFACT_REF", "RANKED_MEMBERSHIP_INCONSISTENT"]) {
        expect(Object.hasOwn(api.haltCodes, code)).toBe(true);
      }
    }

    // The reference-adapter section no longer names the superseded function.
    const invocation = read(path.join(ROOT, "acquisition-invocation-contract.json")) as {
      referenceCandidateAdapter: {
        theOnlyAuthorizedFunction: string;
        usingTheModuleIsNotSufficient: string;
      };
      onExtractorFailure: { diagnosticSelectionReturned: boolean; itemRetried: boolean };
    };
    expect(invocation.referenceCandidateAdapter.theOnlyAuthorizedFunction).toBe(
      "acquireProductionBrandEvidence",
    );
    expect(invocation.referenceCandidateAdapter.usingTheModuleIsNotSufficient).toContain(
      "acquireProductionBrandEvidence",
    );
    expect(invocation.onExtractorFailure.diagnosticSelectionReturned).toBe(false);
    expect(invocation.onExtractorFailure.itemRetried).toBe(false);

    const workflow = readFileSync(path.join(process.cwd(), ROOT, "workflow-plan.md"), "utf8");
    const execute = workflow.slice(workflow.indexOf("## Mode `execute`"));
    expect(execute).toContain("acquireProductionBrandEvidence(extractionInput)");
    expect(execute).toContain("evidence.value.detailed.debug.passes");
    expect(execute).toContain("evidence.value.candidateRecords");
  });

  it("records the parity tests as implemented, because they are", () => {
    const parity = read(path.join(ROOT, "brand-diagnostic-parity-contract.json")) as {
      stage2TestContract: { implementedInThisAmendment: boolean; implementedIn: string[] };
    };
    expect(parity.stage2TestContract.implementedInThisAmendment).toBe(true);
    for (const file of parity.stage2TestContract.implementedIn) {
      expect(existsSync(path.join(process.cwd(), file))).toBe(true);
    }
  });

  it("uses one parsed closure analyzer, and does not require helpers to call the API", () => {
    const isolation = read(path.join(ROOT, "acquisition-runtime-isolation-contract.json")) as {
      runtimeBundle: {
        dependencyClosureGate: {
          candidateEmissionClosureGate: {
            referenceAnalyzer: string;
            onlyTheRunnerEntrypointMustInvokeTheApi: boolean;
            prohibitedCallsOutsideTheAdapterModule: string[];
            prohibitedWritesOutsideTheAdapterModule: {
              detectedForms: string[];
              anchoredOnAdjacentPropertyPairs: string[];
              singleNamesAreNotEnough: boolean;
            };
            symbolResolvedNotNameMatched: boolean;
            frozenPathsNotCallerSelectable: {
              runnerEntry: string;
              authorizedAdapterModule: string;
            };
            requiredCallShape: Record<string, boolean>;
            acrossTheCompleteClosure: string[];
            haltCode: string;
            testedBy: string;
          };
        };
      };
    };
    const gate = isolation.runtimeBundle.dependencyClosureGate.candidateEmissionClosureGate;
    expect(existsSync(path.join(process.cwd(), gate.referenceAnalyzer))).toBe(true);
    expect(gate.onlyTheRunnerEntrypointMustInvokeTheApi).toBe(true);
    expect(gate.prohibitedCallsOutsideTheAdapterModule).toContain("extractLabelEvidenceDetailed");
    // The write rule is anchored on ADJACENT property pairs, not single names:
    // a bare `passes` would reject any unrelated object with that property.
    const writes = gate.prohibitedWritesOutsideTheAdapterModule;
    expect(writes.singleNamesAreNotEnough).toBe(true);
    expect(writes.anchoredOnAdjacentPropertyPairs).toContain("debug.passes");
    expect(writes.anchoredOnAdjacentPropertyPairs).toContain("debug.finalSelections");
    expect(writes.anchoredOnAdjacentPropertyPairs).toContain("brandDiagnostics.candidates");
    for (const form of [
      "delete",
      "Object.assign",
      "Reflect.set",
      "splice",
      "compound assignment",
    ]) {
      expect(writes.detectedForms).toContain(form);
    }

    // The contract's claims are the analyzer's actual behaviour, not a
    // description of it: the frozen paths are the analyzer's own constants and
    // are not caller-selectable.
    expect(gate.symbolResolvedNotNameMatched).toBe(true);
    expect(gate.frozenPathsNotCallerSelectable.runnerEntry).toBe(RUNNER_ENTRY_PATH);
    expect(gate.frozenPathsNotCallerSelectable.authorizedAdapterModule).toBe(
      AUTHORIZED_ADAPTER_MODULE,
    );
    expect(Object.values(gate.requiredCallShape).every((value) => value === true)).toBe(true);
    expect(gate.acrossTheCompleteClosure.join(" ")).toContain("exactly one call");
    expect(gate.haltCode).toBe("STAGE2_SOURCE_CLOSURE_VIOLATION");
    expect(existsSync(path.join(process.cwd(), gate.testedBy))).toBe(true);
  });

  it("performs parity inside the public boundary and returns nothing on failure", () => {
    const parity = read(path.join(ROOT, "brand-diagnostic-parity-contract.json")) as {
      parityIsInternalToThePublicApi: {
        performedInside: string;
        algorithm: string[];
        automaticallyIncludes: string[];
        authority: string;
        noEvidenceReturnedOnFailure: boolean;
        haltCode: string;
      };
    };
    const rule = parity.parityIsInternalToThePublicApi;
    expect(rule.performedInside).toBe("acquireProductionBrandEvidence");
    expect(rule.algorithm.join(" ")).toContain("ONLY filterChecks and activeRejectionReasons");
    expect(rule.automaticallyIncludes).toContain("brandDiagnostics.lines");
    expect(rule.authority).toBe("debug.finalSelections.brand");
    expect(rule.noEvidenceReturnedOnFailure).toBe(true);
    expect(rule.haltCode).toBe("BRAND_DIAGNOSTIC_SELECTION_PARITY_FAILURE");
  });

  it("proves the staging truth-access boundary rather than asserting it", () => {
    const plan = read(path.join(ROOT, "truth-isolation-plan.json")) as {
      jobATruthAccess: {
        provenBy: { proxyAccessProof: string; recursiveMutationProof: string; priorGap: string };
      };
    };
    const proven = plan.jobATruthAccess.provenBy;
    expect(proven.proxyAccessProof).toContain("Proxy");
    expect(proven.proxyAccessProof).toContain("REAL core");
    expect(proven.recursiveMutationProof).toContain("booleans");
    expect(proven.priorGap).toContain("knownAmbiguous");
  });

  it("requires a kept population to retain a ranked survivor", () => {
    for (const file of [
      "acquisition-invocation-contract.json",
      "candidate-decision-contract.json",
    ]) {
      const contract = read(path.join(ROOT, file)) as {
        keptPopulationMustRetainARankedSurvivor: {
          relation: string;
          whenNoKeptCandidates: string[];
          whenAtLeastOneKeptCandidate: string[];
          haltCode: string;
          enforcedIn: string;
        };
      };
      const rule = contract.keptPopulationMustRetainARankedSurvivor;
      expect(rule.relation).toBe(
        "(any candidate is kept) === (at least one candidate carries a decision)",
      );
      expect(rule.whenAtLeastOneKeptCandidate.join(" ")).toContain(
        "exactly one selected candidate",
      );
      expect(rule.whenNoKeptCandidates.join(" ")).toContain("zero ranked positions");
      expect(rule.haltCode).toBe("RANKED_MEMBERSHIP_INCONSISTENT");
      expect(rule.enforcedIn).toContain("acquireProductionBrandEvidence");
    }
  });

  it("keeps loadSourceImage as the single source-image byte channel", () => {
    const plan = read(path.join(ROOT, "truth-isolation-plan.json")) as {
      stagingByteChannel: {
        singleChannel: string;
        theExactVerifiedBufferIsWhatIsStaged: boolean;
        coreResolvesNoSourcePathItself: boolean;
        transientBytesNeverSerialized: boolean;
        provenBy: string;
      };
    };
    const channel = plan.stagingByteChannel;
    expect(channel.singleChannel).toBe("loadSourceImage");
    expect(channel.theExactVerifiedBufferIsWhatIsStaged).toBe(true);
    expect(channel.coreResolvesNoSourcePathItself).toBe(true);
    expect(channel.transientBytesNeverSerialized).toBe(true);
    expect(existsSync(path.join(process.cwd(), channel.provenBy))).toBe(true);
  });

  it("requires complete score and ranking evidence on every kept candidate", () => {
    const contract = read(path.join(ROOT, "candidate-decision-contract.json")) as {
      keptCandidateEvidence: {
        everyKeptCandidate: string[];
        everyRejectedCandidate: string[];
        aKeptCandidateMayLackADecision: string;
        haltCode: string;
      };
      haltCodes: Record<string, string>;
    };
    const kept = contract.keptCandidateEvidence;
    expect(kept.everyKeptCandidate.join(" ")).toContain("score is non-null");
    expect(kept.everyKeptCandidate.join(" ")).toContain("ranking is non-null");
    expect(kept.everyRejectedCandidate).toContain("score is null");
    expect(kept.everyRejectedCandidate).toContain("ranking is null");
    expect(kept.aKeptCandidateMayLackADecision).toContain("deduplication");
    expect(kept.haltCode).toBe("KEPT_CANDIDATE_EVIDENCE_INCOMPLETE");
    expect(Object.hasOwn(contract.haltCodes, "KEPT_CANDIDATE_EVIDENCE_INCOMPLETE")).toBe(true);
  });

  it("states the Stage 1 execution status accurately", () => {
    // Trusted staging HAS run — it is what produced the committed artifacts.
    // Claiming otherwise was an audit-language error, not an evidence problem.
    const expected =
      "The Stage 1 trusted freeze/staging generator and its temporary reproducibility mode have run.";
    const contracts = files.filter(
      (f) => f.endsWith(".json") && !HISTORICAL_FILES.has(path.basename(f)),
    );
    const declaring = contracts.filter((f) => {
      const contract = read(f) as { stage1ExecutionStatus?: string };
      return contract.stage1ExecutionStatus !== undefined;
    });
    expect(declaring.length).toBeGreaterThanOrEqual(10);
    for (const file of declaring) {
      const contract = read(file) as { stage1ExecutionStatus: string };
      expect(contract.stage1ExecutionStatus).toContain(expected);
      expect(contract.stage1ExecutionStatus).toContain("No Stage 2 Job A workflow");
    }

    const gitSha = readFileSync(path.join(process.cwd(), ROOT, "git-sha.txt"), "utf8");
    expect(gitSha).toContain("trusted freeze/staging generator");
    expect(gitSha).toContain("No Stage 2 Job A workflow");

    const commands = readFileSync(path.join(process.cwd(), ROOT, "commands.sh"), "utf8");
    expect(commands).toContain("TRUSTED FREEZE/STAGING");
    expect(commands).not.toContain("planning and preregistration only");
  });

  it("keeps the freeze core out of the runtime bundle", () => {
    const core = readFileSync(
      path.join(process.cwd(), "scripts/eval/lib/issue-149-freeze-core.mjs"),
      "utf8",
    );
    expect(core).toContain("Host-only");
    expect(core).toContain("never present in Job B");
  });

  it("uses retention-bound language for the 100 MB fallback", () => {
    const volume = JSON.parse(
      readFileSync(path.join(process.cwd(), ROOT, "evidence-volume-rule.json"), "utf8"),
    );
    expect(volume.retentionLanguage.required).toBe("temporarily retained workflow artifact");
    expect(volume.retentionLanguage.prohibited).toBe("permanently preserved");
    expect(volume.above100MBProcedure.join(" ")).toContain("stop before post-freeze truth");
  });
});
