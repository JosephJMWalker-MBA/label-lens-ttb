import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  return auth.handler(request);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  
  // Intercept and block any email credentials signup attempts
  if (url.pathname.endsWith("/signup/email")) {
    return NextResponse.json(
      { error: "Public seller registration is disabled. Accounts must be provisioned." },
      { status: 403 }
    );
  }
  
  return auth.handler(request);
}
