import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AnalyzerFieldObservation } from "@/pipeline/analyzer/analyzer.types";
import type { ResultObservations } from "@/pipeline/result/result.types";

import { EvidencePanel } from "./EvidencePanel";

const geometry = (x: number, y: number, w: number, h: number) => ({
  imageIndex: 0,
  x,
  y,
  width: w,
  height: h,
  imageWidth: 1000,
  imageHeight: 500,
});

const candidate = (
  value: string,
  score: number,
  geometryOverride?: ReturnType<typeof geometry>,
): AnalyzerFieldObservation["alternates"][number] => ({
  value,
  confidence: score,
  ocrEvidenceScore: score,
  ocrConfidence: {
    aggregation: "mean",
    rawScale: "0-100",
    rawTokenConfidences: [Math.round(score * 100)],
    rawMean: Math.round(score * 100),
    rawMin: Math.round(score * 100),
    rawMax: Math.round(score * 100),
    missingTokenCount: 0,
  },
  candidateProvenance: {
    passId: `pass-${value}`,
    passKind: "full-image-primary",
    triggerReasons: ["primary-pass"],
    preprocessing: ["grayscale"],
    regionName: "brand",
    supportingPassIds: [`pass-${value}`],
    supportingPassKinds: ["full-image-primary"],
    recoveryPassUsed: false,
  },
  ranking: {
    strategy: "brand-mixed-prominence-score",
    orderingMode: "score-first",
    comparator: [
      { id: "score-eligibility", direction: "desc", value: true },
      { id: "ranking-score", direction: "desc", value: 5 },
      { id: "prominence", direction: "desc", value: 30 },
      { id: "ocr-evidence-score", direction: "desc", value: score },
      { id: "normalized-value-key", direction: "asc", value: value.toLowerCase() },
    ],
    rankingScore: 5,
    scoreFactors: [
      { id: "positive-signal", value: 1, contribution: 2, direction: "benefit" },
      { id: "ocr-evidence-score", value: score, contribution: score, direction: "benefit" },
    ],
  },
  ...(geometryOverride ? { geometry: geometryOverride } : {}),
});

const obs = (over: Partial<AnalyzerFieldObservation> = {}): AnalyzerFieldObservation => ({
  state: "OBSERVED",
  value: "VALUE",
  rawText: "VALUE",
  confidence: 0.9,
  ocrEvidenceScore: 0.9,
  alternates: [],
  ...over,
});

function observations(
  brand: AnalyzerFieldObservation,
  alcohol: AnalyzerFieldObservation,
): ResultObservations {
  return {
    provenance: {
      artifactRef: "a",
      derivativeSha256: "b".repeat(64),
      extractionAdapterId: "local-two-field-extractor",
      extractionAdapterVersion: "1.0.0",
      ocrEngine: { kind: "ocr", engineId: "tesseract.js", engineVersion: "7.0.0" },
      parserId: "wine-alcohol-parse",
      parserVersion: "1.0.0",
      processedAt: "t",
    },
    brandName: brand,
    alcoholStatement: alcohol,
  };
}

const PREVIEW = { url: "blob:preview", name: "label.png" };

const BRAND = obs({
  state: "AMBIGUOUS",
  value: "STONE HOUSE",
  geometry: geometry(100, 50, 200, 100),
  alternates: [
    candidate("STONE", 0.7, geometry(120, 60, 80, 40)),
    candidate("HOUSE RED", 0.55),
    candidate("ALT-3", 0.5),
    candidate("ALT-4", 0.45),
    candidate("ALT-5", 0.4),
    candidate("ALT-6", 0.35),
    candidate("ALT-7", 0.3),
  ],
});
const ALCOHOL = obs({ value: "12.5% ALC./VOL.", geometry: geometry(600, 400, 300, 50) });

