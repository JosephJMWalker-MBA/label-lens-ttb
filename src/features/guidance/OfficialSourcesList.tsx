import {
  OFFICIAL_SOURCES,
  OFFICIAL_SOURCES_VERIFIED_ON,
  formatSourceDate,
} from "./official-sources";
import record from "./official-sources.verification.json";

type RecordEntry = { sourceId: string; ok: boolean; amendedAfterRuleSnapshot?: boolean };

/**
 * Every official source Label Lens quotes or links to, with the version its
 * publisher shows and the date it was last checked. Rendered from the registry
 * and the recorded verification, so the page cannot claim a check that did not
 * happen.
 */
export function OfficialSourcesList() {
  const entries = record.sources as RecordEntry[];
  const staleRegulations = entries.filter((entry) => entry.amendedAfterRuleSnapshot);
  const failed = entries.filter((entry) => !entry.ok);

  return (
    <section
      aria-labelledby="official-sources-heading"
      className="flex flex-col gap-3"
      data-testid="official-sources"
    >
      <h2 id="official-sources-heading" className="text-xl font-semibold">
        Official sources and versions
      </h2>
      <p className="text-muted-foreground">
        Every official page Label Lens quotes or links to, with the version its publisher shows.
        Last checked {formatSourceDate(OFFICIAL_SOURCES_VERIFIED_ON)}
        {record.ecfrTitle27UpToDateAsOf
          ? `, when eCFR Title 27 was up to date as of ${formatSourceDate(record.ecfrTitle27UpToDateAsOf)}`
          : ""}
        .
      </p>
      {failed.length === 0 && staleRegulations.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="official-sources-currency">
          No cited regulation section has been amended since the snapshot its check was written
          against, and every quoted passage was found on its page.
        </p>
      ) : (
        <p role="status" className="text-sm text-amber-800 dark:text-amber-300">
          The last check found changes in {failed.length + staleRegulations.length} source(s).
          Guidance that relies on them needs review.
        </p>
      )}
      <ul className="divide-y divide-border/70 rounded-md border border-border/70 text-sm">
        {OFFICIAL_SOURCES.map((source) => (
          <li
            key={source.sourceId}
            className="flex flex-wrap justify-between gap-x-4 gap-y-1 px-4 py-2"
          >
            <a
              className="font-medium underline underline-offset-4"
              href={source.url}
              target="_blank"
              rel="noreferrer noopener"
            >
              {source.kind === "regulation" ? `${source.citation}: ${source.title}` : source.title}
              <span className="sr-only">
                {" "}
                (opens the official {source.publisher} site in a new tab)
              </span>
            </a>
            <span className="text-muted-foreground">
              {source.publisher} ·{" "}
              {source.kind === "regulation"
                ? `last amended ${formatSourceDate(source.latestAmendmentDate)}`
                : `page last updated ${formatSourceDate(source.pageLastUpdated)}`}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
