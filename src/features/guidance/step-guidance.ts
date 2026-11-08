import {
  GOVERNMENT_WARNING_AUTHORITY,
  GOVERNMENT_WARNING_RULE_ID,
} from "@/domain/rules/government-warning.rule";
import { RULE_SUMMARY } from "@/features/learn/rule-guide";
import { winePrecheckRegistry } from "@/pipeline/precheck/wine-precheck.profile";

import {
  officialSource,
  regulationSourcesForCitation,
  type OfficialSource,
} from "./official-sources";

/**
 * Task-contextual guidance for applicants, shown beside the step they are on.
 *
 * Deterministic and curated: no model writes or selects any of it, and it is
 * never derived from label, OCR, or uploaded content. Each entry keeps three
 * kinds of text strictly apart:
 *
 * 1. **What Label Lens does.** Descriptions of software behaviour, read from the
 *    rule guide's summaries where a registered rule exists. Not law.
 * 2. **What to have ready / what Label Lens cannot tell you.** Instructions for
 *    using Label Lens and honest limits. Not law.
 * 3. **From the source.** Verbatim text and the page's own questions, quoted from
 *    an official page and verified present on it by
 *    `npm run guidance:verify-sources` (see `official-sources.verification.json`).
 *
 * Regulation pointers are derived from the citations the registered rules
 * themselves carry, so guidance cannot cite a different section than the check
 * it explains. A context with no entry gets no guidance: callers must show an
 * abstention, never invented help.
 *
 * Guidance is content. It cannot change findings, facts, readiness, or
 * submission state (ADR 0016, proposed in #222).
 */

export type GuidanceContextId =
  "category:brandName" | "category:alcoholStatement" | "check:governmentWarning" | "step:submit";

/** Verbatim text from an official source. */
export interface SourceQuote {
  sourceId: string;
  text: string;
}

export interface StepGuidance {
  contextId: GuidanceContextId;
  title: string;
  labelLensChecks: readonly string[];
  labelLensDoesNotCheck: readonly string[];
  haveReady: readonly string[];
  fromTheSource: readonly SourceQuote[];
  /** Questions the official page answers, quoted as its own headings. */
  sourceQuestions: readonly SourceQuote[];
  /** Regulation sections cited by the rules behind this step. */
  regulationSourceIds: readonly string[];
  /** Further official reading that is not quoted. */
  furtherReadingSourceIds: readonly string[];
}

function ruleSummary(ruleId: string): string {
  const summary = RULE_SUMMARY[ruleId];
  if (!summary) throw new Error(`GUIDANCE_RULE_SUMMARY_MISSING:${ruleId}`);
  return summary;
}

