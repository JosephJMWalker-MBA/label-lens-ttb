// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- MySQL upgrade path drives dynamic Drizzle handles across manual schema resets */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { sql } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyMigrations, resolveMigrationsDir } from "./migrate";

/**
 * Staging failed at boot with `Can't find meta/_journal.json file` because the
 * migrations were resolved solely from an assumed checkout-shaped
 * `process.cwd()` and were never packaged into the standalone artifact. These
 * cover both deployment shapes and the fail-closed diagnostic.
 */

const MIGRATIONS_REL = path.join("src", "db", "migrations");
const RUN_MYSQL_TESTS = process.env.RUN_MYSQL_TESTS === "1";
const MYSQL_DATABASE_URL = process.env.DATABASE_URL;
let tmp: string;

function makeMigrationsAt(root: string): string {
  const dir = path.join(root, MIGRATIONS_REL);
  mkdirSync(path.join(dir, "meta"), { recursive: true });
  writeFileSync(
    path.join(dir, "meta", "_journal.json"),
    JSON.stringify({ version: "7", dialect: "mysql", entries: [] }),
  );
  return dir;
}

function makeMigrationSubsetAt(root: string, tags: string[]): string {
  const source = path.join(process.cwd(), MIGRATIONS_REL);
  const dir = path.join(root, MIGRATIONS_REL);
  mkdirSync(path.join(dir, "meta"), { recursive: true });

  for (const tag of tags) {
    writeFileSync(
      path.join(dir, `${tag}.sql`),
      readFileSync(path.join(source, `${tag}.sql`), "utf8"),
    );
  }

  const journal = JSON.parse(readFileSync(path.join(source, "meta", "_journal.json"), "utf8")) as {
    version: string;
    dialect: string;
    entries: Array<{ tag: string }>;
  };
  writeFileSync(
    path.join(dir, "meta", "_journal.json"),
    JSON.stringify({
      ...journal,
      entries: journal.entries.filter((entry) => tags.includes(entry.tag)),
    }),
  );

  return dir;
}

function quoteIdentifier(name: string): string {
  return `\`${name.replaceAll("`", "``")}\``;
}

async function dropAllMysqlTables(dbUrl: string) {
  const mysql = (await import("mysql2/promise")).default;
  const connection = await mysql.createConnection(dbUrl);
  try {
    const [rows] = await connection.query(
      "SELECT TABLE_NAME AS tableName FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'",
    );
    await connection.query("SET FOREIGN_KEY_CHECKS = 0");
    for (const row of rows as Array<{ tableName: string }>) {
      await connection.query(`DROP TABLE IF EXISTS ${quoteIdentifier(row.tableName)}`);
    }
    await connection.query("SET FOREIGN_KEY_CHECKS = 1");
  } finally {
    await connection.end();
  }
}

async function mysqlColumnType(dbUrl: string): Promise<{
  dataType: string;
  characterMaximumLength: number;
}> {
  const mysql = (await import("mysql2/promise")).default;
  const connection = await mysql.createConnection(dbUrl);
  try {
    const [rows] = await connection.execute(
      "SELECT DATA_TYPE AS dataType, CHARACTER_MAXIMUM_LENGTH AS characterMaximumLength FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'submission_revisions' AND COLUMN_NAME = 'canonical_json'",
    );
    return (rows as Array<{ dataType: string; characterMaximumLength: number }>)[0]!;
  } finally {
    await connection.end();
  }
}

async function mysqlRevisionIntegrity(
  dbUrl: string,
  revisionId: string,
): Promise<
  | {
      canonicalJson: string;
      integritySignature: string;
    }
  | undefined
> {
  const mysql = (await import("mysql2/promise")).default;
  const connection = await mysql.createConnection(dbUrl);
  try {
    const [rows] = await connection.execute(
      "SELECT canonical_json AS canonicalJson, integrity_signature AS integritySignature FROM submission_revisions WHERE id = ?",
      [revisionId],
    );
    return (
      rows as Array<{
        canonicalJson: string;
        integritySignature: string;
      }>
    )[0];
  } finally {
    await connection.end();
  }
}

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), "migrate-test-"));
  delete process.env.LABEL_LENS_MIGRATIONS_DIR;
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  delete process.env.LABEL_LENS_MIGRATIONS_DIR;
});

