import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import LegacyReviewPage from "./page";

describe("legacy single-image review route", () => {
  it("keeps the established pre-check available", () => {
    render(<LegacyReviewPage />);
    expect(screen.getByRole("heading", { level: 1, name: /label lens ttb/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/select one label image/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/application brand name/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^run pre-check$/i })).toBeDisabled();
  });
});
