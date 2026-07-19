import { z } from "zod";
import {
  SELLER_PACKAGE_SCHEMA_VERSION,
  SELLER_PACKAGE_EXPORT_VERSION,
  type SellerPackageDraft,
} from "./package-model";

/**
 * Shared, server-safe runtime parser for the agent-review submission boundary.
 *
 * This is the ONE authoritative runtime validator for the seller package that
 * the finalize route accepts. It is intentionally aligned, field for field,
 * with the merged `package-model.ts` types rather than re-deriving a second,
 * independent `seller-agent-package.v1` contract. In particular:
 *
 *   - `PackagePanelMetadata` has NO durable `storageKey`. The server owns and
 *     assigns durable storage keys during finalize; a client never supplies one.
 *   - Seller history snapshots (`panelSnapshot`, `categorySnapshot`,
 *     `regionSnapshot`) are preserved, not stripped, so a legitimate export that
 *     carries them still hashes to its own integrity value.
 *
 * The submission ENVELOPE is a distinct, versioned server-receiver contract — an
 * intentional boundary adapter, not a re-labeling of the local export. The
 * merged local export always carries `transmission: "local-download-only"` and
 * `receivingAgent: "not-configured-local-export"`; those exports are refused by
 * the finalize route. A real server submission must instead declare the truthful
 * agent-review-portal transmission and the internal receiving queue below. The
 * embedded `package` is the seller's original snapshot, carried through
 * unchanged.
 */

/** Truthful transmission marker for a server-received agent-review submission. */
export const AGENT_REVIEW_TRANSMISSION = "agent-review-portal" as const;
/** The local-only export marker that must never be treated as a server submission. */
export const LOCAL_DOWNLOAD_ONLY_TRANSMISSION = "local-download-only" as const;
/** Truthful identity of the internal receiver. Not TTB, COLA, or any government body. */
export const AGENT_REVIEW_RECEIVER = "label-lens-internal-agent-queue" as const;

const PanelRoleSchema = z.enum(["front", "back", "neck", "side", "other"]);
const PanelRotationSchema = z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]);
const CategoryPreparationDecisionSchema = z.enum(["provided", "unresolved", "not_present"]);
const PackageReadinessSchema = z.enum(["needs_seller_review", "ready_for_agent_submission"]);

// Mirrors PackagePanelMetadata. No storageKey: durable keys are server-assigned.
const PackagePanelMetadataSchema = z.object({
  panelId: z.string().min(1),
  order: z.number(),
  role: PanelRoleSchema,
  displayName: z.string().min(1),
  mediaType: z.string().min(1),
  byteSize: z.number().int().positive(),
  checksumSha256: z.string().length(64),
  width: z.number(),
  height: z.number(),
  rotation: PanelRotationSchema,
});

// Mirrors SellerEvidenceRegion.
const SellerEvidenceRegionSchema = z.object({
  regionId: z.string().min(1),
  categoryId: z.string().min(1),
  panelId: z.string().min(1),
  unit: z.literal("normalized-panel-relative"),
  provenance: z.literal("seller-selected-region"),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

const PackageCategoryDraftSchema = z.object({
  categoryId: z.string().min(1),
  decision: CategoryPreparationDecisionSchema,
  expectedValue: z.string(),
  regions: z.array(SellerEvidenceRegionSchema),
});

const PackagePanelDecisionsSchema = z.object({
  back: z.enum(["unresolved", "upload", "absent"]),
  additional: z.enum(["unresolved", "add", "none"]),
});

// Mirrors SellerPackageChange. Snapshot fields are preserved, never stripped.
const SellerPackageChangeSchema = z.object({
  changeId: z.string().min(1),
  sequence: z.number(),
  recordedAt: z.string(),
  action: z.string().min(1),
  categoryId: z.string().optional(),
  panelId: z.string().optional(),
  regionId: z.string().optional(),
  panelSnapshot: PackagePanelMetadataSchema.optional(),
  categorySnapshot: z
    .object({
      categoryId: z.string().min(1),
      decision: CategoryPreparationDecisionSchema,
      expectedValue: z.string(),
    })
    .optional(),
  regionSnapshot: SellerEvidenceRegionSchema.optional(),
  detail: z.string(),
});

const PackageCategoryAnalysisSchema = z.object({
  categoryId: z.string().min(1),
  state: z.enum(["clearly_readable", "needs_review", "not_found", "not_applicable"]),
  observedValue: z.string().nullable(),
  supportingPanelIds: z.array(z.string()),
  supportingRegionIds: z.array(z.string()),
  reason: z.string(),
});

const PackagePanelMachineRunSchema = z.object({
  panelId: z.string().min(1),
  machineResultId: z.string().min(1),
  exportJson: z.string(),
  observations: z.unknown(),
});

const PackageAnalysisRunSchema = z.object({
  analysisRunId: z.string().min(1),
  sequence: z.number(),
  sellerChangeSequence: z.number(),
  recordedAt: z.string(),
  panelRuns: z.array(PackagePanelMachineRunSchema),
  categories: z.array(PackageCategoryAnalysisSchema),
  readiness: PackageReadinessSchema,
});

const SellerPackageDraftSchema = z.object({
  schemaVersion: z.literal(SELLER_PACKAGE_SCHEMA_VERSION),
  packageId: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  profile: z.object({ id: z.string().min(1), version: z.string().min(1) }),
  panelDecisions: PackagePanelDecisionsSchema.optional(),
  panels: z.array(PackagePanelMetadataSchema).min(1),
  categories: z.array(PackageCategoryDraftSchema),
  sellerChangeHistory: z.array(SellerPackageChangeSchema),
  analysisRuns: z.array(PackageAnalysisRunSchema).min(1),
});

/**
 * The server-receiver submission envelope. Distinct from the local export: it
 * declares the truthful agent-review transmission and the internal receiver, and
 * carries the seller's original package snapshot unchanged.
 */
export const AgentReviewSubmissionSchema = z.object({
  exportSchemaVersion: z.literal(SELLER_PACKAGE_EXPORT_VERSION),
  exportType: z.literal("seller-prepared-agent-package"),
  boundary: z.object({
    // Refuse local-only exports up front; only truthful server transmission is accepted.
    transmission: z.literal(AGENT_REVIEW_TRANSMISSION),
    governmentApproval: z.literal(false),
    statement: z.string().min(1),
  }),
  submittedBy: z.string().min(1),
  submittedAt: z.string(),
  receivingAgent: z.string().min(1),
  package: SellerPackageDraftSchema,
  readiness: PackageReadinessSchema,
  applicationBuild: z.unknown(),
  integrity: z.object({
    algorithm: z.literal("sha256"),
    scope: z.literal("canonical-package-payload"),
    value: z.string().length(64),
  }),
});

export type AgentReviewSubmission = Omit<z.infer<typeof AgentReviewSubmissionSchema>, "package"> & {
  package: SellerPackageDraft;
};

export type AgentReviewSubmissionParseResult =
  { ok: true; value: AgentReviewSubmission } | { ok: false; issues: z.ZodIssue[] };

/**
 * Parse and validate a raw payload as an agent-review submission envelope. The
 * embedded package is validated against the shared model shape and returned
 * typed as the merged `SellerPackageDraft`.
 */
export function parseAgentReviewSubmission(raw: unknown): AgentReviewSubmissionParseResult {
  const result = AgentReviewSubmissionSchema.safeParse(raw);
  if (!result.success) {
    return { ok: false, issues: result.error.issues };
  }
  return { ok: true, value: result.data as AgentReviewSubmission };
}
