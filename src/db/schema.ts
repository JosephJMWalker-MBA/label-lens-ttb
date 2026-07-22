import {
  mysqlTable,
  varchar,
  text,
  mediumtext,
  boolean,
  timestamp,
  int,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/mysql-core";

// 1. Users Table
export const users = mysqlTable(
  "users",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    name: text("name"),
    email: varchar("email", { length: 255 }).notNull(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    image: text("image"),
    role: varchar("role", { length: 50 }).default("seller").notNull(), // "seller" | "agent" | "admin"
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    emailIdx: uniqueIndex("email_idx").on(table.email),
  }),
);

// 2. Sessions Table
export const sessions = mysqlTable(
  "sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    token: varchar("token", { length: 255 }).notNull(),
    userId: varchar("user_id", { length: 36 })
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    tokenIdx: uniqueIndex("token_idx").on(table.token),
  }),
);

// 3. Accounts Table (required by Better Auth credentials hashing)
export const accounts = mysqlTable("accounts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: varchar("user_id", { length: 36 })
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  expiresAt: timestamp("expires_at"),
  password: text("password"), // Stores the hashed credentials password
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// 4. Verifications Table (required by Better Auth token validation)
export const verifications = mysqlTable("verifications", {
  id: varchar("id", { length: 36 }).primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// 5. Submissions Table
export const submissions = mysqlTable("submissions", {
  id: varchar("id", { length: 255 }).primaryKey(),
  creatorId: varchar("creator_id", { length: 36 })
    .references(() => users.id)
    .notNull(),
  currentStatus: varchar("current_status", { length: 50 }).notNull(), // "waiting_for_agent_review" | "in_agent_review" | "changes_requested" | "internally_accepted" | "withdrawn"
  isDemo: boolean("is_demo").default(false).notNull(),
  version: int("version").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

// 6. Submission Revisions Table
export const submissionRevisions = mysqlTable(
  "submission_revisions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    submissionId: varchar("submission_id", { length: 255 })
      .references(() => submissions.id, { onDelete: "cascade" })
      .notNull(),
    revisionNumber: int("revision_number").notNull(),
    profileId: varchar("profile_id", { length: 100 }).notNull(),
    profileVersion: varchar("profile_version", { length: 50 }).notNull(),
    submittedBy: varchar("submitted_by", { length: 255 }).notNull(),
    submittedAt: timestamp("submitted_at").notNull(),
    canonicalJson: mediumtext("canonical_json").notNull(),
    integritySignature: varchar("integrity_signature", { length: 255 }).notNull(), // format: "v1:<hmac-sha256-hex>"
  },
  (table) => ({
    subRevisionIdx: uniqueIndex("sub_revision_idx").on(table.submissionId, table.revisionNumber),
  }),
);

// 7. Submitted Panels Table
export const submittedPanels = mysqlTable(
  "submitted_panels",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    revisionId: varchar("revision_id", { length: 36 }).notNull(),
    role: varchar("role", { length: 50 }).notNull(),
    displayName: varchar("display_name", { length: 255 }).notNull(),
    mediaType: varchar("media_type", { length: 100 }).notNull(),
    byteSize: int("byte_size").notNull(),
    checksumSha256: varchar("checksum_sha256", { length: 64 }).notNull(),
    width: int("width").notNull(),
    height: int("height").notNull(),
    rotation: int("rotation").notNull(),
    storageKey: varchar("storage_key", { length: 500 }).notNull(),
  },
  (table) => ({
    fk: foreignKey({
      name: "submitted_panels_revision_id_fk",
      columns: [table.revisionId],
      foreignColumns: [submissionRevisions.id],
    }).onDelete("cascade"),
  }),
);

// 8. Seller Evidence Snapshots Table
export const sellerEvidenceSnapshots = mysqlTable(
  "seller_evidence_snapshots",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    revisionId: varchar("revision_id", { length: 36 }).notNull(),
    categoryId: varchar("category_id", { length: 100 }).notNull(),
    decision: varchar("decision", { length: 50 }).notNull(),
    expectedValue: text("expected_value"),
    regions: text("regions").notNull(),
  },
  (table) => ({
    fk: foreignKey({
      name: "seller_evidence_snapshots_revision_id_fk",
      columns: [table.revisionId],
      foreignColumns: [submissionRevisions.id],
    }).onDelete("cascade"),
  }),
);

// 9. Machine Analysis Snapshots Table
export const machineAnalysisSnapshots = mysqlTable(
  "machine_analysis_snapshots",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    revisionId: varchar("revision_id", { length: 36 }).notNull(),
    analysisRunId: varchar("analysis_run_id", { length: 36 }).notNull(),
    sequence: int("sequence").notNull(),
    panelRuns: text("panel_runs").notNull(),
    categories: text("categories").notNull(),
    readiness: varchar("readiness", { length: 50 }).notNull(),
    recordedAt: timestamp("recorded_at").notNull(),
  },
  (table) => ({
    fk: foreignKey({
      name: "machine_analysis_snapshots_revision_id_fk",
      columns: [table.revisionId],
      foreignColumns: [submissionRevisions.id],
    }).onDelete("cascade"),
  }),
);

// 10. Submission Status Events Table
export const submissionStatusEvents = mysqlTable("submission_status_events", {
  id: varchar("id", { length: 36 }).primaryKey(),
  submissionId: varchar("submission_id", { length: 255 })
    .references(() => submissions.id, { onDelete: "cascade" })
    .notNull(),
  status: varchar("status", { length: 50 }).notNull(),
  actorId: varchar("actor_id", { length: 36 }).references(() => users.id),
  actorRole: varchar("actor_role", { length: 50 }).notNull(),
  reasonComment: text("reason_comment"),
  recordedAt: timestamp("recorded_at").defaultNow().notNull(),
});

// 11. Reviewer Claims Table
export const reviewerClaims = mysqlTable(
  "reviewer_claims",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    submissionId: varchar("submission_id", { length: 255 })
      .references(() => submissions.id)
      .notNull(),
    revisionId: varchar("revision_id", { length: 36 })
      .references(() => submissionRevisions.id)
      .notNull(),
    revisionNumber: int("revision_number").notNull(),
    reviewerId: varchar("reviewer_id", { length: 36 })
      .references(() => users.id)
      .notNull(),
    reviewerRole: varchar("reviewer_role", { length: 50 }).notNull(),
    state: varchar("state", { length: 50 }).notNull(), // "active" | "released" | "force_released" | "decided"
    activeSubmissionId: varchar("active_submission_id", { length: 255 }).references(
      () => submissions.id,
    ),
    claimedSubmissionVersion: int("claimed_submission_version").notNull(),
    claimedAt: timestamp("claimed_at").notNull(),
    releasedAt: timestamp("released_at"),
    releasedBy: varchar("released_by", { length: 36 }).references(() => users.id),
    releasedByRole: varchar("released_by_role", { length: 50 }),
    releaseReason: text("release_reason"),
    decidedAt: timestamp("decided_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    activeSubmissionIdx: uniqueIndex("reviewer_claims_active_submission_idx").on(
      table.activeSubmissionId,
    ),
  }),
);

