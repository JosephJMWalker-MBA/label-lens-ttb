import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PrecheckServiceResponse } from "@/server/precheck-service.types";

import { PrecheckWorkspace } from "./PrecheckWorkspace";

function finding(
  ruleId: string,
  findingStatus: string,
  execution: string,
  extra: Record<string, unknown> = {},
) {
  return {
    ruleId,
    ruleVersion: "1.0.0",
    profileId: "wine-precheck",
    profileVersion: "1.0.0",
    authority: { citation: "27 CFR 4.36", snapshotDate: "2026-07-10" },
    findingStatus,
    ruleExecutionStatus: execution,
    evidenceReferences: [],
    message: `${ruleId} message`,
    ...extra,
  };
}

const CANNED: PrecheckServiceResponse = {
  machineResultId: "precheck-result.v1-" + "a".repeat(64),
  profile: { id: "wine-precheck", version: "1.0.0" },
  advisoryNotice: {
    noticeId: "precheck-advisory-notice",
    noticeVersion: "1.0.0",
    text: "This result is an automated pre-submission aid. It is not a TTB approval, legal opinion, or official regulatory disposition.",
  },
  declaredFacts: {
    applicationBrandName: {
      value: "M CELLARS",
      provenance: {
        sourceType: "operator-entered",
        sourceReference: "web",
        recordedBy: "op",
        recordedAt: "t",
      },
    },
    applicationAlcoholValue: {
      value: "12.5",
      provenance: {
        sourceType: "operator-entered",
        sourceReference: "web",
        recordedBy: "op",
        recordedAt: "t",
      },
    },
  },
  observations: {
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
    brandName: {
      state: "OBSERVED",
      value: "M CELLARS",
      rawText: "M CELLARS",
      confidence: 0.93,
      geometry: {
        imageIndex: 0,
        x: 10,
        y: 20,
        width: 100,
        height: 30,
        imageWidth: 2404,
        imageHeight: 979,
      },
      alternates: [],
    },
    alcoholStatement: {
      state: "OBSERVED",
      value: "12.5% ALC./VOL.",
      rawText: "12.5% ALC./VOL.",
      confidence: 0.91,
      geometry: {
        imageIndex: 0,
        x: 30,
        y: 40,
        width: 50,
        height: 200,
        imageWidth: 2404,
        imageHeight: 979,
      },
      alternates: [],
    },
  },
  evidenceAssessments: [
    {
      checkId: "brand-name-check",
      evidenceStatus: "sufficient",
      reasonCode: "BRAND_OBSERVATION_PRESENT",
    },
    {
      checkId: "wine-alcohol-check",
      evidenceStatus: "sufficient",
      reasonCode: "ALCOHOL_OBSERVATION_PRESENT",
    },
  ],
  findings: [
    finding("wine-alcohol-syntax", "PASS", "executed"),
    finding("brand-name-canonical-comparison", "PASS", "executed"),
    finding("wine-alcohol-declared-comparison", "PASS", "executed"),
    finding("wine-alcohol-actual-content-tolerance", "not_run", "not_run_external_dependency", {
      externalEvidenceDependency: "actual alcohol content with provenance",
    }),
    finding("wine-alcohol-class-type-boundary", "not_run", "not_run_external_dependency", {
      externalEvidenceDependency: "class/type or taxable-boundary evidence",
    }),
    finding("wine-alcohol-omission-eligibility", "not_run", "not_run_external_dependency", {
      externalEvidenceDependency: "table/light-wine designation evidence",
    }),
  ] as PrecheckServiceResponse["findings"],
  suggestedFilename: "label-lens-wine-precheck-precheck-result.v1-" + "a".repeat(64) + ".json",
  exportJson: '{"exportType":"wine-precheck-result"}',
  file: { displayName: "label.jpeg", mediaType: "image/jpeg", byteSize: 123, source: "upload" },
};

function mockFetch(response: unknown, ok = true) {
  return vi.fn().mockResolvedValue({ ok, json: async () => response } as Response);
}

function selectFileAndFill() {
  const file = new File([new Uint8Array([1, 2, 3])], "label.jpeg", { type: "image/jpeg" });
  const input = screen.getByLabelText(/select one label image/i) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText(/application brand name/i), {
    target: { value: "M CELLARS" },
  });
  fireEvent.change(screen.getByLabelText(/application alcohol value/i), {
    target: { value: "12.5" },
  });
}

afterEach(() => vi.restoreAllMocks());

describe("PrecheckWorkspace — form & accessibility", () => {
  it("labels every input and accepts only one file", () => {
    render(<PrecheckWorkspace />);
    const fileInput = screen.getByLabelText(/select one label image/i) as HTMLInputElement;
    expect(fileInput).toBeInTheDocument();
    expect(fileInput.multiple).toBe(false);
    expect(screen.getByLabelText(/application brand name/i)).toBeRequired();
    expect(screen.getByLabelText(/application alcohol value/i)).toBeRequired();
  });

  it("shows the advisory boundary and no government-approval language", () => {
    render(<PrecheckWorkspace />);
    expect(screen.getByText(/not a TTB approval/i)).toBeInTheDocument();
    expect(
      screen.queryByText(/\bApproved\b|\bRejected\b|\bCompliant\b|Official result|Certification/),
    ).toBeNull();
  });
});

