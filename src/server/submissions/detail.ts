import "server-only";

import { asc, desc, eq } from "drizzle-orm";

import { db, schema } from "@/db/client";
import { verifyRevision } from "@/lib/integrity";

/**
 * A controlled, integrity-verified view of one submission for agent review. It
 * deliberately excludes raw canonical JSON, durable storage keys, filesystem
 * paths, integrity secrets, provenance append-tokens, and signatures. Seller
 * evidence and machine observations are returned as separate structures so the
 * UI can keep them visibly distinct.
 */

export interface PanelView {
  panelId: string;
  role: string;
  displayName: string;
  mediaType: string;
  byteSize: number;
  checksumSha256: string;
  width: number;
  height: number;
  rotation: number;
  assetUrl: string;
}

export interface SellerEvidenceView {
  categoryId: string;
  decision: string;
  expectedValue: string | null;
  regions: unknown[];
}

export interface MachinePanelRunView {
  panelId: string;
  machineResultId: string;
  observations: unknown;
}

export interface MachineAnalysisView {
  analysisRunId: string;
  sequence: number;
  readiness: string;
  recordedAt: string;
  panelRuns: MachinePanelRunView[];
  categories: unknown[];
}

export interface SubmissionDetailView {
  submission: { id: string; status: string; isDemo: boolean; version: number };
  revision: {
    id: string;
    revisionNumber: number;
    profileId: string;
    profileVersion: string;
    submittedBy: string;
    submittedAt: string;
    integrityVerified: true;
  };
  panels: PanelView[];
  sellerEvidence: SellerEvidenceView[];
  machineAnalysis: MachineAnalysisView | null;
  provenance: { applicationBuild: unknown } | null;
  statusHistory: {
    status: string;
    actorRole: string;
    reasonComment: string | null;
    recordedAt: string;
  }[];
}

export type SubmissionDetailResult =
  | { ok: true; view: SubmissionDetailView }
  | { ok: false; reason: "not_found" | "integrity_failed" };

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Build the agent detail view. The caller must have already authorized
 * agent/admin access. Returns `not_found` for a missing submission/revision and
 * `integrity_failed` (fail closed) when the stored revision HMAC does not verify.
 */
