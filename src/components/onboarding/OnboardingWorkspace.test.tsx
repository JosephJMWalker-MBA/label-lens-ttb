import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearPrecheckTiming } from "./warm-timing";
import { ONBOARDING_STORAGE_KEY, OnboardingProvider } from "./onboarding-context";
import { OnboardingWorkspace } from "./OnboardingWorkspace";

// Stub ResultView so these tests exercise onboarding orchestration, not the full
// result renderer. The stub echoes the response it was given, which lets us prove
// the revealed result is the live pipeline response (not injected output).
vi.mock("@/features/precheck/ResultView", () => ({
  ResultView: ({
    response,
    previewImage,
  }: {
    response: { machineResultId?: string } | null;
    previewImage: unknown;
  }) => (
    <div data-testid="result-view" data-preview={String(previewImage)}>
      result:{response?.machineResultId ?? "none"}
    </div>
  ),
}));

/** A page stand-in: the real file input id plus a user application field. */
function Shell() {
  return (
    <OnboardingProvider>
      <input id="label-image" type="file" aria-label="label image" />
      <input id="declared-brand" defaultValue="" aria-label="declared brand" />
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

  it("reveals the live sample result (integrity: it echoes the fetched response)", async () => {
    mockPrecheck({ machineResultId: "M-CELLARS-LIVE" });
    render(<Shell />);
    const result = await screen.findByTestId("result-view");
    // The revealed result reflects the response the pipeline returned, and the
    // server-side sample carries no local preview.
    expect(result).toHaveTextContent("result:M-CELLARS-LIVE");
    expect(result).toHaveAttribute("data-preview", "null");
  });

  it("logs only client-provable status states through to READY FOR YOUR LABEL", async () => {
    mockPrecheck();
    render(<Shell />);
    await screen.findByTestId("result-view");
    expect(screen.getByText("VERIFIED SAMPLE REQUESTED")).toBeInTheDocument();
    expect(screen.getByText("SAMPLE ANALYSIS IN PROGRESS")).toBeInTheDocument();
    // The ready result renders a commit before its status line (a ready result is
    // never held back for status text), so await the terminal log entries.
    expect(await screen.findByText("SAMPLE READY")).toBeInTheDocument();
    expect(await screen.findByText("READY FOR YOUR LABEL")).toBeInTheDocument();
    // No fabricated internal OCR sub-stage is ever presented as status.
    expect(screen.queryByText(/MAPPING BRAND EVIDENCE/i)).toBeNull();
    expect(screen.queryByText(/ASSEMBLING TRACEABLE REPORT/i)).toBeNull();
    expect(screen.queryByText(/CANDIDATE FILTERING/i)).toBeNull();
  });

  it("teaches the workflow separately from the live status log", async () => {
    mockPrecheck();
    render(<Shell />);
    await screen.findByTestId("result-view");
    // Static teaching content is present and clearly not a server status line.
    expect(screen.getByText(/the workflow you/i)).toBeInTheDocument();
    expect(screen.getByText(/your application facts stay separate/i)).toBeInTheDocument();
  });

  it("does not delay the ready result (it renders as soon as the response exists)", async () => {
    mockPrecheck();
    render(<Shell />);
    // The result appears without any tutorial step being advanced first.
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
    // The primary path stays available despite the warm-up failure.
    expect(screen.getByRole("button", { name: /upload your label/i })).toBeInTheDocument();
  });

  it("bypasses onboarding for a returning user (no dialog, no sample request)", async () => {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, "true");
    const fetchMock = mockPrecheck();
    render(<Shell />);
    // Give any effect a chance to (not) fire.
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exposes an accessible modal dialog with a heading", async () => {
    mockPrecheck();
    render(<Shell />);
    const dialog = await screen.findByRole("dialog", { name: /warming up on a verified sample/i });
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });
});
