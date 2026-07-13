// @vitest-environment node
import { createHmac } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { buildJsonExport, verifyExportIntegrity } from "@/pipeline/export/json/build-json-export";
import { payloadHash, serializeExportCanonical } from "@/pipeline/export/json/canonical-json";
import { parseJsonExport } from "@/pipeline/export/json/parse-json-export";
import { assemblePrecheckResult } from "@/pipeline/result/assemble";
import { buildAssembleInput } from "@/pipeline/result/build.fixtures";
import { deriveMachineResultId } from "@/pipeline/result/serialize";
import { issueAppendToken } from "@/server/append-token";
import { appendDispositionToResult } from "@/server/precheck-service";
import type { PrecheckDispositionRequest } from "@/server/precheck-service.types";

import { POST } from "./route";

// Tests inject a fixed signing secret (production would require an explicit
// LABEL_LENS_APPEND_SIGNING_KEY of sufficient length).
const FIXED_SECRET = "test-fixed-append-signing-key-0123456789";
beforeAll(() => {
  process.env.LABEL_LENS_APPEND_SIGNING_KEY = FIXED_SECRET;
});

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

/** The machine-result id the parser recomputes from a submitted export. */
function machineIdOf(exportJson: string): string {
  const parsed = parseJsonExport(exportJson);
  if (!parsed.ok) throw new Error("parse failed");
  return parsed.value.generatedFrom.machineResultId;
}

/** A valid server-issued append token for the given export's machine result. */
function tokenFor(exportJson: string): string {
  const issued = issueAppendToken(machineIdOf(exportJson));
  if (!issued.ok) throw new Error("token issuance failed");
  return issued.token;
}

const FILE = {
  displayName: "label.jpeg",
  mediaType: "image/jpeg",
  byteSize: 1,
  source: "upload" as const,
};

