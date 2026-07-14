import type { LabelRequirementFieldId } from "@/domain/requirements/requirement.types";

/**
 * The facts a maker may tell us about their product.
 *
 * This vocabulary exists to **collect**, never to evaluate. Listing a fact here
 * asserts nothing about whether it is required, checked, or sufficient — those
 * answers come only from the merged requirements registry, and for most of these
 * fields the honest answer is "this system has no cited requirement".
 *
 * It deliberately does not import, revive, or mirror
 * `src/domain/label/label.types.ts` — the dead six-field contract that nothing
 * imports and that would resurrect a false capability surface.
 *
 * `registryFieldId` is the *only* bridge to authority, and it is stated
 * explicitly rather than inferred from a name. A fact with `null` has no cited
 * requirement in this system, and the summary must say exactly that — never
 * "not required".
 */

export const PROJECT_FACT_IDS = [
  "brandName",
  "beverageType",
  "classType",
  "alcoholStatement",
  "netContents",
  "producerBottler",
  "country",
  "distributionMarket",
] as const;

export type ProjectFactId = (typeof PROJECT_FACT_IDS)[number];

export interface ProjectFactDefinition {
  id: ProjectFactId;
  label: string;
  /** Plain help. Describes what to type — never what the law demands. */
  help: string;
  /** Fixed choices, when the fact is a choice rather than free text. */
  options?: readonly { value: string; label: string }[];
  /**
   * The requirements-registry field this fact corresponds to, or null when the
   * system holds no cited requirement for it.
   *
   * Only brand name and alcohol statement have one. That is not an oversight —
   * it is the current extent of reviewed authority in this repository.
   */
  registryFieldId: LabelRequirementFieldId | null;
}

/**
 * The beverage category. Only wine has a rule profile and a requirements
 * profile, so the summary can only speak about wine. Every other choice is
 * offered honestly and answered honestly: the system has no profile for it.
 */
export const WINE_BEVERAGE_TYPE = "wine";

export const PROJECT_FACTS: readonly ProjectFactDefinition[] = [
  {
    id: "beverageType",
    label: "Beverage type",
    help: "Only wine has a requirements profile in this system today.",
    // Every non-wine option is offered so a maker can say what they are actually
    // making, and is answered honestly: this system holds no profile for it.
    //
    // "Spirits" rather than the fuller category name: the architectural guard
    // `no false implemented-capability surface` forbids that phrase anywhere
    // under `features/`, to stop the UI ever claiming spirits execution. The
    // guard cannot distinguish claiming a capability from denying one, so it is
    // left untouched and unweakened here and the wording avoids it. See the
    // follow-up noted in the PR.
    options: [
      { value: WINE_BEVERAGE_TYPE, label: "Wine" },
      { value: "beer", label: "Beer or malt beverage" },
      { value: "spirits", label: "Spirits" },
      { value: "other", label: "Something else" },
    ],
    registryFieldId: null,
  },
  {
    // Named "brand name", not "product name". The registry's requirement is
    // about the brand name; quietly equating the two would be an interpretation,
    // and would attach a citation to a field the citation is not about.
    id: "brandName",
    label: "Brand name",
    help: "The brand name as it will appear on the label.",
    registryFieldId: "brandName",
  },
  {
    id: "classType",
    label: "Class or type",
    help: "For example, a varietal or a designation. Recorded as you enter it.",
    registryFieldId: null,
  },
  {
    id: "alcoholStatement",
    label: "Alcohol statement",
    help: "The alcohol statement as it will appear on the label, if you know it.",
    registryFieldId: "alcoholStatement",
  },
  {
    id: "netContents",
    label: "Net contents",
    help: "The stated volume, if you know it.",
    registryFieldId: null,
  },
  {
    id: "producerBottler",
    label: "Producer or bottler",
    help: "The name and address that will appear on the label.",
    registryFieldId: null,
  },
  {
    id: "country",
    label: "Country",
    help: "Where the product is produced or bottled.",
    registryFieldId: null,
  },
  {
    id: "distributionMarket",
    label: "Distribution market",
    help: "Where you intend to sell. Recorded for your project only.",
    registryFieldId: null,
  },
] as const;

/** A maker's answers. `null` means "not provided yet" — a first-class state. */
export type ProjectFacts = Record<ProjectFactId, string | null>;

export function emptyProjectFacts(): ProjectFacts {
  return Object.fromEntries(PROJECT_FACT_IDS.map((id) => [id, null])) as ProjectFacts;
}

export function factDefinition(id: ProjectFactId): ProjectFactDefinition {
  const definition = PROJECT_FACTS.find((fact) => fact.id === id);
  if (!definition) throw new Error(`Unknown project fact: ${id}`);
  return definition;
}

/** Normalizes an entry to a stored value: blank becomes "not provided yet". */
export function toStoredValue(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === "" ? null : trimmed;
}
