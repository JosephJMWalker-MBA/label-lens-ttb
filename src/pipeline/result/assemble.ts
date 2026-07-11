import type { AnalysisRun } from "@/domain/run/analysis-run.types";
import type { DeclaredFact } from "@/domain/run/declared-facts.types";
import type { RuleVersionRef } from "@/domain/run/version-manifest.types";
import { validateVerificationFinding } from "@/domain/verification/finding.schema";
import type { VerificationFinding } from "@/domain/verification/finding.types";
import type { AnalyzerEvidenceResponse } from "@/pipeline/analyzer/analyzer.types";
import type {
  PrecheckAdvisoryQuality,
  PrecheckResult as OrchestrationResult,
} from "@/pipeline/precheck/precheck.types";
import { err, ok, type Result } from "@/shared/result";

import { ADVISORY_NOTICE } from "./advisory-notice";
import { deepFreeze } from "./freeze";
import { validatePrecheckResult } from "./result.schema";
import { RESULT_MODE, RESULT_SCHEMA_VERSION } from "./result.types";
import type { AssemblyError, PrecheckResult } from "./result.types";
import { deriveMachineResultId } from "./serialize";
import { stableStringify } from "./serialize";

export interface AssembleInput {
  run: AnalysisRun;
  /** Validated Commit 7 orchestration output. */
  orchestration: OrchestrationResult;
  /** Validated Commit 8 analyzer evidence. */
  analyzer: AnalyzerEvidenceResponse;
  declaredFacts: {
    applicationBrandName: DeclaredFact;
    applicationAlcoholValue: DeclaredFact;
  };
  advisoryQuality?: PrecheckAdvisoryQuality;
  /** Optional caller-supplied deterministic id; derived from content otherwise. */
  machineResultId?: string;
}

function fail(
  code: AssemblyError["code"],
  message: string,
  issues: string[] = [],
): Result<never, AssemblyError> {
  return err({ code, message, issues });
}

function manifestsMatch(a: RuleVersionRef[], b: RuleVersionRef[]): boolean {
  return (
    a.length === b.length &&
    a.every((ref, i) => ref.ruleId === b[i].ruleId && ref.version === b[i].version)
  );
}

/**
 * Assemble the immutable machine pre-check result from an immutable run, the
 * validated orchestration output, and the validated analyzer evidence. Every
 * cross-source identity is reconciled explicitly; nothing is silently repaired.
 */