describe("resolveMigrationsDir", () => {
  it("resolves a source/dev checkout run from the repository root", () => {
    const expected = makeMigrationsAt(tmp);
    expect(resolveMigrationsDir(tmp)).toBe(expected);
  });

  it("resolves a relocated standalone root (the server chdir()s into it)", () => {
    // A standalone artifact copied anywhere: `src/db/migrations` sits beside
    // `server.js` at the artifact root, which becomes the working directory.
    const relocated = path.join(tmp, "somewhere", "else", "standalone");
    mkdirSync(relocated, { recursive: true });
    const expected = makeMigrationsAt(relocated);
    expect(resolveMigrationsDir(relocated)).toBe(expected);
  });

  it("resolves a standalone build still sitting inside a repository root", () => {
    const expected = makeMigrationsAt(path.join(tmp, ".next", "standalone"));
    expect(resolveMigrationsDir(tmp)).toBe(expected);
  });

  it("resolves when launched from a nested working directory", () => {
    const expected = makeMigrationsAt(tmp);
    const nested = path.join(tmp, "a", "b");
    mkdirSync(nested, { recursive: true });
    expect(resolveMigrationsDir(nested)).toBe(expected);
  });

  it("honours an explicit operator override", () => {
    const other = mkdtempSync(path.join(os.tmpdir(), "migrate-override-"));
    const dir = path.join(other, "migrations");
    mkdirSync(path.join(dir, "meta"), { recursive: true });
    writeFileSync(path.join(dir, "meta", "_journal.json"), "{}");
    process.env.LABEL_LENS_MIGRATIONS_DIR = dir;
    try {
      expect(resolveMigrationsDir(tmp)).toBe(dir);
    } finally {
      rmSync(other, { recursive: true, force: true });
    }
  });

  it("rejects an override that has no journal, naming the path", () => {
    process.env.LABEL_LENS_MIGRATIONS_DIR = tmp;
    expect(() => resolveMigrationsDir(tmp)).toThrow(/LABEL_LENS_MIGRATIONS_DIR/);
    expect(() => resolveMigrationsDir(tmp)).toThrow(/_journal\.json/);
  });

  it("fails closed with the attempted paths when migrations are absent", () => {
    // Never silently skip: a missing folder is a packaging fault.
    let message = "";
    try {
      resolveMigrationsDir(tmp);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/Could not locate the committed database migrations/);
    expect(message).toMatch(/_journal\.json/);
    expect(message).toMatch(/artifact is incomplete/);
    // The diagnostic lists the non-secret paths it tried.
    expect(message).toContain(path.join(tmp, MIGRATIONS_REL));
    expect(message).toMatch(/LABEL_LENS_MIGRATIONS_DIR/);
  });

  it("never reconstructs or generates a journal file", () => {
    expect(() => resolveMigrationsDir(tmp)).toThrow();
    // The failed lookup must not have created anything on disk.
    expect(() => resolveMigrationsDir(tmp)).toThrow();
  });
});

describe("applyMigrations", () => {
  it("requires a connection string", async () => {
    await expect(applyMigrations("")).rejects.toThrow(/DATABASE_URL is required/);
  });

  it("is a no-op for a non-MySQL dialect (SQLite has no committed migrations)", async () => {
    // Must not throw even though no migrations directory exists here.
    await expect(applyMigrations("file:.local/dev.db")).resolves.toBeUndefined();
  });

  it("fails closed for MySQL when the migrations are not packaged", async () => {
    const cwd = process.cwd();
    process.chdir(tmp);
    try {
      await expect(applyMigrations("mysql://user@127.0.0.1:3306/db")).rejects.toThrow(
        /Could not locate the committed database migrations/,
      );
    } finally {
      process.chdir(cwd);
    }
  });
});

