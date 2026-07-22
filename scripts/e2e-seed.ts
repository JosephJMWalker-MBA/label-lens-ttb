/**
 * Seed the end-to-end test database: a fresh schema, three provisioned demo
 * accounts, and a couple of submissions (owned by two different sellers) so the
 * agent queue and seller-isolation flows have real server-backed data.
 *
 * Uses obviously fake, CI-only credentials from the environment. It never prints
 * passwords. Intended for SQLite in local/CI e2e runs.
 */
import { randomUUID, createHash } from "node:crypto";

import { createTestSqliteDb } from "../tests/integration/test-db-setup";
import { runBootstrap } from "@/server/auth/bootstrap";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) throw new Error("DATABASE_URL is required to seed the e2e database.");

const INTEGRITY_ENV_KEY = "LABEL_LENS_INTEGRITY_SECRET";
const integritySecret = process.env[INTEGRITY_ENV_KEY];
if (!integritySecret || integritySecret.length < 32) {
  throw new Error(
    `${INTEGRITY_ENV_KEY} must be configured with at least 32 characters for e2e seeding.`,
  );
}

async function main() {
  const isSqlite = !/^mysql2?:\/\//.test(DATABASE_URL!);
  if (isSqlite) {
    const file = DATABASE_URL!.replace(/^(sqlite|file):/, "");
    const sqlite = createTestSqliteDb(file, true);
    sqlite.close();
  }

  const clientMod = await import("@/db/client");
  clientMod.initializeDatabase(DATABASE_URL!);
  const { db, schema, isSQLite } = clientMod;
  const { auth } = await import("@/lib/auth");
  const { signRevision } = await import("@/lib/integrity");
  const { sql } = await import("drizzle-orm");

  // Provision the three demo accounts from the e2e env.
  await runBootstrap({ auth, db, schema }, { env: process.env });

  async function userIdByEmail(email: string): Promise<string> {
    const rows = (await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(sql`email = ${email}`)) as { id: string }[];
    return rows[0]!.id;
  }

  const sellerEmail = process.env.LABEL_LENS_BOOTSTRAP_SELLER_EMAIL!.toLowerCase();
  const sellerId = await userIdByEmail(sellerEmail);

  // A second seller (owns a submission the primary seller must not access).
  const otherSellerId = randomUUID();
  await db.insert(schema.users).values({
    id: otherSellerId,
    email: "e2e-other-seller@example.test",
    name: "Other Seller",
    role: "seller",
  });

  async function seed(id: string, creatorId: string) {
    const revisionId = randomUUID();
    const panelId = `panel-${id}`;
    const checksum = createHash("sha256").update(id).digest("hex");
    const canonicalJson = JSON.stringify({ submissionId: id, revision: 1 });
    const now = new Date();
    await db.insert(schema.submissions).values({
      id,
      creatorId,
      currentStatus: "waiting_for_agent_review",
      isDemo: false,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(schema.submissionRevisions).values({
      id: revisionId,
      submissionId: id,
      revisionNumber: 1,
      profileId: "wine-label-requirements",
      profileVersion: "1.0.0",
      submittedBy: creatorId,
      submittedAt: now,
      canonicalJson,
      integritySignature: signRevision(canonicalJson),
    });
    await db.insert(schema.submittedPanels).values({
      id: panelId,
      revisionId,
      role: "front",
      displayName: "front.png",
      mediaType: "image/png",
      byteSize: 70,
      checksumSha256: checksum,
      width: 1,
      height: 1,
      rotation: 0,
      storageKey: `submissions/${id}/panels/${panelId}-${checksum}`,
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
      recordedAt: now,
    });
    await db.insert(schema.submissionStatusEvents).values({
      id: randomUUID(),
      submissionId: id,
      status: "waiting_for_agent_review",
      actorId: creatorId,
      actorRole: "seller",
      reasonComment: "seeded",
      recordedAt: now,
    });
  }

  await seed("pkg-e2e-primary", sellerId);
  await seed("pkg-e2e-other", otherSellerId);

  void isSQLite;
  console.log("[e2e-seed] seeded users and submissions.");
  process.exit(0);
}

void main().catch((error) => {
  console.error("[e2e-seed] failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
