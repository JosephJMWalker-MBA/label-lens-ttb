import { z } from "zod";

import { err, ok, type Result } from "@/shared/result";

import {
  FIXTURE_MANIFEST_SCHEMA_VERSION,
  NOT_RETAINED,
  RELATIONSHIP_NOT_PROVEN,
  UNKNOWN,
  type FixtureManifest,
  type FixtureManifestError,
} from "./fixture-manifest.types";

const SHA256 = /^[0-9a-f]{64}$/;
const sha256 = z.string().regex(SHA256, "must be a 64-character hex SHA-256");
const url = z.string().url();
const instantOrUnknown = z.union([z.string().datetime({ offset: true }), z.literal(UNKNOWN)]);

const externalSourceSchema = z
  .object({
    authority: z.literal("Alcohol and Tobacco Tax and Trade Bureau"),
    registry: z.literal("Public COLA Registry"),
    ttbId: z.string().min(1),
    applicationDetailUrl: url,
    printableLabelUrl: z.union([url, z.literal(UNKNOWN)]),
    retrievalMethod: z.enum([
      "browser-download",
      "public-printable-view",
      "chat-browser-attachment-transfer",
      UNKNOWN,
    ]),
    retrievedAt: instantOrUnknown,
    sourceMediaType: z.union([z.string().min(1), z.literal(UNKNOWN)]),
    sourceDimensions: z.union([
      z
        .object({ width: z.number().int().positive(), height: z.number().int().positive() })
        .strict(),
      z.literal(NOT_RETAINED),
    ]),
    sourceSha256: z.union([sha256, z.literal(NOT_RETAINED)]),
    sourceBytesRetained: z.boolean(),
    privacyReview: z.string().min(1),
    publicRecordLimitations: z.string().min(1),
    availabilityCaveat: z.string().min(1),
  })
  .strict();

const parentSchema = z
  .object({
    kind: z.enum(["external-source", "repository-derivative", UNKNOWN]),
    ref: z.string().min(1),
  })
  .strict();

const transformationStepSchema = z
  .object({
    order: z.number().int().positive(),
    operation: z.string().min(1),
    performedIn: z.enum(["outside-repository", "in-repository"]),
    performedBy: z.enum(["human", "tool"]),
    description: z.string().min(1),
    toolVersion: z.string().min(1).optional(),
    excludedRegions: z.array(z.string().min(1)).optional(),
    verification: z.string().min(1),
  })
  .strict();

// `.strict()` is the privacy guarantee: no matched value, contact text,
// signature, crop, or OCR field may ride along on an exclusion record.
const privacyExclusionSchema = z
  .object({
    category: z.string().min(1),
    check: z.string().min(1),
    result: z.enum(["excluded", "not-present"]),
    toolOrRuleVersion: z.string().min(1),
  })
  .strict();

const derivativeSchema = z
  .object({
    derivativeId: z.string().min(1),
    filename: z.string().min(1),
    role: z.enum(["reference-crop", "ocr-benchmark", "degraded-derivative"]),
    mediaType: z.enum(["image/png", "image/jpeg"]),
    pixelWidth: z.number().int().positive(),
    pixelHeight: z.number().int().positive(),
    byteSize: z.number().int().positive(),
    sha256,
    parent: parentSchema,
    transformationType: z.enum([
      "crop",
      "resize",
      "re-encode",
      "browser-client-representation",
      "unchanged-bytes",
      UNKNOWN,
    ]),
    transformationSteps: z.array(transformationStepSchema).min(1),
    manuallyCorrectedPixelsOrText: z.boolean(),
    privacyExclusions: z.array(privacyExclusionSchema).min(1),
    intendedUse: z.string().min(1),
  })
  .strict();

const truthLabelsSchema = z
  .object({
    brand: z.string().min(1),
    varietal: z.string().min(1),
    appellation: z.string().min(1),
    vintage: z.string().min(1),
    alcoholStatement: z.string().min(1),
    netContents: z.string().min(1),
    governmentWarning: z.enum(["present", "absent"]),
  })
  .strict();

const provenanceNoteSchema = z
  .object({
    topic: z.string().min(1),
    resolution: z.string().min(1),
    earlierHumanTranscription: z.string().min(1).optional(),
    artifactVerifiedTruth: z.string().min(1).optional(),
  })
  .strict();

