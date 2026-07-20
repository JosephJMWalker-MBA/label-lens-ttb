import Link from "next/link";
import type { Metadata } from "next";

import { readSession, roleLandingPath } from "@/server/auth/guards";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Access restricted — Label Lens",
};

export default async function UnauthorizedPage() {
  const user = await readSession();
  const homeHref = user ? roleLandingPath(user.role) : "/login";
  const homeLabel = user ? "Go to your workspace" : "Go to sign in";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-14 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">Access restricted</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Your account does not have access to that area.
      </p>
      <div className="mt-6">
        <Link
          href={homeHref}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {homeLabel}
        </Link>
      </div>
    </main>
  );
}
