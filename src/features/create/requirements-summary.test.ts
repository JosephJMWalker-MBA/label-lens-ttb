import { describe, expect, it } from "vitest";

import { wineRequirementsRegistry } from "@/pipeline/precheck/wine-requirements.profile";

import { emptyProjectFacts, PROJECT_FACTS, WINE_BEVERAGE_TYPE } from "./facts";
import { buildRequirementsSummary } from "./requirements-summary";

/**
 * The truth boundary for #99, enforced.
 *
 * Everything shown as required must trace to the merged requirements registry,
 * and the registry's silence must never become permission.
 */

function wineFacts(over: Record<string, string | null> = {}) {
  return { ...emptyProjectFacts(), beverageType: WINE_BEVERAGE_TYPE, ...over };
}

describe("only registry-backed requirements are shown as required", () => {
  it("marks a field required only when the registry holds a requirement for it", () => {
    const summary = buildRequirementsSummary(wineFacts());
    const required = summary.rows.filter(
      (r) => r.requirementStatus === "required-by-cited-authority",
    );

    // Exactly the fields the merged registry actually holds requirements for.
    const registryFields = new Set(wineRequirementsRegistry.all().map((r) => r.fieldId));
    expect(required.length).toBe(registryFields.size);
    for (const row of required) {
      expect(row.requirement).not.toBeNull();
      expect(registryFields.has(row.requirement!.fieldId)).toBe(true);
    }
  });

  it("carries the registry's own citation and snapshot date, never a new one", () => {
    const summary = buildRequirementsSummary(wineFacts());
    for (const row of summary.rows) {
      if (!row.requirement) continue;
      const fromRegistry = wineRequirementsRegistry.get(row.requirement.requirementId);
      expect(fromRegistry).toBeDefined();
      expect(row.requirement.authority).toEqual(fromRegistry!.authority);
    }
  });

  it("never marks a field required when the registry holds nothing for it", () => {
    const summary = buildRequirementsSummary(wineFacts());
    const uncited = [
      "netContents",
      "classType",
      "producerBottler",
      "country",
      "distributionMarket",
    ];
    for (const factId of uncited) {
      const row = summary.rows.find((r) => r.factId === factId);
      expect(row, `missing row for ${factId}`).toBeDefined();
      expect(row!.requirementStatus).toBe("no-cited-requirement");
      expect(row!.requirement).toBeNull();
    }
  });

  it("does not become required merely because the maker filled the field in", () => {
    // Supplying a value must never manufacture an obligation.
    const summary = buildRequirementsSummary(
      wineFacts({ netContents: "750 mL", producerBottler: "Cardinal Ridge, Ohio" }),
    );
    for (const factId of ["netContents", "producerBottler"]) {
      const row = summary.rows.find((r) => r.factId === factId)!;
      expect(row.recordStatus).toBe("recorded");
      expect(row.requirementStatus).toBe("no-cited-requirement");
    }
  });

  it("keeps a required field required even when the maker leaves it blank", () => {
    const summary = buildRequirementsSummary(wineFacts());
    const brand = summary.rows.find((r) => r.factId === "brandName")!;
    expect(brand.recordStatus).toBe("not-provided");
    expect(brand.requirementStatus).toBe("required-by-cited-authority");
  });

  it("only bridges to authority through an explicit registry field id", () => {
    // The map from fact to requirement is stated, never guessed from a name.
    const mapped = PROJECT_FACTS.filter((f) => f.registryFieldId !== null).map((f) => f.id);
    expect(mapped.sort()).toEqual(["alcoholStatement", "brandName"]);
  });
});

describe("the registry's silence is not permission", () => {
  it("shows no requirements at all for a category the system has no profile for", () => {
    // The registry is wine-only. Showing it against a beer project would be
    // authority borrowed from the wrong domain.
    const summary = buildRequirementsSummary(wineFacts({ beverageType: "beer" }));
    expect(summary.categorySupported).toBe(false);
    expect(summary.citedRequirementCount).toBe(0);
    for (const row of summary.rows) {
      expect(row.requirementStatus).toBe("no-cited-requirement");
      expect(row.requirement).toBeNull();
    }
  });

  it("shows no requirements before a category is chosen", () => {
    const summary = buildRequirementsSummary(emptyProjectFacts());
    expect(summary.categorySupported).toBe(false);
    expect(summary.citedRequirementCount).toBe(0);
  });

  it("reports counts, never a score or readiness figure", () => {
    const summary = buildRequirementsSummary(wineFacts({ brandName: "Cardinal Ridge" }));
    expect(summary.recordedCount).toBe(2); // beverageType + brandName
    expect(typeof summary.citedRequirementCount).toBe("number");
    expect(JSON.stringify(summary)).not.toMatch(/score|readiness|percent|complete|pass|fail/i);
  });
});

describe("evaluation status is truthful", () => {
  it("says a field is evaluated only when a registered rule checks it", () => {
    const summary = buildRequirementsSummary(wineFacts());
    for (const row of summary.rows) {
      if (row.evaluationStatus === "checked-by-registered-rules") {
        expect(row.requirement!.checkedByRuleIds.length).toBeGreaterThan(0);
      } else {
        expect(row.requirement?.checkedByRuleIds.length ?? 0).toBe(0);
      }
    }
  });

  it("reports an uncited field as not evaluated", () => {
    const summary = buildRequirementsSummary(wineFacts({ netContents: "750 mL" }));
    const row = summary.rows.find((r) => r.factId === "netContents")!;
    expect(row.evaluationStatus).toBe("not-evaluated");
  });
});
