"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

/**
 * Signs the user out by revoking the Better Auth session (which clears the
 * session cookie), then hard-navigates to /login. A full navigation (not a
 * client push) discards any cached protected content from the back-forward
 * cache once the session is gone.
 */
export function LogoutButton({ className }: { className?: string }) {
  const [pending, setPending] = useState(false);

  async function handleLogout() {
    setPending(true);
    try {
      await authClient.signOut();
    } finally {
      // Full navigation regardless: the cookie is cleared server-side on success,
      // a failed sign-out should still return to /login, and a hard navigation
      // discards any cached protected content from the back-forward cache.
      window.location.href = "/login";
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleLogout}
      disabled={pending}
      className={className}
    >
      {pending ? "Signing out…" : "Sign out"}
    </Button>
  );
}
