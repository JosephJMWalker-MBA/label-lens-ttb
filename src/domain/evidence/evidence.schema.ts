import { z } from "zod";

import {
  ANALYZER_AMBIGUITY_REASONS,
  ANALYZER_CANDIDATE_RANKING_MODES,
  ANALYZER_CANDIDATE_RANKING_STRATEGIES,
  ANALYZER_OBSERVATION_STATES,
  ANALYZER_RANKING_COMPARATOR_IDS,
  ANALYZER_RANKING_DIRECTIONS,
  ANALYZER_RANKING_SCORE_FACTOR_DIRECTIONS,
  ANALYZER_RANKING_SCORE_FACTOR_IDS,
} from "@/pipeline/analyzer/analyzer.types";

/**
 * The single canonical runtime schema for evidence geometry, alternates, and
 * field observations. Every boundary that claims to hold a valid observation —
 * the analyzer response, the immutable result, and the JSON export — reuses
 * these schemas so the committed status model is enforced identically and a
 * strong analyzer schema is never shadowed by a weaker copy.
 *
 * Semantic refinements go beyond shape: geometry stays inside the source image,
 * state-dependent invariants forbid contradictory records (e.g. NOT_OBSERVED
 * with a stale value), and alternates are unique and never echo the selection.
 *
 * String bounds below are DEFENSIVE runtime limits against pathological
 * deserialized payloads, not regulatory maximums — they sit far above lawful
 * label text and the committed fixtures.
 */

/** Defensive upper bound for any single extracted/observed string. */
export const MAX_EVIDENCE_STRING = 4096;

const confidence = z.number().finite().min(0).max(1);

const safeNonNegativeInt = z
  .number()
  .int()
  .nonnegative()
  .refine((v) => Number.isSafeInteger(v), { message: "must be a safe integer" })
  .refine((v) => !Object.is(v, -0), { message: "must not be negative zero" });

const safePositiveInt = z
  .number()
  .int()
  .positive()
  .refine((v) => Number.isSafeInteger(v), { message: "must be a safe integer" });

/**
 * Axis-aligned box in the original image frame. Coordinates are safe integers,
 * dimensions are positive, and the box must lie fully within the reported image
 * dimensions. Boxes are never clipped or invented — an out-of-bounds box is a
 * hard rejection.
 */
export const geometrySchema = z
  .object({
    imageIndex: safeNonNegativeInt,
    x: safeNonNegativeInt,
    y: safeNonNegativeInt,
    width: safePositiveInt,
    height: safePositiveInt,
    imageWidth: safePositiveInt,
    imageHeight: safePositiveInt,
  })
  .strict()
  .superRefine((g, ctx) => {
    if (g.x + g.width > g.imageWidth) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["width"],
        message: "x + width exceeds imageWidth (box outside the image).",
      });
    }
    if (g.y + g.height > g.imageHeight) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["height"],
        message: "y + height exceeds imageHeight (box outside the image).",
      });
    }
  });

const boundedNonEmpty = z.string().min(1).max(MAX_EVIDENCE_STRING);

const ocrRawConfidence = z.number().finite().min(0).max(100).nullable();

const ocrConfidenceSchema = z
  .object({
    aggregation: z.literal("mean"),
    rawScale: z.literal("0-100"),
    rawTokenConfidences: z.array(ocrRawConfidence),
    rawMean: ocrRawConfidence,
    rawMin: ocrRawConfidence,
    rawMax: ocrRawConfidence,
    missingTokenCount: safeNonNegativeInt,
  })
  .strict()
  .superRefine((ocr, ctx) => {
    const observed = ocr.rawTokenConfidences.filter((value): value is number => value !== null);
    const missingCount = ocr.rawTokenConfidences.filter((value) => value === null).length;
    if (missingCount !== ocr.missingTokenCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["missingTokenCount"],
        message: "missingTokenCount must match null rawTokenConfidences.",
      });
    }
    if (observed.length === 0) {
      if (ocr.rawMean !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rawMean"],
          message: "rawMean must be null when no rawTokenConfidences are observed.",
        });
      }
      if (ocr.rawMin !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rawMin"],
          message: "rawMin must be null when no rawTokenConfidences are observed.",
        });
      }
      if (ocr.rawMax !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rawMax"],
          message: "rawMax must be null when no rawTokenConfidences are observed.",
        });
      }
      return;
    }

    const expectedMean = observed.reduce((sum, value) => sum + value, 0) / observed.length;
    const expectedMin = Math.min(...observed);
    const expectedMax = Math.max(...observed);
    if (ocr.rawMean === null || Math.abs(ocr.rawMean - expectedMean) > 1e-9) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rawMean"],
        message: "rawMean must equal the mean of observed rawTokenConfidences.",
      });
    }
    if (ocr.rawMin === null || ocr.rawMin !== expectedMin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rawMin"],
        message: "rawMin must equal the minimum observed rawTokenConfidence.",
      });
    }
    if (ocr.rawMax === null || ocr.rawMax !== expectedMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["rawMax"],
        message: "rawMax must equal the maximum observed rawTokenConfidence.",
      });
    }
  });

