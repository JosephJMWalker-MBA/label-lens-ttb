import { describe, expect, it } from "vitest";

import {
  GOVERNMENT_WARNING_AUTHORITY,
  GOVERNMENT_WARNING_AUTHORITY_SOURCE,
} from "@/domain/rules/government-warning.rule";
import { winePrecheckRegistry } from "@/pipeline/precheck/wine-precheck.profile";

import {
  OFFICIAL_SOURCE_HOSTS,
  OFFICIAL_SOURCES,
  OFFICIAL_SOURCES_VERIFIED_ON,
  formatSourceDate,
  regulationSourcesForCitation,
} from "./official-sources";
import record from "./official-sources.verification.json";

type RecordEntry = (typeof record.sources)[number] & {
  observedLatestAmendmentDate?: string;
  observedTitle?: string | null;
  observedPageLastUpdated?: string | null;
  amendedAfterRuleSnapshot?: boolean;
  citingRuleSnapshotDates?: string[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

describe("official source registry", () => {
  it("links only to official hosts over HTTPS, with no query strings or fragments", () => {
    for (const source of OFFICIAL_SOURCES) {
      const url = new URL(source.url);
      expect(url.protocol, source.sourceId).toBe("https:");
      expect(OFFICIAL_SOURCE_HOSTS as readonly string[]).toContain(url.host);
      expect(url.search, source.sourceId).toBe("");
      expect(url.hash, source.sourceId).toBe("");
      expect(url.username + url.password, source.sourceId).toBe("");
    }
  });

  it("has one entry per source and per URL, each with a dated version", () => {
    expect(new Set(OFFICIAL_SOURCES.map((source) => source.sourceId)).size).toBe(
      OFFICIAL_SOURCES.length,
    );
    expect(new Set(OFFICIAL_SOURCES.map((source) => source.url)).size).toBe(
      OFFICIAL_SOURCES.length,
    );
    for (const source of OFFICIAL_SOURCES) {
      const version =
        source.kind === "regulation" ? source.latestAmendmentDate : source.pageLastUpdated;
      expect(version, source.sourceId).toMatch(ISO_DATE);
      expect(version <= OFFICIAL_SOURCES_VERIFIED_ON).toBe(true);
    }
    expect(Object.isFrozen(OFFICIAL_SOURCES)).toBe(true);
  });

  it("covers every section the registered rules and the warning check cite", () => {
    const citations = [
      ...winePrecheckRegistry.all().map((rule) => rule.authority.citation),
      GOVERNMENT_WARNING_AUTHORITY.citation,
    ];
    for (const citation of citations) {
      expect(() => regulationSourcesForCitation(citation), citation).not.toThrow();
    }
    expect(() => regulationSourcesForCitation("27 CFR 99.99")).toThrow(
      "OFFICIAL_SOURCE_MISSING_FOR_CITATION:27 CFR 99.99",
    );
  });

  it("uses the same official URLs the government warning rule already records", () => {
    const urls = new Set(OFFICIAL_SOURCES.map((source) => source.url));
    for (const url of GOVERNMENT_WARNING_AUTHORITY_SOURCE.officialSources) {
      expect(urls.has(url), url).toBe(true);
    }
  });

  it("formats source dates without depending on the viewer's time zone", () => {
    expect(formatSourceDate("2026-01-12")).toBe("January 12, 2026");
    expect(formatSourceDate("2016-12-31")).toBe("December 31, 2016");
  });
});

describe("recorded verification against the live sources", () => {
  const entries = record.sources as RecordEntry[];

  it("was taken on the registry's verification date and found no drift", () => {
    expect(record.verifiedOn).toBe(OFFICIAL_SOURCES_VERIFIED_ON);
    expect(record.allOk).toBe(true);
    expect(record.ecfrTitle27UpToDateAsOf).toMatch(ISO_DATE);
  });

  it("holds a passing check for every registered source, matching what is recorded here", () => {
    expect(entries.map((entry) => entry.sourceId).sort()).toEqual(
      OFFICIAL_SOURCES.map((source) => source.sourceId).sort(),
    );
    for (const source of OFFICIAL_SOURCES) {
      const entry = entries.find((candidate) => candidate.sourceId === source.sourceId)!;
      expect(entry.ok, source.sourceId).toBe(true);
      expect(entry.problems, source.sourceId).toEqual([]);
      expect(entry.url).toBe(source.url);
      expect(entry.observedTitle).toBe(source.title);
      if (source.kind === "regulation") {
        expect(entry.observedLatestAmendmentDate).toBe(source.latestAmendmentDate);
        // The rules were written against a snapshot taken after the section's
        // latest amendment, so the cited text is still the text in force.
        expect(entry.amendedAfterRuleSnapshot).toBe(false);
        expect(entry.citingRuleSnapshotDates?.length).toBeGreaterThan(0);
      } else {
        expect(entry.observedPageLastUpdated).toBe(source.pageLastUpdated);
      }
    }
  });
});