export const fixtureManifestSchema = z
  .object({
    fixtureId: z.string().min(1),
    schemaVersion: z.literal(FIXTURE_MANIFEST_SCHEMA_VERSION),
    ttbId: z.string().min(1),
    beverageCategory: z.literal("wine"),
    sourceChain: z
      .object({
        externalSource: externalSourceSchema,
        derivatives: z.array(derivativeSchema).min(1),
      })
      .strict(),
    truthLabels: truthLabelsSchema,
    provenanceNotes: z.array(provenanceNoteSchema).default([]),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const issue = (path: (string | number)[], message: string) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });

    const src = manifest.sourceChain.externalSource;
    // Honesty rule: a source digest/dimensions may not be claimed without bytes.
    if (!src.sourceBytesRetained) {
      if (src.sourceSha256 !== NOT_RETAINED) {
        issue(
          ["sourceChain", "externalSource", "sourceSha256"],
          "must be not_retained when source bytes are not retained.",
        );
      }
      if (src.sourceDimensions !== NOT_RETAINED) {
        issue(
          ["sourceChain", "externalSource", "sourceDimensions"],
          "must be not_retained when source bytes are not retained.",
        );
      }
    }

    // Unique derivative ids and filenames.
    const ids = new Set<string>();
    const filenames = new Set<string>();
    const derivatives = manifest.sourceChain.derivatives;
    derivatives.forEach((d, i) => {
      if (ids.has(d.derivativeId)) {
        issue(["sourceChain", "derivatives", i, "derivativeId"], "duplicate derivative id.");
      }
      ids.add(d.derivativeId);
      if (filenames.has(d.filename)) {
        issue(["sourceChain", "derivatives", i, "filename"], "duplicate derivative filename.");
      }
      filenames.add(d.filename);
    });

    // Parent relationship resolution and explicit-unknown discipline.
    derivatives.forEach((d, i) => {
      const p = d.parent;
      if (p.kind === "repository-derivative") {
        if (p.ref === d.derivativeId) {
          issue(
            ["sourceChain", "derivatives", i, "parent", "ref"],
            "a derivative cannot be its own parent.",
          );
        } else if (!ids.has(p.ref)) {
          issue(
            ["sourceChain", "derivatives", i, "parent", "ref"],
            `repository parent ${p.ref} does not resolve.`,
          );
        }
      } else if (p.kind === "external-source") {
        if (p.ref !== "external-source") {
          issue(
            ["sourceChain", "derivatives", i, "parent", "ref"],
            "external-source parent ref must be 'external-source'.",
          );
        }
      } else if (p.ref !== RELATIONSHIP_NOT_PROVEN) {
        issue(
          ["sourceChain", "derivatives", i, "parent", "ref"],
          "unknown parent must use relationship_not_proven.",
        );
      }

      // Transformation steps must be contiguous from 1.
      d.transformationSteps.forEach((step, si) => {
        if (step.order !== si + 1) {
          issue(
            ["sourceChain", "derivatives", i, "transformationSteps", si, "order"],
            `steps must be ordered from 1; expected ${si + 1}.`,
          );
        }
      });
    });
  });

type SchemaOutput = z.infer<typeof fixtureManifestSchema>;
const _typeCheck: SchemaOutput extends FixtureManifest ? true : never = true;
void _typeCheck;

export function validateFixtureManifest(
  candidate: unknown,
): Result<FixtureManifest, FixtureManifestError> {
  // Reject an unsupported/old manifest version explicitly and clearly.
  if (
    candidate &&
    typeof candidate === "object" &&
    "schemaVersion" in candidate &&
    (candidate as { schemaVersion: unknown }).schemaVersion !== FIXTURE_MANIFEST_SCHEMA_VERSION
  ) {
    return err({
      code: "UNSUPPORTED_MANIFEST_VERSION",
      message: "Fixture manifest schema version is not supported.",
      issues: [
        `expected ${FIXTURE_MANIFEST_SCHEMA_VERSION}, found ${String(
          (candidate as { schemaVersion: unknown }).schemaVersion,
        )}`,
      ],
    });
  }

  const parsed = fixtureManifestSchema.safeParse(candidate);
  if (parsed.success) {
    return ok(parsed.data);
  }

  const custom = parsed.error.issues.some((issue) => issue.code === "custom");
  return err({
    code: custom ? "INVALID_PROVENANCE" : "INVALID_SHAPE",
    message: "Fixture manifest failed validation.",
    issues: parsed.error.issues.map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "$";
      return `${path}: ${issue.message}`;
    }),
  });
}
