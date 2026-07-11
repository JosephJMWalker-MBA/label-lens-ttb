import type { AuthorityVersion } from "@/domain/run/version-manifest.types";
import { evidenceReferenceFromObservation } from "@/domain/verification/evidence-reference";
import type { VerificationFinding } from "@/domain/verification/finding.types";
import { readObservation } from "@/pipeline/analyzer/evidence-access";

import type { RuleContext, VerificationRule } from "./rule.types";
import { parseDeclaredAlcoholValue, parseWineAlcoholStatement } from "./wine-alcohol-parse";

/**
 * Bounded wine alcohol rules under 27 CFR 4.36. These deliberately replace any
 * prior distilled-spirits/proof handling. No proof arithmetic remains, and none
 * of these rules applies an actual-content tolerance — the § 4.36 tolerances
 * require actual alcohol content, which artwork can never supply.
 */

const PROFILE_ID = "wine-precheck";
const PROFILE_VERSION = "1.0.0";
const AUTHORITY: AuthorityVersion = { citation: "27 CFR 4.36", snapshotDate: "2026-07-10" };

const OBSERVATION_KEY = "alcoholStatement";
const DECLARED_FACT_KEY = "applicationAlcoholValue";

interface FindingBase {
  ruleId: string;
  ruleVersion: string;
  profileId: string;
  profileVersion: string;
  authority: AuthorityVersion;
}

function baseFor(id: string, version: string): FindingBase {
  return {
    ruleId: id,
    ruleVersion: version,
    profileId: PROFILE_ID,
    profileVersion: PROFILE_VERSION,
    authority: AUTHORITY,
  };
}

function evidenceRefsFor(context: RuleContext) {
  const observation = context.observations[OBSERVATION_KEY];
  return observation
    ? [evidenceReferenceFromObservation(context.run.derivativeSha256, OBSERVATION_KEY, observation)]
    : [];
}

// ---------------------------------------------------------------------------
// 1. wine-alcohol-syntax — observable syntax/parseability only (no truth test).
// ---------------------------------------------------------------------------

const SYNTAX_ID = "wine-alcohol-syntax";
const SYNTAX_VERSION = "1.0.0";

export const wineAlcoholSyntaxRule: VerificationRule = {
  id: SYNTAX_ID,
  version: SYNTAX_VERSION,
  profileId: PROFILE_ID,
  profileVersion: PROFILE_VERSION,
  category: "syntax-validation",
  authority: AUTHORITY,
  requiredEvidenceFields: [OBSERVATION_KEY],
  evaluate(context: RuleContext): VerificationFinding {
    const base = baseFor(SYNTAX_ID, SYNTAX_VERSION);

    if (context.evidenceStatus === "insufficient") {
      return {
        ...base,
        ruleExecutionStatus: "not_run_insufficient_evidence",
        findingStatus: "not_run",
        evidenceReferences: [],
        message: "not_run: alcohol-statement evidence is insufficient for this check.",
      };
    }

    const evidenceReferences = evidenceRefsFor(context);
    const observation = context.observations[OBSERVATION_KEY];
    const access = observation ? readObservation(observation) : null;

    if (!access || !access.isPresent || access.value === null) {
      return {
        ...base,
        ruleExecutionStatus: "executed",
        findingStatus: "NEEDS_REVIEW",
        evidenceReferences,
        message:
          "NEEDS_REVIEW (WINE_ALC_SYNTAX_NOT_OBSERVED): no alcohol statement was extracted from otherwise sufficient evidence.",
      };
    }

    if (observation?.state === "AMBIGUOUS") {
      return {
        ...base,
        ruleExecutionStatus: "executed",
        findingStatus: "NEEDS_REVIEW",
        evidenceReferences,
        message:
          "NEEDS_REVIEW (WINE_ALC_SYNTAX_AMBIGUOUS): observed alcohol statement is ambiguous; alternates preserved, no safe syntax conclusion.",
      };
    }

    const parsed = parseWineAlcoholStatement(access.value);
    switch (parsed.kind) {
      case "direct":
        return {
          ...base,
          ruleExecutionStatus: "executed",
          findingStatus: "PASS",
          evidenceReferences,
          message: "PASS (WINE_ALC_SYNTAX_DIRECT): a direct percentage alcohol statement parses.",
        };
      case "range":
        return {
          ...base,
          ruleExecutionStatus: "executed",
          findingStatus: "PASS",
          evidenceReferences,
          message:
            "PASS (WINE_ALC_SYNTAX_RANGE): a bounded percentage-range alcohol statement parses.",
        };
      case "proof":
        return {
          ...base,
          ruleExecutionStatus: "executed",
          findingStatus: "FAIL",
          evidenceReferences,
          message:
            "FAIL (WINE_ALC_SYNTAX_PROOF): proof statements are not a valid wine alcohol form.",
        };
      case "malformed":
      default:
        return {
          ...base,
          ruleExecutionStatus: "executed",
          findingStatus: "FAIL",
          evidenceReferences,
          message:
            "FAIL (WINE_ALC_SYNTAX_MALFORMED): alcohol statement syntax is unsupported or malformed.",
        };
    }
  },
};

