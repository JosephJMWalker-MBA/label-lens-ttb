// @vitest-environment node
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Configure database environment variables before importing client/auth modules
const TEST_DB_FILE = ".local/test-integration.db";

vi.hoisted(() => {
  process.env.DATABASE_URL = `file:.local/test-integration.db`;
  process.env.BETTER_AUTH_SECRET = "super-secret-test-better-auth-key-1234567890";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
});

import { createTestSqliteDb } from "../../../../../../tests/integration/test-db-setup";

let db: any;
let schema: any;
let auth: any;
let finalizePOST: any;
let statusGET: any;
let authPOST: any;
let verifyRevision: any;

// Generate a valid package payload for finalization tests
function validPayload(packageId: string) {
  return {
    packageId,
    profileId: "wine-label-requirements",
    profileVersion: "1.0.0",
    panels: [
      {
        panelId: "panel-front-123",
        role: "front",
        displayName: "front.png",
        mediaType: "image/png",
        byteSize: 1024,
        checksumSha256: "sha-front-hash-code-placeholder-1234567890",
        width: 800,
        height: 600,
        rotation: 0,
        storageKey: "panels/sha-front-hash-code-placeholder-1234567890.png",
      },
    ],
    evidence: [
      {
        evidenceId: "ev-brand-123",
        categoryId: "brandName",
        decision: "provided",
        expectedValue: "Chateau Test",
        regions: [
          {
            regionId: "reg-brand-1",
            categoryId: "brandName",
            panelId: "panel-front-123",
            unit: "normalized-panel-relative",
            provenance: "seller-selected-region",
            x: 0.1,
            y: 0.2,
            width: 0.5,
            height: 0.1,
          },
        ],
      },
    ],
    machineRuns: [
      {
        analysisSnapshotId: "run-snapshot-123",
        analysisRunId: "run-id-123",
        sequence: 1,
        panelRuns: [],
        categories: [],
        readiness: "needs_seller_review",
        recordedAt: new Date().toISOString(),
      },
    ],
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
      // 1. Provision user programmatically on the server
      const seller = await auth.api.signUpEmail({
        body: {
          email: "seller@test.com",
          password: "SecurePassword123!",
          name: "Test Seller",
        },
      });
      expect(seller.user.id).toBeDefined();

      // 2. Perform credentials login to verify sessions are generated
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
      // Provision and login a user to get a session cookie
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
        body: JSON.stringify(validPayload("pkg-123")),
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
        body: JSON.stringify(validPayload("pkg-123")),
      });

      const response = await finalizePOST(request);
      expect(response.status).toBe(401);
    });

    it("commits submission atomically and returns a durable receipt", async () => {
      const pkgId = "pkg-finalize-test";
      const payload = validPayload(pkgId);
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

      // Verify HMAC matches canonical JSON
      const canonicalJson = receipt.integritySignature.split(":")[1];
      expect(canonicalJson).toBeDefined();

      // Check database entries
      const sub = await db.query.submissions.findFirst({ where: (s: any, { eq }: any) => eq(s.id, pkgId) });
      expect(sub).toBeDefined();
      expect(sub.currentStatus).toBe("waiting_for_agent_review");
      expect(sub.creatorId).toBe(sellerUserId);

      const rev = await db.query.submissionRevisions.findFirst({ where: (r: any, { eq }: any) => eq(r.submissionId, pkgId) });
      expect(rev).toBeDefined();
      expect(rev.integritySignature).toBe(receipt.integritySignature);

      // Verify signature authenticity against integrity verification function
      const isValid = verifyRevision(rev.canonicalJson, rev.integritySignature);
      expect(isValid).toBe(true);

      // Verify panels are saved
      const panel = await db.query.submittedPanels.findFirst({ where: (p: any, { eq }: any) => eq(p.revisionId, rev.id) });
      expect(panel).toBeDefined();
      expect(panel.displayName).toBe("front.png");
    });

    it("enforces scoped request idempotency and prevents payload tampering", async () => {
      const pkgId = "pkg-idemp-test";
      const payload = validPayload(pkgId);
      const idempotencyKey = "key-idempotency-3";

      // 1. First finalize request
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

      // 2. Retrying identical request returns cached receipt
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

      // 3. Request with same idempotency key but altered payload is rejected
      const alteredPayload = validPayload(pkgId);
      alteredPayload.profileVersion = "2.0.0"; // Alter payload

      const request3 = new Request("http://localhost:3000/api/package/submit/finalize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie,
          "X-Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(alteredPayload),
      });

      const response3 = await finalizePOST(request3);
      expect(response3.status).toBe(400);
      const data3 = await response3.json();
      expect(data3.error).toContain("different request payload");

      // 4. Duplicate submission with different key returns conflict error
      const request4 = new Request("http://localhost:3000/api/package/submit/finalize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie,
          "X-Idempotency-Key": "different-key-123",
        },
        body: JSON.stringify(payload),
      });

      const response4 = await finalizePOST(request4);
      expect(response4.status).toBe(409);
    });
  });

  describe("Owner-Only Status Endpoint", () => {
    let sessionCookie1: string;
    let sessionCookie2: string;
    let submissionId = "pkg-status-test";

    beforeEach(async () => {
      // 1. Create Seller 1 and finalize a submission
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
          body: JSON.stringify(validPayload(submissionId)),
        })
      );

      // 2. Create Seller 2
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

    it("returns 401 Unauthorized for unauthenticated requests", async () => {
      const request = new Request(`http://localhost:3000/api/package/submit/status/${submissionId}`, {
        method: "GET",
      });

      const params = Promise.resolve({ id: submissionId });
      const response = await statusGET(request, { params });
      expect(response.status).toBe(401);
    });
  });
});
