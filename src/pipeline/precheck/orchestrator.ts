import { createAnalysisRun } from "@/domain/run/analysis-run";
import type { AnalysisRun } from "@/domain/run/analysis-run.types";
import type { DeclaredFact } from "@/domain/run/declared-facts.types";
import type { EvidenceStatus } from "@/domain/run/run-status";
import type { RuleVersionRef } from "@/domain/run/version-manifest.types";
import type { RuleContext, VerificationRule } from "@/domain/rules/rule.types";
import { evidenceReferenceFromObservation } from "@/domain/verification/evidence-reference";
import type { EvidenceReference } from "@/domain/verification/evidence-reference";
import type { VerificationFinding } from "@/domain/verification/finding.types";
import { validateVerificationFinding } from "@/domain/verification/finding.schema";
import { validateAnalyzerEvidenceResponse } from "@/pipeline/analyzer/analyzer.schema";
import type { AnalyzerFieldObservation } from "@/pipeline/analyzer/analyzer.types";
import { err, ok, type Result } from "@/shared/result";

import { assessAlcoholEvidence, assessBrandEvidence } from "./evidence-sufficiency";
import { validatePrecheckRequestShape } from "./precheck.schema";
import type {
  EvidenceAssessment,
  PrecheckError,
  PrecheckRequest,
  PrecheckResult,
} from "./precheck.types";
import { winePrecheckRegistry } from "./wine-precheck.profile";

const BRAND_RULE_ID = "brand-name-canonical-comparison";
const ALCOHOL_SYNTAX_RULE_ID = "wine-alcohol-syntax";
const ALCOHOL_DECLARED_RULE_ID = "wine-alcohol-declared-comparison";

function fail(
  code: PrecheckError["code"],
  message: string,
  issues: string[],
): Result<never, PrecheckError> {
  return err({ code, message, issues });
}

/** The run version manifest must name exactly the executable profile, in order. */
function manifestMatches(
  runManifest: RuleVersionRef[],
  profileManifest: RuleVersionRef[],
): boolean {
  if (runManifest.length !== profileManifest.length) return false;
  return runManifest.every(
    (ref, i) =>
      ref.ruleId === profileManifest[i].ruleId && ref.version === profileManifest[i].version,
  );
}

/**
 * The narrow deterministic wine pre-check orchestrator.
 *
 * It validates intake, creates the immutable run, verifies the run manifest
 * matches the executable profile, determines per-check evidence sufficiency,
 * builds each rule's context, executes the profile in registry order, and
 * validates every finding. It assembles no user-facing report and adds no
 * timing, logs, timestamps, disposition, or overall status.
 */
