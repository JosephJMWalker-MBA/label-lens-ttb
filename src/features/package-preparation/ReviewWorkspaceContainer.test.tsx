// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

import { newDraft, type StoredPackageDraft } from "./package-draft-store";
import { ReviewWorkspaceContainer } from "./ReviewWorkspaceContainer";

describe("ReviewWorkspaceContainer — submitter continuity and state isolation", () => {
  let mockDrafts: StoredPackageDraft[] = [];

  beforeEach(() => {
    mockDrafts = [];
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

  it("synchronizes submitter edits between preparation workstation and submission dock", async () => {
    render(<ReviewWorkspaceContainer />);

    const dockInput = (await screen.findByLabelText(
      "Seller or submitter name",
    )) as HTMLInputElement;
    await waitFor(() => expect(dockInput.value).toBe("Alice Seller"));

    fireEvent.change(dockInput, { target: { value: "Napa Valley Bottling Co." } });
    expect(dockInput.value).toBe("Napa Valley Bottling Co.");

    const inputs = screen.getAllByLabelText("Seller or submitter name") as HTMLInputElement[];
    for (const input of inputs) {
      expect(input.value).toBe("Napa Valley Bottling Co.");
    }
  });

  it("preserves deliberate empty string without overwriting during session refresh", async () => {
    render(<ReviewWorkspaceContainer />);

    const dockInput = (await screen.findByLabelText(
      "Seller or submitter name",
    )) as HTMLInputElement;
    await waitFor(() => expect(dockInput.value).toBe("Alice Seller"));

    // Deliberately clear the name
    fireEvent.change(dockInput, { target: { value: "" } });
    expect(dockInput.value).toBe("");

    // Simulate session refresh
    auth.useSession.mockReturnValue({
      data: { user: { role: "seller", name: "Alice Seller", email: "alice@example.com" } },
      isPending: false,
    });

    await waitFor(() => expect(dockInput.value).toBe(""));
  });

  it("handles rapid sequential edits with last-edit-wins serial persistence", async () => {
    const callOrder: string[] = [];
    store.updateSubmitter.mockImplementation(async (id: string, name: string) => {
      callOrder.push(name);
      return null;
    });

    render(<ReviewWorkspaceContainer />);

    const dockInput = (await screen.findByLabelText(
      "Seller or submitter name",
    )) as HTMLInputElement;
    await waitFor(() => expect(dockInput.value).toBe("Alice Seller"));

    fireEvent.change(dockInput, { target: { value: "A" } });
    fireEvent.change(dockInput, { target: { value: "AB" } });
    fireEvent.change(dockInput, { target: { value: "ABC Winery" } });

    expect(dockInput.value).toBe("ABC Winery");

    await waitFor(() => {
      expect(callOrder).toEqual(["A", "AB", "ABC Winery"]);
    });
  });

  it("isolates submitter names between Package A and Package B and restores Package A's name when switching back", async () => {
    render(<ReviewWorkspaceContainer />);

    const dockInput = (await screen.findByLabelText(
      "Seller or submitter name",
    )) as HTMLInputElement;
    await waitFor(() => expect(dockInput.value).toBe("Alice Seller"));

    // Set submitter for active Package A
    fireEvent.change(dockInput, { target: { value: "Package A Winery" } });
    expect(dockInput.value).toBe("Package A Winery");

    // Click "Start another package" to create Package B
    const startAnotherBtn = screen.getByTestId("create-new-package-btn");
    fireEvent.click(startAnotherBtn);

    // Package B initializes with profile default or empty, distinct from Package A Winery
    await waitFor(() => expect(dockInput.value).toBe("Alice Seller"));

    // Change Package B submitter
    fireEvent.change(dockInput, { target: { value: "Package B Estate" } });
    expect(dockInput.value).toBe("Package B Estate");

    // Wait for draft selector options to contain Package A (the second option)
    const selector = screen.getByTestId("draft-selector") as HTMLSelectElement;
    await waitFor(() => expect(selector.options.length).toBeGreaterThan(1));

    const packageAOption = Array.from(selector.options).find(
      (opt) => opt.value !== selector.value,
    )!;
    fireEvent.change(selector, { target: { value: packageAOption.value } });

    // Switching back to Package A restores Package A Winery
    await waitFor(() => expect(dockInput.value).toBe("Package A Winery"));
  });
});
