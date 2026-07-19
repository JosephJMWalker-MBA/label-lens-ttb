"use client";

import Link from "next/link";

import { authClient } from "@/lib/auth-client";

/**
 * Auth-aware navigation shown on public pages. It reflects session state for
 * display only — every authorization decision is still made server-side from the
 * database-backed session. Signed out shows "Sign in"; signed in shows a role
 * home link plus "Sign out".
 */
export function AuthStatusNav() {
  const { data, isPending } = authClient.useSession();

  const linkClass =
    "rounded-md px-2.5 py-1.5 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

  if (isPending) {
    return <span className="px-2.5 py-1.5 text-sm text-muted-foreground">…</span>;
  }

  const role = data?.user?.role;
  if (!data?.user || !role) {
    return (
      <Link href="/login" className={linkClass}>
        Sign in
      </Link>
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
      <Link href={home.href} className={linkClass}>
        {home.label}
      </Link>
      <button type="button" onClick={handleSignOut} className={linkClass}>
        Sign out
      </button>
    </span>
  );
}
