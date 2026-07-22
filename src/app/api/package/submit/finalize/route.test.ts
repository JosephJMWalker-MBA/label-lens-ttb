// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- integration test exercises loosely-typed dual-dialect Drizzle handles and deliberately malformed payloads */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { eq, sql } from "drizzle-orm";

// Configure database/auth environment before importing client/auth modules.
//
// Dialect selection:
//   - By default this suite runs against SQLite so ordinary `npm test` (and the
//     standard CI verify job) never touches a database server.
//   - Setting RUN_MYSQL_TESTS=1 (see `npm run test:mysql`) runs the SAME suite
//     against the authoritative MySQL dialect, using the caller-provided
//     `DATABASE_URL`. It fails loudly if that URL is absent or not MySQL, so the
//     MySQL job can never falsely pass by silently skipping MySQL cases.
const TEST_DB_FILE = ".local/test-integration.db";
const RUN_MYSQL_TESTS = process.env.RUN_MYSQL_TESTS === "1";

vi.hoisted(() => {
  process.env.BETTER_AUTH_SECRET ||= "super-secret-test-better-auth-key-1234567890";
  process.env.BETTER_AUTH_URL ||= "http://localhost:3000";
  process.env.LABEL_LENS_INTEGRITY_SECRET ||= "test-only-integrity-secret-at-least-32-characters";
  // Only default DATABASE_URL to SQLite when MySQL testing is NOT enabled; when
  // it is, the caller's mysql:// DATABASE_URL must be preserved.
  if (process.env.RUN_MYSQL_TESTS !== "1") {
    process.env.DATABASE_URL = "file:.local/test-integration.db";
  }
});

