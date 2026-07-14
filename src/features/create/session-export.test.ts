// @vitest-environment node
import { describe, expect, it } from "vitest";

import { createLabelRequirementRegistry } from "@/domain/requirements/registry";
import type { ResolvedLabelRequirement } from "@/domain/requirements/requirement.types";
import { canonicalStringify } from "@/pipeline/export/json/canonical-stringify";
import { winePrecheckRegistry } from "@/pipeline/precheck/wine-precheck.profile";
import { wineRequirementsRegistry } from "@/pipeline/precheck/wine-requirements.profile";

import { emptyProjectFacts, WINE_BEVERAGE_TYPE } from "./facts";
import {
  buildProjectFactsExport,
  buildProjectFactsPayload,
  parseProjectFactsExport,
  projectFactsFilename,
  sealProjectFactsExport,
  toExportedRequirement,
  PROJECT_FACTS_SCHEMA_VERSION,
} from "./session-export";

const FACTS = {
  ...emptyProjectFacts(),
  beverageType: WINE_BEVERAGE_TYPE,
  brandName: "Cardinal Ridge",
  alcoholStatement: "13.5% ALC./VOL.",
  netContents: "750 mL",
};

describe("session export round-trip", () => {
  it("preserves every declared fact through export and re-import", async () => {
    const text = await buildProjectFactsExport(FACTS);
    const parsed = await parseProjectFactsExport(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.declaredFacts).toEqual(FACTS);
  });

  it("preserves an all-unknown session, which is a legitimate project", async () => {
    const empty = emptyProjectFacts();
    const parsed = await parseProjectFactsExport(await buildProjectFactsExport(empty));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.declaredFacts).toEqual(empty);
    expect(parsed.value.citedRequirements).toEqual([]);
  });

  it("verifies its own checksum with the committed canonical serialization", async () => {
    const text = await buildProjectFactsExport(FACTS);
    const parsed = await parseProjectFactsExport(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const { integrity, ...payload } = parsed.value;
    expect(integrity.algorithm).toBe("SHA-256");
    expect(integrity.value).toMatch(/^[0-9a-f]{64}$/);
    // Recomputed independently, over the same canonical bytes.
    const { createHash } = await import("node:crypto");
    const expected = createHash("sha256").update(canonicalStringify(payload)).digest("hex");
    expect(integrity.value).toBe(expected);
  });

  it("is deterministic: the same facts always produce the same bytes", async () => {
    expect(await buildProjectFactsExport(FACTS)).toBe(await buildProjectFactsExport(FACTS));
  });

  it("rejects a file whose contents were changed after export", async () => {
    const text = await buildProjectFactsExport(FACTS);
    const tampered = text.replace("Cardinal Ridge", "Someone Else");
    const parsed = await parseProjectFactsExport(tampered);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.code).toBe("INTEGRITY_MISMATCH");
  });

  it("rejects a file that had a key added without the checksum being recomputed", async () => {
    // The checksum is recomputed over everything except the integrity block —
    // including keys this version does not know about. Hashing only the known
    // keys would leave an added one out of the hash, so the file would still
    // verify and the check would be weaker than it looks.
    //
    // This detects a change made *without* recomputing the checksum. It is not
    // tamper resistance: anyone who edits the payload can recompute the hash
    // with the same committed logic and produce a file that verifies.
    const parsed = JSON.parse(await buildProjectFactsExport(FACTS));
    parsed.addedField = "APPROVED";
    const result = await parseProjectFactsExport(JSON.stringify(parsed));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INTEGRITY_MISMATCH");
  });

  it("rejects a file that is not a project-facts export", async () => {
    const parsed = await parseProjectFactsExport(JSON.stringify({ exportType: "something-else" }));
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error.code).toBe("INVALID_EXPORT_SHAPE");
  });

  it("names the file from the checksum, never from user text", () => {
    const name = projectFactsFilename("a".repeat(64));
    expect(name).toBe(
      `label-lens-project-facts-${PROJECT_FACTS_SCHEMA_VERSION}-${"a".repeat(64)}.json`,
    );
    expect(name).not.toMatch(/Cardinal/);
  });
});

