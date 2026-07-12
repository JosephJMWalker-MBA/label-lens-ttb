import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  appendToken: "f".repeat(64),
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

  it("clarifies application facts are not OCR and shows no government-approval language", () => {
    render(<PrecheckWorkspace />);
    // The application facts are explained as operator-entered, not extracted.
    expect(screen.getByText(/not read from the image by OCR/i)).toBeInTheDocument();
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
    expect(await screen.findByText(/analyzing label evidence/i)).toBeInTheDocument();

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

    // Authority + versions visible (in the technical/checks disclosures, still in DOM).
    expect(screen.getAllByText(/27 CFR 4\.36/).length).toBeGreaterThan(0);
    // Not-run checks are grouped under a single shared explanation, not repeated
    // per rule, but each specific dependency is preserved.
    expect(screen.getByText(/cannot be established from label artwork alone/i)).toBeInTheDocument();
    expect(screen.getByText(/actual alcohol content with provenance/)).toBeInTheDocument();
    expect(screen.getByText(/class\/type or taxable-boundary evidence/)).toBeInTheDocument();
    expect(screen.getByText(/table\/light-wine designation evidence/)).toBeInTheDocument();
    // The three not-run rules are grouped under the shared heading.
    expect(
      screen.getByRole("heading", { name: /additional evidence-dependent checks/i }),
    ).toBeInTheDocument();

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
    // The client carries the opaque server-issued append token back verbatim.
    expect(body.appendToken).toBe(CANNED.appendToken);
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

  it("collapses the disposition form by default beneath a disclosure", async () => {
    vi.stubGlobal("fetch", routedFetch());
    render(<PrecheckWorkspace />);
    await runPrecheckToResult();

    // The full operator form is inside a collapsed disclosure, not directly under
    // the first summary. Its content stays in the DOM (reachable).
    const dispositionDetails = screen
      .getByText("Record internal disposition")
      .closest("details") as HTMLDetailsElement;
    expect(dispositionDetails.open).toBe(false);
    expect(screen.getByRole("heading", { name: /human disposition/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/operator identifier/i)).toBeInTheDocument();
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

// -- Image preview (local object URL lifecycle) ---------------------------------

function stubObjectUrls() {
  const created: string[] = [];
  const revoked: string[] = [];
  let n = 0;
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => {
      const url = `blob:preview-${++n}`;
      created.push(url);
      return url;
    }),
    revokeObjectURL: vi.fn((url: string) => revoked.push(url)),
  });
  return { created, revoked };
}

function selectImage(name = "label.jpeg", type = "image/jpeg") {
  const file = new File([new Uint8Array([1, 2, 3])], name, { type });
  const input = screen.getByLabelText(/select one label image/i) as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

describe("PrecheckWorkspace — image preview", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows a local preview with filename, type, and size after selecting a file", async () => {
    const { created } = stubObjectUrls();
    render(<PrecheckWorkspace />);
    selectImage("my-label.png", "image/png");

    const img = await screen.findByAltText(/preview of the selected label image: my-label\.png/i);
    expect(img).toHaveAttribute("src", created[0]);
    expect(screen.getByText("my-label.png")).toBeInTheDocument();
    expect(screen.getByText(/image\/png/)).toBeInTheDocument();
    // No automatic upload was triggered by selecting the file.
    expect(screen.queryByRole("heading", { name: /pre-check result/i })).toBeNull();
  });

  it("replaces the preview and revokes the previous object URL when the file changes", async () => {
    const { created, revoked } = stubObjectUrls();
    render(<PrecheckWorkspace />);
    selectImage("first.jpeg");
    await screen.findByAltText(/first\.jpeg/i);
    selectImage("second.jpeg");
    await screen.findByAltText(/second\.jpeg/i);

    expect(created).toHaveLength(2);
    expect(revoked).toContain(created[0]);
    expect(screen.queryByAltText(/first\.jpeg/i)).toBeNull();
  });

  it("clears the preview and revokes its object URL on Clear image", async () => {
    const { created, revoked } = stubObjectUrls();
    render(<PrecheckWorkspace />);
    selectImage("gone.jpeg");
    await screen.findByAltText(/gone\.jpeg/i);

    fireEvent.click(screen.getByRole("button", { name: /clear image/i }));
    expect(screen.queryByAltText(/gone\.jpeg/i)).toBeNull();
    expect(revoked).toContain(created[0]);
  });

  it("revokes the object URL on unmount (no leak)", async () => {
    const { created, revoked } = stubObjectUrls();
    const { unmount } = render(<PrecheckWorkspace />);
    selectImage("leak.jpeg");
    await screen.findByAltText(/leak\.jpeg/i);
    act(() => unmount());
    expect(revoked).toContain(created[0]);
  });
});

