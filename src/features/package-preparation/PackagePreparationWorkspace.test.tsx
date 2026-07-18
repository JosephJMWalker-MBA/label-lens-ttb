import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SellerPackageDraft } from "./package-model";

const store = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
}));

vi.mock("./package-draft-store", () => ({
  loadPackageDraftLocally: store.load,
  savePackageDraftLocally: store.save,
}));

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

beforeEach(() => {
  store.load.mockReset();
  store.save.mockReset();
  store.save.mockResolvedValue(undefined);
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn((file: File) => `blob:${file.name}`),
    revokeObjectURL: vi.fn(),
  });
  vi.stubGlobal("crypto", {
    ...crypto,
    randomUUID: vi.fn(() => "00000000-0000-4000-8000-000000000000"),
  });
});

describe("guided category acceptance", () => {
  it("keeps the starter box ephemeral until explicit acceptance, then checkpoints and advances", async () => {
    const value = storedDraft();
    store.load.mockResolvedValue(stored(value));
    render(<PackagePreparationWorkspace />);

    expect(await screen.findByRole("heading", { name: "Brand name" })).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector('[data-working="true"]')).not.toBeNull());
    expect(store.save).not.toHaveBeenCalled();
    expect(value.sellerChangeHistory).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("What the label says"), {
      target: { value: "CEDAR RIDGE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Accept Brand name" }));

    await waitFor(() => expect(store.save).toHaveBeenCalledTimes(1));
    const checkpoint = store.save.mock.calls[0][0] as { draft: SellerPackageDraft };
    expect(checkpoint.draft.categories[0]).toMatchObject({
      decision: "provided",
      expectedValue: "CEDAR RIDGE",
    });
    expect(checkpoint.draft.categories[0].regions).toHaveLength(1);
    expect(checkpoint.draft.sellerChangeHistory.map((change) => change.action)).toEqual([
      "category_updated",
      "region_added",
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
    fireEvent.click(screen.getByRole("button", { name: "Accept Brand name" }));

    expect(
      await screen.findByText(
        /category was not accepted because the local recovery checkpoint failed/i,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Brand name" })).toBeInTheDocument();
    expect(value.sellerChangeHistory).toHaveLength(0);
  });

  it("does not append duplicate history or checkpoint when an accepted category is reopened unchanged", async () => {
    const value = storedDraft(true);
    store.load.mockResolvedValue(stored(value));
    render(<PackagePreparationWorkspace />);

    expect(await screen.findByRole("heading", { name: "Brand name" })).toBeInTheDocument();
    const accept = screen.getByRole("button", { name: "Accept Brand name" });
    await waitFor(() => expect(accept).toBeEnabled());
    fireEvent.click(accept);

    expect(await screen.findByRole("heading", { name: "Alcohol statement" })).toBeInTheDocument();
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
    expect(screen.getByText(/Categories: 0\/2 complete/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /analyze saved package/i })).toBeDisabled();
  });
});