const candidateProvenanceSchema = z
  .object({
    passId: z.string().min(1),
    passKind: z.string().min(1),
    triggerReasons: z.array(z.string().min(1)),
    preprocessing: z.array(z.string().min(1)),
    regionName: z.string().min(1),
    supportingPassIds: z.array(z.string().min(1)).min(1),
    supportingPassKinds: z.array(z.string().min(1)).min(1),
    recoveryPassUsed: z.boolean(),
  })
  .strict();

const rankingComparatorEntrySchema = z
  .object({
    id: z.enum(ANALYZER_RANKING_COMPARATOR_IDS),
    direction: z.enum(ANALYZER_RANKING_DIRECTIONS),
    value: z.union([z.number().finite(), z.string(), z.boolean()]),
  })
  .strict();

const rankingScoreFactorSchema = z
  .object({
    id: z.enum(ANALYZER_RANKING_SCORE_FACTOR_IDS),
    value: z.number().finite(),
    contribution: z.number().finite(),
    direction: z.enum(ANALYZER_RANKING_SCORE_FACTOR_DIRECTIONS),
  })
  .strict();

const rankingSchema = z
  .object({
    strategy: z.enum(ANALYZER_CANDIDATE_RANKING_STRATEGIES),
    orderingMode: z.enum(ANALYZER_CANDIDATE_RANKING_MODES),
    comparator: z.array(rankingComparatorEntrySchema).min(1),
    rankingScore: z.number().finite().optional(),
    scoreFactors: z.array(rankingScoreFactorSchema).optional(),
  })
  .strict();

export const alternateSchema = z
  .object({
    value: boundedNonEmpty,
    confidence,
    ocrEvidenceScore: confidence,
    ocrConfidence: ocrConfidenceSchema,
    candidateProvenance: candidateProvenanceSchema,
    ranking: rankingSchema,
    geometry: geometrySchema.optional(),
  })
  .strict()
  .superRefine((alternate, ctx) => {
    if (Math.abs(alternate.confidence - alternate.ocrEvidenceScore) > 1e-9) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confidence"],
        message: "confidence must match ocrEvidenceScore exactly.",
      });
    }
  });

/** NFC-normalized value + serialized geometry: the key for alternate uniqueness. */
function alternateKey(a: z.infer<typeof alternateSchema>): string {
  return `${a.value.normalize("NFC")}|${a.geometry ? JSON.stringify(a.geometry) : ""}`;
}

/**
 * One bounded field observation with state-dependent semantic invariants.
 *
 * Duplicate detection for alternates uses the NFC-normalized value together
 * with the geometry box; the stored OCR text itself is never altered.
 */
