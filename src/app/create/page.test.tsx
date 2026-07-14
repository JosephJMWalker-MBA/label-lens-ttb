import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LabelScaffold, SCAFFOLD_DISCLAIMER_HEADING } from "@/features/create/LabelScaffold";
import { emptyProjectFacts, WINE_BEVERAGE_TYPE } from "@/features/create/facts";

import CreatePage from "./page";

/** Walk the workspace to a named stage. */
function goTo(stage: RegExp) {
  fireEvent.click(screen.getByRole("button", { name: stage }));
}

/** Fill the guided-facts form enough to make the wine profile apply. */
function enterWineFacts() {
  fireEvent.change(screen.getByLabelText(/beverage type/i), {
    target: { value: WINE_BEVERAGE_TYPE },
  });
  fireEvent.change(screen.getByLabelText(/brand name/i), {
    target: { value: "Cardinal Ridge" },
  });
  fireEvent.change(screen.getByLabelText(/net contents/i), { target: { value: "750 mL" } });
}

describe("CreatePage — guided facts", () => {
  it("opens on the facts intake and asks the maker about their product", () => {
    render(<CreatePage />);
    expect(
      screen.getByRole("heading", { level: 1, name: /create a new label/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /tell us about your product/i }),
    ).toBeInTheDocument();
  });

  it("requires nothing and blocks nothing — a maker with no answers can proceed", () => {
    render(<CreatePage />);
    // No field is marked required, and nothing gates moving on.
    expect(document.querySelectorAll("[required], [aria-required='true']")).toHaveLength(0);
    expect(screen.getByRole("button", { name: /^continue$/i })).toBeEnabled();
  });

  it("says plainly that only wine has a requirements profile", () => {
    render(<CreatePage />);
    fireEvent.change(screen.getByLabelText(/beverage type/i), { target: { value: "beer" } });
    expect(screen.getByText(/requirements profile for wine only/i)).toBeInTheDocument();
  });
});

describe("CreatePage — requirements summary", () => {
  it("shows required only for fields the merged registry actually cites", () => {
    render(<CreatePage />);
    enterWineFacts();
    goTo(/what you told us/i);

    const items = screen.getAllByRole("listitem");
    const required = items.filter((li) => within(li).queryByText(/required by cited authority/i));
    // Exactly brand name and alcohol statement — the two seeded requirements.
    expect(required).toHaveLength(2);
    expect(within(required[0]).getByText(/27 CFR/)).toBeInTheDocument();
  });

  it("shows the registry's citation and snapshot date, not a paraphrase", () => {
    render(<CreatePage />);
    enterWineFacts();
    goTo(/what you told us/i);
    expect(screen.getAllByText(/snapshot \d{4}-\d{2}-\d{2}/).length).toBeGreaterThan(0);
  });

  it("never turns an uncited field into a requirement, even when filled in", () => {
    render(<CreatePage />);
    enterWineFacts(); // includes net contents
    goTo(/what you told us/i);

    const netContents = screen
      .getAllByRole("listitem")
      .find((li) => within(li).queryByText(/^Net contents$/i))!;
    expect(within(netContents).getByText(/750 mL/)).toBeInTheDocument();
    expect(within(netContents).queryByText(/required by cited authority/i)).toBeNull();
    expect(within(netContents).getByText(/holds no cited requirement/i)).toBeInTheDocument();
  });

  it("states that silence is not permission", () => {
    render(<CreatePage />);
    enterWineFacts();
    goTo(/what you told us/i);
    expect(
      screen.getAllByText(/not a statement that the field is not required/i).length,
    ).toBeGreaterThan(0);
  });

  it("shows no requirements at all for a category it has no profile for", () => {
    render(<CreatePage />);
    fireEvent.change(screen.getByLabelText(/beverage type/i), { target: { value: "beer" } });
    goTo(/what you told us/i);
    expect(screen.queryByText(/required by cited authority/i)).toBeNull();
  });
});

describe("CreatePage — scaffold", () => {
  it("always shows the non-authoritative disclaimer", () => {
    render(<CreatePage />);
    goTo(/starter scaffold/i);
    expect(screen.getByText(SCAFFOLD_DISCLAIMER_HEADING)).toBeInTheDocument();
    expect(screen.getByText(/does not evaluate a layout/i)).toBeInTheDocument();
    expect(
      screen.getByText(/placement, size, contrast, and typography are not checked/i),
    ).toBeInTheDocument();
  });

  it("shows the disclaimer even with a completely empty project", () => {
    // The disclaimer is unconditional: it can never be state-dependent.
    render(<LabelScaffold facts={emptyProjectFacts()} />);
    expect(screen.getByText(SCAFFOLD_DISCLAIMER_HEADING)).toBeInTheDocument();
    expect(screen.getAllByText(/not provided yet/i).length).toBeGreaterThan(0);
  });

  it("never hides an unknown slot, so it cannot look complete", () => {
    render(<LabelScaffold facts={{ ...emptyProjectFacts(), brandName: "Cardinal Ridge" }} />);
    expect(screen.getByText("Cardinal Ridge")).toBeInTheDocument();
    expect(screen.getAllByText(/not provided yet/i).length).toBeGreaterThan(0);
  });
});

describe("CreatePage — export", () => {
  it("says plainly that nothing is saved", () => {
    render(<CreatePage />);
    goTo(/^4 export$|export/i);
    expect(screen.getByText(/nothing is saved here/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /export project file/i })).toBeInTheDocument();
  });
});

describe("CreatePage — authority language", () => {
  it("introduces no approval, clearance, or compliance language on any stage", () => {
    const { container } = render(<CreatePage />);
    enterWineFacts();
    for (const stage of [/what you told us/i, /starter scaffold/i, /export/i]) {
      goTo(stage);
      const text = container.textContent ?? "";
      expect(text).not.toMatch(/\b(Approved|Rejected|Cleared|Compliant|Noncompliant|Certified)\b/);
      expect(text).not.toMatch(/TTB[- ]ready|submission[- ]ready|ready to submit/i);
      expect(text).not.toMatch(/compliance score|readiness score|\d+\s*%/);
    }
  });

  it("keeps the advisory boundary visible", () => {
    render(<CreatePage />);
    expect(screen.getByText(/does not approve or reject a label/i)).toBeInTheDocument();
  });

  it("uses no check glyph or approval symbolism beside a requirement", () => {
    // A tick beside a requirement reads as "you have satisfied this". Nothing in
    // this system has checked anything against these values, so no tick appears
    // — neither as a character nor as an icon.
    const { container } = render(<CreatePage />);
    enterWineFacts();
    goTo(/what you told us/i);

    expect(container.textContent).not.toMatch(/[✓✔☑√]/);
    for (const svg of container.querySelectorAll("svg")) {
      const name = svg.getAttribute("class") ?? "";
      expect(name).not.toMatch(/check|tick|shield|badge|award|medal|seal|stamp|verified/i);
    }
  });
});
