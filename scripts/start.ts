/**
 * Production start path.
 *
 * Runs migrations, optionally provisions the demo accounts (when
 * LABEL_LENS_BOOTSTRAP_ON_START=1), then starts the Next.js production server.
 * Exits non-zero — before the server ever starts — if migration or a requested
 * bootstrap fails. Passwords are never printed.
 *
 * Invoked as the deployment's start command so it runs inside the app runtime
 * (with Node, the app directory, and the configured environment), which is the
 * only place staging can reach.
 */
import { spawn } from "node:child_process";

import { auth } from "@/lib/auth";
import { db, schema } from "@/db/client";
import { applyMigrations } from "@/server/migrate";
import { runBootstrap } from "@/server/auth/bootstrap";
import { runStartup } from "@/server/startup";

function startNextServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["next", "start"], { stdio: "inherit", env: process.env });

    const forward = (signal: NodeJS.Signals) => () => child.kill(signal);
    const onTerm = forward("SIGTERM");
    const onInt = forward("SIGINT");
    process.on("SIGTERM", onTerm);
    process.on("SIGINT", onInt);

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      process.off("SIGTERM", onTerm);
      process.off("SIGINT", onInt);
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }
      process.exit(code ?? 0);
    });
  });
}

async function main() {
  const result = await runStartup({
    env: process.env,
    migrate: () => applyMigrations(process.env.DATABASE_URL ?? ""),
    bootstrap: () => runBootstrap({ auth, db, schema }, { env: process.env }),
    startServer: startNextServer,
    logger: {
      info: (message) => console.log(message),
      error: (message) => console.error(message),
    },
  });

  if (!result.ok) process.exit(result.code);
}

void main();