// ---------------------------------------------------------------------------
// 2. wine-alcohol-declared-comparison — tolerance-free numeric agreement of the
//    observed label statement against the operator-entered application value.
// ---------------------------------------------------------------------------

const DECLARED_ID = "wine-alcohol-declared-comparison";
const DECLARED_VERSION = "1.0.0";

export const wineAlcoholDeclaredComparisonRule: VerificationRule = {
  id: DECLARED_ID,
  version: DECLARED_VERSION,
  profileId: PROFILE_ID,
  profileVersion: PROFILE_VERSION,
  category: "numeric-agreement",
  authority: AUTHORITY,
  requiredEvidenceFields: [OBSERVATION_KEY],
  evaluate(context: RuleContext): VerificationFinding {
    const base = baseFor(DECLARED_ID, DECLARED_VERSION);

    if (context.evidenceStatus === "insufficient") {
      return {
        ...base,
        ruleExecutionStatus: "not_run_insufficient_evidence",
        findingStatus: "not_run",
        evidenceReferences: [],
        message: "not_run: alcohol-statement evidence is insufficient for this check.",
      };
    }

    const evidenceReferences = evidenceRefsFor(context);

    // Reads ONLY the application-declared value. An actual-content value carried
    // under any other key is never consulted here — actual content bypasses this
    // rule entirely and is handled by the external-dependency rules.
    const declaredRaw = context.declaredFacts[DECLARED_FACT_KEY]?.value ?? null;
    if (declaredRaw === null || declaredRaw.trim() === "") {
      return {
        ...base,
        ruleExecutionStatus: "executed",
        findingStatus: "NEEDS_REVIEW",
        evidenceReferences,
        message:
          "NEEDS_REVIEW (WINE_ALC_DECLARED_MISSING): no application-declared alcohol value to compare against.",
      };
    }

    const observation = context.observations[OBSERVATION_KEY];
    const access = observation ? readObservation(observation) : null;
    if (!access || !access.isPresent || access.value === null) {
      return {
        ...base,
        ruleExecutionStatus: "executed",
        findingStatus: "NEEDS_REVIEW",
        evidenceReferences,
        message:
          "NEEDS_REVIEW (WINE_ALC_OBSERVED_MISSING): no observed alcohol statement to compare against.",
      };
    }

    if (observation?.state === "AMBIGUOUS") {
      return {
        ...base,
        ruleExecutionStatus: "executed",
        findingStatus: "NEEDS_REVIEW",
        evidenceReferences,
        message:
          "NEEDS_REVIEW (WINE_ALC_OBSERVED_AMBIGUOUS): observed alcohol statement is ambiguous; no safe deterministic comparison.",
      };
    }

    const observed = parseWineAlcoholStatement(access.value);
    if (observed.kind === "range") {
      return {
        ...base,
        ruleExecutionStatus: "executed",
        findingStatus: "NEEDS_REVIEW",
        evidenceReferences,
        message:
          "NEEDS_REVIEW (WINE_ALC_OBSERVED_RANGE): observed statement is a range; both bounds preserved, not collapsed to a single value.",
      };
    }
    if (observed.kind !== "direct") {
      return {
        ...base,
        ruleExecutionStatus: "executed",
        findingStatus: "NEEDS_REVIEW",
        evidenceReferences,
        message:
          "NEEDS_REVIEW (WINE_ALC_OBSERVED_MALFORMED): observed alcohol statement is not a parseable direct value.",
      };
    }

    const declared = parseDeclaredAlcoholValue(declaredRaw);
    if (declared === null) {
      return {
        ...base,
        ruleExecutionStatus: "executed",
        findingStatus: "NEEDS_REVIEW",
        evidenceReferences,
        message:
          "NEEDS_REVIEW (WINE_ALC_DECLARED_MALFORMED): application-declared alcohol value is not a valid percentage.",
      };
    }

    // Exact numeric agreement on integer basis points. Categorically tolerance-free.
    if (declared === observed.basisPoints) {
      return {
        ...base,
        ruleExecutionStatus: "executed",
        findingStatus: "PASS",
        evidenceReferences,
        message:
          "PASS (WINE_ALC_EXACT_AGREEMENT): observed and declared alcohol percentages agree exactly.",
      };
    }
    return {
      ...base,
      ruleExecutionStatus: "executed",
      findingStatus: "FAIL",
      evidenceReferences,
      message:
        "FAIL (WINE_ALC_MISMATCH): observed and declared alcohol percentages differ (no tolerance applied).",
    };
  },
};

