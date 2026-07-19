import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PackageAnnotationCanvas, fitPanelToViewport } from "./PackageAnnotationCanvas";
import type { PackagePanelMetadata, SellerEvidenceRegion } from "./package-model";

const panel: PackagePanelMetadata = {
  panelId: "front-panel",
  order: 0,
  role: "front",
  displayName: "front.png",
  mediaType: "image/png",
  byteSize: 10,
  checksumSha256: "a".repeat(64),
  width: 1000,
  height: 1500,
  rotation: 0,
};

const workingRegion: SellerEvidenceRegion = {
  regionId: "working-region",
  categoryId: "brandName",
  panelId: "front-panel",
  unit: "normalized-panel-relative",
  provenance: "seller-selected-region",
  x: 0.1,
  y: 0.2,
  width: 0.5,
  height: 0.2,
};

describe("package annotation working box", () => {
  it("contains portrait, landscape, and rotated panels without cropping or upscaling", () => {
    expect(
      fitPanelToViewport({
        panelWidth: 1000,
        panelHeight: 1500,
        rotation: 0,
        viewportWidth: 800,
        viewportHeight: 640,
      }),
    ).toEqual({ width: 608000 / 1500, height: 608 });
    expect(
      fitPanelToViewport({
        panelWidth: 1500,
        panelHeight: 1000,
        rotation: 0,
        viewportWidth: 800,
        viewportHeight: 640,
      }),
    ).toEqual({ width: 768, height: 512 });
    expect(
      fitPanelToViewport({
        panelWidth: 320,
        panelHeight: 180,
        rotation: 90,
        viewportWidth: 800,
        viewportHeight: 640,
      }),
    ).toEqual({ width: 320, height: 180 });
  });

  it("applies keyboard coordinates to the ephemeral box without committing seller evidence", () => {
    const onWorkingRegionChange = vi.fn();
    render(
      <PackageAnnotationCanvas
        panel={panel}
        imageUrl="blob:front"
        activeCategoryId="brandName"
        regions={[]}
        workingRegion={workingRegion}
        machineRegions={[]}
        activeRegionId={workingRegion.regionId}
        onActiveRegionChange={vi.fn()}
        onWorkingRegionChange={onWorkingRegionChange}
        onWorkingRegionDiscard={vi.fn()}
        onPanelRotationChange={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("Left %"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Top %"), { target: { value: "22" } });
    fireEvent.change(screen.getByLabelText("Width %"), { target: { value: "44" } });
    fireEvent.change(screen.getByLabelText("Height %"), { target: { value: "18" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply coordinates" }));

    expect(onWorkingRegionChange).toHaveBeenCalledWith({
      ...workingRegion,
      x: 0.12,
      y: 0.22,
      width: 0.44,
      height: 0.18,
    });
    expect(screen.getByText(/coordinates are ready.*save the category/i)).toBeInTheDocument();
  });

  it("discards only the uncommitted box", () => {
    const onWorkingRegionDiscard = vi.fn();
    render(
      <PackageAnnotationCanvas
        panel={panel}
        imageUrl="blob:front"
        activeCategoryId="brandName"
        regions={[]}
        workingRegion={workingRegion}
        machineRegions={[]}
        activeRegionId={workingRegion.regionId}
        onActiveRegionChange={vi.fn()}
        onWorkingRegionChange={vi.fn()}
        onWorkingRegionDiscard={onWorkingRegionDiscard}
        onPanelRotationChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete box" }));
    expect(onWorkingRegionDiscard).toHaveBeenCalledTimes(1);
  });

  it("returns zoom and pan to the fitted view without changing panel rotation", () => {
    const onPanelRotationChange = vi.fn();
    render(
      <PackageAnnotationCanvas
        panel={{ ...panel, rotation: 90 }}
        imageUrl="blob:front"
        activeCategoryId="brandName"
        regions={[]}
        workingRegion={null}
        machineRegions={[]}
        activeRegionId={null}
        onActiveRegionChange={vi.fn()}
        onWorkingRegionChange={vi.fn()}
        onWorkingRegionDiscard={vi.fn()}
        onPanelRotationChange={onPanelRotationChange}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.keyDown(screen.getByTestId("annotation-workspace"), { key: "ArrowRight" });
    expect(screen.getByTestId("annotation-workspace")).toHaveAttribute("data-zoom", "1.25");
    expect(screen.getByTestId("annotation-workspace")).toHaveAttribute("data-pan-x", "-48");

    fireEvent.click(screen.getByRole("button", { name: "Reset view" }));
    expect(screen.getByTestId("annotation-workspace")).toHaveAttribute("data-zoom", "1.00");
    expect(screen.getByTestId("annotation-workspace")).toHaveAttribute("data-pan-x", "0");
    expect(onPanelRotationChange).not.toHaveBeenCalled();
  });

  it("fits a newly opened panel and restores each panel-specific view", async () => {
    const props = {
      activeCategoryId: "brandName" as const,
      regions: [] as SellerEvidenceRegion[],
      workingRegion: null,
      machineRegions: [],
      activeRegionId: null,
      onActiveRegionChange: vi.fn(),
      onWorkingRegionChange: vi.fn(),
      onWorkingRegionDiscard: vi.fn(),
      onPanelRotationChange: vi.fn(),
    };
    const { rerender } = render(
      <PackageAnnotationCanvas panel={panel} imageUrl="blob:front" {...props} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByTestId("annotation-workspace")).toHaveAttribute("data-zoom", "1.25");

    const backPanel: PackagePanelMetadata = {
      ...panel,
      panelId: "back-panel",
      role: "back",
      displayName: "back.png",
      width: 1500,
      height: 1000,
    };
    rerender(<PackageAnnotationCanvas panel={backPanel} imageUrl="blob:back" {...props} />);
    await waitFor(() =>
      expect(screen.getByTestId("annotation-workspace")).toHaveAttribute("data-zoom", "1.00"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByTestId("annotation-workspace")).toHaveAttribute("data-zoom", "1.50");

    rerender(<PackageAnnotationCanvas panel={panel} imageUrl="blob:front" {...props} />);
    await waitFor(() =>
      expect(screen.getByTestId("annotation-workspace")).toHaveAttribute("data-zoom", "1.25"),
    );
  });

  it("recomputes the fitted size after a responsive resize without shifting normalized regions", async () => {
    render(
      <PackageAnnotationCanvas
        panel={panel}
        imageUrl="blob:front"
        activeCategoryId="brandName"
        regions={[workingRegion]}
        workingRegion={null}
        machineRegions={[]}
        activeRegionId={workingRegion.regionId}
        onActiveRegionChange={vi.fn()}
        onWorkingRegionChange={vi.fn()}
        onWorkingRegionDiscard={vi.fn()}
        onPanelRotationChange={vi.fn()}
      />,
    );
    const viewport = screen.getByTestId("package-image-viewport");
    vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
      width: 500,
      height: 400,
      x: 0,
      y: 0,
      top: 0,
      right: 500,
      bottom: 400,
      left: 0,
      toJSON: () => ({}),
    });
    const region = document.querySelector(`[data-region-id="${workingRegion.regionId}"] rect`);
    expect(region).toHaveAttribute("x", "0.1");
    expect(region).toHaveAttribute("y", "0.2");

    fireEvent(window, new Event("resize"));

    await waitFor(() =>
      expect(screen.getByRole("img", { name: /label annotation image/i })).toHaveAttribute(
        "data-fit-height",
        "368.00",
      ),
    );
    expect(region).toHaveAttribute("x", "0.1");
    expect(region).toHaveAttribute("y", "0.2");
  });
});
