# ADR 0013: Immutable Revisions and Snapshot Provenance

- Status: Proposed
- Date: 2026-07-18

## Context

When a seller submits a package to the agent queue, the submitted evidence (label images, coordinates, expected values, and machine analysis results) represents a point-in-time snapshot. 

If an agent reviews the submission and requests changes, the seller will modify their package to correct the issues. When they resubmit, we must preserve the original submission state exactly as it was reviewed, alongside the new submission state. This is critical for regulatory auditability, tracking agent performance, and verifying compliance history.

Furthermore, we must prevent any accidental or malicious mutation of historical records.

## Decision

We will implement an immutable, append-only revision model for all package submissions:

1. **Submission Entity Lifecycle:** A `Submission` record tracks the overall workflow lifecycle (status, assigned agent, creation date). It is the only mutable container.
2. **Immutable Revisions:** Every submission attempt creates a new `SubmissionRevision` record (with an incrementing `revision_number` starting at 1). Revisions are strictly append-only and immutable. Once written to the database, they cannot be updated or deleted.
3. **Canonical JSON Snapshot:** The `SubmissionRevision` table includes a `canonical_snapshot` JSON column that stores the exact serialized state of the seller's workspace at the moment of submission (including category decisions, values, coordinates, and associated panel metadata). Keys in the JSON are sorted alphabetically before serialization to ensure determinism.
4. **Integrity Hash:** The server computes a SHA-256 hash (`integrity_sha256`) of the canonical JSON string. This hash is stored in the database and included on the seller's receipt, proving cryptographically that the snapshot has not been altered since Ingestion.
5. **Machine Runs Provenance:** All machine OCR observations, VLM extraction texts, and pipeline metadata (including the OCR engine version, active rule registry version, and Git commit hash of the analyzer code) are stored in an immutable `MachineAnalysisSnapshot` table linked to the revision.

## Consequences

Positive:
- Guaranteed audit trail of every seller resubmission and agent feedback cycle.
- Protection against database tampering: any modification to a revision snapshot will break the `integrity_sha256` match.
- Easy historical side-by-side comparison (diffing) in the agent review portal.

Trade-offs:
- Increased database storage requirements due to duplicate snapshot details. However, since snapshots are text-based JSON (typically under 50KB), the storage overhead is negligible compared to the image assets.
