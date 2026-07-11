import { z } from "zod";

import { err, ok, type Result } from "@/shared/result";

import {
  CORPUS_ANNOTATION_STATUS,
  CORPUS_AVAILABILITY_STATES,
  CORPUS_CHALLENGE_TAGS,
  CORPUS_FIXTURE_ROLES,
  CORPUS_INDEPENDENCE,
  CORPUS_MAPPING_STATUS,
  CORPUS_MEASUREMENT_ELIGIBILITY,
  CORPUS_OBSERVATION_STATES,
  CORPUS_PRIVACY_REVIEW_STATES,
  CORPUS_SOURCE_AUTHORITIES,
  CORPUS_SOURCE_STRATA,
  CORPUS_SPLIT_STATUS,
  CORPUS_SUFFICIENCY_STATES,
  CORPUS_SUPPORTED_FIELDS,
  CORPUS_WINE_COLORS,
  FIXTURE_CORPUS_SCHEMA_VERSION,
  TRUTH_LABEL_PROHIBITION,
  type FixtureCorpusError,
  type FixtureCorpusIndex,
} from "./corpus-index.types";

const observationState = z.enum(CORPUS_OBSERVATION_STATES);
const supportedField = z.enum(CORPUS_SUPPORTED_FIELDS);

const syntheticEvidenceSchema = z
  .object({
    brandLines: z.array(z.array(z.string().min(1)).min(1)),
    alcoholLines: z.array(z.array(z.string().min(1)).min(1)),
  })
  .strict();

const expectationsSchema = z
  .object({
    brandStateAllowed: z.array(observationState).min(1),
    alcoholStateAllowed: z.array(observationState).min(1),
    alcoholParsedValue: z.union([z.string().min(1), z.null()]),
    requiredAlcoholTokens: z.array(z.string().min(1)),
    permittedBrandCandidates: z.array(z.string().min(1)),
    forbiddenBrandCandidates: z.array(z.string().min(1)),
    sufficiency: z.record(supportedField, z.enum(CORPUS_SUFFICIENCY_STATES)),
    extractionOutcome: z.union([
      z.literal("success"),
      z.object({ failureCode: z.string().min(1) }).strict(),
    ]),
    declaredComparison: z
      .object({
        passValues: z.array(z.string().min(1)),
        failValues: z.array(z.string().min(1)),
      })
      .strict(),
    notRunRuleIds: z.array(z.string().min(1)),
  })
  .strict();

const entrySchema = z
  .object({
    fixtureId: z.string().min(1),
    displayName: z.string().min(1),
    beverageCategory: z.literal("wine"),
    sourceAuthority: z.enum(CORPUS_SOURCE_AUTHORITIES),
    publicRecordId: z.union([z.string().min(1), z.null()]),
    role: z.enum(CORPUS_FIXTURE_ROLES),
    imageFilename: z.union([z.string().min(1), z.null()]),
    manifestFilename: z.union([z.string().min(1), z.null()]),
    fixtureDir: z.union([z.string().min(1), z.null()]),
    privacyReviewStatus: z.enum(CORPUS_PRIVACY_REVIEW_STATES),
    availability: z.enum(CORPUS_AVAILABILITY_STATES),
    unavailableReason: z.union([z.string().min(1), z.null()]),
    derivedFromFixtureId: z.union([z.string().min(1), z.null()]),
    testDimensions: z.array(z.string().min(1)).min(1),
    challengeTags: z.array(z.enum(CORPUS_CHALLENGE_TAGS)),
    expectedSupportedObservations: z.array(supportedField),
    knownAmbiguity: z.union([z.string().min(1), z.null()]),
    unsupportedFieldsNote: z.string().min(1),
    enabledForRealOcr: z.boolean(),
    domainOnlySynthetic: z.boolean(),
    syntheticEvidence: z.union([syntheticEvidenceSchema, z.null()]),
    // `null` only for an unannotated candidate (enforced in superRefine).
    expectations: z.union([expectationsSchema, z.null()]),
    truthLabelProhibition: z.literal(TRUTH_LABEL_PROHIBITION),
    // Optional candidate-stratum fields (required for `candidate`, forbidden
    // elsewhere — enforced in superRefine).
    wineColor: z.enum(CORPUS_WINE_COLORS).optional(),
    sourceStratum: z.enum(CORPUS_SOURCE_STRATA).optional(),
    independence: z.enum(CORPUS_INDEPENDENCE).optional(),
    measurementEligibility: z.array(z.enum(CORPUS_MEASUREMENT_ELIGIBILITY)).min(1).optional(),
    annotationStatus: z.enum(CORPUS_ANNOTATION_STATUS).optional(),
    splitStatus: z.enum(CORPUS_SPLIT_STATUS).optional(),
    multiPanelStatus: z.enum(CORPUS_MAPPING_STATUS).optional(),
    decimalCommaStatus: z.enum(CORPUS_MAPPING_STATUS).optional(),
    acquisitionDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
      .optional(),
  })
  .strict();

