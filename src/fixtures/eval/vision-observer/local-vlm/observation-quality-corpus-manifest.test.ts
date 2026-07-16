import { describe, expect, it } from "vitest";

import {
  OBSERVATION_QUALITY_BENCHMARK_PROTOCOL_VERSION,
  OBSERVATION_QUALITY_CASE_COUNT,
} from "./observation-quality-benchmark-protocol";
import {
  OBSERVATION_QUALITY_CORPUS_ALLOWED_USAGE_STATUSES,
  OBSERVATION_QUALITY_CORPUS_MANIFEST_SCHEMA_VERSION,
  OBSERVATION_QUALITY_CORPUS_SLOT_CATEGORIES,
  OBSERVATION_QUALITY_CORPUS_SLOT_CATEGORY_BY_SLOT_ID,
  OBSERVATION_QUALITY_CORPUS_SLOT_IDS,
  OBSERVATION_QUALITY_CORPUS_SOURCE_PROVENANCES,
  canonicalizeObservationQualityCorpusManifestForDigest,
  computeObservationQualityCorpusManifestDigest,
  corpusSelectionAuthorized,
  evaluateObservationQualityCorpusCategoryCoverage,
  evaluateObservationQualityFrozenCorpusGate,
  observationQualityCorpusSlotCategory,
  realCorpusManifestCreationAuthorized,
  realExecutionAuthorizedByCorpusSlice,
  validateObservationQualityCorpusManifest,
  validateObservationQualityCorpusSlotSupport,
  type ObservationQualityCorpusCaseEntry,
  type ObservationQualityCorpusChallengeTag,
  type ObservationQualityCorpusManifest,
  type ObservationQualityCorpusSlotCategory,
  type ObservationQualityCorpusSlotId,
  type ObservationQualityCorpusVisualCharacteristic,
} from "./observation-quality-corpus-manifest";

function expectCorpusCaseEntry(_value: ObservationQualityCorpusCaseEntry): void {
  void _value;
}

function expectCorpusManifest(_value: ObservationQualityCorpusManifest): void {
  void _value;
}

const DIRECT_CHALLENGE_SUPPORT: Record<
  ObservationQualityCorpusSlotCategory,
  ObservationQualityCorpusChallengeTag
> = {
  CLEAN_SIMPLE: "simple-centered-brand",
  LOW_CONTRAST: "low-contrast",
  ROTATED_OR_VERTICAL: "vertical-mandatory-strip",
  DENSE_TEXT: "dense-text",
  DECORATIVE_TYPE: "decorative-or-script-brand",
  MULTI_PANEL_OR_WRAPAROUND: "multi-panel",
  AMBIGUITY_OR_COMPETING_TEXT: "multiple-brand-like-phrases",
  ABSTENTION_OPPORTUNITY: "missing-alcohol-statement",
};

const HUMAN_VISUAL_SUPPORT: Record<
  ObservationQualityCorpusSlotCategory,
  ObservationQualityCorpusVisualCharacteristic
> = {
  CLEAN_SIMPLE: "CLEAN_SIMPLE_LAYOUT",
  LOW_CONTRAST: "LOW_CONTRAST_PRESENTATION",
  ROTATED_OR_VERTICAL: "ROTATED_OR_VERTICAL_CONTENT",
  DENSE_TEXT: "DENSE_TEXT_CLUSTER",
  DECORATIVE_TYPE: "DECORATIVE_OR_SCRIPT_TYPE",
  MULTI_PANEL_OR_WRAPAROUND: "MULTI_PANEL_OR_WRAPAROUND_LAYOUT",
  AMBIGUITY_OR_COMPETING_TEXT: "AMBIGUOUS_SINGLE_TARGET",
  ABSTENTION_OPPORTUNITY: "ABSTENTION_RELEVANT_AMBIGUITY",
};

function digestFor(seed: number): string {
  return seed.toString(16).padStart(64, "0");
}

function challengeTagsFor(
  category: ObservationQualityCorpusSlotCategory,
  humanReviewedSupport: boolean,
  index: number,
): ObservationQualityCorpusChallengeTag[] {
  if (humanReviewedSupport) {
    return [index % 2 === 0 ? "front-label" : "back-label"];
  }

  const direct = DIRECT_CHALLENGE_SUPPORT[category];
  const context = index % 2 === 0 ? "front-label" : "back-label";
  return direct === context ? [direct] : [direct, context];
}