describe("PrecheckWorkspace — run & results", () => {
  it("announces processing and renders results in registry order", async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    const deferred = new Promise((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockReturnValue(
          deferred.then(() => ({ ok: true, json: async () => ({ ok: true, data: CANNED }) })),
        ),
    );
    render(<PrecheckWorkspace />);
    selectFileAndFill();
    fireEvent.click(screen.getByRole("button", { name: /run pre-check/i }));

    // Processing announced via a live region while the request is in flight.
    expect(
      await screen.findByText(/extracting evidence and evaluating checks/i),
    ).toBeInTheDocument();

    resolveFetch(undefined);
    await screen.findByRole("heading", { name: /pre-check result/i });

    // Independent evidence assessments.
    expect(screen.getByText(/brand-name-check/)).toBeInTheDocument();
    expect(screen.getByText(/wine-alcohol-check/)).toBeInTheDocument();

    // Observation detail is shown.
    expect(screen.getAllByText(/12.5% ALC\.\/VOL\./).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2404×979/).length).toBeGreaterThan(0);

    // Findings in exact registry order.
    const order = screen
      .getAllByText(
        /wine-alcohol-syntax|brand-name-canonical-comparison|wine-alcohol-declared-comparison|wine-alcohol-actual-content-tolerance|wine-alcohol-class-type-boundary|wine-alcohol-omission-eligibility/,
      )
      .map((el) => el.textContent);
    const firstOccurrence = [
      "wine-alcohol-syntax",
      "brand-name-canonical-comparison",
      "wine-alcohol-declared-comparison",
      "wine-alcohol-actual-content-tolerance",
      "wine-alcohol-class-type-boundary",
      "wine-alcohol-omission-eligibility",
    ].map((id) => order.findIndex((t) => t === id));
    expect(firstOccurrence).toEqual([...firstOccurrence].sort((a, b) => a - b));

    // Authority + versions visible; external dependency explained.
    expect(screen.getAllByText(/27 CFR 4\.36/).length).toBeGreaterThan(0);
    expect(screen.getByText(/actual alcohol content with provenance/)).toBeInTheDocument();
    expect(screen.getAllByText(/External evidence required/i).length).toBe(3);

    // No government-approval verdicts or aggregate score are shown.
    expect(screen.queryByText(/\b(Approved|Compliant|Noncompliant|Official result)\b/)).toBeNull();
    expect(
      screen.queryByText(/compliance percentage|readiness score|certification score/i),
    ).toBeNull();
  });

  it("downloads the exact server export text under the deterministic filename", async () => {
    vi.stubGlobal("fetch", mockFetch({ ok: true, data: CANNED }));
    const captured: { text: string; type: string }[] = [];
    const RealBlob = global.Blob;
    vi.stubGlobal(
      "Blob",
      class extends RealBlob {
        constructor(parts: BlobPart[], options?: BlobPropertyBag) {
          super(parts, options);
          captured.push({ text: (parts as string[]).join(""), type: options?.type ?? "" });
        }
      },
    );
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:x", revokeObjectURL: () => {} });
    const created: HTMLAnchorElement[] = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreate(tag);
      if (tag === "a") created.push(el as HTMLAnchorElement);
      return el;
    });

    render(<PrecheckWorkspace />);
    selectFileAndFill();
    fireEvent.click(screen.getByRole("button", { name: /run pre-check/i }));
    await screen.findByRole("heading", { name: /pre-check result/i });

    fireEvent.click(screen.getByRole("button", { name: /download json export/i }));

    const anchor = created.find((a) => a.download);
    expect(anchor?.download).toBe(CANNED.suggestedFilename);
    expect(captured).toHaveLength(1);
    expect(captured[0].type).toBe("application/json");
    expect(captured[0].text).toBe(CANNED.exportJson);
  });

  it("shows an accessible error and does not fabricate a result on failure", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch(
        { ok: false, error: { code: "CORRUPT_IMAGE", message: "The image could not be read." } },
        true,
      ),
    );
    render(<PrecheckWorkspace />);
    selectFileAndFill();
    fireEvent.click(screen.getByRole("button", { name: /run pre-check/i }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/could not be read/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /pre-check result/i })).toBeNull();
  });
});

describe("PrecheckWorkspace — demo fixture", () => {
  it("labels the sample control as a bundled demonstration fixture", () => {
    render(<PrecheckWorkspace />);
    expect(
      screen.getByRole("button", { name: /load verified m cellars sample/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/bundled demonstration fixture/i)).toBeInTheDocument();
    expect(screen.getByText(/does not inject prepared results/i)).toBeInTheDocument();
  });

  it("runs the sample through the server with source=sample (no injected analyzer output)", async () => {
    const fetchMock = mockFetch({ ok: true, data: CANNED });
    vi.stubGlobal("fetch", fetchMock);
    render(<PrecheckWorkspace />);
    fireEvent.click(screen.getByRole("button", { name: /load verified m cellars sample/i }));
    await screen.findByRole("heading", { name: /pre-check result/i });

    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get("source")).toBe("sample");
    expect(body.get("brand")).toBe("M CELLARS");
    expect(body.has("file")).toBe(false);
  });
});
