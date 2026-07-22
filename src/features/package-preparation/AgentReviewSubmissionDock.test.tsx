// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  load: vi.fn(),
}));

const auth = vi.hoisted(() => ({
  useSession: vi.fn(),
}));

const model = vi.hoisted(() => ({
  buildSellerPackageExport: vi.fn(),
  latestAnalysisIsCurrent: vi.fn(),
  packageReadyForAgentReview: vi.fn(),
}));

vi.mock("./package-draft-store", () => ({
  loadPackageDraftLocally: store.load,
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: auth.useSession,
  },
}));

vi.mock("./package-model", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./package-model")>();
  return {
    ...actual,
    buildSellerPackageExport: model.buildSellerPackageExport,
    latestAnalysisIsCurrent: model.latestAnalysisIsCurrent,
    packageReadyForAgentReview: model.packageReadyForAgentReview,
  };
});

import { AgentReviewSubmissionDock } from "./AgentReviewSubmissionDock";
import type { StoredPackageDraft } from "./package-draft-store";

const revisionContext = {
  kind: "requested_changes_response" as const,
  submissionId: "pkg-resubmit",
  baseRevisionId: "revision-parent",
  baseRevisionNumber: 1,
  respondedToDecisionId: "decision-change",
  expectedSubmissionVersion: 3,
};

function storedDraft(args: { revision?: boolean } = {}): StoredPackageDraft {
  return {
    draft: {
      schemaVersion: "seller-package-draft.v1",
      packageId: args.revision ? "pkg-resubmit" : "pkg-finalize",
      createdAt: "2026-07-22T00:00:00.000Z",
      updatedAt: "2026-07-22T00:05:00.000Z",
      profile: { id: "wine-label-requirements", version: "1.0.0" },
      panelDecisions: { back: "absent", additional: "none" },
      panels: [
        {
          panelId: "panel-front",
          order: 0,
          role: "front",
          displayName: "front.png",
          mediaType: "image/png",
          byteSize: 5,
          checksumSha256: "a".repeat(64),
          width: 1,
          height: 1,
          rotation: 0,
        },
      ],
      categories: [],
      sellerChangeHistory: [],
      analysisRuns: [
        {
          analysisRunId: "analysis-1",
          sequence: 1,
          sellerChangeSequence: 0,
          recordedAt: "2026-07-22T00:04:00.000Z",
          panelRuns: [],
          categories: [],
          readiness: "ready_for_agent_submission",
        },
      ],
    },
    panelFiles: [
      {
        panelId: "panel-front",
        file: new File(["front"], "front.png", { type: "image/png" }),
      },
    ],
    revisionContext: args.revision ? revisionContext : undefined,
  };
}

function exportedPayload(stored: StoredPackageDraft) {
  return {
    exportSchemaVersion: "seller-agent-package.v1",
    exportType: "seller-prepared-agent-package",
    boundary: {
      transmission: "local-download-only",
      governmentApproval: false,
      statement: "Local export.",
    },
    submittedBy: "Seller",
    submittedAt: "2026-07-22T00:06:00.000Z",
    receivingAgent: "not-configured-local-export",
    package: stored.draft,
    readiness: "ready_for_agent_submission",
    applicationBuild: {},
    integrity: {
      algorithm: "sha256",
      scope: "canonical-package-payload",
      value: "0".repeat(64),
    },
  };
}

function installFetchOnce(response: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET") return new Response(null, { status: 404 });
      return Response.json(response, { status });
    }),
  );
}

async function submit() {
  const button = await screen.findByRole("button", { name: /submit for agent review/i });
  await waitFor(() => expect(button).not.toBeDisabled());
  fireEvent.click(button);
}

