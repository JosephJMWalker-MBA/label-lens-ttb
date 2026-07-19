# ADR 0010: Authentication and Session Architecture

- Status: Accepted
- Date: 2026-07-18

## Context

We need an authentication and session mechanism for internal agents and administrators to access the review portal, manage the submission queue, and record decisions. Sellers will remain anonymous but must have secure read-only access to their specific submission status.

The staging and production environments are deployed as Next.js standalone Node.js servers on Hostinger. Hostinger does not provide managed identity or authentication services (like AWS Cognito or GCP Identity Platform). Therefore, we need a self-contained, stateless, and lightweight authentication mechanism that doesn't rely on third-party cloud identity providers or incur monthly subscription costs (such as Clerk or Auth0).

## Decision

We will implement a custom, stateless, cookie-based session architecture using JSON Web Tokens (JWT) verified inside Next.js Middleware:

1. **Agent Authentication:** Agents log in via a password-based credentials form. Password hashes are verified server-side against the database using a secure hashing algorithm (bcrypt/argon2).
2. **Stateless JWT Sessions:** Upon successful login, the server issues a JWT containing the user's ID, email, role (`agent` or `admin`), and session expiration.
3. **Secure Cookie Delivery:** The JWT is stored in an `HttpOnly`, `Secure` (in non-development environments), `SameSite=Strict` cookie named `session_token`.
4. **Fail-Closed Middleware:** A Next.js Middleware catches all requests to `/api/agent/*` and `/review/*`. If the cookie is missing or has an invalid signature, the request is immediately rejected with a `401 Unauthorized` response or redirected to `/login`.
5. **Seller Access:** Sellers do not create accounts. Instead, they receive a unique cryptographically secure `possession_token` upon package submission. Access to specific status APIs requires matching this token in the `X-Possession-Token` header.

## Consequences

Positive:
- Zero external dependencies or subscription costs.
- Stateless design requires no database lookups for session verification, reducing database load.
- Seamless compatibility with Next.js standalone server deployments.
- Fail-closed middleware simplifies access control code inside API routes.

Trade-offs:
- Session revocation (e.g., logging out a compromised user immediately before JWT expiration) is harder. We mitigate this by setting a short session lifetime (12 hours) and requiring re-authentication.

## Revisit Conditions

Revisit this decision if:
- The team scales beyond a small group of internal agents and requires Enterprise Single Sign-On (SAML/OIDC).
- The system must support advanced access policies such as multi-factor authentication (MFA) or device fingerprinting.
