import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SellerPackageDraft } from "./package-model";

const store = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn() }));

// Keep the real DraftStoreError (the workspace uses `instanceof` in its catch),
// override only the load/save functions.
vi.mock("./package-draft-store", async (importActual) => {
  const actual = await importActual<typeof import("./package-draft-store")>();
  return { ...actual, loadPackageDraftLocally: store.load, savePackageDraftLocally: store.save };
});

import { PackagePreparationWorkspace } from "./PackagePreparationWorkspace";
import { DraftStoreError } from "./package-draft-store";

let createdUrls: string[] = [];
let revokedUrls: string[] = [];

function panelDraft(): {
  draft: SellerPackageDraft;
  panelFiles: { panelId: string; file: File }[];
} {
  const panel = {
    panelId: "front-panel",
    order: 0,
    role: "front" as const,
    displayName: "front.png",
    mediaType: "image/png",
    byteSize: 10,
    checksumSha256: "0".repeat(64),
    width: 1000,
    height: 1500,
    rotation: 0 as const,
  };
  return {
    draft: {
      schemaVersion: "seller-package-draft.v1",
      packageId: "pkg-restored",
      createdAt: "2026-07-19T00:00:00.000Z",
      updatedAt: "2026-07-19T00:00:00.000Z",
      profile: { id: "wine-label-requirements", version: "1.0.0" },
      panelDecisions: { back: "upload", additional: "none" },
      panels: [panel],
      categories: [
        { categoryId: "brandName", decision: "provided", expectedValue: "", regions: [] },
        { categoryId: "alcoholStatement", decision: "provided", expectedValue: "", regions: [] },
      ],
      sellerChangeHistory: [],
      analysisRuns: [],
    } as unknown as SellerPackageDraft,
    panelFiles: [
      { panelId: "front-panel", file: new File(["front"], "front.png", { type: "image/png" }) },
    ],
  };
}

beforeEach(() => {
  store.load.mockReset();
  store.save.mockReset();
  store.save.mockResolvedValue(undefined);
  createdUrls = [];
  revokedUrls = [];
  let counter = 0;
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => {
      const url = `blob:mock-${counter++}`;
      createdUrls.push(url);
      return url;
    }),
    revokeObjectURL: vi.fn((url: string) => revokedUrls.push(url)),
  });
  vi.stubGlobal("crypto", {
    ...crypto,
    randomUUID: vi.fn(() => "00000000-0000-4000-8000-000000000000"),
    subtle: { digest: vi.fn(async () => new Uint8Array(32).buffer) },
  });
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 1000, height: 1500, close: vi.fn() })),
  );
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("workspace local-draft restoration", () => {
  it("opens a usable new draft, with no warning, on an empty database", async () => {
    store.load.mockResolvedValue(null);
    render(<PackagePreparationWorkspace />);
    await waitFor(() => expect(screen.queryByText(/Restoring the locally saved/i)).toBeNull());
    expect(screen.queryByTestId("restoration-warning")).toBeNull();
    expect(screen.getByTestId("seller-workstation")).toHaveAttribute(
      "data-restoration-status",
      "restored",
    );
  });

  it("restores a valid draft and creates one object URL per panel (no duplicates)", async () => {
    store.load.mockResolvedValue(panelDraft());
    render(<PackagePreparationWorkspace />);
    await waitFor(() => expect(screen.getByTestId("seller-workstation")).toBeInTheDocument());
    expect(screen.queryByTestId("restoration-warning")).toBeNull();
    expect(createdUrls).toHaveLength(1);
  });

  it("falls back to a usable draft with a warning when storage errors", async () => {
    store.load.mockRejectedValue(new DraftStoreError("LOCAL_DRAFT_STORAGE_OPEN_FAILED"));
    render(<PackagePreparationWorkspace />);
    await waitFor(() => expect(screen.getByTestId("restoration-warning")).toBeInTheDocument());
    expect(screen.getByTestId("restoration-warning")).toHaveTextContent(
      /could not restore the locally saved draft/i,
    );
    expect(screen.getByTestId("restoration-warning")).toHaveTextContent(/was not deleted/i);
    expect(screen.getByTestId("seller-workstation")).toHaveAttribute(
      "data-restoration-status",
      "LOCAL_DRAFT_STORAGE_OPEN_FAILED",
    );
    expect(
      screen.getByRole("button", { name: "Retry local draft restoration" }),
    ).toBeInTheDocument();
  });

  it("falls back with a warning on a malformed stored draft (never auto-deletes)", async () => {
    store.load.mockRejectedValue(new DraftStoreError("LOCAL_DRAFT_MALFORMED"));
    render(<PackagePreparationWorkspace />);
    await waitFor(() => expect(screen.getByTestId("restoration-warning")).toBeInTheDocument());
    expect(screen.getByTestId("seller-workstation")).toHaveAttribute(
      "data-restoration-status",
      "LOCAL_DRAFT_MALFORMED",
    );
  });

  it("stops loading and opens a usable draft when IndexedDB never settles (deadline)", async () => {
    vi.useFakeTimers();
    store.load.mockReturnValue(new Promise(() => {})); // never settles
    render(<PackagePreparationWorkspace />);
    // Loading is shown initially.
    expect(screen.getByText(/Restoring the locally saved/i)).toBeInTheDocument();
    // Advance past the bounded deadline.
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText(/Restoring the locally saved/i)).toBeNull();
    expect(screen.getByTestId("restoration-warning")).toBeInTheDocument();
    expect(screen.getByTestId("seller-workstation")).toHaveAttribute(
      "data-restoration-status",
      "timeout",
    );
  });

  it("ignores a late IndexedDB success after the deadline fallback (does not overwrite)", async () => {
    vi.useFakeTimers();
    let resolveLate: (v: unknown) => void = () => {};
    store.load.mockReturnValue(new Promise((resolve) => (resolveLate = resolve)));
    render(<PackagePreparationWorkspace />);
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByTestId("restoration-warning")).toBeInTheDocument();

    // The original load resolves late — it must be ignored.
    await act(async () => {
      resolveLate(panelDraft());
      await Promise.resolve();
    });
    expect(screen.getByTestId("restoration-warning")).toBeInTheDocument();
    // A late success must not create object URLs for the superseded result.
    expect(createdUrls).toHaveLength(0);
  });

  it("retries restoration when the retry action is used", async () => {
    store.load.mockRejectedValueOnce(new DraftStoreError("LOCAL_DRAFT_STORAGE_BLOCKED"));
    render(<PackagePreparationWorkspace />);
    await waitFor(() => expect(screen.getByTestId("restoration-warning")).toBeInTheDocument());

    // A successful retry clears the warning.
    store.load.mockResolvedValueOnce(null);
    await act(async () => {
      screen.getByRole("button", { name: "Retry local draft restoration" }).click();
    });
    await flush();
    await waitFor(() => expect(screen.queryByTestId("restoration-warning")).toBeNull());
    expect(store.load).toHaveBeenCalledTimes(2);
  });

  it("revokes created object URLs on unmount (no leaks)", async () => {
    store.load.mockResolvedValue(panelDraft());
    const { unmount } = render(<PackagePreparationWorkspace />);
    await waitFor(() => expect(screen.getByTestId("seller-workstation")).toBeInTheDocument());
    expect(createdUrls).toHaveLength(1);
    unmount();
    expect(revokedUrls).toEqual(createdUrls);
  });
});
