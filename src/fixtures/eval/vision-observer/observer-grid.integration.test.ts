import { describe, expect, it } from "vitest";

import { loadBenchmarkCases } from "../ocr-region-benchmark";
import { loadCaseImage, loadEvalManifest } from "../eval-loader";

import { normalizedBoxContains, unionNormalizedBoxes } from "./observer-grid-transform";
import { runFakeObserverLifecycle } from "./observer-lifecycle";

function benchmarkCase(caseId: string) {
  const manifest = loadEvalManifest();
  const found = loadBenchmarkCases(manifest).find(
    (candidate) => candidate.evalCase.caseId === caseId,
  );
  if (!found) throw new Error(`missing benchmark case ${caseId}`);
  return found;
}

describe("observer grid lifecycle integration", () => {
  it("bridges a horizontal brand region from grid cells back to original coordinates", () => {
    const selected = benchmarkCase("approved-wine-013");
    const loadedImage = loadCaseImage(selected.evalCase);
    const result = runFakeObserverLifecycle({
      caseId: selected.evalCase.caseId,
      sourceBytes: loadedImage.bytes,
      sourceMediaType: selected.record.image.mediaType,
      sourceWidth: selected.record.image.width,
      sourceHeight: selected.record.image.height,
      fields: [{ field: "brand", truthGeometry: [selected.annotation.fields.brand!.geometry] }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.derivative.mediaType).toBe("image/svg+xml");
    expect(result.value.derivative.width).toBe(selected.record.image.width);
    expect(result.value.derivative.height).toBe(selected.record.image.height);
    expect(result.value.derivative.transform.sourceCrop).toBe("none");
    expect(result.value.observerProposals).toHaveLength(1);
    expect(result.value.canonicalProposals).toHaveLength(1);

    const truth = unionNormalizedBoxes([selected.annotation.fields.brand!.geometry]);
    const canonical = result.value.canonicalProposals[0];
    expect(normalizedBoxContains(canonical.normalizedBox, truth)).toBe(true);
    expect(canonical.pixelBox.imageWidth).toBe(selected.record.image.width);
    expect(canonical.pixelBox.imageHeight).toBe(selected.record.image.height);
  });

  it("bridges a rotated alcohol region without cropping and skips absent fields", () => {
    const rotatedRecord = benchmarkCase("la-fattoria-rotated");
    const rotatedImage = loadCaseImage(rotatedRecord.evalCase);
    const rotated = runFakeObserverLifecycle({
      caseId: rotatedRecord.evalCase.caseId,
      sourceBytes: rotatedImage.bytes,
      sourceMediaType: rotatedRecord.record.image.mediaType,
      sourceWidth: rotatedRecord.record.image.width,
      sourceHeight: rotatedRecord.record.image.height,
      fields: [
        { field: "alcohol", truthGeometry: [rotatedRecord.annotation.fields.alcohol!.geometry] },
      ],
    });

    expect(rotated.ok).toBe(true);
    if (!rotated.ok) return;

    expect(rotated.value.observerProposals).toHaveLength(1);
    expect(rotated.value.canonicalProposals[0].field).toBe("alcohol");
    const truth = unionNormalizedBoxes([rotatedRecord.annotation.fields.alcohol!.geometry]);
    expect(normalizedBoxContains(rotated.value.canonicalProposals[0].normalizedBox, truth)).toBe(
      true,
    );

    const absentBrandRecord = benchmarkCase("approved-wine-022");
    const absentImage = loadCaseImage(absentBrandRecord.evalCase);
    const absent = runFakeObserverLifecycle({
      caseId: absentBrandRecord.evalCase.caseId,
      sourceBytes: absentImage.bytes,
      sourceMediaType: absentBrandRecord.record.image.mediaType,
      sourceWidth: absentBrandRecord.record.image.width,
      sourceHeight: absentBrandRecord.record.image.height,
      fields: [{ field: "brand", truthGeometry: [] }],
    });

    expect(absent.ok).toBe(true);
    expect(absent.ok && absent.value.observerProposals).toHaveLength(0);
    expect(absent.ok && absent.value.canonicalProposals).toHaveLength(0);
  });
});
