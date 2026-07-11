// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildJsonExport, verifyExportIntegrity } from "@/pipeline/export/json/build-json-export";
import { serializeExportCanonical } from "@/pipeline/export/json/canonical-json";
import { parseJsonExport } from "@/pipeline/export/json/parse-json-export";
import { assemblePrecheckResult } from "@/pipeline/result/assemble";
import { buildAssembleInput } from "@/pipeline/result/build.fixtures";
import { appendDispositionToResult } from "@/server/precheck-service";
import type { PrecheckDispositionRequest } from "@/server/precheck-service.types";

import { POST } from "./route";

/** Canonical JSON export for a freshly assembled (empty-history) result. */
function baseExportJson(): string {
  const result = assemblePrecheckResult(buildAssembleInput());
  if (!result.ok) throw new Error("assembly failed");
  const built = buildJsonExport(result.value);
  if (!built.ok) throw new Error("export failed");
  const verified = verifyExportIntegrity(built.value);
  if (!verified.ok) throw new Error("verify failed");
  return serializeExportCanonical(verified.value);
}

const FILE = {
  displayName: "label.jpeg",
  mediaType: "image/jpeg",
  byteSize: 1,
  source: "upload" as const,
};

function req(overrides: Partial<PrecheckDispositionRequest> = {}): PrecheckDispositionRequest {
  return {
    exportJson: baseExportJson(),
    actorId: "reviewer-1",
    decision: "accepted_for_internal_use",
    reasonCode: "LOOKS_GOOD",
    recordedAt: "2026-07-11T10:00:00Z",
    file: FILE,
    ...overrides,
  };
}

describe("appendDispositionToResult (service)", () => {
  it("starts from an empty history and appends one contiguous entry", () => {
    const before = parseJsonExport(baseExportJson());
    expect(before.ok && before.value.humanDispositionHistory).toEqual([]);

    const out = appendDispositionToResult(req());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.humanDispositionHistory).toHaveLength(1);
    expect(out.value.humanDispositionHistory[0]).toMatchObject({
      sequence: 1,
      decision: "accepted_for_internal_use",
      reasonCode: "LOOKS_GOOD",
      actorId: "reviewer-1",
      recordedAt: "2026-07-11T10:00:00Z",
    });
  });

  it("leaves machine findings and the machine-result id unchanged byte-for-byte", () => {
    const base = parseJsonExport(baseExportJson());
    const out = appendDispositionToResult(req());
    expect(base.ok && out.ok).toBe(true);
    if (!base.ok || !out.ok) return;
    expect(out.value.machineResultId).toBe(base.value.generatedFrom.machineResultId);
    expect(JSON.stringify(out.value.findings)).toBe(JSON.stringify(base.value.findings));
    expect(JSON.stringify(out.value.observations)).toBe(JSON.stringify(base.value.observations));
  });

  it("rebuilds a checksum-verifying JSON export that includes the exact history", () => {
    const out = appendDispositionToResult(req({ note: "ok", reasonCode: "R1" }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const parsed = parseJsonExport(out.value.exportJson);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.humanDispositionHistory).toHaveLength(1);
    expect(parsed.value.humanDispositionHistory[0].note).toBe("ok");
  });

  it("produces a readable report containing the disposition history", () => {
    const out = appendDispositionToResult(req({ actorId: "auditor-9" }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.report.html).toMatch(/auditor-9/);
    expect(out.value.report.filename).toMatch(/\.html$/);
  });

  it("rejects an invalid decision, empty actor, and empty reason code", () => {
    expect(appendDispositionToResult(req({ decision: "approved" as never })).ok).toBe(false);
    const noActor = appendDispositionToResult(req({ actorId: "  " }));
    expect(noActor.ok).toBe(false);
    if (!noActor.ok) expect(noActor.error.code).toBe("INVALID_DISPOSITION");
    const noReason = appendDispositionToResult(req({ reasonCode: "" }));
    expect(noReason.ok).toBe(false);
  });

  it("rejects references to a rule or check that is not in this result", () => {
    const badRule = appendDispositionToResult(req({ references: { ruleIds: ["no-such-rule"] } }));
    expect(badRule.ok).toBe(false);
    if (!badRule.ok) expect(badRule.error.code).toBe("INVALID_DISPOSITION_REFERENCE");
    const badCheck = appendDispositionToResult(
      req({ references: { checkIds: ["no-such-check"] } }),
    );
    expect(badCheck.ok).toBe(false);
  });

  it("accepts references that exist in the result", () => {
    const out = appendDispositionToResult(
      req({ references: { ruleIds: ["wine-alcohol-syntax"], checkIds: ["brand-name-check"] } }),
    );
    expect(out.ok).toBe(true);
  });

  it("rejects a tampered submitted result (client cannot inject findings)", () => {
    // Change machine content without recomputing the checksum: the server must
    // reject it rather than trust the client-supplied findings.
    const tampered = baseExportJson().replace("wine-alcohol-syntax", "wine-alcohol-INJECTED");
    expect(tampered).not.toBe(baseExportJson());
    const out = appendDispositionToResult(req({ exportJson: tampered }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("INVALID_SUBMITTED_RESULT");
  });
});

describe("POST /api/precheck/disposition", () => {
  function httpReq(body: unknown): Request {
    return new Request("http://localhost/api/precheck/disposition", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("appends a disposition and returns the refreshed result", async () => {
    const res = await POST(
      httpReq({
        exportJson: baseExportJson(),
        actorId: "reviewer-2",
        decision: "correction_requested",
        reasonCode: "FIX_TYPO",
        file: FILE,
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.data.humanDispositionHistory).toHaveLength(1);
    // recordedAt is generated server-side at the workflow boundary.
    expect(body.data.humanDispositionHistory[0].recordedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("rejects a decision outside the bounded internal-workflow set", async () => {
    const res = await POST(
      httpReq({
        exportJson: baseExportJson(),
        actorId: "r",
        decision: "approved_by_ttb",
        reasonCode: "x",
        file: FILE,
      }),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("INVALID_DISPOSITION");
  });

  it("returns user-safe errors with no stack, path, or environment data", async () => {
    const res = await POST(
      httpReq({
        exportJson: "not json",
        actorId: "r",
        reasonCode: "x",
        decision: "no_action",
        file: FILE,
      }),
    );
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/\/Users\/|\/home\/|node_modules|at Object/);
  });
});
