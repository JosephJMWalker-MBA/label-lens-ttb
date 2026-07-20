/**
 * Client-safe role → landing path. Used only to choose where to send the browser
 * after a successful sign-in; it is not an authorization decision (each landing
 * page re-checks the role server-side). Kept free of server-only imports so it
 * can be used in the login form.
 */
export function roleLandingClient(role: unknown): "/seller" | "/agent" | "/admin" {
  if (role === "agent") return "/agent";
  if (role === "admin") return "/admin";
  return "/seller";
}
