import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { winePrecheckRegistry } from "@/pipeline/precheck/wine-precheck.profile";

import LearnPage from "./page";

describe("LearnPage — requirements explorer", () => {
  it("renders every registered rule with its id and version", () => {
    render(<LearnPage />);
    for (const rule of winePrecheckRegistry.all()) {
      expect(screen.getByText(rule.id)).toBeInTheDocument();
    }
  });

  it("shows the source and snapshot date cited by each check", () => {
    render(<LearnPage />);
    // Every authority citation in the profile is visible with its snapshot date.
    const citations = new Set(winePrecheckRegistry.all().map((r) => r.authority.citation));
    for (const citation of citations) {
      expect(screen.getAllByText(citation).length).toBeGreaterThan(0);
    }
    const snapshots = new Set(winePrecheckRegistry.all().map((r) => r.authority.snapshotDate));
    for (const snapshot of snapshots) {
      expect(screen.getAllByText(new RegExp(`snapshot ${snapshot}`)).length).toBeGreaterThan(0);
    }
  });

  it("separates checks that run from artwork from those that cannot", () => {
    render(<LearnPage />);
    expect(
      screen.getByRole("heading", { name: /checks that can be evaluated from artwork/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /checks that could not be evaluated from artwork alone/i,
      }),
    ).toBeInTheDocument();
  });

  it("names the external evidence each not-run check honestly requires", () => {
    render(<LearnPage />);
    // These strings come from the rules themselves, not from this page.
    expect(screen.getByText(/actual alcohol content with provenance/i)).toBeInTheDocument();
    expect(screen.getByText(/table\/light-wine designation evidence/i)).toBeInTheDocument();
    expect(screen.getByText(/class\/type or taxable-boundary evidence/i)).toBeInTheDocument();
  });

  it("states what the system cannot determine", () => {
    render(<LearnPage />);
    expect(screen.getByText(/what the system cannot determine/i)).toBeInTheDocument();
    expect(
      screen.getByText(/there is no overall status, score, or percentage/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not prove the statement is absent from the artwork/i),
    ).toBeInTheDocument();
  });

  it("labels rule descriptions as system behaviour, not as law", () => {
    render(<LearnPage />);
    expect(screen.getAllByText(/what the system does:/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/does not reproduce or interpret the regulation/i)).toBeInTheDocument();
  });

  it("introduces no approval, clearance, or aggregate-score language", () => {
    const { container } = render(<LearnPage />);
    const text = container.textContent ?? "";
    // Verdict-shaped status words, matched the way the rest of the suite does:
    // capitalized, i.e. the badge-like usage. The page's own disclaimer says the
    // system "issues no approval, rejection, or clearance" — stating the absence
    // of a verdict is exactly the language we want, so lowercase prose is fine.
    expect(text).not.toMatch(/\b(Approved|Rejected|Cleared|Compliant|Noncompliant|Certified)\b/);
    // Phrasings that are never legitimate, in any casing.
    expect(text).not.toMatch(/TTB[- ]ready|submission[- ]ready|ready to submit/i);
    // No aggregate score, percentage, or grade.
    expect(text).not.toMatch(/\d+\s*%/);
    expect(text).not.toMatch(/\bgrade\b|\breadiness\b/i);
  });

  it("keeps the advisory boundary visible", () => {
    render(<LearnPage />);
    expect(screen.getByText(/does not approve or reject a label/i)).toBeInTheDocument();
  });
});
