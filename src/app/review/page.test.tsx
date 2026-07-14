import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import ReviewPage from "./page";

/**
 * The pre-check experience after its move from `/` to `/review`. These are the
 * assertions the old home-page test made, unchanged in substance: the move is
 * routing and presentation only, so the workflow it guarded must still hold.
 */
describe("ReviewPage", () => {
  it("renders the Label Lens TTB title, purpose, and workspace", () => {
    render(<ReviewPage />);
    expect(screen.getByRole("heading", { level: 1, name: /label lens ttb/i })).toBeInTheDocument();
    expect(screen.getByText(/prescreen a wine label before formal review/i)).toBeInTheDocument();
    expect(
      screen.getByText(/extract brand and alcohol evidence, identify items that need review/i),
    ).toBeInTheDocument();
    // The workspace mounts.
    expect(screen.getByRole("heading", { name: /label image/i })).toBeInTheDocument();
  });

  it("keeps the legal boundary available without repeating it in dominant blocks", () => {
    render(<ReviewPage />);
    expect(screen.getByText(/does not approve or reject a label/i)).toBeInTheDocument();
    expect(screen.getAllByText(/not a TTB approval/i).length).toBe(1);
    expect(screen.queryByText(/\b(Approved|Rejected|Compliant|Certification)\b/)).toBeNull();
  });

  it("preserves the declared-fact inputs and the gated run control", () => {
    render(<ReviewPage />);
    // Declared facts remain operator-entered and distinct from OCR evidence.
    expect(screen.getByLabelText(/application brand name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/application alcohol value/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/select one label image/i)).toBeInTheDocument();
    // The run stays disabled until an image and both facts exist.
    expect(screen.getByRole("button", { name: /^run pre-check$/i })).toBeDisabled();
  });

  it("offers the bundled sample and states that it runs the real extractor", () => {
    render(<ReviewPage />);
    expect(
      screen.getByRole("button", { name: /load verified m cellars sample/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/bundled demonstration fixture/i)).toBeInTheDocument();
  });
});
