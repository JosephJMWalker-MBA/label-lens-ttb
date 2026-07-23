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
import type { PackagePanelMachineRun } from "./package-model";

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

  it("invalidates stale cached attempt on front-panel replacement or evidence change", async () => {
    const initialStored = storedDraft({ revision: true });
    initialStored.draft.categories = [
      {
        categoryId: "brandName",
        decision: "provided",
        expectedValue: "Issue 167 Base Brand",
        regions: [],
      },
    ];
    initialStored.draft.analysisRuns = [
      {
        analysisRunId: "analysis-1",
        sequence: 1,
        sellerChangeSequence: 0,
        recordedAt: "2026-07-22T00:04:00.000Z",
        panelRuns: [],
        categories: [
          {
            categoryId: "brandName",
            state: "clearly_readable",
            observedValue: "Issue 167 Base Brand",
            supportingPanelIds: ["panel-front"],
            supportingRegionIds: [],
            reason: "OK",
          },
        ],
        readiness: "ready_for_agent_submission",
      },
    ];

    store.load.mockResolvedValue(initialStored);
    model.buildSellerPackageExport.mockImplementation(async ({ draft }) => {
      return exportedPayload({ ...initialStored, draft });
    });

    const fetchCalls: Array<{ url: string; formData: FormData; idempotencyKey: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (method === "GET") return new Response(null, { status: 404 });
        const url = String(input);
        const formData = init?.body as FormData;
        const idempotencyKey =
          (init?.headers as Record<string, string>)?.["X-Idempotency-Key"] ?? "";
        fetchCalls.push({ url, formData, idempotencyKey });
        return Response.json({
          action: "resubmit_revision",
          submissionId: "pkg-resubmit",
          parentRevisionId: "revision-parent",
          parentRevisionNumber: 1,
          revisionId: `revision-child-${fetchCalls.length}`,
          revisionNumber: 2,
          respondedToDecisionId: "decision-change",
          currentStatus: "waiting_for_agent_review",
          submissionVersion: 4,
          recordedAt: "2026-07-22T00:10:00.000Z",
        });
      }),
    );

    render(<AgentReviewSubmissionDock />);
    await submit();

    await waitFor(() => expect(fetchCalls).toHaveLength(1));
    const firstExport = JSON.parse(fetchCalls[0].formData.get("packageExport") as string);
    expect(firstExport.package.panels[0].panelId).toBe("panel-front");

    // Replace front panel and update seller evidence
    const replacementStored: StoredPackageDraft = {
      ...initialStored,
      draft: {
        ...initialStored.draft,
        panels: [
          {
            panelId: "panel-front-replacement",
            order: 0,
            role: "front",
            displayName: "front_new.png",
            mediaType: "image/png",
            byteSize: 9,
            checksumSha256: "b".repeat(64),
            width: 2,
            height: 2,
            rotation: 0,
          },
        ],
        categories: [
          {
            categoryId: "brandName",
            decision: "provided",
            expectedValue: "Issue 167 Revised Brand",
            regions: [],
          },
        ],
        analysisRuns: [
          {
            analysisRunId: "analysis-2",
            sequence: 2,
            sellerChangeSequence: 0,
            recordedAt: "2026-07-22T00:08:00.000Z",
            panelRuns: [
              {
                panelId: "panel-front-replacement",
                machineResultId: "m1",
                exportJson: "{}",
                observations: {} as unknown as PackagePanelMachineRun["observations"],
              },
            ],
            categories: [
              {
                categoryId: "brandName",
                state: "clearly_readable",
                observedValue: "Issue 167 Revised Brand",
                supportingPanelIds: ["panel-front-replacement"],
                supportingRegionIds: [],
                reason: "OK",
              },
            ],
            readiness: "ready_for_agent_submission",
          },
        ],
      },
      panelFiles: [
        {
          panelId: "panel-front-replacement",
          file: new File(["front_new"], "front_new.png", { type: "image/png" }),
        },
      ],
    };

    store.load.mockResolvedValue(replacementStored);
    fireEvent.focus(window);

    await submit();

    await waitFor(() => expect(fetchCalls).toHaveLength(2));
    const secondExport = JSON.parse(fetchCalls[1].formData.get("packageExport") as string);
    expect(secondExport.package.panels[0].panelId).toBe("panel-front-replacement");
    expect(secondExport.package.panels[0].checksumSha256).toBe("b".repeat(64));
    expect(secondExport.package.categories[0].expectedValue).toBe("Issue 167 Revised Brand");
    expect(fetchCalls[1].formData.get("panel-front-replacement")).toBeTruthy();
    expect(fetchCalls[1].formData.get("panel-front")).toBeNull();
  });

  it("reuses idempotency key on unchanged retry of an identical draft", async () => {
    const stored = storedDraft({ revision: true });
    stored.draft.categories = [
      {
        categoryId: "brandName",
        decision: "provided",
        expectedValue: "Issue 167 Base Brand",
        regions: [],
      },
    ];
    stored.draft.analysisRuns = [
      {
        analysisRunId: "analysis-1",
        sequence: 1,
        sellerChangeSequence: 0,
        recordedAt: "2026-07-22T00:04:00.000Z",
        panelRuns: [],
        categories: [
          {
            categoryId: "brandName",
            state: "clearly_readable",
            observedValue: "Issue 167 Base Brand",
            supportingPanelIds: ["panel-front"],
            supportingRegionIds: [],
            reason: "OK",
          },
        ],
        readiness: "ready_for_agent_submission",
      },
    ];

    store.load.mockResolvedValue(stored);
    model.buildSellerPackageExport.mockResolvedValue(exportedPayload(stored));

    const fetchCalls: Array<{ url: string; idempotencyKey: string }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (method === "GET") return new Response(null, { status: 404 });
        const idempotencyKey =
          (init?.headers as Record<string, string>)?.["X-Idempotency-Key"] ?? "";
        fetchCalls.push({ url: String(input), idempotencyKey });
        // Return 500 error first time to allow retry
        if (fetchCalls.length === 1) {
          return Response.json({ error: "Network error" }, { status: 500 });
        }
        return Response.json({
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
      }),
    );

    render(<AgentReviewSubmissionDock />);
    await submit();

    await waitFor(() => expect(fetchCalls).toHaveLength(1));

    // Submit retry without changing draft
    await submit();

    await waitFor(() => expect(fetchCalls).toHaveLength(2));
    expect(fetchCalls[0].idempotencyKey).toBe(fetchCalls[1].idempotencyKey);
  });

  it("fails closed before network transmission if a panel file is missing or mismatched", async () => {
    const stored = storedDraft({ revision: true });
    stored.draft.categories = [
      {
        categoryId: "brandName",
        decision: "provided",
        expectedValue: "Issue 167 Base Brand",
        regions: [],
      },
    ];
    stored.draft.analysisRuns = [
      {
        analysisRunId: "analysis-1",
        sequence: 1,
        sellerChangeSequence: 0,
        recordedAt: "2026-07-22T00:04:00.000Z",
        panelRuns: [],
        categories: [
          {
            categoryId: "brandName",
            state: "clearly_readable",
            observedValue: "Issue 167 Base Brand",
            supportingPanelIds: ["panel-front"],
            supportingRegionIds: [],
            reason: "OK",
          },
        ],
        readiness: "ready_for_agent_submission",
      },
    ];

    // Remove panel file from stored
    stored.panelFiles = [];

    store.load.mockResolvedValue(stored);
    model.buildSellerPackageExport.mockResolvedValue(exportedPayload(stored));

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    render(<AgentReviewSubmissionDock />);

    // Since stored.panelFiles.length !== stored.draft.panels.length, ready is false so submit button is disabled
    const button = await screen.findByRole("button", { name: /submit for agent review/i });
    expect(button).toBeDisabled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
