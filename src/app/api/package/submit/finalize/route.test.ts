// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";

// Configure database environment variables before importing client/auth modules
const TEST_DB_FILE = ".local/test-integration.db";

vi.hoisted(() => {
  process.env.DATABASE_URL = `file:.local/test-integration.db`;
  process.env.BETTER_AUTH_SECRET = "super-secret-test-better-auth-key-1234567890";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
});

import { createTestSqliteDb } from "../../../../../../tests/integration/test-db-setup";
import { issueAppendToken } from "@/server/append-token";
import { canonicalizeJson } from "@/lib/canonical";
import { canonicalStringify } from "@/pipeline/export/json/canonical-stringify";

let db: any;
let schema: any;
let auth: any;
let finalizePOST: any;
let statusGET: any;
let authPOST: any;
let verifyRevision: any;

// Helper to generate a completely valid, signed SellerPackageExport payload
function createValidExportPayload(packageId: string, email: string = "seller@test.com") {
  const panelId = "panel-front-123";
  const sourceSha = "a".repeat(64);

  const observations = {
    provenance: {
      artifactRef: `package-panel-${panelId}`,
      derivativeSha256: sourceSha,
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

  const machinePayload = {
    schemaVersion: "package-panel-machine-record.v1",
    packageId,
    panel: {
      panelId,
      order: 0,
      role: "front",
      displayName: "front.png",
      mediaType: "image/png",
      byteSize: 1024,
      checksumSha256: sourceSha,
      width: 800,
      height: 600,
      rotation: 0,
      storageKey: "panels/front.png",
    },
    sourceSha256: sourceSha,
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
  const integrityVal = createHash("sha256").update(canonicalStringify(machinePayload)).digest("hex");

  const tokenRes = issueAppendToken(machineResultId);
  const appendToken = tokenRes.ok ? tokenRes.token : "dummy-token";

  const exportJson = canonicalStringify({
    ...machinePayload,
    appendToken,
    integrity: {
      algorithm: "sha256",
      scope: "canonical-package-panel-machine-payload",
      value: integrityVal,
    },
  });

  const analysisRun = {
    analysisRunId: "run-123",
    sequence: 1,
    sellerChangeSequence: 0,
    recordedAt: new Date().toISOString(),
    panelRuns: [
      {
        panelId,
        machineResultId,
        exportJson,
        observations,
      },
    ],
    categories: [
      {
        categoryId: "brandName",
        state: "clearly_readable",
        observedValue: "Test Brand",
        supportingPanelIds: [panelId],
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
    profile: {
      id: "wine-label-requirements",
      version: "1.0.0",
    },
    panels: [
      {
        panelId,
        order: 0,
        role: "front" as const,
        displayName: "front.png",
        mediaType: "image/png",
        byteSize: 1024,
        checksumSha256: sourceSha,
        width: 800,
        height: 600,
        rotation: 0 as const,
        storageKey: "panels/front.png",
      },
    ],
    categories: [
      {
        categoryId: "brandName",
        decision: "provided" as const,
        expectedValue: "Test Brand",
        regions: [
          {
            regionId: "reg-brand-1",
            categoryId: "brandName",
            panelId,
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
    sellerChangeHistory: [],
    analysisRuns: [analysisRun],
  };

  const payload: any = {
    exportSchemaVersion: "seller-agent-package.v1",
    exportType: "seller-prepared-agent-package",
    boundary: {
      transmission: "local-download-only",
      governmentApproval: false,
      statement: "This statement is true.",
    },
    submittedBy: email,
    submittedAt: new Date().toISOString(),
    receivingAgent: "test-agent",
    package: draft,
    readiness: "ready_for_agent_submission",
    applicationBuild: {},
  };

  const canonicalString = canonicalizeJson(payload);
  const hash = createHash("sha256").update(canonicalString).digest("hex");

  return {
    ...payload,
    integrity: {
      algorithm: "sha256",
      scope: "canonical-package-payload",
      value: hash,
    },
  };
}

describe("First Bounded Slice Integration Tests", () => {
  beforeAll(async () => {
    // 1. Recreate the database file before Drizzle opens its connection!
    const sqlite = createTestSqliteDb(TEST_DB_FILE, true);
    sqlite.close();

    // 2. Now dynamically import the modules so the connection opens correctly!
    const clientMod = await import("@/db/client");
    db = clientMod.db;
    schema = clientMod.schema;

    const authMod = await import("@/lib/auth");
    auth = authMod.auth;

    const finalizeMod = await import("./route");
    finalizePOST = finalizeMod.POST;

    const statusMod = await import("../status/[id]/route");
    statusGET = statusMod.GET;

    const authRouteMod = await import("../../../auth/[...all]/route");
    authPOST = authRouteMod.POST;

    const integrityMod = await import("@/lib/integrity");
    verifyRevision = integrityMod.verifyRevision;
  });

  beforeEach(async () => {
    // Drop triggers temporarily to allow database cleanup between tests
    db.run(sql`DROP TRIGGER IF EXISTS prevent_submissions_update`);
    db.run(sql`DROP TRIGGER IF EXISTS prevent_submissions_delete`);
    db.run(sql`DROP TRIGGER IF EXISTS prevent_revisions_update`);
    db.run(sql`DROP TRIGGER IF EXISTS prevent_revisions_delete`);

    await db.delete(schema.idempotencyRecords);
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

    // Recreate triggers to ensure they are active during test execution
    db.run(sql`
      CREATE TRIGGER IF NOT EXISTS prevent_submissions_update
      BEFORE UPDATE ON submissions
      BEGIN
        SELECT RAISE(FAIL, 'Submissions are immutable and cannot be updated.');
      END;
    `);

    db.run(sql`
      CREATE TRIGGER IF NOT EXISTS prevent_submissions_delete
      BEFORE DELETE ON submissions
      BEGIN
        SELECT RAISE(FAIL, 'Submissions are immutable and cannot be deleted.');
      END;
    `);

    db.run(sql`
      CREATE TRIGGER IF NOT EXISTS prevent_revisions_update
      BEFORE UPDATE ON submission_revisions
      BEGIN
        SELECT RAISE(FAIL, 'Submission revisions are immutable and cannot be updated.');
      END;
    `);

    db.run(sql`
      CREATE TRIGGER IF NOT EXISTS prevent_revisions_delete
      BEFORE DELETE ON submission_revisions
      BEGIN
        SELECT RAISE(FAIL, 'Submission revisions are immutable and cannot be deleted.');
      END;
    `);
  });

  describe("Public Signup Restriction", () => {
    it("returns 403 Forbidden when attempting public seller registration", async () => {
      const request = new Request("http://localhost:3000/api/auth/signup/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "malicious@test.com",
          password: "SecurePassword123!",
          name: "Attacker",
        }),
      });

      const response = await authPOST(request);
      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toContain("disabled");
    });
  });

  describe("Credentials Ingestion & Session Flow", () => {
    it("creates a provisioned seller and allows login to obtain session cookies", async () => {
      const seller = await auth.api.signUpEmail({
        body: {
          email: "seller@test.com",
          password: "SecurePassword123!",
          name: "Test Seller",
        },
      });
      expect(seller.user.id).toBeDefined();

      const loginRes = await auth.api.signInEmail({
        body: {
          email: "seller@test.com",
          password: "SecurePassword123!",
        },
        asResponse: true,
      });

      expect(loginRes.status).toBe(200);
      const cookie = loginRes.headers.get("set-cookie");
      expect(cookie).toContain("better-auth.session_token");
    });
  });

  describe("Atomic Finalize Submission Endpoint", () => {
    let sessionCookie: string;
    let sellerUserId: string;

    beforeEach(async () => {
      await auth.api.signUpEmail({
        body: {
          email: "seller@test.com",
          password: "SecurePassword123!",
          name: "Test Seller",
        },
      });

      const loginRes = await auth.api.signInEmail({
        body: {
          email: "seller@test.com",
          password: "SecurePassword123!",
        },
        asResponse: true,
      });
      sessionCookie = loginRes.headers.get("set-cookie") || "";
      const loginData = await loginRes.json();
      sellerUserId = loginData.user.id;
    });

    it("requires X-Idempotency-Key header", async () => {
      const request = new Request("http://localhost:3000/api/package/submit/finalize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie,
        },
        body: JSON.stringify(createValidExportPayload("pkg-123")),
      });

      const response = await finalizePOST(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("Idempotency");
    });

    it("rejects unauthenticated requests", async () => {
      const request = new Request("http://localhost:3000/api/package/submit/finalize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Idempotency-Key": "idempotency-key-1",
        },
        body: JSON.stringify(createValidExportPayload("pkg-123")),
      });

      const response = await finalizePOST(request);
      expect(response.status).toBe(401);
    });

    it("commits submission atomically and returns a durable receipt", async () => {
      const pkgId = "pkg-finalize-test";
      const payload = createValidExportPayload(pkgId);
      const request = new Request("http://localhost:3000/api/package/submit/finalize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie,
          "X-Idempotency-Key": "idempotency-key-2",
        },
        body: JSON.stringify(payload),
      });

      const response = await finalizePOST(request);
      expect(response.status).toBe(200);

      const receipt = await response.json();
      expect(receipt.submissionId).toBe(pkgId);
      expect(receipt.revisionNumber).toBe(1);
      expect(receipt.status).toBe("waiting_for_agent_review");
      expect(receipt.integritySignature).toContain("v1:");

      const sub = await db.query.submissions.findFirst({ where: (s: any, { eq }: any) => eq(s.id, pkgId) });
      expect(sub).toBeDefined();
      expect(sub.currentStatus).toBe("waiting_for_agent_review");
      expect(sub.creatorId).toBe(sellerUserId);

      const rev = await db.query.submissionRevisions.findFirst({ where: (r: any, { eq }: any) => eq(r.submissionId, pkgId) });
      expect(rev).toBeDefined();
      expect(rev.integritySignature).toBe(receipt.integritySignature);

      const isValid = verifyRevision(rev.canonicalJson, rev.integritySignature);
      expect(isValid).toBe(true);
    });

    it("rejects payload with tampered integrity signature", async () => {
      const pkgId = "pkg-tampered-test";
      const payload = createValidExportPayload(pkgId);
      payload.integrity.value = "b".repeat(64); // Tamper with signature

      const request = new Request("http://localhost:3000/api/package/submit/finalize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie,
          "X-Idempotency-Key": "idemp-tamper-key",
        },
        body: JSON.stringify(payload),
      });

      const response = await finalizePOST(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("Integrity value mismatch");
    });

    it("rejects payload with forged server analysis provenance token", async () => {
      const pkgId = "pkg-forged-provenance";
      const payload = createValidExportPayload(pkgId);

      // Force alter the panel run exportJson's appendToken to invalid
      const run = payload.package.analysisRuns[0].panelRuns[0];
      const parsedExport = JSON.parse(run.exportJson);
      parsedExport.appendToken = "forged-or-expired-token-value";
      run.exportJson = JSON.stringify(parsedExport);

      // Re-sign payload integrity
      const payloadWithoutIntegrity = { ...payload } as any;
      delete payloadWithoutIntegrity.integrity;
      const canonicalString = canonicalizeJson(payloadWithoutIntegrity);
      payload.integrity.value = createHash("sha256").update(canonicalString).digest("hex");

      const request = new Request("http://localhost:3000/api/package/submit/finalize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie,
          "X-Idempotency-Key": "idemp-forged-key",
        },
        body: JSON.stringify(payload),
      });

      const response = await finalizePOST(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("Invalid server provenance token");
    });

    it("enforces table immutability via database-level triggers", async () => {
      const pkgId = "pkg-immut-test";
      const payload = createValidExportPayload(pkgId);
      const request = new Request("http://localhost:3000/api/package/submit/finalize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie,
          "X-Idempotency-Key": "idemp-immut-key",
        },
        body: JSON.stringify(payload),
      });

      const response = await finalizePOST(request);
      expect(response.status).toBe(200);

      // 1. UPDATE on submissions should fail
      expect(() => {
        db.run(sql`UPDATE submissions SET current_status = 'tampered' WHERE id = ${pkgId}`);
      }).toThrow();

      // 2. DELETE on submissions should fail
      expect(() => {
        db.run(sql`DELETE FROM submissions WHERE id = ${pkgId}`);
      }).toThrow();

      // 3. UPDATE on submission revisions should fail
      const rev = await db.query.submissionRevisions.findFirst({
        where: (r: any, { eq }: any) => eq(r.submissionId, pkgId),
      });
      expect(rev).toBeDefined();

      expect(() => {
        db.run(sql`UPDATE submission_revisions SET canonical_json = '[]' WHERE id = ${rev.id}`);
      }).toThrow();

      // 4. DELETE on submission revisions should fail
      expect(() => {
        db.run(sql`DELETE FROM submission_revisions WHERE id = ${rev.id}`);
      }).toThrow();
    });

    it("enforces scoped request idempotency and prevents payload tampering", async () => {
      const pkgId = "pkg-idemp-test";
      const payload = createValidExportPayload(pkgId);
      const idempotencyKey = "key-idempotency-3";

      const request1 = new Request("http://localhost:3000/api/package/submit/finalize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie,
          "X-Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      const response1 = await finalizePOST(request1);
      expect(response1.status).toBe(200);
      const receipt1 = await response1.json();

      const request2 = new Request("http://localhost:3000/api/package/submit/finalize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie,
          "X-Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload),
      });

      const response2 = await finalizePOST(request2);
      expect(response2.status).toBe(200);
      const receipt2 = await response2.json();
      expect(receipt2.receiptId).toBe(receipt1.receiptId);
    });
  });

  describe("Owner-Only Status Endpoint", () => {
    let sessionCookie1: string;
    let sessionCookie2: string;
    let submissionId = "pkg-status-test";

    beforeEach(async () => {
      await auth.api.signUpEmail({
        body: { email: "seller1@test.com", password: "Password123!", name: "Seller 1" },
      });
      const login1 = await auth.api.signInEmail({
        body: { email: "seller1@test.com", password: "Password123!" },
        asResponse: true,
      });
      sessionCookie1 = login1.headers.get("set-cookie") || "";

      await finalizePOST(
        new Request("http://localhost:3000/api/package/submit/finalize", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Cookie: sessionCookie1,
            "X-Idempotency-Key": "idemp-status-key",
          },
          body: JSON.stringify(createValidExportPayload(submissionId)),
        })
      );

      await auth.api.signUpEmail({
        body: { email: "seller2@test.com", password: "Password123!", name: "Seller 2" },
      });
      const login2 = await auth.api.signInEmail({
        body: { email: "seller2@test.com", password: "Password123!" },
        asResponse: true,
      });
      sessionCookie2 = login2.headers.get("set-cookie") || "";
    });

    it("allows the owner seller to view status", async () => {
      const request = new Request(`http://localhost:3000/api/package/submit/status/${submissionId}`, {
        method: "GET",
        headers: { Cookie: sessionCookie1 },
      });

      const params = Promise.resolve({ id: submissionId });
      const response = await statusGET(request, { params });
      expect(response.status).toBe(200);

      const status = await response.json();
      expect(status.submissionId).toBe(submissionId);
      expect(status.currentStatus).toBe("waiting_for_agent_review");
      expect(status.revisions).toHaveLength(1);
    });

    it("rejects other sellers from viewing another owner's status", async () => {
      const request = new Request(`http://localhost:3000/api/package/submit/status/${submissionId}`, {
        method: "GET",
        headers: { Cookie: sessionCookie2 },
      });

      const params = Promise.resolve({ id: submissionId });
      const response = await statusGET(request, { params });
      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toContain("restricted to owner");
    });

    it("rejects status reads if database data fails integrity validation", async () => {
      // 1. Manually disable SQLite triggers for a moment using a separate DB bypass connection to tamper with the DB revision record,
      // or directly execute UPDATE bypassing trigger if we can.
      // Wait, SQLite triggers prevent update, so direct updates fail.
      // To test status verification, we can temporarily delete the triggers or update using a separate connection.
      // Let's drop the triggers temporarily to simulate db tampering, modify canonicalJson, then recreate triggers.
      db.run(sql`DROP TRIGGER prevent_revisions_update`);
      
      const rev = await db.query.submissionRevisions.findFirst({
        where: (r: any, { eq }: any) => eq(r.submissionId, submissionId),
      });
      
      db.run(sql`
        UPDATE submission_revisions 
        SET canonical_json = '{"tampered": true}' 
        WHERE id = ${rev.id}
      `);

      db.run(sql`
        CREATE TRIGGER prevent_revisions_update
        BEFORE UPDATE ON submission_revisions
        BEGIN
          SELECT RAISE(FAIL, 'Submission revisions are immutable and cannot be updated.');
        END;
      `);

      // 2. Request status again
      const request = new Request(`http://localhost:3000/api/package/submit/status/${submissionId}`, {
        method: "GET",
        headers: { Cookie: sessionCookie1 },
      });

      const params = Promise.resolve({ id: submissionId });
      const response = await statusGET(request, { params });
      
      // Expected: Database integrity check fails and returns 500 error!
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toContain("integrity check failed");
    });
  });
});
