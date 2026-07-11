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
  humanDispositionHistory: [],
  report: {
    html: "<!doctype html><html><body>report</body></html>",
    filename: "label-lens-wine-precheck-precheck-result.v1-" + "a".repeat(64) + ".html",
  },
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
    expect(screen.getAllByText(/brand-name-check/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/wine-alcohol-check/).length).toBeGreaterThan(0);

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

// A result carrying one appended disposition entry, as the disposition endpoint
// would return it (machine findings unchanged; history + exports refreshed).
const CANNED_WITH_HISTORY: PrecheckServiceResponse = {
  ...CANNED,
  humanDispositionHistory: [
    {
      dispositionId: "disposition-1",
      sequence: 1,
      actorId: "reviewer-9",
      recordedAt: "2026-07-11T12:00:00Z",
      decision: "escalated_for_human_review",
      reasonCode: "NEEDS_SECOND_LOOK",
      note: "Brand mark unclear.",
    },
  ],
  report: {
    html: "<!doctype html><html><body>report with history</body></html>",
    filename: CANNED.report.filename,
  },
};

/** Route fetch by URL: pre-check vs. disposition append. */
function routedFetch() {
  return vi.fn((url: string) => {
    const data = String(url).includes("/disposition") ? CANNED_WITH_HISTORY : CANNED;
    return Promise.resolve({ ok: true, json: async () => ({ ok: true, data }) } as Response);
  });
}

async function runPrecheckToResult() {
  selectFileAndFill();
  fireEvent.click(screen.getByRole("button", { name: /run pre-check/i }));
  await screen.findByRole("heading", { name: /pre-check result/i });
}

describe("PrecheckWorkspace — human disposition", () => {
  it("shows no disposition form before a successful pre-check", () => {
    render(<PrecheckWorkspace />);
    expect(screen.queryByRole("heading", { name: /human disposition/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /record disposition/i })).toBeNull();
  });

  it("reveals a labeled, keyboard-operable disposition form after a pre-check", async () => {
    vi.stubGlobal("fetch", routedFetch());
    render(<PrecheckWorkspace />);
    await runPrecheckToResult();

    expect(screen.getByRole("heading", { name: /human disposition/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/operator identifier/i)).toBeInTheDocument();
    const decision = screen.getByLabelText(/decision/i) as HTMLSelectElement;
    expect(decision.tagName).toBe("SELECT");
    expect(screen.getByLabelText(/reason code/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/note \(optional\)/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /record disposition/i })).toBeInTheDocument();
    // Only bounded internal-workflow decisions are offered.
    const options = within(decision)
      .getAllByRole("option")
      .map((o) => (o as HTMLOptionElement).value);
    expect(options).toContain("escalated_for_human_review");
    expect(options).not.toContain("approved");
    expect(options).not.toContain("rejected");
  });

  it("appends a disposition through the disposition endpoint without rerunning OCR", async () => {
    const fetchMock = routedFetch();
    vi.stubGlobal("fetch", fetchMock);
    render(<PrecheckWorkspace />);
    await runPrecheckToResult();

    fireEvent.change(screen.getByLabelText(/operator identifier/i), {
      target: { value: "reviewer-9" },
    });
    fireEvent.change(screen.getByLabelText(/reason code/i), {
      target: { value: "NEEDS_SECOND_LOOK" },
    });
    fireEvent.click(screen.getByRole("button", { name: /record disposition/i }));

    // History entry appears; findings remain rendered unchanged.
    const historyEntry = await screen.findByText(/Sequence 1:/i);
    expect(historyEntry).toHaveTextContent(/escalated for human review/i);
    expect(screen.getByText(/reviewer-9/)).toBeInTheDocument();
    expect(screen.getAllByText(/wine-alcohol-syntax/).length).toBeGreaterThan(0);

    // Success is announced and the append hit the disposition endpoint (not OCR).
    expect(await screen.findByText(/disposition recorded/i)).toBeInTheDocument();
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls).toContain("/api/precheck/disposition");
    const dispositionCall = fetchMock.mock.calls.find((c) =>
      String(c[0]).includes("/disposition"),
    ) as unknown as [string, RequestInit];
    // The client submits the canonical export it received; no findings field.
    const body = JSON.parse(dispositionCall[1].body as string);
    expect(body.exportJson).toBe(CANNED.exportJson);
    expect(body.findings).toBeUndefined();
  });

  it("offers distinct JSON and readable-report downloads with deterministic names", async () => {
    vi.stubGlobal("fetch", routedFetch());
    render(<PrecheckWorkspace />);
    await runPrecheckToResult();

    const jsonBtn = screen.getByRole("button", { name: /download json export/i });
    const reportBtn = screen.getByRole("button", { name: /download readable report/i });
    expect(jsonBtn).toBeInTheDocument();
    expect(reportBtn).toBeInTheDocument();
    expect(jsonBtn).not.toBe(reportBtn);
    expect(screen.getByText(CANNED.report.filename)).toBeInTheDocument();
    expect(screen.getByText(CANNED.suggestedFilename)).toBeInTheDocument();
    expect(CANNED.report.filename).toMatch(/\.html$/);
  });

  it("has no edit or delete control and no approval/rejection language", async () => {
    vi.stubGlobal("fetch", routedFetch());
    render(<PrecheckWorkspace />);
    await runPrecheckToResult();

    expect(screen.queryByRole("button", { name: /edit|delete|remove/i })).toBeNull();
    expect(
      screen.queryByText(/\b(Approved|Rejected|Compliant|Noncompliant|Official decision)\b/),
    ).toBeNull();
    // The separation between machine findings and human disposition is stated.
    expect(screen.getByText(/does not change the automated findings/i)).toBeInTheDocument();
    expect(screen.getByText(/does not represent a TTB action/i)).toBeInTheDocument();
  });

  it("shows an accessible error and does not append on a server rejection", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (String(url).includes("/disposition")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              ok: false,
              error: { code: "INVALID_DISPOSITION", message: "Enter a reason code." },
            }),
          } as Response);
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, data: CANNED }),
        } as Response);
      }),
    );
    render(<PrecheckWorkspace />);
    await runPrecheckToResult();

    fireEvent.change(screen.getByLabelText(/operator identifier/i), {
      target: { value: "reviewer-9" },
    });
    fireEvent.change(screen.getByLabelText(/reason code/i), { target: { value: "R" } });
    fireEvent.click(screen.getByRole("button", { name: /record disposition/i }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/reason code/i)).toBeInTheDocument();
    // No history entry was added.
    expect(screen.queryByText(/Sequence 1:/i)).toBeNull();
  });
});