export function assemblePrecheckResult(
  input: AssembleInput,
): Result<PrecheckResult, AssemblyError> {
  const { run, orchestration, analyzer } = input;

  // 1. Run/profile identity must match the orchestration profile.
  if (
    run.versionManifest.ruleProfileId !== orchestration.profileId ||
    run.versionManifest.ruleProfileVersion !== orchestration.profileVersion
  ) {
    return fail("RUN_PROFILE_MISMATCH", "Run profile does not match the orchestration profile.", [
      `run ${run.versionManifest.ruleProfileId}@${run.versionManifest.ruleProfileVersion} vs orchestration ${orchestration.profileId}@${orchestration.profileVersion}`,
    ]);
  }

  // 2. Ordered rule manifests must match exactly.
  if (!manifestsMatch(run.versionManifest.rules, orchestration.ruleManifest)) {
    return fail("RULE_MANIFEST_MISMATCH", "Run and orchestration rule manifests differ.");
  }

  // 3. Artifact identity must match across run, manifest, and analyzer evidence.
  const derivativeSha = run.sanitizedDerivative.sha256;
  if (
    run.versionManifest.sanitizedDerivativeSha256 !== derivativeSha ||
    analyzer.provenance.derivativeSha256 !== derivativeSha
  ) {
    return fail(
      "ARTIFACT_IDENTITY_MISMATCH",
      "Derivative hash differs across run, manifest, or analyzer.",
    );
  }

  // 4. Declared facts must be the same immutable facts the run carried.
  if (
    stableStringify(input.declaredFacts.applicationBrandName) !==
      stableStringify(run.declaredFacts.brandName) ||
    stableStringify(input.declaredFacts.applicationAlcoholValue) !==
      stableStringify(run.declaredFacts.alcoholValue)
  ) {
    return fail("DECLARED_FACT_MISMATCH", "Declared facts differ from the run's immutable facts.");
  }

  // 5. Every finding validates through the committed finding schema.
  for (const finding of orchestration.findings) {
    if (!validateVerificationFinding(finding).ok) {
      return fail("INVALID_FINDING", `Finding for rule ${finding.ruleId} is invalid.`);
    }
  }

  // 6. Finding evidence references must resolve to the supplied observations.
  const observations = {
    brandName: analyzer.fields.brandName,
    alcoholStatement: analyzer.fields.alcoholStatement,
  };
  const resolution = resolveEvidenceReferences(orchestration.findings, derivativeSha, observations);
  if (!resolution.ok) return resolution;

  // 7. Construct the machine result (without an id), derive the id, then validate.
  const base = {
    resultSchemaVersion: RESULT_SCHEMA_VERSION,
    mode: RESULT_MODE,
    profile: {
      id: orchestration.profileId,
      version: orchestration.profileVersion,
      ruleManifest: orchestration.ruleManifest,
    },
    run: {
      runId: run.runId,
      createdAt: run.createdAt,
      product: run.product,
      sourceArtifact: run.sourceArtifact,
      sanitizedDerivative: run.sanitizedDerivative,
    },
    declaredFacts: input.declaredFacts,
    evidenceAssessments: orchestration.evidenceAssessments,
    observations: {
      provenance: analyzer.provenance,
      brandName: analyzer.fields.brandName,
      alcoholStatement: analyzer.fields.alcoholStatement,
    },
    findings: orchestration.findings,
    versionManifest: run.versionManifest,
    advisoryNotice: ADVISORY_NOTICE,
    ...(input.advisoryQuality !== undefined ? { advisoryQuality: input.advisoryQuality } : {}),
    humanDispositionHistory: [] as PrecheckResult["humanDispositionHistory"],
  };

  const machineResultId = input.machineResultId ?? deriveMachineResultId(base);
  const candidate: PrecheckResult = { machineResultId, ...base };

  const validated = validatePrecheckResult(candidate);
  if (!validated.ok) return validated;

  return ok(deepFreeze(validated.value));
}

function resolveEvidenceReferences(
  findings: VerificationFinding[],
  derivativeSha: string,
  observations: {
    brandName: { state: string; alternates: unknown[] };
    alcoholStatement: { state: string; alternates: unknown[] };
  },
): Result<void, AssemblyError> {
  for (const finding of findings) {
    for (const ref of finding.evidenceReferences) {
      if (ref.derivativeSha256 !== derivativeSha) {
        return fail(
          "UNRESOLVED_EVIDENCE_REFERENCE",
          `Finding ${finding.ruleId} references an unknown derivative hash.`,
        );
      }
      const observation =
        ref.fieldId === "brandName"
          ? observations.brandName
          : ref.fieldId === "alcoholStatement"
            ? observations.alcoholStatement
            : null;
      if (!observation) {
        return fail(
          "UNRESOLVED_EVIDENCE_REFERENCE",
          `Finding ${finding.ruleId} references unknown field ${ref.fieldId}.`,
        );
      }
      if (observation.state !== ref.observationState) {
        return fail(
          "UNRESOLVED_EVIDENCE_REFERENCE",
          `Finding ${finding.ruleId} evidence state ${ref.observationState} does not match observation ${observation.state}.`,
        );
      }
      if (ref.alternateIndex !== undefined && ref.alternateIndex >= observation.alternates.length) {
        return fail(
          "UNRESOLVED_EVIDENCE_REFERENCE",
          `Finding ${finding.ruleId} references a missing alternate.`,
        );
      }
    }
  }
  return ok(undefined);
}
