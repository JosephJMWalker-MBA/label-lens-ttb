/**
 * Production startup orchestration, extracted so it is fully testable without a
 * real database or server.
 *
 * Order: apply migrations → (optionally) provision accounts → start the server.
 * If migration fails, or a requested bootstrap fails, it returns a non-zero
 * result and the server is never started. Passwords are never logged: bootstrap
 * results are already redacted, and this module only ever logs role + redacted
 * email + outcome.
 */

export interface StartupBootstrapResult {
  role: string;
  emailRedacted: string;
  outcome: string;
}

export interface StartupLogger {
  info: (message: string) => void;
  error: (message: string) => void;
}

export interface StartupDeps {
  env: NodeJS.ProcessEnv;
  migrate: () => Promise<void>;
  bootstrap: () => Promise<StartupBootstrapResult[]>;
  startServer: () => void | Promise<void>;
  logger: StartupLogger;
}

export interface StartupResult {
  ok: boolean;
  code: number;
  phase: "migrate" | "bootstrap" | "served";
  serverStarted: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runStartup(deps: StartupDeps): Promise<StartupResult> {
  const { env, logger } = deps;

  logger.info("[startup] Applying database migrations…");
  try {
    await deps.migrate();
  } catch (error) {
    logger.error(`[startup] Migration failed; server will not start: ${errorMessage(error)}`);
    return { ok: false, code: 1, phase: "migrate", serverStarted: false };
  }
  logger.info("[startup] Migrations applied.");

  if (env.LABEL_LENS_BOOTSTRAP_ON_START === "1") {
    const reset = env.LABEL_LENS_BOOTSTRAP_RESET_PASSWORDS === "1";
    logger.info(
      `[startup] LABEL_LENS_BOOTSTRAP_ON_START=1 — provisioning accounts${reset ? " (password reset enabled)" : ""}…`,
    );
    try {
      const results = await deps.bootstrap();
      for (const result of results) {
        logger.info(`[startup] ${result.role} ${result.emailRedacted} → ${result.outcome}`);
      }
    } catch (error) {
      // The bootstrap layer never includes a password in its errors (it validates
      // env keys by name, and redacts emails), so this message is safe to log.
      logger.error(`[startup] Bootstrap failed; server will not start: ${errorMessage(error)}`);
      return { ok: false, code: 1, phase: "bootstrap", serverStarted: false };
    }
  } else {
    logger.info(
      "[startup] Startup bootstrap disabled (set LABEL_LENS_BOOTSTRAP_ON_START=1 to enable).",
    );
  }

  logger.info("[startup] Starting the production server…");
  await deps.startServer();
  return { ok: true, code: 0, phase: "served", serverStarted: true };
}
