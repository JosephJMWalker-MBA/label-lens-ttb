// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  list: vi.fn(),
  updateSubmitter: vi.fn(),
}));

const auth = vi.hoisted(() => ({
  useSession: vi.fn(),
}));

vi.mock("./package-draft-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./package-draft-store")>();
  return {
    ...actual,
    loadPackageDraftLocally: store.load,
    savePackageDraftLocally: store.save,
    listPackageDraftsLocally: store.list,
    updatePackageSubmitterLocally: store.updateSubmitter,
  };
});

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: auth.useSession,
  },
}));

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

import type { SellerPackageDraft } from "./package-model";
import { newDraft, type StoredPackageDraft } from "./package-draft-store";
import { ReviewWorkspaceContainer } from "./ReviewWorkspaceContainer";

/**
 * A saved package whose current pre-check needs nothing more from the seller:
 * the workspace opens it on the final submission step, where the submitter
 * name is collected.
 */
function readyDraft(packageId: string, brand: string): StoredPackageDraft {
  const panels = [
    {
      panelId: `${packageId}-front`,
      order: 0,
      role: "front" as const,
      displayName: "front.png",
      mediaType: "image/png",
      byteSize: 5,
      checksumSha256: "0".repeat(64),
      width: 1000,
      height: 1500,
      rotation: 0 as const,
    },
  ];
  const region = (categoryId: "brandName" | "alcoholStatement", y: number) => ({
    regionId: `${packageId}-${categoryId}`,
    categoryId,
    panelId: `${packageId}-front`,
    unit: "normalized-panel-relative" as const,
    provenance: "seller-selected-region" as const,
    x: 0.1,
    y,
    width: 0.5,
    height: 0.1,
  });
  const draft: SellerPackageDraft = {
    schemaVersion: "seller-package-draft.v1",
    packageId,
    createdAt: "2026-11-08T00:00:00.000Z",
    updatedAt: "2026-11-08T00:30:00.000Z",
    profile: { id: "wine-label-requirements", version: "1.0.0" },
    panelDecisions: { back: "absent", additional: "none" },
    panels,
    categories: [
      {
        categoryId: "brandName",
        decision: "provided",
        expectedValue: brand,
        regions: [region("brandName", 0.2)],
      },
      {
        categoryId: "alcoholStatement",
        decision: "provided",
        expectedValue: "13.5% alc. by vol.",
        regions: [region("alcoholStatement", 0.8)],
      },
    ],
    sellerChangeHistory: [
      {
        changeId: `${packageId}-saved`,
        sequence: 1,
        recordedAt: "2026-11-08T00:30:00.000Z",
        action: "draft_saved",
        detail: "Seller package draft saved locally.",
      },
    ],
    analysisRuns: [
      {
        analysisRunId: `${packageId}-run`,
        sequence: 1,
        sellerChangeSequence: 1,
        recordedAt: "2026-11-08T00:31:00.000Z",
        panelRuns: [],
        categories: (["brandName", "alcoholStatement"] as const).map((categoryId) => ({
          categoryId,
          state: "clearly_readable" as const,
          observedValue: "observed",
          supportingPanelIds: [`${packageId}-front`],
          supportingRegionIds: [`${packageId}-${categoryId}`],
          reason: "Seller and machine evidence agree.",
        })),
        readiness: "ready_for_agent_submission",
      },
    ],
  };
  return {
    draft,
    panelFiles: [
      {
        panelId: `${packageId}-front`,
        file: new File(["front"], "front.png", { type: "image/png" }),
      },
    ],
  };
}

async function finalStepNameInput() {
  await screen.findByTestId("prepare-workspace");
  return (await screen.findByLabelText("Seller or submitter name")) as HTMLInputElement;
}

