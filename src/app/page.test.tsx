import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { INTENTS } from "@/features/home/intents";

import HomePage from "./page";

describe("HomePage — intent hub", () => {
  it("leads with the question and the upload-or-build promise", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { level: 1, name: /what would you like to do today\?/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/upload your label — or, if you do not have one yet, build it here\./i),
    ).toBeInTheDocument();
  });

  it("renders all six intent paths", () => {
    render(<HomePage />);
    expect(INTENTS).toHaveLength(6);
    // Scope to the intent list: some titles intentionally match a header nav link
    // (e.g. "Prepare a package"), which is a separate landmark.
    const list = within(screen.getByRole("list"));
    for (const intent of INTENTS) {
      expect(list.getByText(intent.title)).toBeInTheDocument();
    }
  });

  it("offers exactly four active paths: create, prepare package, single-image pre-check and learn", () => {
    render(<HomePage />);
    // The intent list is the only place intents are offered; the header's
    // navigation and the sticky account bar are separate landmarks, not counted.
    const list = screen.getByRole("list");
    const links = within(list).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href")).sort()).toEqual([
      "/create",
      "/learn",
      "/review",
      "/review/legacy",
    ]);
  });

  it("gives unavailable paths no interactive control at all", () => {
    render(<HomePage />);
    const list = screen.getByRole("list");
    // No buttons, and no disabled affordance implying a working control is one
    // click away. An unavailable path renders nothing to activate.
    expect(within(list).queryAllByRole("button")).toHaveLength(0);
    expect(list.querySelectorAll("[aria-disabled],[disabled]")).toHaveLength(0);
  });

  it("states each unavailable path's absence in text, not by styling alone", () => {
    render(<HomePage />);
    // "Create a new label" became a real path in UI Slice 2, so two remain
    // unavailable — and they still say so in words, not by dimming.
    expect(screen.getAllByText(/not available yet/i)).toHaveLength(2);
    expect(screen.getByText(/cannot edit artwork/i)).toBeInTheDocument();
    expect(screen.getByText(/there is no provider directory/i)).toBeInTheDocument();
  });

  it("uses no coming-soon marketing, waitlist, or implied functionality", () => {
    const { container } = render(<HomePage />);
    expect(container.textContent).not.toMatch(
      /coming soon|waitlist|join the list|notify me|early access|request access/i,
    );
  });

  it("keeps the advisory boundary and introduces no approval language", () => {
    const { container } = render(<HomePage />);
    const text = container.textContent ?? "";
    expect(screen.getByText(/does not approve or reject a label/i)).toBeInTheDocument();
    expect(screen.getAllByText(/not a TTB approval/i)).toHaveLength(1);
    // Verdict-shaped status words in their badge-like, capitalized usage. The
    // advisory itself must be free to say the system does *not* approve.
    expect(text).not.toMatch(/\b(Approved|Rejected|Cleared|Compliant|Noncompliant|Certified)\b/);
    expect(text).not.toMatch(/TTB[- ]ready|submission[- ]ready|ready to submit/i);
  });

  it("shows no aggregate compliance score or readiness percentage", () => {
    const { container } = render(<HomePage />);
    expect(container.textContent).not.toMatch(/\d+\s*%/);
    expect(container.textContent).not.toMatch(/\bscore\b|\breadiness\b|\bgrade\b/i);
  });

  it("does not auto-open the pre-check introduction on the hub", () => {
    render(<HomePage />);
    // The introduction describes the review workflow and must not hijack the
    // front door. It stays replayable from the appearance settings.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
