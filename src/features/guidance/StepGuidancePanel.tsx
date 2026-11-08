import {
  OFFICIAL_SOURCES_VERIFIED_ON,
  formatSourceDate,
  officialSource,
  type OfficialSource,
} from "./official-sources";
import { guidanceFor, type StepGuidance } from "./step-guidance";

/**
 * Source-grounded help for the step the applicant is on.
 *
 * It renders only curated, verified content (see `step-guidance.ts`) and holds
 * no controls besides a disclosure and links to official pages: it can explain
 * a step, never change a finding, a fact, readiness, or a submission. For a
 * step without recorded guidance it says so instead of improvising.
 */
export function StepGuidancePanel({
  contextId,
  defaultOpen = false,
  compact = false,
}: {
  contextId: string;
  defaultOpen?: boolean;
  /** Cap the open height (with its own scroll) so a task below stays in view. */
  compact?: boolean;
}) {
  const guidance = guidanceFor(contextId);
  if (!guidance) {
    const labeling = officialSource("ttb-labeling");
    return (
      <section
        className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground"
        data-testid="step-guidance"
        data-guidance-context={contextId}
        data-abstained="true"
        aria-label="Help for this step"
      >
        Label Lens has no reviewed guidance for this step.
        {labeling ? (
          <>
            {" "}
            TTB&apos;s <SourceLink source={labeling} /> page covers wine labeling in general.
          </>
        ) : null}
      </section>
    );
  }

  return (
    <details
      className="group rounded-lg border border-border bg-card p-4 text-sm"
      data-testid="step-guidance"
      data-guidance-context={guidance.contextId}
      open={defaultOpen}
    >
      <summary className="cursor-pointer list-none">
        <span className="font-semibold">Help: {guidance.title}</span>
        <span className="block text-xs text-muted-foreground">
          What Label Lens checks, what it cannot, and what TTB says
        </span>
      </summary>
      <div className={compact ? "max-h-[45vh] overflow-y-auto pr-1" : undefined}>
        <GuidanceBody guidance={guidance} />
      </div>
    </details>
  );
}

function GuidanceBody({ guidance }: { guidance: StepGuidance }) {
  const regulations = guidance.regulationSourceIds
    .map((id) => officialSource(id))
    .filter((source): source is Extract<OfficialSource, { kind: "regulation" }> =>
      Boolean(source && source.kind === "regulation"),
    );
  const furtherReading = guidance.furtherReadingSourceIds
    .map((id) => officialSource(id))
    .filter((source): source is OfficialSource => Boolean(source));
  const questionSource = guidance.sourceQuestions[0]
    ? officialSource(guidance.sourceQuestions[0].sourceId)
    : undefined;

  return (
    <div className="mt-3 flex flex-col gap-4">
      {guidance.fromTheSource.map((quote) => {
        const source = officialSource(quote.sourceId);
        return (
          <figure key={quote.text} className="m-0" data-testid="guidance-quote">
            <blockquote className="border-l-2 border-blue-700/60 pl-3 italic">
              &ldquo;{quote.text}&rdquo;
            </blockquote>
            {source ? (
              <figcaption className="mt-1 pl-3 text-xs text-muted-foreground">
                From TTB, <SourceLink source={source} /> <SourceVersion source={source} />
              </figcaption>
            ) : null}
          </figure>
        );
      })}

      <GuidanceList heading="What Label Lens checks" items={guidance.labelLensChecks} />
      <GuidanceList
        heading="What Label Lens does not check"
        items={guidance.labelLensDoesNotCheck}
      />
      <GuidanceList heading="Have ready" items={guidance.haveReady} />

      {guidance.sourceQuestions.length > 0 && questionSource ? (
        <div>
          <h4 className="font-semibold">Questions TTB&apos;s page answers</h4>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
            {guidance.sourceQuestions.map((question) => (
              <li key={question.text}>{question.text}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">
            Read the answers on <SourceLink source={questionSource} />.
          </p>
        </div>
      ) : null}

      {regulations.length > 0 ? (
        <div>
          <h4 className="font-semibold">Regulations this check cites</h4>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {regulations.map((source) => (
              <li key={source.sourceId}>
                <a
                  className="font-medium text-foreground underline underline-offset-4"
                  href={source.url}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {source.citation}
                  <span className="sr-only"> (opens eCFR in a new tab)</span>
                </a>
                : {source.title} (eCFR, last amended {formatSourceDate(source.latestAmendmentDate)})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {furtherReading.length > 0 ? (
        <div>
          <h4 className="font-semibold">Read on TTB&apos;s site</h4>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {furtherReading.map((source) => (
              <li key={source.sourceId}>
                <SourceLink source={source} /> <SourceVersion source={source} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="border-t border-border/70 pt-3 text-xs text-muted-foreground">
        Sources checked {formatSourceDate(OFFICIAL_SOURCES_VERIFIED_ON)}. Quoted text is TTB&apos;s
        own; everything else describes Label Lens. This is not legal advice: a person reviews your
        package, and TTB decides label approval.
      </p>
    </div>
  );
}

function GuidanceList({ heading, items }: { heading: string; items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="font-semibold">{heading}</h4>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function SourceLink({ source }: { source: OfficialSource }) {
  return (
    <a
      className="font-medium text-foreground underline underline-offset-4"
      href={source.url}
      target="_blank"
      rel="noreferrer noopener"
    >
      {source.title}
      <span className="sr-only"> (opens the official {source.publisher} site in a new tab)</span>
    </a>
  );
}

function SourceVersion({ source }: { source: OfficialSource }) {
  return (
    <span>
      (
      {source.kind === "regulation"
        ? `last amended ${formatSourceDate(source.latestAmendmentDate)}`
        : `page last updated ${formatSourceDate(source.pageLastUpdated)}`}
      )
    </span>
  );
}
