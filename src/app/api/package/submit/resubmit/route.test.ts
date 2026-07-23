// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- integration test drives dual-dialect Drizzle handles and Next route handlers */
import { createHash } from "node:crypto";
import fs, { existsSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TEST_DB_FILE = ".local/test-resubmit.db";
const TEST_STORAGE_DIR = join(process.cwd(), ".local/test-storage-resubmit");
const RUN_MYSQL_TESTS = process.env.RUN_MYSQL_TESTS === "1";

vi.hoisted(() => {
  process.env.BETTER_AUTH_SECRET ||= "super-secret-test-better-auth-key-1234567890";
  process.env.BETTER_AUTH_URL ||= "http://localhost:3000";
  process.env.LABEL_LENS_INTEGRITY_SECRET ||= "test-only-integrity-secret-at-least-32-characters";
  if (process.env.RUN_MYSQL_TESTS !== "1") {
    process.env.DATABASE_URL = "file:.local/test-resubmit.db";
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
  sha256Hex,
} from "../../../../../../tests/integration/package-submit-fixtures";
import { verifyRevision } from "@/lib/integrity";
import { readPanelAsset, resubmissionPanelStorageKey } from "@/lib/panel-storage";
import { MAX_PANEL_ID_LENGTH } from "@/features/package-preparation/panel-identity-constraints";

type RouteHandler = (
  request: Request,
  context?: { params: Promise<{ id: string }> },
) => Promise<Response>;

const DIALECTS = RUN_MYSQL_TESTS ? (["mysql"] as const) : (["sqlite"] as const);

for (const dialect of DIALECTS) {
  describe(`resubmit route (${dialect})`, () => {
    let db: any;
    let schema: any;
    let isSQLite: boolean;
    let auth: any;
    let finalizePOST: RouteHandler;
    let claimPOST: RouteHandler;
    let requestChangesPOST: RouteHandler;
    let seedGET: RouteHandler;
    let resubmitPOST: RouteHandler;
    let detailGET: RouteHandler;

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
      seedGET = (await import("../revision-seed/[id]/route")).GET as RouteHandler;
      resubmitPOST = (await import("./[id]/route")).POST as RouteHandler;
      detailGET = (await import("../../../agent/submissions/[id]/route")).GET as RouteHandler;

      if (dialect === "mysql") {
        await clearTables();
        await createResponseTriggers();
      }
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
      "issue_167_fail_resubmit_projection",
    ];

    async function dropTriggers() {
      for (const name of TRIGGER_NAMES) {
        if (isSQLite) db.run(sql.raw(`DROP TRIGGER IF EXISTS ${name}`));
        else await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${name}`));
      }
    }

    async function createResponseTriggers() {
      if (isSQLite) {
        db.run(sql`CREATE TRIGGER prevent_submission_revision_responses_update
          BEFORE UPDATE ON submission_revision_responses
          BEGIN SELECT RAISE(FAIL, 'Submission revision response rows are immutable and cannot be updated.'); END;`);
        db.run(sql`CREATE TRIGGER prevent_submission_revision_responses_delete
          BEFORE DELETE ON submission_revision_responses
          BEGIN SELECT RAISE(FAIL, 'Submission revision response rows are immutable and cannot be deleted.'); END;`);
      } else {
        await db.execute(
          sql.raw(`
          CREATE TRIGGER prevent_submission_revision_responses_update BEFORE UPDATE ON submission_revision_responses FOR EACH ROW
          BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Submission revision response rows are immutable and cannot be updated.'; END`),
        );
        await db.execute(
          sql.raw(`
          CREATE TRIGGER prevent_submission_revision_responses_delete BEFORE DELETE ON submission_revision_responses FOR EACH ROW
          BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Submission revision response rows are immutable and cannot be deleted.'; END`),
        );
      }
    }

    async function createProjectionFailureTrigger() {
      if (isSQLite) {
        db.run(sql`CREATE TRIGGER issue_167_fail_resubmit_projection
          BEFORE UPDATE ON submissions
          WHEN OLD.id = 'pkg-resubmit'
            AND OLD.current_status = 'changes_requested'
            AND NEW.current_status = 'waiting_for_agent_review'
          BEGIN SELECT RAISE(FAIL, 'Issue 167 forced projection failure.'); END;`);
      } else {
        await db.execute(
          sql.raw(`
          CREATE TRIGGER issue_167_fail_resubmit_projection BEFORE UPDATE ON submissions FOR EACH ROW
          BEGIN
            IF OLD.id = 'pkg-resubmit'
              AND OLD.current_status = 'changes_requested'
              AND NEW.current_status = 'waiting_for_agent_review' THEN
              SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Issue 167 forced projection failure.';
            END IF;
          END`),
        );
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

    function params(id: string) {
      return { params: Promise.resolve({ id }) };
    }

    function getReq(url: string, cookie = "") {
      return new Request(`http://localhost:3000${url}`, { headers: { Cookie: cookie } });
    }

    async function seedRequestedChanges(args: { submissionId?: string } = {}) {
      const seller = await provision("seller@test.com");
      const agent = await provision("agent@test.com", "agent");
      const submissionId = args.submissionId ?? "pkg-resubmit";
      const parentPayload = createValidAgentReviewPayload({
        packageId: submissionId,
        email: seller.email,
        panelId: DEFAULT_PANEL_ID,
        analysisRunId: "parent-run",
      });
      const finalized = await finalizePOST(
        buildMultipartRequest({
          url: "http://localhost:3000/api/package/submit/finalize",
          payload: parentPayload,
          cookie: seller.cookie,
          idempotencyKey: "k-finalize",
        }),
      );
      expect(finalized.status).toBe(200);
      const receipt = (await finalized.json()) as { revisionId: string };
      const parentRevision = await db.query.submissionRevisions.findFirst({
        where: (r: any, { eq: e }: any) => e(r.id, receipt.revisionId),
      });

      const claim = await (
        await claimPOST(
          jsonReq(`/api/agent/submissions/${submissionId}/claim`, agent.cookie, "k-claim", {
            expectedSubmissionVersion: 1,
          }),
          params(submissionId),
        )
      ).json();
      const change = await requestChangesPOST(
        jsonReq(
          `/api/agent/submissions/${submissionId}/request-changes`,
          agent.cookie,
          "k-change",
          {
            expectedSubmissionVersion: 2,
            claimId: claim.claim.id,
            reviewedRevisionId: receipt.revisionId,
            reviewedRevisionNumber: 1,
            rationale: "Please clarify the brand-name evidence on the front panel.",
          },
        ),
        params(submissionId),
      );
      expect(change.status).toBe(200);

      const seed = await seedGET(
        getReq(`/api/package/submit/revision-seed/${submissionId}`, seller.cookie),
        {
          params: Promise.resolve({ id: submissionId }),
        },
      );
      expect(seed.status).toBe(200);
      const seedBody = await seed.json();
      return {
        seller,
        agent,
        submissionId,
        receipt,
        parentRevision,
        revisionContext: seedBody.revisionContext,
      };
    }

    function childPayload(submissionId: string, panelId = "revision-panel-front") {
      const payload = createValidAgentReviewPayload({
        packageId: submissionId,
        email: "seller@test.com",
        panelId,
        analysisRunId: "revision-run",
        sellerChangeSequence: 1,
        expectedValue: "Revised Brand",
        regionId: "revision-region",
      });
      payload.package.sellerChangeHistory.push({
        changeId: "seller-change-revision-started",
        sequence: 1,
        recordedAt: new Date().toISOString(),
        action: "revision_response_started",
        detail: "Revision response draft started from the requested-change seed.",
      });
      return resign(payload);
    }

    function withExtraPanel(
      payload: ReturnType<typeof createValidAgentReviewPayload>,
      args: { panelId: string; role?: "back" | "side" | "other" },
    ) {
      const mutablePayload = payload as any;
      const basePanel = mutablePayload.package.panels[0];
      const role = args.role ?? "back";
      mutablePayload.package.panels.push({
        ...basePanel,
        panelId: args.panelId,
        order: mutablePayload.package.panels.length,
        role,
        displayName: `${args.panelId}.png`,
      });
      mutablePayload.package.panelDecisions = {
        back:
          role === "back" ? "upload" : (mutablePayload.package.panelDecisions?.back ?? "absent"),
        additional:
          role === "side" || role === "other"
            ? "add"
            : (mutablePayload.package.panelDecisions?.additional ?? "none"),
      };
      return resign(mutablePayload);
    }

    function corruptedPanelBytes(): Buffer {
      const copy = Buffer.from(PANEL_BYTES);
      copy[40] = copy[40] ^ 0xff;
      return copy;
    }

    function resubmitRequest(args: {
      submissionId: string;
      cookie: string;
      idempotencyKey: string;
      payload: unknown;
      revisionContext: unknown;
      panelId?: string;
      files?: Record<string, Blob>;
    }) {
      const panelId = args.panelId ?? "revision-panel-front";
      return buildMultipartRequest({
        url: `http://localhost:3000/api/package/submit/resubmit/${args.submissionId}`,
        payload: args.payload,
        cookie: args.cookie,
        idempotencyKey: args.idempotencyKey,
        revisionContext: args.revisionContext,
        files: args.files ?? { [panelId]: panelBlob() },
      });
    }

    function storageFileCount(dir = TEST_STORAGE_DIR): number {
      if (!existsSync(dir)) return 0;
      let count = 0;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        count += entry.isDirectory() ? storageFileCount(full) : 1;
      }
      return count;
    }

    function revisionStorageFileCount(submissionId: string): number {
      return storageFileCount(join(TEST_STORAGE_DIR, "submissions", submissionId, "revisions"));
    }

    async function readRevisionRows(submissionId: string) {
      return db
        .select()
        .from(schema.submissionRevisions)
        .where(eq(schema.submissionRevisions.submissionId, submissionId));
    }

    beforeEach(loadModules);

    it("commits a child revision atomically without mutating revision 1", async () => {
      const { seller, agent, submissionId, parentRevision, revisionContext } =
        await seedRequestedChanges();
      const beforeParentHash = sha256Hex(parentRevision.canonicalJson);
      const payload = childPayload(submissionId);

      const response = await resubmitPOST(
        resubmitRequest({
          submissionId,
          cookie: seller.cookie,
          idempotencyKey: "k-resubmit",
          payload,
          revisionContext,
        }),
        params(submissionId),
      );
      expect(response.status).toBe(200);
      const receipt = (await response.json()) as {
        revisionId: string;
        revisionNumber: number;
        submissionVersion: number;
      };
      expect(receipt).toMatchObject({
        action: "resubmit_revision",
        parentRevisionId: parentRevision.id,
        parentRevisionNumber: 1,
        revisionNumber: 2,
        currentStatus: "waiting_for_agent_review",
        submissionVersion: 4,
      });
      expect(JSON.stringify(receipt)).not.toMatch(
        /signature|canonicalJson|storageKey|appendToken/i,
      );

      const parentAfter = await db.query.submissionRevisions.findFirst({
        where: (r: any, { eq: e }: any) => e(r.id, parentRevision.id),
      });
      expect(sha256Hex(parentAfter.canonicalJson)).toBe(beforeParentHash);
      expect(parentAfter.integritySignature).toBe(parentRevision.integritySignature);

      const revisions = await readRevisionRows(submissionId);
      expect(revisions).toHaveLength(2);
      const child = revisions.find((row: any) => row.id === receipt.revisionId);
      expect(child?.revisionNumber).toBe(2);
      expect(verifyRevision(child?.canonicalJson ?? "", child?.integritySignature ?? "")).toBe(
        true,
      );

      const responseRows = await db.select().from(schema.submissionRevisionResponses);
      expect(responseRows).toHaveLength(1);
      expect(responseRows[0]).toMatchObject({
        submissionId,
        parentRevisionId: parentRevision.id,
        parentRevisionNumber: 1,
        childRevisionId: receipt.revisionId,
        childRevisionNumber: 2,
        sellerId: seller.userId,
        idempotencyRecordKey: `resubmit:${seller.userId}:${submissionId}:k-resubmit`,
      });

      const panels = await db
        .select()
        .from(schema.submittedPanels)
        .where(eq(schema.submittedPanels.revisionId, receipt.revisionId));
      const expectedStorageKey = resubmissionPanelStorageKey(
        submissionId,
        receipt.revisionId,
        "revision-panel-front",
        PANEL_SHA,
      );
      expect(panels).toHaveLength(1);
      expect(panels[0].storageKey).toBe(expectedStorageKey);
      expect(readPanelAsset(expectedStorageKey)).toEqual({ ok: true, bytes: PANEL_BYTES });

      const snapshots = await db
        .select()
        .from(schema.machineAnalysisSnapshots)
        .where(eq(schema.machineAnalysisSnapshots.revisionId, receipt.revisionId));
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].analysisRunId).toBe("revision-run");
      expect(snapshots[0].analysisRunId).not.toBe("parent-run");
      expect(JSON.stringify(snapshots[0])).not.toContain("parent-run");

      const submission = await db.query.submissions.findFirst({
        where: (s: any, { eq: e }: any) => e(s.id, submissionId),
      });
      expect(submission).toMatchObject({
        currentStatus: "waiting_for_agent_review",
        version: 4,
      });
      const events = await db
        .select()
        .from(schema.submissionStatusEvents)
        .where(eq(schema.submissionStatusEvents.submissionId, submissionId));
      expect(
        events.filter((event: any) => event.status === "waiting_for_agent_review"),
      ).toHaveLength(2);
      expect(events.filter((event: any) => event.status === "changes_requested")).toHaveLength(1);

      const agentDetail = await detailGET(
        getReq(`/api/agent/submissions/${submissionId}`, agent.cookie),
        params(submissionId),
      );
      expect(agentDetail.status).toBe(200);
      const detail = await agentDetail.json();
      expect(detail.revision).toMatchObject({
        id: receipt.revisionId,
        revisionNumber: 2,
        integrityVerified: true,
      });
      expect(detail.revisionComparison).toMatchObject({
        parentRevision: { id: parentRevision.id, revisionNumber: 1, integrityVerified: true },
        childRevision: { id: receipt.revisionId, revisionNumber: 2, integrityVerified: true },
        panelChanges: {
          added: [],
          removed: [],
          replaced: [],
          unchanged: [{ role: "front", checksumSha256: PANEL_SHA, count: 1 }],
        },
        machineAnalysis: {
          priorAnalysisRunId: "parent-run",
          resultingAnalysisRunId: "revision-run",
        },
      });
      expect(detail.revisionComparison.sellerEvidenceChanges).toEqual([
        expect.objectContaining({
          categoryId: "alcoholStatement",
          priorDecision: "not_present",
          resultingDecision: "not_present",
        }),
        expect.objectContaining({
          categoryId: "brandName",
          priorExpectedValue: "Test Brand",
          resultingExpectedValue: "Revised Brand",
        }),
      ]);
      expect(JSON.stringify(detail)).not.toMatch(
        /canonicalJson|canonical_json|integritySignature|storageKey|storage_key|appendToken|\.local\/test-storage/i,
      );
    });

    it("accepts the maximum storage-safe child panel ID and stores the full resubmission key", async () => {
      const submissionId = "s".repeat(180);
      const maxPanelId = "r".repeat(MAX_PANEL_ID_LENGTH);
      const { seller, revisionContext } = await seedRequestedChanges({ submissionId });
      const payload = childPayload(submissionId, maxPanelId);

      const response = await resubmitPOST(
        resubmitRequest({
          submissionId,
          cookie: seller.cookie,
          idempotencyKey: "k-max-resubmit-panel-id",
          payload,
          revisionContext,
          panelId: maxPanelId,
        }),
        params(submissionId),
      );
      expect(response.status).toBe(200);
      const receipt = (await response.json()) as { revisionId: string };
      const expectedStorageKey = resubmissionPanelStorageKey(
        submissionId,
        receipt.revisionId,
        maxPanelId,
        PANEL_SHA,
      );
      expect(expectedStorageKey.length).toBeGreaterThan(500);

      const panels = await db
        .select()
        .from(schema.submittedPanels)
        .where(eq(schema.submittedPanels.revisionId, receipt.revisionId));
      expect(panels).toHaveLength(1);
      expect(panels[0].id).toBe(maxPanelId);
      expect(panels[0].storageKey).toBe(expectedStorageKey);
      expect(readPanelAsset(expectedStorageKey)).toEqual({ ok: true, bytes: PANEL_BYTES });
    });

    it("rejects a 191-character child panel ID before rows or assets are written", async () => {
      const { seller, submissionId, revisionContext } = await seedRequestedChanges();
      const invalidPanelId = "r".repeat(MAX_PANEL_ID_LENGTH + 1);
      const payload = childPayload(submissionId, invalidPanelId);

      const response = await resubmitPOST(
        resubmitRequest({
          submissionId,
          cookie: seller.cookie,
          idempotencyKey: "k-reject-overwidth-panel-id",
          payload,
          revisionContext,
          panelId: invalidPanelId,
        }),
        params(submissionId),
      );
      expect(response.status).toBe(400);
      const revisions = await readRevisionRows(submissionId);
      expect(revisions).toHaveLength(1);
      expect(revisionStorageFileCount(submissionId)).toBe(0);
    });

    it("rejects traversal-like route submission IDs before files, rows, or idempotency are written", async () => {
      const seller = await provision("seller-dotdot@test.com");
      const submissionId = "pkg..example";
      const response = await resubmitPOST(
        resubmitRequest({
          submissionId,
          cookie: seller.cookie,
          idempotencyKey: "k-dotdot-resubmit",
          payload: childPayload(submissionId),
          revisionContext: {
            kind: "requested_changes_response",
            submissionId,
            baseRevisionId: "11111111-1111-4111-8111-111111111111",
            baseRevisionNumber: 1,
            respondedToDecisionId: "22222222-2222-4222-8222-222222222222",
            expectedSubmissionVersion: 3,
          },
        }),
        params(submissionId),
      );
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Submission not found." });
      expect(
        await db.select().from(schema.submissions).where(eq(schema.submissions.id, submissionId)),
      ).toHaveLength(0);
      expect(await readRevisionRows(submissionId)).toHaveLength(0);
      expect(
        await db
          .select()
          .from(schema.idempotencyRecords)
          .where(
            eq(
              schema.idempotencyRecords.key,
              `resubmit:${seller.userId}:${submissionId}:k-dotdot-resubmit`,
            ),
          ),
      ).toHaveLength(0);
      expect(storageFileCount(join(TEST_STORAGE_DIR, "submissions", submissionId))).toBe(0);
    });

    it("compares repeated panel roles by checksum counts", async () => {
      const { seller, agent, submissionId, parentRevision, revisionContext } =
        await seedRequestedChanges();
      const response = await resubmitPOST(
        resubmitRequest({
          submissionId,
          cookie: seller.cookie,
          idempotencyKey: "k-repeated-role-comparison",
          payload: childPayload(submissionId),
          revisionContext,
        }),
        params(submissionId),
      );
      expect(response.status).toBe(200);
      const receipt = (await response.json()) as { revisionId: string };
      const sameSideChecksum = "1".repeat(64);
      const replacementChecksum = "2".repeat(64);

      await db.insert(schema.submittedPanels).values([
        {
          id: "parent-side-a",
          revisionId: parentRevision.id,
          role: "side",
          displayName: "parent-side-a.png",
          mediaType: "image/png",
          byteSize: PANEL_BYTES.length,
          checksumSha256: sameSideChecksum,
          width: 1,
          height: 1,
          rotation: 0,
          storageKey: "test/parent-side-a",
        },
        {
          id: "parent-side-b",
          revisionId: parentRevision.id,
          role: "side",
          displayName: "parent-side-b.png",
          mediaType: "image/png",
          byteSize: PANEL_BYTES.length,
          checksumSha256: sameSideChecksum,
          width: 1,
          height: 1,
          rotation: 0,
          storageKey: "test/parent-side-b",
        },
        {
          id: "child-side-a",
          revisionId: receipt.revisionId,
          role: "side",
          displayName: "child-side-a.png",
          mediaType: "image/png",
          byteSize: PANEL_BYTES.length,
          checksumSha256: sameSideChecksum,
          width: 1,
          height: 1,
          rotation: 0,
          storageKey: "test/child-side-a",
        },
        {
          id: "child-side-b",
          revisionId: receipt.revisionId,
          role: "side",
          displayName: "child-side-b.png",
          mediaType: "image/png",
          byteSize: PANEL_BYTES.length,
          checksumSha256: replacementChecksum,
          width: 1,
          height: 1,
          rotation: 0,
          storageKey: "test/child-side-b",
        },
      ]);

      const agentDetail = await detailGET(
        getReq(`/api/agent/submissions/${submissionId}`, agent.cookie),
        params(submissionId),
      );
      expect(agentDetail.status).toBe(200);
      const detail = await agentDetail.json();
      expect(detail.revisionComparison.panelChanges).toMatchObject({
        added: [],
        removed: [],
        unchanged: expect.arrayContaining([
          { role: "front", checksumSha256: PANEL_SHA, count: 1 },
          { role: "side", checksumSha256: sameSideChecksum, count: 1 },
        ]),
        replaced: [
          {
            role: "side",
            priorChecksumSha256: sameSideChecksum,
            resultingChecksumSha256: replacementChecksum,
            count: 1,
          },
        ],
      });
    });

    it("replays sequential and simultaneous same-key resubmissions as the exact winning response", async () => {
      const { seller, submissionId, revisionContext } = await seedRequestedChanges();
      const payload = childPayload(submissionId);

      const first = await resubmitPOST(
        resubmitRequest({
          submissionId,
          cookie: seller.cookie,
          idempotencyKey: "k-same",
          payload,
          revisionContext,
        }),
        params(submissionId),
      );
      expect(first.status).toBe(200);
      const firstBody = await first.json();

      const second = await resubmitPOST(
        resubmitRequest({
          submissionId,
          cookie: seller.cookie,
          idempotencyKey: "k-same",
          payload,
          revisionContext,
        }),
        params(submissionId),
      );
      expect(second.status).toBe(200);
      expect(second.headers.get("x-idempotent-replay")).toBe("true");
      expect(await second.json()).toEqual(firstBody);

      const revisions = await readRevisionRows(submissionId);
      expect(revisions).toHaveLength(2);
      expect(await db.select().from(schema.submissionRevisionResponses)).toHaveLength(1);
    });

    it("returns one commit and one replay for same-key concurrent resubmissions", async () => {
      const { seller, submissionId, revisionContext } = await seedRequestedChanges();
      const payload = childPayload(submissionId);
      const [a, b] = await Promise.all([
        resubmitPOST(
          resubmitRequest({
            submissionId,
            cookie: seller.cookie,
            idempotencyKey: "k-concurrent-same",
            payload,
            revisionContext,
          }),
          params(submissionId),
        ),
        resubmitPOST(
          resubmitRequest({
            submissionId,
            cookie: seller.cookie,
            idempotencyKey: "k-concurrent-same",
            payload,
            revisionContext,
          }),
          params(submissionId),
        ),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 200]);
      const bodies = [await a.json(), await b.json()];
      expect(bodies[0]).toEqual(bodies[1]);
      expect(await readRevisionRows(submissionId)).toHaveLength(2);
      expect(await db.select().from(schema.submissionRevisionResponses)).toHaveLength(1);
    });

    it("returns one winner and one controlled 409 for different-key concurrent responses", async () => {
      const { seller, submissionId, revisionContext } = await seedRequestedChanges();
      const payload = childPayload(submissionId);
      const [a, b] = await Promise.all([
        resubmitPOST(
          resubmitRequest({
            submissionId,
            cookie: seller.cookie,
            idempotencyKey: "k-race-a",
            payload,
            revisionContext,
          }),
          params(submissionId),
        ),
        resubmitPOST(
          resubmitRequest({
            submissionId,
            cookie: seller.cookie,
            idempotencyKey: "k-race-b",
            payload,
            revisionContext,
          }),
          params(submissionId),
        ),
      ]);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
      const loser = a.status === 409 ? a : b;
      expect(await loser.json()).toMatchObject({ error: { code: expect.any(String) } });
      expect(await readRevisionRows(submissionId)).toHaveLength(2);
      expect(await db.select().from(schema.submissionRevisionResponses)).toHaveLength(1);
    });

    it("includes revisionContext in the idempotency hash", async () => {
      const { seller, submissionId, revisionContext } = await seedRequestedChanges();
      const payload = childPayload(submissionId);
      const first = await resubmitPOST(
        resubmitRequest({
          submissionId,
          cookie: seller.cookie,
          idempotencyKey: "k-context-hash",
          payload,
          revisionContext,
        }),
        params(submissionId),
      );
      expect(first.status).toBe(200);

      const reused = await resubmitPOST(
        resubmitRequest({
          submissionId,
          cookie: seller.cookie,
          idempotencyKey: "k-context-hash",
          payload,
          revisionContext: { ...revisionContext, expectedSubmissionVersion: 999 },
        }),
        params(submissionId),
      );
      expect(reused.status).toBe(409);
      expect(await reused.json()).toMatchObject({ error: { code: "IDEMPOTENCY_CONFLICT" } });
    });

    it("cleans only the losing attempt assets on rollback and preserves committed assets", async () => {
      const { seller, submissionId, revisionContext, receipt } = await seedRequestedChanges();
      const payload = childPayload(submissionId);

      const winner = await resubmitPOST(
        resubmitRequest({
          submissionId,
          cookie: seller.cookie,
          idempotencyKey: "k-clean-winner",
          payload,
          revisionContext,
        }),
        params(submissionId),
      );
      expect(winner.status).toBe(200);
      const winnerBody = (await winner.json()) as { revisionId: string };
      const winnerKey = resubmissionPanelStorageKey(
        submissionId,
        winnerBody.revisionId,
        "revision-panel-front",
        PANEL_SHA,
      );
      expect(readPanelAsset(winnerKey)).toEqual({ ok: true, bytes: PANEL_BYTES });

      const failingContext = { ...revisionContext, expectedSubmissionVersion: 999 };
      const loser = await resubmitPOST(
        resubmitRequest({
          submissionId,
          cookie: seller.cookie,
          idempotencyKey: "k-clean-loser",
          payload: childPayload(submissionId, "revision-panel-loser"),
          revisionContext: failingContext,
          panelId: "revision-panel-loser",
        }),
        params(submissionId),
      );
      expect(loser.status).toBe(409);
      expect(readPanelAsset(winnerKey)).toEqual({ ok: true, bytes: PANEL_BYTES });

      const originalPanel = await db.query.submittedPanels.findFirst({
        where: (panel: any, { eq: e }: any) => e(panel.revisionId, receipt.revisionId),
      });
      expect(readPanelAsset(originalPanel.storageKey)).toEqual({ ok: true, bytes: PANEL_BYTES });
      expect(storageFileCount()).toBe(2);
    });

    it("cleans the first persisted panel when a later panel is missing", async () => {
      const { seller, submissionId, revisionContext, receipt } = await seedRequestedChanges();
      const payload = withExtraPanel(childPayload(submissionId), {
        panelId: "revision-panel-back",
        role: "back",
      });

      const response = await resubmitPOST(
        resubmitRequest({
          submissionId,
          cookie: seller.cookie,
          idempotencyKey: "k-clean-missing-panel",
          payload,
          revisionContext,
          files: { "revision-panel-front": panelBlob() },
        }),
        params(submissionId),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: "PANEL_FILE_MISSING" } });
      expect(revisionStorageFileCount(submissionId)).toBe(0);

      const originalPanel = await db.query.submittedPanels.findFirst({
        where: (panel: any, { eq: e }: any) => e(panel.revisionId, receipt.revisionId),
      });
      expect(readPanelAsset(originalPanel.storageKey)).toEqual({ ok: true, bytes: PANEL_BYTES });
      expect(storageFileCount()).toBe(1);
    });

    it("cleans the first persisted panel when a later panel checksum is invalid", async () => {
      const { seller, submissionId, revisionContext } = await seedRequestedChanges();
      const payload = withExtraPanel(childPayload(submissionId), {
        panelId: "revision-panel-back",
        role: "back",
      });

      const response = await resubmitPOST(
        resubmitRequest({
          submissionId,
          cookie: seller.cookie,
          idempotencyKey: "k-clean-bad-checksum",
          payload,
          revisionContext,
          files: {
            "revision-panel-front": panelBlob(),
            "revision-panel-back": panelBlob(corruptedPanelBytes()),
          },
        }),
        params(submissionId),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: "PANEL_CHECKSUM_MISMATCH" } });
      expect(revisionStorageFileCount(submissionId)).toBe(0);
      expect(storageFileCount()).toBe(1);
    });

    it("cleans the first persisted panel when a later panel storage write fails", async () => {
      const { seller, submissionId, revisionContext } = await seedRequestedChanges();
      const secondPanelId = "revision-panel-storage-failure";
      const payload = withExtraPanel(childPayload(submissionId), {
        panelId: secondPanelId,
        role: "back",
      });

      const originalWriteFileSync = fs.writeFileSync;
      let writes = 0;
      const writeSpy = vi.spyOn(fs, "writeFileSync").mockImplementation((...args: any[]) => {
        writes += 1;
        if (writes === 2) throw new Error("forced second panel write failure");
        return (originalWriteFileSync as any)(...args);
      });
      try {
        const response = await resubmitPOST(
          resubmitRequest({
            submissionId,
            cookie: seller.cookie,
            idempotencyKey: "k-clean-storage-failure",
            payload,
            revisionContext,
            files: {
              "revision-panel-front": panelBlob(),
              [secondPanelId]: panelBlob(),
            },
          }),
          params(submissionId),
        );
        expect(response.status).toBe(500);
        expect(await response.json()).toMatchObject({
          error: { code: "PANEL_STORAGE_UNAVAILABLE" },
        });
        expect(revisionStorageFileCount(submissionId)).toBe(0);
        expect(storageFileCount()).toBe(1);
      } finally {
        writeSpy.mockRestore();
      }
    });

    it("rolls back partial child rows when the final projection update fails", async () => {
      const { seller, submissionId, revisionContext } = await seedRequestedChanges();
      await createProjectionFailureTrigger();
      const payload = withExtraPanel(childPayload(submissionId), {
        panelId: "revision-panel-back",
        role: "back",
      });

      const response = await resubmitPOST(
        resubmitRequest({
          submissionId,
          cookie: seller.cookie,
          idempotencyKey: "k-rollback-projection",
          payload,
          revisionContext,
          files: {
            "revision-panel-front": panelBlob(),
            "revision-panel-back": panelBlob(),
          },
        }),
        params(submissionId),
      );
      expect(response.status).toBe(500);
      expect(await response.json()).toMatchObject({
        error: { code: "RESUBMISSION_COMMIT_FAILED" },
      });

      expect(await readRevisionRows(submissionId)).toHaveLength(1);
      expect(
        await db
          .select()
          .from(schema.submittedPanels)
          .where(eq(schema.submittedPanels.id, "revision-panel-front")),
      ).toHaveLength(0);
      expect(
        await db
          .select()
          .from(schema.submittedPanels)
          .where(eq(schema.submittedPanels.id, "revision-panel-back")),
      ).toHaveLength(0);
      expect(await db.select().from(schema.sellerEvidenceSnapshots)).toHaveLength(2);
      expect(
        await db
          .select()
          .from(schema.machineAnalysisSnapshots)
          .where(eq(schema.machineAnalysisSnapshots.analysisRunId, "revision-run")),
      ).toHaveLength(0);
      expect(await db.select().from(schema.submissionRevisionResponses)).toHaveLength(0);
      expect(
        await db
          .select()
          .from(schema.idempotencyRecords)
          .where(
            eq(
              schema.idempotencyRecords.key,
              `resubmit:${seller.userId}:${submissionId}:k-rollback-projection`,
            ),
          ),
      ).toHaveLength(0);

      const submission = await db.query.submissions.findFirst({
        where: (s: any, { eq: e }: any) => e(s.id, submissionId),
      });
      expect(submission).toMatchObject({ currentStatus: "changes_requested", version: 3 });
      const events = await db
        .select()
        .from(schema.submissionStatusEvents)
        .where(eq(schema.submissionStatusEvents.submissionId, submissionId));
      expect(events.map((event: any) => event.status).sort()).toEqual([
        "changes_requested",
        "in_agent_review",
        "waiting_for_agent_review",
      ]);
      expect(revisionStorageFileCount(submissionId)).toBe(0);
      expect(storageFileCount()).toBe(1);
    });

    it("binds the next agent claim and decision to revision 2", async () => {
      const { seller, agent, submissionId, revisionContext } = await seedRequestedChanges();
      const response = await resubmitPOST(
        resubmitRequest({
          submissionId,
          cookie: seller.cookie,
          idempotencyKey: "k-revision-2-agent-binding",
          payload: childPayload(submissionId),
          revisionContext,
        }),
        params(submissionId),
      );
      expect(response.status).toBe(200);
      const receipt = (await response.json()) as { revisionId: string; submissionVersion: number };

      const claimResponse = await claimPOST(
        jsonReq(
          `/api/agent/submissions/${submissionId}/claim`,
          agent.cookie,
          "k-claim-revision-2",
          {
            expectedSubmissionVersion: receipt.submissionVersion,
          },
        ),
        params(submissionId),
      );
      expect(claimResponse.status).toBe(200);
      const claimBody = await claimResponse.json();
      expect(claimBody.claim).toMatchObject({
        revisionId: receipt.revisionId,
        revisionNumber: 2,
      });

      const decisionResponse = await requestChangesPOST(
        jsonReq(
          `/api/agent/submissions/${submissionId}/request-changes`,
          agent.cookie,
          "k-change-revision-2",
          {
            expectedSubmissionVersion: receipt.submissionVersion + 1,
            claimId: claimBody.claim.id,
            reviewedRevisionId: receipt.revisionId,
            reviewedRevisionNumber: 2,
            rationale: "Revision 2 still needs brand evidence clarification.",
          },
        ),
        params(submissionId),
      );
      expect(decisionResponse.status).toBe(200);
      const decisionBody = await decisionResponse.json();
      expect(decisionBody.currentStatus).toBe("changes_requested");
      expect(decisionBody.decision).toMatchObject({
        type: "changes_requested",
        reviewedRevisionId: receipt.revisionId,
        reviewedRevisionNumber: 2,
      });

      const claimRows = await db
        .select()
        .from(schema.reviewerClaims)
        .where(eq(schema.reviewerClaims.id, claimBody.claim.id));
      expect(claimRows[0]).toMatchObject({
        revisionId: receipt.revisionId,
        revisionNumber: 2,
      });
      const decisionRows = await db
        .select()
        .from(schema.agentDecisions)
        .where(eq(schema.agentDecisions.claimId, claimBody.claim.id));
      expect(decisionRows[0]).toMatchObject({
        revisionId: receipt.revisionId,
        revisionNumber: 2,
        resultingStatus: "changes_requested",
      });
    });

    it("rejects stale revision context without adding child rows or assets", async () => {
      const { seller, submissionId, revisionContext } = await seedRequestedChanges();
      const payload = childPayload(submissionId);
      const stale = await resubmitPOST(
        resubmitRequest({
          submissionId,
          cookie: seller.cookie,
          idempotencyKey: "k-stale-context",
          payload,
          revisionContext: {
            ...revisionContext,
            baseRevisionId: "77777777-7777-4777-8777-777777777777",
          },
        }),
        params(submissionId),
      );
      expect(stale.status).toBe(409);
      expect(await stale.json()).toMatchObject({ error: { code: "STALE_REVISION_CONTEXT" } });
      expect(await readRevisionRows(submissionId)).toHaveLength(1);
      expect(await db.select().from(schema.submissionRevisionResponses)).toHaveLength(0);
      expect(storageFileCount()).toBe(1);
    });

    it("hides non-owned submissions at the resubmission boundary", async () => {
      const { submissionId, revisionContext } = await seedRequestedChanges();
      const otherSeller = await provision("other-seller@test.com");
      const payload = childPayload(submissionId);
      const response = await resubmitPOST(
        resubmitRequest({
          submissionId,
          cookie: otherSeller.cookie,
          idempotencyKey: "k-other",
          payload,
          revisionContext,
        }),
        params(submissionId),
      );
      expect(response.status).toBe(404);
      expect(JSON.stringify(await response.json())).not.toMatch(
        /requested changes|reviewer|claim/i,
      );
      expect(await readRevisionRows(submissionId)).toHaveLength(1);
    });

    it("prevents update and delete of append-only response rows", async () => {
      const { seller, submissionId, revisionContext } = await seedRequestedChanges();
      const payload = childPayload(submissionId);
      const response = await resubmitPOST(
        resubmitRequest({
          submissionId,
          cookie: seller.cookie,
          idempotencyKey: "k-immutability",
          payload,
          revisionContext,
        }),
        params(submissionId),
      );
      expect(response.status).toBe(200);
      const row = (await db.select().from(schema.submissionRevisionResponses))[0];
      if (isSQLite) {
        expect(() =>
          db.run(
            sql`UPDATE submission_revision_responses SET seller_id = 'other' WHERE id = ${row.id}`,
          ),
        ).toThrow();
        expect(() =>
          db.run(sql`DELETE FROM submission_revision_responses WHERE id = ${row.id}`),
        ).toThrow();
      } else {
        await expect(
          db.execute(
            sql`UPDATE submission_revision_responses SET seller_id = 'other' WHERE id = ${row.id}`,
          ),
        ).rejects.toThrow();
        await expect(
          db.execute(sql`DELETE FROM submission_revision_responses WHERE id = ${row.id}`),
        ).rejects.toThrow();
      }
      expect(await db.select().from(schema.submissionRevisionResponses)).toHaveLength(1);
    });

    it("persists replaced panel and revised seller brand evidence on revision 2 and preserves revision 1", async () => {
      const { seller, submissionId, revisionContext } = await seedRequestedChanges();

      // Front replacement panel bytes & checksum B (valid PNG header)
      const panelBBytes = Buffer.concat([PANEL_BYTES, Buffer.from("-revised-167")]);
      const panelBChecksum = createHash("sha256").update(panelBBytes).digest("hex");
      const panelBId = "front-replacement-167";

      const v2Payload = childPayload(submissionId);
      v2Payload.package.panels = [
        {
          panelId: panelBId,
          order: 0,
          role: "front",
          displayName: "front_revised.png",
          mediaType: "image/png",
          byteSize: panelBBytes.length,
          checksumSha256: panelBChecksum,
          width: 1,
          height: 1,
          rotation: 0,
        },
      ];
      v2Payload.package.categories = [
        {
          categoryId: "brandName",
          decision: "provided",
          expectedValue: "Issue 167 Revised Brand",
          regions: [],
        },
      ];
      await resign(v2Payload);

      const resubmitRes = await resubmitPOST(
        resubmitRequest({
          submissionId,
          cookie: seller.cookie,
          idempotencyKey: "k-issue-167-revised",
          payload: v2Payload,
          revisionContext,
          panelId: panelBId,
          files: { [panelBId]: new Blob([panelBBytes], { type: "image/png" }) },
        }),
        params(submissionId),
      );

      const errBody = resubmitRes.status !== 200 ? await resubmitRes.clone().json() : null;
      expect(errBody).toBeNull();
      expect(resubmitRes.status).toBe(200);
      const resubmitData = await resubmitRes.json();
      expect(resubmitData).toMatchObject({
        action: "resubmit_revision",
        submissionId,
        parentRevisionId: expect.any(String),
        parentRevisionNumber: 1,
        revisionNumber: 2,
        currentStatus: "waiting_for_agent_review",
      });

      // Verify DB revisions
      const revisions = await readRevisionRows(submissionId);
      expect(revisions).toHaveLength(2);
      const v1 = revisions.find((r: any) => r.revisionNumber === 1)!;
      const v2 = revisions.find((r: any) => r.revisionNumber === 2)!;

      const v1Package = JSON.parse(v1.canonicalJson).package;
      const v2Package = JSON.parse(v2.canonicalJson).package;

      // Rev 1 remains unchanged
      expect(v1Package.panels[0].checksumSha256).not.toBe(panelBChecksum);

      // Rev 2 has panel B and revised brand
      expect(v2Package.panels[0].panelId).toBe(panelBId);
      expect(v2Package.panels[0].checksumSha256).toBe(panelBChecksum);
      expect(v2Package.categories[0].expectedValue).toBe("Issue 167 Revised Brand");

      const v2Panels = await db
        .select()
        .from(schema.submittedPanels)
        .where(eq(schema.submittedPanels.revisionId, v2.id));
      expect(v2Panels[0].checksumSha256).toBe(panelBChecksum);

      // Agent detail comparison check
      const agentUser = await provision("agent-167@test.com", "agent");
      const detailRes = await detailGET(
        new Request(`http://localhost/api/agent/submissions/${submissionId}`, {
          headers: { cookie: agentUser.cookie },
        }),
        params(submissionId),
      );
      expect(detailRes.status).toBe(200);
      const detailData = await detailRes.json();

      expect(detailData.revisionComparison).toBeTruthy();
      expect(detailData.revisionComparison.panelChanges.replaced).toHaveLength(1);
      const brandChange = detailData.revisionComparison.sellerEvidenceChanges.find(
        (c: any) => c.categoryId === "brandName",
      );
      expect(brandChange?.resultingExpectedValue).toBe("Issue 167 Revised Brand");
    });
  });
}
