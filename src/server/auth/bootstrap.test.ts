// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- integration test drives loosely-typed dual-dialect Drizzle handles */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";

const TEST_DB_FILE = ".local/test-bootstrap.db";
const RUN_MYSQL_TESTS = process.env.RUN_MYSQL_TESTS === "1";

vi.hoisted(() => {
  process.env.BETTER_AUTH_SECRET ||= "super-secret-test-better-auth-key-1234567890";
  process.env.BETTER_AUTH_URL ||= "http://localhost:3000";
  if (process.env.RUN_MYSQL_TESTS !== "1") {
    process.env.DATABASE_URL = "file:.local/test-bootstrap.db";
  }
});

import { createTestSqliteDb } from "../../../tests/integration/test-db-setup";
import { BootstrapConfigError, parseSpecsFromEnv, redactEmail, runBootstrap } from "./bootstrap";

const MYSQL_DATABASE_URL = process.env.DATABASE_URL;
if (RUN_MYSQL_TESTS && (!MYSQL_DATABASE_URL || !/^mysql2?:\/\//.test(MYSQL_DATABASE_URL))) {
  throw new Error("RUN_MYSQL_TESTS=1 requires a mysql:// DATABASE_URL");
}

const BASE_ENV = {
  LABEL_LENS_BOOTSTRAP_ADMIN_EMAIL: "Admin@Example.Test",
  LABEL_LENS_BOOTSTRAP_ADMIN_PASSWORD: "admin-password-1234",
  LABEL_LENS_BOOTSTRAP_AGENT_EMAIL: "agent@example.test",
  LABEL_LENS_BOOTSTRAP_AGENT_PASSWORD: "agent-password-1234",
  LABEL_LENS_BOOTSTRAP_SELLER_EMAIL: "seller@example.test",
  LABEL_LENS_BOOTSTRAP_SELLER_PASSWORD: "seller-password-1234",
} as unknown as NodeJS.ProcessEnv;

describe("parseSpecsFromEnv", () => {
  it("fails closed listing every missing required value", () => {
    expect(() => parseSpecsFromEnv({} as unknown as NodeJS.ProcessEnv)).toThrow(
      BootstrapConfigError,
    );
    try {
      parseSpecsFromEnv({} as unknown as NodeJS.ProcessEnv);
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("LABEL_LENS_BOOTSTRAP_ADMIN_EMAIL is required");
      expect(message).toContain("LABEL_LENS_BOOTSTRAP_SELLER_PASSWORD is required");
      // Never echoes any password value.
      expect(message).not.toContain("password-1234");
    }
  });

  it("rejects invalid emails and short passwords", () => {
    expect(() =>
      parseSpecsFromEnv({ ...BASE_ENV, LABEL_LENS_BOOTSTRAP_ADMIN_EMAIL: "not-an-email" }),
    ).toThrow(/valid email/);
    expect(() =>
      parseSpecsFromEnv({ ...BASE_ENV, LABEL_LENS_BOOTSTRAP_AGENT_PASSWORD: "short" }),
    ).toThrow(/at least 12/);
  });

  it("normalizes emails and applies defaults", () => {
    const specs = parseSpecsFromEnv(BASE_ENV);
    const admin = specs.find((s) => s.role === "admin")!;
    expect(admin.email).toBe("admin@example.test");
    expect(admin.name).toBe("Label Lens Demo Admin");
  });

  it("redacts emails", () => {
    expect(redactEmail("agent@example.test")).toBe("a***@example.test");
    expect(redactEmail("bad")).toBe("***");
  });
});

const DIALECTS = RUN_MYSQL_TESTS ? (["mysql"] as const) : (["sqlite"] as const);

for (const dialect of DIALECTS) {
  describe(`runBootstrap (${dialect})`, () => {
    let db: any;
    let schema: any;
    let isSQLite: boolean;
    let auth: any;

    async function load() {
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
    }

    async function clearAuthTables() {
      for (const name of ["prevent_submissions_delete", "prevent_revisions_delete"]) {
        if (isSQLite) db.run(sql.raw(`DROP TRIGGER IF EXISTS ${name}`));
        else await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${name}`));
      }
      await db.delete(schema.sessions);
      await db.delete(schema.accounts);
      await db.delete(schema.verifications);
      await db.delete(schema.users);
    }

    async function roleOf(email: string): Promise<string | null> {
      const rows = (await db
        .select({ role: schema.users.role })
        .from(schema.users)
        .where(sql`email = ${email}`)) as { role: string }[];
      return rows[0]?.role ?? null;
    }

    async function canSignIn(email: string, password: string): Promise<boolean> {
      const res = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
      return res.status === 200;
    }

    beforeAll(load);
    beforeEach(clearAuthTables);

    it("creates accounts with correct roles, then is idempotent", async () => {
      const first = await runBootstrap({ auth, db, schema }, { env: BASE_ENV });
      expect(first.map((r) => r.outcome)).toEqual(["created", "created", "created"]);
      expect(await roleOf("admin@example.test")).toBe("admin");
      expect(await roleOf("agent@example.test")).toBe("agent");
      expect(await roleOf("seller@example.test")).toBe("seller");

      const second = await runBootstrap({ auth, db, schema }, { env: BASE_ENV });
      expect(second.map((r) => r.outcome)).toEqual([
        "already-present",
        "already-present",
        "already-present",
      ]);
    });

    it("corrects a wrong role without touching the password", async () => {
      await runBootstrap({ auth, db, schema }, { env: BASE_ENV });
      if (isSQLite)
        db.run(sql`UPDATE users SET role = 'seller' WHERE email = 'agent@example.test'`);
      else
        await db.execute(sql`UPDATE users SET role = 'seller' WHERE email = 'agent@example.test'`);

      const results = await runBootstrap({ auth, db, schema }, { env: BASE_ENV });
      expect(results.find((r) => r.role === "agent")?.outcome).toBe("role-corrected");
      expect(await roleOf("agent@example.test")).toBe("agent");
    });

    it("does not reset an existing password by default, but resets with the explicit flag", async () => {
      await runBootstrap({ auth, db, schema }, { env: BASE_ENV });
      expect(await canSignIn("seller@example.test", "seller-password-1234")).toBe(true);

      // New env password, no reset flag → original password still works.
      const changedEnv = {
        ...BASE_ENV,
        LABEL_LENS_BOOTSTRAP_SELLER_PASSWORD: "brand-new-password-9999",
      };
      const noReset = await runBootstrap({ auth, db, schema }, { env: changedEnv });
      expect(noReset.find((r) => r.role === "seller")?.outcome).toBe("already-present");
      expect(await canSignIn("seller@example.test", "seller-password-1234")).toBe(true);
      expect(await canSignIn("seller@example.test", "brand-new-password-9999")).toBe(false);

      // With the explicit flag → password is reset.
      const reset = await runBootstrap(
        { auth, db, schema },
        { env: changedEnv, resetPasswords: true },
      );
      expect(reset.find((r) => r.role === "seller")?.outcome).toBe("password-reset");
      expect(await canSignIn("seller@example.test", "brand-new-password-9999")).toBe(true);
    });
  });
}
