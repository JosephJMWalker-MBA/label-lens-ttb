# ADR 0010: Authentication and Session Architecture

- Status: Proposed
- Date: 2026-07-18

## Context

We need an authentication and session mechanism for all roles interacting with the platform: Sellers, Agents, and Administrators. 
Sellers need authenticated accounts to create, review, and edit their submissions securely. Agents and Admins need authenticated accounts to access the review queue, claim reviews, and record decisions.

The staging and production environments are deployed as Next.js standalone Node.js servers on Hostinger. Because Hostinger does not provide managed identity or authentication services, we need a self-contained, database-backed authentication and session library.

To ensure high security, session management must:
1. Support database-backed sessions to allow administrators or users to audit and revoke active sessions instantly.
2. Prevent single-point middleware authorization bypasses by enforcing strict role and ownership checks inside every sensitive API route handler.
3. Authenticate sellers directly rather than relying on anonymous possession-token links, ensuring robust data isolation and ownership verification.

## Evaluation of Authentication Options

We evaluated three potential authentication architectures:

### 1. Custom Stateless JWT (Cookie-Based)
* **Description:** Hand-rolled Next.js Middleware parsing cookies containing custom signed JWTs.
* **Why it was considered:** Extremely lightweight, zero dependencies, simple initial setup.
* **Why it was rejected:** Revocation of active sessions requires complex token blacklist databases. Hand-rolling security logic increases the risk of cryptographic errors, session hijacking, or CSRF vulnerabilities. It does not scale well to multiple user roles and lacks built-in support for standard authentication events.

### 2. Auth.js (NextAuth.js v5)
* **Description:** The industry standard Next.js authentication library.
* **Why it was considered:** Broad ecosystem adoption, native database adapters, supports credentials provider.
* **Why it was rejected:** NextAuth v5 (currently in beta/release candidate state) has known compatibility and configuration complexities under Next.js 15 and React 19, particularly in standalone output mode and with credentials-based authentication.

### 3. Better Auth
* **Description:** A modern, type-safe authentication framework for TypeScript.
* **Why it was considered:** 
  - Native database-backed session management out-of-the-box.
  - Complete support for React 19 and Next.js 15 standalone Node environments.
  - Clean API for credentials-based login and role management.
  - Out-of-the-box database adapter support for Prisma.
* **Recommendation:** **Better Auth** is selected as the primary authentication library.

## Decision

We will implement a database-backed, role-based authentication system using **Better Auth**:

1. **Role Classification:** Every user is represented in a `User` table with a specific `role` ENUM (`seller`, `agent`, `admin`).
2. **Database-Backed Sessions:** Sessions are stored in the database (`Session` table) and associated with a unique session token. Session verification requires querying the database, enabling real-time session revocation.
3. **Authenticated Sellers:** Sellers must log in to create and manage submissions. All submissions are linked directly to the creator's `user_id`. Anonymous or unauthenticated package submissions are prohibited.
4. **Endpoint-Level Authorization:** Next.js Middleware acts as a first-line routing guard to redirect unauthenticated requests. However, **every sensitive API route must perform inline authorization** (verifying the active session, verifying the user's role, and confirming ownership of the target resource) before processing any data or state changes.
5. **Session Cookies:** Signed session tokens are delivered via `HttpOnly`, `Secure`, `SameSite=Lax` cookies managed by Better Auth.

## Consequences

Positive:
- Standardized, secure authentication library reduces the risk of security vulnerabilities.
- Real-time session revocation capability protects the system if user credentials or devices are compromised.
- Authenticated sellers guarantee robust ownership verification, preventing IDOR attacks on package submissions.
- Defense-in-depth security model: middleware route protection is backed up by endpoint-level role and resource-ownership checks.

Trade-offs:
- Authenticating every API request requires a database query. This latency overhead is acceptable given the internal nature and scale of the portal, and can be optimized in the future using Redis or in-memory caches if necessary.
