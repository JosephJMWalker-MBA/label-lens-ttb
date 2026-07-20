// @vitest-environment node
/* eslint-disable @typescript-eslint/no-explicit-any -- integration path drives loosely-typed Drizzle handles */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { runStartup, type StartupBootstrapResult } from "./startup";
import { BootstrapConfigError, parseSpecsFromEnv } from "./auth/bootstrap";

const RUN_MYSQL_TESTS = process.env.RUN_MYSQL_TESTS === "1";

vi.hoisted(() => {
  process.env.BETTER_AUTH_SECRET ||= "super-secret-test-better-auth-key-1234567890";
  process.env.BETTER_AUTH_URL ||= "http://localhost:3000";
  if (process.env.RUN_MYSQL_TESTS !== "1") {
    process.env.DATABASE_URL = "file:.local/test-startup.db";
  }
});

function makeLogger() {
  const messages: string[] = [];
  return {
    messages,
    logger: {
      info: (m: string) => messages.push(m),
      error: (m: string) => messages.push(m),
    },
  };
}

const REDACTED: StartupBootstrapResult[] = [
  { role: "admin", emailRedacted: "a***@example.test", outcome: "created" },
];

describe("runStartup (unit)", () => {
  it("does not run bootstrap when disabled, and starts the server", async () => {
    const bootstrap = vi.fn(async () => REDACTED);
    const startServer = vi.fn();
    const { logger } = makeLogger();

    const result = await runStartup({
      env: {} as unknown as NodeJS.ProcessEnv,
      migrate: async () => {},
      bootstrap,
      startServer,
      logger,
    });

    expect(result.ok).toBe(true);
    expect(result.serverStarted).toBe(true);
    expect(bootstrap).not.toHaveBeenCalled();
    expect(startServer).toHaveBeenCalledTimes(1);
  });

  it("runs bootstrap when enabled, then starts the server", async () => {
    const bootstrap = vi.fn(async () => REDACTED);
    const startServer = vi.fn();
    const order: string[] = [];
    bootstrap.mockImplementation(async () => {
      order.push("bootstrap");
      return REDACTED;
    });
    startServer.mockImplementation(() => {
      order.push("server");
    });

    const result = await runStartup({
      env: { LABEL_LENS_BOOTSTRAP_ON_START: "1" } as unknown as NodeJS.ProcessEnv,
      migrate: async () => {
        order.push("migrate");
      },
      bootstrap,
      startServer,
      logger: makeLogger().logger,
    });

    expect(result.ok).toBe(true);
    expect(bootstrap).toHaveBeenCalledTimes(1);
    expect(order).toEqual(["migrate", "bootstrap", "server"]);
  });

  it("fails closed when bootstrap variables are missing (server not started)", async () => {
    const startServer = vi.fn();
    const { logger } = makeLogger();

    const result = await runStartup({
      env: { LABEL_LENS_BOOTSTRAP_ON_START: "1" } as unknown as NodeJS.ProcessEnv,
      migrate: async () => {},
      // Real validation: an empty env throws BootstrapConfigError.
      bootstrap: async () => {
        parseSpecsFromEnv({} as unknown as NodeJS.ProcessEnv);
        return [];
      },
      startServer,
      logger,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe(1);
    expect(result.phase).toBe("bootstrap");
    expect(result.serverStarted).toBe(false);
    expect(startServer).not.toHaveBeenCalled();
  });

  it("never prints passwords, even when bootstrap fails", async () => {
    const password = "super-secret-plaintext-password-9999";
    const { messages, logger } = makeLogger();

    await runStartup({
      env: {
        LABEL_LENS_BOOTSTRAP_ON_START: "1",
        LABEL_LENS_BOOTSTRAP_ADMIN_PASSWORD: password,
      } as unknown as NodeJS.ProcessEnv,
      migrate: async () => {},
      // Fail using the real validator (which lists env key names, never values).
      bootstrap: async () => {
        parseSpecsFromEnv({
          LABEL_LENS_BOOTSTRAP_ADMIN_PASSWORD: password,
        } as unknown as NodeJS.ProcessEnv);
        return [];
      },
      startServer: () => {},
      logger,
    });

    const combined = messages.join("\n");
    expect(combined).not.toContain(password);
    // And on the success path the only account output is redacted.
    const success = makeLogger();
    await runStartup({
      env: { LABEL_LENS_BOOTSTRAP_ON_START: "1" } as unknown as NodeJS.ProcessEnv,
      migrate: async () => {},
      bootstrap: async () => REDACTED,
      startServer: () => {},
      logger: success.logger,
    });
    expect(success.messages.join("\n")).not.toContain(password);
    expect(success.messages.join("\n")).toContain("a***@example.test");
  });

  it("does not start the server when migration fails", async () => {
    const startServer = vi.fn();
    const { logger } = makeLogger();

    const result = await runStartup({
      env: {} as unknown as NodeJS.ProcessEnv,
      migrate: async () => {
        throw new Error("connect ECONNREFUSED");
      },
      bootstrap: async () => REDACTED,
      startServer,
      logger,
    });

    expect(result.ok).toBe(false);
    expect(result.phase).toBe("migrate");
    expect(result.serverStarted).toBe(false);
    expect(startServer).not.toHaveBeenCalled();
  });

  it("surfaces a BootstrapConfigError as a fail-closed result", async () => {
    const result = await runStartup({
      env: { LABEL_LENS_BOOTSTRAP_ON_START: "1" } as unknown as NodeJS.ProcessEnv,
      migrate: async () => {},
      bootstrap: async () => {
        throw new BootstrapConfigError("LABEL_LENS_BOOTSTRAP_ADMIN_EMAIL is required");
      },
      startServer: () => {},
      logger: makeLogger().logger,
    });
    expect(result.ok).toBe(false);
    expect(result.phase).toBe("bootstrap");
  });
});

// Real migrate + bootstrap against authoritative MySQL, proving the server is
// gated behind a successful migration and provisioning.
if (RUN_MYSQL_TESTS) {
  describe("runStartup (mysql integration)", () => {
    let db: any;
    let schema: any;
    let auth: any;
    let applyMigrations: (url: string) => Promise<void>;
    let runBootstrap: any;

    const env = {
      LABEL_LENS_BOOTSTRAP_ON_START: "1",
      LABEL_LENS_BOOTSTRAP_ADMIN_EMAIL: "startup-admin@example.test",
      LABEL_LENS_BOOTSTRAP_ADMIN_PASSWORD: "startup-admin-password-1234",
      LABEL_LENS_BOOTSTRAP_AGENT_EMAIL: "startup-agent@example.test",
      LABEL_LENS_BOOTSTRAP_AGENT_PASSWORD: "startup-agent-password-1234",
      LABEL_LENS_BOOTSTRAP_SELLER_EMAIL: "startup-seller@example.test",
      LABEL_LENS_BOOTSTRAP_SELLER_PASSWORD: "startup-seller-password-1234",
      DATABASE_URL: process.env.DATABASE_URL,
    } as unknown as NodeJS.ProcessEnv;

    beforeAll(async () => {
      vi.resetModules();
      const clientMod = await import("@/db/client");
      clientMod.initializeDatabase(process.env.DATABASE_URL as string);
      db = clientMod.db;
      schema = clientMod.schema;
      auth = (await import("@/lib/auth")).auth;
      applyMigrations = (await import("./migrate")).applyMigrations;
      runBootstrap = (await import("./auth/bootstrap")).runBootstrap;
      // Ensure the schema exists before per-test clearing; the test then calls
      // applyMigrations again through runStartup to prove it is idempotent.
      await applyMigrations(process.env.DATABASE_URL as string);
    });

    beforeEach(async () => {
      const { sql } = await import("drizzle-orm");
      for (const name of ["prevent_submissions_delete", "prevent_revisions_delete"]) {
        await db.execute(sql.raw(`DROP TRIGGER IF EXISTS ${name}`));
      }
      await db.delete(schema.sessions);
      await db.delete(schema.accounts);
      await db.delete(schema.users);
    });

    it("migrates, provisions, and starts (idempotent migration)", async () => {
      const startServer = vi.fn();
      const result = await runStartup({
        env,
        migrate: () => applyMigrations(env.DATABASE_URL as string),
        bootstrap: () => runBootstrap({ auth, db, schema }, { env }),
        startServer,
        logger: { info: () => {}, error: () => {} },
      });
      expect(result.ok).toBe(true);
      expect(startServer).toHaveBeenCalledTimes(1);

      const { eq } = await import("drizzle-orm");
      const rows = (await db
        .select({ role: schema.users.role })
        .from(schema.users)
        .where(eq(schema.users.email, "startup-agent@example.test"))) as { role: string }[];
      expect(rows[0]?.role).toBe("agent");
    });
  });
}