// -- Review-first layout & progressive disclosure -------------------------------

async function runToResultWithFile() {
  vi.stubGlobal("fetch", routedFetch());
  render(<PrecheckWorkspace />);
  selectFileAndFill();
  fireEvent.click(screen.getByRole("button", { name: /run pre-check/i }));
  await screen.findByRole("heading", { name: /pre-check result/i });
}

describe("PrecheckWorkspace — review-first layout", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows the concise summary before the technical detail sections", async () => {
    await runToResultWithFile();
    const summary = screen.getByRole("heading", { name: /^summary$/i });
    const evidence = screen.getByText("Evidence details");
    // Summary appears earlier in document order than Evidence details.
    expect(
      summary.compareDocumentPosition(evidence) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // Plain-language reading + extracted value are in the summary.
    expect(screen.getAllByText("Found").length).toBeGreaterThan(0);
    expect(screen.getByText(/detected brand/i)).toBeInTheDocument();
    expect(screen.getByText(/detected alcohol/i)).toBeInTheDocument();
    expect(
      screen.getByText(/checks need human review|check needs human review/i),
    ).toBeInTheDocument();
  });

  it("keeps the machine state available inside the details", async () => {
    await runToResultWithFile();
    // The plain label is shown, and the exact machine state remains reachable.
    expect(screen.getAllByText(/machine state: OBSERVED/).length).toBeGreaterThan(0);
  });

  it("collapses technical detail sections by default (CANNED has no reviews)", async () => {
    await runToResultWithFile();
    // Technical detail and the full record stay collapsed initially. Regulatory
    // checks is collapsed here because the canned result has nothing needing
    // review (it auto-opens only when a review is required).
    for (const title of ["Evidence details", "Technical provenance", "Regulatory checks"]) {
      const details = screen.getByText(title).closest("details") as HTMLDetailsElement;
      expect(details, `${title} should be collapsed`).toBeTruthy();
      expect(details.open, `${title} should be collapsed`).toBe(false);
    }
    // Downloads is a primary action and is open by default.
    const downloads = screen.getByText("Downloads").closest("details") as HTMLDetailsElement;
    expect(downloads.open).toBe(true);
  });

  it("opens a disclosure when its summary is activated (keyboard-operable native details)", async () => {
    await runToResultWithFile();
    const summaryEl = screen.getByText("Technical provenance").closest("summary") as HTMLElement;
    const details = summaryEl.closest("details") as HTMLDetailsElement;
    expect(summaryEl.tagName).toBe("SUMMARY"); // inherently keyboard-operable
    expect(details.open).toBe(false);
    fireEvent.click(summaryEl);
    expect(details.open).toBe(true);
  });

  it("keeps all underlying data reachable regardless of collapsed state", async () => {
    await runToResultWithFile();
    // Raw coordinate detail, authority, and independent evidence assessments all
    // remain present in the DOM even though their sections are collapsed.
    expect(screen.getAllByText(/2404×979/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/27 CFR 4\.36/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/brand-name-check/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/wine-alcohol-check/).length).toBeGreaterThan(0);
  });

  it("uses responsive, non-overflowing preview styling", async () => {
    const { unmount } = (() => {
      vi.stubGlobal("fetch", routedFetch());
      return render(<PrecheckWorkspace />);
    })();
    selectFileAndFill();
    fireEvent.click(screen.getByRole("button", { name: /run pre-check/i }));
    await screen.findByRole("heading", { name: /pre-check result/i });
    // The preview image is fluid (width-bounded) rather than a fixed overflow width.
    for (const img of screen.getAllByAltText(/preview of the selected label image/i)) {
      expect(img.className).toMatch(/w-full/);
      expect(img.className).toMatch(/object-contain/);
    }
    unmount();
  });
});

