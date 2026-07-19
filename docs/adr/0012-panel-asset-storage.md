# ADR 0012: Panel Asset Storage

- Status: Accepted
- Date: 2026-07-18

## Context

Sellers upload label panel images (PNG or JPEG formats, up to 10MB each, up to 6 panels per package). These images must be preserved for review by agents and for long-term historical audit trails.

Storing large binary files directly inside the relational database (e.g., as MySQL `LONGBLOB` fields) is an anti-pattern that causes database file bloat, degrades backup/restore performance, and impacts memory caching. 

Furthermore, because Hostinger Web Apps runs Next.js in a standalone Node.js container with an ephemeral filesystem, any files written directly to the local container disk will be lost on the next deployment or container restart.

## Decision

We will store panel image files in an external object storage system with a local fallback for offline development:

1. **Production & Staging:** Use an **S3-compatible Object Storage** service (such as Hostinger Object Storage, Cloudflare R2, or AWS S3).
2. **Local Development & Testing:** Fallback to saving files in a **local directory** inside the project structure (e.g., `.local/uploads/`) to keep local development offline and fast.
3. **Proxied Upload Ingestion:** Clients will never receive direct write credentials to the object store. Instead, they upload files to `/api/package/submit/upload-panel`. The server handles the upload, validating the image, computing its SHA-256 checksum, and streaming it to object storage.
4. **Immutable Content-Addressed Naming:** Files are saved using their SHA-256 hash as the filename (`panels/<checksumSha256>.<ext>`). Once written, file contents cannot be overwritten or altered. This automatically deduplicates duplicate uploads.

## Consequences

Positive:
- Relational database remains small, fast, and easy to back up.
- Application nodes remain stateless and can be restarted or redeployed without data loss.
- Content-addressed naming prevents file conflicts and handles duplicate panel uploads with zero storage overhead.
- Safe upload proxy shields private staging/production S3 credentials from being exposed to the browser.

Trade-offs:
- Uploads require double-hopping (client -> Next.js server -> S3). However, given the low volume (internal review tool, max 10MB per file), this latency overhead is acceptable compared to the security gains.