describe("authority provenance survives the durable artifact", () => {
  it("round-trips a rule-derived citation, naming the rule it came from", async () => {
    const parsed = await parseProjectFactsExport(await buildProjectFactsExport(FACTS));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const brand = parsed.value.citedRequirements.find((r) => r.fieldId === "brandName")!;
    expect(brand.authorityProvenance).toEqual({
      kind: "registered-rule-authority",
      ruleId: "brand-name-canonical-comparison",
    });
  });

  it("round-trips every seeded requirement's provenance, not just the first", async () => {
    const parsed = await parseProjectFactsExport(await buildProjectFactsExport(FACTS));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    for (const requirement of parsed.value.citedRequirements) {
      const fromRegistry = wineRequirementsRegistry.get(requirement.requirementId)!;
      expect(fromRegistry).toBeDefined();
      expect(requirement.authorityProvenance.kind).toBe(fromRegistry.authorityProvenance.kind);
    }
  });

  it("round-trips a human-authored citation, preserving the reviewer and the date", async () => {
    // No human-authored requirement is seeded yet — by design, since no human has
    // authored a citation beyond the two the rules already carry. But the schema
    // is v1 and the artifact is durable: the day one arrives, the export must not
    // discard who reviewed it and when. That is the whole "humans author
    // authority" principle, and it has to hold before the case exists.
    const humanAuthored: ResolvedLabelRequirement = {
      requirementId: "wine-net-contents-required",
      version: "1.0.0",
      profileId: "wine-label-requirements",
      profileVersion: "1.0.0",
      fieldId: "brandName",
      authority: { citation: "27 CFR 4.37", snapshotDate: "2026-07-10" },
      authorityProvenance: {
        kind: "human-authored",
        authority: { citation: "27 CFR 4.37", snapshotDate: "2026-07-10" },
        reviewedBy: "A Named Reviewer",
        reviewedAt: "2026-07-14",
      },
      applicability: "always",
      conditionExternalEvidence: null,
      conditionSourceRuleId: null,
      checkedByRuleIds: [],
      evaluableFromArtwork: false,
    };

    const payload = {
      ...buildProjectFactsPayload(FACTS),
      citedRequirements: [toExportedRequirement(humanAuthored)],
    };
    const parsed = await parseProjectFactsExport(await sealProjectFactsExport(payload));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const [requirement] = parsed.value.citedRequirements;
    expect(requirement.citation).toBe("27 CFR 4.37");
    expect(requirement.snapshotDate).toBe("2026-07-10");
    expect(requirement.authorityProvenance).toEqual({
      kind: "human-authored",
      reviewedBy: "A Named Reviewer",
      reviewedAt: "2026-07-14",
    });
  });

  it("does not flatten the two authority paths into a bare citation", async () => {
    // A citation alone cannot tell a reader whether a person put their name to it
    // or a rule carried it. The export must never reduce both to the same shape.
    const parsed = await parseProjectFactsExport(await buildProjectFactsExport(FACTS));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    for (const requirement of parsed.value.citedRequirements) {
      expect(requirement.authorityProvenance).toBeDefined();
      expect(["registered-rule-authority", "human-authored"]).toContain(
        requirement.authorityProvenance.kind,
      );
    }
  });

  it("keeps a human-authored citation out of the artifact when it has no reviewer", () => {
    // Defence in depth: the registry already refuses to construct one. The export
    // simply copies what the registry resolved, so an unattributed citation
    // cannot reach the file — there is no path that produces one.
    expect(() =>
      createLabelRequirementRegistry(
        {
          profileId: "p",
          profileVersion: "1.0.0",
          ruleProfileId: winePrecheckRegistry.profileId,
          ruleProfileVersion: winePrecheckRegistry.profileVersion,
          requirements: [
            {
              requirementId: "unattributed",
              version: "1.0.0",
              profileId: "p",
              profileVersion: "1.0.0",
              fieldId: "brandName",
              authoritySource: {
                kind: "human-authored",
                authority: { citation: "27 CFR 4.37", snapshotDate: "2026-07-10" },
                reviewedBy: "",
                reviewedAt: "2026-07-10",
              },
              applicability: "always",
            },
          ],
        },
        winePrecheckRegistry,
      ),
    ).toThrow(/MISSING_HUMAN_REVIEWER/);
  });
});

describe("the export separates assertion from authority", () => {
  it("copies cited requirements from the registry and authors none", async () => {
    const payload = buildProjectFactsPayload(FACTS);
    expect(payload.citedRequirements.length).toBeGreaterThan(0);
    for (const requirement of payload.citedRequirements) {
      expect(requirement.citation).toMatch(/\S/);
      expect(requirement.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    // Declared facts and cited requirements are separate top-level blocks, so a
    // downstream reader can always tell who said what.
    expect(Object.keys(payload)).toEqual(
      expect.arrayContaining(["declaredFacts", "citedRequirements"]),
    );
  });

  it("cites nothing for a category the system holds no profile for", async () => {
    const payload = buildProjectFactsPayload({ ...FACTS, beverageType: "beer" });
    expect(payload.category.requirementsProfileApplies).toBe(false);
    expect(payload.citedRequirements).toEqual([]);
    // The facts are still recorded — collection never depended on authority.
    expect(payload.declaredFacts.brandName).toBe("Cardinal Ridge");
  });

  it("evaluates nothing: no status, verdict, score, or readiness appears", async () => {
    const text = await buildProjectFactsExport(FACTS);
    expect(text).not.toMatch(/"(status|verdict|score|readiness|compliant|approved)"/i);
    expect(text).not.toMatch(/\b(PASS|FAIL|WARN|NEEDS_REVIEW)\b/);
  });

  it("carries an advisory saying an uncited field may still be required", async () => {
    const payload = buildProjectFactsPayload(FACTS);
    expect(payload.advisoryNotice.text).toMatch(/may still be required/i);
    expect(payload.advisoryNotice.text).toMatch(/not a TTB approval/i);
  });
});
