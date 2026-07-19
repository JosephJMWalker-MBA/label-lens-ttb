"use client";

import Link from "next/link";
import { useEffect } from "react";

import { authClient } from "@/lib/auth-client";

const LINK_CLASS =
  "rounded-md px-2.5 py-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * Auth-aware navigation for public pages, built with progressive enhancement:
 * a functional "Sign in" link is ALWAYS rendered by default and is only
 * replaced by role-aware links once a valid authenticated session is confirmed.
 *
 * - Loading: keep "Sign in" visible with a subtle, aria-hidden indicator.
 * - Session lookup error: degrade to the same signed-out "Sign in" header.
 * - Signed in: show the correct role landing and "Sign out".
 *
 * It reflects session state for display only — every authorization decision is
 * still made server-side from the database-backed session. A browser-provided
 * role is never trusted for authorization.
 */
export function AuthStatusNav() {
  const { data, isPending, error } = authClient.useSession();

  useEffect(() => {
    if (error) {
      // Safe diagnostic only: the HTTP status category. Never cookies, tokens,
      // passwords, secrets, database URLs, or email addresses.
      const status = (error as { status?: number }).status ?? "unknown";
      console.warn("[auth-nav] session lookup failed; showing signed-out header", { status });
    }
  }, [error]);

  const role = data?.user?.role;
  const knownRole = role === "seller" || role === "agent" || role === "admin";
  const authenticated = Boolean(data?.user && knownRole);

  // Default + fallback: the only authentication entry point is always present.
  if (!authenticated) {
    return (
      <span className="flex items-center gap-1">
        <Link href="/login" className={LINK_CLASS} data-testid="sign-in">
          Sign in
        </Link>
        {isPending ? (
          <span
            aria-hidden="true"
            data-testid="session-loading"
            className="px-1 text-xs text-muted-foreground"
          >
            …
          </span>
        ) : null}
      </span>
    );
  }

  const home =
    role === "agent"
      ? { href: "/agent", label: "Agent queue" }
      : role === "admin"
        ? { href: "/admin", label: "Admin" }
        : { href: "/seller", label: "My submissions" };

  async function handleSignOut() {
    await authClient.signOut();
    // Full navigation discards any cached protected content once the session is gone.
    window.location.href = "/login";
  }

  return (
    <span className="flex items-center gap-1">
      <Link href={home.href} className={LINK_CLASS}>
        {home.label}
      </Link>
      <button type="button" onClick={handleSignOut} className={LINK_CLASS}>
        Sign out
      </button>
    </span>
  );
}
