# Deployment — Label Lens TTB (domestic-wine pre-check)

This deploys the **existing** vertical slice unchanged: upload a wine-label image
→ local OCR → evidence + deterministic findings → human disposition → JSON +
readable HTML export. **No mandatory cloud AI service is used** (OCR runs locally
via vendored Tesseract WebAssembly).

## Runtime requirements

- **Persistent Node server** (Next.js `output: "standalone"`; not static hosting
  and not a short-lived serverless function — OCR runs in a Node worker).
- **Node 22** (`.nvmrc`, `engines`).
- **glibc environment** (Debian/Ubuntu) for the native `sharp` binary. Avoid
  Alpine/musl unless you install the musl `sharp` build.
- **~512 MB RAM** recommended (sharp + Tesseract WASM + bounded image budgets).
- **No writable persistent storage** — uploads are processed in memory and never
  written to disk; nothing is persisted between requests.
- **No network at request time** — the OCR language data, WASM core, and worker
  script are vendored and traced into the build.

## Required environment variables

| Name | Required | Notes |
|---|---|---|
| `LABEL_LENS_APPEND_SIGNING_KEY` | **Yes (production)** | ≥ 32 chars, secret. The pre-check route issues an HMAC append-authorization token on **every** run, so **production returns HTTP 500 (`APPEND_SIGNING_KEY_UNAVAILABLE`) until this is set.** Generate with `openssl rand -hex 32`. Never commit it. |
| `NODE_ENV` | Set by platform | Must be `production` in the live build. |
| `PORT` | Set by platform | The server binds to it. |
| `LABEL_LENS_BUILD_COMMIT` | Optional | Explicit higher-priority override for the running commit stamped into export provenance. |
| `RENDER_GIT_COMMIT` | Automatic on Render | Used for export provenance when `LABEL_LENS_BUILD_COMMIT` is absent or blank. |
| `LABEL_LENS_OCR_ASSET_DIR`, `LABEL_LENS_OCR_CORE_DIR` | Optional | Override OCR asset locations. Not needed — assets resolve deployment-relative by default. |

**No secrets are committed to the repository.** Set the signing key only in the
hosting platform's secret store.

## Health check

`GET /api/health` → `200 { "status": "ok", "appendSigningKeyConfigured": <bool> }`.
It runs no OCR/image/filesystem work. If `appendSigningKeyConfigured` is `false`
in production, the signing secret is missing and pre-checks will fail — set the
env var and redeploy.

## Build & start

```
npm ci
npm run build          # produces .next (and .next/standalone)
npm run start          # next start; binds to $PORT
```

Container/standalone alternative (used by the Dockerfile):

```
node .next/standalone/server.js   # reads PORT and HOSTNAME from the environment
```

## Recommended path — Render (native, GitHub-connected)

`render.yaml` is a ready blueprint: a Node web service that auto-deploys `main`,
creates **per-PR preview environments** (staging for testers), and health-checks
`/api/health`.

1. Push this branch and merge the deployment PR into `main` (blueprint must be on
   the branch Render reads).
2. In Render: **New → Blueprint**, connect the GitHub repo, select `render.yaml`.
3. When prompted, set the secret **`LABEL_LENS_APPEND_SIGNING_KEY`** (paste an
   `openssl rand -hex 32` value). Leave `LABEL_LENS_BUILD_COMMIT` blank unless you
   need an explicit override; Render supplies `RENDER_GIT_COMMIT` automatically.
4. Create the service. First build runs `npm ci && npm run build`; it starts with
   `npm run start`.
5. The `free` plan spins down when idle (slow first request). Upgrade the service
   to `starter` for an always-on committee URL.

## Portable path — Docker (Railway / Fly.io / VPS / Render-Docker)

Use the committed `Dockerfile` (Debian slim, standalone output, non-root):

```
docker build -t label-lens-ttb .
docker run -p 3000:3000 -e LABEL_LENS_APPEND_SIGNING_KEY=$(openssl rand -hex 32) label-lens-ttb
```

- **Railway / Fly.io:** point the service at the repo/Dockerfile and set the same
  env var. Fly needs `flyctl launch` (Dockerfile detected); Railway detects it
  automatically.
- Health check path: `/api/health`.

## Live-version strategy

- **Stable committee build:** the Render service tracking `main`. Only tested,
  merged changes reach it.
- **Tester/staging build:** Render's automatic **PR previews** (or a second
  Docker service). Trusted testers exercise the preview URL of a PR first;
  validated fixes merge to `main` and redeploy production.

## Redeploying

- **Production:** merge to `main` → Render auto-deploys (or `docker build/push`
  and restart on a Docker host).
- **Manual:** Render dashboard → **Manual Deploy**; Docker → rebuild and restart.
- Rotating `LABEL_LENS_APPEND_SIGNING_KEY` invalidates append tokens held by
  browsers from before the rotation (re-run the pre-check to get a fresh token).

## Trusted-tester access

Share the preview URL (staging) or the production URL. No login exists — it is an
advisory demo. Testers can: upload a wine label, review evidence/findings, append
a disposition, and download the JSON and HTML exports. The advisory /
non-government language is always visible.

## What is intentionally NOT deployed

Persistence, accounts, cloud OCR fallback, multi-artifact intake, non-wine
categories, corpus annotation, and any benchmark — all documented future work.
