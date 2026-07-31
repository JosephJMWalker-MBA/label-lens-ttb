/**
 * Issue #149 — Stage 1 contract-consistency sweep.
 *
 * Non-OCR. Fails if a CURRENT, non-historical contract still describes the
 * superseded design. Historical amendment records are allowed to contain the old
 * language, because that is their job.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CANDIDATE_EVIDENCE_REQUIRED_KEYS } from "../../../scripts/eval/lib/issue-149-evidence-canonical";

const ROOT = "artifacts/issue-149-brand-complete-evidence-acquisition";

/** Records whose purpose is to preserve superseded language. */
const HISTORICAL_FILES = new Set([
  "preregistration-amendment.md",
  "preregistration-amendment-2.md",
  "preregistration-amendment-3.md",
  "preregistration-amendment-4.md",
  "branch-pointer-incident.md",
  "amendment-linkage.json",
  "amendment-2-linkage.json",
  "amendment-3-linkage.json",
  "amendment-4-linkage.json",
  "git-sha.txt",
]);

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
    expect(contract.route).toBe("direct call to extractLabelEvidenceDetailed");
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

  it("names the post-freeze actors and where the truth boundary sits", () => {
    const plan = read(path.join(ROOT, "post-freeze-evaluation-plan.json")) as {
      actorsAndBoundaries: {
        actor1_ocrWorkflowJob: { commitsToGit: boolean; receivesGovernedTruth: boolean };
        actor2_postRunCommitProcess: {
          isNotTheOcrProcess: boolean;
          receivesGovernedTruth: boolean;
        };
        actor3_postFreezeEvaluationProcess: { isTheOnlyActorThatMayOpen: string[] };
      };
    };
    const actors = plan.actorsAndBoundaries;
    expect(actors.actor1_ocrWorkflowJob.commitsToGit).toBe(false);
    expect(actors.actor1_ocrWorkflowJob.receivesGovernedTruth).toBe(false);
    expect(actors.actor2_postRunCommitProcess.isNotTheOcrProcess).toBe(true);
    expect(actors.actor2_postRunCommitProcess.receivesGovernedTruth).toBe(false);
    expect(actors.actor3_postFreezeEvaluationProcess.isTheOnlyActorThatMayOpen.join(" ")).toContain(
      "id-map.json",
    );
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

  it("uses retention-bound language for the 100 MB fallback", () => {
    const volume = JSON.parse(
      readFileSync(path.join(process.cwd(), ROOT, "evidence-volume-rule.json"), "utf8"),
    );
    expect(volume.retentionLanguage.required).toBe("temporarily retained workflow artifact");
    expect(volume.retentionLanguage.prohibited).toBe("permanently preserved");
    expect(volume.above100MBProcedure.join(" ")).toContain("stop before post-freeze truth");
  });
});
