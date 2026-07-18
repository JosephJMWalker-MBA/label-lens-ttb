import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PackageAnnotationCanvas } from "./PackageAnnotationCanvas";
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
  it("applies keyboard coordinates to the ephemeral box without committing seller evidence", () => {
    const onWorkingRegionChange = vi.fn();
    const onRegionCommit = vi.fn();
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
        onRegionCommit={onRegionCommit}
        onRegionRemove={vi.fn()}
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
    expect(onRegionCommit).not.toHaveBeenCalled();
    expect(screen.getByText(/working coordinates updated.*accept to save/i)).toBeInTheDocument();
  });

  it("discards only the uncommitted box", () => {
    const onWorkingRegionDiscard = vi.fn();
    const onRegionRemove = vi.fn();
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
        onRegionCommit={vi.fn()}
        onRegionRemove={onRegionRemove}
        onWorkingRegionChange={vi.fn()}
        onWorkingRegionDiscard={onWorkingRegionDiscard}
        onPanelRotationChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Discard working box" }));
    expect(onWorkingRegionDiscard).toHaveBeenCalledTimes(1);
    expect(onRegionRemove).not.toHaveBeenCalled();
  });
});