function opportunityTagsFor(
  category: ObservationQualityCorpusSlotCategory,
): ObservationQualityCorpusCaseEntry["observationOpportunityTags"] {
  switch (category) {
    case "LOW_CONTRAST":
      return ["LOW_CONTRAST"];
    case "ROTATED_OR_VERTICAL":
      return ["ROTATED_PANEL"];
    case "DENSE_TEXT":
      return ["DENSE_TEXT_CLUSTER"];
    case "DECORATIVE_TYPE":
      return ["DECORATIVE_TYPE"];
    case "MULTI_PANEL_OR_WRAPAROUND":
      return ["MULTI_PANEL_LAYOUT"];
    case "AMBIGUITY_OR_COMPETING_TEXT":
      return ["MULTIPLE_COMPETING_TEXT_CLUSTERS"];
    case "ABSTENTION_OPPORTUNITY":
      return ["NO_CLEAR_SINGLE_TARGET"];
    default:
      return [];
  }
}

function buildCaseEntry(
  slotId: ObservationQualityCorpusSlotId,
  index: number,
): ObservationQualityCorpusCaseEntry {
  const category = observationQualityCorpusSlotCategory(slotId);
  const humanReviewedSupport = slotId.endsWith("_2");
  const challengeTags = challengeTagsFor(category, humanReviewedSupport, index);

  return {
    slotId,
    sourceCaseId: `case-${String(index + 1).padStart(3, "0")}`,
    sourceArtifactRef: `tests/fixtures/precheck/synthetic-${String(index + 1).padStart(3, "0")}/label${index % 2 === 0 ? ".png" : ".jpeg"}`,
    sourceManifestRecordDigest: digestFor(100 + index),
    sourceImageDigest: digestFor(200 + index),
    derivativeDigest: digestFor(300 + index),
    mediaType: index % 2 === 0 ? "image/png" : "image/jpeg",
    width: 900 + index,
    height: 1400 + index,
    beverageCategory: "wine",
    challengeTags,
    slotSupport: humanReviewedSupport
      ? {
          kind: "HUMAN_REVIEWED_VISUAL_CHARACTERISTIC",
          characteristic: HUMAN_VISUAL_SUPPORT[category],
          note: `Human-reviewed support for ${category.toLowerCase()}.`,
        }
      : {
          kind: "CHALLENGE_TAG",
          tag: DIRECT_CHALLENGE_SUPPORT[category],
        },
    sourceProvenance:
      index % 2 === 0
        ? "author-provided-local-acquisition"
        : "Alcohol and Tobacco Tax and Trade Bureau",
    usageStatus:
      OBSERVATION_QUALITY_CORPUS_ALLOWED_USAGE_STATUSES[
        index % OBSERVATION_QUALITY_CORPUS_ALLOWED_USAGE_STATUSES.length
      ]!,
    selectionRationale: `This synthetic case justifies slot ${slotId} through committed source characteristics only.`,
    annotationStatus:
      category === "ABSTENTION_OPPORTUNITY"
        ? "COMMITTED_BUT_ABSTENTION_RELEVANT"
        : humanReviewedSupport
          ? "COMMITTED_WITH_MEDIUM_CONFIDENCE_GEOMETRY"
          : "COMMITTED_AND_QC_CONFIRMED",
    observationOpportunityState:
      category === "ABSTENTION_OPPORTUNITY"
        ? humanReviewedSupport
          ? "UNCERTAIN"
          : "NO_CLEAR_OBSERVATION_OPPORTUNITY"
        : "OBSERVATION_OPPORTUNITY_PRESENT",
    observationOpportunityTags: opportunityTagsFor(category),
    nearDuplicateReview: humanReviewedSupport ? "REVIEWED_NOT_DUPLICATE" : "NOT_REQUIRED",
    selectedBy: "synthetic-reviewer",
    selectedAt: "2026-07-16T00:00:00Z",
  };
}

