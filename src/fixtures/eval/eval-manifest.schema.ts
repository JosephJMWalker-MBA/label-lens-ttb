import { z } from "zod";

import { err, ok, type Result } from "@/shared/result";

import {
  EVAL_ALCOHOL_CHARACTERISTICS,
  EVAL_ANNOTATION_CONFIDENCES,
  EVAL_BEVERAGE_CATEGORIES,
  EVAL_IMAGE_MEDIA_TYPES,
  EVAL_IMAGE_ORIENTATIONS,
  EVAL_MANIFEST_SCHEMA_VERSION,
  EVAL_QC_CHECKS,
  EVAL_REVIEW_REASONS,
  EVAL_TEXT_ORIENTATIONS,
  EVAL_USAGE_STATUSES,
  EVAL_VISUAL_STRATA,
  type EvalManifest,
  type EvalManifestError,
} from "./eval-manifest.types";

/** Strict validator for the corpus-scale evaluation inventory and annotations. */

const nonEmpty = z.string().trim().min(1);

function uniqueStrings(values: string[]): boolean {
  return new Set(values).size === values.length;
}

function safeRelativePath(value: string): boolean {
  if (value.length === 0 || value.includes("\0") || value.includes("\\")) return false;
  if (value.startsWith("/") || /^[A-Za-z]:/.test(value)) return false;
  const segments = value.split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

const repoRelativePath = nonEmpty.refine(safeRelativePath, {
  message: "must be a safe POSIX repository-relative path",
});

const imagePath = repoRelativePath.refine((value) => /\.(?:png|jpe?g)$/i.test(value), {
  message: "must name a PNG or JPEG image",
});

const date = z.string().refine(validDate, { message: "must be a valid YYYY-MM-DD date" });

const normalizedBox = z
  .object({
    x: z.number().finite().min(0).max(1),
    y: z.number().finite().min(0).max(1),
    width: z.number().finite().positive().max(1),
    height: z.number().finite().positive().max(1),
  })
  .strict()
  .superRefine((box, ctx) => {
    if (box.x + box.width > 1 + Number.EPSILON) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["width"],
        message: "x + width exceeds 1",
      });
    }
    if (box.y + box.height > 1 + Number.EPSILON) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["height"],
        message: "y + height exceeds 1",
      });
    }
  });

const textOrientation = z.enum(EVAL_TEXT_ORIENTATIONS);
const presentTextOrientation = textOrientation.exclude(["not-applicable"]);

const brandPresent = z
  .object({
    presence: z.literal("present"),
    acceptablePresentations: z.array(nonEmpty).min(1).refine(uniqueStrings, {
      message: "acceptable brand presentations must be unique",
    }),
    genuinelyAmbiguous: z.boolean(),
    ambiguityReason: z.union([nonEmpty, z.null()]),
    forbiddenPresentations: z.array(nonEmpty).refine(uniqueStrings, {
      message: "forbidden brand presentations must be unique",
    }),
    approxGeometry: z.array(normalizedBox),
    orientation: presentTextOrientation,
  })
  .strict()
  .superRefine((brand, ctx) => {
    if (brand.genuinelyAmbiguous && brand.ambiguityReason === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ambiguityReason"],
        message: "genuine ambiguity requires an artwork or regulatory-context reason",
      });
    }
    if (!brand.genuinelyAmbiguous && brand.ambiguityReason !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ambiguityReason"],
        message: "a determinate brand must not carry an ambiguity reason",
      });
    }
    const acceptable = new Set(
      brand.acceptablePresentations.map((value) => value.toLocaleLowerCase().replace(/\s+/g, " ")),
    );
    for (const forbidden of brand.forbiddenPresentations) {
      if (acceptable.has(forbidden.toLocaleLowerCase().replace(/\s+/g, " "))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["forbiddenPresentations"],
          message: "a brand presentation cannot be both acceptable and forbidden",
        });
      }
    }
  });

const brandAbsent = z
  .object({
    presence: z.literal("absent"),
    acceptablePresentations: z.array(z.never()).length(0),
    genuinelyAmbiguous: z.literal(false),
    ambiguityReason: z.null(),
    absenceReason: nonEmpty,
    forbiddenPresentations: z.array(nonEmpty).refine(uniqueStrings, {
      message: "forbidden brand presentations must be unique",
    }),
    approxGeometry: z.array(z.never()).length(0),
    orientation: z.literal("not-applicable"),
  })
  .strict();

