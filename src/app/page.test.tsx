import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("HomePage", () => {
  it("renders the product heading and the review workspace", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { level: 1, name: /alcohol label verification/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /label image/i })).toBeInTheDocument();
  });
});
