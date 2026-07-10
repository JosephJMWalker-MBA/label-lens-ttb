import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReviewWorkspace } from "./ReviewWorkspace";

function pngFile() {
  return new File(["label-bytes"], "label.png", { type: "image/png" });
}

describe("ReviewWorkspace", () => {
  it("keeps analysis disabled until a valid image and required fields exist", () => {
    render(<ReviewWorkspace />);
    const analyze = screen.getByRole("button", { name: /analyze label/i });
    expect(analyze).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /fill sample data/i }));
    expect(analyze).toBeDisabled(); // fields complete, image still missing

    fireEvent.change(screen.getByLabelText(/upload a label image/i), {
      target: { files: [pngFile()] },
    });
    expect(analyze).toBeEnabled();
  });

  it("prefills the distilled-spirits sample data", () => {
    render(<ReviewWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: /fill sample data/i }));
    expect(screen.getByLabelText(/brand name/i)).toHaveValue("Stone's Throw");
    expect(screen.getByLabelText(/net contents/i)).toHaveValue("750 mL");
  });

  it("surfaces an accessible error for an unsupported upload", () => {
    render(<ReviewWorkspace />);
    fireEvent.change(screen.getByLabelText(/upload a label image/i), {
      target: { files: [new File(["x"], "doc.pdf", { type: "application/pdf" })] },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(/png, jpeg, or webp/i);
  });

  it("labels every expected-field input", () => {
    render(<ReviewWorkspace />);
    for (const label of [/brand name/i, /class \/ type/i, /alcohol content/i, /net contents/i]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });
});
