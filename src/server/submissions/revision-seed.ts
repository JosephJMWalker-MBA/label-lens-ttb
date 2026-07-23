import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { verifyRevision } from "@/lib/integrity";
import type { RevisionResponseContext } from "@/features/package-preparation/revision-context";
import { reconcilePanelSourceIdentity } from "./panel-identity";

export interface RevisionSeedView {
  submissionId: string;
  currentStatus: "changes_requested";
  expectedSubmissionVersion: number;
  baseRevision: {
    id: string;
    revisionNumber: number;
    profileId: string;
    profileVersion: string;
    submittedBy: string;
    submittedAt: string;
    panels: Array<{
      panelId: string;
      assetPanelId: string;
      order: number;
      role: string;
      displayName: string;
      mediaType: string;
      byteSize: number;
      checksumSha256: string;
      width: number;
      height: number;
      rotation: number;
    }>;
    sellerEvidence: Array<{
      categoryId: string;
      decision: string;
      expectedValue: string | null;
      regions: unknown[];
    }>;
  };
  changeRequest: {
    decisionId: string;
    revisionId: string;
    revisionNumber: number;
    rationale: string;
    recordedAt: string;
  };
  revisionContext: RevisionResponseContext;
}

export type RevisionSeedResult =
  | { ok: true; seed: RevisionSeedView }
  | {
      ok: false;
      reason: RevisionSeedFailureReason;
    };

type RevisionSeedFailureReason =
  | "not_found"
  | "not_seller"
  | "not_changes_requested"
  | "integrity_failed"
  | "change_request_missing"
  | "change_request_already_answered"
  | "panel_identity_inconsistent";

