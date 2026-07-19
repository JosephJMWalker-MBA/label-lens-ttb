import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, uniqueIndex } from "drizzle-orm/sqlite-core";

// 1. Users Table
export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name"),
    email: text("email").notNull(),
    emailVerified: integer("email_verified", { mode: "boolean" }).default(false).notNull(),
    image: text("image"),
    role: text("role").default("seller").notNull(), // "seller" | "agent" | "admin"
    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    emailIdx: uniqueIndex("email_idx").on(table.email),
  }),
);

// 2. Sessions Table
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull(),
    userId: text("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (table) => ({
    tokenIdx: uniqueIndex("token_idx").on(table.token),
  }),
);

// 3. Accounts Table (required by Better Auth credentials hashing)
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  password: text("password"), // Stores the hashed credentials password
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// 4. Verifications Table (required by Better Auth token validation)
export const verifications = sqliteTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer("updated_at", { mode: "timestamp" }).default(sql`CURRENT_TIMESTAMP`),
});

// 5. Submissions Table
export const submissions = sqliteTable("submissions", {
  id: text("id").primaryKey(),
  creatorId: text("creator_id")
    .references(() => users.id)
    .notNull(),
  currentStatus: text("current_status").notNull(),
  isDemo: integer("is_demo", { mode: "boolean" }).default(false).notNull(),
  version: integer("version").default(1).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// 6. Submission Revisions Table
export const submissionRevisions = sqliteTable(
  "submission_revisions",
  {
    id: text("id").primaryKey(),
    submissionId: text("submission_id")
      .references(() => submissions.id, { onDelete: "cascade" })
      .notNull(),
    revisionNumber: integer("revision_number").notNull(),
    profileId: text("profile_id").notNull(),
    profileVersion: text("profile_version").notNull(),
    submittedBy: text("submitted_by").notNull(),
    submittedAt: integer("submitted_at", { mode: "timestamp" }).notNull(),
    canonicalJson: text("canonical_json").notNull(),
    integritySignature: text("integrity_signature").notNull(),
  },
  (table) => ({
    subRevisionIdx: uniqueIndex("sub_revision_idx").on(table.submissionId, table.revisionNumber),
  }),
);

// 7. Submitted Panels Table
export const submittedPanels = sqliteTable("submitted_panels", {
  id: text("id").primaryKey(),
  revisionId: text("revision_id")
    .references(() => submissionRevisions.id, { onDelete: "cascade" })
    .notNull(),
  role: text("role").notNull(),
  displayName: text("display_name").notNull(),
  mediaType: text("media_type").notNull(),
  byteSize: integer("byte_size").notNull(),
  checksumSha256: text("checksum_sha256").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  rotation: integer("rotation").notNull(),
  storageKey: text("storage_key").notNull(),
});

// 8. Seller Evidence Snapshots Table
export const sellerEvidenceSnapshots = sqliteTable("seller_evidence_snapshots", {
  id: text("id").primaryKey(),
  revisionId: text("revision_id")
    .references(() => submissionRevisions.id, { onDelete: "cascade" })
    .notNull(),
  categoryId: text("category_id").notNull(),
  decision: text("decision").notNull(),
  expectedValue: text("expected_value"),
  regions: text("regions").notNull(),
});

// 9. Machine Analysis Snapshots Table
export const machineAnalysisSnapshots = sqliteTable("machine_analysis_snapshots", {
  id: text("id").primaryKey(),
  revisionId: text("revision_id")
    .references(() => submissionRevisions.id, { onDelete: "cascade" })
    .notNull(),
  analysisRunId: text("analysis_run_id").notNull(),
  sequence: integer("sequence").notNull(),
  panelRuns: text("panel_runs").notNull(),
  categories: text("categories").notNull(),
  readiness: text("readiness").notNull(),
  recordedAt: integer("recorded_at", { mode: "timestamp" }).notNull(),
});

// 10. Submission Status Events Table
export const submissionStatusEvents = sqliteTable("submission_status_events", {
  id: text("id").primaryKey(),
  submissionId: text("submission_id")
    .references(() => submissions.id, { onDelete: "cascade" })
    .notNull(),
  status: text("status").notNull(),
  actorId: text("actor_id").references(() => users.id),
  actorRole: text("actor_role").notNull(),
  reasonComment: text("reason_comment"),
  recordedAt: integer("recorded_at", { mode: "timestamp" })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// 11. Idempotency Records Table
export const idempotencyRecords = sqliteTable("idempotency_records", {
  key: text("key").primaryKey(),
  requestHash: text("request_hash").notNull(),
  responsePayload: text("response_payload").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});