function ruleCitationSourceIds(ruleId: string): string[] {
  const rule = winePrecheckRegistry.get(ruleId);
  if (!rule) throw new Error(`GUIDANCE_RULE_MISSING:${ruleId}`);
  return regulationSourcesForCitation(rule.authority.citation).map((source) => source.sourceId);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const GUIDANCE: Readonly<Record<GuidanceContextId, StepGuidance>> = deepFreeze({
  "category:brandName": {
    contextId: "category:brandName",
    title: "Brand name",
    labelLensChecks: [ruleSummary("brand-name-canonical-comparison")],
    labelLensDoesNotCheck: [
      "Where the brand name is placed, its type size, or whether it is legible.",
      "Whether a brand name could mislead, or has viticultural significance. Label Lens does not decide these.",
    ],
    haveReady: [
      "The brand name exactly as printed, including punctuation such as “&”.",
      "Which panel shows it most prominently. Mark that one.",
    ],
    fromTheSource: [
      {
        sourceId: "ttb-wine-brand-name",
        text: "A brand name is the name under which a wine or line of wines is marketed. It is usually the most prominent information on the label.",
      },
    ],
    sourceQuestions: [
      {
        sourceId: "ttb-wine-brand-name",
        text: "Where should the brand name be placed on the product?",
      },
      {
        sourceId: "ttb-wine-brand-name",
        text: "What are the formatting requirements for the brand name?",
      },
      { sourceId: "ttb-wine-brand-name", text: "When is a brand name misleading?" },
      {
        sourceId: "ttb-wine-brand-name",
        text: "What is a brand name of viticultural significance?",
      },
    ],
    regulationSourceIds: ruleCitationSourceIds("brand-name-canonical-comparison"),
    furtherReadingSourceIds: [],
  },
  "category:alcoholStatement": {
    contextId: "category:alcoholStatement",
    title: "Alcohol statement",
    labelLensChecks: [
      ruleSummary("wine-alcohol-syntax"),
      ruleSummary("wine-alcohol-declared-comparison"),
    ],
    labelLensDoesNotCheck: [
      ruleSummary("wine-alcohol-actual-content-tolerance"),
      ruleSummary("wine-alcohol-omission-eligibility"),
      "Type size, legibility, or which label the statement is on.",
    ],
    haveReady: [
      "The alcohol statement exactly as printed, including any words or abbreviations around the number.",
      "Which panel it is on.",
    ],
    fromTheSource: [
      {
        sourceId: "ttb-wine-alcohol-content",
        text: "The alcohol content statement is a numerical statement on a wine label that indicates the alcohol content of the wine in terms of percentage of alcohol by volume.",
      },
    ],
    sourceQuestions: [
      {
        sourceId: "ttb-wine-alcohol-content",
        text: "Where should the alcohol content statement be placed on the product?",
      },
      { sourceId: "ttb-wine-alcohol-content", text: "What are the formatting requirements?" },
      {
        sourceId: "ttb-wine-alcohol-content",
        text: "Does the alcohol content stated on the label need to indicate the exact alcohol content of the product, or does TTB allow a tolerance?",
      },
    ],
    regulationSourceIds: ruleCitationSourceIds("wine-alcohol-syntax"),
    furtherReadingSourceIds: [],
  },
  "check:governmentWarning": {
    contextId: "check:governmentWarning",
    title: "Government warning",
    labelLensChecks: [
      "Searches every panel you uploaded for the warning and compares the wording it can read with the prescribed text. A reading that is incomplete, unclear, or mixed with nearby text is sent to a person instead of being passed or failed.",
    ],
    labelLensDoesNotCheck: [
      "Type size, bold type, or whether the warning stands apart from other text. Label Lens compares wording only.",
    ],
    haveReady: ["Every panel that carries the warning, uploaded in full and right side up."],
    fromTheSource: [
      {
        sourceId: "ttb-wine-health-warning",
        text: "The health warning statement may appear on a front label, back label, or side label.",
      },
    ],
    sourceQuestions: [
      {
        sourceId: "ttb-wine-health-warning",
        text: "Where should the health warning statement be placed on the product?",
      },
      { sourceId: "ttb-wine-health-warning", text: "What are the formatting requirements?" },
    ],
    regulationSourceIds: regulationSourcesForCitation(GOVERNMENT_WARNING_AUTHORITY.citation).map(
      (source) => source.sourceId,
    ),
    furtherReadingSourceIds: [],
  },
  "step:submit": {
    contextId: "step:submit",
    title: "Internal review and official filing",
    labelLensChecks: [
      "A Label Lens reviewer looks at your marked evidence and every pre-check finding, then accepts the package internally or asks for changes.",
    ],
    labelLensDoesNotCheck: [
      "Label Lens does not file anything with TTB, and an internal decision is not a TTB approval.",
      "Label Lens checks only the brand name, the alcohol statement, and the government warning wording. Other label items, such as net contents and the name and address statement, still need your attention.",
    ],
    haveReady: ["Your name or company as the reviewer should see it."],
    fromTheSource: [
      {
        sourceId: "ttb-colas-online",
        text: "COLAs Online makes it easy for you to apply for a Certificate of Label Approval/Exemption (COLA) for your product.",
      },
    ],
    sourceQuestions: [],
    regulationSourceIds: [],
    furtherReadingSourceIds: ["ttb-wine-net-contents", "ttb-wine-name-and-address", "ttb-labeling"],
  },
});

/** Guidance for a step, or null when Label Lens has none to give (abstain). */
export function guidanceFor(contextId: string): StepGuidance | null {
  return Object.prototype.hasOwnProperty.call(GUIDANCE, contextId)
    ? GUIDANCE[contextId as GuidanceContextId]
    : null;
}

export function allGuidance(): StepGuidance[] {
  return Object.values(GUIDANCE);
}

/** Every official source a guidance entry shows, in display order, deduplicated. */
export function sourcesFor(guidance: StepGuidance): OfficialSource[] {
  const ids = [
    ...guidance.fromTheSource.map((quote) => quote.sourceId),
    ...guidance.sourceQuestions.map((quote) => quote.sourceId),
    ...guidance.regulationSourceIds,
    ...guidance.furtherReadingSourceIds,
  ];
  return [...new Set(ids)].map((id) => {
    const source = officialSource(id);
    if (!source) throw new Error(`GUIDANCE_SOURCE_UNREGISTERED:${id}`);
    return source;
  });
}

/** The rule ids whose citations a guidance context derives its regulation sources from. */
export const GUIDANCE_RULE_IDS: Readonly<Record<GuidanceContextId, readonly string[]>> = {
  "category:brandName": ["brand-name-canonical-comparison"],
  "category:alcoholStatement": ["wine-alcohol-syntax"],
  "check:governmentWarning": [GOVERNMENT_WARNING_RULE_ID],
  "step:submit": [],
};
