import type { AnalysisRun } from "@/domain/run/analysis-run.types";
import type { DeclaredFact } from "@/domain/run/declared-facts.types";
import type {
  AuthorityVersion,
  ExecutableProvenance,
  OcrEngineVersion,
  RuleVersionRef,
} from "@/domain/run/version-manifest.types";
import { validateVerificationFinding } from "@/domain/verification/finding.schema";
import type { VerificationFinding } from "@/domain/verification/finding.types";
import type {
  AnalyzerEvidenceResponse,
  AnalyzerOcrEngine,
} from "@/pipeline/analyzer/analyzer.types";
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
  /** The single canonical executable provenance every layer must match exactly. */
  expectedProvenance: ExecutableProvenance;
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

function ocrModelKey(engine: OcrEngineVersion | AnalyzerOcrEngine): string {
  if (engine.kind !== "ocr") return "not_applicable";
  return `${engine.modelId ?? ""}|${engine.modelSha256 ?? ""}`;
}

function ocrEngineKey(engine: OcrEngineVersion | AnalyzerOcrEngine): string {
  if (engine.kind !== "ocr") return "not_applicable";
  return `${engine.engineId}@${engine.engineVersion}`;
}

function authorityKey(a: AuthorityVersion): string {
  return `${a.citation}|${a.snapshotDate}|${a.effectiveDate ?? ""}`;
}

/**
 * Reconcile every executable identity across the run manifest, the analyzer
 * provenance, the orchestration output, and the findings against the single
 * canonical expected provenance. Each mismatch returns a specific typed code and
 * the exact differing values; nothing is silently copied to repair a mismatch.
 */
function reconcileProvenance(
  expected: ExecutableProvenance,
  manifest: AnalysisRun["versionManifest"],
  analyzer: AnalyzerEvidenceResponse["provenance"],
  orchestration: OrchestrationResult,
  findings: VerificationFinding[],
): Result<void, AssemblyError> {
  const detail = (label: string, a: unknown, b: unknown): string[] => [
    `${label}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`,
  ];

  // Extraction adapter — manifest and analyzer must both equal expected.
  if (
    manifest.extractionAdapterId !== expected.extractionAdapterId ||
    manifest.extractionAdapterVersion !== expected.extractionAdapterVersion ||
    analyzer.extractionAdapterId !== expected.extractionAdapterId ||
    analyzer.extractionAdapterVersion !== expected.extractionAdapterVersion
  ) {
    return fail(
      "EXTRACTION_ADAPTER_VERSION_MISMATCH",
      "Extraction adapter identity differs across layers.",
      detail(
        "adapter",
        `${expected.extractionAdapterId}@${expected.extractionAdapterVersion}`,
        `manifest ${manifest.extractionAdapterId}@${manifest.extractionAdapterVersion}, analyzer ${analyzer.extractionAdapterId}@${analyzer.extractionAdapterVersion}`,
      ),
    );
  }

  // OCR engine id/version.
  const expectedEngine = ocrEngineKey(expected.ocrEngine);
  if (
    ocrEngineKey(manifest.ocrEngine) !== expectedEngine ||
    ocrEngineKey(analyzer.ocrEngine) !== expectedEngine
  ) {
    return fail(
      "OCR_ENGINE_VERSION_MISMATCH",
      "OCR engine identity differs across layers.",
      detail(
        "ocrEngine",
        expectedEngine,
        `manifest ${ocrEngineKey(manifest.ocrEngine)}, analyzer ${ocrEngineKey(analyzer.ocrEngine)}`,
      ),
    );
  }

  // OCR model id + asset digest.
  const expectedModel = ocrModelKey(expected.ocrEngine);
  if (
    ocrModelKey(manifest.ocrEngine) !== expectedModel ||
    ocrModelKey(analyzer.ocrEngine) !== expectedModel
  ) {
    return fail(
      "OCR_MODEL_IDENTITY_MISMATCH",
      "OCR model identity (id or asset digest) differs across layers.",
      detail(
        "ocrModel",
        expectedModel,
        `manifest ${ocrModelKey(manifest.ocrEngine)}, analyzer ${ocrModelKey(analyzer.ocrEngine)}`,
      ),
    );
  }

  // Parser.
  if (
    manifest.parserId !== expected.parserId ||
    manifest.parserVersion !== expected.parserVersion ||
    analyzer.parserId !== expected.parserId ||
    analyzer.parserVersion !== expected.parserVersion
  ) {
    return fail("PARSER_VERSION_MISMATCH", "Parser identity differs across layers.");
  }

  // Profile — expected, manifest, and orchestration.
  if (
    manifest.ruleProfileId !== expected.ruleProfileId ||
    manifest.ruleProfileVersion !== expected.ruleProfileVersion ||
    orchestration.profileId !== expected.ruleProfileId ||
    orchestration.profileVersion !== expected.ruleProfileVersion
  ) {
    return fail("PROFILE_VERSION_MISMATCH", "Profile identity differs across layers.");
  }

  // Exact ordered rule manifest — expected, manifest, and orchestration.
  if (
    !manifestsMatch(manifest.rules, expected.rules) ||
    !manifestsMatch(orchestration.ruleManifest, expected.rules)
  ) {
    return fail("RULE_VERSION_MISMATCH", "Ordered rule manifest differs across layers.");
  }

  // Authorities — manifest set must equal expected, and every finding authority
  // must be one of the expected authorities.
  const expectedAuthorities = new Set(expected.authorities.map(authorityKey));
  const manifestAuthorities = new Set(manifest.authorities.map(authorityKey));
  if (
    expectedAuthorities.size !== manifestAuthorities.size ||
    [...expectedAuthorities].some((k) => !manifestAuthorities.has(k))
  ) {
    return fail(
      "AUTHORITY_VERSION_MISMATCH",
      "Authority citations/dates differ from the canonical set.",
    );
  }
  for (const finding of findings) {
    if (!expectedAuthorities.has(authorityKey(finding.authority))) {
      return fail(
        "AUTHORITY_VERSION_MISMATCH",
        `Finding ${finding.ruleId} cites an authority outside the canonical set.`,
        detail("authority", finding.authority, [...expectedAuthorities]),
      );
    }
  }

  // Application build identity.
  if (
    manifest.applicationBuild.packageVersion !== expected.applicationBuild.packageVersion ||
    manifest.applicationBuild.gitCommitSha !== expected.applicationBuild.gitCommitSha ||
    manifest.applicationBuild.commitProvenance !== expected.applicationBuild.commitProvenance
  ) {
    return fail(
      "APPLICATION_BUILD_IDENTITY_MISMATCH",
      "Application build identity differs from the canonical build.",
    );
  }

  return ok(undefined);
}

