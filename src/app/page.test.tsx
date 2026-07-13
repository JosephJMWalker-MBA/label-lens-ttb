import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { ONBOARDING_STORAGE_KEY } from "@/components/onboarding/onboarding-context";

import HomePage from "./page";

describe("HomePage", () => {
  // Mark onboarding seen so the productive cold-start overlay does not auto-open
  // (and auto-run the sample) during these page-structure tests.
  beforeEach(() => localStorage.setItem(ONBOARDING_STORAGE_KEY, "true"));

  it("renders the Label Lens TTB title, purpose, and workspace", () => {
    render(<HomePage />);
    expect(screen.getByRole("heading", { level: 1, name: /label lens ttb/i })).toBeInTheDocument();
    // Concise purpose hierarchy.
    expect(screen.getByText(/prescreen a wine label before formal review/i)).toBeInTheDocument();
    expect(
      screen.getByText(/extract brand and alcohol evidence, identify items that need review/i),
    ).toBeInTheDocument();
    // The workspace mounts.
    expect(screen.getByRole("heading", { name: /label image/i })).toBeInTheDocument();
  });

  it("keeps the legal boundary available without repeating it in dominant blocks", () => {
    render(<HomePage />);
    // The advisory notice states the boundary once.
    expect(screen.getByText(/does not approve or reject a label/i)).toBeInTheDocument();
    expect(screen.getAllByText(/not a TTB approval/i).length).toBe(1);
    // No government-approval verdict language.
    expect(screen.queryByText(/\b(Approved|Rejected|Compliant|Certification)\b/)).toBeNull();
  });
});
