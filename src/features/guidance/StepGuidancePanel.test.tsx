// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OFFICIAL_SOURCE_HOSTS } from "./official-sources";
import { allGuidance } from "./step-guidance";
import { StepGuidancePanel } from "./StepGuidancePanel";

describe("StepGuidancePanel", () => {
  it("quotes TTB with attribution and version, and states its own limits", () => {
    render(<StepGuidancePanel contextId="category:brandName" defaultOpen />);
    const panel = screen.getByTestId("step-guidance");

    const quote = within(panel).getByTestId("guidance-quote");
    expect(quote).toHaveTextContent(
      "A brand name is the name under which a wine or line of wines is marketed.",
    );
    expect(quote).toHaveTextContent("page last updated January 12, 2026");
    expect(within(quote).getByRole("link", { name: /Wine Labeling: Brand Name/ })).toHaveAttribute(
      "href",
      "https://www.ttb.gov/regulated-commodities/beverage-alcohol/wine/labeling-wine/wine-labeling-brand-name",
    );

    expect(panel).toHaveTextContent("What Label Lens does not check");
    expect(panel).toHaveTextContent("Label Lens does not decide these.");
    expect(within(panel).getByRole("link", { name: /27 CFR 4\.33/ })).toBeInTheDocument();
    expect(panel).toHaveTextContent("last amended December 6, 2024");
    expect(panel).toHaveTextContent("Sources checked November 8, 2026");
    expect(panel).toHaveTextContent("This is not legal advice");
  });

  it("opens every link on an official host in a new tab without passing the opener", () => {
    for (const guidance of allGuidance()) {
      const { unmount } = render(<StepGuidancePanel contextId={guidance.contextId} defaultOpen />);
      const links = within(screen.getByTestId("step-guidance")).getAllByRole("link");
      expect(links.length).toBeGreaterThan(0);
      for (const link of links) {
        const url = new URL(link.getAttribute("href")!);
        expect(url.protocol).toBe("https:");
        expect(OFFICIAL_SOURCE_HOSTS as readonly string[]).toContain(url.host);
        expect(link).toHaveAttribute("target", "_blank");
        expect(link.getAttribute("rel")).toContain("noopener");
      }
      unmount();
    }
  });

  it("offers nothing that could change state: no buttons, inputs, or forms", () => {
    for (const guidance of allGuidance()) {
      const { container, unmount } = render(
        <StepGuidancePanel contextId={guidance.contextId} defaultOpen />,
      );
      expect(container.querySelectorAll("button, input, select, textarea, form")).toHaveLength(0);
      unmount();
    }
  });

  it("says plainly when it has no guidance for a step", () => {
    render(<StepGuidancePanel contextId="category:netContents" />);
    const panel = screen.getByTestId("step-guidance");
    expect(panel).toHaveAttribute("data-abstained", "true");
    expect(panel).toHaveTextContent("Label Lens has no reviewed guidance for this step.");
    expect(within(panel).getByRole("link", { name: /Labeling/ })).toHaveAttribute(
      "href",
      "https://www.ttb.gov/regulated-commodities/labeling/",
    );
  });

  it("hands the final step to official filing without calling anything an approval", () => {
    render(<StepGuidancePanel contextId="step:submit" defaultOpen />);
    const panel = screen.getByTestId("step-guidance");
    expect(panel).toHaveTextContent(
      "COLAs Online makes it easy for you to apply for a Certificate of Label Approval/Exemption (COLA) for your product.",
    );
    expect(panel).toHaveTextContent("an internal decision is not a TTB approval");
    expect(
      within(panel).getByRole("link", { name: /Wine Labeling: Net Contents/ }),
    ).toBeInTheDocument();
    expect(panel.textContent ?? "").not.toMatch(/\bapproved\b/i);
  });
});
