import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SellerPackageDraft } from "./package-model";

const store = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  list: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("./package-draft-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./package-draft-store")>();
  return {
    ...actual,
    loadPackageDraftLocally: store.load,
    savePackageDraftLocally: store.save,
    listPackageDraftsLocally: store.list,
    createAndActivateNewDraftLocally: store.create,
    deletePackageDraftLocally: store.delete,
  };
});

import { PackagePreparationWorkspace } from "./PackagePreparationWorkspace";

function storedDraft(brandAccepted = false): SellerPackageDraft {
  const panels = (["front", "back"] as const).map((role, order) => ({
    panelId: `${role}-panel`,
    order,
    role,
    displayName: `${role}.png`,
    mediaType: "image/png",
    byteSize: 10,
    checksumSha256: `${order}`.repeat(64),
    width: 1000,
    height: 1500,
    rotation: 0 as const,
  }));
  return {
    schemaVersion: "seller-package-draft.v1",
    packageId: "guided-package",
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:00.000Z",
    profile: { id: "wine-label-requirements", version: "1.0.0" },
    panelDecisions: { back: "upload", additional: "none" },
    panels,
    categories: [
      {
        categoryId: "brandName",
        decision: "provided",
        expectedValue: brandAccepted ? "CEDAR RIDGE" : "",
        regions: brandAccepted
          ? [
              {
                regionId: "brand-region",
                categoryId: "brandName",
                panelId: "front-panel",
                unit: "normalized-panel-relative",
                provenance: "seller-selected-region",
                x: 0.1,
                y: 0.2,
                width: 0.5,
                height: 0.2,
              },
            ]
          : [],
      },
      {
        categoryId: "alcoholStatement",
        decision: "provided",
        expectedValue: "",
        regions: [],
      },
    ],
    sellerChangeHistory: [],
    analysisRuns: [],
  };
}

function stored(value: SellerPackageDraft) {
  return {
    draft: value,
    panelFiles: value.panels.map((panel) => ({
      panelId: panel.panelId,
      file: new File([panel.role], panel.displayName, { type: panel.mediaType }),
    })),
  };
}

function fullyAcceptedDraft(): SellerPackageDraft {
  const value = storedDraft(true);
  value.categories[1] = {
    categoryId: "alcoholStatement",
    decision: "provided",
    expectedValue: "12.5% alc. by vol.",
    regions: [
      {
        regionId: "alcohol-region",
        categoryId: "alcoholStatement",
        panelId: "back-panel",
        unit: "normalized-panel-relative",
        provenance: "seller-selected-region",
        x: 0.2,
        y: 0.3,
        width: 0.4,
        height: 0.15,
      },
    ],
  };
  value.sellerChangeHistory = [
    {
      changeId: "saved-1",
      sequence: 1,
      recordedAt: "2026-07-18T00:30:00.000Z",
      action: "draft_saved",
      detail: "Seller package draft saved locally.",
    },
  ];
  return value;
}

function machinePanelRun(panelId: string) {
  const observation = {
    state: "OBSERVED" as const,
    value: "MACHINE VALUE",
    normalizedValue: "MACHINE VALUE",
    confidence: 0.9,
    ocrEvidenceScore: 0.9,
    alternates: [],
    geometry: {
      imageIndex: 0,
      x: 100,
      y: 100,
      width: 300,
      height: 100,
      imageWidth: 1000,
      imageHeight: 1500,
    },
  };
  return {
    panelId,
    machineResultId: `machine-${panelId}`,
    exportJson: "{}",
    observations: {
      provenance: {
        artifactRef: panelId,
        derivativeSha256: "c".repeat(64),
        extractionAdapterId: "test",
        extractionAdapterVersion: "1",
        ocrEngine: { kind: "not_applicable" as const },
        parserId: "test",
        parserVersion: "1",
        processedAt: "2026-07-18T01:00:00.000Z",
      },
      brandName: observation,
      alcoholStatement: observation,
    },
  };
}

