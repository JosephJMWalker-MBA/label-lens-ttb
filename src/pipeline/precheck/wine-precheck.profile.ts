import { brandNameRule } from "@/domain/rules/brand-name.rule";
import { createRuleRegistry, type RuleRegistry } from "@/domain/rules/registry";
import {
  wineAlcoholActualToleranceRule,
  wineAlcoholClassTypeBoundaryRule,
  wineAlcoholDeclaredComparisonRule,
  wineAlcoholOmissionEligibilityRule,
  wineAlcoholSyntaxRule,
} from "@/domain/rules/wine-alcohol.rule";

/**
 * The single executable wine pre-check profile for this slice.
 *
 * It registers exactly the brand and wine-alcohol rules through the committed
 * registry, which imposes its own deterministic order (category, then id). No
 * government-warning, designation, appellation, net-contents, or legacy rules
 * are registered here.
 */
export const WINE_PRECHECK_PROFILE_ID = "wine-precheck";
export const WINE_PRECHECK_PROFILE_VERSION = "1.0.0";

export const winePrecheckRegistry: RuleRegistry = createRuleRegistry({
  profileId: WINE_PRECHECK_PROFILE_ID,
  profileVersion: WINE_PRECHECK_PROFILE_VERSION,
  rules: [
    brandNameRule,
    wineAlcoholSyntaxRule,
    wineAlcoholDeclaredComparisonRule,
    wineAlcoholActualToleranceRule,
    wineAlcoholOmissionEligibilityRule,
    wineAlcoholClassTypeBoundaryRule,
  ],
});
