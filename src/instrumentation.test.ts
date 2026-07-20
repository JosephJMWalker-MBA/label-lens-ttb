// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runStartup = vi.fn();
const applyMigrations = vi.fn();
const runBootstrap = vi.fn();

vi.mock("@/server/startup", () => ({ runStartup }));
vi.mock("@/server/migrate", () => ({ applyMigrations }));
vi.mock("@/server/auth/bootstrap", () => ({ runBootstrap }));
// Mock the heavy runtime modules so the instrumentation wiring can be tested
// without constructing Better Auth or opening a database connection.
vi.mock("@/lib/auth", () => ({ auth: { marker: "auth" } }));
vi.mock("@/db/client", () => ({ db: { marker: "db" }, schema: { marker: "schema" } }));

const ORIGINAL_RUNTIME = process.env.NEXT_RUNTIME;

describe("instrumentation register()", () => {
  beforeEach(() => {
    runStartup.mockReset();
    applyMigrations.mockReset();
    runBootstrap.mockReset();
  });

  afterEach(() => {
    if (ORIGINAL_RUNTIME === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = ORIGINAL_RUNTIME;
    vi.restoreAllMocks();
  });

  it("does no startup work outside the Node.js runtime", async () => {
    process.env.NEXT_RUNTIME = "edge";
    const { register } = await import("./instrumentation");
    await register();
    expect(runStartup).not.toHaveBeenCalled();
  });

  it("runs startup and does not exit when preparation succeeds", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    runStartup.mockResolvedValue({ ok: true, code: 0, phase: "served", serverStarted: true });
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    const { register } = await import("./instrumentation");
    await register();

    expect(runStartup).toHaveBeenCalledTimes(1);
    const deps = runStartup.mock.calls[0][0];
    expect(deps.env).toBe(process.env);
    // The bootstrap dep is wired to the real runBootstrap with auth + db + schema.
    await deps.bootstrap();
    expect(runBootstrap).toHaveBeenCalledWith(
      { auth: { marker: "auth" }, db: { marker: "db" }, schema: { marker: "schema" } },
      { env: process.env },
    );
    expect(exit).not.toHaveBeenCalled();
  });

  it("exits with the failure code before serving when preparation fails", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    runStartup.mockResolvedValue({ ok: false, code: 1, phase: "migrate", serverStarted: false });
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    const { register } = await import("./instrumentation");
    await register();

    expect(exit).toHaveBeenCalledWith(1);
  });
});