function analysisRun(readiness: "needs_seller_review" | "ready_for_agent_submission") {
  return {
    analysisRunId: `analysis-${readiness}`,
    sequence: 1,
    sellerChangeSequence: 1,
    recordedAt: "2026-07-18T01:00:00.000Z",
    panelRuns: [machinePanelRun("front-panel"), machinePanelRun("back-panel")],
    categories: (["brandName", "alcoholStatement"] as const).map((categoryId) => ({
      categoryId,
      state:
        readiness === "needs_seller_review"
          ? ("needs_review" as const)
          : ("clearly_readable" as const),
      observedValue: "MACHINE VALUE",
      supportingPanelIds: [],
      supportingRegionIds: [],
      reason:
        readiness === "needs_seller_review"
          ? "Seller-confirmed text differs from the machine observation."
          : "Seller and machine evidence agree.",
    })),
    readiness,
  };
}

async function drawActiveRegion() {
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Draw region" })).toHaveAttribute(
      "aria-pressed",
      "true",
    ),
  );
  const image = screen.getByRole("img", { name: /label annotation image/i });
  fireEvent.pointerDown(image, { button: 0, pointerId: 1, clientX: 10, clientY: 20 });
  fireEvent.pointerMove(image, { pointerId: 1, clientX: 60, clientY: 50 });
  fireEvent.pointerUp(image, { pointerId: 1, clientX: 60, clientY: 50 });
  await waitFor(() => expect(document.querySelector('[data-working="true"]')).not.toBeNull());
}