export const observationSchema = z
  .object({
    state: z.enum(ANALYZER_OBSERVATION_STATES),
    value: boundedNonEmpty.nullable(),
    normalizedValue: boundedNonEmpty.nullable().optional(),
    rawText: boundedNonEmpty.optional(),
    confidence,
    ocrEvidenceScore: confidence,
    ocrConfidence: ocrConfidenceSchema.optional(),
    candidateProvenance: candidateProvenanceSchema.optional(),
    ranking: rankingSchema.optional(),
    geometry: geometrySchema.optional(),
    alternates: z.array(alternateSchema).default([]),
    ambiguityReason: z.enum(ANALYZER_AMBIGUITY_REASONS).optional(),
  })
  .strict()
  .superRefine((obs, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

    if (obs.state === "NOT_OBSERVED") {
      if (obs.value !== null) issue(["value"], "NOT_OBSERVED must not carry a selected value.");
      if (obs.normalizedValue !== undefined && obs.normalizedValue !== null) {
        issue(["normalizedValue"], "NOT_OBSERVED must not carry a normalized candidate.");
      }
      if (obs.rawText !== undefined) {
        issue(["rawText"], "NOT_OBSERVED must not carry stale raw OCR text.");
      }
      if (obs.geometry !== undefined) {
        issue(["geometry"], "NOT_OBSERVED must not carry a selected geometry.");
      }
      if (obs.confidence !== 0) {
        issue(["confidence"], "NOT_OBSERVED confidence must be exactly 0.");
      }
      if (obs.ocrEvidenceScore !== 0) {
        issue(["ocrEvidenceScore"], "NOT_OBSERVED ocrEvidenceScore must be exactly 0.");
      }
      if (obs.alternates.length !== 0) {
        issue(["alternates"], "NOT_OBSERVED must not carry alternates.");
      }
      if (obs.ocrConfidence !== undefined) {
        issue(["ocrConfidence"], "NOT_OBSERVED must not carry OCR confidence detail.");
      }
      if (obs.candidateProvenance !== undefined) {
        issue(["candidateProvenance"], "NOT_OBSERVED must not carry candidate provenance.");
      }
      if (obs.ranking !== undefined) {
        issue(["ranking"], "NOT_OBSERVED must not carry ranking semantics.");
      }
      return;
    }

    if (Math.abs(obs.confidence - obs.ocrEvidenceScore) > 1e-9) {
      issue(["confidence"], "confidence must match ocrEvidenceScore exactly.");
    }

    // Present states (OBSERVED, LOW_CONFIDENCE, AMBIGUOUS) must retain evidence.
    if (obs.value === null) issue(["value"], `${obs.state} must preserve the selected value.`);
    if (obs.normalizedValue === undefined || obs.normalizedValue === null) {
      issue(["normalizedValue"], `${obs.state} must preserve a normalized candidate.`);
    }
    if (obs.rawText === undefined) {
      issue(["rawText"], `${obs.state} must preserve the raw OCR text.`);
    }
    if (obs.geometry === undefined) {
      issue(["geometry"], `${obs.state} must preserve the source geometry.`);
    }
    if (obs.ocrConfidence === undefined) {
      issue(["ocrConfidence"], `${obs.state} must preserve OCR confidence detail.`);
    }
    if (obs.candidateProvenance === undefined) {
      issue(["candidateProvenance"], `${obs.state} must preserve candidate provenance.`);
    }
    if (obs.ranking === undefined) {
      issue(["ranking"], `${obs.state} must preserve ranking semantics.`);
    }

    // Alternates: unique, ordered as given, and never echoing the selection.
    const seen = new Set<string>();
    for (let i = 0; i < obs.alternates.length; i += 1) {
      const key = alternateKey(obs.alternates[i]);
      if (seen.has(key)) issue(["alternates", i], "duplicate alternate (value + geometry).");
      seen.add(key);
      if (
        obs.value !== null &&
        obs.alternates[i].value.normalize("NFC") === obs.value.normalize("NFC")
      ) {
        issue(["alternates", i], "alternate must not be identical to the selected value.");
      }
    }

    // AMBIGUOUS uncertainty is honestly represented one of two ways: rival
    // candidates carried as alternates, OR a single unconfirmed candidate marked
    // with an explicit reason code. A zero-alternate AMBIGUOUS with no reason is
    // still an invalid shape (it would lose why the evidence is uncertain).
    if (obs.state === "AMBIGUOUS" && obs.alternates.length < 1) {
      if (obs.ambiguityReason !== "single_unconfirmed_candidate") {
        issue(
          ["alternates"],
          "AMBIGUOUS with no alternate must set ambiguityReason 'single_unconfirmed_candidate'.",
        );
      }
    }

    // `ambiguityReason` describes AMBIGUOUS evidence only.
    if (obs.ambiguityReason !== undefined && obs.state !== "AMBIGUOUS") {
      issue(["ambiguityReason"], "ambiguityReason is only valid for an AMBIGUOUS observation.");
    }
  });
