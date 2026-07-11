import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import HomePage from "./page";

describe("HomePage", () => {
  it("renders the wine pre-check heading and the workspace", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { level: 1, name: /wine label pre-check/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /label image/i })).toBeInTheDocument();
    // Advisory boundary is visible.
    expect(screen.getAllByText(/not a TTB approval/i).length).toBeGreaterThan(0);
  });
});
