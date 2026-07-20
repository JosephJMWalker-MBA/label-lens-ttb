// @vitest-environment node
import { describe, expect, it } from "vitest";

import { isMysqlUrl, resolveDialect } from "./dialect";

/**
 * The build (`next.config.mjs`) performs the equivalent check to decide which
 * dialect graph to emit. A disagreement between the two is precisely what let a
 * MySQL production build reach the native SQLite driver, so the tolerant cases
 * below (padding, scheme casing) are the ones that matter.
 */
describe("database dialect resolution", () => {
  it("recognises mysql and mysql2 connection strings", () => {
    expect(isMysqlUrl("mysql://user:pass@host:3306/db")).toBe(true);
    expect(isMysqlUrl("mysql2://user:pass@host:3306/db")).toBe(true);
    expect(resolveDialect("mysql://user:pass@host:3306/db")).toBe("mysql");
  });

  it("tolerates surrounding whitespace and scheme casing from a hosting panel", () => {
    expect(isMysqlUrl("  mysql://user@host/db  ")).toBe(true);
    expect(isMysqlUrl("MySQL://user@host/db")).toBe(true);
    expect(isMysqlUrl("\nMYSQL2://user@host/db\n")).toBe(true);
    expect(resolveDialect(" MYSQL://user@host/db ")).toBe("mysql");
  });

  it("treats file/sqlite/absent connection strings as sqlite", () => {
    expect(resolveDialect("file:.local/dev.db")).toBe("sqlite");
    expect(resolveDialect("sqlite:.local/dev.db")).toBe("sqlite");
    expect(resolveDialect(undefined)).toBe("sqlite");
    expect(resolveDialect("")).toBe("sqlite");
  });

  it("does not mistake a lookalike scheme for mysql", () => {
    expect(isMysqlUrl("mysqlx://user@host/db")).toBe(false);
    expect(isMysqlUrl("postgres://user@host/db")).toBe(false);
    expect(isMysqlUrl("mysql-ish://user@host/db")).toBe(false);
  });

  it("honours an explicit operator override over URL sniffing", () => {
    expect(resolveDialect("file:.local/dev.db", "mysql")).toBe("mysql");
    expect(resolveDialect("mysql://user@host/db", "sqlite")).toBe("sqlite");
    expect(resolveDialect("mysql://user@host/db", " MySQL ")).toBe("mysql");
    // An unrecognised override falls back to URL sniffing rather than guessing.
    expect(resolveDialect("mysql://user@host/db", "nonsense")).toBe("mysql");
    expect(resolveDialect("file:.local/dev.db", "")).toBe("sqlite");
  });
});
