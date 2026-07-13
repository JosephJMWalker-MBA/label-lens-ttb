"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import type { AnalyzerFieldObservation } from "@/pipeline/analyzer/analyzer.types";
import type { VerificationFinding } from "@/domain/verification/finding.types";
import type { PrecheckServiceResponse } from "@/server/precheck-service.types";

import { triggerDownload } from "./download";
import { EvidencePanel } from "./EvidencePanel";
import {
  countChecksNeedingReview,
  executedFindings,
  nextAction,
  notRunFindings,
  observationStateLabel,
} from "./observation-language";

/** Plain-language note for each machine-finding token. These are rule outcomes. */
const STATUS_NOTE: Record<string, string> = {
  PASS: "Rule outcome: the evidence agreed with the deterministic rule.",
  WARN: "Rule outcome: a non-blocking concern was recorded.",
  FAIL: "Rule outcome: the evidence did not agree with the deterministic rule.",
  NEEDS_REVIEW: "Rule outcome: a person must review this; the rule could not decide safely.",
  not_run: "The rule did not run.",
};

/** User-facing message when a download cannot begin. Never exposes content. */
const DOWNLOAD_ERROR_MESSAGE =
  "The report could not be downloaded. Try again or regenerate the result.";

function ObservationCard({ field, obs }: { field: string; obs: AnalyzerFieldObservation }) {
  return (
    <div className="rounded-md border border-border p-3 text-sm">
      <h4 className="font-medium">{field}</h4>
      <dl className="mt-1 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">Reading</dt>
        <dd>
          {observationStateLabel(obs.state)}{" "}
          <span className="text-muted-foreground">(machine state: {obs.state})</span>
        </dd>
        <dt className="text-muted-foreground">Extracted value</dt>
        <dd className="break-words">{obs.value ?? "— none extracted —"}</dd>
        <dt className="text-muted-foreground">Raw OCR text</dt>
        <dd className="break-words">{obs.rawText ?? "—"}</dd>
        <dt className="text-muted-foreground">OCR evidence score</dt>
        <dd>{obs.ocrEvidenceScore.toFixed(2)}</dd>
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
              <li key={i} className="break-words">
                {alt.value} · OCR evidence {alt.ocrEvidenceScore.toFixed(2)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** A single finding's auditable detail (used for executed and not-run findings). */
function FindingCard({ f, showDependency }: { f: VerificationFinding; showDependency: boolean }) {
  return (
    <li className="rounded-md border border-border p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{f.ruleId}</span>
        <span
          data-status={f.findingStatus}
          className="status-badge rounded border px-2 py-0.5 font-mono font-semibold"
        >
          {f.findingStatus}
        </span>
      </div>
      <p className="mt-1 text-muted-foreground">{STATUS_NOTE[f.findingStatus]}</p>
      <p className="mt-1">{f.message}</p>
      <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">Execution</dt>
        <dd>{f.ruleExecutionStatus}</dd>
        <dt className="text-muted-foreground">Authority</dt>
        <dd className="break-words">
          {f.authority.citation} (snapshot {f.authority.snapshotDate})
        </dd>
        <dt className="text-muted-foreground">Rule / profile</dt>
        <dd className="break-words">
          {f.ruleId}@{f.ruleVersion} · {f.profileId}@{f.profileVersion}
        </dd>
        <dt className="text-muted-foreground">Evidence references</dt>
        <dd>{f.evidenceReferences.length === 0 ? "none" : `${f.evidenceReferences.length}`}</dd>
        {showDependency && f.externalEvidenceDependency ? (
          <>
            <dt className="text-muted-foreground">Requires</dt>
            <dd className="break-words">{f.externalEvidenceDependency}</dd>
          </>
        ) : null}
      </dl>
    </li>
  );
}

export function ResultView({
  response,
  previewImage,
}: {
  response: PrecheckServiceResponse;
  /** Local preview of the analyzed upload; null for the server-side sample. */
  previewImage?: { url: string; name: string } | null;
}) {
  const { observations, findings } = response;
  const reviewCount = countChecksNeedingReview(findings);
  const executed = executedFindings(findings);
  const notRun = notRunFindings(findings);
  const prov = observations.provenance;

  const [downloadError, setDownloadError] = useState<string | null>(null);
  const downloadErrorRef = useRef<HTMLDivElement>(null);

  // Save exact server-produced content; on any failure to start the download,
  // surface an accessible error rather than silently doing nothing.
  function download(content: string, filename: string, mimeType: string) {
    try {
      triggerDownload({ content, filename, mimeType });
      setDownloadError(null);
    } catch {
      setDownloadError(DOWNLOAD_ERROR_MESSAGE);
      requestAnimationFrame(() => downloadErrorRef.current?.focus());
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold">Pre-check result</h2>

      <p className="rounded-md border border-border bg-muted/40 p-3 text-sm">
        {response.advisoryNotice.text}
      </p>

      {/* Evidence-centered summary: the label with evidence regions overlaid,
          beside concise Brand and Alcohol evidence cards. */}
      <section aria-labelledby="summary-heading" className="rounded-md border border-border p-4">
        <h3 id="summary-heading" className="text-lg font-semibold">
          Summary
        </h3>
        <div className="mt-3 flex flex-col gap-4">
          <EvidencePanel observations={observations} previewImage={previewImage} />
          <div className="flex flex-col gap-2 border-t border-border pt-3">
            <p className="text-sm">
              <span className="font-medium">{reviewCount}</span>{" "}
              {reviewCount === 1 ? "check needs" : "checks need"} human review.
            </p>
            <p className="rounded-md bg-muted/50 p-3 text-sm">
              <span className="font-semibold">Suggested next step: </span>
              {nextAction(observations, findings)}
            </p>
          </div>
        </div>
      </section>

      {/* Honest preview of the future seller-confirmation step. Nothing here is
          active: no correction is stored, no report changes, nothing is sent. */}
      <Disclosure title="What confirmation will do (preview)">
        <div className="flex flex-col gap-3 text-sm">
          <p>
            A future step will ask the seller to{" "}
            <strong>confirm how Label Lens interpreted the artwork before submitting</strong>. For
            each detected field, that step will offer:
          </p>
          <ul className="list-disc pl-5 text-muted-foreground">
            <li>Confirm this reading</li>
            <li>Choose another detected reading</li>
            <li>Enter a correction</li>
            <li>Mark as not visible or unreadable</li>
            <li>Replace the artwork</li>
          </ul>
          <p className="rounded-md border border-border bg-muted/40 p-3">
            These actions are <strong>not yet active</strong>. Nothing on this page stores a
            confirmation or correction, changes the machine evidence or reports, or sends anything
            to TTB.
          </p>
        </div>
      </Disclosure>

      <Disclosure title="Evidence details">
        <div className="flex flex-col gap-3">
          <ObservationCard field="Brand name" obs={observations.brandName} />
          <ObservationCard field="Alcohol statement" obs={observations.alcoholStatement} />
        </div>
      </Disclosure>

      <Disclosure
        title="Regulatory checks"
        defaultOpen={reviewCount > 0}
        summaryAccessory={reviewCount > 0 ? `${reviewCount} needing review` : "none needing review"}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            These are deterministic rule outcomes, not government decisions. There is no overall
            status.
          </p>
          <section aria-labelledby="executed-heading" className="flex flex-col gap-2">
            <h4 id="executed-heading" className="font-semibold">
              Checks that ran
            </h4>
            {executed.length === 0 ? (
              <p className="text-sm text-muted-foreground">No checks ran for this result.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {executed.map((f) => (
                  <FindingCard key={f.ruleId} f={f} showDependency={false} />
                ))}
              </ol>
            )}
          </section>

          {notRun.length > 0 ? (
            <section aria-labelledby="notrun-heading" className="flex flex-col gap-2">
              <h4 id="notrun-heading" className="font-semibold">
                Additional evidence-dependent checks
              </h4>
              <p className="text-sm text-muted-foreground">
                These checks require information that cannot be established from label artwork
                alone.
              </p>
              <ol className="flex flex-col gap-3">
                {notRun.map((f) => (
                  <FindingCard key={f.ruleId} f={f} showDependency={true} />
                ))}
              </ol>
            </section>
          ) : null}
        </div>
      </Disclosure>

      <Disclosure title="Technical provenance">
        <div className="flex flex-col gap-4 text-sm">
          <section aria-labelledby="assessments-heading" className="flex flex-col gap-2">
            <h4 id="assessments-heading" className="font-semibold">
              Evidence sufficiency (assessed independently)
            </h4>
            <ul className="flex flex-col gap-2">
              {response.evidenceAssessments.map((a) => (
                <li key={a.checkId} className="rounded-md border border-border p-3">
                  <span className="font-medium">{a.checkId}</span>: {a.evidenceStatus}
                  <span className="text-muted-foreground"> — {a.reasonCode}</span>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="coords-heading" className="flex flex-col gap-2">
            <h4 id="coords-heading" className="font-semibold">
              Extraction provenance and coordinates
            </h4>
            <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">Extractor</dt>
              <dd className="break-words">
                {prov.extractionAdapterId}@{prov.extractionAdapterVersion}
              </dd>
              <dt className="text-muted-foreground">OCR engine</dt>
              <dd className="break-words">
                {prov.ocrEngine.kind === "ocr"
                  ? `${prov.ocrEngine.engineId}@${prov.ocrEngine.engineVersion}`
                  : "not applicable"}
              </dd>
              {[
                { name: "Brand name", obs: observations.brandName },
                { name: "Alcohol statement", obs: observations.alcoholStatement },
              ].map(({ name, obs }) => (
                <FragmentGeometry key={name} name={name} obs={obs} />
              ))}
            </dl>
          </section>
        </div>
      </Disclosure>

      <Disclosure title="Downloads" defaultOpen={true}>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={() =>
                download(response.exportJson, response.suggestedFilename, "application/json")
              }
            >
              Download JSON export
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                download(response.report.html, response.report.filename, "text/html;charset=utf-8")
              }
            >
              Download readable report (HTML)
            </Button>
          </div>
          {downloadError ? (
            <div
              ref={downloadErrorRef}
              tabIndex={-1}
              role="alert"
              className="rounded-md border border-border bg-muted/40 p-3 text-sm text-foreground"
            >
              {downloadError}
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Saves the exact server-produced, checksum-verified JSON export as{" "}
            <code className="break-all">{response.suggestedFilename}</code>, and a readable HTML
            report as <code className="break-all">{response.report.filename}</code>. Both include
            the current disposition history.
          </p>
        </div>
      </Disclosure>
    </div>
  );
}

/** Raw coordinate detail for one field (kept for auditability). */
function FragmentGeometry({ name, obs }: { name: string; obs: AnalyzerFieldObservation }) {
  return (
    <>
      <dt className="text-muted-foreground">{name} region</dt>
      <dd className="break-words">
        {obs.geometry
          ? `x${obs.geometry.x}, y${obs.geometry.y}, ${obs.geometry.width}×${obs.geometry.height} in ${obs.geometry.imageWidth}×${obs.geometry.imageHeight}`
          : "—"}
      </dd>
    </>
  );
}
