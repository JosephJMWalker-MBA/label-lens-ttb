import { evidenceReferenceFromObservation } from "@/domain/verification/evidence-reference";
import type { VerificationFinding } from "@/domain/verification/finding.types";
import { readObservation } from "@/pipeline/analyzer/evidence-access";

import { canonicalizeBrand } from "./brand-canonical";
import type { RuleContext, VerificationRule } from "./rule.types";

const RULE_ID = "brand-name-canonical-comparison";
const RULE_VERSION = "1.0.0";
const PROFILE_ID = "wine-precheck";
const PROFILE_VERSION = "1.0.0";
const AUTHORITY = { citation: "27 CFR 4.32; 27 CFR 4.33", snapshotDate: "2026-07-10" };

const DECLARED_FACT_KEY = "applicationBrandName";
const OBSERVATION_KEY = "brandName";

/**
 * Conservative canonical comparison of the declared application brand against
 * the observed artwork brand (27 CFR 4.32, 4.33). This is not semantic, fuzzy,
 * or similarity matching. The broader § 4.33 misleading-impression analysis
 * needs contextual graphics and human judgment and is out of scope here.
 */
export const brandNameRule: VerificationRule = {
  id: RULE_ID,
  version: RULE_VERSION,
  profileId: PROFILE_ID,
  profileVersion: PROFILE_VERSION,
  category: "canonical-text-comparison",
  authority: AUTHORITY,
  requiredEvidenceFields: [OBSERVATION_KEY],
  evaluate,
};

function evaluate(context: RuleContext): VerificationFinding {
  const base = {
    ruleId: RULE_ID,
    ruleVersion: RULE_VERSION,
    profileId: PROFILE_ID,
    profileVersion: PROFILE_VERSION,
    authority: AUTHORITY,
  };

  if (context.evidenceStatus === "insufficient") {
    return {
      ...base,
      ruleExecutionStatus: "not_run_insufficient_evidence",
      findingStatus: "not_run",
      evidenceReferences: [],
      message: "not_run: brand-name evidence is insufficient for this check.",
    };
  }

  const observation = context.observations[OBSERVATION_KEY];
  const declared = context.declaredFacts[DECLARED_FACT_KEY]?.value ?? null;
  const evidenceReferences = observation
    ? [evidenceReferenceFromObservation(context.run.derivativeSha256, OBSERVATION_KEY, observation)]
    : [];
  const access = observation ? readObservation(observation) : null;

  if (
    !access ||
    !access.isPresent ||
    access.value === null ||
    !declared ||
    declared.trim() === ""
  ) {
    return {
      ...base,
      ruleExecutionStatus: "executed",
      findingStatus: "NEEDS_REVIEW",
      evidenceReferences,
      message: "NEEDS_REVIEW: missing declared or observed brand name; cannot compare.",
    };
  }

  // Ambiguous evidence: do not silently pick a candidate; alternates are kept in
  // the evidence reference chain and a human decides.
  if (observation?.state === "AMBIGUOUS") {
    return {
      ...base,
      ruleExecutionStatus: "executed",
      findingStatus: "NEEDS_REVIEW",
      evidenceReferences,
      message: "NEEDS_REVIEW: observed brand is ambiguous; alternates preserved, no safe match.",
    };
  }

  const declaredBrand = canonicalizeBrand(declared);
  const observedBrand = canonicalizeBrand(access.value);

  if (declaredBrand.base === observedBrand.base) {
    return {
      ...base,
      ruleExecutionStatus: "executed",
      findingStatus: "PASS",
      evidenceReferences,
      message: "PASS (BRAND_EXACT_MATCH): brands match after canonical normalization.",
    };
  }

  const suffixNormalized =
    declaredBrand.stripped === observedBrand.stripped &&
    (declaredBrand.suffixRemoved !== null || observedBrand.suffixRemoved !== null);
  if (suffixNormalized) {
    return {
      ...base,
      ruleExecutionStatus: "executed",
      findingStatus: "PASS",
      evidenceReferences,
      message:
        "PASS (BRAND_SUFFIX_NORMALIZED_MATCH): brands match after removing one approved terminal legal-entity suffix.",
    };
  }

  return {
    ...base,
    ruleExecutionStatus: "executed",
    findingStatus: "FAIL",
    evidenceReferences,
    message:
      "FAIL (BRAND_MISMATCH): declared and observed brand differ after canonical normalization.",
  };
}
