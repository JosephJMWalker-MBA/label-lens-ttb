"use client";

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";

/**
 * Browser auth client. It only performs sign-in and sign-out against the Better
 * Auth handler; it never carries a trusted role. Authorization is always decided
 * server-side from the database-backed session (see `src/server/auth/guards.ts`).
 *
 * `inferAdditionalFields` types the custom `role` field for display purposes
 * only — it is never a trust boundary.
 */
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields({ user: { role: { type: "string" } } })],
});

export const { signIn, signOut, useSession } = authClient;