export const fixtureCorpusIndexSchema = z
  .object({
    schemaId: z.literal("label-fixture-corpus"),
    schemaVersion: z.literal(FIXTURE_CORPUS_SCHEMA_VERSION),
    description: z.string().min(1),
    entries: z.array(entrySchema).min(1),
  })
  .strict()
  .superRefine((corpus, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

    const ids = new Set<string>();
    const imagePaths = new Set<string>();

    corpus.entries.forEach((e, i) => {
      // Unique fixture ids.
      if (ids.has(e.fixtureId)) issue(["entries", i, "fixtureId"], "duplicate fixture id.");
      ids.add(e.fixtureId);

      // Unique committed image paths (dir + filename), when present.
      if (e.imageFilename && e.fixtureDir) {
        const key = `${e.fixtureDir}/${e.imageFilename}`;
        if (imagePaths.has(key)) issue(["entries", i, "imageFilename"], "duplicate image path.");
        imagePaths.add(key);
      }

      // Availability discipline.
      if (e.availability === "unavailable") {
        if (e.unavailableReason === null) {
          issue(["entries", i, "unavailableReason"], "an unavailable fixture must state why.");
        }
        if (e.enabledForRealOcr) {
          issue(["entries", i, "enabledForRealOcr"], "an unavailable fixture cannot run real OCR.");
        }
        if (e.imageFilename !== null || e.manifestFilename !== null) {
          issue(["entries", i, "imageFilename"], "an unavailable fixture commits no assets.");
        }
      } else if (e.unavailableReason !== null) {
        issue(["entries", i, "unavailableReason"], "available fixtures must not state a reason.");
      }

      // Domain-only synthetic discipline.
      if (e.domainOnlySynthetic) {
        if (e.imageFilename !== null || e.manifestFilename !== null) {
          issue(["entries", i, "imageFilename"], "a domain-only synthetic entry commits no image.");
        }
        if (e.enabledForRealOcr) {
          issue(
            ["entries", i, "enabledForRealOcr"],
            "a domain-only synthetic entry cannot run real OCR.",
          );
        }
        if (e.syntheticEvidence === null) {
          issue(
            ["entries", i, "syntheticEvidence"],
            "a synthetic entry must carry evidence lines.",
          );
        }
      } else if (e.syntheticEvidence !== null) {
        issue(["entries", i, "syntheticEvidence"], "only synthetic entries carry evidence lines.");
      }

      // A real-OCR-enabled fixture must have a resolvable image + manifest.
      if (e.enabledForRealOcr && (!e.imageFilename || !e.manifestFilename || !e.fixtureDir)) {
        issue(
          ["entries", i, "enabledForRealOcr"],
          "a real-OCR fixture needs an image, manifest, and directory.",
        );
      }

      // Candidate-stratum discipline: an ingested-but-unannotated real label.
      const candidateFields = [
        e.wineColor,
        e.sourceStratum,
        e.independence,
        e.measurementEligibility,
        e.annotationStatus,
        e.splitStatus,
        e.multiPanelStatus,
        e.decimalCommaStatus,
        e.acquisitionDate,
      ];
      if (e.role === "candidate") {
        if (e.expectations !== null) {
          issue(["entries", i, "expectations"], "a candidate carries no invented expectations.");
        }
        if (e.annotationStatus !== "unannotated") {
          issue(["entries", i, "annotationStatus"], "a candidate must be unannotated.");
        }
        if (e.enabledForRealOcr) {
          issue(["entries", i, "enabledForRealOcr"], "a candidate cannot run mandatory real OCR.");
        }
        if (e.domainOnlySynthetic) {
          issue(["entries", i, "domainOnlySynthetic"], "a candidate is not synthetic.");
        }
        if (e.availability !== "available") {
          issue(["entries", i, "availability"], "a candidate must be available.");
        }
        if (!e.imageFilename || !e.fixtureDir) {
          issue(["entries", i, "imageFilename"], "a candidate needs an image and directory.");
        }
        if (e.manifestFilename !== null) {
          issue(
            ["entries", i, "manifestFilename"],
            "a candidate records provenance in the inventory, not a v2 manifest.",
          );
        }
        if (candidateFields.some((f) => f === undefined)) {
          issue(["entries", i, "wineColor"], "a candidate must record all stratum fields.");
        }
      } else {
        if (e.expectations === null) {
          issue(["entries", i, "expectations"], "only a candidate may omit expectations.");
        }
        if (candidateFields.some((f) => f !== undefined)) {
          issue(["entries", i, "role"], "candidate-only fields are not allowed on this role.");
        }
      }
    });

    // Resolve derived parents against the complete id set.
    corpus.entries.forEach((e, i) => {
      if (e.derivedFromFixtureId !== null && !ids.has(e.derivedFromFixtureId)) {
        issue(["entries", i, "derivedFromFixtureId"], "derived parent does not resolve.");
      }
      if (e.derivedFromFixtureId === e.fixtureId) {
        issue(["entries", i, "derivedFromFixtureId"], "a fixture cannot derive from itself.");
      }
    });
  });

type SchemaOutput = z.infer<typeof fixtureCorpusIndexSchema>;
const _typeCheck: SchemaOutput extends FixtureCorpusIndex ? true : never = true;
void _typeCheck;

export function validateFixtureCorpusIndex(
  candidate: unknown,
): Result<FixtureCorpusIndex, FixtureCorpusError> {
  if (
    candidate &&
    typeof candidate === "object" &&
    "schemaVersion" in candidate &&
    (candidate as { schemaVersion: unknown }).schemaVersion !== FIXTURE_CORPUS_SCHEMA_VERSION
  ) {
    return err({
      code: "UNSUPPORTED_CORPUS_VERSION",
      message: "Fixture corpus schema version is not supported.",
      issues: [
        `expected ${FIXTURE_CORPUS_SCHEMA_VERSION}, found ${String(
          (candidate as { schemaVersion: unknown }).schemaVersion,
        )}`,
      ],
    });
  }

  const parsed = fixtureCorpusIndexSchema.safeParse(candidate);
  if (parsed.success) return ok(parsed.data);

  const custom = parsed.error.issues.some((issue) => issue.code === "custom");
  return err({
    code: custom ? "INVALID_CORPUS" : "INVALID_SHAPE",
    message: "Fixture corpus index failed validation.",
    issues: parsed.error.issues.map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "$";
      return `${path}: ${issue.message}`;
    }),
  });
}
