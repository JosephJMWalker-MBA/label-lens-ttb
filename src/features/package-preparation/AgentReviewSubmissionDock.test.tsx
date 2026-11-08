/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OFFICIAL_FILING_HANDOFF } from "@/lib/product-language";

import { AgentReviewSubmissionDock } from "./AgentReviewSubmissionDock";
import { submissionFooterAction } from "./submission-footer-action";
import { useInternalReviewSubmission } from "./use-internal-review-submission";

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
      submitter: undefined as string | undefined,
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

/**
 * Mirrors ReviewWorkspaceContainer: one submission hook feeds both the panel and
 * the guided footer action. The footer action is rendered as a plain button so
 * these tests drive submission exactly the way the seller does.
 */
function Harness(props: {
  activePackageId?: string | null;
  selectionToken?: number;
  submitter?: string;
  onStartAnotherPackage?: () => void;
}) {
  const [submitter, setSubmitter] = useState(props.submitter ?? "");
  useEffect(() => {
    if (props.submitter !== undefined) setSubmitter(props.submitter);
  }, [props.submitter]);
  const submission = useInternalReviewSubmission({
    activePackageId: props.activePackageId,
    selectionToken: props.selectionToken,
    submitter,
  });
  const action = submissionFooterAction({
    submission,
    submitter,
    packageId: props.activePackageId,
    navigate: () => {},
  });
  return (
    <>
      <AgentReviewSubmissionDock
        submission={submission}
        submitter={submitter}
        onSubmitterChange={setSubmitter}
        onStartAnotherPackage={props.onStartAnotherPackage}
      />
      <footer data-testid="footer-equivalent">
        <button type="button" disabled={action.disabled || action.pending} onClick={action.onClick}>
          {action.label}
        </button>
      </footer>
    </>
  );
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
    render(<Harness activePackageId="pkg-abc" />);

    await waitFor(() => {
      expect(mockLoadPackageDraftLocally).toHaveBeenCalledWith("pkg-abc");
    });
  });

  it("resets state and receipt when activePackageId changes so dock state cannot cross package IDs", async () => {
    mockLoadPackageDraftLocally.mockImplementation(async (id?: string) => {
      return mockValidDraft(id ?? "pkg-1");
    });

    const { rerender } = render(
      <Harness activePackageId="pkg-1" selectionToken={1} submitter="Test Seller" />,
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

    const submitBtn = screen.getByRole("button", { name: /submit for internal review/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText("Open my submissions")).toBeInTheDocument();
    });

    // Switch active package to pkg-2
    rerender(<Harness activePackageId="pkg-2" selectionToken={2} />);

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
      <Harness
        activePackageId="pkg-1"
        onStartAnotherPackage={onStartAnotherPackage}
        submitter="Test Seller"
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /submit for internal review/i }),
      ).toBeInTheDocument();
    });

    const submitterInput = screen.getByLabelText(/seller or submitter name/i);
    fireEvent.change(submitterInput, { target: { value: "Test Seller" } });

    fireEvent.click(screen.getByRole("button", { name: /submit for internal review/i }));

    await waitFor(() => {
      expect(screen.getByText("Open my submissions")).toBeInTheDocument();
      expect(screen.getByTestId("start-another-package-btn")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("start-another-package-btn"));
    expect(onStartAnotherPackage).toHaveBeenCalledTimes(1);
  });

  it("displays controlled submitter prop when passed to dock", async () => {
    render(<Harness submitter="Test Seller" />);

    const input = (await screen.findByLabelText("Seller or submitter name")) as HTMLInputElement;
    expect(input.value).toBe("Test Seller");
  });

  it("displays package-specific submitter name when controlled by parent container", async () => {
    render(<Harness submitter="Custom Estate Winery" />);

    const input = (await screen.findByLabelText("Seller or submitter name")) as HTMLInputElement;
    expect(input.value).toBe("Custom Estate Winery");
  });

  it("renders no submit control of its own, so the guided footer is the single submit action", async () => {
    mockLoadPackageDraftLocally.mockResolvedValue(mockValidDraft("pkg-1"));
    render(<Harness activePackageId="pkg-1" submitter="Test Seller" />);

    const panel = await screen.findByTestId("agent-review-submission-dock");
    await waitFor(() => {
      expect(screen.getAllByRole("button", { name: /submit for internal review/i })).toHaveLength(
        1,
      );
    });
    expect(panel.querySelector("button")).toBeNull();
    expect(panel).toHaveTextContent(/does not file anything with TTB and is not an approval/i);
  });

  it("hands off to official filing after the internal-review receipt without claiming approval", async () => {
    mockLoadPackageDraftLocally.mockResolvedValue(mockValidDraft("pkg-1"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({
              submissionId: "pkg-1",
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
    render(<Harness activePackageId="pkg-1" submitter="Test Seller" />);

    const submit = await screen.findByRole("button", { name: /submit for internal review/i });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);

    const receipt = await screen.findByTestId("submission-receipt");
    expect(receipt).toHaveTextContent("Waiting for agent review");
    expect(receipt).toHaveTextContent("Revision v1 is recorded.");
    const official = screen.getByRole("link", { name: /TTB COLAs Online/ });
    expect(official).toHaveAttribute("href", OFFICIAL_FILING_HANDOFF.url);
    expect(receipt).toHaveTextContent(OFFICIAL_FILING_HANDOFF.statement);
    expect(receipt.textContent ?? "").not.toMatch(/\bapproved\b/i);
    // The footer now points at tracking instead of offering a second submission.
    expect(screen.getByRole("button", { name: "Track this submission" })).toBeEnabled();
  });
});
