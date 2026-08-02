/**
 * Issue #149 — the complete semantic comparison between two committed runs.
 *
 * ## Why every level, and not just the pass fingerprints
 *
 * The first version compared each item's `.fingerprints.json` and nothing else.
 * That covers PASS semantics — and only those. If the passes are identical but a
 * nondeterministic downstream ordering changes the candidate array, the ranking
 * or the selected value, the item's byte aggregate changes while the pass
 * fingerprints stay equal, and the previous code classified that as a
 * **timing-only difference**. It is the opposite: a real semantic difference in
 * the part of the pipeline under study.
 *
 * So a difference is timing-only ONLY when every non-timing level matches and the
 * remaining exact-byte difference is confined to `timings`. Every other
 * difference is semantic and is reported at the level it occurred.
 *
 * Truth-free: this reads sealed evidence bytes and compares them. It never sees
 * a truth label, an acceptable value or a historical identifier.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { canonicalize, sha256Bytes } from "./issue-149-evidence-canonical";

/**
 * The preregistered semantic levels, each mapped to the sealed file that carries
 * it. `timings` is the only excluded quantity, and it lives inside
 * `.passes.json` — which is why that one file is compared by FINGERPRINT rather
 * than by bytes.
 */
export const SEMANTIC_LEVELS = [
  { level: "outcome", file: null },
  { level: "sourceProvenanceAndConfiguration", file: ".provenance.json" },
  { level: "passSemanticsExcludingTimings", file: ".fingerprints.json" },
  { level: "orderedOcrWords", file: ".words.jsonl" },
  { level: "reconstructedLines", file: ".lines.jsonl" },
  { level: "candidateRecordsAndStableIdentities", file: ".candidates.jsonl" },
  { level: "rankingSelectionAuthorityAndAbstention", file: ".selection.json" },
  { level: "itemCounts", file: ".counts.json" },
  { level: "typedFailureEvidence", file: ".failure.json" },
] as const;

export type SemanticLevel = (typeof SEMANTIC_LEVELS)[number]["level"];

export type AcquisitionVerdict =
  | "COMPLETE_DETERMINISTIC_EVIDENCE"
  | "COMPLETE_WITH_NONDETERMINISM"
  | "INCOMPLETE_EVIDENCE"
  | "TRUTH_ISOLATION_FAILURE"
  | "RUNTIME_FAILURE";

export interface ItemComparison {
  itemId: string;
  /** Levels that differ. Empty means every compared level matched. */
  differingLevels: SemanticLevel[];
  /** True when the sealed bytes differ at all. */
  bytesDiffer: boolean;
  /**
   * True only when NO semantic level differs and the byte difference is confined
   * to `timings`. Never inferred from the pass fingerprints alone.
   */
  timingOnly: boolean;
  detail: string[];
}

export interface SemanticComparisonReport {
  comparedItems: number;
  comparedLevels: SemanticLevel[];
  items: ItemComparison[];
  semanticallyDifferingItems: string[];
  timingOnlyDifferingItems: string[];
  differencesByLevel: Record<string, string[]>;
  verdict: AcquisitionVerdict;
  incompleteDetail: string[];
  extractedItemCount: number;
  failedItemCount: number;
  runtimeUnavailableItemCount: number;
  runtimeFailureCodes: string[];
  runtimeFailureDetail: string[];
  scientificResultProduced: boolean;
}

const itemDirectories = (root: string): string[] =>
  existsSync(root)
    ? readdirSync(root)
        .filter(
          (entry) => /^item-\d{4}$/.test(entry) && statSync(path.join(root, entry)).isDirectory(),
        )
        .sort()
    : [];

const readIfPresent = (file: string): string | null =>
  existsSync(file) ? readFileSync(file, "utf8") : null;

const readFailureCode = (directory: string, itemId: string): string | null => {
  const raw = readIfPresent(path.join(directory, itemId, `${itemId}.failure.json`));
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as { errorCode?: unknown; code?: unknown };
    const code = parsed.errorCode ?? parsed.code;
    return typeof code === "string" ? code : null;
  } catch {
    return null;
  }
};

const readFailureMessage = (directory: string, itemId: string): string | null => {
  const raw = readIfPresent(path.join(directory, itemId, `${itemId}.failure.json`));
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as { errorMessage?: unknown; message?: unknown };
    const message = parsed.errorMessage ?? parsed.message;
    return typeof message === "string" ? message : null;
  } catch {
    return null;
  }
};

/**
 * Compare one item across every level.
 *
 * Files that carry no timing information are compared by their EXACT GOVERNED
 * BYTES. `.passes.json` carries `timings` by design, so it is compared through
 * the sealed `.fingerprints.json`, which excludes exactly that.
 */
