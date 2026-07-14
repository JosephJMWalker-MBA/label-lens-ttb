import {
  NO_CITED_REQUIREMENT,
  type RequirementSummaryRow,
  type RequirementsSummary,
} from "./requirements-summary";

/**
 * The Requirements Summary.
 *
 * Every "Required by cited authority" line on this screen is backed by an entry
 * in the merged requirements registry, and shows that entry's citation and
 * snapshot date. A field with no registry entry says so in those words — never
 * "not required", and never nothing at all, because silence would read as
 * permission.
 *
 * There are deliberately no check glyphs. A tick beside a requirement reads as
 * "you have satisfied this", and nothing in this system has checked anything
 * against these values. Status is text.
 */
export function RequirementsSummaryView({ summary }: { summary: RequirementsSummary }) {
  return (
    <section aria-labelledby="summary-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 id="summary-heading" className="text-2xl font-semibold tracking-tight">
          Here is what you told us
        </h2>
        <p className="max-w-2xl text-muted-foreground">
          {summary.recordedCount} of {summary.rows.length} facts recorded.{" "}
          {summary.categorySupported
            ? `${summary.citedRequirementCount} of them have a cited requirement in this system.`
            : "No cited requirements can be shown for this category."}
        </p>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Nothing below has been checked. These are the facts you supplied, beside the requirements
          this system currently holds a citation for.
        </p>
      </div>

      {summary.categorySupported ? (
        <p className="max-w-2xl rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          Requirements come from{" "}
          <span className="font-mono">
            {summary.requirementsProfile.id}@{summary.requirementsProfile.version}
          </span>
          . This system holds cited requirements for {summary.citedRequirementCount} fields only.
          Its silence about the others is not permission.
        </p>
      ) : (
        <p
          role="status"
          className="max-w-2xl rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground"
        >
          {summary.beverageType === null
            ? "No beverage type was chosen, so no requirements profile applies."
            : "This system has a requirements profile for wine only, so it can show no cited requirements for this category."}{" "}
          That is a limit of this system, not a statement that nothing is required.
        </p>
      )}

      <ul className="flex list-none flex-col gap-3 p-0">
        {summary.rows.map((row) => (
          <SummaryRow key={row.factId} row={row} />
        ))}
      </ul>
    </section>
  );
}

function SummaryRow({ row }: { row: RequirementSummaryRow }) {
  const requirement = row.requirement;
  return (
    <li className="proof-card flex flex-col gap-2 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="text-base font-semibold">{row.label}</h3>
        <p className="text-sm">
          {row.recordStatus === "recorded" ? (
            <>
              <span className="text-muted-foreground">Recorded: </span>
              <span className="break-words font-medium">{row.value}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Not provided yet</span>
          )}
        </p>
      </div>

      {requirement ? (
        <div className="flex flex-col gap-1 text-sm">
          <p>
            <span className="font-medium">Required by cited authority.</span>{" "}
            <span className="text-muted-foreground">
              <span className="font-mono">{requirement.authority.citation}</span> (snapshot{" "}
              {requirement.authority.snapshotDate})
            </span>
          </p>
          {requirement.applicability === "conditional" && requirement.conditionExternalEvidence ? (
            <p className="text-muted-foreground">
              Subject to a condition this system cannot establish:{" "}
              {requirement.conditionExternalEvidence}.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{NO_CITED_REQUIREMENT}</p>
      )}

      <p className="text-sm text-muted-foreground">
        {row.evaluationStatus === "checked-by-registered-rules" && requirement
          ? `Checked from artwork by: ${requirement.checkedByRuleIds.join(", ")}. Not checked against what you typed here.`
          : "Not evaluated by this system."}
      </p>
    </li>
  );
}
