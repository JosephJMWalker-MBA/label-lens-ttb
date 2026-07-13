import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { resolveFieldReviews } from "@/pipeline/result/field-confirmation";
import { assemblePrecheckResult } from "@/pipeline/result/assemble";
import { buildAssembleInput } from "@/pipeline/result/build.fixtures";
import type {
  HumanFieldConfirmationDecisionType,
  HumanFieldGeometry,
  ReviewableFieldId,
} from "@/pipeline/result/result.types";

import { ConfirmationImageReview } from "./ConfirmationImageReview";

function reviews() {
  const assembled = assemblePrecheckResult(buildAssembleInput());
  if (!assembled.ok) throw new Error("assembly failed");
  return resolveFieldReviews({
    observations: assembled.value.observations,
    humanFieldConfirmationHistory: [],
  });
}

function Harness({
  decisionType = "accepted-machine-reading",
}: {
  decisionType?: HumanFieldConfirmationDecisionType | "";
}) {
  const [activeField, setActiveField] = useState<ReviewableFieldId>("brandName");
  const [humanGeometry, setHumanGeometry] = useState<HumanFieldGeometry | null>(null);
  return (
    <ConfirmationImageReview
      previewImage={{ url: "blob:test", name: "label.jpeg" }}
      reviews={reviews()}
      activeField={activeField}
      onActiveFieldChange={setActiveField}
      activeDecisionType={decisionType}
      activeAlternateId=""
      activeHumanGeometry={humanGeometry}
      onHumanGeometryChange={setHumanGeometry}
    />
  );
}

describe("ConfirmationImageReview", () => {
  it("copies the machine region into normalized human geometry and keeps percentages stable across zoom, pan, and reset", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /use machine region/i }));
    const overlay = screen.getByRole("img", { name: /brand human review region/i });
    const before = {
      left: overlay.getAttribute("style"),
    };

    fireEvent.click(screen.getByRole("button", { name: /zoom in/i }));
    fireEvent.click(screen.getByRole("button", { name: /pan left/i }));
    fireEvent.click(screen.getByRole("button", { name: /pan down/i }));
    fireEvent.click(screen.getByRole("button", { name: /reset view/i }));

    expect(
      screen.getByRole("img", { name: /brand human review region/i }).getAttribute("style"),
    ).toBe(before.left);
  });

  it("draws a normalized human region from pointer coordinates", () => {
    render(<Harness />);
    const reviewImage = screen.getByAltText(/confirmation review image/i);
    const content = reviewImage.parentElement as HTMLElement;
    Object.defineProperty(content, "getBoundingClientRect", {
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        width: 200,
        height: 100,
        right: 200,
        bottom: 100,
        toJSON: () => "",
      }),
    });

    fireEvent.click(screen.getByRole("button", { name: /draw region/i }));
    fireEvent.mouseDown(content, { button: 0, buttons: 1, clientX: 20, clientY: 10 });
    fireEvent.mouseMove(content, { buttons: 1, clientX: 120, clientY: 60 });
    fireEvent.mouseUp(content, { clientX: 120, clientY: 60 });

    const overlay = screen.getByRole("img", { name: /brand human review region/i });
    expect(overlay).toHaveStyle({
      left: "10%",
      top: "10%",
      width: "50%",
      height: "50%",
    });
  });
});
