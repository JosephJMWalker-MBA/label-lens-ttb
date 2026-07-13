import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearPrecheckTiming } from "./precheck-timing";
import { ONBOARDING_STORAGE_KEY, OnboardingProvider, useOnboarding } from "./onboarding-context";
import { OnboardingWorkspace } from "./OnboardingWorkspace";

// Stub ResultView so these tests exercise onboarding orchestration, not the full
// result renderer. The stub echoes the response and the preview reference it was
// given, which lets us prove the revealed result is the live pipeline response
// (not injected) and that the analyzed sample artwork is passed through.
vi.mock("@/features/precheck/ResultView", () => ({
  ResultView: ({
    response,
    previewImage,
  }: {
    response: { machineResultId?: string } | null;
    previewImage: { url: string; name: string } | null;
  }) => (
    <div data-testid="result-view" data-preview-url={previewImage?.url ?? "none"}>
      result:{response?.machineResultId ?? "none"}
    </div>
  ),
}));

function Replay() {
  const { openIntro } = useOnboarding();
  return (
    <button type="button" onClick={openIntro}>
      replay intro
    </button>
  );
}

/** A page stand-in: the real file input id, a user field, and a replay trigger. */
function Shell() {
  return (
    <OnboardingProvider>
      <input id="label-image" type="file" aria-label="label image" />
      <input id="declared-brand" defaultValue="" aria-label="declared brand" />
      <Replay />
      <OnboardingWorkspace />
    </OnboardingProvider>
  );
}

function firstVisit() {
  localStorage.clear();
}

function mockPrecheck(data: unknown = { machineResultId: "M-CELLARS-LIVE" }) {
  const fetchMock = vi.fn().mockResolvedValue({
    json: async () => ({ ok: true, data }),
  } as Response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  firstVisit();
  clearPrecheckTiming();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("productive cold-start onboarding", () => {
  it("auto-runs the verified sample once through /api/precheck on first visit", async () => {
    const fetchMock = mockPrecheck();
    render(<Shell />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/precheck");
    const body = (init as RequestInit).body as FormData;
    expect(body.get("source")).toBe("sample");
    expect(body.has("file")).toBe(false);
  });

  it("keeps the sample separate from the user's application field", async () => {
    mockPrecheck();
    render(<Shell />);
    await screen.findByTestId("result-view");
    expect((screen.getByLabelText("declared brand") as HTMLInputElement).value).toBe("");
  });

  it("shows the bundled sample artwork while the sample is still running", () => {
    // A never-resolving fetch keeps the run in the analyzing state.
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    render(<Shell />);
    const img = screen.getByAltText(/bundled verified m cellars sample label/i) as HTMLImageElement;
    expect(img).toBeInTheDocument();
    expect(img.getAttribute("src")).toBe("/api/sample-image");
  });

  it("reveals the live result and passes the analyzed sample artwork to ResultView", async () => {
    mockPrecheck({ machineResultId: "M-CELLARS-LIVE" });
    render(<Shell />);
    const result = await screen.findByTestId("result-view");
    // Integrity: the revealed result echoes the fetched response, and the preview
    // reference is the byte-verified sample-image endpoint (the analyzed artwork).
    expect(result).toHaveTextContent("result:M-CELLARS-LIVE");
    expect(result).toHaveAttribute("data-preview-url", "/api/sample-image");
  });

  it("logs only client-provable status states through to READY FOR YOUR LABEL", async () => {
    mockPrecheck();
    render(<Shell />);
    await screen.findByTestId("result-view");
    expect(screen.getByText("VERIFIED SAMPLE REQUESTED")).toBeInTheDocument();
    expect(screen.getByText("SAMPLE ANALYSIS IN PROGRESS")).toBeInTheDocument();
    expect(await screen.findByText("SAMPLE READY")).toBeInTheDocument();
    expect(await screen.findByText("READY FOR YOUR LABEL")).toBeInTheDocument();
    // No fabricated internal OCR sub-stage is ever presented as status.
    expect(screen.queryByText(/MAPPING BRAND EVIDENCE/i)).toBeNull();
    expect(screen.queryByText(/ASSEMBLING TRACEABLE REPORT/i)).toBeNull();
    expect(screen.queryByText(/CANDIDATE FILTERING/i)).toBeNull();
  });

  it("reports timing without claiming the service is warm or faster", async () => {
    mockPrecheck();
    render(<Shell />);
    await screen.findByTestId("result-view");
    expect(await screen.findByText(/verified sample request completed/i)).toBeInTheDocument();
    expect(screen.queryByText(/service is warm/i)).toBeNull();
    expect(screen.queryByText(/now.warm service/i)).toBeNull();
  });

  it("teaches the workflow separately from the live status log", async () => {
    mockPrecheck();
    render(<Shell />);
    await screen.findByTestId("result-view");
    expect(screen.getByText(/the workflow you/i)).toBeInTheDocument();
    expect(screen.getByText(/your application facts stay separate/i)).toBeInTheDocument();
  });

  it("does not delay the ready result (it renders as soon as the response exists)", async () => {
    mockPrecheck();
    render(<Shell />);
    expect(await screen.findByTestId("result-view")).toBeInTheDocument();
  });

  it("Upload your label closes onboarding and focuses the real file input", async () => {
    mockPrecheck();
    render(<Shell />);
    await screen.findByTestId("result-view");
    fireEvent.click(screen.getByRole("button", { name: /upload your label/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.getElementById("label-image")).toHaveFocus());
  });

  it("Skip introduction closes the workspace", async () => {
    mockPrecheck();
    render(<Shell />);
    fireEvent.click(screen.getByRole("button", { name: /skip introduction/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("surfaces a failed sample honestly, offers retry, and never blocks upload", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network"));
    vi.stubGlobal("fetch", fetchMock);
    render(<Shell />);
    expect(await screen.findByText("SAMPLE FAILED")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry sample/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upload your label/i })).toBeInTheDocument();
  });

  it("bypasses onboarding for a returning user (no dialog, no sample request)", async () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    const fetchMock = mockPrecheck();
    render(<Shell />);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("replays after a completed first visit without a new request, keeping status and result", async () => {
    const fetchMock = mockPrecheck();
    render(<Shell />);

    // 1-2. First visit completes.
    await screen.findByTestId("result-view");
    await screen.findByText("READY FOR YOUR LABEL");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 3. Onboarding closes.
    fireEvent.click(screen.getByRole("button", { name: /skip introduction/i }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    // 4. Onboarding is replayed.
    fireEvent.click(screen.getByRole("button", { name: /replay intro/i }));
    await screen.findByRole("dialog", { name: /warming up on a verified sample/i });

    // 5. No new fetch occurs on replay.
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 6. Status milestones and the existing result are visible (log not empty).
    expect(screen.getByText("SAMPLE READY")).toBeInTheDocument();
    expect(screen.getByText("READY FOR YOUR LABEL")).toBeInTheDocument();
    expect(screen.getByTestId("result-view")).toBeInTheDocument();
    // Tutorial content and the primary actions remain available.
    expect(screen.getByText(/the workflow you/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /upload your label/i })).toBeInTheDocument();
  });

  it("exposes an accessible modal dialog with a heading", async () => {
    mockPrecheck();
    render(<Shell />);
    const dialog = await screen.findByRole("dialog", { name: /warming up on a verified sample/i });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });
});
