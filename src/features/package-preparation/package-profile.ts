import { wineRequirementsRegistry } from "@/pipeline/precheck/wine-requirements.profile";

import {
  labelForCategory,
  type PackageCategoryDefinition,
  type PackageCategoryId,
  type PanelRole,
} from "./package-model";

export interface PackageCategoryInstruction {
  categoryId: PackageCategoryId;
  plainLanguageQuestion: string;
  placementHint: string;
  exampleValue: string;
  examplePanelRole: Extract<PanelRole, "front" | "back">;
  exampleRegion: { x: number; y: number; width: number; height: number };
  starterRegion: { x: number; y: number; width: number; height: number };
  notPresentAllowed: boolean;
}

const WINE_PACKAGE_INSTRUCTION_BY_CATEGORY: Readonly<
  Record<PackageCategoryId, Omit<PackageCategoryInstruction, "categoryId">>
> = {
  brandName: {
    plainLanguageQuestion: "What brand name is printed most prominently on the label?",
    placementHint: "Usually on the front panel, around the main display area.",
    exampleValue: "CEDAR RIDGE",
    examplePanelRole: "front",
    exampleRegion: { x: 0.18, y: 0.2, width: 0.64, height: 0.18 },
    starterRegion: { x: 0.16, y: 0.18, width: 0.68, height: 0.24 },
    notPresentAllowed: false,
  },
  alcoholStatement: {
    plainLanguageQuestion: "Where is the alcohol statement, and what does it say?",
    placementHint: "Often near the lower part of the front or back panel.",
    exampleValue: "12.5% ALC./VOL.",
    examplePanelRole: "back",
    exampleRegion: { x: 0.2, y: 0.7, width: 0.6, height: 0.12 },
    starterRegion: { x: 0.14, y: 0.66, width: 0.72, height: 0.18 },
    notPresentAllowed: false,
  },
};

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

/**
 * Instructional copy and example geometry are presentation metadata only.
 * Category membership still comes exclusively from the reviewed registry
 * projection above; this mapping cannot add a rule or an analysis category.
 */
export const WINE_PACKAGE_CATEGORY_INSTRUCTIONS: readonly PackageCategoryInstruction[] = (
  ["brandName", "alcoholStatement"] as const
).flatMap((categoryId) =>
  WINE_PACKAGE_CATEGORY_DEFINITIONS.some((definition) => definition.categoryId === categoryId)
    ? [{ categoryId, ...WINE_PACKAGE_INSTRUCTION_BY_CATEGORY[categoryId] }]
    : [],
);

export const WINE_PACKAGE_PROFILE = {
  id: wineRequirementsRegistry.profileId,
  version: wineRequirementsRegistry.profileVersion,
} as const;
