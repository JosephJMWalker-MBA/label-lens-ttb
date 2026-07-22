# Insertion Path Inventory

## Revision writers

| Path | Scope | Canonical bytes signed | Canonical bytes stored | Secret source | Stable-secret absence behavior |
| --- | --- | --- | --- | --- | --- |
| Seller finalize API | Production | `canonicalString` computed from the parsed package payload with `integrity` removed. Evidence: `src/app/api/package/submit/finalize/route.ts:333-338`. | The exact same `canonicalString` variable is inserted as `canonicalJson` in SQLite and MySQL transaction branches. Evidence: `src/app/api/package/submit/finalize/route.ts:428-439`, `src/app/api/package/submit/finalize/route.ts:528-538`. | `LABEL_LENS_INTEGRITY_SECRET` through `signRevision`. Production missing/short secret throws. | Production fails during signing before DB commit; non-production without explicit secret still uses process-local dev fallback. |
| E2E seed script | Test/demo seed | `canonicalJson = JSON.stringify({ submissionId: id, revision: 1 })`. Evidence: `scripts/e2e-seed.ts:57-82`. | The exact same `canonicalJson` variable is inserted as `canonicalJson`. Evidence: `scripts/e2e-seed.ts:72-82`. | `LABEL_LENS_INTEGRITY_SECRET` checked locally before DB side effects, then `signRevision`. | Rejected before SQLite reset, DB initialization, bootstrap, or revision insert when missing/short. Evidence: `scripts/e2e-seed.ts:15-25`; `src/lib/integrity.test.ts`. |
| Agent portal test helper | Test-only | `JSON.stringify({ submissionId: id, revision: 1 })`. Evidence: `src/app/api/agent/agent-portal.test.ts:130-150`. | The exact same local variable is inserted as `canonicalJson`. | Explicit test secret in the test process. | Test setup provides the secret; not a production/demo writer. |
| Finalize route tests | Test via production route | Same as seller finalize API because tests call the route. Evidence: `src/app/api/package/submit/finalize/route.test.ts`. | Same as seller finalize API. | Explicit test secret in test setup or environment. | Covered by route tests; not a separate writer. |
| MySQL upgrade-path migration test | Test-only migration fixture | Small synthetic canonical string signed with `signRevision`. Evidence: `src/server/migrate.test.ts`. | Exact signed string inserted into a pre-migration `TEXT` row, then verified unchanged after `0001`. | Explicit test secret in the test. | Test setup provides the secret; not a production/demo writer. |

## Non-writers checked

- Auth bootstrap provisions accounts only, not revisions. Evidence: `src/server/auth/bootstrap.test.ts` was included in the MySQL integration slice.
- Startup migration applies schema only, not submission revisions. Evidence: `src/server/migrate.ts:88-109`.
- No admin route or operator route capable of inserting `submission_revisions` was found in source search.
- Fixture and corpus tooling do not insert `submission_revisions`; the only direct fixture-like revision insertions found were test files listed above.
- Agent detail, seller status, and panel routes read existing revision or asset rows; they do not insert revisions. Evidence: `src/server/submissions/detail.ts:111-133`, `src/app/api/agent/submissions/[id]/panels/[panelId]/route.ts:22-60`.

## Inventory conclusion

No source path was found that reconstructs verifier input differently from writer input. The reproduced defect was not canonicalization drift. It was MySQL storage capacity drift: the signed canonical string could be larger than the MySQL `TEXT` column used by the original committed schema.
