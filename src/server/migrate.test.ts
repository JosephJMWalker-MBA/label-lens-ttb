// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { applyMigrations, resolveMigrationsDir } from "./migrate";

/**
 * Staging failed at boot with `Can't find meta/_journal.json file` because the
 * migrations were resolved solely from an assumed checkout-shaped
 * `process.cwd()` and were never packaged into the standalone artifact. These
 * cover both deployment shapes and the fail-closed diagnostic.
 */

const MIGRATIONS_REL = path.join("src", "db", "migrations");
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