beforeEach(() => {
  store.load.mockReset();
  auth.useSession.mockReset();
  model.buildSellerPackageExport.mockReset();
  model.latestAnalysisIsCurrent.mockReset();
  model.packageReadyForAgentReview.mockReset();
  auth.useSession.mockReturnValue({
    data: { user: { role: "seller", name: "Seller", email: "seller@test.com" } },
    isPending: false,
  });
  model.latestAnalysisIsCurrent.mockReturnValue(true);
  model.packageReadyForAgentReview.mockReturnValue(true);
  const originalCrypto = crypto;
  vi.stubGlobal("crypto", {
    subtle: originalCrypto.subtle,
    randomUUID: vi.fn(() => "00000000-0000-4000-8000-000000000001"),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AgentReviewSubmissionDock", () => {
  it("renders a normalized resubmit receipt as waiting for agent review", async () => {
    const stored = storedDraft({ revision: true });
    store.load.mockResolvedValue(stored);
    model.buildSellerPackageExport.mockResolvedValue(exportedPayload(stored));
    installFetchOnce({
      action: "resubmit_revision",
      submissionId: "pkg-resubmit",
      parentRevisionId: "revision-parent",
      parentRevisionNumber: 1,
      revisionId: "revision-child",
      revisionNumber: 2,
      respondedToDecisionId: "decision-change",
      currentStatus: "waiting_for_agent_review",
      submissionVersion: 4,
      recordedAt: "2026-07-22T00:10:00.000Z",
    });

    render(<AgentReviewSubmissionDock />);
    await submit();

    expect(await screen.findByText("Waiting For Agent Review")).toBeInTheDocument();
    expect(screen.getByText("Revision v2 is recorded.")).toBeInTheDocument();
  });

  it("displays a nested controlled resubmit error message", async () => {
    const stored = storedDraft({ revision: true });
    store.load.mockResolvedValue(stored);
    model.buildSellerPackageExport.mockResolvedValue(exportedPayload(stored));
    installFetchOnce(
      {
        error: {
          code: "CHANGE_REQUEST_ALREADY_ANSWERED",
          message: "The latest requested-change decision already has a seller response.",
        },
      },
      409,
    );

    render(<AgentReviewSubmissionDock />);
    await submit();

    expect(
      await screen.findByText(
        "The latest requested-change decision already has a seller response.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("[object Object]")).toBeNull();
  });

  it("uses a safe generic message for a malformed success response", async () => {
    const stored = storedDraft({ revision: true });
    store.load.mockResolvedValue(stored);
    model.buildSellerPackageExport.mockResolvedValue(exportedPayload(stored));
    installFetchOnce({ ok: true });

    render(<AgentReviewSubmissionDock />);
    await submit();

    expect(
      await screen.findByText("The package could not be placed in the agent review queue."),
    ).toBeInTheDocument();
  });

  it("keeps legacy string error rendering for initial finalization", async () => {
    const stored = storedDraft();
    store.load.mockResolvedValue(stored);
    model.buildSellerPackageExport.mockResolvedValue(exportedPayload(stored));
    installFetchOnce({ error: "Conflict: Submission already finalized" }, 409);

    render(<AgentReviewSubmissionDock />);
    await submit();

    expect(await screen.findByText("Conflict: Submission already finalized")).toBeInTheDocument();
  });

  it("keeps initial finalization receipt rendering unchanged", async () => {
    const stored = storedDraft();
    store.load.mockResolvedValue(stored);
    model.buildSellerPackageExport.mockResolvedValue(exportedPayload(stored));
    installFetchOnce({
      submissionId: "pkg-finalize",
      revisionId: "revision-one",
      revisionNumber: 1,
      status: "waiting_for_agent_review",
      receivingAgent: "label-lens-internal-agent-queue",
      recordedAt: "2026-07-22T00:10:00.000Z",
    });

    render(<AgentReviewSubmissionDock />);
    await submit();

    expect(await screen.findByText("Waiting For Agent Review")).toBeInTheDocument();
    expect(screen.getByText("Revision v1 is recorded.")).toBeInTheDocument();
  });
});
