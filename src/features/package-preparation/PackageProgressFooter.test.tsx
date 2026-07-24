// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PackageProgressFooter } from "./PackageProgressFooter";
import {
  WINE_PACKAGE_CATEGORY_DEFINITIONS,
  WINE_PACKAGE_CATEGORY_INSTRUCTIONS,
} from "./package-profile";
import { deriveGuidedPackageWorkflow } from "./package-workflow";

const sampleDraft = {
  schemaVersion: "seller-package-draft.v1" as const,
  packageId: "guided-package",
  createdAt: "2026-07-18T00:00:00.000Z",
  updatedAt: "2026-07-18T00:00:00.000Z",
  profile: { id: "wine-label-requirements", version: "1.0.0" },
  panelDecisions: { back: "absent" as const, additional: "none" as const },
  panels: [
    {
      panelId: "front-panel",
      order: 0,
      role: "front" as const,
      displayName: "front.png",
      mediaType: "image/png",
      byteSize: 10,
      checksumSha256: "0".repeat(64),
      width: 1000,
      height: 1000,
      rotation: 0 as const,
    },
  ],
  categories: WINE_PACKAGE_CATEGORY_DEFINITIONS.map((definition) => ({
    categoryId: definition.categoryId,
    decision: "provided" as const,
    expectedValue: "",
    regions: [],
  })),
  sellerChangeHistory: [],
  analysisRuns: [],
};

const sampleWorkflow = deriveGuidedPackageWorkflow({
  draft: sampleDraft,
  definitions: WINE_PACKAGE_CATEGORY_DEFINITIONS,
  instructions: WINE_PACKAGE_CATEGORY_INSTRUCTIONS,
  saveState: "unsaved",
});

describe("PackageProgressFooter — evidence save guidance emphasis", () => {
  it("renders without emphasis when action.emphasized is false", () => {
    render(
      <PackageProgressFooter
        workflow={sampleWorkflow}
        saveState="unsaved"
        analysisRunCount={0}
        action={{ label: "Save Brand name", disabled: true, emphasized: false }}
      />,
    );

    const actionContainer = screen.getByTestId("footer-stage-action");
    expect(actionContainer).not.toHaveAttribute("data-emphasized");
    expect(screen.queryByTestId("footer-ready-badge")).not.toBeInTheDocument();
    expect(screen.getByTestId("footer-aria-live")).toHaveTextContent("Save Brand name");
  });

  it("renders bounded emphasis, visible ready badge, and polite aria-live status when action.emphasized is true", () => {
    render(
      <PackageProgressFooter
        workflow={sampleWorkflow}
        saveState="unsaved"
        analysisRunCount={0}
        action={{ label: "Save Brand name", disabled: false, emphasized: true }}
      />,
    );

    const actionContainer = screen.getByTestId("footer-stage-action");
    expect(actionContainer).toHaveAttribute("data-emphasized", "true");
    expect(screen.getByTestId("footer-ready-badge")).toHaveTextContent("Ready to save");
    expect(screen.getByTestId("footer-aria-live")).toHaveTextContent(
      "Save Brand name evidence is ready to save.",
    );
  });
});
