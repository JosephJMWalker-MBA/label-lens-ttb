"use client";

import Link from "next/link";
import { useEffect } from "react";

import { authClient } from "@/lib/auth-client";

/**
 * Viewport-sticky account bar shown on public pages. Built with progressive
 * enhancement so the single authentication entry point is ALWAYS available:
 *
 * - Server-rendered / pre-hydration / pending / lookup-error: a real, prominent
 *   blue "Sign in" link to the relative path `/login`. It is never replaced by an
 *   ellipsis or an indefinite loading placeholder.
 * - Confirmed session with a trusted database role: the role landing link plus
 *   "Sign out".
 *
 * The role is used for display only — every authorization decision is still made
 * server-side from the database-backed session. No hostname is hardcoded: the
 * link is a relative path, so it works identically on any origin.
 *
 * On mount it flags `document.body[data-account-bar="open"]`, which reserves
 * bottom padding (so the bar never covers content) and lifts any page-level fixed
 * action footer above it (see globals.css). The flag is cleared on unmount.
 */
export function AccountBar() {
  const { data, isPending, error } = authClient.useSession();

  useEffect(() => {
    const { body } = document;
    body.dataset.accountBar = "open";
    return () => {
      delete body.dataset.accountBar;
    };
  }, []);

  useEffect(() => {
    if (error) {
      // Safe diagnostic only: the HTTP status category. Never cookies, tokens,
      // passwords, secrets, database URLs, or email addresses.
      const status = (error as { status?: number }).status ?? "unknown";
      console.warn("[account-bar] session lookup failed; showing signed-out bar", { status });
    }
  }, [error]);

  const role = data?.user?.role;
  const knownRole = role === "seller" || role === "agent" || role === "admin";
  const authenticated = Boolean(data?.user && knownRole);

  async function handleSignOut() {
    await authClient.signOut();
    // Full navigation discards any cached protected content once the session is gone.
    window.location.href = "/login";
  }

  if (!authenticated) {
    return (
      <nav aria-label="Account" className="account-bar" data-testid="account-bar">
        <span className="account-bar__label">Review team &amp; seller access</span>
        <span className="flex items-center gap-2">
          {isPending ? (
            <span
              aria-hidden="true"
              data-testid="account-bar-loading"
              className="processing-spinner h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent opacity-60"
            />
          ) : null}
          <Link href="/login" className="account-action" data-testid="account-bar-sign-in">
            Sign in
          </Link>
        </span>
      </nav>
    );
  }

  const home =
    role === "agent"
      ? { href: "/agent", label: "Agent queue" }
      : role === "admin"
        ? { href: "/admin", label: "Admin portal" }
        : { href: "/seller", label: "My submissions" };

  return (
    <nav aria-label="Account" className="account-bar" data-testid="account-bar">
      <button type="button" onClick={handleSignOut} className="account-link">
        Sign out
      </button>
      <Link href={home.href} className="account-action" data-testid="account-bar-home">
        {home.label}
      </Link>
    </nav>
  );
}
