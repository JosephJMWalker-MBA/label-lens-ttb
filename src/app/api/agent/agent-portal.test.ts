// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- integration test drives loosely-typed dual-dialect Drizzle handles and forged requests */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";

const TEST_DB_FILE = ".local/test-agent-portal.db";
const RUN_MYSQL_TESTS = process.env.RUN_MYSQL_TESTS === "1";

vi.hoisted(() => {
  process.env.BETTER_AUTH_SECRET ||= "super-secret-test-better-auth-key-1234567890";
  process.env.BETTER_AUTH_URL ||= "http://localhost:3000";
  process.env.LABEL_LENS_INTEGRITY_SECRET ||= "test-only-integrity-secret-at-least-32-chars";
  if (process.env.RUN_MYSQL_TESTS !== "1") {
    process.env.DATABASE_URL = "file:.local/test-agent-portal.db";
  }
});

import { createTestSqliteDb } from "../../../../tests/integration/test-db-setup";
import { signRevision } from "@/lib/integrity";
import { panelStorageKey, persistPanelAsset } from "@/lib/panel-storage";

const MYSQL_DATABASE_URL = process.env.DATABASE_URL;
if (RUN_MYSQL_TESTS && (!MYSQL_DATABASE_URL || !/^mysql2?:\/\//.test(MYSQL_DATABASE_URL))) {
  throw new Error("RUN_MYSQL_TESTS=1 requires a mysql:// DATABASE_URL");
}

const PANEL_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

type RouteHandler = (request: Request, ctx?: any) => Promise<Response>;

const DIALECTS = RUN_MYSQL_TESTS ? (["mysql"] as const) : (["sqlite"] as const);

for (const dialect of DIALECTS) {
  describe(`Agent portal authorization (${dialect})`, () => {
    let db: any;
    let schema: any;
    let isSQLite: boolean;
    let auth: any;
    let queueGET: RouteHandler;
    let detailGET: RouteHandler;
    let panelGET: RouteHandler;

    async function loadModules() {
      vi.resetModules();
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
      queueGET = (await import("./submissions/route")).GET as RouteHandler;
      detailGET = (await import("./submissions/[id]/route")).GET as RouteHandler;
      panelGET = (await import("./submissions/[id]/panels/[panelId]/route")).GET as RouteHandler;
    }

    async function dropTriggers() {
      for (const name of [
        "prevent_submissions_update",
        "prevent_submissions_delete",
        "prevent_revisions_update",
        "prevent_revisions_delete",
      ]) {
        if (isSQLite) db.run(sql.raw(`DROP TRIGGER IF EXISTS ${name}`));
        else await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${name}`));
      }
    }

    async function clearTables() {
      await dropTriggers();
      for (const table of [
        schema.idempotencyRecords,
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

    async function provision(email: string, role: "seller" | "agent" | "admin") {
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
      return { cookie, userId: data.user.id };
    }

    async function seedSubmission(
      creatorId: string,
      opts: {
        id?: string;
        status?: string;
        isDemo?: boolean;
        createdAt?: Date;
        writeAsset?: boolean;
      } = {},
    ) {
      const id = opts.id ?? `pkg-${randomUUID().slice(0, 8)}`;
      const status = opts.status ?? "waiting_for_agent_review";
      const createdAt = opts.createdAt ?? new Date();
      const revisionId = randomUUID();
      const panelId = `panel-${id}`;
      const checksum = "a".repeat(64);
      const storageKey = panelStorageKey(id, panelId, checksum);
      const canonicalJson = JSON.stringify({ submissionId: id, revision: 1 });
      const signature = signRevision(canonicalJson);

      await db.insert(schema.submissions).values({
        id,
        creatorId,
        currentStatus: status,
        isDemo: opts.isDemo ?? false,
        version: 1,
        createdAt,
        updatedAt: createdAt,
      });
      await db.insert(schema.submissionRevisions).values({
        id: revisionId,
        submissionId: id,
        revisionNumber: 1,
        profileId: "wine-label-requirements",
        profileVersion: "1.0.0",
        submittedBy: "seller@test.com",
        submittedAt: createdAt,
        canonicalJson,
        integritySignature: signature,
      });
      await db.insert(schema.submittedPanels).values({
        id: panelId,
        revisionId,
        role: "front",
        displayName: "front.png",
        mediaType: "image/png",
        byteSize: PANEL_BYTES.length,
        checksumSha256: checksum,
        width: 1,
        height: 1,
        rotation: 0,
        storageKey,
      });
      await db.insert(schema.sellerEvidenceSnapshots).values({
        id: randomUUID(),
        revisionId,
        categoryId: "brandName",
        decision: "provided",
        expectedValue: "Test Brand",
        regions: JSON.stringify([]),
      });
      await db.insert(schema.machineAnalysisSnapshots).values({
        id: randomUUID(),
        revisionId,
        analysisRunId: "run-1",
        sequence: 1,
        panelRuns: JSON.stringify([{ panelId, machineResultId: "m1", observations: {} }]),
        categories: JSON.stringify([]),
        readiness: "ready_for_agent_submission",
        recordedAt: createdAt,
      });
      await db.insert(schema.submissionStatusEvents).values({
        id: randomUUID(),
        submissionId: id,
        status,
        actorId: creatorId,
        actorRole: "seller",
        reasonComment: "seeded",
        recordedAt: createdAt,
      });
      if (opts.writeAsset ?? true) {
        persistPanelAsset(storageKey, PANEL_BYTES);
      }
      return { id, panelId, revisionId };
    }

    function req(url: string, cookie = "", extraHeaders: Record<string, string> = {}) {
      return new Request(`http://localhost:3000${url}`, {
        headers: { Cookie: cookie, ...extraHeaders },
      });
    }

    beforeAll(loadModules);
    beforeEach(clearTables);

    describe("queue API authorization", () => {
      it("rejects anonymous access with 401", async () => {
        expect((await queueGET(req("/api/agent/submissions"))).status).toBe(401);
      });

      it("rejects sellers with 403 (and ignores a forged role header/body)", async () => {
        const seller = await provision("seller@test.com", "seller");
        const res = await queueGET(
          req("/api/agent/submissions", seller.cookie, {
            "x-role": "agent",
            "x-user-role": "admin",
          }),
        );
        expect(res.status).toBe(403);
      });

      it("allows an agent and returns a controlled view model with no secrets", async () => {
        const agent = await provision("agent@test.com", "agent");
        const seller = await provision("seller@test.com", "seller");
        await seedSubmission(seller.userId, { status: "waiting_for_agent_review" });

        const res = await queueGET(req("/api/agent/submissions", agent.cookie));
        expect(res.status).toBe(200);
        const body = await res.json();
        const raw = JSON.stringify(body);
        expect(body.items.length).toBe(1);
        expect(body.items[0].submitter.displayName).toBeTruthy();
        expect(body.filter).toBe("waiting");
        // No secrets/paths/canonical leakage.
        expect(raw).not.toMatch(
          /storageKey|storage_key|canonicalJson|canonical_json|integritySignature|\.local\/storage/,
        );
      });

      it("separates demo from real and sorts oldest-first with a stable tie-breaker", async () => {
        const agent = await provision("agent@test.com", "agent");
        const seller = await provision("seller@test.com", "seller");
        const older = new Date(Date.now() - 60_000);
        const newer = new Date(Date.now() - 10_000);
        await seedSubmission(seller.userId, { id: "pkg-real-new", createdAt: newer });
        await seedSubmission(seller.userId, { id: "pkg-real-old", createdAt: older });
        await seedSubmission(seller.userId, { id: "pkg-demo", isDemo: true });

        const waiting = await (
          await queueGET(req("/api/agent/submissions?filter=waiting", agent.cookie))
        ).json();
        expect(waiting.items.map((i: any) => i.submissionId)).toEqual([
          "pkg-real-old",
          "pkg-real-new",
        ]);
        expect(waiting.items.every((i: any) => i.isDemo === false)).toBe(true);

        const demo = await (
          await queueGET(req("/api/agent/submissions?filter=demo", agent.cookie))
        ).json();
        expect(demo.items.map((i: any) => i.submissionId)).toEqual(["pkg-demo"]);
      });

      it("falls back to the waiting filter for unknown/injection-like filter values", async () => {
        const agent = await provision("agent@test.com", "agent");
        const res = await queueGET(
          req(
            `/api/agent/submissions?filter=${encodeURIComponent("waiting'; DROP TABLE submissions;--")}`,
            agent.cookie,
          ),
        );
        const body = await res.json();
        expect(body.filter).toBe("waiting");
      });
    });

    describe("detail API authorization", () => {
      it("enforces agent-only access and safe not-found behavior", async () => {
        const agent = await provision("agent@test.com", "agent");
        const seller = await provision("seller@test.com", "seller");
        const { id } = await seedSubmission(seller.userId);

        expect(
          (
            await detailGET(req(`/api/agent/submissions/${id}`), {
              params: Promise.resolve({ id }),
            })
          ).status,
        ).toBe(401);
        expect(
          (
            await detailGET(req(`/api/agent/submissions/${id}`, seller.cookie), {
              params: Promise.resolve({ id }),
            })
          ).status,
        ).toBe(403);

        const ok = await detailGET(req(`/api/agent/submissions/${id}`, agent.cookie), {
          params: Promise.resolve({ id }),
        });
        expect(ok.status).toBe(200);
        const view = await ok.json();
        expect(view.revision.integrityVerified).toBe(true);
        expect(view.sellerEvidence).toBeDefined();
        expect(view.machineAnalysis).toBeDefined();
        expect(JSON.stringify(view)).not.toMatch(/storageKey|canonical_json|\.local\/storage/);

        // Malformed and missing ids both return 404.
        expect(
          (
            await detailGET(req(`/api/agent/submissions/bad%20id`, agent.cookie), {
              params: Promise.resolve({ id: "bad id" }),
            })
          ).status,
        ).toBe(404);
        expect(
          (
            await detailGET(req(`/api/agent/submissions/pkg-missing`, agent.cookie), {
              params: Promise.resolve({ id: "pkg-missing" }),
            })
          ).status,
        ).toBe(404);
      });

      it("fails closed (500) when the stored revision integrity does not verify", async () => {
        const agent = await provision("agent@test.com", "agent");
        const seller = await provision("seller@test.com", "seller");
        const { id } = await seedSubmission(seller.userId);

        // Tamper the canonical json bypassing the immutability trigger.
        if (isSQLite) {
          db.run(sql`DROP TRIGGER IF EXISTS prevent_revisions_update`);
          db.run(
            sql`UPDATE submission_revisions SET canonical_json = '{"tampered":true}' WHERE submission_id = ${id}`,
          );
        } else {
          await db.execute(sql`DROP TRIGGER IF EXISTS prevent_revisions_update`);
          await db.execute(
            sql`UPDATE submission_revisions SET canonical_json = '{"tampered":true}' WHERE submission_id = ${id}`,
          );
        }
        const res = await detailGET(req(`/api/agent/submissions/${id}`, agent.cookie), {
          params: Promise.resolve({ id }),
        });
        expect(res.status).toBe(500);
      });
    });

    describe("panel asset authorization", () => {
      it("streams to agents with nosniff, denies others, and blocks cross-submission/traversal access", async () => {
        const agent = await provision("agent@test.com", "agent");
        const seller = await provision("seller@test.com", "seller");
        const a = await seedSubmission(seller.userId, { id: "pkg-a" });
        const b = await seedSubmission(seller.userId, { id: "pkg-b" });

        const params = (id: string, panelId: string) => ({
          params: Promise.resolve({ id, panelId }),
        });

        // Anonymous → 401, seller → 403.
        expect(
          (
            await panelGET(
              req(`/api/agent/submissions/pkg-a/panels/${a.panelId}`),
              params("pkg-a", a.panelId),
            )
          ).status,
        ).toBe(401);
        expect(
          (
            await panelGET(
              req(`/api/agent/submissions/pkg-a/panels/${a.panelId}`, seller.cookie),
              params("pkg-a", a.panelId),
            )
          ).status,
        ).toBe(403);

        // Agent → 200 image with nosniff.
        const ok = await panelGET(
          req(`/api/agent/submissions/pkg-a/panels/${a.panelId}`, agent.cookie),
          params("pkg-a", a.panelId),
        );
        expect(ok.status).toBe(200);
        expect(ok.headers.get("content-type")).toBe("image/png");
        expect(ok.headers.get("x-content-type-options")).toBe("nosniff");

        // Panel B under submission A → 404 (cross-submission).
        expect(
          (
            await panelGET(
              req(`/api/agent/submissions/pkg-a/panels/${b.panelId}`, agent.cookie),
              params("pkg-a", b.panelId),
            )
          ).status,
        ).toBe(404);

        // Path-traversal-shaped panelId → 404.
        expect(
          (
            await panelGET(
              req(`/api/agent/submissions/pkg-a/panels/..`, agent.cookie),
              params("pkg-a", "../../etc/passwd"),
            )
          ).status,
        ).toBe(404);
      });
    });

    describe("session revocation", () => {
      it("loses access immediately after the session is revoked", async () => {
        const agent = await provision("agent@test.com", "agent");
        expect((await queueGET(req("/api/agent/submissions", agent.cookie))).status).toBe(200);

        // Revoke by deleting the session row (equivalent to sign-out server-side).
        await db.delete(schema.sessions);
        expect((await queueGET(req("/api/agent/submissions", agent.cookie))).status).toBe(401);
      });
    });
  });
}
