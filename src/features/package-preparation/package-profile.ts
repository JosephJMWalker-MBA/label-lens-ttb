import { wineRequirementsRegistry } from "@/pipeline/precheck/wine-requirements.profile";

import { labelForCategory, type PackageCategoryDefinition } from "./package-model";

/**
 * Seller preparation categories are projected from the reviewed requirements
 * registry. This UI contract must not become a second, hand-maintained source
 * of regulatory requirements.
 */
export const WINE_PACKAGE_CATEGORY_DEFINITIONS: readonly PackageCategoryDefinition[] =
  wineRequirementsRegistry.all().map((requirement) => ({
    categoryId: requirement.fieldId,
    requirementId: requirement.requirementId,
    requirementVersion: requirement.version,
    label: labelForCategory(requirement.fieldId),
    requiresValue: true,
    applicability: requirement.applicability,
  }));

export const WINE_PACKAGE_PROFILE = {
  id: wineRequirementsRegistry.profileId,
  version: wineRequirementsRegistry.profileVersion,
} as const;
