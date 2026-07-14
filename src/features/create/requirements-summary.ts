import type { ResolvedLabelRequirement } from "@/domain/requirements/requirement.types";
import { wineRequirementsRegistry } from "@/pipeline/precheck/wine-requirements.profile";

import {
  PROJECT_FACTS,
  WINE_BEVERAGE_TYPE,
  type ProjectFactDefinition,
  type ProjectFacts,
} from "./facts";

/**
 * Presentation-only derivation of the Requirements Summary.
 *
 * Every "required" statement on this screen traces to a requirement in the
 * merged `wineRequirementsRegistry`. Nothing here interprets a regulation,
 * summarizes one, or infers an obligation. There are exactly three things this
 * module can say about a field, and it can never say a fourth:
 *
 *   1. a cited requirement exists (with its citation and snapshot date);
 *   2. the maker recorded a value, or has not yet;
 *   3. registered rules check it, or nothing in this system evaluates it.
 *
 * The most important line in this file is `NO_CITED_REQUIREMENT`. The registry's
 * silence about a field means **"this system holds no cited requirement for it"**
 * — which is emphatically *not* the same claim as "this field is not required".
 * Collapsing those two would be inventing compliance by omission, and it is the
 * single easiest mistake this screen could make.
 */

/** Whether a cited requirement exists for the field. Never a compliance verdict. */
export type RequirementStatus = "required-by-cited-authority" | "no-cited-requirement";

/** Whether the maker has told us the value. */
export type RecordStatus = "recorded" | "not-provided";

/** Whether anything in this system evaluates the field. */
export type EvaluationStatus = "checked-by-registered-rules" | "not-evaluated";

export interface RequirementSummaryRow {
  factId: string;
  label: string;
  value: string | null;
  requirementStatus: RequirementStatus;
  recordStatus: RecordStatus;
  evaluationStatus: EvaluationStatus;
  /** The registry requirement, when one exists. The only source of "required". */
  requirement: ResolvedLabelRequirement | null;
}

export interface RequirementsSummary {
  /**
   * True only when the project's category has a requirements profile in this
   * system. The registry is wine-only; it must not be shown against a beer or
   * spirits project, where it would be authority borrowed from the wrong domain.
   */
  categorySupported: boolean;
  /** The category the maker chose, or null if they have not chosen one. */
  beverageType: string | null;
  requirementsProfile: { id: string; version: string };
  rows: RequirementSummaryRow[];
  /** Counts, never a score. */
  citedRequirementCount: number;
  recordedCount: number;
}

/**
 * The registry's silence, stated once, precisely. Surfaces must use this wording
 * rather than improvising a shorter one.
 */
export const NO_CITED_REQUIREMENT =
  "This system holds no cited requirement for this field. That is not a statement that the field is not required — only that no reviewed citation for it exists here.";

/** Requirements only apply to a category the system actually has a profile for. */
function requirementFor(
  definition: ProjectFactDefinition,
  categorySupported: boolean,
): ResolvedLabelRequirement | null {
  if (!categorySupported) return null;
  if (definition.registryFieldId === null) return null;
  // Read from the merged registry. Never constructed here.
  const matches = wineRequirementsRegistry.forField(definition.registryFieldId);
  return matches[0] ?? null;
}

export function buildRequirementsSummary(facts: ProjectFacts): RequirementsSummary {
  const beverageType = facts.beverageType;
  const categorySupported = beverageType === WINE_BEVERAGE_TYPE;

  const rows: RequirementSummaryRow[] = PROJECT_FACTS.map((definition) => {
    const value = facts[definition.id];
    const requirement = requirementFor(definition, categorySupported);
    return {
      factId: definition.id,
      label: definition.label,
      value,
      requirementStatus: requirement ? "required-by-cited-authority" : "no-cited-requirement",
      recordStatus: value === null ? "not-provided" : "recorded",
      evaluationStatus:
        requirement && requirement.checkedByRuleIds.length > 0
          ? "checked-by-registered-rules"
          : "not-evaluated",
      requirement,
    };
  });

  return {
    categorySupported,
    beverageType,
    requirementsProfile: {
      id: wineRequirementsRegistry.profileId,
      version: wineRequirementsRegistry.profileVersion,
    },
    rows,
    citedRequirementCount: rows.filter((r) => r.requirement !== null).length,
    recordedCount: rows.filter((r) => r.recordStatus === "recorded").length,
  };
}
