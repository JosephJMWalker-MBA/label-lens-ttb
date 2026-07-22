import Database from "better-sqlite3";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function createTestSqliteDb(filepath: string, forceDelete = false) {
  if (forceDelete && existsSync(filepath)) {
    try {
      unlinkSync(filepath);
    } catch {
      // Ignore cleanup failures
    }
  }

  const dir = dirname(filepath);
  if (dir && dir !== "." && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const sqliteDb = new Database(filepath);

  // Users table
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER DEFAULT 0 NOT NULL,
      image TEXT,
      role TEXT DEFAULT 'seller' NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
      updated_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL
    );
  `);

  // Sessions table
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
      updated_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL
    );
  `);

  // Accounts table
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      access_token TEXT,
      refresh_token TEXT,
      id_token TEXT,
      expires_at INTEGER,
      password TEXT,
      created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
      updated_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL
    );
  `);

  // Verifications table
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS verifications (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER,
      updated_at INTEGER
    );
  `);

  // Submissions table
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      creator_id TEXT NOT NULL REFERENCES users(id),
      current_status TEXT NOT NULL,
      is_demo INTEGER DEFAULT 0 NOT NULL,
      version INTEGER DEFAULT 1 NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
      updated_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL
    );
  `);

  // Submission Revisions table
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS submission_revisions (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      revision_number INTEGER NOT NULL,
      profile_id TEXT NOT NULL,
      profile_version TEXT NOT NULL,
      submitted_by TEXT NOT NULL,
      submitted_at INTEGER NOT NULL,
      canonical_json TEXT NOT NULL,
      integrity_signature TEXT NOT NULL,
      UNIQUE(submission_id, revision_number)
    );
  `);

  // Submitted Panels table
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS submitted_panels (
      id TEXT PRIMARY KEY,
      revision_id TEXT NOT NULL REFERENCES submission_revisions(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      display_name TEXT NOT NULL,
      media_type TEXT NOT NULL,
      byte_size INTEGER NOT NULL,
      checksum_sha256 TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      rotation INTEGER NOT NULL,
      storage_key TEXT NOT NULL
    );
  `);

  // Seller Evidence Snapshots table
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS seller_evidence_snapshots (
      id TEXT PRIMARY KEY,
      revision_id TEXT NOT NULL REFERENCES submission_revisions(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL,
      decision TEXT NOT NULL,
      expected_value TEXT,
      regions TEXT NOT NULL
    );
  `);

  // Machine Analysis Snapshots table
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS machine_analysis_snapshots (
      id TEXT PRIMARY KEY,
      revision_id TEXT NOT NULL REFERENCES submission_revisions(id) ON DELETE CASCADE,
      analysis_run_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      panel_runs TEXT NOT NULL,
      categories TEXT NOT NULL,
      readiness TEXT NOT NULL,
      recorded_at INTEGER NOT NULL
    );
  `);

  // Submission Status Events Table
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS submission_status_events (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      actor_id TEXT REFERENCES users(id),
      actor_role TEXT NOT NULL,
      reason_comment TEXT,
      recorded_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL
    );
  `);

  // Reviewer Claims table
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS reviewer_claims (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES submissions(id),
      revision_id TEXT NOT NULL REFERENCES submission_revisions(id),
      revision_number INTEGER NOT NULL,
      reviewer_id TEXT NOT NULL REFERENCES users(id),
      reviewer_role TEXT NOT NULL,
      state TEXT NOT NULL,
      active_submission_id TEXT REFERENCES submissions(id),
      claimed_submission_version INTEGER NOT NULL,
      claimed_at INTEGER NOT NULL,
      released_at INTEGER,
      released_by TEXT REFERENCES users(id),
      released_by_role TEXT,
      release_reason TEXT,
      decided_at INTEGER,
      created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL
    );
  `);

  sqliteDb.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS reviewer_claims_active_submission_idx
    ON reviewer_claims(active_submission_id);
  `);

  // Agent Decisions table
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS agent_decisions (
      id TEXT PRIMARY KEY,
      submission_id TEXT NOT NULL REFERENCES submissions(id),
      revision_id TEXT NOT NULL REFERENCES submission_revisions(id),
      revision_number INTEGER NOT NULL,
      claim_id TEXT NOT NULL REFERENCES reviewer_claims(id),
      reviewer_id TEXT NOT NULL REFERENCES users(id),
      reviewer_role TEXT NOT NULL,
      decision_type TEXT NOT NULL,
      prior_status TEXT NOT NULL,
      resulting_status TEXT NOT NULL,
      rationale TEXT NOT NULL,
      submission_version_before INTEGER NOT NULL,
      submission_version_after INTEGER NOT NULL,
      idempotency_record_key TEXT NOT NULL,
      recorded_at INTEGER NOT NULL,
      UNIQUE(revision_id),
      UNIQUE(claim_id),
      UNIQUE(idempotency_record_key)
    );
  `);

  // Idempotency Records table
  sqliteDb.exec(`
    CREATE TABLE IF NOT EXISTS idempotency_records (
      key TEXT PRIMARY KEY,
      request_hash TEXT NOT NULL,
      response_payload TEXT NOT NULL,
      created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL
    );
  `);

  // Enforce table immutability via triggers on submissions
  sqliteDb.exec(`
    CREATE TRIGGER IF NOT EXISTS prevent_submissions_update
    BEFORE UPDATE ON submissions
    BEGIN
      SELECT CASE
        WHEN OLD.creator_id != NEW.creator_id OR OLD.id != NEW.id OR OLD.is_demo != NEW.is_demo OR OLD.created_at != NEW.created_at
        THEN RAISE(FAIL, 'Immutable fields on submissions cannot be updated.')
      END;
    END;
  `);

  sqliteDb.exec(`
    CREATE TRIGGER IF NOT EXISTS prevent_submissions_delete
    BEFORE DELETE ON submissions
    BEGIN
      SELECT RAISE(FAIL, 'Submissions are immutable and cannot be deleted.');
    END;
  `);

  // Enforce table immutability via triggers on submission_revisions
  sqliteDb.exec(`
    CREATE TRIGGER IF NOT EXISTS prevent_revisions_update
    BEFORE UPDATE ON submission_revisions
    BEGIN
      SELECT RAISE(FAIL, 'Submission revisions are immutable and cannot be updated.');
    END;
  `);

  sqliteDb.exec(`
    CREATE TRIGGER IF NOT EXISTS prevent_revisions_delete
    BEFORE DELETE ON submission_revisions
    BEGIN
      SELECT RAISE(FAIL, 'Submission revisions are immutable and cannot be deleted.');
    END;
  `);

  // Reviewer claims can close exactly once; closed rows cannot be reused.
  sqliteDb.exec(`
    CREATE TRIGGER IF NOT EXISTS prevent_reviewer_claims_closed_update
    BEFORE UPDATE ON reviewer_claims
    WHEN OLD.state != 'active'
    BEGIN
      SELECT RAISE(FAIL, 'Closed reviewer claim rows are immutable.');
    END;
  `);

  sqliteDb.exec(`
    CREATE TRIGGER IF NOT EXISTS prevent_reviewer_claims_identity_update
    BEFORE UPDATE ON reviewer_claims
    WHEN OLD.id != NEW.id
      OR OLD.submission_id != NEW.submission_id
      OR OLD.revision_id != NEW.revision_id
      OR OLD.revision_number != NEW.revision_number
      OR OLD.reviewer_id != NEW.reviewer_id
      OR OLD.reviewer_role != NEW.reviewer_role
      OR OLD.claimed_submission_version != NEW.claimed_submission_version
      OR OLD.claimed_at != NEW.claimed_at
      OR OLD.created_at != NEW.created_at
      OR (NEW.state = 'active' AND (
        OLD.active_submission_id IS NOT NEW.active_submission_id
        OR OLD.released_at IS NOT NEW.released_at
        OR OLD.released_by IS NOT NEW.released_by
        OR OLD.released_by_role IS NOT NEW.released_by_role
        OR OLD.release_reason IS NOT NEW.release_reason
        OR OLD.decided_at IS NOT NEW.decided_at
      ))
    BEGIN
      SELECT RAISE(FAIL, 'Reviewer claim identity fields cannot be updated.');
    END;
  `);

  sqliteDb.exec(`
    CREATE TRIGGER IF NOT EXISTS prevent_reviewer_claims_delete
    BEFORE DELETE ON reviewer_claims
    BEGIN
      SELECT RAISE(FAIL, 'Reviewer claim rows cannot be deleted.');
    END;
  `);

  // Agent decision records are append-only.
  sqliteDb.exec(`
    CREATE TRIGGER IF NOT EXISTS prevent_agent_decisions_update
    BEFORE UPDATE ON agent_decisions
    BEGIN
      SELECT RAISE(FAIL, 'Agent decisions are immutable and cannot be updated.');
    END;
  `);

  sqliteDb.exec(`
    CREATE TRIGGER IF NOT EXISTS prevent_agent_decisions_delete
    BEFORE DELETE ON agent_decisions
    BEGIN
      SELECT RAISE(FAIL, 'Agent decisions are immutable and cannot be deleted.');
    END;
  `);

  return sqliteDb;
}
