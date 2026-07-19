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
    expect(await screen.findByTestId("seller-workstation")).toBeInTheDocument();
    expect(screen.getByTestId("workstation-controls")).toBeInTheDocument();
    expect(screen.getByTestId("cycling-workspace")).toBeInTheDocument();
    expect(screen.getByTestId("package-progress-footer")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /resolve the label panels/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/upload front label/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /no back label/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /no additional panels/i })).toBeInTheDocument();
    expect(screen.queryByTestId("example-label-map")).toBeNull();
    expect(screen.getByText(/nothing is submitted to TTB/i)).toBeInTheDocument();
    expect(screen.queryByText(/TTB submission complete/i)).toBeNull();
  });

  it("hides invalid future actions until canonical package state permits them", async () => {
    render(<ReviewPage />);
    expect(await screen.findByTestId("upload-workspace")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /run pre-check/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /prepare agent package/i })).toBeNull();
    expect(screen.getByText(/next: resolve the required panel decisions/i)).toBeInTheDocument();
  });
});
