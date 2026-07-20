# Hostname promotion runbook (staging → production)

Label Lens is portable between origins through **environment configuration
only**. Nothing in source, storage, auth, navigation, cookies, redirects, or
account identity depends on a specific hostname:

- internal links are relative paths;
- login redirects are validated same-origin paths (`safeInternalPath`);
- the auth origin comes from `BETTER_AUTH_URL` (no `baseURL` is hardcoded);
- session cookies are **host-only** by default (no cookie `domain` is pinned to
  `.ttb-test.com`);
- user, submission, revision, and storage identities never encode a hostname.

This is enforced by `src/lib/hostname-portability.test.ts`, which fails the build
if any staging/production hostname literal appears in application source and
proves internal redirect validation is origin-agnostic across two origins.

## Promotion steps: `pr143.ttb-test.com` → `ttb-test.com`

1. **Final validation on staging.** Confirm `/login` works, all three
   provisioned accounts sign in and land on their role home, the agent queue is
   MySQL-backed, and `/review` cold-loads to a usable workspace.
2. **Change the auth origin.** Set `BETTER_AUTH_URL=https://ttb-test.com` in the
   production environment.
3. **Point deployment / DNS** at the production hostname.
4. **Verify cookies and login.** Sign in on the new origin. Because cookies are
   host-only, an existing staging browser session does **not** carry over — one
   fresh login on the new hostname is expected. Database identities are unchanged.
5. **Verify the same accounts and data.** The same MySQL accounts, passwords,
   roles, submissions, history, and decisions work unchanged — the database is
   not recreated by a hostname change.
6. **Remove the bootstrap flag.** Once accounts exist, remove
   `LABEL_LENS_BOOTSTRAP_ON_START` from the production environment (see the
   startup-bootstrap section of [deployment.md](../deployment.md)). Startup then
   only applies migrations and serves.

## What must NOT be done

- Do not pin a cookie `domain` (e.g. `.ttb-test.com`) unless a documented
  cross-subdomain sign-in requirement exists; host-only cookies keep staging and
  production sessions isolated.
- Do not encode the hostname into IDs, storage keys, or database rows.
- Do not treat any `pr143` filename or directory as a production dependency.
