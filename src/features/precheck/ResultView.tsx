"use client";

import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import type { AnalyzerFieldObservation } from "@/pipeline/analyzer/analyzer.types";
import type { VerificationFinding } from "@/domain/verification/finding.types";
import type { PrecheckServiceResponse } from "@/server/precheck-service.types";

import {
  countChecksNeedingReview,
  executedFindings,
  nextAction,
  notRunFindings,
  observationStateLabel,
  summarizeAlcohol,
  summarizeBrand,
} from "./observation-language";

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

/** One concise field line in the summary: plain-language state + value. */
function SummaryField({ label, state, value }: { label: string; state: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-base font-medium">
        <span className="mr-2 inline-block rounded border border-border px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
          {state}
        </span>
        <span className="break-words">{value}</span>
      </dd>
    </div>
  );
}

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
        <dt className="text-muted-foreground">Confidence</dt>
        <dd>{obs.confidence.toFixed(2)}</dd>
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
                {alt.value} · {alt.confidence.toFixed(2)}
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
  preview,
}: {
  response: PrecheckServiceResponse;
  preview?: ReactNode;
}) {
  const { observations, findings } = response;
  const reviewCount = countChecksNeedingReview(findings);
  const executed = executedFindings(findings);
  const notRun = notRunFindings(findings);
  const prov = observations.provenance;

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-semibold">Pre-check result</h2>

      <p className="rounded-md border border-border bg-muted/40 p-3 text-sm">
        {response.advisoryNotice.text}
      </p>

      {/* Concise summary first: preview beside the plain-language result. */}
      <section aria-labelledby="summary-heading" className="rounded-md border border-border p-4">
        <h3 id="summary-heading" className="text-lg font-semibold">
          Summary
        </h3>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {preview ? <div className="min-w-0">{preview}</div> : null}
          <div className="flex min-w-0 flex-col gap-3">
            <dl className="flex flex-col gap-3">
              <SummaryField
                label="Detected brand"
                state={observationStateLabel(observations.brandName.state)}
                value={summarizeBrand(observations)}
              />
              <SummaryField
                label="Detected alcohol"
                state={observationStateLabel(observations.alcoholStatement.state)}
                value={summarizeAlcohol(observations)}
              />
            </dl>
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
