/**
 * Official sources that applicant guidance may quote or point to.
 *
 * Every entry is a pointer to an official publication, recorded with the
 * version information its publisher exposes:
 *
 * - eCFR sections carry the latest amendment date reported by the eCFR
 *   versioner API (`/api/versioner/v1/versions/title-27.json`).
 * - TTB pages carry the page's own "Last updated" date as displayed on the page.
 *
 * `OFFICIAL_SOURCES_VERIFIED_ON` is the day these values were last re-checked
 * against the live sources by `npm run guidance:verify-sources`, which also
 * records the result in `official-sources.verification.json`. Tests tie every
 * entry, and every quoted string shown to applicants, to that record.
 *
 * Nothing in this file is Label Lens's reading of the law. A title is the title
 * the publisher gives a page; a citation names a section; a date says which
 * version was checked. Adding a source means fetching it, recording what the
 * publisher shows, and re-running the verification.
 */

/** The only hosts guidance may link to. */
export const OFFICIAL_SOURCE_HOSTS = ["www.ttb.gov", "www.ecfr.gov"] as const;

export const OFFICIAL_SOURCES_VERIFIED_ON = "2026-11-08";

interface OfficialSourceBase {
  sourceId: string;
  /** The title as published. */
  title: string;
  url: string;
}

export interface RegulationSource extends OfficialSourceBase {
  kind: "regulation";
  publisher: "eCFR";
  /** For example "27 CFR 4.36". Must match the citation a registered rule uses. */
  citation: string;
  part: string;
  section: string;
  /** Latest amendment date reported by the eCFR versioner, ISO YYYY-MM-DD. */
  latestAmendmentDate: string;
}

export interface AgencyPageSource extends OfficialSourceBase {
  kind: "agency-guidance" | "agency-service";
  publisher: "TTB";
  /** The page's own "Last updated" date as displayed, ISO YYYY-MM-DD. */
  pageLastUpdated: string;
}

export type OfficialSource = RegulationSource | AgencyPageSource;

function ecfr(
  section: string,
  subpart: string,
  title: string,
  latestAmendmentDate: string,
): RegulationSource {
  const part = section.split(".")[0]!;
  return {
    sourceId: `ecfr-27-${section}`,
    kind: "regulation",
    publisher: "eCFR",
    title,
    citation: `27 CFR ${section}`,
    part,
    section,
    url: `https://www.ecfr.gov/current/title-27/chapter-I/subchapter-A/part-${part}/subpart-${subpart}/section-${section}`,
    latestAmendmentDate,
  };
}

function ttb(
  sourceId: string,
  kind: AgencyPageSource["kind"],
  path: string,
  title: string,
  pageLastUpdated: string,
): AgencyPageSource {
  return {
    sourceId,
    kind,
    publisher: "TTB",
    title,
    url: `https://www.ttb.gov${path}`,
    pageLastUpdated,
  };
}

export const OFFICIAL_SOURCES: readonly OfficialSource[] = Object.freeze([
  ecfr("4.32", "D", "§ 4.32 Mandatory label information.", "2016-12-31"),
  ecfr("4.33", "D", "§ 4.33 Brand names.", "2024-12-06"),
  ecfr("4.36", "D", "§ 4.36 Alcoholic content.", "2016-12-31"),
  ecfr("16.20", "C", "§ 16.20 General.", "2016-12-31"),
  ecfr("16.21", "C", "§ 16.21 Mandatory label information.", "2016-12-31"),
  ecfr("16.22", "C", "§ 16.22 General requirements.", "2016-12-31"),
  ttb(
    "ttb-wine-brand-name",
    "agency-guidance",
    "/regulated-commodities/beverage-alcohol/wine/labeling-wine/wine-labeling-brand-name",
    "Wine Labeling: Brand Name",
    "2026-01-12",
  ),
  ttb(
    "ttb-wine-alcohol-content",
    "agency-guidance",
    "/regulated-commodities/beverage-alcohol/wine/labeling-wine/wine-labeling-alcohol-content",
    "Wine Labeling: Alcohol Content",
    "2026-01-12",
  ),
  ttb(
    "ttb-wine-health-warning",
    "agency-guidance",
    "/regulated-commodities/beverage-alcohol/wine/labeling-wine/wine-labeling-health-warning-statement",
    "Wine Labeling: Health Warning Statement",
    "2021-03-01",
  ),
  ttb(
    "ttb-wine-net-contents",
    "agency-guidance",
    "/regulated-commodities/beverage-alcohol/wine/labeling-wine/wine-labeling-net-contents",
    "Wine Labeling: Net Contents",
    "2026-05-21",
  ),
  ttb(
    "ttb-wine-name-and-address",
    "agency-guidance",
    "/regulated-commodities/beverage-alcohol/wine/labeling-wine/wine-labeling-name-and-address",
    "Wine Labeling: Name and Address",
    "2026-01-12",
  ),
  ttb(
    "ttb-labeling",
    "agency-guidance",
    "/regulated-commodities/labeling/",
    "Labeling",
    "2026-06-02",
  ),
  ttb(
    "ttb-colas-online",
    "agency-service",
    "/online-services/colas-online/",
    "COLAs Online",
    "2026-01-02",
  ),
]);

const BY_ID = new Map(OFFICIAL_SOURCES.map((source) => [source.sourceId, source]));
const BY_CITATION = new Map(
  OFFICIAL_SOURCES.filter((source): source is RegulationSource => source.kind === "regulation").map(
    (source) => [source.citation, source],
  ),
);

export function officialSource(sourceId: string): OfficialSource | undefined {
  return BY_ID.get(sourceId);
}

/**
 * The regulation sources behind a rule's authority citation, for example
 * "27 CFR 4.32; 27 CFR 4.33". Throws if a cited section is not registered, so a
 * rule can never cite something guidance cannot show.
 */
export function regulationSourcesForCitation(citation: string): RegulationSource[] {
  return citation
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((cited) => {
      const source = BY_CITATION.get(cited);
      if (!source) throw new Error(`OFFICIAL_SOURCE_MISSING_FOR_CITATION:${cited}`);
      return source;
    });
}

/** "2026-01-12" → "January 12, 2026", independent of the viewer's time zone. */
export function formatSourceDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!)).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
