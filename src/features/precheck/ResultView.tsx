"use client";

import { Button } from "@/components/ui/button";
import type { AnalyzerFieldObservation } from "@/pipeline/analyzer/analyzer.types";
import type { PrecheckServiceResponse } from "@/server/precheck-service.types";

/** Plain-language note for each machine-finding token. These are rule outcomes. */
const STATUS_NOTE: Record<string, string> = {
  PASS: "Rule outcome: the evidence agreed with the deterministic rule.",
  WARN: "Rule outcome: a non-blocking concern was recorded.",
  FAIL: "Rule outcome: the evidence did not agree with the deterministic rule.",
  NEEDS_REVIEW: "Rule outcome: a person must review this; the rule could not decide safely.",
  not_run: "The rule did not run.",
};

function downloadFile(text: string, filename: string, mime: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function ObservationCard({ field, obs }: { field: string; obs: AnalyzerFieldObservation }) {
  return (
    <div className="rounded-md border border-border p-3 text-sm">
      <h4 className="font-medium">{field}</h4>
      <dl className="mt-1 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">State</dt>
        <dd>{obs.state}</dd>
        <dt className="text-muted-foreground">Extracted value</dt>
        <dd>{obs.value ?? "— none extracted —"}</dd>
        <dt className="text-muted-foreground">Raw OCR text</dt>
        <dd>{obs.rawText ?? "—"}</dd>
        <dt className="text-muted-foreground">Confidence</dt>
        <dd>{obs.confidence.toFixed(2)}</dd>
        <dt className="text-muted-foreground">Source region</dt>
        <dd>
          {obs.geometry
            ? `x${obs.geometry.x}, y${obs.geometry.y}, ${obs.geometry.width}×${obs.geometry.height} in ${obs.geometry.imageWidth}×${obs.geometry.imageHeight}`
            : "—"}
        </dd>
      </dl>
      {obs.state === "NOT_OBSERVED" ? (
        <p className="mt-2 text-muted-foreground">
          No supported candidate was extracted. This is not a regulatory failure.
        </p>
      ) : null}
      {obs.alternates.length > 0 ? (
        <div className="mt-2">
          <p className="text-muted-foreground">Alternates (not selected):</p>
          <ul className="list-disc pl-5">
            {obs.alternates.map((alt, i) => (
              <li key={i}>
                {alt.value} · {alt.confidence.toFixed(2)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function ResultView({ response }: { response: PrecheckServiceResponse }) {
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold">Pre-check result</h2>

      <p className="rounded-md border border-border bg-muted/40 p-3 text-sm">
        {response.advisoryNotice.text}
      </p>

      <section aria-labelledby="evidence-heading" className="flex flex-col gap-3">
        <h3 id="evidence-heading" className="text-lg font-semibold">
          Extraction evidence
        </h3>
        <ObservationCard field="Brand name" obs={response.observations.brandName} />
        <ObservationCard field="Alcohol statement" obs={response.observations.alcoholStatement} />
        <p className="text-xs text-muted-foreground">
          Extracted by {response.observations.provenance.extractionAdapterId}@
          {response.observations.provenance.extractionAdapterVersion}; OCR{" "}
          {response.observations.provenance.ocrEngine.kind === "ocr"
            ? `${response.observations.provenance.ocrEngine.engineId}@${response.observations.provenance.ocrEngine.engineVersion}`
            : "not applicable"}
          .
        </p>
      </section>

      <section aria-labelledby="assessments-heading" className="flex flex-col gap-2">
        <h3 id="assessments-heading" className="text-lg font-semibold">
          Evidence sufficiency (assessed independently)
        </h3>
        <ul className="flex flex-col gap-2">
          {response.evidenceAssessments.map((a) => (
            <li key={a.checkId} className="rounded-md border border-border p-3 text-sm">
              <span className="font-medium">{a.checkId}</span>: {a.evidenceStatus}
              <span className="text-muted-foreground"> — {a.reasonCode}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="findings-heading" className="flex flex-col gap-2">
        <h3 id="findings-heading" className="text-lg font-semibold">
          Findings (deterministic rule outcomes, in evaluation order)
        </h3>
        <p className="text-sm text-muted-foreground">
          These are rule outcomes, not government decisions. There is no overall status.
        </p>
        <ol className="flex flex-col gap-3">
          {response.findings.map((f) => (
            <li key={f.ruleId} className="rounded-md border border-border p-3 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{f.ruleId}</span>
                <span className="rounded border border-border px-2 py-0.5 font-mono">
                  {f.findingStatus}
                </span>
              </div>
              <p className="mt-1 text-muted-foreground">{STATUS_NOTE[f.findingStatus]}</p>
              <p className="mt-1">{f.message}</p>
              <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
                <dt className="text-muted-foreground">Execution</dt>
                <dd>{f.ruleExecutionStatus}</dd>
                <dt className="text-muted-foreground">Authority</dt>
                <dd>
                  {f.authority.citation} (snapshot {f.authority.snapshotDate})
                </dd>
                <dt className="text-muted-foreground">Rule / profile</dt>
                <dd>
                  {f.ruleId}@{f.ruleVersion} · {f.profileId}@{f.profileVersion}
                </dd>
                <dt className="text-muted-foreground">Evidence references</dt>
                <dd>
                  {f.evidenceReferences.length === 0 ? "none" : `${f.evidenceReferences.length}`}
                </dd>
              </dl>
              {f.ruleExecutionStatus === "not_run_external_dependency" ? (
                <p className="mt-2 text-muted-foreground">
                  External evidence required: {f.externalEvidenceDependency}. This check cannot run
                  from the label artwork alone and is not a pass or a failure.
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="download-heading" className="flex flex-col gap-2">
        <h3 id="download-heading" className="text-lg font-semibold">
          Download
        </h3>
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={() =>
              downloadFile(response.exportJson, response.suggestedFilename, "application/json")
            }
          >
            Download JSON export
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              downloadFile(response.report.html, response.report.filename, "text/html")
            }
          >
            Download readable report (HTML)
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Saves the exact server-produced, checksum-verified JSON export as{" "}
          <code>{response.suggestedFilename}</code>, and a readable HTML report as{" "}
          <code>{response.report.filename}</code>. Both include the current disposition history.
        </p>
      </section>
    </div>
  );
}