function safeArrayFromJson(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function buildRevisionSeedForSeller(args: {
  submissionId: string;
  sellerId: string;
  sellerRole: string;
}): Promise<RevisionSeedResult> {
  if (args.sellerRole !== "seller") return { ok: false, reason: "not_seller" };

  const submissionRows = (await db
    .select({
      id: schema.submissions.id,
      currentStatus: schema.submissions.currentStatus,
      creatorId: schema.submissions.creatorId,
      version: schema.submissions.version,
    })
    .from(schema.submissions)
    .where(eq(schema.submissions.id, args.submissionId))
    .limit(1)) as {
    id: string;
    currentStatus: string;
    creatorId: string;
    version: number;
  }[];

  const submission = submissionRows[0];
  if (!submission || submission.creatorId !== args.sellerId) {
    return { ok: false, reason: "not_found" };
  }
  if (submission.currentStatus !== "changes_requested") {
    return { ok: false, reason: "not_changes_requested" };
  }

  const revisionRows = (await db
    .select({
      id: schema.submissionRevisions.id,
      revisionNumber: schema.submissionRevisions.revisionNumber,
      profileId: schema.submissionRevisions.profileId,
      profileVersion: schema.submissionRevisions.profileVersion,
      submittedBy: schema.submissionRevisions.submittedBy,
      submittedAt: schema.submissionRevisions.submittedAt,
      canonicalJson: schema.submissionRevisions.canonicalJson,
      integritySignature: schema.submissionRevisions.integritySignature,
    })
    .from(schema.submissionRevisions)
    .where(eq(schema.submissionRevisions.submissionId, args.submissionId))
    .orderBy(desc(schema.submissionRevisions.revisionNumber))
    .limit(1)) as {
    id: string;
    revisionNumber: number;
    profileId: string;
    profileVersion: string;
    submittedBy: string;
    submittedAt: Date;
    canonicalJson: string;
    integritySignature: string;
  }[];

  const revision = revisionRows[0];
  if (!revision) return { ok: false, reason: "not_found" };
  if (!verifyRevision(revision.canonicalJson, revision.integritySignature)) {
    return { ok: false, reason: "integrity_failed" };
  }

  const decisionRows = (await db
    .select({
      id: schema.agentDecisions.id,
      revisionId: schema.agentDecisions.revisionId,
      revisionNumber: schema.agentDecisions.revisionNumber,
      decisionType: schema.agentDecisions.decisionType,
      rationale: schema.agentDecisions.rationale,
      recordedAt: schema.agentDecisions.recordedAt,
    })
    .from(schema.agentDecisions)
    .where(
      and(
        eq(schema.agentDecisions.submissionId, args.submissionId),
        eq(schema.agentDecisions.revisionId, revision.id),
        eq(schema.agentDecisions.decisionType, "changes_requested"),
      ),
    )
    .limit(1)) as {
    id: string;
    revisionId: string;
    revisionNumber: number;
    decisionType: string;
    rationale: string;
    recordedAt: Date;
  }[];

  const decision = decisionRows[0];
  if (!decision) return { ok: false, reason: "change_request_missing" };

  const existingResponses = await db
    .select({ id: schema.submissionRevisionResponses.id })
    .from(schema.submissionRevisionResponses)
    .where(eq(schema.submissionRevisionResponses.respondedToDecisionId, decision.id))
    .limit(1);
  if (existingResponses.length > 0) {
    return { ok: false, reason: "change_request_already_answered" };
  }

  const panelRows = (await db
    .select({
      id: schema.submittedPanels.id,
      role: schema.submittedPanels.role,
      displayName: schema.submittedPanels.displayName,
      mediaType: schema.submittedPanels.mediaType,
      byteSize: schema.submittedPanels.byteSize,
      checksumSha256: schema.submittedPanels.checksumSha256,
      width: schema.submittedPanels.width,
      height: schema.submittedPanels.height,
      rotation: schema.submittedPanels.rotation,
      storageKey: schema.submittedPanels.storageKey,
    })
    .from(schema.submittedPanels)
    .where(eq(schema.submittedPanels.revisionId, revision.id))
    .orderBy(asc(schema.submittedPanels.role), asc(schema.submittedPanels.displayName))) as Array<{
    id: string;
    role: string;
    displayName: string;
    mediaType: string;
    byteSize: number;
    checksumSha256: string;
    width: number;
    height: number;
    rotation: number;
    storageKey: string;
  }>;

  const seedPanels: RevisionSeedView["baseRevision"]["panels"] = [];
  for (const [index, panel] of panelRows.entries()) {
    const identity = reconcilePanelSourceIdentity({
      submissionId: submission.id,
      revisionId: revision.id,
      revisionNumber: revision.revisionNumber,
      storedPanelId: panel.id,
      storageKey: panel.storageKey,
      checksumSha256: panel.checksumSha256,
    });
    if (!identity.ok) return { ok: false, reason: "panel_identity_inconsistent" };
    seedPanels.push({
      panelId: identity.panelId,
      assetPanelId: identity.assetPanelId,
      order: index,
      role: panel.role,
      displayName: panel.displayName,
      mediaType: panel.mediaType,
      byteSize: panel.byteSize,
      checksumSha256: panel.checksumSha256,
      width: panel.width,
      height: panel.height,
      rotation: panel.rotation,
    });
  }

  const evidenceRows = (await db
    .select({
      categoryId: schema.sellerEvidenceSnapshots.categoryId,
      decision: schema.sellerEvidenceSnapshots.decision,
      expectedValue: schema.sellerEvidenceSnapshots.expectedValue,
      regions: schema.sellerEvidenceSnapshots.regions,
    })
    .from(schema.sellerEvidenceSnapshots)
    .where(eq(schema.sellerEvidenceSnapshots.revisionId, revision.id))
    .orderBy(asc(schema.sellerEvidenceSnapshots.categoryId))) as Array<{
    categoryId: string;
    decision: string;
    expectedValue: string | null;
    regions: string;
  }>;
  const seedPanelIds = new Set(seedPanels.map((panel) => panel.panelId));
  const sellerEvidence = evidenceRows.map((evidence) => ({
    categoryId: evidence.categoryId,
    decision: evidence.decision,
    expectedValue: evidence.expectedValue,
    regions: safeArrayFromJson(evidence.regions),
  }));
  for (const evidence of sellerEvidence) {
    for (const region of evidence.regions) {
      const panelId = (region as { panelId?: unknown })?.panelId;
      if (typeof panelId !== "string" || !seedPanelIds.has(panelId)) {
        return { ok: false, reason: "panel_identity_inconsistent" };
      }
    }
  }

  const revisionContext: RevisionResponseContext = {
    kind: "requested_changes_response",
    submissionId: submission.id,
    baseRevisionId: revision.id,
    baseRevisionNumber: revision.revisionNumber,
    respondedToDecisionId: decision.id,
    expectedSubmissionVersion: submission.version,
  };

  return {
    ok: true,
    seed: {
      submissionId: submission.id,
      currentStatus: "changes_requested",
      expectedSubmissionVersion: submission.version,
      baseRevision: {
        id: revision.id,
        revisionNumber: revision.revisionNumber,
        profileId: revision.profileId,
        profileVersion: revision.profileVersion,
        submittedBy: revision.submittedBy,
        submittedAt: revision.submittedAt.toISOString(),
        panels: seedPanels,
        sellerEvidence,
      },
      changeRequest: {
        decisionId: decision.id,
        revisionId: decision.revisionId,
        revisionNumber: decision.revisionNumber,
        rationale: decision.rationale,
        recordedAt: decision.recordedAt.toISOString(),
      },
      revisionContext,
    },
  };
}

export async function resolveRevisionSeedPanelAsset(args: {
  submissionId: string;
  sellerId: string;
  sellerRole: string;
  assetPanelId: string;
}): Promise<
  | { ok: true; storageKey: string; mediaType: string }
  | { ok: false; reason: RevisionSeedFailureReason }
> {
  const seed = await buildRevisionSeedForSeller(args);
  if (!seed.ok) return seed;
  const requestedPanel = seed.seed.baseRevision.panels.find(
    (panel) => panel.assetPanelId === args.assetPanelId,
  );
  if (!requestedPanel) return { ok: false, reason: "not_found" };

  const rows = (await db
    .select({
      storageKey: schema.submittedPanels.storageKey,
      mediaType: schema.submittedPanels.mediaType,
    })
    .from(schema.submittedPanels)
    .where(
      and(
        eq(schema.submittedPanels.id, args.assetPanelId),
        eq(schema.submittedPanels.revisionId, seed.seed.baseRevision.id),
      ),
    )
    .limit(1)) as { storageKey: string; mediaType: string }[];

  const panel = rows[0];
  return panel ? { ok: true, ...panel } : { ok: false, reason: "not_found" };
}
