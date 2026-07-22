# Limitations

## External access limitations

This repo-side pass did not have direct Hostinger dashboard, deployment artifact, environment variable, or production DB credential access.

Therefore it cannot confirm:

- the exact internal bootstrap exception from the failed bootstrap-enabled run;
- whether the historical failing row is unchanged at the database level beyond the maintainer's no-modification confirmation and this agent's non-interaction with it.

The maintainer did confirm recovered runtime logs, migration application, `MEDIUMTEXT NOT NULL`, account aggregates, no historical-row modification, and the stored canonical byte-length/digest comparison for the new synthetic submission.

## Local validation limitations

This separate worktree has no `node_modules` and no `.next/standalone` artifact. I did not install dependencies or build the app in this pass because the requested scope is deployment/artifact verification and no code defect was independently proven.

Validation included source inspection, GitHub Issue #162 body/comments, live HTTPS app/API verification, artifact creation, shell syntax, script syntax, and git diff hygiene.

## Documentation drift noted

Some older deployment/security text still says uploads are not persisted or no persistent storage is required. Current package finalization code requires `LABEL_LENS_STORAGE_DIR` in production to persist verified panel assets and issue receipts. This is a finalization/integrity-verification blocker if unset; it does not explain `/api/health` returning 503 by itself.

## Uncertainty handling

The absence of Hostinger runtime logs is documented as evidence. It is not treated as proof of a root cause.

No speculative logging, migration weakening, auth weakening, or integrity bypass was made. Codex did not directly change production configuration or initiate a deployment; the maintainer made the single controlled bootstrap flag change and redeployed/restarted. The Better Auth proxy/IP warning is documented as a separate non-blocking follow-up, not changed here.
