# Security and operations

## Implemented strengths

- Public sign-up is explicitly blocked; sessions and roles are server-managed. [`src/app/api/auth/[...all]/route.ts`](../../src/app/api/auth/%5B...all%5D/route.ts), [`src/lib/auth.ts`](../../src/lib/auth.ts)
- Seller status reads enforce ownership; agent/admin reads use server guards. [`src/server/submissions/access.ts`](../../src/server/submissions/access.ts), [`src/server/auth/guards.ts`](../../src/server/auth/guards.ts)
- Finalization validates schema, image type/dimensions/size, checksums, append tokens, provenance, and idempotency. [`src/app/api/package/submit/finalize/route.ts`](../../src/app/api/package/submit/finalize/route.ts)
- Agent image streaming validates cross-submission association and returns `no-store`/`nosniff`. [`src/app/api/agent/submissions/[id]/panels/[panelId]/route.ts`](../../src/app/api/agent/submissions/%5Bid%5D/panels/%5BpanelId%5D/route.ts)
- Production integrity configuration fails closed when required secrets/storage are absent. [`src/lib/integrity.ts`](../../src/lib/integrity.ts), [`src/lib/panel-storage.ts`](../../src/lib/panel-storage.ts), [`src/server/startup.ts`](../../src/server/startup.ts)
- CI includes formatting, linting, types, tests, build, migration, MySQL integration, and E2E jobs. [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml)

These controls are meaningful, but they do not make the prototype operationally complete.

## Security and operational gaps

| Gap | Current evidence | Product consequence |
| --- | --- | --- |
| Shared public credentials | [`README.md`](../../README.md), live login [LIVE-07](limitations.md#live-observation-log) | Anyone with the documented account can see all records owned by that shared seller or all agent-visible submissions. |
| Persisted artwork in public demo | Finalizer writes panel bytes before DB transaction; [`panel-storage.ts`](../../src/lib/panel-storage.ts) has durable configured filesystem semantics | Users may reasonably assume a demo is ephemeral; no in-product upload warning explains shared visibility/retention. |
| Public-demo records not demo-classified | Finalizer sets `isDemo=false`; [`queries.ts`](../../src/server/submissions/queries.ts); live waiting=1/demo=0 | Public activity pollutes the real queue and defeats ADR-0015’s intended isolation. |
| No deletion/expiry/retention class | No delete/cleanup job in storage layer; [#17](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/17) open | No demonstrated lifecycle for uploaded artwork, backups, or user-requested deletion. |
| No demo reset mechanism | Claimed `/api/agent/demo/reset` in [`ADR-0015`](../../docs/adr/0015-demo-isolation-and-resettable-seeds.md) does not exist | Demo state drifts and cannot be restored to a known scenario. |
| No backup/restore or repair control | `/admin` only documents bootstrap; [LIVE-11](limitations.md#live-observation-log) | The one observed integrity failure could not be diagnosed or remediated through the demonstrated operator surface. |
| Integrity failure on one deployed waiting submission | [LIVE-09](limitations.md#live-observation-log) | That record failed closed, correctly protecting data but preventing the value moment. Cause and generality are unknown; this does not prove a general design or persistence failure. |
| No account lifecycle UI | Bootstrap is environment/CLI driven; [`src/app/admin/page.tsx`](../../src/app/admin/page.tsx) | Provisioning, revocation, password rotation, and audit are operator-dependent and undocumented at product level. |
| No rate/quota/abuse evidence for public demo | No committed operational measurement found | Shared public upload/analysis surfaces have unknown cost and abuse characteristics. |
| Deployment provenance/duplicate action gap | [#136](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/136) | Reports can omit deployed commit and legacy identical actions can append twice. |

## Data-flow boundary

The package workflow is not local-only after finalization: it sends images and structured evidence to server storage and the internal queue. The legacy one-image route states that the image is not stored, and local exports remain local. These are separate flows and must not share a generic storage claim. Evidence: [`src/app/review/page.tsx`](../../src/app/review/page.tsx), [`src/app/review/legacy/page.tsx`](../../src/app/review/legacy/page.tsx), [`finalize/route.ts`](../../src/app/api/package/submit/finalize/route.ts).

## Operational recommendation

Before any feature work: reproduce and attribute the one observed integrity failure with a repository-owned fixture. Before any real pilot: (1) prove integrity across supported deploy/restart conditions; (2) prevent public users from creating non-demo records; (3) display shared-account and retention warnings before upload; (4) implement deterministic demo reset; (5) assign and enforce a retention class; (6) document backup/restore and signing-key lifecycle; (7) add an end-to-end live synthetic that finalizes and opens a fixture package. This does not require official TTB integration.
