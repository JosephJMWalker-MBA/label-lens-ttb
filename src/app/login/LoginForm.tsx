"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { safeInternalPath } from "@/lib/redirect-safety";
import { roleLandingClient } from "./role-landing";

/**
 * Email/password sign-in. It reveals nothing about whether an email exists:
 * every credential failure shows the same generic message, and any unexpected
 * failure shows a safe generic server error. On success it routes by the
 * server-resolved role (or a validated same-origin `returnTo`).
 */
export function LoginForm({ returnTo }: { returnTo?: string }) {
  const router = useRouter();
  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "invalid" | "error">("idle");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");

    const result = await authClient.signIn.email({ email: email.trim(), password });

    if (result.error) {
      // Do not distinguish "no such user" from "wrong password", and treat any
      // non-credential failure as a safe generic error.
      const code = result.error.status;
      setStatus(code === 401 || code === 400 ? "invalid" : "error");
      return;
    }

    // Resolve the trusted role from the freshly established session, then route.
    const session = await authClient.getSession();
    const role = session.data?.user?.role;
    const landing = roleLandingClient(role);
    router.replace(safeInternalPath(returnTo, landing));
    router.refresh();
  }

  const errorMessage =
    status === "invalid"
      ? "The email or password is incorrect."
      : status === "error"
        ? "Something went wrong signing you in. Please try again."
        : null;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={emailId}>Email</Label>
        <Input
          id={emailId}
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={status === "invalid"}
          aria-describedby={errorMessage ? errorId : undefined}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={passwordId}>Password</Label>
        <Input
          id={passwordId}
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={status === "invalid"}
          aria-describedby={errorMessage ? errorId : undefined}
        />
      </div>

      {errorMessage ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {errorMessage}
        </p>
      ) : null}

      <Button type="submit" disabled={status === "submitting"} className="mt-1">
        {status === "submitting" ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
