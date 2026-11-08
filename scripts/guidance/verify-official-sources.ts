/**
 * CLI: re-check every official source that applicant guidance quotes or links,
 * and record the result as evidence.
 *
 *   npm run guidance:verify-sources            # check and write the record
 *   npm run guidance:verify-sources -- --check # check only, write nothing
 *
 * For each eCFR section it asks the eCFR versioner API for the section name and
 * latest amendment date, and compares that date with the snapshot date of every
 * registered rule that cites the section. For each TTB page it fetches the page,
 * reads its title and "Last updated" date, and confirms that every quote and
 * question the guidance shows appears verbatim (whitespace-normalized).
 *
 * The record is written to src/features/guidance/official-sources.verification.json
 * and is what the offline tests compare the registry and guidance against. The
 * script exits non-zero when anything drifted, so a person reviews the change
 * before the registry is updated. It needs network access to www.ttb.gov and
 * www.ecfr.gov; behind an HTTPS proxy, Node needs NODE_USE_ENV_PROXY=1 (the npm
 * script sets it).
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

import { GOVERNMENT_WARNING_AUTHORITY } from "@/domain/rules/government-warning.rule";
import {
  OFFICIAL_SOURCES,
  OFFICIAL_SOURCES_VERIFIED_ON,
  type AgencyPageSource,
  type RegulationSource,
} from "@/features/guidance/official-sources";
import {
  normalizeForQuote,
  pageContainsQuote,
  pageLastUpdated,
  pageText,
} from "@/features/guidance/source-text";
import { allGuidance } from "@/features/guidance/step-guidance";
import { winePrecheckRegistry } from "@/pipeline/precheck/wine-precheck.profile";

const RECORD_PATH = path.resolve("src/features/guidance/official-sources.verification.json");
const USER_AGENT = "label-lens-ttb source verification (repository maintenance script)";
async function get(url: string): Promise<{ status: number; finalUrl: string; body: string }> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/json" },
    redirect: "follow",
    signal: AbortSignal.timeout(45_000),
  });
  return { status: response.status, finalUrl: response.url, body: await response.text() };
}

/** Snapshot dates of every rule that cites a section, keyed by citation. */
function ruleSnapshotsByCitation(): Map<string, string[]> {
  const authorities = [
    ...winePrecheckRegistry.all().map((rule) => rule.authority),
    GOVERNMENT_WARNING_AUTHORITY,
  ];
  const byCitation = new Map<string, string[]>();
  for (const authority of authorities) {
    for (const citation of authority.citation.split(";").map((part) => part.trim())) {
      const dates = byCitation.get(citation) ?? [];
      if (!dates.includes(authority.snapshotDate)) dates.push(authority.snapshotDate);
      byCitation.set(citation, dates.sort());
    }
  }
  return byCitation;
}

interface CheckResult {
  sourceId: string;
  url: string;
  ok: boolean;
  problems: string[];
  [key: string]: unknown;
}

async function checkRegulation(
  source: RegulationSource,
  snapshots: Map<string, string[]>,
): Promise<CheckResult> {
  const api = `https://www.ecfr.gov/api/versioner/v1/versions/title-27.json?part=${source.part}&section=${source.section}`;
  const problems: string[] = [];
  const { status, body } = await get(api);
  if (status !== 200) {
    return {
      sourceId: source.sourceId,
      url: source.url,
      ok: false,
      problems: [`eCFR API ${status}`],
    };
  }
  const data = JSON.parse(body) as {
    content_versions: Array<{ name: string; removed: boolean }>;
    meta: { latest_amendment_date: string; latest_issue_date: string };
  };
  const latest = data.content_versions.at(-1);
  const observedTitle = latest ? normalizeForQuote(latest.name) : null;
  const observedAmendment = data.meta.latest_amendment_date;
  if (!latest || latest.removed) problems.push("section is missing or removed in eCFR");
  if (observedTitle !== source.title) {
    problems.push(`title changed: recorded "${source.title}", eCFR "${observedTitle}"`);
  }
  if (observedAmendment !== source.latestAmendmentDate) {
    problems.push(`amended: recorded ${source.latestAmendmentDate}, eCFR now ${observedAmendment}`);
  }
  const ruleSnapshotDates = snapshots.get(source.citation) ?? [];
  const amendedAfterRuleSnapshot = ruleSnapshotDates.some((date) => observedAmendment > date);
  if (amendedAfterRuleSnapshot) {
    problems.push(
      `amended ${observedAmendment}, after the citing rule snapshot (${ruleSnapshotDates.join(", ")})`,
    );
  }
  return {
    sourceId: source.sourceId,
    url: source.url,
    verifiedVia: api,
    ok: problems.length === 0,
    problems,
    observedTitle,
    observedLatestAmendmentDate: observedAmendment,
    observedLatestIssueDate: data.meta.latest_issue_date,
    citingRuleSnapshotDates: ruleSnapshotDates,
    amendedAfterRuleSnapshot,
  };
}