const percent = z
  .number()
  .finite()
  .positive()
  .max(100)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-8, {
    message: "alcohol percent may have at most two decimal places",
  });

const alcoholPresent = z
  .object({
    presence: z.literal("present"),
    acceptablePercents: z
      .array(percent)
      .min(1)
      .refine((values) => new Set(values).size === values.length, {
        message: "acceptable alcohol percents must be unique",
      }),
    acceptableStatements: z.array(nonEmpty).min(1).refine(uniqueStrings, {
      message: "acceptable alcohol statements must be unique",
    }),
    characteristics: z.array(z.enum(EVAL_ALCOHOL_CHARACTERISTICS)).refine(uniqueStrings, {
      message: "alcohol characteristics must be unique",
    }),
    approxGeometry: z.array(normalizedBox),
    orientation: presentTextOrientation,
  })
  .strict()
  .superRefine((alcohol, ctx) => {
    const hasDecimal = alcohol.acceptablePercents.some((value) => !Number.isInteger(value));
    const marksDecimal = alcohol.characteristics.includes("decimal-value");
    if (hasDecimal !== marksDecimal) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["characteristics"],
        message: "decimal-value must exactly reflect whether an acceptable percent is fractional",
      });
    }

    const rotated = [
      "vertical-clockwise",
      "vertical-counterclockwise",
      "vertical-stacked",
      "rotated-180",
      "mixed",
    ].includes(alcohol.orientation);
    if (rotated !== alcohol.characteristics.includes("rotated-or-vertical")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["characteristics"],
        message: "rotated-or-vertical must agree with the annotated alcohol orientation",
      });
    }

    if (
      alcohol.characteristics.includes("no-percent-sign") &&
      alcohol.acceptableStatements.every((statement) => statement.includes("%"))
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["acceptableStatements"],
        message: "no-percent-sign requires at least one statement variant without %",
      });
    }
  });

const alcoholAbsent = z
  .object({
    presence: z.literal("absent"),
    acceptablePercents: z.array(z.never()).length(0),
    acceptableStatements: z.array(z.never()).length(0),
    characteristics: z.array(z.never()).length(0),
    absenceReason: nonEmpty,
    approxGeometry: z.array(z.never()).length(0),
    orientation: z.literal("not-applicable"),
  })
  .strict();

const annotation = z
  .object({
    brand: z.union([brandPresent, brandAbsent]),
    alcohol: z.union([alcoholPresent, alcoholAbsent]),
    confidence: z
      .object({
        overall: z.enum(EVAL_ANNOTATION_CONFIDENCES),
        brand: z.enum(EVAL_ANNOTATION_CONFIDENCES),
        alcohol: z.enum(EVAL_ANNOTATION_CONFIDENCES),
      })
      .strict(),
    provenance: z.object({ annotatedBy: nonEmpty, annotatedOn: date, method: nonEmpty }).strict(),
    notes: nonEmpty,
  })
  .strict();

const qcCorrection = z
  .object({
    fieldPath: nonEmpty,
    before: z.string(),
    after: z.string(),
    reason: nonEmpty,
  })
  .strict();

const qualityControl = z
  .object({
    reviewedBy: nonEmpty,
    reviewedOn: date,
    method: z.literal("second-pass-visual-inspection"),
    outcome: z.enum(["confirmed", "corrected"]),
    checks: z
      .array(z.enum(EVAL_QC_CHECKS))
      .length(EVAL_QC_CHECKS.length)
      .refine((checks) => EVAL_QC_CHECKS.every((check) => checks.includes(check)), {
        message: "quality control must record every required check exactly once",
      }),
    corrections: z.array(qcCorrection),
    notes: nonEmpty,
  })
  .strict()
  .superRefine((qc, ctx) => {
    if (qc.outcome === "confirmed" && qc.corrections.length !== 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["corrections"],
        message: "confirmed annotations must not carry corrections",
      });
    }
    if (qc.outcome === "corrected" && qc.corrections.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["corrections"],
        message: "corrected annotations must list at least one correction",
      });
    }
  });

