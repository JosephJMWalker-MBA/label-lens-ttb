import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware improves UX only — it is NOT the authorization boundary. It
 * redirects apparently signed-out visitors away from the protected page groups
 * to /login (with a same-origin returnTo), and exposes the request path to
 * server components via `x-pathname`. Every protected page and API route still
 * re-checks the database-backed session and role server-side, and API routes
 * return 401/403 rather than being redirected to HTML.
 */

const PROTECTED_PREFIXES = ["/seller", "/agent", "/admin"];

function looksSignedIn(request: NextRequest): boolean {
  // Presence check only (not validity): the server guards verify the session.
  for (const cookie of request.cookies.getAll()) {
    if (cookie.name.includes("better-auth.session_token") && cookie.value) return true;
  }
  return false;
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);

  const isProtectedPage = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtectedPage && !looksSignedIn(request)) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("returnTo", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  // Never run on API routes (they must return JSON 401/403, not HTML redirects),
  // Next internals, or static assets.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