async function checkPage(source: AgencyPageSource, quotes: string[]): Promise<CheckResult> {
  const problems: string[] = [];
  const { status, finalUrl, body } = await get(source.url);
  if (status !== 200) problems.push(`HTTP ${status}`);
  if (new URL(finalUrl).host !== new URL(source.url).host)
    problems.push(`redirected to ${finalUrl}`);
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(body)?.[1];
  const observedTitle = title ? normalizeForQuote(pageText(title).split(" | ")[0] ?? "") : null;
  if (observedTitle !== source.title) {
    problems.push(`title changed: recorded "${source.title}", page "${observedTitle}"`);
  }
  const observedLastUpdated = pageLastUpdated(body);
  if (observedLastUpdated !== source.pageLastUpdated) {
    problems.push(
      `page updated: recorded ${source.pageLastUpdated}, page shows ${observedLastUpdated ?? "no date"}`,
    );
  }
  const quoteResults = quotes.map((quote) => ({
    text: quote,
    found: pageContainsQuote(body, quote),
  }));
  for (const result of quoteResults) {
    if (!result.found) problems.push(`quote not found: "${result.text}"`);
  }
  return {
    sourceId: source.sourceId,
    url: source.url,
    ok: problems.length === 0,
    problems,
    httpStatus: status,
    observedTitle,
    observedPageLastUpdated: observedLastUpdated,
    quotes: quoteResults,
  };
}

async function main() {
  const checkOnly = process.argv.includes("--check");
  const quotesBySource = new Map<string, string[]>();
  for (const guidance of allGuidance()) {
    for (const quote of [...guidance.fromTheSource, ...guidance.sourceQuestions]) {
      const quotes = quotesBySource.get(quote.sourceId) ?? [];
      if (!quotes.includes(quote.text)) quotes.push(quote.text);
      quotesBySource.set(quote.sourceId, quotes);
    }
  }
  const snapshots = ruleSnapshotsByCitation();

  const results: CheckResult[] = [];
  for (const source of OFFICIAL_SOURCES) {
    try {
      results.push(
        source.kind === "regulation"
          ? await checkRegulation(source, snapshots)
          : await checkPage(source, quotesBySource.get(source.sourceId) ?? []),
      );
    } catch (error) {
      results.push({
        sourceId: source.sourceId,
        url: source.url,
        ok: false,
        problems: [`fetch failed: ${error instanceof Error ? error.message : String(error)}`],
      });
    }
    const last = results.at(-1)!;
    console.log(
      `[sources] ${last.ok ? "ok  " : "DRIFT"} ${last.sourceId}${last.ok ? "" : ` — ${last.problems.join("; ")}`}`,
    );
  }

  const titles = JSON.parse(
    (await get("https://www.ecfr.gov/api/versioner/v1/titles.json")).body,
  ) as {
    titles: Array<{ number: number; up_to_date_as_of: string }>;
  };
  const verifiedOn = new Date().toISOString().slice(0, 10);
  const record = {
    verifiedOn,
    tool: "scripts/guidance/verify-official-sources.ts",
    ecfrTitle27UpToDateAsOf:
      titles.titles.find((title) => title.number === 27)?.up_to_date_as_of ?? null,
    allOk: results.every((result) => result.ok),
    sources: results,
  };

  if (!checkOnly) {
    writeFileSync(RECORD_PATH, `${JSON.stringify(record, null, 2)}\n`);
    console.log(`[sources] wrote ${path.relative(process.cwd(), RECORD_PATH)}`);
  }
  if (verifiedOn !== OFFICIAL_SOURCES_VERIFIED_ON) {
    console.log(
      `[sources] note: OFFICIAL_SOURCES_VERIFIED_ON is ${OFFICIAL_SOURCES_VERIFIED_ON}; set it to ${verifiedOn} once the record is reviewed.`,
    );
  }
  console.log(
    `[sources] ${record.allOk ? "all sources match the registry" : "drift found — review before updating the registry"}`,
  );
  process.exit(record.allOk ? 0 : 1);
}

void main();