// 12. Agent Decisions Table
export const agentDecisions = mysqlTable(
  "agent_decisions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    submissionId: varchar("submission_id", { length: 255 })
      .references(() => submissions.id)
      .notNull(),
    revisionId: varchar("revision_id", { length: 36 })
      .references(() => submissionRevisions.id)
      .notNull(),
    revisionNumber: int("revision_number").notNull(),
    claimId: varchar("claim_id", { length: 36 })
      .references(() => reviewerClaims.id)
      .notNull(),
    reviewerId: varchar("reviewer_id", { length: 36 })
      .references(() => users.id)
      .notNull(),
    reviewerRole: varchar("reviewer_role", { length: 50 }).notNull(),
    decisionType: varchar("decision_type", { length: 50 }).notNull(), // "changes_requested" | "internally_accepted"
    priorStatus: varchar("prior_status", { length: 50 }).notNull(),
    resultingStatus: varchar("resulting_status", { length: 50 }).notNull(),
    rationale: text("rationale").notNull(),
    submissionVersionBefore: int("submission_version_before").notNull(),
    submissionVersionAfter: int("submission_version_after").notNull(),
    idempotencyRecordKey: varchar("idempotency_record_key", { length: 255 }).notNull(),
    recordedAt: timestamp("recorded_at").notNull(),
  },
  (table) => ({
    revisionDecisionIdx: uniqueIndex("agent_decisions_revision_idx").on(table.revisionId),
    claimDecisionIdx: uniqueIndex("agent_decisions_claim_idx").on(table.claimId),
    idempotencyDecisionIdx: uniqueIndex("agent_decisions_idempotency_record_key_idx").on(
      table.idempotencyRecordKey,
    ),
  }),
);

// 13. Idempotency Records Table
export const idempotencyRecords = mysqlTable("idempotency_records", {
  key: varchar("key", { length: 255 }).primaryKey(),
  requestHash: varchar("request_hash", { length: 64 }).notNull(),
  responsePayload: text("response_payload").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