function buildFrozenManifest(
  overrides: Partial<ObservationQualityCorpusManifest> = {},
): ObservationQualityCorpusManifest {
  const freezeState = overrides.freezeState ?? "FROZEN";
  const cases = overrides.cases ?? OBSERVATION_QUALITY_CORPUS_SLOT_IDS.map(buildCaseEntry);
  const sourceManifestDigest =
    overrides.sourceManifestDigest !== undefined
      ? overrides.sourceManifestDigest
      : freezeState === "DRAFT"
        ? null
        : digestFor(900);
  const frozenAt =
    overrides.frozenAt !== undefined
      ? overrides.frozenAt
      : freezeState === "FROZEN" || freezeState === "INVALIDATED"
        ? "2026-07-16T01:00:00Z"
        : null;
  const frozenBy =
    overrides.frozenBy !== undefined
      ? overrides.frozenBy
      : freezeState === "FROZEN" || freezeState === "INVALIDATED"
        ? "freeze-reviewer"
        : null;
  const invalidationReason =
    overrides.invalidationReason !== undefined
      ? overrides.invalidationReason
      : freezeState === "INVALIDATED"
        ? "Synthetic invalidation for testing."
        : null;
  const invalidatedAt =
    overrides.invalidatedAt !== undefined
      ? overrides.invalidatedAt
      : freezeState === "INVALIDATED"
        ? "2026-07-16T02:00:00Z"
        : null;
  const invalidatedBy =
    overrides.invalidatedBy !== undefined
      ? overrides.invalidatedBy
      : freezeState === "INVALIDATED"
        ? "invalidate-reviewer"
        : null;

  const manifestBase: ObservationQualityCorpusManifest = {
    schemaVersion: OBSERVATION_QUALITY_CORPUS_MANIFEST_SCHEMA_VERSION,
    protocolVersion: OBSERVATION_QUALITY_BENCHMARK_PROTOCOL_VERSION,
    benchmarkCorpusId: "oqb-calibration-v1",
    freezeState,
    sourceManifestRef: "src/fixtures/eval/eval-manifest.json",
    sourceManifestDigest,
    createdAt: "2026-07-16T00:00:00Z",
    createdBy: "slice-2-test",
    frozenAt,
    frozenBy,
    manifestDigest: null,
    invalidationReason,
    invalidatedAt,
    invalidatedBy,
    cases,
    ...overrides,
  };

  if (overrides.manifestDigest !== undefined) {
    return { ...manifestBase, manifestDigest: overrides.manifestDigest };
  }

  if (freezeState === "DRAFT") {
    return { ...manifestBase, manifestDigest: null };
  }

  return {
    ...manifestBase,
    manifestDigest: computeObservationQualityCorpusManifestDigest(manifestBase),
  };
}

function replaceCase(
  manifest: ObservationQualityCorpusManifest,
  slotId: ObservationQualityCorpusSlotId,
  updater: (
    entry: ObservationQualityCorpusCaseEntry,
    index: number,
  ) => ObservationQualityCorpusCaseEntry,
): ObservationQualityCorpusManifest {
  return {
    ...manifest,
    cases: manifest.cases.map((entry, index) =>
      entry.slotId === slotId ? updater(entry, index) : entry,
    ),
  };
}

const validCaseEntry = buildCaseEntry("CLEAN_SIMPLE_1", 0);
const validManifest = buildFrozenManifest();

expectCorpusCaseEntry(validCaseEntry);
expectCorpusManifest(validManifest);

expectCorpusCaseEntry({
  ...validCaseEntry,
  // @ts-expect-error contract identity is outside the Slice 2 schema
  contract: "A",
});

expectCorpusCaseEntry({
  ...validCaseEntry,
  // @ts-expect-error model output is outside the Slice 2 schema
  modelOutput: "forbidden",
});

expectCorpusCaseEntry({
  ...validCaseEntry,
  // @ts-expect-error raw response is outside the Slice 2 schema
  rawResponse: "forbidden",
});

expectCorpusCaseEntry({
  ...validCaseEntry,
  // @ts-expect-error OCR text is outside the Slice 2 schema
  ocrText: "forbidden",
});

expectCorpusCaseEntry({
  ...validCaseEntry,
  // @ts-expect-error application value is outside the Slice 2 schema
  applicationValue: "forbidden",
});

expectCorpusCaseEntry({
  ...validCaseEntry,
  // @ts-expect-error expected value is outside the Slice 2 schema
  expectedValue: "forbidden",
});

expectCorpusCaseEntry({
  ...validCaseEntry,
  // @ts-expect-error human score is outside the Slice 2 schema
  humanScore: 2,
});

