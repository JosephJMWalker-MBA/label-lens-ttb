import "server-only";

import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";

/**
 * Server-only authorization layer.
 *
 * Every authorization decision here is made from the database-backed Better Auth
 * session — never from request JSON, form input, query strings, cookie payloads,
 * or any client-provided role/user id. Missing, expired, malformed, or revoked
 * sessions fail closed. Page guards redirect; API guards return 401/403 without
 * leaking whether inaccessible submissions exist.
 *
 * This module imports `server-only`, so it cannot be bundled into a client
 * component.
 */

export const ROLES = ["seller", "agent", "admin"] as const;
export type Role = (typeof ROLES)[number];

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/** Where each role lands after login. */
export function roleLandingPath(role: Role): "/seller" | "/agent" | "/admin" {
  switch (role) {
    case "agent":
      return "/agent";
    case "admin":
      return "/admin";
    default:
      return "/seller";
  }
}

/** Lowercase + trim for consistent identity and lookups. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Redact an email for logs: keep the first char and the domain. */
export function redactEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  return `${email[0]}***${email.slice(at)}`;
}

function toSessionUser(session: unknown): SessionUser | null {
  const user = (session as { user?: Record<string, unknown> } | null)?.user;
  if (!user || typeof user.id !== "string" || typeof user.email !== "string") return null;
  if (!isRole(user.role)) return null; // unknown/missing role fails closed
  return {
    id: user.id,
    email: user.email,
    name: typeof user.name === "string" ? user.name : null,
    role: user.role,
  };
}

/** Read the current session from request headers (API routes). */
export async function readSessionFromHeaders(headers: Headers): Promise<SessionUser | null> {
  try {
    const session = await auth.api.getSession({ headers });
    return toSessionUser(session);
  } catch {
    return null; // fail closed on any session-resolution error
  }
}

/** Read the current session inside a server component / route using next/headers. */
export async function readSession(): Promise<SessionUser | null> {
  const h = await nextHeaders();
  return readSessionFromHeaders(h as unknown as Headers);
}

// ---- Page guards (server components) ----

/**
 * Require an authenticated user with one of `allowedRoles` in a server
 * component. Redirects to /login when signed out and to /unauthorized on a role
 * mismatch. Returns the session user when authorized.
 */
export async function requireRolePage(allowedRoles: readonly Role[]): Promise<SessionUser> {
  const user = await readSession();
  if (!user) {
    const h = await nextHeaders();
    const path = h.get("x-pathname");
    redirect(path ? `/login?returnTo=${encodeURIComponent(path)}` : "/login");
  }
  if (!allowedRoles.includes(user.role)) {
    redirect("/unauthorized");
  }
  return user;
}

// ---- API guards (route handlers) ----

export type ApiAuth = { ok: true; user: SessionUser } | { ok: false; response: NextResponse };

function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Authentication required." }, { status: 401 });
}

function forbidden(): NextResponse {
  return NextResponse.json({ error: "You do not have access to this resource." }, { status: 403 });
}

/** Require any authenticated user in an API route. */
export async function requireApiSession(request: Request): Promise<ApiAuth> {
  const user = await readSessionFromHeaders(request.headers);
  if (!user) return { ok: false, response: unauthorized() };
  return { ok: true, user };
}

/** Require an authenticated user with one of `allowedRoles` in an API route. */
export async function requireApiRole(
  request: Request,
  allowedRoles: readonly Role[],
): Promise<ApiAuth> {
  const user = await readSessionFromHeaders(request.headers);
  if (!user) return { ok: false, response: unauthorized() };
  if (!allowedRoles.includes(user.role)) return { ok: false, response: forbidden() };
  return { ok: true, user };
}