export function runWinePrecheck(request: PrecheckRequest): Result<PrecheckResult, PrecheckError> {
  const shape = validatePrecheckRequestShape(request);
  if (!shape.ok) return shape;

  // Immutable run creation (validates the run-creation input).
  const runResult = createAnalysisRun(request.run);
  if (!runResult.ok) {
    return fail("INVALID_INTAKE", "Run creation input failed validation.", runResult.error.issues);
  }
  const run: AnalysisRun = runResult.value;

  // Intake/run derivative identity must be internally consistent.
  if (run.sanitizedDerivative.sha256 !== request.sanitizedDerivativeSha256) {
    return fail("INVALID_INTAKE", "Intake derivative hash does not match the run derivative.", [
      "sanitizedDerivativeSha256: does not match run.sanitizedDerivative.sha256",
    ]);
  }

  // The run manifest must match the executable wine profile exactly.
  const profileManifest = winePrecheckRegistry.ruleManifest();
  if (
    run.versionManifest.ruleProfileId !== winePrecheckRegistry.profileId ||
    run.versionManifest.ruleProfileVersion !== winePrecheckRegistry.profileVersion ||
    !manifestMatches(run.versionManifest.rules, profileManifest)
  ) {
    return fail("PROFILE_MISMATCH", "Run manifest does not match the wine pre-check profile.", [
      "versionManifest: profile id/version or ordered rule manifest differs from the registry profile",
    ]);
  }

  // Evidence-only analyzer validation.
  const analyzerResult = validateAnalyzerEvidenceResponse(request.analyzer);
  if (!analyzerResult.ok) {
    return fail(
      "INVALID_INTAKE",
      "Analyzer response failed evidence-only validation.",
      analyzerResult.error.issues,
    );
  }
  const analyzer = analyzerResult.value;

  const runDerivativeSha256 = run.sanitizedDerivative.sha256;
  const common = {
    runDerivativeSha256,
    provenanceDerivativeSha256: analyzer.provenance.derivativeSha256,
  };

  const brandObservation = analyzer.fields.brandName;
  const alcoholObservation = analyzer.fields.alcoholStatement;

  const brandAssessment = assessBrandEvidence(
    brandObservation,
    request.coverage.brandNameProcessed,
    common,
  );
  const alcoholAssessment = assessAlcoholEvidence(
    alcoholObservation,
    request.coverage.alcoholStatementProcessed,
    common,
  );

  const runRef = {
    runId: run.runId,
    ruleProfileId: run.versionManifest.ruleProfileId,
    ruleProfileVersion: run.versionManifest.ruleProfileVersion,
    derivativeSha256: runDerivativeSha256,
  };

  const brandFact = request.declaredFacts.applicationBrandName;
  const alcoholFact = request.declaredFacts.applicationAlcoholValue;

  const context = (rule: VerificationRule): RuleContext => {
    let evidenceStatus: EvidenceStatus = alcoholAssessment.evidenceStatus;
    let observations: RuleContext["observations"] = {};
    let declaredFacts: Partial<Record<string, DeclaredFact>> = {};
    let evidenceReferences: EvidenceReference[] = [];

    const ref = (key: "brandName" | "alcoholStatement", obs: AnalyzerFieldObservation) => [
      evidenceReferenceFromObservation(runDerivativeSha256, key, obs),
    ];

    switch (rule.id) {
      case BRAND_RULE_ID:
        evidenceStatus = brandAssessment.evidenceStatus;
        observations = { brandName: brandObservation };
        declaredFacts = { applicationBrandName: brandFact };
        evidenceReferences = ref("brandName", brandObservation);
        break;
      case ALCOHOL_SYNTAX_RULE_ID:
        evidenceStatus = alcoholAssessment.evidenceStatus;
        observations = { alcoholStatement: alcoholObservation };
        evidenceReferences = ref("alcoholStatement", alcoholObservation);
        break;
      case ALCOHOL_DECLARED_RULE_ID:
        evidenceStatus = alcoholAssessment.evidenceStatus;
        observations = { alcoholStatement: alcoholObservation };
        declaredFacts = { applicationAlcoholValue: alcoholFact };
        evidenceReferences = ref("alcoholStatement", alcoholObservation);
        break;
      default:
        // Actual-content-dependent rules receive no fabricated external evidence.
        evidenceStatus = alcoholAssessment.evidenceStatus;
        break;
    }

    return { declaredFacts, observations, evidenceStatus, run: runRef, evidenceReferences };
  };

  const findings: VerificationFinding[] = [];
  for (const rule of winePrecheckRegistry.all()) {
    const finding = rule.evaluate(context(rule));
    const validated = validateVerificationFinding(finding);
    if (!validated.ok) {
      return fail(
        "INVALID_FINDING",
        `Rule ${rule.id} produced an invalid finding.`,
        validated.error.issues,
      );
    }
    findings.push(validated.value);
  }

  const evidenceAssessments: EvidenceAssessment[] = [brandAssessment, alcoholAssessment];

  return ok({
    profileId: winePrecheckRegistry.profileId,
    profileVersion: winePrecheckRegistry.profileVersion,
    ruleManifest: profileManifest,
    evidenceAssessments,
    findings,
  });
}

/** Stable, sorted-key serialization for deterministic comparison of results. */
export function serializePrecheckResult(result: PrecheckResult): string {
  return stableStringify(result);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