describe("evidence overlays", () => {
  it("positions overlays by percentage of the server geometry frame", () => {
    render(<EvidencePanel observations={observations(BRAND, ALCOHOL)} previewImage={PREVIEW} />);
    const brandOverlay = screen.getByRole("button", { name: /brand evidence region/i });
    expect(brandOverlay.style.left).toBe("10%");
    expect(brandOverlay.style.top).toBe("10%");
    expect(brandOverlay.style.width).toBe("20%");
    expect(brandOverlay.style.height).toBe("20%");
    const alcoholOverlay = screen.getByRole("button", { name: /alcohol evidence region/i });
    expect(alcoholOverlay.style.left).toBe("60%");
    expect(alcoholOverlay.style.top).toBe("80%");
  });

  it("distinguishes brand and alcohol by data-field (border style + text chip, not color alone)", () => {
    render(<EvidencePanel observations={observations(BRAND, ALCOHOL)} previewImage={PREVIEW} />);
    const brandOverlay = screen.getByRole("button", { name: /brand evidence region/i });
    const alcoholOverlay = screen.getByRole("button", { name: /alcohol evidence region/i });
    expect(brandOverlay).toHaveAttribute("data-field", "brand");
    expect(alcoholOverlay).toHaveAttribute("data-field", "alcohol");
    // Each overlay carries a visible text chip naming the field.
    expect(brandOverlay.textContent).toMatch(/brand/i);
    expect(alcoholOverlay.textContent).toMatch(/alcohol/i);
  });

  it("card 'View on label' highlights and focuses the matching region", async () => {
    render(<EvidencePanel observations={observations(BRAND, ALCOHOL)} previewImage={PREVIEW} />);
    // The first "View on label" is the brand card's locate control.
    fireEvent.click(screen.getAllByRole("button", { name: /view on label/i })[0]);
    const overlay = screen.getByRole("button", { name: /brand evidence region/i });
    await waitFor(() => expect(overlay).toHaveAttribute("data-active", "true"));
    await waitFor(() => expect(overlay).toHaveFocus());
  });

  it("activating a region focuses the corresponding evidence card", async () => {
    render(<EvidencePanel observations={observations(BRAND, ALCOHOL)} previewImage={PREVIEW} />);
    fireEvent.click(screen.getByRole("button", { name: /alcohol evidence region/i }));
    // Target the card's own title (dt), not the live-region announcement text.
    const title = screen.getByText("Detected alcohol", { selector: "dt" });
    const card = title.closest("[tabindex]") as HTMLElement;
    await waitFor(() => expect(card).toHaveFocus());
  });

  it("renders in dark mode state without losing the overlay structure", () => {
    document.documentElement.setAttribute("data-theme", "dark");
    render(<EvidencePanel observations={observations(BRAND, ALCOHOL)} previewImage={PREVIEW} />);
    expect(screen.getByRole("button", { name: /brand evidence region/i }).className).toContain(
      "evidence-overlay",
    );
  });

  it("uses a responsive two-column grid that stacks on small screens", () => {
    const { container } = render(
      <EvidencePanel observations={observations(BRAND, ALCOHOL)} previewImage={PREVIEW} />,
    );
    expect(container.firstElementChild?.className).toMatch(/md:grid-cols-/);
  });
});

describe("honest fallbacks", () => {
  it("shows a no-location note when a field has no coordinates", () => {
    const noGeo = obs({ value: "12.5%", geometry: undefined });
    render(<EvidencePanel observations={observations(BRAND, noGeo)} previewImage={PREVIEW} />);
    expect(screen.getByText(/no location coordinates were reported/i)).toBeInTheDocument();
    // Only the brand overlay exists.
    expect(screen.queryByRole("button", { name: /alcohol evidence region/i })).toBeNull();
  });

  it("shows an honest no-preview state for the server-side sample run", () => {
    render(<EvidencePanel observations={observations(BRAND, ALCOHOL)} previewImage={null} />);
    expect(screen.getByText(/no image preview for this run/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /evidence region/i })).toBeNull();
    // Coordinates exist but cannot be shown; the card says so honestly.
    expect(
      screen.getAllByText(/no local preview is available to show them on/i).length,
    ).toBeGreaterThan(0);
  });
});

describe("alternates are inspect-only", () => {
  it("presents bounded candidate rows behind a disclosure with OCR evidence scores", () => {
    render(<EvidencePanel observations={observations(BRAND, ALCOHOL)} previewImage={PREVIEW} />);
    const summary = screen.getByText(/7 other candidate readings/i);
    fireEvent.click(summary);
    expect(screen.getByText("STONE")).toBeInTheDocument();
    expect(screen.getByText(/OCR evidence 0.70/i)).toBeInTheDocument();
    // Bounded: only the first five rows visible until "Show all".
    expect(screen.queryByText("ALT-6")).toBeNull();
    const showAll = screen.getByRole("button", { name: /show all 7 candidates/i });
    expect(showAll).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(showAll);
    expect(screen.getByText("ALT-6")).toBeInTheDocument();
    expect(screen.getByText("ALT-7")).toBeInTheDocument();
  });

  it("inspecting a candidate highlights it without changing the selected machine result", () => {
    render(<EvidencePanel observations={observations(BRAND, ALCOHOL)} previewImage={PREVIEW} />);
    fireEvent.click(screen.getByText(/7 other candidate readings/i));
    // Only the candidate with geometry offers "View on label"; click that row's control.
    const stoneRow = screen.getByText("STONE").closest("li") as HTMLElement;
    fireEvent.click(within(stoneRow).getByRole("button", { name: /view on label/i }));

    // A candidate overlay appears and is announced as inspection-only.
    expect(
      screen.getByRole("img", { name: /candidate reading location: STONE/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/inspecting candidate/i)).toBeInTheDocument();
    // The selected machine reading is unchanged and no confirm control exists.
    expect(screen.getAllByText("STONE HOUSE").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /confirm/i })).toBeNull();

    // The highlight can be cleared.
    fireEvent.click(screen.getByRole("button", { name: /clear candidate highlight/i }));
    expect(screen.queryByRole("img", { name: /candidate reading location/i })).toBeNull();
  });

  it("keeps the canonical machine state visible as technical detail", () => {
    render(<EvidencePanel observations={observations(BRAND, ALCOHOL)} previewImage={PREVIEW} />);
    expect(screen.getByText(/machine state: AMBIGUOUS/)).toBeInTheDocument();
    expect(screen.getByText(/machine state: OBSERVED/)).toBeInTheDocument();
  });
});
