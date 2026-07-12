# Portable container image for the Label Lens TTB pre-check.
#
# Use this on any Docker-based host (Railway, Fly.io, a VPS, or Render's Docker
# runtime). The Render blueprint (render.yaml) does NOT use this file — it builds
# natively. Debian "bookworm-slim" (glibc) is used so the native `sharp` binary
# and the Tesseract WebAssembly runtime work without musl workarounds.
#
# The app writes nothing to disk and needs no persistent volume. It DOES require
# the LABEL_LENS_APPEND_SIGNING_KEY env var (>= 32 chars) at runtime — see
# docs/deployment.md. Recommended memory: >= 512 MB.

# ---- Build stage ------------------------------------------------------------
FROM node:22-bookworm-slim AS builder
WORKDIR /app

# Install dependencies against the committed lockfile for a reproducible build.
COPY package.json package-lock.json ./
RUN npm ci

# Build the standalone Next.js output (server + traced node_modules + vendored
# OCR assets). NODE_ENV is set for the build only.
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- Runtime stage ----------------------------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# The standalone server bundles its own minimal node_modules and the traced OCR
# assets; the static assets are copied alongside it as Next expects.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Run as the built-in unprivileged user.
USER node

EXPOSE 3000

# The standalone server reads PORT and HOSTNAME from the environment.
CMD ["node", "server.js"]