// -- Download error handling & retry --------------------------------------------

describe("PrecheckWorkspace — download error handling", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("surfaces an accessible error when a download cannot begin, without corrupting the result", async () => {
    vi.stubGlobal("fetch", routedFetch());
    render(<PrecheckWorkspace />);
    await runPrecheckToResult();

    // Force object-URL creation to fail (e.g. a runtime that blocks blob URLs).
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: () => {
        throw new Error("blocked");
      },
      revokeObjectURL: () => {},
    });

    fireEvent.click(screen.getByRole("button", { name: /download json export/i }));

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText(/could not be downloaded/i)).toBeInTheDocument();
    // The result state is intact (findings still rendered); no false success.
    expect(screen.getAllByText(/wine-alcohol-syntax/).length).toBeGreaterThan(0);
  });

  it("clears the error and allows retry once the download can begin again", async () => {
    vi.stubGlobal("fetch", routedFetch());
    render(<PrecheckWorkspace />);
    await runPrecheckToResult();

    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: () => {
        throw new Error("blocked");
      },
      revokeObjectURL: () => {},
    });
    fireEvent.click(screen.getByRole("button", { name: /download readable report/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();

    // Recovery: a working object-URL implementation lets the retry succeed and
    // the accessible error is cleared.
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: () => "blob:ok",
      revokeObjectURL: () => {},
    });
    fireEvent.click(screen.getByRole("button", { name: /download readable report/i }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  });
});

// -- Processing-state accessibility (#53) ---------------------------------------

describe("PrecheckWorkspace — processing accessibility", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows immediate honest status, marks the region busy, and prevents duplicate submits", () => {
    // A never-resolving fetch keeps the workspace in the processing phase.
    const fetchMock = vi.fn().mockReturnValue(new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    render(<PrecheckWorkspace />);
    selectFileAndFill();

    fireEvent.click(screen.getByRole("button", { name: /run pre-check/i }));

    // Status appears immediately and honestly (no fake percentage or ETA).
    expect(screen.getByText(/analyzing label evidence/i)).toBeInTheDocument();
    expect(screen.queryByText(/%/)).toBeNull();
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");

    // The submit control is disabled and announces the running state.
    const running = screen.getByRole("button", { name: /running/i });
    expect(running).toBeDisabled();

    // A second activation launches no duplicate request.
    fireEvent.click(running);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the result region and announces completion on success", async () => {
    vi.stubGlobal("fetch", mockFetch({ ok: true, data: CANNED }));
    render(<PrecheckWorkspace />);
    selectFileAndFill();
    fireEvent.click(screen.getByRole("button", { name: /run pre-check/i }));

    await screen.findByRole("heading", { name: /pre-check result/i });
    expect(screen.getByText(/pre-check complete/i)).toBeInTheDocument();
    await waitFor(() => {
      const heading = screen.getByRole("heading", { name: /pre-check result/i });
      expect(document.activeElement).not.toBeNull();
      expect(document.activeElement?.contains(heading)).toBe(true);
    });
  });

  it("moves focus to the error alert on failure", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({
        ok: false,
        error: { code: "CORRUPT_IMAGE", message: "The image could not be read." },
      }),
    );
    render(<PrecheckWorkspace />);
    selectFileAndFill();
    fireEvent.click(screen.getByRole("button", { name: /run pre-check/i }));

    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert).toHaveFocus());
  });
});
