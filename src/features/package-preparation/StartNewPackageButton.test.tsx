/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StartNewPackageButton } from "./StartNewPackageButton";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const mockCreateAndActivateNewDraftLocally = vi.fn();
vi.mock("./package-draft-store", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./package-draft-store")>();
  return {
    ...actual,
    createAndActivateNewDraftLocally: () => mockCreateAndActivateNewDraftLocally(),
  };
});

describe("StartNewPackageButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a draft once, disables while creating, and navigates to /review on success", async () => {
    let resolveCreate: () => void;
    const createPromise = new Promise<void>((resolve) => {
      resolveCreate = resolve;
    });
    mockCreateAndActivateNewDraftLocally.mockReturnValue(createPromise);

    render(<StartNewPackageButton />);
    const button = screen.getByTestId("start-new-package-btn");

    fireEvent.click(button);
    expect(button).toBeDisabled();
    expect(mockCreateAndActivateNewDraftLocally).toHaveBeenCalledTimes(1);

    // Double click while in flight should be ignored
    fireEvent.click(button);
    expect(mockCreateAndActivateNewDraftLocally).toHaveBeenCalledTimes(1);

    resolveCreate!();
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/review");
    });
  });

  it("displays bounded error message when draft limit is reached", async () => {
    const { DraftStoreError } = await import("./package-draft-store");
    mockCreateAndActivateNewDraftLocally.mockRejectedValue(
      new DraftStoreError("LOCAL_DRAFT_LIMIT_REACHED"),
    );

    render(<StartNewPackageButton />);
    const button = screen.getByTestId("start-new-package-btn");

    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Local draft limit reached (maximum 20 drafts)",
      );
    });
    expect(button).not.toBeDisabled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