describe("ReviewWorkspaceContainer — submitter continuity and state isolation", () => {
  let mockDrafts: StoredPackageDraft[] = [];

  beforeEach(() => {
    mockDrafts = [readyDraft("pkg-a", "Package A Label"), readyDraft("pkg-b", "Package B Label")];
    router.push.mockReset();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 404 })),
    );
    vi.spyOn(window, "confirm").mockReturnValue(true);
    store.load.mockReset();
    store.save.mockReset();
    store.list.mockReset();
    store.updateSubmitter.mockReset();
    auth.useSession.mockReset();
    auth.useSession.mockReturnValue({
      data: { user: { role: "seller", name: "Alice Seller", email: "alice@example.com" } },
      isPending: false,
    });

    store.save.mockImplementation(async (d: StoredPackageDraft) => {
      const idx = mockDrafts.findIndex(
        (existing) => existing.draft.packageId === d.draft.packageId,
      );
      if (idx >= 0) {
        mockDrafts[idx] = d;
      } else {
        mockDrafts.unshift(d);
      }
      return undefined;
    });

    store.list.mockImplementation(async () => mockDrafts);
    store.load.mockImplementation(async (packageId?: string) => {
      if (!packageId) return mockDrafts[0] ?? null;
      return mockDrafts.find((d) => d.draft.packageId === packageId) ?? null;
    });
    store.updateSubmitter.mockImplementation(async (id: string, name: string) => {
      let existing = mockDrafts.find((d) => d.draft.packageId === id);
      if (!existing) {
        const d = newDraft();
        d.packageId = id;
        d.submitter = name;
        existing = { draft: d, panelFiles: [] };
        mockDrafts.push(existing);
      } else {
        existing.draft.submitter = name;
      }
      return existing;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("asks for the submitter name only at the final step and keeps one copy of it", async () => {
    render(<ReviewWorkspaceContainer />);

    const nameInput = await finalStepNameInput();
    await waitFor(() => expect(nameInput.value).toBe("Alice Seller"));

    fireEvent.change(nameInput, { target: { value: "Napa Valley Bottling Co." } });
    expect(nameInput.value).toBe("Napa Valley Bottling Co.");
    // The earlier duplicate field in the workspace is gone: one name, one place.
    expect(screen.getAllByLabelText("Seller or submitter name")).toHaveLength(1);
    expect(document.getElementById("package-submitter")).toBeNull();
  });

  it("makes internal-review submission the footer's single final action", async () => {
    render(<ReviewWorkspaceContainer />);
    await finalStepNameInput();

    const footer = screen.getByTestId("package-progress-footer");
    expect(within(footer).getByRole("button")).toHaveTextContent("Submit for internal review");
    expect(screen.getAllByRole("button", { name: /submit for internal review/i })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Prepare agent package" })).toBeNull();
    expect(footer.querySelector('[data-stage="submit"]')).toHaveAttribute("data-status", "current");
    // The download is still available, but only as an optional copy.
    expect(screen.getByRole("button", { name: "Download a copy (JSON)" })).toBeInTheDocument();
  });

  it("does not show submission controls before the package is ready", async () => {
    mockDrafts = [];
    render(<ReviewWorkspaceContainer />);

    await screen.findByTestId("seller-workstation");
    expect(screen.queryByTestId("agent-review-submission-dock")).toBeNull();
    expect(screen.queryByLabelText("Seller or submitter name")).toBeNull();
    expect(screen.queryByRole("button", { name: /submit for/i })).toBeNull();
  });

  it("preserves deliberate empty string without overwriting during session refresh", async () => {
    render(<ReviewWorkspaceContainer />);

    const nameInput = await finalStepNameInput();
    await waitFor(() => expect(nameInput.value).toBe("Alice Seller"));

    // Deliberately clear the name
    fireEvent.change(nameInput, { target: { value: "" } });
    expect(nameInput.value).toBe("");

    // Simulate session refresh
    auth.useSession.mockReturnValue({
      data: { user: { role: "seller", name: "Alice Seller", email: "alice@example.com" } },
      isPending: false,
    });

    await waitFor(() => expect(nameInput.value).toBe(""));
    expect(
      within(screen.getByTestId("package-progress-footer")).getByRole("button"),
    ).toBeDisabled();
  });

  it("handles rapid sequential edits with last-edit-wins serial persistence", async () => {
    const callOrder: string[] = [];
    store.updateSubmitter.mockImplementation(async (id: string, name: string) => {
      callOrder.push(name);
      return null;
    });

    render(<ReviewWorkspaceContainer />);

    const nameInput = await finalStepNameInput();
    await waitFor(() => expect(nameInput.value).toBe("Alice Seller"));

    fireEvent.change(nameInput, { target: { value: "A" } });
    fireEvent.change(nameInput, { target: { value: "AB" } });
    fireEvent.change(nameInput, { target: { value: "ABC Winery" } });

    expect(nameInput.value).toBe("ABC Winery");

    await waitFor(() => {
      expect(callOrder).toEqual(["A", "AB", "ABC Winery"]);
    });
  });

  it("isolates submitter names between Package A and Package B and restores Package A's name when switching back", async () => {
    render(<ReviewWorkspaceContainer />);

    let nameInput = await finalStepNameInput();
    await waitFor(() => expect(nameInput.value).toBe("Alice Seller"));

    // Set submitter for active Package A
    fireEvent.change(nameInput, { target: { value: "Package A Winery" } });
    expect(nameInput.value).toBe("Package A Winery");

    // Switch to Package B
    const selector = screen.getByTestId("draft-selector") as HTMLSelectElement;
    await waitFor(() => expect(selector.options.length).toBeGreaterThan(1));
    const packageA = selector.value;
    const packageBOption = Array.from(selector.options).find((opt) => opt.value !== packageA)!;
    fireEvent.change(selector, { target: { value: packageBOption.value } });

    // Package B initializes with the profile default, distinct from Package A Winery
    await waitFor(() => expect(selector.value).toBe(packageBOption.value));
    nameInput = await finalStepNameInput();
    await waitFor(() => expect(nameInput.value).toBe("Alice Seller"));

    // Change Package B submitter
    fireEvent.change(nameInput, { target: { value: "Package B Estate" } });
    expect(nameInput.value).toBe("Package B Estate");

    // Switching back to Package A restores Package A Winery
    fireEvent.change(selector, { target: { value: packageA } });
    await waitFor(() => expect(selector.value).toBe(packageA));
    await waitFor(async () => expect((await finalStepNameInput()).value).toBe("Package A Winery"));
  });
});