/**
 * Assemble the immutable machine pre-check result from an immutable run, the
 * validated orchestration output, and the validated analyzer evidence. Every
 * cross-source identity is reconciled explicitly; nothing is silently repaired.
 */
export function assemblePrecheckResult(
  input: AssembleInput,
): Result<PrecheckResult, AssemblyError> {
  const { run, orchestration, analyzer, expectedProvenance } = input;

  // 1. Reconcile every executable identity across all layers against the single
  //    canonical provenance (adapter, OCR engine, OCR model digest, parser,
  //    profile, ordered rules, authorities, application build).
  const reconciled = reconcileProvenance(
    expectedProvenance,
    run.versionManifest,
    analyzer.provenance,
    orchestration,
    orchestration.findings,
  );
  if (!reconciled.ok) return reconciled;

  // 2. Derivative artifact identity must match across run, manifest, and analyzer.
  const derivativeSha = run.sanitizedDerivative.sha256;
  if (
    run.versionManifest.sanitizedDerivativeSha256 !== derivativeSha ||
    analyzer.provenance.derivativeSha256 !== derivativeSha
  ) {
    return fail(
      "DERIVATIVE_ARTIFACT_IDENTITY_MISMATCH",
      "Derivative hash differs across run, manifest, or analyzer.",
      [
        `run ${derivativeSha}, manifest ${run.versionManifest.sanitizedDerivativeSha256}, analyzer ${analyzer.provenance.derivativeSha256}`,
      ],
    );
  }

  // 3. Source artifact identity must be consistent between the run and manifest.
  //    A "same_bytes" derivative must carry the same source hash (never null).
  if (run.sourceArtifact.sha256 !== run.versionManifest.sourceArtifactSha256) {
    return fail(
      "SOURCE_ARTIFACT_IDENTITY_MISMATCH",
      "Source artifact hash differs between the run and its manifest.",
      [`run ${run.sourceArtifact.sha256}, manifest ${run.versionManifest.sourceArtifactSha256}`],
    );
  }
  if (
    run.versionManifest.derivativeRelationship === "same_bytes" &&
    run.versionManifest.sourceArtifactSha256 !== derivativeSha
  ) {
    return fail(
      "SOURCE_ARTIFACT_IDENTITY_MISMATCH",
      "A same-bytes derivative must record the source hash equal to the derivative hash.",
      [`source ${run.versionManifest.sourceArtifactSha256}, derivative ${derivativeSha}`],
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
