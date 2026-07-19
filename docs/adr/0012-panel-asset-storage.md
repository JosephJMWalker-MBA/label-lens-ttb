# ADR 0012: Panel Asset Storage

- Status: Proposed
- Date: 2026-07-18

## Context

Sellers upload label panel images (PNG or JPEG formats, up to 10MB each, up to 6 panels per package). These images must be preserved for review by agents and for long-term historical audit trails.

Storing large binary files directly inside the relational database is an anti-pattern. Next.js standalone Node containers on Hostinger have ephemeral filesystems, meaning files saved to container disk will be lost on container restart.

We need to choose a specific object storage provider, establish secure access authorization to prevent public exposure of private label files, define retention rules, and isolate demo data.

## Decision

We will use **Cloudflare R2** as the primary S3-compatible object storage provider, with local fallback for offline development, combined with a secure streaming proxy authorization layer:

1. **Storage Provider:** Cloudflare R2 is selected for production and staging due to its zero egress fees, S3 compatibility, and high reliability.
2. **Access Authorization (Streaming Proxy):** S3/R2 buckets will remain private and will not be exposed to the public internet. Presigned URLs are rejected as they act as bearer tokens that can be leaked or shared. Instead, all panel image requests are routed to `/api/package/panel/[panelId]/image`. This endpoint:
   - Verifies the user session.
   - Confirms that the caller is an authorized Agent/Admin, or the Seller who owns the submission.
   - Reads the file bytes directly from Cloudflare R2 (or local disk in dev) using the S3 client credentials.
   - Streams the raw bytes back in the HTTP response body with the correct `Content-Type` header, keeping the storage URL completely hidden from the browser.
3. **Upload Validation:** The server endpoint `/api/package/submit/upload-panel` validates the file stream:
   - File size is capped at 10MB.
   - The first few bytes are inspected to verify the file signature (magic numbers) matches PNG or JPEG.
   - The image is processed by `sharp` to verify it can decode successfully and retrieve dimensions. Any decoding or size failure aborts the upload.
4. **Data Isolation (Demos):** Seeded demo panel files are stored under a separate folder prefix `demo/` in the bucket (or in an isolated test bucket), keeping them completely distinct from production and staging seller uploads.
5. **Retention & Cleanup:**
   - Finalized panel assets are retained for a standard compliance audit window of 7 years.
   - Temporary panel uploads that are not finalized within 24 hours are pruned daily via an automated database and storage cleanup cron script.
6. **Local Fallback:** For local development and testing, files are saved in the `.local/uploads/` directory, and the `/api/package/panel/[panelId]/image` endpoint reads and streams the file from the local disk.

## Consequences

Positive:
- Private buckets prevent unauthorized public access or accidental data leaks.
- Zero egress fees from Cloudflare R2 reduce ongoing operational costs.
- Stream-level validation blocks malicious or corrupt uploads before they reach storage.
- Demo isolation prevents developers or tests from polluting production files.
- The streaming proxy ensures that no temporary S3 bearer URLs are exposed to client environments.

Trade-offs:
- Image loading requires reading through the Next.js server, which increases CPU/memory usage and bandwidth compared to direct R2 downloads. This is necessary to satisfy the strict privacy requirements.