const MYSQL_DATABASE_URL = process.env.DATABASE_URL;
if (RUN_MYSQL_TESTS && (!MYSQL_DATABASE_URL || !/^mysql2?:\/\//.test(MYSQL_DATABASE_URL))) {
  throw new Error(
    "RUN_MYSQL_TESTS=1 requires DATABASE_URL to be a mysql:// connection string (got: " +
      `${MYSQL_DATABASE_URL ?? "undefined"}). Run via 'npm run test:mysql' with a MySQL DATABASE_URL.`,
  );
}

import { createTestSqliteDb } from "../../../../../../tests/integration/test-db-setup";
import { issueAppendToken } from "@/server/append-token";
import { canonicalStringify } from "@/pipeline/export/json/canonical-stringify";
import { panelStorageKey } from "@/lib/panel-storage";

type SubmissionRouteHandler = (
  request: Request,
  context?: { params: Promise<{ id: string }> },
) => Promise<Response>;
type PanelRouteHandler = (
  request: Request,
  context: { params: Promise<{ id: string; panelId: string }> },
) => Promise<Response>;

// A real 1x1 PNG. The route recomputes the checksum and decodes the byte
// signature + dimensions, so the fixture must be a genuine image whose declared
// metadata (size, checksum, 1x1 dimensions) matches its actual bytes.
const PANEL_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const PANEL_SHA = createHash("sha256").update(PANEL_BYTES).digest("hex");
const PANEL_WIDTH = 1;
const PANEL_HEIGHT = 1;
const PANEL_ID = "panel-front-123";

// Same length + valid PNG signature/IHDR as PANEL_BYTES, but different content,
// so it passes size/type/dimension checks and fails only the checksum check.
function corruptedPanelBytes(): Buffer {
  const copy = Buffer.from(PANEL_BYTES);
  copy[40] = copy[40] ^ 0xff;
  return copy;
}

function panelBlob(bytes: Buffer = PANEL_BYTES): Blob {
  return new Blob([new Uint8Array(bytes)], { type: "image/png" });
}

// --- shared canonical integrity signing (matches the merged model + route) ---
function integrityValue(payloadWithoutIntegrity: Record<string, unknown>): string {
  const clone = { ...payloadWithoutIntegrity };
  delete clone.integrity;
  return createHash("sha256").update(canonicalStringify(clone)).digest("hex");
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Recompute and attach the integrity value in place after a payload mutation. */
function resign<T extends { integrity: { value: string } }>(payload: T): T {
  payload.integrity.value = integrityValue(payload as unknown as Record<string, unknown>);
  return payload;
}

/** Build a fully valid, signed agent-review submission envelope. */
function createValidExportPayload(packageId: string, email = "seller@test.com") {
  const observations = {
    provenance: {
      artifactRef: `package-panel-${PANEL_ID}`,
      derivativeSha256: PANEL_SHA,
      extractionAdapterId: "test-adapter",
      extractionAdapterVersion: "1",
      ocrEngine: { kind: "not_applicable" },
      parserId: "test-parser",
      parserVersion: "1",
      processedAt: new Date().toISOString(),
    },
    brandName: "Test Brand",
    alcoholStatement: "12% ALC./VOL.",
  };

  const panel = {
    panelId: PANEL_ID,
    order: 0,
    role: "front" as const,
    displayName: "front.png",
    mediaType: "image/png",
    byteSize: PANEL_BYTES.length,
    checksumSha256: PANEL_SHA,
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT,
    rotation: 0 as const,
  };

  const machinePayload = {
    schemaVersion: "package-panel-machine-record.v1",
    packageId,
    panel,
    sourceSha256: PANEL_SHA,
    observations,
    versionManifest: {
      extractionAdapterId: "test-adapter",
      extractionAdapterVersion: "1",
      ocrEngine: { kind: "not_applicable" },
      parserId: "test-parser",
      parserVersion: "1",
    },
  };

  const machineResultId = createHash("sha256")
    .update(canonicalStringify(machinePayload))
    .digest("hex");

  const tokenRes = issueAppendToken(machineResultId);
  const appendToken = tokenRes.ok ? tokenRes.token : "unavailable-token";

  const exportJson = canonicalStringify({
    ...machinePayload,
    appendToken,
    integrity: {
      algorithm: "sha256",
      scope: "canonical-package-panel-machine-payload",
      value: machineResultId,
    },
  });

  const analysisRun = {
    analysisRunId: "run-123",
    sequence: 1,
    sellerChangeSequence: 0,
    recordedAt: new Date().toISOString(),
    panelRuns: [{ panelId: PANEL_ID, machineResultId, exportJson, observations }],
    categories: [
      {
        categoryId: "brandName",
        state: "clearly_readable" as const,
        observedValue: "Test Brand",
        supportingPanelIds: [PANEL_ID],
        supportingRegionIds: [],
        reason: "Matched brand name.",
      },
    ],
    readiness: "ready_for_agent_submission" as const,
  };

  const draft = {
    schemaVersion: "seller-package-draft.v1" as const,
    packageId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    profile: { id: "wine-label-requirements", version: "1.0.0" },
    panels: [panel],
    categories: [
      {
        categoryId: "brandName",
        decision: "provided" as const,
        expectedValue: "Test Brand",
        regions: [
          {
            regionId: "reg-brand-1",
            categoryId: "brandName",
            panelId: PANEL_ID,
            unit: "normalized-panel-relative" as const,
            provenance: "seller-selected-region" as const,
            x: 0.1,
            y: 0.2,
            width: 0.5,
            height: 0.1,
          },
        ],
      },
    ],
    sellerChangeHistory: [] as Array<Record<string, unknown>>,
    analysisRuns: [analysisRun],
  };

  const payload = {
    exportSchemaVersion: "seller-agent-package.v1" as const,
    exportType: "seller-prepared-agent-package" as const,
    boundary: {
      transmission: "agent-review-portal" as const,
      governmentApproval: false as const,
      statement: "Seller-submitted package for internal agent review. Not a government approval.",
    },
    submittedBy: email,
    submittedAt: new Date().toISOString(),
    receivingAgent: "label-lens-internal-agent-queue",
    package: draft,
    readiness: "ready_for_agent_submission" as const,
    applicationBuild: {},
    integrity: {
      algorithm: "sha256" as const,
      scope: "canonical-package-payload" as const,
      value: "",
    },
  };

  return resign(payload);
}

function buildFinalizeRequest(
  payload: unknown,
  sessionCookie: string,
  idempotencyKey: string,
  files: Record<string, Blob> = { [PANEL_ID]: panelBlob() },
) {
  const formData = new FormData();
  formData.append("packageExport", JSON.stringify(payload));
  for (const [key, value] of Object.entries(files)) {
    formData.append(key, value, "panel.png");
  }
  return new Request("http://localhost:3000/api/package/submit/finalize", {
    method: "POST",
    headers: { Cookie: sessionCookie, "X-Idempotency-Key": idempotencyKey },
    body: formData,
  });
}

const TEST_DIALECTS = RUN_MYSQL_TESTS ? (["mysql"] as const) : (["sqlite"] as const);

if (RUN_MYSQL_TESTS) {
  await import("../resubmit/route.test");
  await import("../revision-seed/route.test");
}

for (const dialect of TEST_DIALECTS) {
  describe(`Bounded Slice 1 — Finalize & Status (${dialect})`, () => {
    // Re-imported fresh per dialect after resetModules.
    let db: any;
    let schema: any;
    let isSQLite: boolean;
    let auth: any;
    let finalizePOST: SubmissionRouteHandler;
    let statusGET: SubmissionRouteHandler;
    let authPOST: SubmissionRouteHandler;
    let verifyRevision: (canonicalJson: string, expectedSignature: string) => boolean;

    async function loadModules() {
      vi.resetModules();
      if (dialect === "sqlite") {
        const sqlite = createTestSqliteDb(TEST_DB_FILE, true);
        sqlite.close();
        process.env.DATABASE_URL = `file:${TEST_DB_FILE}`;
      } else {
        // Use the caller-provided MySQL DATABASE_URL (validated at load time).
        process.env.DATABASE_URL = MYSQL_DATABASE_URL as string;
      }

      const clientMod = await import("@/db/client");
      clientMod.initializeDatabase(process.env.DATABASE_URL as string);
      db = clientMod.db;
      schema = clientMod.schema;
      isSQLite = clientMod.isSQLite;

      auth = (await import("@/lib/auth")).auth;
      finalizePOST = (await import("./route")).POST as SubmissionRouteHandler;
      statusGET = (await import("../status/[id]/route")).GET as SubmissionRouteHandler;
      authPOST = (await import("../../../auth/[...all]/route")).POST as SubmissionRouteHandler;
      verifyRevision = (await import("@/lib/integrity")).verifyRevision;
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

    // Recreate the immutability triggers exactly as the committed migration does:
    // submissions stay a mutable workflow container with locked identity fields;
    // revisions are append-only.
    async function createTriggers() {
      if (isSQLite) {
        db.run(sql`
          CREATE TRIGGER prevent_submissions_update BEFORE UPDATE ON submissions
          BEGIN
            SELECT CASE
              WHEN OLD.creator_id != NEW.creator_id OR OLD.id != NEW.id
                OR OLD.is_demo != NEW.is_demo OR OLD.created_at != NEW.created_at
              THEN RAISE(FAIL, 'Immutable fields on submissions cannot be updated.')
            END;
          END;`);
        db.run(sql`CREATE TRIGGER prevent_submissions_delete BEFORE DELETE ON submissions
          BEGIN SELECT RAISE(FAIL, 'Submissions cannot be deleted.'); END;`);
        db.run(sql`CREATE TRIGGER prevent_revisions_update BEFORE UPDATE ON submission_revisions
          BEGIN SELECT RAISE(FAIL, 'Submission revisions are immutable.'); END;`);
        db.run(sql`CREATE TRIGGER prevent_revisions_delete BEFORE DELETE ON submission_revisions
          BEGIN SELECT RAISE(FAIL, 'Submission revisions are immutable.'); END;`);
        db.run(sql`CREATE TRIGGER prevent_reviewer_claims_closed_update BEFORE UPDATE ON reviewer_claims
          WHEN OLD.state != 'active'
          BEGIN SELECT RAISE(FAIL, 'Closed reviewer claim rows are immutable.'); END;`);
        db.run(sql`CREATE TRIGGER prevent_reviewer_claims_identity_update BEFORE UPDATE ON reviewer_claims
          WHEN OLD.id != NEW.id
            OR OLD.submission_id != NEW.submission_id
            OR OLD.revision_id != NEW.revision_id
            OR OLD.revision_number != NEW.revision_number
            OR OLD.reviewer_id != NEW.reviewer_id
            OR OLD.reviewer_role != NEW.reviewer_role
            OR OLD.claimed_submission_version != NEW.claimed_submission_version
            OR OLD.claimed_at != NEW.claimed_at
            OR OLD.created_at != NEW.created_at
            OR (NEW.state = 'active' AND (
              OLD.active_submission_id IS NOT NEW.active_submission_id
              OR OLD.released_at IS NOT NEW.released_at
              OR OLD.released_by IS NOT NEW.released_by
              OR OLD.released_by_role IS NOT NEW.released_by_role
              OR OLD.release_reason IS NOT NEW.release_reason
              OR OLD.decided_at IS NOT NEW.decided_at
            ))
          BEGIN SELECT RAISE(FAIL, 'Reviewer claim identity fields cannot be updated.'); END;`);
        db.run(sql`CREATE TRIGGER prevent_reviewer_claims_delete BEFORE DELETE ON reviewer_claims
          BEGIN SELECT RAISE(FAIL, 'Reviewer claim rows cannot be deleted.'); END;`);
        db.run(sql`CREATE TRIGGER prevent_agent_decisions_update BEFORE UPDATE ON agent_decisions
          BEGIN SELECT RAISE(FAIL, 'Agent decisions are immutable.'); END;`);
        db.run(sql`CREATE TRIGGER prevent_agent_decisions_delete BEFORE DELETE ON agent_decisions
          BEGIN SELECT RAISE(FAIL, 'Agent decisions are immutable.'); END;`);
        db.run(sql`CREATE TRIGGER prevent_submission_revision_responses_update
          BEFORE UPDATE ON submission_revision_responses
          BEGIN SELECT RAISE(FAIL, 'Submission revision response rows are immutable and cannot be updated.'); END;`);
        db.run(sql`CREATE TRIGGER prevent_submission_revision_responses_delete
          BEFORE DELETE ON submission_revision_responses
          BEGIN SELECT RAISE(FAIL, 'Submission revision response rows are immutable and cannot be deleted.'); END;`);
      } else {
        await db.execute(
          sql.raw(`
          CREATE TRIGGER prevent_submissions_update BEFORE UPDATE ON submissions FOR EACH ROW
          BEGIN
            IF OLD.creator_id <> NEW.creator_id OR OLD.id <> NEW.id
              OR OLD.is_demo <> NEW.is_demo OR OLD.created_at <> NEW.created_at THEN
              SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Immutable fields on submissions cannot be updated.';
            END IF;
          END`),
        );
        await db.execute(
          sql.raw(`
          CREATE TRIGGER prevent_submissions_delete BEFORE DELETE ON submissions FOR EACH ROW
          BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Submissions cannot be deleted.'; END`),
        );
        await db.execute(
          sql.raw(`
          CREATE TRIGGER prevent_revisions_update BEFORE UPDATE ON submission_revisions FOR EACH ROW
          BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Submission revisions are immutable.'; END`),
        );
        await db.execute(
          sql.raw(`
          CREATE TRIGGER prevent_revisions_delete BEFORE DELETE ON submission_revisions FOR EACH ROW
          BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Submission revisions are immutable.'; END`),
        );
        await db.execute(
          sql.raw(`
          CREATE TRIGGER prevent_reviewer_claims_closed_update BEFORE UPDATE ON reviewer_claims FOR EACH ROW
          BEGIN
            IF OLD.state <> 'active' THEN
              SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Closed reviewer claim rows are immutable.';
            END IF;
          END`),
        );
        await db.execute(
          sql.raw(`
          CREATE TRIGGER prevent_reviewer_claims_identity_update BEFORE UPDATE ON reviewer_claims FOR EACH ROW
          BEGIN
            IF NOT (OLD.id <=> NEW.id)
                OR NOT (OLD.submission_id <=> NEW.submission_id)
                OR NOT (OLD.revision_id <=> NEW.revision_id)
                OR NOT (OLD.revision_number <=> NEW.revision_number)
                OR NOT (OLD.reviewer_id <=> NEW.reviewer_id)
                OR NOT (OLD.reviewer_role <=> NEW.reviewer_role)
                OR NOT (OLD.claimed_submission_version <=> NEW.claimed_submission_version)
                OR NOT (OLD.claimed_at <=> NEW.claimed_at)
                OR NOT (OLD.created_at <=> NEW.created_at) THEN
              SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reviewer claim identity fields cannot be updated.';
            END IF;
            IF NEW.state = 'active' AND (
                NOT (OLD.active_submission_id <=> NEW.active_submission_id)
                OR NOT (OLD.released_at <=> NEW.released_at)
                OR NOT (OLD.released_by <=> NEW.released_by)
                OR NOT (OLD.released_by_role <=> NEW.released_by_role)
                OR NOT (OLD.release_reason <=> NEW.release_reason)
                OR NOT (OLD.decided_at <=> NEW.decided_at)
            ) THEN
              SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Active reviewer claims cannot be edited.';
            END IF;
          END`),
        );
        await db.execute(
          sql.raw(`
          CREATE TRIGGER prevent_reviewer_claims_delete BEFORE DELETE ON reviewer_claims FOR EACH ROW
          BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Reviewer claim rows cannot be deleted.'; END`),
        );
        await db.execute(
          sql.raw(`
          CREATE TRIGGER prevent_agent_decisions_update BEFORE UPDATE ON agent_decisions FOR EACH ROW
          BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Agent decisions are immutable.'; END`),
        );
        await db.execute(
          sql.raw(`
          CREATE TRIGGER prevent_agent_decisions_delete BEFORE DELETE ON agent_decisions FOR EACH ROW
          BEGIN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Agent decisions are immutable.'; END`),
        );
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

    async function clearTables() {
      await db.delete(schema.idempotencyRecords);
      await db.delete(schema.submissionRevisionResponses);
      await db.delete(schema.agentDecisions);
      await db.delete(schema.reviewerClaims);
      await db.delete(schema.machineAnalysisSnapshots);
      await db.delete(schema.sellerEvidenceSnapshots);
      await db.delete(schema.submittedPanels);
      await db.delete(schema.submissionStatusEvents);
      await db.delete(schema.submissionRevisions);
      await db.delete(schema.submissions);
      await db.delete(schema.sessions);
      await db.delete(schema.accounts);
      await db.delete(schema.verifications);
      await db.delete(schema.users);
    }

    /** Provision a seller through the server-side auth API (admin/bootstrap path). */
    async function provisionSeller(email: string, role: "seller" | "agent" = "seller") {
      await auth.api.signUpEmail({
        body: { email, password: "SecurePassword123!", name: `User ${email}` },
      });
      const login = await auth.api.signInEmail({
        body: { email, password: "SecurePassword123!" },
        asResponse: true,
      });
      const cookie = login.headers.get("set-cookie") || "";
      const data = (await login.json()) as { user: { id: string } };
      if (role !== "seller") {
        if (isSQLite) {
          db.run(sql`UPDATE users SET role = ${role} WHERE id = ${data.user.id}`);
        } else {
          await db.execute(sql`UPDATE users SET role = ${role} WHERE id = ${data.user.id}`);
        }
      }
      return { cookie, userId: data.user.id };
    }

    beforeAll(async () => {
      await loadModules();
      // Guard against a false pass: the MySQL job must actually run on MySQL.
      expect(isSQLite).toBe(dialect === "sqlite");
    });

    it(`runs against the ${dialect} dialect`, () => {
      expect(isSQLite).toBe(dialect === "sqlite");
    });

    beforeEach(async () => {
      await dropTriggers();
      await clearTables();
      await createTriggers();
    });

    // ---- Provisioning & public signup boundary ----
    describe("Provisioning", () => {
      it("blocks public seller self-registration", async () => {
        const request = new Request("http://localhost:3000/api/auth/sign-up/email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: "attacker@test.com",
            password: "SecurePassword123!",
            name: "X",
          }),
        });
        const response = await authPOST(request);
        expect(response.status).toBe(403);
        const data = (await response.json()) as { error: string };
        expect(data.error).toContain("disabled");
      });

      it("provisions a seller and issues a database-backed session cookie", async () => {
        const { cookie, userId } = await provisionSeller("provisioned@test.com");
        expect(userId).toBeTruthy();
        expect(cookie).toContain("better-auth.session_token");
        // Session is DB-backed and revocable.
        const sessions = await db
          .select()
          .from(schema.sessions)
          .where(eq(schema.sessions.userId, userId));
        expect(sessions.length).toBeGreaterThan(0);
      });
    });

    // ---- Finalize ----
    describe("Finalize", () => {
      let sellerCookie: string;
      let sellerUserId: string;

      beforeEach(async () => {
        const seller = await provisionSeller("seller@test.com");
        sellerCookie = seller.cookie;
        sellerUserId = seller.userId;
      });

      it("requires the X-Idempotency-Key header", async () => {
        const request = new Request("http://localhost:3000/api/package/submit/finalize", {
          method: "POST",
          headers: { Cookie: sellerCookie },
        });
        const response = await finalizePOST(request);
        expect(response.status).toBe(400);
        expect(((await response.json()) as { error: string }).error).toContain("Idempotency");
      });

      it("rejects unauthenticated requests", async () => {
        const request = buildFinalizeRequest(
          createValidExportPayload("pkg-unauth"),
          "",
          "k-unauth",
        );
        expect((await finalizePOST(request)).status).toBe(401);
      });

      it("denies non-seller (agent/admin) actors in this slice", async () => {
        const agent = await provisionSeller("agent@test.com", "agent");
        const request = buildFinalizeRequest(
          createValidExportPayload("pkg-agent"),
          agent.cookie,
          "k-agent",
        );
        expect((await finalizePOST(request)).status).toBe(401);
      });

      it("commits atomically and returns a durable receipt without exposing the signature", async () => {
        const pkgId = "pkg-finalize-ok";
        const request = buildFinalizeRequest(createValidExportPayload(pkgId), sellerCookie, "k-ok");
        const response = await finalizePOST(request);
        expect(response.status).toBe(200);

        const receipt = (await response.json()) as {
          submissionId: string;
          revisionId: string;
          status: string;
          receivingAgent: string;
          signature?: string;
        };
        expect(receipt.submissionId).toBe(pkgId);
        expect(receipt.status).toBe("waiting_for_agent_review");
        expect(receipt.signature).toBeUndefined();
        expect(receipt.receivingAgent).toBe("label-lens-internal-agent-queue");

        const sub = await db.query.submissions.findFirst({
          where: (s: any, { eq: e }: any) => e(s.id, pkgId),
        });
        expect(sub?.currentStatus).toBe("waiting_for_agent_review");
        expect(sub?.creatorId).toBe(sellerUserId);

        const rev = await db.query.submissionRevisions.findFirst({
          where: (r: any, { eq: e }: any) => e(r.submissionId, pkgId),
        });
        expect(rev?.integritySignature).toContain("v1:");
        expect(verifyRevision(rev?.canonicalJson ?? "", rev?.integritySignature ?? "")).toBe(true);

        // Server-owned durable storage key, not any client-supplied path.
        const panels = await db
          .select()
          .from(schema.submittedPanels)
          .where(eq(schema.submittedPanels.revisionId, receipt.revisionId));
        expect(panels).toHaveLength(1);
        expect(panels[0].storageKey).toBe(panelStorageKey(pkgId, PANEL_ID, PANEL_SHA));

        // Exactly one machine analysis snapshot carrying the real panel runs.
        const runs = await db
          .select()
          .from(schema.machineAnalysisSnapshots)
          .where(eq(schema.machineAnalysisSnapshots.revisionId, receipt.revisionId));
        expect(runs).toHaveLength(1);
        expect(JSON.parse(runs[0].panelRuns)).toHaveLength(1);

        // One append-only status event.
        const events = await db
          .select()
          .from(schema.submissionStatusEvents)
          .where(eq(schema.submissionStatusEvents.submissionId, pkgId));
        expect(events).toHaveLength(1);
        expect(events[0].status).toBe("waiting_for_agent_review");
      });

      it("survives module-state recreation and still opens detail and the authorized panel", async () => {
        const pkgId = "pkg-lifecycle";
        const agent = await provisionSeller("lifecycle-agent@test.com", "agent");
        const response = await finalizePOST(
          buildFinalizeRequest(createValidExportPayload(pkgId), sellerCookie, "k-lifecycle"),
        );
        expect(response.status).toBe(200);

        const receipt = (await response.json()) as { revisionId: string };
        const before = await db.query.submissionRevisions.findFirst({
          where: (r: any, { eq: e }: any) => e(r.id, receipt.revisionId),
        });
        expect(before).toBeTruthy();

        // Recreate every imported database, integrity, auth, detail, and route
        // module while retaining only the configured secret and durable stores.
        vi.resetModules();
        const freshClient = await import("@/db/client");
        freshClient.initializeDatabase(process.env.DATABASE_URL as string);
        const { buildSubmissionDetail } = await import("@/server/submissions/detail");
        const freshPanelGET = (
          await import("../../../agent/submissions/[id]/panels/[panelId]/route")
        ).GET as PanelRouteHandler;

        const after = await freshClient.db.query.submissionRevisions.findFirst({
          where: (r: any, { eq: e }: any) => e(r.id, receipt.revisionId),
        });
        expect(after?.canonicalJson).toBe(before?.canonicalJson);
        expect(after?.integritySignature).toBe(before?.integritySignature);
        expect(Buffer.byteLength(after?.canonicalJson ?? "", "utf8")).toBe(
          Buffer.byteLength(before?.canonicalJson ?? "", "utf8"),
        );

        const detail = await buildSubmissionDetail(pkgId);
        expect(detail.ok).toBe(true);
        if (!detail.ok) throw new Error(`Unexpected detail failure: ${detail.reason}`);
        expect(detail.view.revision.integrityVerified).toBe(true);

        const panelResponse = await freshPanelGET(
          new Request(`http://localhost:3000/api/agent/submissions/${pkgId}/panels/${PANEL_ID}`, {
            headers: { Cookie: agent.cookie },
          }),
          { params: Promise.resolve({ id: pkgId, panelId: PANEL_ID }) },
        );
        expect(panelResponse.status).toBe(200);
        expect(Buffer.from(await panelResponse.arrayBuffer())).toEqual(PANEL_BYTES);

        // Restore the suite's handles for cleanup and subsequent cases.
        await loadModules();
      });

      it("round-trips a valid canonical snapshot larger than the MySQL TEXT ceiling", async () => {
        const pkgId = "pkg-large-canonical";
        const payload = createValidExportPayload(pkgId);
        payload.applicationBuild = { syntheticPadding: "Synthetic build padding ".repeat(4_000) };
        resign(payload);

        const payloadWithoutIntegrity = { ...payload } as Record<string, unknown>;
        delete payloadWithoutIntegrity.integrity;
        const expectedCanonical = canonicalStringify(payloadWithoutIntegrity);
        expect(Buffer.byteLength(expectedCanonical, "utf8")).toBeGreaterThan(65_535);

        const response = await finalizePOST(
          buildFinalizeRequest(payload, sellerCookie, "k-large-canonical"),
        );
        expect(response.status).toBe(200);

        const revision = await db.query.submissionRevisions.findFirst({
          where: (r: any, { eq: e }: any) => e(r.submissionId, pkgId),
        });
        expect(Buffer.byteLength(revision?.canonicalJson ?? "", "utf8")).toBe(
          Buffer.byteLength(expectedCanonical, "utf8"),
        );
        expect(sha256Hex(revision?.canonicalJson ?? "")).toBe(sha256Hex(expectedCanonical));
        expect(
          verifyRevision(revision?.canonicalJson ?? "", revision?.integritySignature ?? ""),
        ).toBe(true);
      });

      it("refuses a local-download-only export (transmission-truth boundary)", async () => {
        const payload = createValidExportPayload("pkg-local");
        (payload.boundary as { transmission: string }).transmission = "local-download-only";
        resign(payload);
        const response = await finalizePOST(buildFinalizeRequest(payload, sellerCookie, "k-local"));
        expect(response.status).toBe(400);
        expect(((await response.json()) as { error: string }).error).toContain(
          "agent-review-portal",
        );
      });

      it("rejects invalid package schema", async () => {
        const payload = createValidExportPayload("pkg-badschema") as any;
        delete payload.package.profile;
        resign(payload);
        expect(
          (await finalizePOST(buildFinalizeRequest(payload, sellerCookie, "k-badschema"))).status,
        ).toBe(400);
      });

      it("rejects a tampered integrity value", async () => {
        const payload = createValidExportPayload("pkg-tamper");
        payload.integrity.value = "b".repeat(64);
        const response = await finalizePOST(
          buildFinalizeRequest(payload, sellerCookie, "k-tamper"),
        );
        expect(response.status).toBe(400);
        expect(((await response.json()) as { error: string }).error).toContain(
          "Integrity value mismatch",
        );
      });

      it("preserves seller history snapshots without failing integrity", async () => {
        const payload = createValidExportPayload("pkg-snapshots");
        payload.package.sellerChangeHistory.push({
          changeId: "chg-1",
          sequence: 1,
          recordedAt: new Date().toISOString(),
          action: "draft_saved",
          detail: "Saved draft",
          categorySnapshot: {
            categoryId: "brandName",
            decision: "provided",
            expectedValue: "Test Brand",
          },
        } as any);
        resign(payload);
        // draft_saved after the run is non-material, so the package stays current.
        expect(
          (await finalizePOST(buildFinalizeRequest(payload, sellerCookie, "k-snap"))).status,
        ).toBe(200);
      });

      it("rejects a stale package (material edit after latest analysis)", async () => {
        const payload = createValidExportPayload("pkg-stale");
        payload.package.sellerChangeHistory.push({
          changeId: "chg-material",
          sequence: 1,
          recordedAt: new Date().toISOString(),
          action: "region_added",
          detail: "Added a region after analysis",
        } as any);
        resign(payload);
        const response = await finalizePOST(buildFinalizeRequest(payload, sellerCookie, "k-stale"));
        expect(response.status).toBe(400);
        expect(((await response.json()) as { error: string }).error).toContain("Stale");
      });

      it("rejects a not-ready analysis run", async () => {
        const payload = createValidExportPayload("pkg-notready");
        payload.package.analysisRuns[0].readiness = "needs_seller_review" as any;
        resign(payload);
        const response = await finalizePOST(
          buildFinalizeRequest(payload, sellerCookie, "k-notready"),
        );
        expect(response.status).toBe(400);
        expect(((await response.json()) as { error: string }).error).toContain("not ready");
      });

      it("rejects a forged server-provenance append token", async () => {
        const payload = createValidExportPayload("pkg-forged");
        const run = payload.package.analysisRuns[0].panelRuns[0];
        const parsed = JSON.parse(run.exportJson);
        parsed.appendToken = "forged-token-value";
        run.exportJson = JSON.stringify(parsed);
        resign(payload);
        const response = await finalizePOST(
          buildFinalizeRequest(payload, sellerCookie, "k-forged"),
        );
        expect(response.status).toBe(400);
        expect(((await response.json()) as { error: string }).error).toContain("provenance");
      });

      it("rejects a mismatched machine-result ID", async () => {
        const payload = createValidExportPayload("pkg-badmid");
        payload.package.analysisRuns[0].panelRuns[0].machineResultId = "c".repeat(64);
        resign(payload);
        const response = await finalizePOST(
          buildFinalizeRequest(payload, sellerCookie, "k-badmid"),
        );
        expect(response.status).toBe(400);
        expect(((await response.json()) as { error: string }).error).toContain("machine-result ID");
      });

      it("rejects a missing panel file", async () => {
        const response = await finalizePOST(
          buildFinalizeRequest(
            createValidExportPayload("pkg-nofile"),
            sellerCookie,
            "k-nofile",
            {},
          ),
        );
        expect(response.status).toBe(400);
        expect(((await response.json()) as { error: string }).error).toContain(
          "Missing uploaded file",
        );
      });

      it("rejects panel file size and checksum mismatches", async () => {
        const sizeReq = buildFinalizeRequest(
          createValidExportPayload("pkg-size"),
          sellerCookie,
          "k-size",
          {
            [PANEL_ID]: panelBlob(Buffer.from("a".repeat(500))),
          },
        );
        const sizeRes = await finalizePOST(sizeReq);
        expect(sizeRes.status).toBe(400);
        expect(((await sizeRes.json()) as { error: string }).error).toContain("size mismatch");

        const sumReq = buildFinalizeRequest(
          createValidExportPayload("pkg-sum"),
          sellerCookie,
          "k-sum",
          {
            [PANEL_ID]: panelBlob(corruptedPanelBytes()),
          },
        );
        const sumRes = await finalizePOST(sumReq);
        expect(sumRes.status).toBe(400);
        expect(((await sumRes.json()) as { error: string }).error).toContain("Checksum mismatch");
      });

      it("rejects an upload whose bytes are not a real image", async () => {
        // 70 non-image bytes: matches declared size, but the byte signature is
        // not a supported image, so it is refused before the checksum check.
        const notAnImage = Buffer.alloc(PANEL_BYTES.length, 0x20);
        const req = buildFinalizeRequest(
          createValidExportPayload("pkg-notimg"),
          sellerCookie,
          "k-notimg",
          {
            [PANEL_ID]: panelBlob(notAnImage),
          },
        );
        const res = await finalizePOST(req);
        expect(res.status).toBe(400);
        expect(((await res.json()) as { error: string }).error).toContain("not a supported image");
      });

      it("rejects a declared dimension that does not match the decoded image", async () => {
        const payload = createValidExportPayload("pkg-dim");
        payload.package.panels[0].width = 2; // real PNG is 1x1
        resign(payload);
        const res = await finalizePOST(buildFinalizeRequest(payload, sellerCookie, "k-dim"));
        expect(res.status).toBe(400);
        expect(((await res.json()) as { error: string }).error).toContain("Dimension mismatch");
      });

      it("ignores any client-supplied storage key and assigns a server-owned key", async () => {
        const pkgId = "pkg-clientkey";
        const payload = createValidExportPayload(pkgId) as any;
        // A malicious client injects a storage key; the shared parser strips it and
        // the server derives its own key regardless.
        payload.package.panels[0].storageKey = "evil/attacker-controlled/path";
        resign(payload);
        const response = await finalizePOST(
          buildFinalizeRequest(payload, sellerCookie, "k-clientkey"),
        );
        expect(response.status).toBe(200);
        const receipt = (await response.json()) as { revisionId: string };
        const panels = await db
          .select()
          .from(schema.submittedPanels)
          .where(eq(schema.submittedPanels.revisionId, receipt.revisionId));
        expect(panels[0].storageKey).toBe(panelStorageKey(pkgId, PANEL_ID, PANEL_SHA));
        expect(panels[0].storageKey).not.toContain("evil");
      });

      it("returns the same receipt on sequential idempotent retry", async () => {
        const payload = createValidExportPayload("pkg-idem");
        const first = await finalizePOST(buildFinalizeRequest(payload, sellerCookie, "k-idem"));
        expect(first.status).toBe(200);
        const r1 = (await first.json()) as { revisionId: string };
        const second = await finalizePOST(buildFinalizeRequest(payload, sellerCookie, "k-idem"));
        expect(second.status).toBe(200);
        const r2 = (await second.json()) as { revisionId: string };
        expect(r2.revisionId).toBe(r1.revisionId);
        const subs = await db
          .select()
          .from(schema.submissions)
          .where(eq(schema.submissions.id, "pkg-idem"));
        expect(subs).toHaveLength(1);
      });

      it("rejects a reused idempotency key with a different payload", async () => {
        const first = await finalizePOST(
          buildFinalizeRequest(createValidExportPayload("pkg-reuse-a"), sellerCookie, "k-reuse"),
        );
        expect(first.status).toBe(200);
        const second = await finalizePOST(
          buildFinalizeRequest(createValidExportPayload("pkg-reuse-b"), sellerCookie, "k-reuse"),
        );
        expect(second.status).toBe(400);
        expect(((await second.json()) as { error: string }).error).toContain(
          "different request payload",
        );
      });

      it("returns one receipt for simultaneous identical requests (concurrency)", async () => {
        const payload = createValidExportPayload("pkg-concurrent");
        const [a, b] = await Promise.all([
          finalizePOST(buildFinalizeRequest(payload, sellerCookie, "k-concurrent")),
          finalizePOST(buildFinalizeRequest(payload, sellerCookie, "k-concurrent")),
        ]);
        expect(a.status).toBe(200);
        expect(b.status).toBe(200);
        const ra = (await a.json()) as { revisionId: string };
        const rb = (await b.json()) as { revisionId: string };
        expect(ra.revisionId).toBe(rb.revisionId);
        const subs = await db
          .select()
          .from(schema.submissions)
          .where(eq(schema.submissions.id, "pkg-concurrent"));
        expect(subs).toHaveLength(1);
        const revs = await db
          .select()
          .from(schema.submissionRevisions)
          .where(eq(schema.submissionRevisions.submissionId, "pkg-concurrent"));
        expect(revs).toHaveLength(1);
      });

      it("conflicts (409) on duplicate package under a different key", async () => {
        const payload = createValidExportPayload("pkg-dup");
        expect(
          (await finalizePOST(buildFinalizeRequest(payload, sellerCookie, "k-dup-1"))).status,
        ).toBe(200);
        const second = await finalizePOST(buildFinalizeRequest(payload, sellerCookie, "k-dup-2"));
        expect(second.status).toBe(409);
        const subs = await db
          .select()
          .from(schema.submissions)
          .where(eq(schema.submissions.id, "pkg-dup"));
        expect(subs).toHaveLength(1);
      });

      it("rolls back leaving no partial submission when the transaction fails", async () => {
        const payload = createValidExportPayload("pkg-rollback");
        // Force a mid-transaction failure: an invalid recordedAt breaks the
        // machine-snapshot insert after the submission/revision rows are staged.
        payload.package.analysisRuns[0].recordedAt = "not-a-valid-date";
        resign(payload);
        const response = await finalizePOST(
          buildFinalizeRequest(payload, sellerCookie, "k-rollback"),
        );
        expect(response.status).toBeGreaterThanOrEqual(400);
        const subs = await db
          .select()
          .from(schema.submissions)
          .where(eq(schema.submissions.id, "pkg-rollback"));
        expect(subs).toHaveLength(0);
        const idem = await db
          .select()
          .from(schema.idempotencyRecords)
          .where(eq(schema.idempotencyRecords.key, `finalize:${sellerUserId}:k-rollback`));
        expect(idem).toHaveLength(0);
      });

      it("enforces submission immutability while allowing status/version mutation", async () => {
        const pkgId = "pkg-immut";
        expect(
          (
            await finalizePOST(
              buildFinalizeRequest(createValidExportPayload(pkgId), sellerCookie, "k-immut"),
            )
          ).status,
        ).toBe(200);

        // Permitted: status + version transition.
        if (isSQLite) {
          db.run(
            sql`UPDATE submissions SET current_status = 'in_agent_review', version = 2 WHERE id = ${pkgId}`,
          );
        } else {
          await db.execute(
            sql`UPDATE submissions SET current_status = 'in_agent_review', version = 2 WHERE id = ${pkgId}`,
          );
        }
        const sub = await db.query.submissions.findFirst({
          where: (s: any, { eq: e }: any) => e(s.id, pkgId),
        });
        expect(sub?.currentStatus).toBe("in_agent_review");
        expect(sub?.version).toBe(2);

        // Forbidden: mutating the immutable creator_id.
        if (isSQLite) {
          expect(() =>
            db.run(sql`UPDATE submissions SET creator_id = 'other' WHERE id = ${pkgId}`),
          ).toThrow();
        } else {
          await expect(
            db.execute(sql`UPDATE submissions SET creator_id = 'other' WHERE id = ${pkgId}`),
          ).rejects.toThrow();
        }

        // Forbidden: revisions are append-only.
        const rev = await db.query.submissionRevisions.findFirst({
          where: (r: any, { eq: e }: any) => e(r.submissionId, pkgId),
        });
        if (isSQLite) {
          expect(() =>
            db.run(
              sql`UPDATE submission_revisions SET canonical_json = '[]' WHERE id = ${rev?.id}`,
            ),
          ).toThrow();
        } else {
          await expect(
            db.execute(
              sql`UPDATE submission_revisions SET canonical_json = '[]' WHERE id = ${rev?.id}`,
            ),
          ).rejects.toThrow();
        }
      });
    });

    // ---- Owner-only status ----
    describe("Owner-only status", () => {
      const submissionId = "pkg-status";
      let ownerCookie: string;
      let otherCookie: string;

      beforeEach(async () => {
        const owner = await provisionSeller("owner@test.com");
        ownerCookie = owner.cookie;
        otherCookie = (await provisionSeller("other@test.com")).cookie;
        const response = await finalizePOST(
          buildFinalizeRequest(
            createValidExportPayload(submissionId, "owner@test.com"),
            ownerCookie,
            "k-status-setup",
          ),
        );
        expect(response.status).toBe(200);
      });

      it("lets the owner read truthful status", async () => {
        const request = new Request(
          `http://localhost:3000/api/package/submit/status/${submissionId}`,
          {
            headers: { Cookie: ownerCookie },
          },
        );
        const response = await statusGET(request, {
          params: Promise.resolve({ id: submissionId }),
        });
        expect(response.status).toBe(200);
        const status = (await response.json()) as {
          submissionId: string;
          currentStatus: string;
          revisions: unknown[];
        };
        expect(status.submissionId).toBe(submissionId);
        expect(status.currentStatus).toBe("waiting_for_agent_review");
        expect(status.revisions).toHaveLength(1);
      });

      it("returns 404 for a non-owner (no existence leak)", async () => {
        const request = new Request(
          `http://localhost:3000/api/package/submit/status/${submissionId}`,
          {
            headers: { Cookie: otherCookie },
          },
        );
        const response = await statusGET(request, {
          params: Promise.resolve({ id: submissionId }),
        });
        expect(response.status).toBe(404);
      });

      it("returns 404 identically for a genuinely missing submission", async () => {
        const request = new Request(
          `http://localhost:3000/api/package/submit/status/does-not-exist`,
          {
            headers: { Cookie: otherCookie },
          },
        );
        const response = await statusGET(request, {
          params: Promise.resolve({ id: "does-not-exist" }),
        });
        expect(response.status).toBe(404);
      });

      it("fails closed with a controlled 409 when revision HMAC verification fails", async () => {
        // Tamper the stored canonical json bypassing the immutability trigger.
        if (isSQLite) {
          db.run(sql`DROP TRIGGER IF EXISTS prevent_revisions_update`);
        } else {
          await db.execute(sql`DROP TRIGGER IF EXISTS prevent_revisions_update`);
        }
        const rev = await db.query.submissionRevisions.findFirst({
          where: (r: any, { eq: e }: any) => e(r.submissionId, submissionId),
        });
        if (isSQLite) {
          db.run(
            sql`UPDATE submission_revisions SET canonical_json = '{"tampered":true}' WHERE id = ${rev?.id}`,
          );
        } else {
          await db.execute(
            sql`UPDATE submission_revisions SET canonical_json = '{"tampered":true}' WHERE id = ${rev?.id}`,
          );
        }
        const request = new Request(
          `http://localhost:3000/api/package/submit/status/${submissionId}`,
          {
            headers: { Cookie: ownerCookie },
          },
        );
        const response = await statusGET(request, {
          params: Promise.resolve({ id: submissionId }),
        });
        expect(response.status).toBe(409);
        expect((await response.json()) as unknown).toMatchObject({
          error: { code: "REVISION_INTEGRITY_FAILED" },
        });
      });
    });
  });
}