export function compareItem(
  primaryDirectory: string,
  repeatDirectory: string,
  itemId: string,
): ItemComparison {
  const differingLevels: SemanticLevel[] = [];
  const detail: string[] = [];

  const primaryFiles = readdirSync(primaryDirectory).sort();
  const repeatFiles = readdirSync(repeatDirectory).sort();

  // Level 1: outcome, read from which file set is present.
  const outcomeOf = (files: string[]): string =>
    files.some((file) => file.endsWith(".failure.json")) ? "extraction-failed" : "extracted";
  const primaryOutcome = outcomeOf(primaryFiles);
  const repeatOutcome = outcomeOf(repeatFiles);
  if (primaryOutcome !== repeatOutcome) {
    differingLevels.push("outcome");
    detail.push(`outcome ${primaryOutcome} vs ${repeatOutcome}`);
  }
  if (primaryFiles.join(",") !== repeatFiles.join(",")) {
    detail.push(
      `file sets differ: ${JSON.stringify(primaryFiles)} vs ${JSON.stringify(repeatFiles)}`,
    );
  }

  let bytesDiffer = primaryFiles.join(",") !== repeatFiles.join(",");

  for (const { level, file } of SEMANTIC_LEVELS) {
    if (file === null) continue;
    const primaryPath = path.join(primaryDirectory, `${itemId}${file}`);
    const repeatPath = path.join(repeatDirectory, `${itemId}${file}`);
    const left = readIfPresent(primaryPath);
    const right = readIfPresent(repeatPath);

    if (left === null && right === null) continue; // not applicable to this outcome
    if (left === null || right === null) {
      differingLevels.push(level);
      detail.push(`${file} present in only one run`);
      bytesDiffer = true;
      continue;
    }
    if (left !== right) {
      differingLevels.push(level);
      detail.push(`${file} differs`);
      bytesDiffer = true;
    }
  }

  // `.passes.json` is the only file allowed to differ without being semantic,
  // and only because it carries `timings`. Its semantics are compared through
  // the fingerprints file above.
  const passesPrimary = readIfPresent(path.join(primaryDirectory, `${itemId}.passes.json`));
  const passesRepeat = readIfPresent(path.join(repeatDirectory, `${itemId}.passes.json`));
  const passBytesDiffer =
    passesPrimary !== null && passesRepeat !== null && passesPrimary !== passesRepeat;
  if (passBytesDiffer) {
    bytesDiffer = true;
    detail.push(".passes.json bytes differ");
    // If the fingerprints matched, the difference must be inside `timings` — and
    // that is CHECKED, not assumed.
    const confined = passDifferenceIsConfinedToTimings(passesPrimary, passesRepeat);
    if (!confined) {
      differingLevels.push("passSemanticsExcludingTimings");
      detail.push(".passes.json differs outside timings");
    }
  }

  return {
    itemId,
    differingLevels: [...new Set(differingLevels)],
    bytesDiffer,
    // Timing-only requires BOTH: no semantic level differs, AND something did
    // differ that is confined to timings.
    timingOnly: differingLevels.length === 0 && bytesDiffer,
    detail,
  };
}

/**
 * Is the difference between two `.passes.json` payloads confined to `timings`?
 *
 * Both are parsed and every key except `timings` is compared canonically. This
 * is the check that makes "timing-only" a finding rather than a default.
 */
export function passDifferenceIsConfinedToTimings(left: string, right: string): boolean {
  let a: Array<Record<string, unknown>>;
  let b: Array<Record<string, unknown>>;
  try {
    a = JSON.parse(left) as Array<Record<string, unknown>>;
    b = JSON.parse(right) as Array<Record<string, unknown>>;
  } catch {
    return false;
  }
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  const withoutTimings = (records: Array<Record<string, unknown>>): string =>
    canonicalize(
      records.map((record) => {
        const copy: Record<string, unknown> = {};
        for (const key of Object.keys(record)) {
          if (key !== "timings") copy[key] = record[key];
        }
        return copy;
      }),
    );
  return withoutTimings(a) === withoutTimings(b);
}

/**
 * Compare two committed runs and compute the preregistered verdict.
 *
 * `COMPLETE_WITH_NONDETERMINISM` is a SUCCESSFUL acquisition outcome: the
 * evidence is complete and both runs are preserved. Only incomplete evidence, a
 * truth-isolation failure or a runtime failure is unsuccessful.
 */