const imageIdentity = z
  .object({
    mediaType: z.enum(EVAL_IMAGE_MEDIA_TYPES),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();

const source = z
  .object({
    authority: nonEmpty,
    description: nonEmpty,
    usageStatus: z.enum(EVAL_USAGE_STATUSES),
    provenanceRefs: z.array(repoRelativePath).min(1).refine(uniqueStrings, {
      message: "provenance references must be unique",
    }),
  })
  .strict();

const inspection = z
  .object({
    imageOrientation: z.enum(EVAL_IMAGE_ORIENTATIONS),
    visualStrata: z.array(z.enum(EVAL_VISUAL_STRATA)).min(1).refine(uniqueStrings, {
      message: "visual strata must be unique",
    }),
    reviewReasons: z.array(z.enum(EVAL_REVIEW_REASONS)).refine(uniqueStrings, {
      message: "review reasons must be unique",
    }),
    notes: nonEmpty,
  })
  .strict();

const recordBase = z
  .object({
    caseId: z
      .string()
      .regex(/^[a-z0-9][a-z0-9._-]*$/, "must use stable lowercase path-safe characters"),
    imagePath,
    expectedSha256: z.string().regex(/^[0-9a-f]{64}$/, "sha256 must be 64 lowercase hex chars"),
    image: imageIdentity,
    beverageCategory: z.enum(EVAL_BEVERAGE_CATEGORIES),
    source,
    inspection,
  })
  .strict();

const includedRecord = recordBase
  .extend({
    status: z.literal("included"),
    exclusionReason: z.null(),
    duplicateOfCaseId: z.null(),
    annotation,
    qualityControl,
  })
  .strict();

const duplicateRecord = recordBase
  .extend({
    status: z.literal("excluded_duplicate"),
    exclusionReason: nonEmpty,
    duplicateOfCaseId: z
      .string()
      .regex(/^[a-z0-9][a-z0-9._-]*$/, "must reference a stable case id"),
    annotation: z.null(),
    qualityControl: z.null(),
  })
  .strict();

function excludedRecord(
  status: Exclude<z.infer<typeof recordStatus>, "included" | "excluded_duplicate">,
) {
  return recordBase
    .extend({
      status: z.literal(status),
      exclusionReason: nonEmpty,
      duplicateOfCaseId: z.null(),
      annotation: z.null(),
      qualityControl: z.null(),
    })
    .strict();
}

const recordStatus = z.enum([
  "included",
  "excluded_duplicate",
  "excluded_unreadable",
  "excluded_outside_current_scope",
  "excluded_uncertain_truth",
  "excluded_usage_or_provenance_concern",
  "excluded_other",
]);

const evalRecord = z.discriminatedUnion("status", [
  includedRecord,
  duplicateRecord,
  excludedRecord("excluded_unreadable"),
  excludedRecord("excluded_outside_current_scope"),
  excludedRecord("excluded_uncertain_truth"),
  excludedRecord("excluded_usage_or_provenance_concern"),
  excludedRecord("excluded_other"),
]);

export const evalManifestSchema = z
  .object({
    schemaVersion: z.literal(EVAL_MANIFEST_SCHEMA_VERSION),
    corpusRoot: z.literal("tests/fixtures/precheck"),
    description: nonEmpty,
    records: z.array(evalRecord).min(1),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const issue = (index: number, field: string, message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["records", index, field], message });

    const byId = new Map(manifest.records.map((record) => [record.caseId, record]));
    const ids = new Set<string>();
    const paths = new Set<string>();
    const byHash = new Map<string, typeof manifest.records>();

    manifest.records.forEach((record, index) => {
      if (ids.has(record.caseId)) issue(index, "caseId", "case ids must be unique");
      ids.add(record.caseId);
      if (paths.has(record.imagePath)) issue(index, "imagePath", "image paths must be unique");
      paths.add(record.imagePath);

      const expectedMedia = /\.png$/i.test(record.imagePath) ? "image/png" : "image/jpeg";
      if (record.image.mediaType !== expectedMedia) {
        issue(index, "image.mediaType", "media type must agree with the image extension");
      }
      const expectedOrientation =
        record.image.width === record.image.height
          ? "square"
          : record.image.width > record.image.height
            ? "landscape"
            : "portrait";
      if (
        record.inspection.imageOrientation !== "unknown" &&
        record.inspection.imageOrientation !== expectedOrientation
      ) {
        issue(index, "inspection.imageOrientation", "image orientation must agree with dimensions");
      }

      const group = byHash.get(record.expectedSha256) ?? [];
      group.push(record);
      byHash.set(record.expectedSha256, group);

      const usageConcern = record.source.usageStatus === "usage-or-provenance-concern";
      if (usageConcern !== (record.status === "excluded_usage_or_provenance_concern")) {
        issue(
          index,
          "source.usageStatus",
          "usage-or-provenance-concern must agree with the exclusion disposition",
        );
      }
      if (
        record.status === "included" &&
        record.inspection.reviewReasons.includes("uncertain-usage-provenance")
      ) {
        issue(
          index,
          "inspection.reviewReasons",
          "an included case cannot retain uncertain usage provenance",
        );
      }
      if (
        record.status === "excluded_usage_or_provenance_concern" &&
        !record.inspection.reviewReasons.includes("uncertain-usage-provenance")
      ) {
        issue(
          index,
          "inspection.reviewReasons",
          "usage/provenance exclusions must enter the review queue",
        );
      }
      if (
        record.status === "excluded_uncertain_truth" &&
        !record.inspection.reviewReasons.some((reason) =>
          [
            "uncertain-brand-identity",
            "illegible-alcohol-text",
            "conflicting-front-back-presentations",
            "unclear-crop-or-wraparound-context",
            "other",
          ].includes(reason),
        )
      ) {
        issue(
          index,
          "inspection.reviewReasons",
          "uncertain truth must state a review-queue reason",
        );
      }
      if (
        record.status === "excluded_unreadable" &&
        !record.inspection.reviewReasons.some((reason) =>
          ["uncertain-brand-identity", "illegible-alcohol-text", "other"].includes(reason),
        )
      ) {
        issue(
          index,
          "inspection.reviewReasons",
          "unreadable images must state what could not be read",
        );
      }
      if (
        record.status === "excluded_outside_current_scope" &&
        (!record.inspection.visualStrata.includes("out-of-scope-category") ||
          record.beverageCategory === "wine")
      ) {
        issue(
          index,
          "inspection.visualStrata",
          "outside-scope images must carry the out-of-scope stratum and a non-wine category",
        );
      }
      if (
        record.status === "excluded_other" &&
        !record.inspection.reviewReasons.includes("other")
      ) {
        issue(
          index,
          "inspection.reviewReasons",
          "other exclusions must be documented in the review queue",
        );
      }

      if (record.status === "included") {
        if (record.beverageCategory !== "wine") {
          issue(
            index,
            "beverageCategory",
            "only wine records may be included in the wine evaluation",
          );
        }
        const ambiguous = record.annotation.brand.genuinelyAmbiguous;
        if (ambiguous !== record.inspection.visualStrata.includes("genuinely-ambiguous")) {
          issue(
            index,
            "inspection.visualStrata",
            "genuinely-ambiguous stratum must agree with brand truth",
          );
        }
        const alcoholAbsent = record.annotation.alcohol.presence === "absent";
        if (
          alcoholAbsent !== record.inspection.visualStrata.includes("missing-alcohol-statement")
        ) {
          issue(
            index,
            "inspection.visualStrata",
            "missing-alcohol-statement stratum must agree with alcohol truth",
          );
        }
        if (record.qualityControl.reviewedOn < record.annotation.provenance.annotatedOn) {
          issue(index, "qualityControl.reviewedOn", "quality control cannot predate annotation");
        }
      }
    });

    manifest.records.forEach((record, index) => {
      if (record.status !== "excluded_duplicate") return;
      const target = byId.get(record.duplicateOfCaseId);
      if (!target) {
        issue(index, "duplicateOfCaseId", "duplicate target does not resolve");
      } else if (target.caseId === record.caseId) {
        issue(index, "duplicateOfCaseId", "a case cannot duplicate itself");
      } else if (target.status === "excluded_duplicate") {
        issue(
          index,
          "duplicateOfCaseId",
          "duplicate links must point directly to a canonical record",
        );
      }
    });

    for (const group of byHash.values()) {
      if (group.length < 2) continue;
      if (group.filter((record) => record.status === "included").length > 1) {
        for (const record of group) {
          issue(
            manifest.records.indexOf(record),
            "expectedSha256",
            "exact duplicate bytes cannot be included more than once",
          );
        }
      }
      for (const record of group) {
        if (record.status !== "included" && record.status !== "excluded_duplicate") {
          issue(
            manifest.records.indexOf(record),
            "status",
            "additional records with exact duplicate bytes must use excluded_duplicate",
          );
        }
      }
    }
  });

export function validateEvalManifest(input: unknown): Result<EvalManifest, EvalManifestError> {
  const parsed = evalManifestSchema.safeParse(input);
  if (!parsed.success) {
    return err({
      code: "INVALID_SHAPE",
      message: "Evaluation manifest failed validation.",
      issues: parsed.error.issues.map((issue) => {
        const path = issue.path.length ? issue.path.join(".") : "(root)";
        return `${path}: ${issue.message}`;
      }),
    });
  }
  return ok(parsed.data as EvalManifest);
}