// ---------------------------------------------------------------------------
// 3. Actual-content-dependent checks — declared but not substantively executed.
//    Each names the external evidence it requires and never accepts an
//    artwork-derived value as actual alcohol content.
// ---------------------------------------------------------------------------

function externalDependencyRule(id: string, dependency: string, message: string): VerificationRule {
  const version = "1.0.0";
  return {
    id,
    version,
    profileId: PROFILE_ID,
    profileVersion: PROFILE_VERSION,
    category: "external-evidence-dependent",
    authority: AUTHORITY,
    requiredEvidenceFields: [],
    evaluate(): VerificationFinding {
      return {
        ...baseFor(id, version),
        ruleExecutionStatus: "not_run_external_dependency",
        findingStatus: "not_run",
        evidenceReferences: [],
        message,
        externalEvidenceDependency: dependency,
      };
    },
  };
}

/** Stated-versus-actual alcohol tolerance (§ 4.36 actual-content tolerance). */
export const wineAlcoholActualToleranceRule = externalDependencyRule(
  "wine-alcohol-actual-content-tolerance",
  "actual alcohol content with provenance",
  "not_run: § 4.36 stated-versus-actual tolerance requires actual alcohol content with provenance; artwork is never proof of actual content.",
);

/** Eligibility to omit the alcohol statement (table/light-wine designation). */
export const wineAlcoholOmissionEligibilityRule = externalDependencyRule(
  "wine-alcohol-omission-eligibility",
  "table/light-wine designation evidence",
  "not_run: alcohol-statement omission eligibility requires table/light-wine designation evidence not present in this slice.",
);

/** Class/type or taxable-boundary crossing. */
export const wineAlcoholClassTypeBoundaryRule = externalDependencyRule(
  "wine-alcohol-class-type-boundary",
  "class/type or taxable-boundary evidence",
  "not_run: class/type or taxable-boundary crossing requires class/type or taxable-boundary evidence not present in this slice.",
);

/** The bounded wine alcohol rule family for the wine pre-check profile. */
export const wineAlcoholRules: readonly VerificationRule[] = [
  wineAlcoholSyntaxRule,
  wineAlcoholDeclaredComparisonRule,
  wineAlcoholActualToleranceRule,
  wineAlcoholOmissionEligibilityRule,
  wineAlcoholClassTypeBoundaryRule,
];
