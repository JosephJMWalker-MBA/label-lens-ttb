import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { ProductMark } from "@/components/brand/ProductMark";
import { readSession, roleLandingPath } from "@/server/auth/guards";
import { safeInternalPath } from "@/lib/redirect-safety";
import { PORTAL_DISCLAIMER } from "@/lib/product-language";

import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in — Label Lens",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { returnTo } = await searchParams;

  // Already signed in: send to a validated same-origin path or the role landing.
  const user = await readSession();
  if (user) {
    redirect(safeInternalPath(returnTo, roleLandingPath(user.role)));
  }

  const safeReturnTo = returnTo ? safeInternalPath(returnTo, "") : "";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-14">
      <Link
        href="/"
        aria-label="Label Lens — go to the start"
        className="mb-8 flex items-center gap-2.5 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <ProductMark className="h-6 w-6 text-muted-foreground" />
        <span className="text-sm font-semibold uppercase tracking-wide">Label Lens</span>
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">Sign in to Label Lens</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">
        Use your provisioned review-team or seller account.
      </p>

      <div className="mt-8">
        <LoginForm returnTo={safeReturnTo || undefined} />
      </div>

      <p className="mt-8 border-t border-border/70 pt-4 text-xs text-muted-foreground">
        {PORTAL_DISCLAIMER}
      </p>
    </main>
  );
}
