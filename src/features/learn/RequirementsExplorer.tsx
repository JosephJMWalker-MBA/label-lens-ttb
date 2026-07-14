import { Disclosure } from "@/components/ui/disclosure";

import { FIELD_LABEL, type RuleGuide, type RuleGuideEntry } from "./rule-guide";

/**
 * The Requirements Explorer: what the system checks, what source each check
 * cites, and — the part most compliance tools leave out — what it cannot
 * determine at all.
 *
 * Every value shown is read from the committed rule registry. There is no
 * aggregate score, no readiness figure, and no green completion state, because
 * this screen describes the *system*, not any particular label. Counts are used
 * throughout instead of grades.
 */
export function RequirementsExplorer({ guide }: { guide: RuleGuide }) {
  const fromArtwork = guide.entries.filter((e) => e.evaluability === "from-artwork");
  const external = guide.entries.filter((e) => e.evaluability === "requires-external-evidence");

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">What is checked</h1>
        <p className="max-w-2xl text-lg text-foreground">
          Label Lens runs a fixed set of deterministic checks. This page lists every one of them,
          the source it cites, and what it cannot decide.
        </p>
        <p className="max-w-2xl text-muted-foreground">
          {guide.entries.length} checks are registered in this profile. {guide.fromArtworkCount} can
          be evaluated from artwork and the facts you state. {guide.requiresExternalEvidenceCount}{" "}
          could not be evaluated from artwork alone.
        </p>
      </div>

      <section aria-labelledby="scope-heading" className="proof-card flex flex-col gap-3 p-5">
        <h2 id="scope-heading" className="text-lg font-semibold">
          What this covers
        </h2>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto,1fr]">
          <dt className="text-muted-foreground">Rule profile</dt>
          <dd className="font-mono">
            {guide.profileId}@{guide.profileVersion}
          </dd>
          <dt className="text-muted-foreground">Beverage category</dt>
          <dd>Domestic wine only. No beer, malt beverage, or spirits profile exists.</dd>
          <dt className="text-muted-foreground">Fields read from artwork</dt>
          <dd>{Object.values(FIELD_LABEL).join(" and ")}. Nothing else on the label is read.</dd>
        </dl>
        <p className="text-sm text-muted-foreground">
          A citation below points to the source a rule was written against. Label Lens does not
          reproduce or interpret the regulation, and nothing on this page is legal advice or a TTB
          position.
        </p>
      </section>

      <section aria-labelledby="artwork-heading" className="flex flex-col gap-3">
        <h2 id="artwork-heading" className="text-xl font-semibold">
          Checks that can be evaluated from artwork
        </h2>
        <p className="text-sm text-muted-foreground">
          These compare what the system reads from the image against the facts you state. A result
          is a rule outcome, not a government decision.
        </p>
        <ol className="flex list-none flex-col gap-3 p-0">
          {fromArtwork.map((entry) => (
            <RuleCard key={entry.ruleId} entry={entry} />
          ))}
        </ol>
      </section>

      <section aria-labelledby="external-heading" className="flex flex-col gap-3">
        <h2 id="external-heading" className="text-xl font-semibold">
          Checks that could not be evaluated from artwork alone
        </h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          These are registered and named, and they deliberately do not run. Each one needs evidence
          that a label image cannot establish. The system reports them as not run rather than
          guessing — and artwork is never accepted as proof of any of them.
        </p>
        <ol className="flex list-none flex-col gap-3 p-0">
          {external.map((entry) => (
            <RuleCard key={entry.ruleId} entry={entry} />
          ))}
        </ol>
      </section>

      <Disclosure title="What the system cannot determine">
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>
            It does not decide whether a label may be used, and it issues no approval, rejection, or
            clearance. There is no overall status, score, or percentage — by design.
          </p>
          <p>
            It reads only the two fields listed above. Other required label statements are not read,
            not checked, and their absence from a result means nothing.
          </p>
          <p>
            When a field is not detected, that means the extractor found no supported evidence. It
            does not prove the statement is absent from the artwork.
          </p>
          <p>
            It holds no record between runs. Nothing you upload is stored, and no result carries
            over to a later visit.
          </p>
        </div>
      </Disclosure>

      <p className="max-w-2xl rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        This tool supports preparation and review. It does not approve or reject a label, and it is
        not a TTB approval or legal determination.
      </p>
    </div>
  );
}

function RuleCard({ entry }: { entry: RuleGuideEntry }) {
  const external = entry.evaluability === "requires-external-evidence";
  return (
    <li className="proof-card flex flex-col gap-3 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="font-mono text-sm font-semibold">{entry.ruleId}</h3>
        <span className="text-xs text-muted-foreground">
          <span className="sr-only">Rule version </span>
          <span className="font-mono">v{entry.ruleVersion}</span>
        </span>
      </div>

      <p className="text-sm text-muted-foreground">{entry.categoryLabel}</p>

      {entry.summary ? (
        <p className="text-sm">
          <span className="font-medium">What the system does: </span>
          {entry.summary}
        </p>
      ) : null}

      {external && entry.externalEvidenceDependency ? (
        <p className="text-sm">
          <span className="font-medium">Requires evidence the artwork cannot provide: </span>
          {entry.externalEvidenceDependency}
        </p>
      ) : null}

      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto,1fr]">
        <dt className="text-muted-foreground">Source cited</dt>
        <dd className="break-words">
          <span className="font-mono">{entry.authorityCitation}</span>{" "}
          <span className="text-muted-foreground">(snapshot {entry.authoritySnapshotDate})</span>
        </dd>
        <dt className="text-muted-foreground">Evidence used</dt>
        <dd>
          {entry.requiredEvidenceFields.length === 0
            ? "None read from artwork"
            : entry.requiredEvidenceFields.map((f) => FIELD_LABEL[f]).join(", ")}
        </dd>
        <dt className="text-muted-foreground">Can run from artwork</dt>
        <dd>{external ? "No — could not be evaluated from artwork alone" : "Yes"}</dd>
      </dl>
    </li>
  );
}
