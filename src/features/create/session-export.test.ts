// @vitest-environment node
import { describe, expect, it } from "vitest";

import { canonicalStringify } from "@/pipeline/export/json/canonical-stringify";

import { emptyProjectFacts, WINE_BEVERAGE_TYPE } from "./facts";
import {
  buildProjectFactsExport,
  buildProjectFactsPayload,
  parseProjectFactsExport,
  projectFactsFilename,
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

  it("rejects a file that had a key added to it after export", async () => {
    // The checksum is recomputed over everything except the integrity block —
    // including keys this version does not know about. Rebuilding the payload
    // from known keys only would silently ignore a smuggled one, which is
    // exactly what a checksum exists to catch.
    const parsed = JSON.parse(await buildProjectFactsExport(FACTS));
    parsed.smuggledStatus = "APPROVED";
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
