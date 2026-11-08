// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("./package-draft-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./package-draft-store")>();
  return { ...actual, listPackageDraftsLocally: store.list };
});

import { newDraft, type StoredPackageDraft } from "./package-draft-store";
import { SellerDraftsOverview } from "./SellerDraftsOverview";

function draftWithBrand(packageId: string, brand: string, updatedAt: string): StoredPackageDraft {
  const draft = newDraft();
  draft.packageId = packageId;
  draft.updatedAt = updatedAt;
  draft.categories = draft.categories.map((category) =>
    category.categoryId === "brandName" ? { ...category, expectedValue: brand } : category,
  );
  return { draft, panelFiles: [] };
}

describe("SellerDraftsOverview", () => {
  beforeEach(() => {
    store.list.mockReset();
  });

  it("lists unfinished drafts with one next step and a Continue link to that exact draft", async () => {
    store.list.mockResolvedValue([
      draftWithBrand("pkg-new", "Cedar Ridge", "2026-11-08T10:00:00.000Z"),
      draftWithBrand("pkg-submitted", "Already Sent", "2026-11-08T09:00:00.000Z"),
    ]);
    render(
      <SellerDraftsOverview
        submissions={[{ id: "pkg-submitted", currentStatus: "waiting_for_agent_review" }]}
      />,
    );

    const rows = await screen.findAllByTestId("seller-draft-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Cedar Ridge");
    expect(rows[0]).toHaveTextContent("Next: Add the front label image");
    expect(within(rows[0]!).getByRole("link", { name: "Continue Cedar Ridge" })).toHaveAttribute(
      "href",
      "/review?packageId=pkg-new",
    );
    expect(screen.getByText(/saved in this browser only/i)).toBeInTheDocument();
    expect(screen.queryByTestId("seller-getting-started")).toBeNull();
  });

  it("explains how to begin when nothing is started or submitted", async () => {
    store.list.mockResolvedValue([]);
    render(<SellerDraftsOverview submissions={[]} />);

    const start = await screen.findByTestId("seller-getting-started");
    expect(start).toHaveTextContent("Start your first label package");
    expect(start).toHaveTextContent("PNG or JPEG");
    expect(start).toHaveTextContent("Submit for internal review");
    expect(start).toHaveTextContent("does not file with TTB");
  });

  it("stays quiet when every package is already submitted", async () => {
    store.list.mockResolvedValue([]);
    const { container } = render(
      <SellerDraftsOverview submissions={[{ id: "pkg-1", currentStatus: "in_agent_review" }]} />,
    );
    await waitFor(() => expect(store.list).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(container).toBeEmptyDOMElement();
  });

  it("reports unreadable browser storage without hiding submissions, and retries", async () => {
    store.list.mockRejectedValueOnce(new Error("LOCAL_DRAFT_STORAGE_FAILED"));
    store.list.mockResolvedValueOnce([
      draftWithBrand("pkg-retry", "Retry Label", "2026-11-08T10:00:00.000Z"),
    ]);
    render(<SellerDraftsOverview submissions={[]} />);

    const alert = await screen.findByTestId("seller-drafts-error");
    expect(alert).toHaveTextContent("submitted packages below are not affected");
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));

    expect(await screen.findByTestId("seller-draft-row")).toHaveTextContent("Retry Label");
  });
});