export async function buildSubmissionDetail(submissionId: string): Promise<SubmissionDetailResult> {
  const submissionRows = (await db
    .select({
      id: schema.submissions.id,
      currentStatus: schema.submissions.currentStatus,
      isDemo: schema.submissions.isDemo,
      version: schema.submissions.version,
    })
    .from(schema.submissions)
    .where(eq(schema.submissions.id, submissionId))
    .limit(1)) as {
    id: string;
    currentStatus: string;
    isDemo: boolean;
    version: number;
  }[];

  const submission = submissionRows[0];
  if (!submission) return { ok: false, reason: "not_found" };

  const revisions = (await db
    .select()
    .from(schema.submissionRevisions)
    .where(eq(schema.submissionRevisions.submissionId, submissionId))
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

  const revision = revisions[0];
  if (!revision) return { ok: false, reason: "not_found" };

  // Fail closed if the immutable revision fails its versioned HMAC.
  if (!verifyRevision(revision.canonicalJson, revision.integritySignature)) {
    return { ok: false, reason: "integrity_failed" };
  }

  const panelRows = (await db
    .select()
    .from(schema.submittedPanels)
    .where(eq(schema.submittedPanels.revisionId, revision.id))
    .orderBy(asc(schema.submittedPanels.displayName))) as {
    id: string;
    role: string;
    displayName: string;
    mediaType: string;
    byteSize: number;
    checksumSha256: string;
    width: number;
    height: number;
    rotation: number;
  }[];

  const panels: PanelView[] = panelRows.map((p) => ({
    panelId: p.id,
    role: p.role,
    displayName: p.displayName,
    mediaType: p.mediaType,
    byteSize: p.byteSize,
    checksumSha256: p.checksumSha256,
    width: p.width,
    height: p.height,
    rotation: p.rotation,
    // Server-mediated asset URL — never the durable storage key/filesystem path.
    assetUrl: `/api/agent/submissions/${encodeURIComponent(submission.id)}/panels/${encodeURIComponent(p.id)}`,
  }));

  const evidenceRows = (await db
    .select()
    .from(schema.sellerEvidenceSnapshots)
    .where(eq(schema.sellerEvidenceSnapshots.revisionId, revision.id))) as {
    categoryId: string;
    decision: string;
    expectedValue: string | null;
    regions: string;
  }[];

  const sellerEvidence: SellerEvidenceView[] = evidenceRows.map((e) => {
    const regions = safeParse(e.regions);
    return {
      categoryId: e.categoryId,
      decision: e.decision,
      expectedValue: e.expectedValue,
      regions: Array.isArray(regions) ? regions : [],
    };
  });

  const machineRows = (await db
    .select()
    .from(schema.machineAnalysisSnapshots)
    .where(eq(schema.machineAnalysisSnapshots.revisionId, revision.id))
    .orderBy(desc(schema.machineAnalysisSnapshots.sequence))
    .limit(1)) as {
    analysisRunId: string;
    sequence: number;
    panelRuns: string;
    categories: string;
    readiness: string;
    recordedAt: Date;
  }[];

  let machineAnalysis: MachineAnalysisView | null = null;
  let provenance: { applicationBuild: unknown } | null = null;
  const machine = machineRows[0];
  if (machine) {
    const parsedRuns = safeParse(machine.panelRuns);
    const parsedCategories = safeParse(machine.categories);
    const runsArray = Array.isArray(parsedRuns) ? parsedRuns : [];

    const panelRuns: MachinePanelRunView[] = runsArray.map((run) => {
      const r = run as { panelId?: unknown; machineResultId?: unknown; observations?: unknown };
      return {
        panelId: typeof r.panelId === "string" ? r.panelId : "",
        machineResultId: typeof r.machineResultId === "string" ? r.machineResultId : "",
        observations: r.observations ?? null,
      };
    });

    // Analysis/build provenance, when the machine export carries a version manifest.
    for (const run of runsArray) {
      const exportJson = (run as { exportJson?: unknown }).exportJson;
      if (typeof exportJson === "string") {
        const parsed = safeParse(exportJson) as {
          versionManifest?: { applicationBuild?: unknown };
        } | null;
        if (parsed?.versionManifest?.applicationBuild !== undefined) {
          provenance = { applicationBuild: parsed.versionManifest.applicationBuild };
          break;
        }
      }
    }

    machineAnalysis = {
      analysisRunId: machine.analysisRunId,
      sequence: machine.sequence,
      readiness: machine.readiness,
      recordedAt: machine.recordedAt.toISOString(),
      panelRuns,
      categories: Array.isArray(parsedCategories) ? parsedCategories : [],
    };
  }

  const eventRows = (await db
    .select({
      status: schema.submissionStatusEvents.status,
      actorRole: schema.submissionStatusEvents.actorRole,
      reasonComment: schema.submissionStatusEvents.reasonComment,
      recordedAt: schema.submissionStatusEvents.recordedAt,
    })
    .from(schema.submissionStatusEvents)
    .where(eq(schema.submissionStatusEvents.submissionId, submissionId))
    .orderBy(asc(schema.submissionStatusEvents.recordedAt))) as {
    status: string;
    actorRole: string;
    reasonComment: string | null;
    recordedAt: Date;
  }[];

  return {
    ok: true,
    view: {
      submission: {
        id: submission.id,
        status: submission.currentStatus,
        isDemo: submission.isDemo,
        version: submission.version,
      },
      revision: {
        id: revision.id,
        revisionNumber: revision.revisionNumber,
        profileId: revision.profileId,
        profileVersion: revision.profileVersion,
        submittedBy: revision.submittedBy,
        submittedAt: revision.submittedAt.toISOString(),
        integrityVerified: true,
      },
      panels,
      sellerEvidence,
      machineAnalysis,
      provenance,
      statusHistory: eventRows.map((e) => ({
        status: e.status,
        actorRole: e.actorRole,
        reasonComment: e.reasonComment,
        recordedAt: e.recordedAt.toISOString(),
      })),
    },
  };
}

/** Resolve the durable storage key for a panel that belongs to a submission. */
export async function resolvePanelStorageKey(
  submissionId: string,
  panelId: string,
): Promise<{ storageKey: string; mediaType: string } | null> {
  const rows = (await db
    .select({
      storageKey: schema.submittedPanels.storageKey,
      mediaType: schema.submittedPanels.mediaType,
      revisionId: schema.submittedPanels.revisionId,
    })
    .from(schema.submittedPanels)
    .where(eq(schema.submittedPanels.id, panelId))
    .limit(1)) as { storageKey: string; mediaType: string; revisionId: string }[];

  const panel = rows[0];
  if (!panel) return null;

  // Confirm the panel's revision actually belongs to the requested submission.
  const revRows = (await db
    .select({ submissionId: schema.submissionRevisions.submissionId })
    .from(schema.submissionRevisions)
    .where(eq(schema.submissionRevisions.id, panel.revisionId))
    .limit(1)) as { submissionId: string }[];

  if (revRows[0]?.submissionId !== submissionId) return null;

  return { storageKey: panel.storageKey, mediaType: panel.mediaType };
}
