import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReviewerDemoEntry } from "./ReviewerDemoEntry";

describe("ReviewerDemoEntry", () => {
  it("renders a persistent Reviewer demo action", () => {
    render(<ReviewerDemoEntry />);
    const trigger = screen.getByRole("button", { name: /reviewer demo/i });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("opens an accessible preview dialog describing the reviewer surface", async () => {
    render(<ReviewerDemoEntry />);
    fireEvent.click(screen.getByRole("button", { name: /reviewer demo/i }));

    const dialog = await screen.findByRole("dialog", { name: /what the reviewer receives/i });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    // Preview of the future queue statuses, described but not functional.
    expect(screen.getByText("READY FOR REVIEW")).toBeInTheDocument();
    expect(screen.getByText("NEEDS SELLER CORRECTION")).toBeInTheDocument();
  });

  it("states plainly it is a demo with no login or TTB integration", async () => {
    render(<ReviewerDemoEntry />);
    fireEvent.click(screen.getByRole("button", { name: /reviewer demo/i }));
    await screen.findByRole("dialog", { name: /what the reviewer receives/i });

    expect(screen.getByText(/demonstration only/i)).toBeInTheDocument();
    expect(screen.getByText(/not.*a sign-in|does not authenticate/i)).toBeInTheDocument();
    expect(screen.getByText(/no live TTB integration/i)).toBeInTheDocument();
    // No production-security or approval language.
    expect(screen.queryByText(/\b(Approved|Rejected|Sign in now|Operator login)\b/)).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    render(<ReviewerDemoEntry />);
    const trigger = screen.getByRole("button", { name: /reviewer demo/i });
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: /what the reviewer receives/i });
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /what the reviewer receives/i })).toBeNull(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("closes with the Close button", async () => {
    render(<ReviewerDemoEntry />);
    fireEvent.click(screen.getByRole("button", { name: /reviewer demo/i }));
    await screen.findByRole("dialog", { name: /what the reviewer receives/i });
    fireEvent.click(screen.getByRole("button", { name: /^close$/i }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: /what the reviewer receives/i })).toBeNull(),
    );
  });
});