beforeEach(() => {
  store.load.mockReset();
  store.save.mockReset();
  store.list.mockReset();
  store.create.mockReset();
  store.delete.mockReset();
  store.list.mockResolvedValue([]);
  store.save.mockResolvedValue(undefined);
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn((file: File) => `blob:${file.name}`),
    revokeObjectURL: vi.fn(),
  });
  vi.stubGlobal("crypto", {
    ...crypto,
    randomUUID: vi.fn(() => "00000000-0000-4000-8000-000000000000"),
    subtle: {
      digest: vi.fn(async () => new Uint8Array(32).buffer),
    },
  });
  vi.stubGlobal("PointerEvent", MouseEvent);
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 1000, height: 1500, close: vi.fn() })),
  );
  Object.defineProperty(SVGSVGElement.prototype, "getScreenCTM", {
    configurable: true,
    value: () => ({ inverse: () => ({}) }),
  });
  Object.defineProperty(SVGSVGElement.prototype, "createSVGPoint", {
    configurable: true,
    value: () => ({
      x: 0,
      y: 0,
      matrixTransform() {
        return { x: this.x / 100, y: this.y / 100 };
      },
    }),
  });
  Object.defineProperty(SVGSVGElement.prototype, "setPointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
  Object.defineProperty(SVGSVGElement.prototype, "hasPointerCapture", {
    configurable: true,
    value: () => true,
  });
  Object.defineProperty(SVGSVGElement.prototype, "releasePointerCapture", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("guided category acceptance", () => {
  it("truthfully resolves no back and no additional panels without creating artifacts", async () => {
    store.load.mockResolvedValue(null);
    render(<PackagePreparationWorkspace />);

    const front = new File(["front"], "front.png", { type: "image/png" });
    Object.defineProperty(front, "arrayBuffer", {
      value: async () => new TextEncoder().encode("front").buffer,
    });
    fireEvent.change(await screen.findByLabelText("Upload front label"), {
      target: { files: [front] },
    });
    expect(await screen.findByText(/Uploaded: front\.png/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "No back label" }));
    await waitFor(() => expect(store.save).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "No additional panels" }));
    await waitFor(() => expect(store.save).toHaveBeenCalledTimes(2));

    expect(await screen.findByRole("heading", { name: "Brand name" })).toBeInTheDocument();
    const checkpoint = store.save.mock.calls[1][0] as { draft: SellerPackageDraft };
    expect(checkpoint.draft.panelDecisions).toEqual({ back: "absent", additional: "none" });
    expect(checkpoint.draft.panels).toHaveLength(1);
    expect(checkpoint.draft.panels[0]).toMatchObject({ role: "front", displayName: "front.png" });
    expect(checkpoint.draft.panels.some((panel) => panel.role === "back")).toBe(false);
  });

  it("starts clean, highlights Draw region, and saves category evidence once before advancing", async () => {
    const value = storedDraft();
    store.load.mockResolvedValue(stored(value));
    render(<PackagePreparationWorkspace />);

    expect(await screen.findByRole("heading", { name: "Brand name" })).toBeInTheDocument();
    expect(document.querySelector('[data-working="true"]')).toBeNull();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Draw region" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    expect(screen.getByRole("button", { name: "Save Brand name" })).toBeDisabled();
    expect(store.save).not.toHaveBeenCalled();
    expect(value.sellerChangeHistory).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("What the label says"), {
      target: { value: "CEDAR RIDGE" },
    });
    await drawActiveRegion();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save Brand name" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save Brand name" }));

    await waitFor(() => expect(store.save).toHaveBeenCalledTimes(1));
    const checkpoint = store.save.mock.calls[0][0] as { draft: SellerPackageDraft };
    expect(checkpoint.draft.categories[0]).toMatchObject({
      decision: "provided",
      expectedValue: "CEDAR RIDGE",
    });
    expect(checkpoint.draft.categories[0].regions).toHaveLength(1);
    expect(checkpoint.draft.sellerChangeHistory.map((change) => change.action)).toEqual([
      "category_updated",
    ]);
    expect(await screen.findByRole("heading", { name: "Alcohol statement" })).toBeInTheDocument();
  });

  it("does not advance or mutate seller history when the local checkpoint fails", async () => {
    const value = storedDraft();
    store.load.mockResolvedValue(stored(value));
    store.save.mockRejectedValueOnce(new Error("indexeddb unavailable"));
    render(<PackagePreparationWorkspace />);

    fireEvent.change(await screen.findByLabelText("What the label says"), {
      target: { value: "CEDAR RIDGE" },
    });
    await drawActiveRegion();
    fireEvent.click(screen.getByRole("button", { name: "Save Brand name" }));

    expect(
      await screen.findByText(/category was not saved because browser-local persistence failed/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Brand name" })).toBeInTheDocument();
    expect(value.sellerChangeHistory).toHaveLength(0);
    expect(screen.getByText(/Categories: 0\/2/i)).toBeInTheDocument();
    expect(screen.getByText(/Draft: error/i)).toBeInTheDocument();
  });

  it("opens contextual guidance without resetting the category, panel, view, box, or text", async () => {
    const value = storedDraft();
    store.load.mockResolvedValue(stored(value));
    render(<PackagePreparationWorkspace />);

    const sellerText = await screen.findByLabelText("What the label says");
    fireEvent.change(sellerText, { target: { value: "UNCOMMITTED BRAND" } });
    await drawActiveRegion();
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const canvas = screen.getByTestId("annotation-workspace");
    fireEvent.keyDown(canvas, { key: "ArrowRight" });
    expect(canvas).toHaveAttribute("data-zoom", "1.25");
    expect(canvas).toHaveAttribute("data-pan-x", "-48");
    const workingId = document
      .querySelector('[data-working="true"]')
      ?.getAttribute("data-region-id");

    fireEvent.click(screen.getByRole("button", { name: "Open Guide" }));
    const guide = screen.getByTestId("contextual-guide");
    expect(within(guide).getByRole("heading", { name: "Example label map" })).toBeInTheDocument();
    expect(store.save).not.toHaveBeenCalled();
    fireEvent.click(within(guide).getByRole("button", { name: "Close guide" }));

    expect(screen.getByRole("heading", { name: "Brand name" })).toBeInTheDocument();
    expect(screen.getByLabelText("What the label says")).toHaveValue("UNCOMMITTED BRAND");
    expect(screen.getByTestId("annotation-workspace")).toHaveAttribute("data-zoom", "1.25");
    expect(screen.getByTestId("annotation-workspace")).toHaveAttribute("data-pan-x", "-48");
    expect(document.querySelector('[data-working="true"]')).toHaveAttribute(
      "data-region-id",
      workingId,
    );
  });

  it("keeps an accepted category in optional review without auto-cycling or duplicate history", async () => {
    const value = storedDraft(true);
    store.load.mockResolvedValue(stored(value));
    render(<PackagePreparationWorkspace />);

    expect(await screen.findByRole("heading", { name: "Alcohol statement" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Brand name" }));
    expect(await screen.findByRole("heading", { name: "Brand name" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue with Alcohol statement" })).toBeEnabled();
    expect(store.save).not.toHaveBeenCalled();
    expect(value.sellerChangeHistory).toHaveLength(0);
  });

  it("persists uncertainty without counting it as completed readiness", async () => {
    const value = storedDraft();
    store.load.mockResolvedValue(stored(value));
    render(<PackagePreparationWorkspace />);

    fireEvent.click(await screen.findByRole("button", { name: "Mark as needs attention" }));
    await waitFor(() => expect(store.save).toHaveBeenCalledTimes(1));
    const checkpoint = store.save.mock.calls[0][0] as { draft: SellerPackageDraft };
    expect(checkpoint.draft.categories[0].decision).toBe("unresolved");
    expect(screen.getByText(/Categories: 0\/2/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /run pre-check/i })).toBeNull();
  });

  it("keeps machine evidence secondary and exits the correction queue after both dispositions", async () => {
    const value = fullyAcceptedDraft();
    const immutableRun = analysisRun("needs_seller_review");
    value.analysisRuns = [immutableRun];
    store.load.mockResolvedValue(stored(value));
    render(<PackagePreparationWorkspace />);

    expect(await screen.findByRole("heading", { name: "Brand name" })).toBeInTheDocument();
    expect(screen.getByText("You confirmed")).toBeInTheDocument();
    expect(screen.getByText("Machine detected")).toBeInTheDocument();
    expect(document.querySelector("[data-machine-observation]")).toBeNull();
    expect(screen.getByRole("button", { name: "Keep my evidence" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Show machine observation" }));
    expect(document.querySelector("[data-machine-observation]")).not.toBeNull();
    expect(store.save).not.toHaveBeenCalled();
    expect(value.sellerChangeHistory).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Keep my evidence" }));
    expect(await screen.findByRole("heading", { name: "Alcohol statement" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Keep my evidence" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Keep my evidence" }));

    expect(
      await screen.findByRole("heading", { name: "All required evidence has been reviewed." }),
    ).toBeInTheDocument();
    expect(screen.getByText("Save the updated draft to continue.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save updated draft" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Previous" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
    expect(screen.queryByRole("button", { name: /save brand name/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /save alcohol statement/i })).toBeNull();

    const finalCheckpoint = store.save.mock.calls[1][0] as { draft: SellerPackageDraft };
    expect(finalCheckpoint.draft.sellerChangeHistory.map((change) => change.action)).toEqual([
      "draft_saved",
      "category_updated",
      "category_updated",
    ]);
    expect(finalCheckpoint.draft.analysisRuns[0]).toBe(immutableRun);
  });

  it("copies machine geometry only into an uncommitted seller edit", async () => {
    const value = fullyAcceptedDraft();
    value.analysisRuns = [analysisRun("needs_seller_review")];
    store.load.mockResolvedValue(stored(value));
    render(<PackagePreparationWorkspace />);

    fireEvent.click(await screen.findByRole("button", { name: "Use machine region" }));
    expect(document.querySelector('[data-working="true"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "Save Brand name" })).toBeEnabled();
    expect(store.save).not.toHaveBeenCalled();
    expect(value.sellerChangeHistory).toHaveLength(1);
    expect(value.analysisRuns[0].panelRuns[0].observations.brandName.geometry).toEqual({
      imageIndex: 0,
      x: 100,
      y: 100,
      width: 300,
      height: 100,
      imageWidth: 1000,
      imageHeight: 1500,
    });
  });

  it("shows elapsed pre-check time, blocks duplicates, and appends the successful immutable run", async () => {
    const value = fullyAcceptedDraft();
    store.load.mockResolvedValue(stored(value));
    let resolveRequest: ((value: unknown) => void) | undefined;
    const request = new Promise((resolve) => {
      resolveRequest = resolve;
    });
    const fetchMock = vi.fn(() => request);
    vi.stubGlobal("fetch", fetchMock);
    render(<PackagePreparationWorkspace />);

    const runButton = await screen.findByRole("button", { name: "Run pre-check" });
    vi.useFakeTimers();
    fireEvent.click(runButton);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /running pre-check/i })).toBeDisabled();
    expect(screen.getByText("00:00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /running pre-check/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(1_250));
    expect(screen.getByText("00:01")).toBeInTheDocument();

    const completedRun = analysisRun("ready_for_agent_submission");
    await act(async () => {
      resolveRequest?.({
        json: async () => ({ ok: true, data: { analysisRun: completedRun } }),
      });
      await Promise.resolve();
      await Promise.resolve();
    });
    vi.useRealTimers();

    expect(await screen.findByRole("button", { name: "Prepare agent package" })).toBeDisabled();
    const saved = store.save.mock.calls.at(-1)?.[0] as { draft: SellerPackageDraft };
    expect(saved.draft.analysisRuns).toHaveLength(1);
    expect(saved.draft.analysisRuns[0]).toBe(completedRun);
  });

  it("restores Retry after a failed pre-check without false advancement", async () => {
    const value = fullyAcceptedDraft();
    store.load.mockResolvedValue(stored(value));
    const fetchMock = vi.fn(async () => ({
      json: async () => ({ ok: false, error: { code: "OCR_FAILED", message: "OCR unavailable" } }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<PackagePreparationWorkspace />);

    fireEvent.click(await screen.findByRole("button", { name: "Run pre-check" }));
    expect(await screen.findByRole("button", { name: "Retry pre-check" })).toBeEnabled();
    expect(screen.getByText(/analysis did not complete: OCR unavailable/i)).toBeInTheDocument();
    expect(store.save).not.toHaveBeenCalled();
    expect(value.analysisRuns).toHaveLength(0);
  });

  it("renders draft manager toolbar and supports starting a new package", async () => {
    const value = fullyAcceptedDraft();
    store.load.mockResolvedValue(stored(value));
    render(<PackagePreparationWorkspace />);

    expect(await screen.findByTestId("draft-manager-toolbar")).toBeInTheDocument();
    expect(screen.getByTestId("create-new-package-btn")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("create-new-package-btn"));
    // New draft should have a fresh packageId
    expect(await screen.findByTestId("draft-selector")).toBeInTheDocument();
  });

  it("cancels draft switch when workspace is dirty and user rejects confirmation", async () => {
    const draft1 = {
      ...fullyAcceptedDraft(),
      sellerChangeHistory: [
        {
          changeId: "ch-1",
          sequence: 1,
          action: "category_updated" as const,
          recordedAt: "2026-07-23T00:00:00Z",
          detail: "Edit",
        },
      ],
    };
    const draft2 = { ...fullyAcceptedDraft(), packageId: "pkg-other" };
    store.load.mockResolvedValue(stored(draft1));
    store.list.mockResolvedValue([stored(draft1), stored(draft2)]);
    const confirmSpy = vi.fn(() => false);
    vi.stubGlobal("confirm", confirmSpy);

    render(<PackagePreparationWorkspace />);

    expect(await screen.findByTestId("draft-manager-toolbar")).toBeInTheDocument();

    // Attempt to switch draft to second draft while saveState is unsaved
    const selector = screen.getByTestId("draft-selector");
    fireEvent.change(selector, { target: { value: "pkg-other" } });

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringMatching(/Switch to another draft\?/i));
  });
});
