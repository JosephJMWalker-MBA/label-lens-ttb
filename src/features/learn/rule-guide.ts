import type { RuleCategory, VerificationRule } from "@/domain/rules/rule.types";
import type { AnalyzerFieldKey } from "@/pipeline/analyzer/analyzer.types";
import { winePrecheckRegistry } from "@/pipeline/precheck/wine-precheck.profile";

/**
 * Presentation-only derivation of the Requirements Explorer from the committed
 * rule registry.
 *
 * Everything authoritative here is *read from the rules themselves* — the rule
 * id, its version, its category, the authority it cites, the snapshot date of
 * that authority, the evidence fields it needs, and (for checks that cannot run
 * from artwork) the external evidence it declares it requires.
 *
 * Nothing here interprets a regulation. `RULE_SUMMARY` describes **what the
 * software does**, not what the law says, and the UI labels it that way. The
 * citation is presented as a pointer to the source a rule was written against —
 * never as reproduced, paraphrased, or interpreted law. No prose in this file is
 * authority, and no prose in this file may become authority.
 *
 * This module is read-only. It evaluates no artwork, mutates no rule, and is not
 * part of the pre-check pipeline.
 */

/** Whether a check can be decided from label artwork plus the facts you state. */
export type Evaluability = "from-artwork" | "requires-external-evidence";

export interface RuleGuideEntry {
  ruleId: string;
  ruleVersion: string;
  category: RuleCategory;
  categoryLabel: string;
  /** What the software does. Not a statement of law. */
  summary: string | null;
  authorityCitation: string;
  authoritySnapshotDate: string;
  requiredEvidenceFields: readonly AnalyzerFieldKey[];
  evaluability: Evaluability;
  /**
   * For checks that cannot run from artwork: the evidence the rule itself
   * declares it requires. Read from the rule, never re-typed here.
   */
  externalEvidenceDependency: string | null;
}

export interface RuleGuide {
  profileId: string;
  profileVersion: string;
  entries: RuleGuideEntry[];
  fromArtworkCount: number;
  requiresExternalEvidenceCount: number;
}

/** Plain-language name for each rule category. Presentation only. */
export const CATEGORY_LABEL: Record<RuleCategory, string> = {
  "syntax-validation": "Reads a statement and checks it parses",
  "canonical-text-comparison": "Compares text you stated with text on the artwork",
  "numeric-agreement": "Compares a number you stated with a number on the artwork",
  "external-evidence-dependent": "Cannot be evaluated from artwork alone",
};

/**
 * One sentence per rule describing **what the system does** when it runs that
 * check. These are descriptions of software behaviour, drawn from each rule's
 * own documented intent. They are deliberately not restatements of the cited
 * regulation.
 *
 * A rule with no entry here still appears in the explorer with its id, version,
 * category, and authority — a missing summary must never make a check invisible.
 */
export const RULE_SUMMARY: Record<string, string> = {
  "brand-name-canonical-comparison":
    "Compares the brand name you stated with the brand name read from the artwork, after conservative canonical normalization. It is not a fuzzy, semantic, or similarity match.",
  "wine-alcohol-syntax":
    "Checks whether the alcohol statement read from the artwork parses as a supported alcohol-statement form.",
  "wine-alcohol-declared-comparison":
    "Compares the alcohol value you stated with the alcohol statement read from the artwork.",
  "wine-alcohol-actual-content-tolerance":
    "Would compare the stated alcohol against the product's actual alcohol content. The system never treats artwork as proof of actual content, so it does not run.",
  "wine-alcohol-omission-eligibility":
    "Would decide whether the alcohol statement may be omitted. That depends on a designation the artwork does not establish, so it does not run.",
  "wine-alcohol-class-type-boundary":
    "Would decide whether the product crosses a class/type or taxable boundary. That depends on evidence the artwork does not establish, so it does not run.",
};

/**
 * A frozen, non-provenance context used only to read the *static* dependency
 * declaration of external-evidence-dependent rules.
 *
 * Those rules return a constant finding and ignore their context entirely (see
 * `externalDependencyRule` in `wine-alcohol.rule.ts`), which is what makes this
 * safe: it reads a declaration, it does not evaluate anything. It is never
 * persisted, exported, hashed, or shown, and it carries no run identity — the
 * empty `runId` and `derivativeSha256` are deliberate, so this value can never
 * be mistaken for a real run. `rule-guide.test.ts` asserts that every rule read
 * this way still reports `not_run_external_dependency`.
 */
const RULE_INSPECTION_CONTEXT = Object.freeze({
  declaredFacts: {},
  observations: {},
  evidenceStatus: "insufficient" as const,
  run: Object.freeze({
    runId: "",
    ruleProfileId: winePrecheckRegistry.profileId,
    ruleProfileVersion: winePrecheckRegistry.profileVersion,
    derivativeSha256: "",
  }),
  evidenceReferences: [],
});

function evaluabilityOf(rule: VerificationRule): Evaluability {
  return rule.category === "external-evidence-dependent"
    ? "requires-external-evidence"
    : "from-artwork";
}

/**
 * Read the evidence an external-evidence-dependent rule declares it requires,
 * from the rule itself. Returns null for any rule that can run from artwork.
 */
function externalDependencyOf(rule: VerificationRule): string | null {
  if (evaluabilityOf(rule) !== "requires-external-evidence") return null;
  return rule.evaluate(RULE_INSPECTION_CONTEXT).externalEvidenceDependency ?? null;
}

function toEntry(rule: VerificationRule): RuleGuideEntry {
  return {
    ruleId: rule.id,
    ruleVersion: rule.version,
    category: rule.category,
    categoryLabel: CATEGORY_LABEL[rule.category],
    summary: RULE_SUMMARY[rule.id] ?? null,
    authorityCitation: rule.authority.citation,
    authoritySnapshotDate: rule.authority.snapshotDate,
    requiredEvidenceFields: rule.requiredEvidenceFields,
    evaluability: evaluabilityOf(rule),
    externalEvidenceDependency: externalDependencyOf(rule),
  };
}

/**
 * Build the guide from the committed wine pre-check registry, in the registry's
 * own deterministic evaluation order. Every registered rule appears; none is
 * filtered, reordered, or hidden.
 */
export function buildRuleGuide(): RuleGuide {
  const entries = winePrecheckRegistry.all().map(toEntry);
  return {
    profileId: winePrecheckRegistry.profileId,
    profileVersion: winePrecheckRegistry.profileVersion,
    entries,
    fromArtworkCount: entries.filter((e) => e.evaluability === "from-artwork").length,
    requiresExternalEvidenceCount: entries.filter(
      (e) => e.evaluability === "requires-external-evidence",
    ).length,
  };
}

/** The fields the extractor reads from artwork in this profile. Presentation only. */
export const FIELD_LABEL: Record<AnalyzerFieldKey, string> = {
  brandName: "Brand name",
  alcoholStatement: "Alcohol statement",
};
