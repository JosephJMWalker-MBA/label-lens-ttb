// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- integration test drives dual-dialect Drizzle handles and Next route handlers */
import { rmSync } from "node:fs";
import { join } from "node:path";

import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB_FILE = ".local/test-revision-seed.db";
const TEST_STORAGE_DIR = join(process.cwd(), ".local/test-storage-revision-seed");
const RUN_MYSQL_TESTS = process.env.RUN_MYSQL_TESTS === "1";

vi.hoisted(() => {
  process.env.BETTER_AUTH_SECRET ||= "super-secret-test-better-auth-key-1234567890";
  process.env.BETTER_AUTH_URL ||= "http://localhost:3000";
  process.env.LABEL_LENS_INTEGRITY_SECRET ||= "test-only-integrity-secret-at-least-32-characters";
  if (process.env.RUN_MYSQL_TESTS !== "1") {
    process.env.DATABASE_URL = "file:.local/test-revision-seed.db";
  }
});

const MYSQL_DATABASE_URL = process.env.DATABASE_URL;
if (RUN_MYSQL_TESTS && (!MYSQL_DATABASE_URL || !/^mysql2?:\/\//.test(MYSQL_DATABASE_URL))) {
  throw new Error("RUN_MYSQL_TESTS=1 requires a mysql:// DATABASE_URL");
}

import { createTestSqliteDb } from "../../../../../../tests/integration/test-db-setup";
import {
  DEFAULT_PANEL_ID,
  PANEL_BYTES,
  PANEL_SHA,
  buildMultipartRequest,
  createValidAgentReviewPayload,
  panelBlob,
  resign,
} from "../../../../../../tests/integration/package-submit-fixtures";
import { signRevision } from "@/lib/integrity";
import { MAX_PANEL_ID_LENGTH } from "@/features/package-preparation/panel-identity-constraints";

type RouteHandler = (
  request: Request,
  context?: { params: Promise<{ id: string }> },
) => Promise<Response>;
type PanelRouteHandler = (
  request: Request,
  context: { params: Promise<{ id: string; panelId: string }> },
) => Promise<Response>;
const BROWSER_STYLE_PANEL_ID = "package-panel-11111111-1111-4111-8111-111111111111";

const DIALECTS = RUN_MYSQL_TESTS ? (["mysql"] as const) : (["sqlite"] as const);

for (const dialect of DIALECTS) {
  describe(`revision seed routes (${dialect})`, () => {
    let db: any;
    let schema: any;
    let isSQLite: boolean;
    let auth: any;
    let finalizePOST: RouteHandler;
    let claimPOST: RouteHandler;
    let requestChangesPOST: RouteHandler;
    let resubmitPOST: RouteHandler;
    let seedGET: RouteHandler;
    let seedPanelGET: PanelRouteHandler;

    async function loadModules() {
      vi.resetModules();
      rmSync(TEST_STORAGE_DIR, { recursive: true, force: true });
      process.env.LABEL_LENS_STORAGE_DIR = TEST_STORAGE_DIR;

      if (dialect === "sqlite") {
        const sqlite = createTestSqliteDb(TEST_DB_FILE, true);
        sqlite.close();
        process.env.DATABASE_URL = `file:${TEST_DB_FILE}`;
      } else {
        process.env.DATABASE_URL = MYSQL_DATABASE_URL as string;
      }

      const clientMod = await import("@/db/client");
      clientMod.initializeDatabase(process.env.DATABASE_URL as string);
      db = clientMod.db;
      schema = clientMod.schema;
      isSQLite = clientMod.isSQLite;
      auth = (await import("@/lib/auth")).auth;
      finalizePOST = (await import("../finalize/route")).POST as RouteHandler;
      claimPOST = (await import("../../../agent/submissions/[id]/claim/route"))
        .POST as RouteHandler;
      requestChangesPOST = (await import("../../../agent/submissions/[id]/request-changes/route"))
        .POST as RouteHandler;
      resubmitPOST = (await import("../resubmit/[id]/route")).POST as RouteHandler;
      seedGET = (await import("./[id]/route")).GET as RouteHandler;
      seedPanelGET = (await import("./[id]/panels/[panelId]/route")).GET as PanelRouteHandler;

      if (dialect === "mysql") await clearTables();
    }

    const TRIGGER_NAMES = [
      "prevent_submissions_update",
      "prevent_submissions_delete",
      "prevent_revisions_update",
      "prevent_revisions_delete",
      "prevent_reviewer_claims_closed_update",
      "prevent_reviewer_claims_identity_update",
      "prevent_reviewer_claims_delete",
      "prevent_agent_decisions_update",
      "prevent_agent_decisions_delete",
      "prevent_submission_revision_responses_update",
      "prevent_submission_revision_responses_delete",
    ];

    async function dropTriggers() {
      for (const name of TRIGGER_NAMES) {
        if (isSQLite) db.run(sql.raw(`DROP TRIGGER IF EXISTS ${name}`));
        else await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${name}`));
      }
    }

    async function clearTables() {
      await dropTriggers();
      for (const table of [
        schema.idempotencyRecords,
        schema.submissionRevisionResponses,
        schema.agentDecisions,
        schema.reviewerClaims,
        schema.machineAnalysisSnapshots,
        schema.sellerEvidenceSnapshots,
        schema.submittedPanels,
        schema.submissionStatusEvents,
        schema.submissionRevisions,
        schema.submissions,
        schema.sessions,
        schema.accounts,
        schema.verifications,
        schema.users,
      ]) {
        await db.delete(table);
      }
    }

    async function provision(email: string, role: "seller" | "agent" = "seller") {
      await auth.api.signUpEmail({ body: { email, password: "SecurePassword123!", name: email } });
      if (role !== "seller") {
        if (isSQLite) db.run(sql`UPDATE users SET role = ${role} WHERE email = ${email}`);
        else await db.execute(sql`UPDATE users SET role = ${role} WHERE email = ${email}`);
      }
      const login = await auth.api.signInEmail({
        body: { email, password: "SecurePassword123!" },
        asResponse: true,
      });
      const cookie = login.headers.get("set-cookie") || "";
      const data = (await login.json()) as { user: { id: string } };
      return { cookie, userId: data.user.id, email };
    }

    function jsonReq(
      url: string,
      cookie: string,
      idempotencyKey: string,
      body: Record<string, unknown>,
    ) {
      return new Request(`http://localhost:3000${url}`, {
        method: "POST",
        headers: {
          Cookie: cookie,
          "Content-Type": "application/json",
          "X-Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(body),
      });
    }

    function req(url: string, cookie = "") {
      return new Request(`http://localhost:3000${url}`, { headers: { Cookie: cookie } });
    }

    function params(id: string) {
      return { params: Promise.resolve({ id }) };
    }

    async function seedRequestedChanges(args: { submissionId?: string; panelId?: string } = {}) {
      const seller = await provision("seller@test.com");
      const agent = await provision("agent@test.com", "agent");
      const submissionId = args.submissionId ?? "pkg-revision-seed";
      const panelId = args.panelId ?? DEFAULT_PANEL_ID;
      const finalizeResponse = await finalizePOST(
        buildMultipartRequest({
          url: "http://localhost:3000/api/package/submit/finalize",
          payload: createValidAgentReviewPayload({
            packageId: submissionId,
            email: seller.email,
            panelId,
            analysisRunId: "run-revision-seed",
          }),
          cookie: seller.cookie,
          idempotencyKey: "k-finalize",
          files: { [panelId]: panelBlob() },
        }),
      );
      expect(finalizeResponse.status).toBe(200);
      const receipt = (await finalizeResponse.json()) as { revisionId: string };

      const claim = await (
        await claimPOST(
          jsonReq(`/api/agent/submissions/${submissionId}/claim`, agent.cookie, "k-claim", {
            expectedSubmissionVersion: 1,
          }),
          params(submissionId),
        )
      ).json();

      const rationale = "Please clarify the brand-name evidence on the front panel.";
      const decisionResponse = await requestChangesPOST(
        jsonReq(
          `/api/agent/submissions/${submissionId}/request-changes`,
          agent.cookie,
          "k-change",
          {
            expectedSubmissionVersion: 2,
            claimId: claim.claim.id,
            reviewedRevisionId: receipt.revisionId,
            reviewedRevisionNumber: 1,
            rationale,
          },
        ),
        params(submissionId),
      );
      expect(decisionResponse.status).toBe(200);
      const decision = (await decisionResponse.json()) as {
        decision: { id: string; reviewedRevisionId: string };
      };
      return { seller, agent, submissionId, receipt, decision, rationale, panelId };
    }

    beforeEach(loadModules);

    it("returns a bounded seller-owned seed for the exact latest requested-change decision", async () => {
      const { seller, submissionId, receipt, decision, rationale } = await seedRequestedChanges();

      const response = await seedGET(
        req(`/api/package/submit/revision-seed/${submissionId}`, seller.cookie),
        {
          params: Promise.resolve({ id: submissionId }),
        },
      );
      expect(response.status).toBe(200);
      const seed = await response.json();
      expect(seed).toMatchObject({
        submissionId,
        currentStatus: "changes_requested",
        expectedSubmissionVersion: 3,
        baseRevision: {
          id: receipt.revisionId,
          revisionNumber: 1,
          panels: [{ panelId: DEFAULT_PANEL_ID, role: "front" }],
        },
        changeRequest: {
          decisionId: decision.decision.id,
          revisionId: receipt.revisionId,
          revisionNumber: 1,
          rationale,
        },
        revisionContext: {
          kind: "requested_changes_response",
          submissionId,
          baseRevisionId: receipt.revisionId,
          baseRevisionNumber: 1,
          respondedToDecisionId: decision.decision.id,
          expectedSubmissionVersion: 3,
        },
      });
      const brandEvidence = seed.baseRevision.sellerEvidence.find(
        (item: { categoryId: string }) => item.categoryId === "brandName",
      );
      expect(brandEvidence.regions).toEqual([
        expect.objectContaining({
          panelId: DEFAULT_PANEL_ID,
          unit: "normalized-panel-relative",
          provenance: "seller-selected-region",
        }),
      ]);
      expect(JSON.stringify(seed)).not.toMatch(
        /canonicalJson|canonical_json|integritySignature|storageKey|storage_key|claimId|reviewerId|reviewerRole|activeSubmissionId|appendToken|machineResultId/i,
      );
    });

    it("streams only the seller-owned base panel bytes and hides non-owned submissions", async () => {
      const { seller, submissionId } = await seedRequestedChanges();
      const otherSeller = await provision("other-seller@test.com");

      const panel = await seedPanelGET(
        req(
          `/api/package/submit/revision-seed/${submissionId}/panels/${DEFAULT_PANEL_ID}`,
          seller.cookie,
        ),
        { params: Promise.resolve({ id: submissionId, panelId: DEFAULT_PANEL_ID }) },
      );
      expect(panel.status).toBe(200);
      expect(panel.headers.get("cache-control")).toBe("private, no-store");
      expect(panel.headers.get("x-content-type-options")).toBe("nosniff");
      expect(Buffer.from(await panel.arrayBuffer())).toEqual(PANEL_BYTES);

      const hidden = await seedPanelGET(
        req(
          `/api/package/submit/revision-seed/${submissionId}/panels/${DEFAULT_PANEL_ID}`,
          otherSeller.cookie,
        ),
        { params: Promise.resolve({ id: submissionId, panelId: DEFAULT_PANEL_ID }) },
      );
      expect(hidden.status).toBe(404);
    });

    it("preserves browser-style panel identities through finalization, seed, asset restore, and revision 2 resubmission", async () => {
      expect(BROWSER_STYLE_PANEL_ID).toHaveLength(50);
      expect(BROWSER_STYLE_PANEL_ID.length).toBeLessThanOrEqual(MAX_PANEL_ID_LENGTH);

      const { seller, submissionId, receipt } = await seedRequestedChanges({
        submissionId: "pkg-long-panel-identity",
        panelId: BROWSER_STYLE_PANEL_ID,
      });

      const panelRows = await db
        .select({
          id: schema.submittedPanels.id,
          revisionId: schema.submittedPanels.revisionId,
          storageKey: schema.submittedPanels.storageKey,
        })
        .from(schema.submittedPanels)
        .where(eq(schema.submittedPanels.revisionId, receipt.revisionId));
      expect(panelRows).toEqual([
        expect.objectContaining({
          id: BROWSER_STYLE_PANEL_ID,
          revisionId: receipt.revisionId,
        }),
      ]);
      expect(panelRows[0].storageKey).toContain(`/${BROWSER_STYLE_PANEL_ID}-`);

      const seedResponse = await seedGET(
        req(`/api/package/submit/revision-seed/${submissionId}`, seller.cookie),
        { params: Promise.resolve({ id: submissionId }) },
      );
      expect(seedResponse.status).toBe(200);
      const seed = await seedResponse.json();
      expect(seed.baseRevision.panels).toEqual([
        expect.objectContaining({
          panelId: BROWSER_STYLE_PANEL_ID,
          assetPanelId: BROWSER_STYLE_PANEL_ID,
        }),
      ]);
      const brandEvidence = seed.baseRevision.sellerEvidence.find(
        (item: { categoryId: string }) => item.categoryId === "brandName",
      );
      expect(brandEvidence.regions).toEqual([
        expect.objectContaining({ panelId: BROWSER_STYLE_PANEL_ID }),
      ]);
      expect(JSON.stringify(seed)).not.toMatch(/storageKey|storage_key|canonicalJson|signature/i);

      const panel = await seedPanelGET(
        req(
          `/api/package/submit/revision-seed/${submissionId}/panels/${BROWSER_STYLE_PANEL_ID}`,
          seller.cookie,
        ),
        { params: Promise.resolve({ id: submissionId, panelId: BROWSER_STYLE_PANEL_ID }) },
      );
      expect(panel.status).toBe(200);
      expect(Buffer.from(await panel.arrayBuffer())).toEqual(PANEL_BYTES);

      const childPanelId = "package-panel-22222222-2222-4222-8222-222222222222";
      const childPayload = createValidAgentReviewPayload({
        packageId: submissionId,
        email: seller.email,
        panelId: childPanelId,
        analysisRunId: "run-revision-child",
        sellerChangeSequence: 1,
        expectedValue: "Revised Test Brand",
        regionId: "revision-region-child",
      });
      childPayload.package.sellerChangeHistory.push({
        changeId: "seller-change-revision-started",
        sequence: 1,
        recordedAt: new Date().toISOString(),
        action: "revision_response_started",
        detail: "Revision response draft started from the requested-change seed.",
      });

      resign(childPayload);

      const resubmission = await resubmitPOST(
        buildMultipartRequest({
          url: `http://localhost:3000/api/package/submit/resubmit/${submissionId}`,
          payload: childPayload,
          cookie: seller.cookie,
          idempotencyKey: "k-resubmit-long-panel",
          revisionContext: seed.revisionContext,
          files: { [childPanelId]: panelBlob() },
        }),
        { params: Promise.resolve({ id: submissionId }) },
      );
      expect(resubmission.status).toBe(200);
      expect(await resubmission.json()).toMatchObject({
        submissionId,
        revisionNumber: 2,
        currentStatus: "waiting_for_agent_review",
      });
      const childRows = await db
        .select({ id: schema.submittedPanels.id })
        .from(schema.submittedPanels)
        .where(eq(schema.submittedPanels.id, childPanelId));
      expect(childRows).toEqual([{ id: childPanelId }]);
    });

    it("reconciles legacy truncated panel rows from storage-key identity without mutating them", async () => {
      const legacyAssetPanelId = BROWSER_STYLE_PANEL_ID.slice(0, 36);
      const { seller, submissionId, receipt } = await seedRequestedChanges({
        submissionId: "pkg-legacy-truncated-panel",
        panelId: BROWSER_STYLE_PANEL_ID,
      });
      if (isSQLite) {
        db.run(
          sql`UPDATE submitted_panels SET id = ${legacyAssetPanelId} WHERE revision_id = ${receipt.revisionId}`,
        );
      } else {
        await db.execute(
          sql`UPDATE submitted_panels SET id = ${legacyAssetPanelId} WHERE revision_id = ${receipt.revisionId}`,
        );
      }

      const beforeRows = await db
        .select({
          id: schema.submittedPanels.id,
          storageKey: schema.submittedPanels.storageKey,
        })
        .from(schema.submittedPanels)
        .where(eq(schema.submittedPanels.revisionId, receipt.revisionId));
      expect(beforeRows).toEqual([
        expect.objectContaining({
          id: legacyAssetPanelId,
        }),
      ]);
      expect(beforeRows[0].storageKey).toContain(`/${BROWSER_STYLE_PANEL_ID}-`);

      const seedResponse = await seedGET(
        req(`/api/package/submit/revision-seed/${submissionId}`, seller.cookie),
        { params: Promise.resolve({ id: submissionId }) },
      );
      expect(seedResponse.status).toBe(200);
      const seed = await seedResponse.json();
      expect(seed.baseRevision.panels).toEqual([
        expect.objectContaining({
          panelId: BROWSER_STYLE_PANEL_ID,
          assetPanelId: legacyAssetPanelId,
        }),
      ]);
      const brandEvidence = seed.baseRevision.sellerEvidence.find(
        (item: { categoryId: string }) => item.categoryId === "brandName",
      );
      expect(brandEvidence.regions).toEqual([
        expect.objectContaining({ panelId: BROWSER_STYLE_PANEL_ID }),
      ]);
      expect(JSON.stringify(seed)).not.toMatch(/storageKey|storage_key|canonicalJson|signature/i);

      const restored = await seedPanelGET(
        req(
          `/api/package/submit/revision-seed/${submissionId}/panels/${legacyAssetPanelId}`,
          seller.cookie,
        ),
        { params: Promise.resolve({ id: submissionId, panelId: legacyAssetPanelId }) },
      );
      expect(restored.status).toBe(200);
      expect(Buffer.from(await restored.arrayBuffer())).toEqual(PANEL_BYTES);

      const afterRows = await db
        .select({
          id: schema.submittedPanels.id,
          storageKey: schema.submittedPanels.storageKey,
        })
        .from(schema.submittedPanels)
        .where(eq(schema.submittedPanels.revisionId, receipt.revisionId));
      expect(afterRows).toEqual(beforeRows);
      expect(afterRows).not.toEqual([
        expect.objectContaining({
          id: BROWSER_STYLE_PANEL_ID,
        }),
      ]);
    });

    it("rejects legacy storage-key identities longer than the accepted panel ID maximum", async () => {
      const legacyAssetPanelId = BROWSER_STYLE_PANEL_ID.slice(0, 36);
      const recoveredPanelId = "x".repeat(MAX_PANEL_ID_LENGTH + 1);
      const { seller, submissionId, receipt } = await seedRequestedChanges({
        submissionId: "pkg-overwidth-recovered-panel",
        panelId: BROWSER_STYLE_PANEL_ID,
      });
      const storageKey = `submissions/${submissionId}/panels/${recoveredPanelId}-${PANEL_SHA}`;
      if (isSQLite) {
        db.run(
          sql`UPDATE submitted_panels SET id = ${legacyAssetPanelId}, storage_key = ${storageKey} WHERE revision_id = ${receipt.revisionId}`,
        );
      } else {
        await db.execute(
          sql`UPDATE submitted_panels SET id = ${legacyAssetPanelId}, storage_key = ${storageKey} WHERE revision_id = ${receipt.revisionId}`,
        );
      }

      const response = await seedGET(
        req(`/api/package/submit/revision-seed/${submissionId}`, seller.cookie),
        { params: Promise.resolve({ id: submissionId }) },
      );
      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body).toEqual({
        error: {
          code: "PANEL_IDENTITY_INCONSISTENT",
          message:
            "A stored panel identity could not be reconciled safely. No revision draft was created.",
        },
      });
      expect(JSON.stringify(body)).not.toMatch(/storageKey|storage_key|submissions\/|canonical/i);
    });

    it("rejects legacy storage keys without the fixed checksum suffix", async () => {
      const { seller, submissionId, receipt } = await seedRequestedChanges({
        submissionId: "pkg-bad-panel-suffix",
        panelId: BROWSER_STYLE_PANEL_ID,
      });
      const storageKey = `submissions/${submissionId}/panels/${BROWSER_STYLE_PANEL_ID}-${"a".repeat(64)}`;
      if (isSQLite) {
        db.run(
          sql`UPDATE submitted_panels SET storage_key = ${storageKey} WHERE revision_id = ${receipt.revisionId}`,
        );
      } else {
        await db.execute(
          sql`UPDATE submitted_panels SET storage_key = ${storageKey} WHERE revision_id = ${receipt.revisionId}`,
        );
      }

      const response = await seedGET(
        req(`/api/package/submit/revision-seed/${submissionId}`, seller.cookie),
        { params: Promise.resolve({ id: submissionId }) },
      );
      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body).toEqual({
        error: {
          code: "PANEL_IDENTITY_INCONSISTENT",
          message:
            "A stored panel identity could not be reconciled safely. No revision draft was created.",
        },
      });
      expect(JSON.stringify(body)).not.toMatch(/storageKey|storage_key|submissions\/|canonical/i);
    });

    it("fails closed without leaking storage details when a stored panel identity is inconsistent", async () => {
      const { seller, submissionId, receipt } = await seedRequestedChanges({
        submissionId: "pkg-inconsistent-panel-identity",
        panelId: BROWSER_STYLE_PANEL_ID,
      });
      if (isSQLite) {
        db.run(
          sql`UPDATE submitted_panels SET storage_key = ${"submissions/wrong-package/panels/" + BROWSER_STYLE_PANEL_ID + "-" + PANEL_SHA} WHERE revision_id = ${receipt.revisionId}`,
        );
      } else {
        await db.execute(
          sql`UPDATE submitted_panels SET storage_key = ${"submissions/wrong-package/panels/" + BROWSER_STYLE_PANEL_ID + "-" + PANEL_SHA} WHERE revision_id = ${receipt.revisionId}`,
        );
      }

      const response = await seedGET(
        req(`/api/package/submit/revision-seed/${submissionId}`, seller.cookie),
        { params: Promise.resolve({ id: submissionId }) },
      );
      expect(response.status).toBe(409);
      const body = await response.json();
      expect(body).toEqual({
        error: {
          code: "PANEL_IDENTITY_INCONSISTENT",
          message:
            "A stored panel identity could not be reconciled safely. No revision draft was created.",
        },
      });
      expect(JSON.stringify(body)).not.toMatch(/storageKey|storage_key|submissions\/|canonical/i);
    });

    it("refuses a seed after the exact requested-change decision has been answered", async () => {
      const { seller, submissionId, decision, receipt } = await seedRequestedChanges();
      await db.insert(schema.submissionRevisionResponses).values({
        id: "11111111-1111-4111-8111-111111111111",
        submissionId,
        parentRevisionId: receipt.revisionId,
        parentRevisionNumber: 1,
        respondedToDecisionId: decision.decision.id,
        childRevisionId: receipt.revisionId,
        childRevisionNumber: 1,
        sellerId: seller.userId,
        idempotencyRecordKey: `resubmit:${seller.userId}:${submissionId}:already`,
        recordedAt: new Date(),
      });

      const response = await seedGET(
        req(`/api/package/submit/revision-seed/${submissionId}`, seller.cookie),
        {
          params: Promise.resolve({ id: submissionId }),
        },
      );
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({
        error: { code: "CHANGE_REQUEST_ALREADY_ANSWERED" },
      });
    });

    it("selects requested-change feedback by latest revision identity, not event time", async () => {
      const { seller, agent, submissionId, receipt } = await seedRequestedChanges();
      const staleDecisionId = "33333333-3333-4333-8333-333333333333";
      const staleRevisionId = "44444444-4444-4444-8444-444444444444";
      const staleClaimId = "55555555-5555-4555-8555-555555555555";
      const staleCanonical = JSON.stringify({ submissionId, revision: 0, stale: true });
      await db.insert(schema.submissionRevisions).values({
        id: staleRevisionId,
        submissionId,
        revisionNumber: 0,
        profileId: "wine-label-requirements",
        profileVersion: "1.0.0",
        submittedBy: seller.email,
        submittedAt: new Date(Date.now() - 120_000),
        canonicalJson: staleCanonical,
        integritySignature: signRevision(staleCanonical),
      });
      await db.insert(schema.reviewerClaims).values({
        id: staleClaimId,
        submissionId,
        revisionId: staleRevisionId,
        revisionNumber: 0,
        reviewerId: agent.userId,
        reviewerRole: "agent",
        state: "decided",
        activeSubmissionId: null,
        claimedSubmissionVersion: 1,
        claimedAt: new Date(Date.now() - 90_000),
        decidedAt: new Date(Date.now() - 80_000),
        createdAt: new Date(Date.now() - 90_000),
      });
      await db.insert(schema.agentDecisions).values({
        id: staleDecisionId,
        submissionId,
        revisionId: staleRevisionId,
        revisionNumber: 0,
        claimId: staleClaimId,
        reviewerId: agent.userId,
        reviewerRole: "agent",
        decisionType: "changes_requested",
        priorStatus: "in_agent_review",
        resultingStatus: "changes_requested",
        rationale: "stale decision must not appear",
        submissionVersionBefore: 3,
        submissionVersionAfter: 4,
        idempotencyRecordKey: "agent-review:request_changes:stale:k",
        recordedAt: new Date(Date.now() + 60_000),
      });

      const response = await seedGET(
        req(`/api/package/submit/revision-seed/${submissionId}`, seller.cookie),
        {
          params: Promise.resolve({ id: submissionId }),
        },
      );
      expect(response.status).toBe(200);
      const seed = await response.json();
      expect(seed.changeRequest.revisionId).toBe(receipt.revisionId);
      expect(seed.changeRequest.rationale).not.toContain("stale decision");
    });
  });
}
