import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ReviewPage from "./page";

beforeEach(() => {
  vi.stubGlobal("indexedDB", undefined);
  vi.stubGlobal("crypto", {
    ...crypto,
    randomUUID: () => "00000000-0000-4000-8000-000000000000",
  });
});

describe("seller package review route", () => {
  it("presents the package workflow and truthful transmission boundary", async () => {
    render(<ReviewPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: /prepare a seller label package/i }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: /see the two label areas/i }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("example-label-map")).toBeInTheDocument();
    expect(screen.getByText(/future categories.*not supported/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /upload the front and back label panels/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/front panel image/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/back panel image/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing is submitted to TTB/i)).toBeInTheDocument();
    expect(screen.queryByText(/TTB submission complete/i)).toBeNull();
  });

  it("gates analysis and local agent-package export", async () => {
    render(<ReviewPage />);
    expect(await screen.findByRole("button", { name: /analyze saved package/i })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: /submit to agent.*download locally/i }),
    ).toBeDisabled();
    expect(
      screen.getByText(/local download only · not a TTB submission or approval/i),
    ).toBeInTheDocument();
  });
});
