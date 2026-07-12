import { z } from "zod";

import {
  ANALYZER_AMBIGUITY_REASONS,
  ANALYZER_OBSERVATION_STATES,
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

export const alternateSchema = z
  .object({
    value: boundedNonEmpty,
    confidence,
    geometry: geometrySchema.optional(),
  })
  .strict();

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
      if (obs.alternates.length !== 0) {
        issue(["alternates"], "NOT_OBSERVED must not carry alternates.");
      }
      return;
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