export function compareRuns(input: {
  primaryDirectory: string;
  repeatDirectory: string;
  expectedItemIds: readonly string[];
}): SemanticComparisonReport {
  const { primaryDirectory, repeatDirectory, expectedItemIds } = input;
  const expected = [...expectedItemIds].sort();
  const primaryItems = itemDirectories(primaryDirectory);
  const repeatItems = itemDirectories(repeatDirectory);
  const comparedLevels = SEMANTIC_LEVELS.map((entry) => entry.level);

  const incompleteDetail: string[] = [];
  if (primaryItems.join(",") !== expected.join(",")) {
    incompleteDetail.push(`primary has ${primaryItems.length} items, expected ${expected.length}`);
  }
  if (repeatItems.join(",") !== expected.join(",")) {
    incompleteDetail.push(`repeat has ${repeatItems.length} items, expected ${expected.length}`);
  }

  const items = incompleteDetail.length
    ? []
    : expected.map((itemId) =>
        compareItem(
          path.join(primaryDirectory, itemId),
          path.join(repeatDirectory, itemId),
          itemId,
        ),
      );

  const failureFacts = incompleteDetail.length
    ? []
    : (["primary", "repeat"] as const).flatMap((runId) => {
        const directory = runId === "primary" ? primaryDirectory : repeatDirectory;
        return expected.map((itemId) => {
          const code = readFailureCode(directory, itemId);
          const message = readFailureMessage(directory, itemId);
          return { runId, itemId, code, message, failed: code !== null };
        });
      });

  const extractedItemCount = failureFacts.filter((fact) => !fact.failed).length;
  const failedItemCount = failureFacts.filter((fact) => fact.failed).length;
  const runtimeUnavailableItemCount = failureFacts.filter(
    (fact) => fact.code === "OCR_UNAVAILABLE",
  ).length;
  const runtimeFailureCodes = [
    ...new Set(
      failureFacts.filter((fact) => fact.code !== null).map((fact) => fact.code as string),
    ),
  ].sort();
  const completeRunHasOnlyRuntimeUnavailableFailures =
    incompleteDetail.length === 0 &&
    (["primary", "repeat"] as const).some((runId) => {
      const runFacts = failureFacts.filter((fact) => fact.runId === runId);
      return (
        runFacts.length === expected.length &&
        runFacts.every((fact) => fact.code === "OCR_UNAVAILABLE")
      );
    });
  const runtimeFailureDetail = completeRunHasOnlyRuntimeUnavailableFailures
    ? [
        `runtime unavailable failures: ${runtimeUnavailableItemCount}/${failureFacts.length}`,
        ...[
          ...new Set(
            failureFacts
              .filter((fact) => fact.code === "OCR_UNAVAILABLE" && fact.message !== null)
              .map((fact) => fact.message as string),
          ),
        ]
          .sort()
          .slice(0, 5)
          .map((message) => `OCR_UNAVAILABLE: ${message}`),
      ]
    : [];

  const semanticallyDifferingItems = items
    .filter((item) => item.differingLevels.length > 0)
    .map((item) => item.itemId);
  const timingOnlyDifferingItems = items
    .filter((item) => item.timingOnly)
    .map((item) => item.itemId);

  const differencesByLevel: Record<string, string[]> = {};
  for (const level of comparedLevels) {
    const affected = items
      .filter((item) => item.differingLevels.includes(level))
      .map((item) => item.itemId);
    if (affected.length > 0) differencesByLevel[level] = affected;
  }

  const verdict: AcquisitionVerdict =
    incompleteDetail.length > 0
      ? "INCOMPLETE_EVIDENCE"
      : completeRunHasOnlyRuntimeUnavailableFailures
        ? "RUNTIME_FAILURE"
        : semanticallyDifferingItems.length > 0
          ? "COMPLETE_WITH_NONDETERMINISM"
          : "COMPLETE_DETERMINISTIC_EVIDENCE";

  return {
    comparedItems: items.length,
    comparedLevels,
    items,
    semanticallyDifferingItems,
    timingOnlyDifferingItems,
    differencesByLevel,
    verdict,
    incompleteDetail,
    extractedItemCount,
    failedItemCount,
    runtimeUnavailableItemCount,
    runtimeFailureCodes,
    runtimeFailureDetail,
    scientificResultProduced:
      verdict === "COMPLETE_DETERMINISTIC_EVIDENCE" || verdict === "COMPLETE_WITH_NONDETERMINISM",
  };
}

/**
 * Is this verdict a successful acquisition?
 *
 * `COMPLETE_WITH_NONDETERMINISM` is preregistered as a valid experimental
 * outcome whose complete evidence must still be verified and preserved. Treating
 * it as a process failure would skip the verification and upload steps that
 * follow, which is exactly what a nondeterministic result most needs.
 */
export const isSuccessfulAcquisition = (verdict: AcquisitionVerdict): boolean =>
  verdict === "COMPLETE_DETERMINISTIC_EVIDENCE" || verdict === "COMPLETE_WITH_NONDETERMINISM";

/** A stable digest of the comparison, for the run-level report. */
export const comparisonDigest = (report: SemanticComparisonReport): string =>
  sha256Bytes(
    canonicalize({
      verdict: report.verdict,
      comparedItems: report.comparedItems,
      semanticallyDifferingItems: report.semanticallyDifferingItems,
      differencesByLevel: report.differencesByLevel,
      extractedItemCount: report.extractedItemCount,
      failedItemCount: report.failedItemCount,
      runtimeUnavailableItemCount: report.runtimeUnavailableItemCount,
      runtimeFailureCodes: report.runtimeFailureCodes,
      scientificResultProduced: report.scientificResultProduced,
    }),
  );
