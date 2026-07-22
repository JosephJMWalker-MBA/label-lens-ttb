import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const CANONICAL_JSON = '{"submissionId":"synthetic-package","revision":1}';
const SECRET_A = "test-only-integrity-secret-a-at-least-32-chars";
const SECRET_B = "test-only-integrity-secret-b-at-least-32-chars";

async function freshIntegrityModule() {
  vi.resetModules();
  return import("./integrity");
}

function childSignatureDigest() {
  const env = { ...process.env, NODE_ENV: "test" } as NodeJS.ProcessEnv;
  delete env.LABEL_LENS_INTEGRITY_SECRET;

  const child = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--input-type=module",
      "-e",
      [
        "import { createHash } from 'node:crypto';",
        "const { signRevision } = await import('./src/lib/integrity.ts');",
        `const signature = signRevision(${JSON.stringify(CANONICAL_JSON)});`,
        "console.log(JSON.stringify({",
        "  formatOk: /^v1:[0-9a-f]{64}$/.test(signature),",
        "  digest: createHash('sha256').update(signature).digest('hex').slice(0, 16),",
        "}));",
      ].join("\n"),
    ],
    {
      cwd: process.cwd(),
      env,
      encoding: "utf8",
    },
  );

  expect(child.status, child.stderr).toBe(0);
  return JSON.parse(child.stdout.trim()) as { formatOk: boolean; digest: string };
}

describe("revision integrity signing", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("uses a stable configured secret across module recreation", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("LABEL_LENS_INTEGRITY_SECRET", SECRET_A);

    const first = await freshIntegrityModule();
    const signature = first.signRevision(CANONICAL_JSON);
    expect(/^v1:[0-9a-f]{64}$/.test(signature)).toBe(true);
    expect(signature.length).toBe(67);

    const second = await freshIntegrityModule();
    expect(second.verifyRevision(CANONICAL_JSON, signature)).toBe(true);
    expect(second.verifyRevision(`${CANONICAL_JSON}\n`, signature)).toBe(false);
  });

  it("fails closed when the configured secret changes across restart", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("LABEL_LENS_INTEGRITY_SECRET", SECRET_A);
    const writer = await freshIntegrityModule();
    const signature = writer.signRevision(CANONICAL_JSON);

    vi.stubEnv("LABEL_LENS_INTEGRITY_SECRET", SECRET_B);
    const reader = await freshIntegrityModule();
    expect(reader.verifyRevision(CANONICAL_JSON, signature)).toBe(false);
  });

  it("rejects missing or short production secrets", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("LABEL_LENS_INTEGRITY_SECRET", "");
    const missing = await freshIntegrityModule();
    expect(() => missing.signRevision(CANONICAL_JSON)).toThrow(/not configured or too short/);
    expect(() => missing.verifyRevision(CANONICAL_JSON, "v1:00")).toThrow(
      /not configured or too short/,
    );

    vi.stubEnv("LABEL_LENS_INTEGRITY_SECRET", "short");
    const short = await freshIntegrityModule();
    expect(() => short.signRevision(CANONICAL_JSON)).toThrow(/not configured or too short/);
  });

  it("documents development ephemeral-secret behavior across process restart", () => {
    const first = childSignatureDigest();
    const second = childSignatureDigest();

    expect(first.formatOk).toBe(true);
    expect(second.formatOk).toBe(true);
    expect(first.digest === second.digest).toBe(false);
  });

  it("guards the e2e seed before database side effects", () => {
    const source = readFileSync(join(process.cwd(), "scripts/e2e-seed.ts"), "utf8");
    const guard = source.indexOf("const integritySecret = process.env[INTEGRITY_ENV_KEY]");
    const rejection = source.indexOf("must be configured with at least 32 characters");
    const sqliteSideEffect = source.indexOf("const sqlite = createTestSqliteDb");
    const dbSideEffect = source.indexOf("clientMod.initializeDatabase");
    const bootstrapSideEffect = source.indexOf("await runBootstrap");
    const revisionWriter = source.indexOf("integritySignature: signRevision");

    expect(guard).toBeGreaterThan(-1);
    expect(rejection).toBeGreaterThan(guard);
    expect(sqliteSideEffect).toBeGreaterThan(-1);
    expect(dbSideEffect).toBeGreaterThan(-1);
    expect(bootstrapSideEffect).toBeGreaterThan(-1);
    expect(revisionWriter).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(sqliteSideEffect);
    expect(guard).toBeLessThan(dbSideEffect);
    expect(guard).toBeLessThan(bootstrapSideEffect);
    expect(guard).toBeLessThan(revisionWriter);
  });
});
