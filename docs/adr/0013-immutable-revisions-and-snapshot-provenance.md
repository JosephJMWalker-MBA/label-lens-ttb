# ADR 0013: Immutable Revisions and Snapshot Provenance

- Status: Proposed
- Date: 2026-07-18

## Context

When a seller submits a package to the agent queue, the submitted evidence (label images, coordinates, expected values, and machine analysis results) represents a point-in-time snapshot. 

If an agent reviews the submission and requests changes, the seller will modify their package to correct the issues. When they resubmit, we must preserve the original submission state exactly as it was reviewed, alongside the new submission state. This is critical for regulatory auditability, tracking agent performance, and verifying compliance history.

Furthermore, we must prevent any accidental or malicious mutation of historical records. Storing a simple SHA-256 hash alongside the data is insufficient, as an attacker with write access to the database could update both the JSON and the hash concurrently. We need a cryptographic mechanism that guarantees the integrity of the snapshots.

Additionally, to allow future upgrades of our hashing algorithms or rotation of environment signing keys, the signature structure must support versioning.

## Decision

We will implement an immutable, append-only revision model for all package submissions with versioned HMAC integrity signatures:

1. **Submission Entity Lifecycle:** A `Submission` record tracks the overall workflow lifecycle (status, assigned agent, creation date). It is the only mutable container.
2. **Immutable Revisions:** Every submission attempt creates a new `SubmissionRevision` record (with an incrementing `revision_number` starting at 1). Revisions are strictly append-only and immutable. Once written to the database, they cannot be updated or deleted.
3. **Canonical JSON Snapshot:** The `SubmissionRevision` table includes a `canonical_snapshot` JSON column that stores the exact serialized state of the seller's workspace at the moment of submission (including category decisions, values, coordinates, and associated panel metadata). Keys in the JSON are sorted alphabetically before serialization to ensure determinism.
4. **Versioned HMAC Integrity Signature:** The server computes an HMAC-SHA256 signature of the canonical JSON string, signed with the server-side environment secret key `LABEL_LENS_INTEGRITY_SECRET`. The signature is saved in the database prefixed with a version identifier:
   - Example format: `v1:<hex-encoded-signature-bytes>`
   - This version prefix allows us to change the algorithm (e.g. to SHA-512) or rotate keys in the future by executing the correct verification path based on the prefix.
5. **Validation on Load:** Whenever a revision snapshot is retrieved or audited, the server parses the signature version header, re-computes the signature using the matching algorithm/key version, and compares it against the database signature. If they do not match, the server logs a critical alert and aborts the request.
6. **Machine Runs Provenance:** All machine OCR observations, VLM extraction texts, and pipeline metadata (including the OCR engine version, active rule registry version, and Git commit hash of the analyzer code) are stored in an immutable `MachineAnalysisSnapshot` table linked to the revision.

## Consequences

Positive:
- Guaranteed audit trail of every seller resubmission and agent feedback cycle.
- Strong protection against database tampering: database modifications to the JSON by an attacker will fail validation because they cannot forge the HMAC signature without `LABEL_LENS_INTEGRITY_SECRET`.
- Easy historical side-by-side comparison (diffing) in the agent review portal.
- Algorithmic agility: the versioned header enables seamless key rotation and hash upgrades without breaking historical verification paths.

Trade-offs:
- Requires managing and protecting the `LABEL_LENS_INTEGRITY_SECRET` environment variable in all environments.
- JSON serialization must remain perfectly deterministic (sorted keys, stable spacing) to prevent signature mismatches on load.
