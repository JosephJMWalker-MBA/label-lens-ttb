/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AgentReviewSubmissionDock } from "./AgentReviewSubmissionDock";

const mockLoadPackageDraftLocally = vi.fn();

vi.mock("./package-draft-store", () => ({
  loadPackageDraftLocally: (id?: string) => mockLoadPackageDraftLocally(id),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: () => ({
      data: {
        user: { id: "seller-1", name: "Test Seller", email: "seller@test.com", role: "seller" },
      },
      isPending: false,
    }),
  },
}));

function mockValidDraft(packageId = "pkg-1") {
  return {
    draft: {
      schemaVersion: "seller-package-draft.v1",
      packageId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      profile: { id: "wine", version: "1.0.0" },
      panelDecisions: { back: "absent", additional: "none" },
      panels: [
        {
          panelId: "p1",
          order: 0,
          role: "front",
          displayName: "front.png",
          mediaType: "image/png",
          byteSize: 4,
          checksumSha256: "0000000000000000000000000000000000000000000000000000000000000000",
          width: 100,
          height: 100,
          rotation: 0,
        },
      ],
      categories: [
        { categoryId: "brandName", decision: "provided", expectedValue: "Test", regions: [] },
      ],
      sellerChangeHistory: [],
      analysisRuns: [
        {
          analysisRunId: "run-1",
          analyzedAt: new Date().toISOString(),
          panelFiles: [
            {
              panelId: "p1",
              checksumSha256: "0000000000000000000000000000000000000000000000000000000000000000",
            },
          ],
          panelRuns: [
            {
              panelId: "p1",
              checksumSha256: "0000000000000000000000000000000000000000000000000000000000000000",
              exportJson: JSON.stringify({
                versionManifest: { applicationBuild: { commitProvenance: "test" } },
              }),
            },
          ],
          evidenceSnapshot: {
            categories: [
              { categoryId: "brandName", decision: "provided", expectedValue: "Test", regions: [] },
            ],
          },
          categoryResults: [
            { categoryId: "brandName", analysisState: "clearly_readable", observedValue: "Test" },
          ],
          readiness: "ready_for_agent_submission",
        },
      ],
    },
    panelFiles: [{ panelId: "p1", file: new File(["data"], "front.png", { type: "image/png" }) }],
  };
}

describe("AgentReviewSubmissionDock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const origCrypto = globalThis.crypto;
    vi.stubGlobal("crypto", {
      ...origCrypto,
      randomUUID: origCrypto?.randomUUID
        ? origCrypto.randomUUID.bind(origCrypto)
        : () => "mock-uuid-123",
      subtle: {
        digest: vi.fn(async () => new Uint8Array(32).buffer),
      },
    });
  });

  it("loads only the selected packageId when provided", async () => {
    mockLoadPackageDraftLocally.mockResolvedValue(mockValidDraft("pkg-abc"));
    render(<AgentReviewSubmissionDock activePackageId="pkg-abc" />);

    await waitFor(() => {
      expect(mockLoadPackageDraftLocally).toHaveBeenCalledWith("pkg-abc");
    });
  });

  it("resets state and receipt when activePackageId changes so dock state cannot cross package IDs", async () => {
    mockLoadPackageDraftLocally.mockImplementation(async (id?: string) => {
      return mockValidDraft(id ?? "pkg-1");
    });

    const { rerender } = render(
      <AgentReviewSubmissionDock activePackageId="pkg-1" selectionToken={1} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("agent-review-submission-dock")).toBeInTheDocument();
    });

    // Mock successful fetch for submission
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({
              submissionId: "sub-1",
              revisionId: "rev-1",
              revisionNumber: 1,
              status: "waiting_for_agent_review",
              receivingAgent: "Agent-1",
              recordedAt: new Date().toISOString(),
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("{}", { status: 404 });
      }),
    );

    const submitterInput = screen.getByLabelText(/seller or submitter name/i);
    fireEvent.change(submitterInput, { target: { value: "Test Seller" } });

    const submitBtn = screen.getByRole("button", { name: /submit for agent review/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Open my submissions")).toBeInTheDocument();
    });

    // Switch active package to pkg-2
    rerender(<AgentReviewSubmissionDock activePackageId="pkg-2" selectionToken={2} />);

    await waitFor(() => {
      expect(screen.queryByText("Open my submissions")).not.toBeInTheDocument();
    });
  });

  it("exposes both 'Open my submissions' and 'Start another package' upon submission receipt", async () => {
    mockLoadPackageDraftLocally.mockResolvedValue(mockValidDraft("pkg-1"));
    const onStartAnotherPackage = vi.fn();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({
              submissionId: "sub-123",
              revisionId: "rev-123",
              revisionNumber: 1,
              status: "waiting_for_agent_review",
              receivingAgent: "Agent-1",
              recordedAt: new Date().toISOString(),
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        return new Response("{}", { status: 404 });
      }),
    );

    render(
      <AgentReviewSubmissionDock
        activePackageId="pkg-1"
        onStartAnotherPackage={onStartAnotherPackage}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /submit for agent review/i })).toBeInTheDocument();
    });

    const submitterInput = screen.getByLabelText(/seller or submitter name/i);
    fireEvent.change(submitterInput, { target: { value: "Test Seller" } });

    fireEvent.click(screen.getByRole("button", { name: /submit for agent review/i }));

    await waitFor(() => {
      expect(screen.getByText("Open my submissions")).toBeInTheDocument();
      expect(screen.getByTestId("start-another-package-btn")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("start-another-package-btn"));
    expect(onStartAnotherPackage).toHaveBeenCalledTimes(1);
  });
});
