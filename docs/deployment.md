# Deployment — Label Lens TTB (domestic-wine pre-check)

This deploys the **existing** vertical slice unchanged: upload a wine-label image
→ local OCR → evidence + deterministic findings → human confirmation/disposition
→ checksum-protected JSON + readable HTML export. **No mandatory cloud AI service
is used** (OCR runs locally via vendored Tesseract WebAssembly).

## Current public deployment

- **Primary URL:** <https://ttb-test.com>
- **Host:** Hostinger Web Apps
- **Source:** GitHub repository `JosephJMWalker-MBA/label-lens-ttb`
- **Branch:** `main`
- **Framework preset:** Next.js
- **Node version:** 22.x
- **Deployment established:** 2026-07-17

The earlier Render deployment may remain available as a secondary demonstration,
but `ttb-test.com` is the current custom-domain deployment documented here.

## Runtime requirements

- **Persistent Node server** (Next.js `output: "standalone"`; not static hosting
  and not a short-lived serverless function — OCR runs in a Node worker).
- **Node 22** (`.nvmrc`, `engines`).
- **glibc environment** (Debian/Ubuntu) for the native `sharp` binary. Avoid
  Alpine/musl unless you install the musl `sharp` build.
- **~512 MB RAM** recommended (sharp + Tesseract WASM + bounded image budgets).
- **No writable persistent storage required** — uploads are processed in memory
  and never written to disk; nothing is persisted between requests.
- **No network at request time** — the OCR language data, WASM core, and worker
  script are vendored and traced into the build.

## Environment variables

| Name | Required | Notes |
|---|---|---|
| `LABEL_LENS_APPEND_SIGNING_KEY` | **Yes (production)** | ≥ 32 chars, secret. The pre-check route issues an HMAC append-authorization token on every run, so production returns HTTP 500 (`APPEND_SIGNING_KEY_UNAVAILABLE`) until this is set. Generate with `openssl rand -hex 32`. Never commit it. |
| `LABEL_LENS_BUILD_COMMIT` | **Required for auditable production provenance** | Set to the deployed Git commit SHA. Without it on Hostinger, exports fall back to `development build (no deployed commit)`, even when the application is publicly deployed. |
| `NODE_ENV` | Set by platform | Must resolve to `production` in the live build. |
| `PORT` | Set by platform | The server binds to it. |
| `RENDER_GIT_COMMIT` | Automatic on Render only | Used for export provenance when `LABEL_LENS_BUILD_COMMIT` is absent or blank. Hostinger does not currently supply this Render-specific variable. |
| `LABEL_LENS_OCR_ASSET_DIR`, `LABEL_LENS_OCR_CORE_DIR` | Optional | Override OCR asset locations. Not needed — assets resolve deployment-relative by default. |

**No secrets are committed to the repository.** Set the signing key only in the
hosting platform's secret store. The build commit is not a secret.

## Health check

`GET /api/health` → `200 { "status": "ok", "appendSigningKeyConfigured": <bool> }`.
It runs no OCR/image/filesystem work. If `appendSigningKeyConfigured` is `false`
in production, the signing secret is missing and pre-checks will fail — set the
environment variable and redeploy.

## Build & start

Standard persistent-Node path:

```bash
npm ci --include=dev
npm run build
npm run start
```

`--include=dev` protects the build when the hosting platform sets
`NODE_ENV=production` before dependency installation; the TypeScript and Next.js
build tooling lives in `devDependencies`.

Container/standalone alternative (used by the Dockerfile):

```bash
node .next/standalone/server.js   # reads PORT and HOSTNAME from the environment
```

## Hostinger deployment path (current)

1. In Hostinger, create a **Web App** and import the GitHub repository.
2. Select the `main` branch, the **Next.js** framework preset, **Node 22.x**, and
   root directory `./`.
3. Add `LABEL_LENS_APPEND_SIGNING_KEY` in Hostinger's environment-variable store.
4. Add `LABEL_LENS_BUILD_COMMIT` with the exact `main` commit SHA being deployed.
5. Deploy to `ttb-test.com`.
6. Verify `/api/health`, run the bundled M Cellars sample, and download both the
   JSON and HTML reports.