function req(overrides: Partial<PrecheckDispositionRequest> = {}): PrecheckDispositionRequest {
  const exportJson = overrides.exportJson ?? baseExportJson();
  return {
    exportJson,
    appendToken: tokenFor(baseExportJson()),
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

  it("rejects a re-checksummed payload that kept a stale machine-result id", () => {
    const exp = JSON.parse(baseExportJson());
    // Change a machine field and re-checksum the payload, but keep the old id.
    exp.declaredFacts.applicationAlcoholValue.value = "13";
    const { integrity, ...payload } = exp;
    exp.integrity = { ...integrity, value: payloadHash(payload) };
    const out = appendDispositionToResult(req({ exportJson: JSON.stringify(exp) }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("INVALID_SUBMITTED_RESULT");
  });
});

describe("appendDispositionToResult (append authorization)", () => {
  /** Rebuild a fully self-consistent export after a machine-content change: the
   * canonical machine-result id AND the integrity checksum are both recomputed,
   * exactly as a forger holding the committed parser (but not the signing secret)
   * could. Such an export passes parsing and integrity — only the append token
   * can distinguish it from a genuine one. */
  function forgeSelfConsistentExport(mutate: (result: Record<string, unknown>) => void): string {
    const parsed = parseJsonExport(baseExportJson());
    if (!parsed.ok) throw new Error("parse failed");
    const forged = {
      machineResultId: parsed.value.generatedFrom.machineResultId,
      resultSchemaVersion: parsed.value.generatedFrom.resultSchemaVersion,
      mode: parsed.value.mode,
      profile: parsed.value.profile,
      run: parsed.value.run,
      declaredFacts: parsed.value.declaredFacts,
      evidenceAssessments: parsed.value.evidenceAssessments,
      observations: parsed.value.observations,
      findings: parsed.value.findings,
      versionManifest: parsed.value.versionManifest,
      humanFieldConfirmationHistory: parsed.value.humanFieldConfirmationHistory,
      advisoryNotice: parsed.value.advisoryNotice,
      ...(parsed.value.advisoryQuality !== undefined
        ? { advisoryQuality: parsed.value.advisoryQuality }
        : {}),
      humanDispositionHistory: parsed.value.humanDispositionHistory,
    };
    mutate(forged);
    const { machineResultId: _previousId, ...machineContent } = forged;
    void _previousId;
    const machineResultId = deriveMachineResultId(machineContent as never);
    const rebuilt = buildJsonExport({ machineResultId, ...machineContent } as never);
    if (!rebuilt.ok) throw new Error("rebuild failed");
    const verified = verifyExportIntegrity(rebuilt.value);
    if (!verified.ok) throw new Error("verify failed");
    return serializeExportCanonical(verified.value);
  }

  it("permits an append with a valid server-issued token", () => {
    const exportJson = baseExportJson();
    const out = appendDispositionToResult(req({ exportJson, appendToken: tokenFor(exportJson) }));
    expect(out.ok).toBe(true);
  });

  it("rejects a missing append token", () => {
    const out = appendDispositionToResult(req({ appendToken: "" }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("MISSING_APPEND_TOKEN");
  });

  it("rejects altered machine content presented with the old token", () => {
    const original = baseExportJson();
    const oldToken = tokenFor(original);
    // A self-consistent forgery: machine content changed, id + checksum rebuilt.
    const forged = forgeSelfConsistentExport((exp) => {
      (exp.observations as { brandName: { rawText: string } }).brandName.rawText = "FORGED MARK";
    });
    const out = appendDispositionToResult(req({ exportJson: forged, appendToken: oldToken }));
    expect(out.ok).toBe(false);
    // The token is for the original id; the recomputed id differs, so it fails.
    if (!out.ok) expect(out.error.code).toBe("INVALID_APPEND_TOKEN");
  });

  it("rejects altered content even when its own id and checksum are recomputed", () => {
    // The forgery is fully self-consistent: machine content changed, and both the
    // machine-result id and the integrity checksum recomputed to match. It passes
    // parsing/integrity but the attacker cannot sign a token for the new id.
    const forged = forgeSelfConsistentExport((exp) => {
      (exp.observations as { brandName: { rawText: string } }).brandName.rawText = "TAMPERED";
    });
    const attackerToken = createHmac("sha256", "attacker-key")
      .update(`append-token.v1:${machineIdOf(forged)}`)
      .digest("hex");
    const attacked = appendDispositionToResult(
      req({ exportJson: forged, appendToken: attackerToken }),
    );
    expect(attacked.ok).toBe(false);
    if (!attacked.ok) expect(attacked.error.code).toBe("INVALID_APPEND_TOKEN");
  });

  it("rejects a token generated with a different signing key", () => {
    const exportJson = baseExportJson();
    const attackerToken = createHmac("sha256", "some-other-key")
      .update(`append-token.v1:${machineIdOf(exportJson)}`)
      .digest("hex");
    const out = appendDispositionToResult(req({ exportJson, appendToken: attackerToken }));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("INVALID_APPEND_TOKEN");
  });

  it("rejects a valid token issued for a different machine result", () => {
    // A token for some other machine-result id must not authorize this one.
    const foreignToken = issueAppendToken("precheck-result.v1-" + "0".repeat(64));
    if (!foreignToken.ok) throw new Error("issue failed");
    const out = appendDispositionToResult(
      req({ exportJson: baseExportJson(), appendToken: foreignToken.token }),
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("INVALID_APPEND_TOKEN");
  });

  it("permits successive appends and keeps the machine id and findings unchanged", () => {
    const exportJson = baseExportJson();
    const first = appendDispositionToResult(req({ exportJson, appendToken: tokenFor(exportJson) }));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    // The refreshed export carries the same machine id, so the same token still
    // authorizes the next append.
    const secondExport = first.value.exportJson;
    expect(first.value.machineResultId).toBe(machineIdOf(exportJson));
    const second = appendDispositionToResult(
      req({ exportJson: secondExport, appendToken: first.value.appendToken }),
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.humanDispositionHistory).toHaveLength(2);
    expect(second.value.machineResultId).toBe(first.value.machineResultId);
    expect(JSON.stringify(second.value.findings)).toBe(JSON.stringify(first.value.findings));
  });

  it("never leaks the signing secret or token in export or report output", () => {
    const exportJson = baseExportJson();
    const out = appendDispositionToResult(req({ exportJson, appendToken: tokenFor(exportJson) }));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.exportJson).not.toContain(FIXED_SECRET);
    expect(out.value.exportJson).not.toContain(out.value.appendToken);
    expect(out.value.report.html).not.toContain(FIXED_SECRET);
    expect(out.value.report.html).not.toContain(out.value.appendToken);
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
    const exportJson = baseExportJson();
    const res = await POST(
      httpReq({
        exportJson,
        appendToken: tokenFor(exportJson),
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
    // The refreshed response still carries an append token for the next append.
    expect(typeof body.data.appendToken).toBe("string");
    expect(body.data.appendToken.length).toBeGreaterThan(0);
  });

  it("rejects a non-object JSON body (null, array, primitives) with a safe 400", async () => {
    for (const primitive of [null, [1, 2], "a string", 42, true]) {
      const res = await POST(httpReq(primitive));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("INVALID_DISPOSITION");
      // No stack trace or TypeError leaks from a non-object body.
      expect(JSON.stringify(body)).not.toMatch(/TypeError|at Object|\/Users\//);
    }
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
