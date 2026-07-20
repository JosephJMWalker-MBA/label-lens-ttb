import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  return auth.handler(request);
}

export async function POST(request: Request) {
  const url = new URL(request.url);

  // Intercept and block any public email credentials signup attempt. Better Auth
  // exposes this as `/sign-up/email`; older callers may use `/signup/email`.
  // Seller accounts are provisioned administratively, never self-registered.
  if (/\/sign-?up(\/|$)/.test(url.pathname)) {
    return NextResponse.json(
      { error: "Public seller registration is disabled. Accounts must be provisioned." },
      { status: 403 },
    );
  }

  return auth.handler(request);
}
