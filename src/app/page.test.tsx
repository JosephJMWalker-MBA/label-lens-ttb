import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("HomePage", () => {
  it("renders the product heading", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { name: /alcohol label verification/i }),
    ).toBeInTheDocument();
  });

  it("shows a disabled call to action while the workflow is under construction", () => {
    render(<HomePage />);
    expect(screen.getByRole("button", { name: /start a review/i })).toBeDisabled();
  });
});
