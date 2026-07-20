import { and, eq } from "drizzle-orm";

import type { Role } from "@/server/auth/guards";

/**
 * Idempotent, secret-safe provisioning of the demonstration accounts from
 * environment variables. It never prints plaintext passwords, redacts emails in
 * output, creates accounts through Better Auth's supported password API (so
 * hashing stays compatible), corrects an existing account's role, and — only
 * with an explicit flag — resets an existing password. It is safe to run
 * repeatedly.
 */

const MIN_PASSWORD_LENGTH = 12;
const ROLE_ORDER: Role[] = ["admin", "agent", "seller"];

export interface AccountSpec {
  role: Role;
  email: string;
  password: string;
  name: string;
}

export type BootstrapOutcome =
  | "created"
  | "already-present"
  | "role-corrected"
  | "password-reset"
  | "role-corrected+password-reset";

export interface BootstrapResult {
  role: Role;
  emailRedacted: string;
  outcome: BootstrapOutcome;
}

export class BootstrapConfigError extends Error {}

// Local helpers (kept free of server-only/next imports so the CLI can run as a plain script).
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function redactEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const ENV_KEYS: Record<Role, { email: string; password: string; name: string }> = {
  admin: {
    email: "LABEL_LENS_BOOTSTRAP_ADMIN_EMAIL",
    password: "LABEL_LENS_BOOTSTRAP_ADMIN_PASSWORD",
    name: "LABEL_LENS_BOOTSTRAP_ADMIN_NAME",
  },
  agent: {
    email: "LABEL_LENS_BOOTSTRAP_AGENT_EMAIL",
    password: "LABEL_LENS_BOOTSTRAP_AGENT_PASSWORD",
    name: "LABEL_LENS_BOOTSTRAP_AGENT_NAME",
  },
  seller: {
    email: "LABEL_LENS_BOOTSTRAP_SELLER_EMAIL",
    password: "LABEL_LENS_BOOTSTRAP_SELLER_PASSWORD",
    name: "LABEL_LENS_BOOTSTRAP_SELLER_NAME",
  },
};

const DEFAULT_NAMES: Record<Role, string> = {
  admin: "Label Lens Demo Admin",
  agent: "Label Lens Review Agent",
  seller: "Label Lens Seller",
};

/**
 * Build validated account specs from the environment. Fails closed (throws
 * BootstrapConfigError) listing every missing or invalid value — without echoing
 * any password.
 */
export function parseSpecsFromEnv(env: NodeJS.ProcessEnv): AccountSpec[] {
  const problems: string[] = [];
  const specs: AccountSpec[] = [];

  for (const role of ROLE_ORDER) {
    const keys = ENV_KEYS[role];
    const rawEmail = env[keys.email];
    const password = env[keys.password];
    const name = env[keys.name]?.trim() || DEFAULT_NAMES[role];

    if (!rawEmail || rawEmail.trim() === "") {
      problems.push(`${keys.email} is required`);
    }
    if (!password || password === "") {
      problems.push(`${keys.password} is required`);
    }

    if (rawEmail && rawEmail.trim() !== "") {
      const email = normalizeEmail(rawEmail);
      if (!isValidEmail(email)) problems.push(`${keys.email} is not a valid email address`);
      if (password && password.length < MIN_PASSWORD_LENGTH) {
        problems.push(`${keys.password} must be at least ${MIN_PASSWORD_LENGTH} characters`);
      }
      if (password && password.length >= MIN_PASSWORD_LENGTH && isValidEmail(email)) {
        specs.push({ role, email, password, name });
      }
    }
  }

  if (problems.length > 0) {
    throw new BootstrapConfigError(
      `Bootstrap configuration invalid:\n - ${problems.join("\n - ")}`,
    );
  }

  return specs;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface BootstrapDeps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  auth: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any;
}

async function findUserByEmail(deps: BootstrapDeps, email: string) {
  const rows = (await deps.db
    .select({ id: deps.schema.users.id, role: deps.schema.users.role })
    .from(deps.schema.users)
    .where(eq(deps.schema.users.email, email))
    .limit(1)) as { id: string; role: string }[];
  return rows[0] ?? null;
}

async function resetPassword(deps: BootstrapDeps, userId: string, password: string): Promise<void> {
  const ctx = await deps.auth.$context;
  const hashed = await ctx.password.hash(password);
  await deps.db
    .update(deps.schema.accounts)
    .set({ password: hashed })
    .where(
      and(
        eq(deps.schema.accounts.userId, userId),
        eq(deps.schema.accounts.providerId, "credential"),
      ),
    );
}

async function provisionAccount(
  deps: BootstrapDeps,
  spec: AccountSpec,
  resetPasswords: boolean,
): Promise<BootstrapResult> {
  const emailRedacted = redactEmail(spec.email);
  const existing = await findUserByEmail(deps, spec.email);

  if (!existing) {
    // Create through Better Auth so the password is hashed compatibly. The server
    // API is not the public sign-up route; no browser route exposes it.
    await deps.auth.api.signUpEmail({
      body: { email: spec.email, password: spec.password, name: spec.name },
    });
    const created = await findUserByEmail(deps, spec.email);
    if (created && spec.role !== "seller") {
      await deps.db
        .update(deps.schema.users)
        .set({ role: spec.role })
        .where(eq(deps.schema.users.id, created.id));
    }
    return { role: spec.role, emailRedacted, outcome: "created" };
  }

  let roleCorrected = false;
  if (existing.role !== spec.role) {
    await deps.db
      .update(deps.schema.users)
      .set({ role: spec.role })
      .where(eq(deps.schema.users.id, existing.id));
    roleCorrected = true;
  }

  let passwordReset = false;
  if (resetPasswords) {
    await resetPassword(deps, existing.id, spec.password);
    passwordReset = true;
  }

  const outcome: BootstrapOutcome =
    roleCorrected && passwordReset
      ? "role-corrected+password-reset"
      : roleCorrected
        ? "role-corrected"
        : passwordReset
          ? "password-reset"
          : "already-present";

  return { role: spec.role, emailRedacted, outcome };
}

export interface RunBootstrapOptions {
  env: NodeJS.ProcessEnv;
  resetPasswords?: boolean;
}

/** Provision all configured accounts. Returns per-account results. */
export async function runBootstrap(
  deps: BootstrapDeps,
  options: RunBootstrapOptions,
): Promise<BootstrapResult[]> {
  const specs = parseSpecsFromEnv(options.env);
  const resetPasswords =
    options.resetPasswords ?? options.env.LABEL_LENS_BOOTSTRAP_RESET_PASSWORDS === "1";

  const results: BootstrapResult[] = [];
  for (const spec of specs) {
    results.push(await provisionAccount(deps, spec, resetPasswords));
  }
  return results;
}