describe("observation-quality corpus manifest", () => {
  describe("schema identity", () => {
    it("encodes the exact schema and authorization boundary", () => {
      expect(OBSERVATION_QUALITY_CORPUS_MANIFEST_SCHEMA_VERSION).toBe(
        "local-vlm-observation-quality-corpus-manifest.v1",
      );
      expect(validManifest.protocolVersion).toBe(OBSERVATION_QUALITY_BENCHMARK_PROTOCOL_VERSION);
      expect(corpusSelectionAuthorized).toBe(false);
      expect(realCorpusManifestCreationAuthorized).toBe(false);
      expect(realExecutionAuthorizedByCorpusSlice).toBe(false);
      expect(OBSERVATION_QUALITY_CASE_COUNT).toBe(16);
    });
  });

  describe("slot plan", () => {
    it("defines all sixteen governed slots with exactly two slots per category", () => {
      expect(OBSERVATION_QUALITY_CORPUS_SLOT_IDS).toHaveLength(16);
      expect(new Set(OBSERVATION_QUALITY_CORPUS_SLOT_IDS).size).toBe(16);
      expect(OBSERVATION_QUALITY_CORPUS_SLOT_CATEGORIES).toHaveLength(8);
      expect(Object.keys(OBSERVATION_QUALITY_CORPUS_SLOT_CATEGORY_BY_SLOT_ID)).toHaveLength(16);

      const coverage = evaluateObservationQualityCorpusCategoryCoverage(validManifest.cases);
      expect(coverage.issues).toEqual([]);
      expect(coverage.counts).toEqual({
        CLEAN_SIMPLE: 2,
        LOW_CONTRAST: 2,
        ROTATED_OR_VERTICAL: 2,
        DENSE_TEXT: 2,
        DECORATIVE_TYPE: 2,
        MULTI_PANEL_OR_WRAPAROUND: 2,
        AMBIGUITY_OR_COMPETING_TEXT: 2,
        ABSTENTION_OPPORTUNITY: 2,
      });
    });
  });

  describe("valid synthetic manifest", () => {
    it("validates a complete frozen synthetic manifest", () => {
      expect(validateObservationQualityCorpusManifest(validManifest)).toEqual({
        ok: true,
        issues: [],
      });
      expect(evaluateObservationQualityFrozenCorpusGate(validManifest)).toEqual({
        satisfied: true,
        issues: [],
      });
    });

    it("canonicalizes deterministically and keeps the digest stable across case order", () => {
      const canonical = canonicalizeObservationQualityCorpusManifestForDigest(validManifest);
      const digest = computeObservationQualityCorpusManifestDigest(validManifest);
      const reversed = buildFrozenManifest({
        cases: [...validManifest.cases].reverse(),
      });

      expect(canonicalizeObservationQualityCorpusManifestForDigest(validManifest)).toBe(canonical);
      expect(computeObservationQualityCorpusManifestDigest(validManifest)).toBe(digest);
      expect(canonicalizeObservationQualityCorpusManifestForDigest(reversed)).toBe(canonical);
      expect(computeObservationQualityCorpusManifestDigest(reversed)).toBe(digest);
      expect(digest).toBe(validManifest.manifestDigest);
    });

    it("keeps the freeze digest stable when later invalidation metadata changes", () => {
      const invalidated = buildFrozenManifest({
        freezeState: "INVALIDATED",
      });

      expect(computeObservationQualityCorpusManifestDigest(invalidated)).toBe(
        computeObservationQualityCorpusManifestDigest(validManifest),
      );
    });
  });

  describe("count and uniqueness validation", () => {
    it("fails when the manifest is underfilled or overfilled", () => {
      expect(
        validateObservationQualityCorpusManifest(
          buildFrozenManifest({
            cases: validManifest.cases.slice(0, 15),
          }),
        ).issues,
      ).toContain("cases: must contain exactly 16 entries, received 15");

      expect(
        validateObservationQualityCorpusManifest(
          buildFrozenManifest({
            cases: [...validManifest.cases, buildCaseEntry("CLEAN_SIMPLE_1", 99)],
          }),
        ).issues,
      ).toContain("cases: must contain exactly 16 entries, received 17");
    });

    it("fails on duplicate slot IDs, source case IDs, source image digests, and derivative digests", () => {
      expect(
        validateObservationQualityCorpusManifest(
          replaceCase(validManifest, "LOW_CONTRAST_2", (entry) => ({
            ...entry,
            slotId: "LOW_CONTRAST_1",
          })) as ObservationQualityCorpusManifest,
        ).issues,
      ).toContain("cases: duplicate slotId LOW_CONTRAST_1");

      expect(
        validateObservationQualityCorpusManifest(
          replaceCase(validManifest, "LOW_CONTRAST_2", (entry) => ({
            ...entry,
            sourceCaseId: "case-003",
          })),
        ).issues,
      ).toContain("cases: duplicate sourceCaseId case-003");

      expect(
        validateObservationQualityCorpusManifest(
          replaceCase(validManifest, "LOW_CONTRAST_2", (entry) => ({
            ...entry,
            sourceImageDigest: digestFor(202),
          })),
        ).issues,
      ).toContain(`cases: duplicate sourceImageDigest ${digestFor(202)}`);

      expect(
        validateObservationQualityCorpusManifest(
          replaceCase(validManifest, "LOW_CONTRAST_2", (entry) => ({
            ...entry,
            derivativeDigest: digestFor(302),
          })),
        ).issues,
      ).toContain(`cases: duplicate derivativeDigest ${digestFor(302)}`);
    });
  });

  describe("digest validation", () => {
    it("rejects uppercase, short, and malformed SHA-256 values", () => {
      expect(
        validateObservationQualityCorpusManifest(
          replaceCase(validManifest, "CLEAN_SIMPLE_1", (entry) => ({
            ...entry,
            sourceImageDigest: entry.sourceImageDigest.toUpperCase(),
          })),
        ).issues,
      ).toContain(
        "cases[0].sourceImageDigest: must be a 64-character lowercase SHA-256 hex digest",
      );

      expect(
        validateObservationQualityCorpusManifest(
          replaceCase(validManifest, "CLEAN_SIMPLE_1", (entry) => ({
            ...entry,
            derivativeDigest: "abc123",
          })),
        ).issues,
      ).toContain("cases[0].derivativeDigest: must be a 64-character lowercase SHA-256 hex digest");

      expect(
        validateObservationQualityCorpusManifest({
          ...validManifest,
          sourceManifestDigest: "z".repeat(64),
        }),
      ).toEqual({
        ok: false,
        issues: [
          "sourceManifestDigest: must be null or a 64-character lowercase SHA-256 hex digest",
        ],
      });
    });

    it("fails the frozen gate when the manifest digest does not match the canonical digest", () => {
      expect(
        evaluateObservationQualityFrozenCorpusGate({
          ...validManifest,
          manifestDigest: digestFor(999),
        }),
      ).toEqual({
        satisfied: false,
        issues: ["manifestDigest does not match the canonical manifest digest"],
      });
    });
  });

  describe("freeze state rules", () => {
    it("accepts a valid FROZEN manifest", () => {
      expect(evaluateObservationQualityFrozenCorpusGate(validManifest).satisfied).toBe(true);
    });

    it("lets DRAFT and INVALIDATED validate structurally but not satisfy the frozen gate", () => {
      const draft = buildFrozenManifest({ freezeState: "DRAFT" });
      const invalidated = buildFrozenManifest({ freezeState: "INVALIDATED" });

      expect(validateObservationQualityCorpusManifest(draft)).toEqual({
        ok: true,
        issues: [],
      });
      expect(evaluateObservationQualityFrozenCorpusGate(draft)).toEqual({
        satisfied: false,
        issues: ["freezeState must be FROZEN, received DRAFT"],
      });

      expect(validateObservationQualityCorpusManifest(invalidated)).toEqual({
        ok: true,
        issues: [],
      });
      expect(evaluateObservationQualityFrozenCorpusGate(invalidated)).toEqual({
        satisfied: false,
        issues: ["freezeState must be FROZEN, received INVALIDATED"],
      });
    });

    it("rejects inconsistent freeze-state metadata", () => {
      expect(
        validateObservationQualityCorpusManifest({
          ...validManifest,
          invalidationReason: "forbidden",
          invalidatedAt: "2026-07-16T03:00:00Z",
          invalidatedBy: "reviewer",
        }),
      ).toEqual({
        ok: false,
        issues: ["invalidationReason: must be null when freezeState is FROZEN"],
      });

      expect(
        validateObservationQualityCorpusManifest(
          buildFrozenManifest({
            freezeState: "INVALIDATED",
            invalidationReason: null,
          }),
        ).issues,
      ).toContain("invalidationReason: must be present when freezeState is INVALIDATED");

      expect(
        validateObservationQualityCorpusManifest(
          buildFrozenManifest({
            freezeState: "DRAFT",
            manifestDigest: digestFor(777),
          }),
        ).issues,
      ).toContain("manifestDigest: must be null while freezeState is DRAFT");
    });
  });

  describe("case metadata validation", () => {
    it("rejects invalid case metadata", () => {
      expect(
        validateObservationQualityCorpusManifest(
          replaceCase(validManifest, "CLEAN_SIMPLE_1", (entry) => ({
            ...entry,
            beverageCategory: "distilled-spirits" as unknown as "wine",
          })),
        ).issues,
      ).toContain("cases[0].beverageCategory: must be wine, received distilled-spirits");

      expect(
        validateObservationQualityCorpusManifest(
          replaceCase(validManifest, "CLEAN_SIMPLE_1", (entry) => ({
            ...entry,
            mediaType: "image/webp" as unknown as ObservationQualityCorpusCaseEntry["mediaType"],
          })),
        ).issues,
      ).toContain("cases[0].mediaType: must be one of image/png, image/jpeg");

      expect(
        validateObservationQualityCorpusManifest(
          replaceCase(validManifest, "CLEAN_SIMPLE_1", (entry) => ({
            ...entry,
            width: 0,
          })),
        ).issues,
      ).toContain("cases[0].width: must be a positive integer");

      expect(
        validateObservationQualityCorpusManifest(
          replaceCase(validManifest, "CLEAN_SIMPLE_1", (entry) => ({
            ...entry,
            height: -1,
          })),
        ).issues,
      ).toContain("cases[0].height: must be a positive integer");

      expect(
        validateObservationQualityCorpusManifest(
          replaceCase(validManifest, "CLEAN_SIMPLE_1", (entry) => ({
            ...entry,
            sourceArtifactRef: "",
          })),
        ).issues,
      ).toContain("cases[0].sourceArtifactRef: must be a safe POSIX repository-relative path");

      expect(
        validateObservationQualityCorpusManifest(
          replaceCase(validManifest, "CLEAN_SIMPLE_1", (entry) => ({
            ...entry,
            sourceProvenance:
              "unknown-source" as unknown as ObservationQualityCorpusCaseEntry["sourceProvenance"],
          })),
        ).issues,
      ).toContain(
        `cases[0].sourceProvenance: must be one of ${OBSERVATION_QUALITY_CORPUS_SOURCE_PROVENANCES.join(", ")}`,
      );

      expect(
        validateObservationQualityCorpusManifest(
          replaceCase(validManifest, "CLEAN_SIMPLE_1", (entry) => ({
            ...entry,
            usageStatus:
              "usage-or-provenance-concern" as unknown as ObservationQualityCorpusCaseEntry["usageStatus"],
          })),
        ).issues,
      ).toContain(
        `cases[0].usageStatus: must be one of ${OBSERVATION_QUALITY_CORPUS_ALLOWED_USAGE_STATUSES.join(", ")}`,
      );

      expect(
        validateObservationQualityCorpusManifest(
          replaceCase(validManifest, "CLEAN_SIMPLE_1", (entry) => ({
            ...entry,
            selectionRationale: "",
          })),
        ).issues,
      ).toContain("cases[0].selectionRationale: must be 1-500 trimmed characters");

      expect(
        validateObservationQualityCorpusManifest(
          replaceCase(validManifest, "CLEAN_SIMPLE_1", (entry) => ({
            ...entry,
            selectionRationale: "x".repeat(501),
          })),
        ).issues,
      ).toContain("cases[0].selectionRationale: must be 1-500 trimmed characters");

      expect(
        validateObservationQualityCorpusManifest(
          replaceCase(validManifest, "CLEAN_SIMPLE_1", (entry) => ({
            ...entry,
            selectionRationale: "This note mentions a human score comparison.",
          })),
        ).issues,
      ).toContain("cases[0].selectionRationale: contains forbidden benchmark-result language");
    });
  });

  describe("annotation and slot compatibility", () => {
    it("accepts valid support for every slot category", () => {
      const casesByCategory = new Map<
        ObservationQualityCorpusSlotCategory,
        ObservationQualityCorpusCaseEntry
      >();
      for (const entry of validManifest.cases) {
        const category = observationQualityCorpusSlotCategory(entry.slotId);
        if (!casesByCategory.has(category)) {
          casesByCategory.set(category, entry);
        }
      }

      for (const category of OBSERVATION_QUALITY_CORPUS_SLOT_CATEGORIES) {
        const entry = casesByCategory.get(category);
        expect(entry).toBeDefined();
        expect(validateObservationQualityCorpusSlotSupport(entry!)).toEqual({
          ok: true,
          issues: [],
        });
      }
    });

    it("rejects missing support for every slot category", () => {
      for (const slotId of OBSERVATION_QUALITY_CORPUS_SLOT_IDS) {
        const broken = replaceCase(validManifest, slotId, (entry) => ({
          ...entry,
          challengeTags: ["front-label"],
          slotSupport: {
            kind: "CHALLENGE_TAG",
            tag: "front-label",
          },
          observationOpportunityState: slotId.startsWith("ABSTENTION_")
            ? "OBSERVATION_OPPORTUNITY_PRESENT"
            : entry.observationOpportunityState,
        }));
        const issue = validateObservationQualityCorpusManifest(broken).issues.find((candidate) =>
          candidate.includes(".slotSupport:"),
        );
        expect(issue).toBeDefined();
      }
    });

    it("requires abstention support and positive clean/simple support explicitly", () => {
      const abstentionBroken = replaceCase(validManifest, "ABSTENTION_OPPORTUNITY_1", (entry) => ({
        ...entry,
        observationOpportunityState: "OBSERVATION_OPPORTUNITY_PRESENT",
        challengeTags: ["front-label"],
        slotSupport: {
          kind: "CHALLENGE_TAG",
          tag: "front-label",
        },
      }));
      expect(validateObservationQualityCorpusManifest(abstentionBroken).issues).toContain(
        "cases[14].slotSupport: ABSTENTION_OPPORTUNITY_1 requires NO_CLEAR_OBSERVATION_OPPORTUNITY, UNCERTAIN, or explicit abstention-relevant slot support",
      );

      const cleanBroken = replaceCase(validManifest, "CLEAN_SIMPLE_1", (entry) => ({
        ...entry,
        challengeTags: ["low-contrast"],
        slotSupport: {
          kind: "CHALLENGE_TAG",
          tag: "low-contrast",
        },
      }));
      expect(validateObservationQualityCorpusManifest(cleanBroken).issues).toContain(
        "cases[0].slotSupport: CLEAN_SIMPLE_1 requires slot support compatible with CLEAN_SIMPLE",
      );
    });
  });

  describe("gate determinism", () => {
    it("produces stable ordered issues for the same invalid manifest", () => {
      const invalid = buildFrozenManifest({
        manifestDigest: digestFor(321),
        cases: validManifest.cases.slice(0, 15),
      });

      const first = evaluateObservationQualityFrozenCorpusGate(invalid);
      const second = evaluateObservationQualityFrozenCorpusGate(invalid);

      expect(first).toEqual(second);
      expect(first.issues).toEqual([
        "cases: must contain exactly 16 entries, received 15",
        "cases: missing required slot ABSTENTION_OPPORTUNITY_2",
        "slot category ABSTENTION_OPPORTUNITY must contain exactly 2 cases (expected 2, received 1)",
        "manifestDigest does not match the canonical manifest digest",
      ]);
    });

    it("surfaces multiple failures and returns only gate semantics", () => {
      const invalid = replaceCase(
        buildFrozenManifest({
          manifestDigest: digestFor(654),
        }),
        "LOW_CONTRAST_2",
        (entry) => ({
          ...entry,
          sourceCaseId: "case-003",
          sourceImageDigest: digestFor(202),
          selectionRationale: "",
        }),
      );

      expect(evaluateObservationQualityFrozenCorpusGate(invalid)).toEqual({
        satisfied: false,
        issues: [
          "cases[3].selectionRationale: must be 1-500 trimmed characters",
          "cases: duplicate sourceCaseId case-003",
          `cases: duplicate sourceImageDigest ${digestFor(202)}`,
          "manifestDigest does not match the canonical manifest digest",
        ],
      });
      expect(Object.keys(evaluateObservationQualityFrozenCorpusGate(invalid)).sort()).toEqual([
        "issues",
        "satisfied",
      ]);
    });
  });
});
