/**
 * CLI: provision the demonstration accounts from environment variables.
 *
 *   DATABASE_URL=mysql://... \
 *   LABEL_LENS_BOOTSTRAP_ADMIN_EMAIL=... LABEL_LENS_BOOTSTRAP_ADMIN_PASSWORD=... \
 *   ...agent/seller... \
 *   npm run auth:bootstrap
 *
 * Add LABEL_LENS_BOOTSTRAP_RESET_PASSWORDS=1 to reset existing passwords.
 * Passwords are never printed; emails are redacted in output.
 */
import { auth } from "@/lib/auth";
import { db, schema } from "@/db/client";
import { BootstrapConfigError, runBootstrap } from "@/server/auth/bootstrap";

async function main() {
  try {
    const results = await runBootstrap({ auth, db, schema }, { env: process.env });
    for (const result of results) {
      console.log(
        `[bootstrap] ${result.role.padEnd(6)} ${result.emailRedacted} → ${result.outcome}`,
      );
    }
    console.log(`[bootstrap] done: ${results.length} account(s) processed.`);
    process.exit(0);
  } catch (error) {
    if (error instanceof BootstrapConfigError) {
      console.error(`[bootstrap] ${error.message}`);
      process.exit(1);
    }
    console.error("[bootstrap] failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

void main();