describe("agent decision migration metadata", () => {
  it("journals the durable claim/decision migrations and carries the review tables plus immutability triggers", () => {
    const source = path.join(process.cwd(), MIGRATIONS_REL);
    const journal = JSON.parse(
      readFileSync(path.join(source, "meta", "_journal.json"), "utf8"),
    ) as {
      entries: Array<{ tag: string }>;
    };
    expect(journal.entries.map((entry) => entry.tag)).toEqual([
      "0000_smooth_felicia_hardy",
      "0001_tiny_marauders",
      "0002_issue_165_agent_decisions",
      "0003_issue_167_seller_resubmissions",
    ]);

    const migrationSql = readFileSync(
      path.join(source, "0002_issue_165_agent_decisions.sql"),
      "utf8",
    );
    expect(migrationSql).toMatch(/CREATE TABLE `reviewer_claims`/);
    expect(migrationSql).toMatch(/CREATE TABLE `agent_decisions`/);
    expect(migrationSql).toMatch(/`prior_status` varchar\(50\) NOT NULL/);
    expect(migrationSql).toMatch(/`resulting_status` varchar\(50\) NOT NULL/);
    expect(migrationSql).toMatch(/`idempotency_record_key` varchar\(255\) NOT NULL/);
    expect(migrationSql).toMatch(/CONSTRAINT `reviewer_claims_active_submission_idx` UNIQUE/);
    expect(migrationSql).toMatch(/CONSTRAINT `agent_decisions_revision_idx` UNIQUE/);
    expect(migrationSql).toMatch(/CONSTRAINT `agent_decisions_claim_idx` UNIQUE/);
    expect(migrationSql).toMatch(/CONSTRAINT `agent_decisions_idempotency_record_key_idx` UNIQUE/);
    expect(migrationSql).not.toMatch(/agent_decisions_idempotency_record_key_.*FOREIGN KEY/);
    expect(migrationSql).toMatch(/prevent_reviewer_claims_closed_update/);
    expect(migrationSql).toMatch(/prevent_reviewer_claims_identity_update/);
    expect(migrationSql).toMatch(/prevent_agent_decisions_update/);
    expect(migrationSql).toMatch(/prevent_agent_decisions_delete/);
  });

  it("journals 0003 with append-only seller resubmission lineage and user-owned seller ids", () => {
    const source = path.join(process.cwd(), MIGRATIONS_REL);
    const migrationSql = readFileSync(
      path.join(source, "0003_issue_167_seller_resubmissions.sql"),
      "utf8",
    );
    expect(migrationSql).toMatch(/CREATE TABLE `submission_revision_responses`/);
    expect(migrationSql).toMatch(/`parent_revision_id` varchar\(36\) NOT NULL/);
    expect(migrationSql).toMatch(/`responded_to_decision_id` varchar\(36\) NOT NULL/);
    expect(migrationSql).toMatch(/`child_revision_id` varchar\(36\) NOT NULL/);
    expect(migrationSql).toMatch(/`seller_id` varchar\(36\) NOT NULL/);
    expect(migrationSql).toMatch(/`idempotency_record_key` varchar\(255\) NOT NULL/);
    expect(migrationSql).toMatch(
      /CONSTRAINT `submission_revision_responses_child_revision_idx` UNIQUE/,
    );
    expect(migrationSql).toMatch(/CONSTRAINT `submission_revision_responses_decision_idx` UNIQUE/);
    expect(migrationSql).toMatch(
      /CONSTRAINT `submission_revision_responses_idempotency_record_key_idx` UNIQUE/,
    );
    expect(migrationSql).toMatch(/FOREIGN KEY \(`seller_id`\) REFERENCES `users`\(`id`\)/);
    expect(migrationSql).not.toMatch(
      /submission_revision_responses_idempotency_record_key_.*FOREIGN KEY/,
    );
    expect(migrationSql).toMatch(/prevent_submission_revision_responses_update/);
    expect(migrationSql).toMatch(/prevent_submission_revision_responses_delete/);
  });
});