7. Confirm the report's application-build provenance contains the deployed commit
   rather than the development fallback.

Hostinger's default Next.js build settings successfully produced the live
application on 2026-07-17. If a future build omits development dependencies, set
the explicit install/build command to `npm ci --include=dev && npm run build`.

## Production smoke test — 2026-07-17

The first Hostinger deployment completed an end-to-end run at `ttb-test.com`:

- the bundled M Cellars sample ran through real server-side OCR;
- alcohol was observed as `12.5% ALC./VOL.` with an OCR evidence score of `0.91`;
- alcohol syntax and declared-value comparison returned deterministic `PASS`;
- brand extraction remained honestly `AMBIGUOUS` (`CELLARS`, score `0.31`) and
  routed the canonical brand comparison to `NEEDS_REVIEW`;
- external-evidence-dependent rules remained `not_run`;
- checksum-protected JSON and readable HTML exports downloaded successfully; and
- the HTML report checksum matched the canonical JSON export checksum.

Known gap discovered by the smoke test: application-build provenance reported
`development build (no deployed commit)`. Configure `LABEL_LENS_BUILD_COMMIT` and
redeploy before treating exported provenance as deployment-complete.

The bundled-sample path does not provide a browser-local image preview. A separate
manual-upload smoke test should verify preview rendering, review-region drawing,
human confirmation history, and regenerated exports.

## Render path (secondary / preview-capable)

`render.yaml` remains a ready blueprint: a Node web service that can auto-deploy
`main`, create per-PR preview environments, and health-check `/api/health`.

1. In Render: **New → Blueprint**, connect the GitHub repo, select `render.yaml`.
2. Set `LABEL_LENS_APPEND_SIGNING_KEY` when prompted.
3. Leave `LABEL_LENS_BUILD_COMMIT` blank unless an explicit override is needed;
   Render supplies `RENDER_GIT_COMMIT` automatically.
4. Create the service. The blueprint installs, builds, and starts the application.

The Render free plan may spin down when idle. It is useful as a secondary demo or
preview path, while Hostinger currently serves the custom production-test domain.

## Portable path — Docker (Railway / Fly.io / VPS / Render-Docker)

Use the committed `Dockerfile` (Debian slim, standalone output, non-root):

```bash
docker build -t label-lens-ttb .
docker run -p 3000:3000 \
  -e LABEL_LENS_APPEND_SIGNING_KEY=$(openssl rand -hex 32) \
  -e LABEL_LENS_BUILD_COMMIT=$(git rev-parse HEAD) \
  label-lens-ttb
```

- **Railway / Fly.io:** point the service at the repo/Dockerfile and set the same
  environment variables. Fly needs `flyctl launch` (Dockerfile detected);
  Railway detects it automatically.
- Health check path: `/api/health`.

## Live-version strategy

- **Stable custom-domain build:** Hostinger service tracking `main` at
  <https://ttb-test.com>.
- **Tester/staging build:** Render PR previews or a second Hostinger/Docker service.
- Only tested, merged changes should reach the stable domain.

## Redeploying

- **Hostinger:** merge to `main`, then allow GitHub-connected deployment or trigger
  redeployment from the Hostinger Web App dashboard.
- **Render:** merge to `main` for automatic deployment, or use **Manual Deploy**.
- **Docker:** rebuild the image and restart the service.
- Update `LABEL_LENS_BUILD_COMMIT` whenever the deployed commit changes unless the
  platform is later integrated to provide equivalent commit metadata automatically.
- Rotating `LABEL_LENS_APPEND_SIGNING_KEY` invalidates append tokens held by
  browsers from before the rotation; re-run the pre-check to receive a fresh token.

## Trusted-tester access

Share the stable URL, a preview URL, or a staging URL. No login exists — it is an
advisory demo. Testers can upload a wine label, review evidence/findings, append
human workflow records, and download JSON and HTML exports. The advisory and
non-government language is always visible.

## What is intentionally NOT deployed

Persistence, accounts, cloud OCR fallback, multi-artifact intake, non-wine
categories, corpus annotation, and any benchmark — all documented future work.