if (RUN_MYSQL_TESTS) {
  if (!MYSQL_DATABASE_URL || !/^mysql2?:\/\//.test(MYSQL_DATABASE_URL)) {
    throw new Error("RUN_MYSQL_TESTS=1 requires a mysql:// DATABASE_URL");
  }

  describe("applyMigrations (mysql upgrade path)", () => {
    it("preserves an existing valid signed revision when canonical_json upgrades from TEXT to MEDIUMTEXT", async () => {
      const previousMigrationsDir = process.env.LABEL_LENS_MIGRATIONS_DIR;
      const previousIntegritySecret = process.env.LABEL_LENS_INTEGRITY_SECRET;
      const previousDialect = process.env.LABEL_LENS_DB_DIALECT;

      try {
        process.env.LABEL_LENS_INTEGRITY_SECRET =
          "test-only-upgrade-integrity-secret-at-least-32-chars";
        process.env.LABEL_LENS_DB_DIALECT = "mysql";

        await dropAllMysqlTables(MYSQL_DATABASE_URL);
        process.env.LABEL_LENS_MIGRATIONS_DIR = makeMigrationSubsetAt(tmp, [
          "0000_smooth_felicia_hardy",
        ]);
        await applyMigrations(MYSQL_DATABASE_URL);

        expect(await mysqlColumnType(MYSQL_DATABASE_URL)).toEqual({
          dataType: "text",
          characterMaximumLength: 65_535,
        });

        delete process.env.LABEL_LENS_MIGRATIONS_DIR;
        process.env.DATABASE_URL = MYSQL_DATABASE_URL;
        vi.resetModules();
        const clientMod = await import("@/db/client");
        clientMod.initializeDatabase(MYSQL_DATABASE_URL);
        const { db, schema } = clientMod;
        const { signRevision } = await import("@/lib/integrity");

        const submissionId = "pkg-upgrade-valid";
        const revisionId = "11111111-1111-4111-8111-111111111111";
        const userId = "22222222-2222-4222-8222-222222222222";
        const canonicalJson = JSON.stringify({
          submissionId,
          revision: 1,
          purpose: "mysql-upgrade-preservation",
        });
        const signature = signRevision(canonicalJson);
        const now = new Date("2026-07-22T00:00:00.000Z");

        await db.insert(schema.users).values({
          id: userId,
          email: "upgrade-seller@example.test",
          name: "Upgrade Seller",
          role: "seller",
          createdAt: now,
          updatedAt: now,
        });
        await db.insert(schema.submissions).values({
          id: submissionId,
          creatorId: userId,
          currentStatus: "waiting_for_agent_review",
          isDemo: false,
          version: 1,
          createdAt: now,
          updatedAt: now,
        });
        await db.insert(schema.submissionRevisions).values({
          id: revisionId,
          submissionId,
          revisionNumber: 1,
          profileId: "wine-label-requirements",
          profileVersion: "1.0.0",
          submittedBy: "upgrade-seller@example.test",
          submittedAt: now,
          canonicalJson,
          integritySignature: signature,
        });
        await db.insert(schema.submissionStatusEvents).values({
          id: "33333333-3333-4333-8333-333333333333",
          submissionId,
          status: "waiting_for_agent_review",
          actorId: userId,
          actorRole: "seller",
          reasonComment: "upgrade-path fixture",
          recordedAt: now,
        });

        const legacyStoredRevision = await mysqlRevisionIntegrity(MYSQL_DATABASE_URL, revisionId);
        expect(legacyStoredRevision).toEqual({
          canonicalJson,
          integritySignature: signature,
        });

        await applyMigrations(MYSQL_DATABASE_URL);
        expect(await mysqlColumnType(MYSQL_DATABASE_URL)).toEqual({
          dataType: "mediumtext",
          characterMaximumLength: 16_777_215,
        });

        vi.resetModules();
        const freshClient = await import("@/db/client");
        freshClient.initializeDatabase(MYSQL_DATABASE_URL);
        const { buildSubmissionDetail: buildFreshSubmissionDetail } =
          await import("@/server/submissions/detail");

        const after = await freshClient.db.query.submissionRevisions.findFirst({
          where: (r: any, { eq }: any) => eq(r.id, revisionId),
        });
        expect(after?.canonicalJson).toBe(canonicalJson);
        expect(after?.integritySignature).toBe(signature);

        const afterDetail = await buildFreshSubmissionDetail(submissionId);
        expect(afterDetail.ok).toBe(true);

        await freshClient.db.execute(sql.raw("DROP TRIGGER IF EXISTS prevent_revisions_update"));
        await freshClient.db.execute(
          sql`UPDATE submission_revisions SET canonical_json = ${canonicalJson.slice(0, -1)} WHERE id = ${revisionId}`,
        );

        const truncatedDetail = await buildFreshSubmissionDetail(submissionId);
        expect(truncatedDetail).toEqual({ ok: false, reason: "integrity_failed" });
      } finally {
        delete process.env.LABEL_LENS_MIGRATIONS_DIR;
        await dropAllMysqlTables(MYSQL_DATABASE_URL);
        await applyMigrations(MYSQL_DATABASE_URL);

        if (previousMigrationsDir === undefined) delete process.env.LABEL_LENS_MIGRATIONS_DIR;
        else process.env.LABEL_LENS_MIGRATIONS_DIR = previousMigrationsDir;
        if (previousIntegritySecret === undefined) delete process.env.LABEL_LENS_INTEGRITY_SECRET;
        else process.env.LABEL_LENS_INTEGRITY_SECRET = previousIntegritySecret;
        if (previousDialect === undefined) delete process.env.LABEL_LENS_DB_DIALECT;
        else process.env.LABEL_LENS_DB_DIALECT = previousDialect;
      }
    });
  });
}
