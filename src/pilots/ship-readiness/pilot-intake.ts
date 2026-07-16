/**
 * Ship-readiness pilot intake — reusable schema, validation, and preregistered
 * counterbalancing for the practical usefulness pilot (Issues #120 / #121).
 *
 * This module is deliberately free of any private image bytes, original local
 * filenames, or later human/machine truth. It defines only the *shape* of a
 * pre-outcome intake manifest and the deterministic checks and counterbalancing
 * that make a local pilot runnable and auditable. The populated manifest, the
 * raw photos, the source map, and all review results live in a gitignored local
 * workspace and are never committed.
 *
 * It has no dependency on the observation-quality corpus schema (#114) or the
 * RDR-004 governance docs (#116); it is a separate, self-contained artifact.
 */

export const PILOT_INTAKE_SCHEMA_VERSION = "ship-readiness-pilot-intake.v1" as const;

/** Real execution / scoring is never authorized by intake preparation. */
export const realPilotExecutionAuthorized = false as const;
export const expectedAnswersAuthorized = false as const;

export const PILOT_MEDIA_TYPES = ["image/jpeg", "image/png"] as const;
export type PilotMediaType = (typeof PILOT_MEDIA_TYPES)[number];

/** Presentation-only challenge tags (Issue #121). Never derived from label text. */
export const PILOT_CHALLENGE_TAGS = [
  "CLEAN_SIMPLE",
  "LOW_CONTRAST",
  "DENSE_TEXT",
  "DECORATIVE_TYPE",
  "ROTATED_OR_VERTICAL",
  "SIDE_OR_WRAPAROUND",
  "MULTI_PANEL_OR_MULTI_IMAGE",
  "SMALL_STATEMENT",
  "GLARE_OR_REFLECTION",
  "PERSPECTIVE_DISTORTION",
  "PARTIAL_CROP",
  "AMBIGUITY_OR_COMPETING_TEXT",
  "UNREADABLE_OR_DAMAGED",
  "OTHER_WITH_NOTE",
] as const;
export type PilotChallengeTag = (typeof PILOT_CHALLENGE_TAGS)[number];

export const PILOT_INTAKE_STATUSES = [
  "INCLUDED",
  "EXCLUDED_WITH_REASON",
  "PENDING_HUMAN_DECISION",
] as const;
export type PilotIntakeStatus = (typeof PILOT_INTAKE_STATUSES)[number];

/** Provenance/permission is confirmed by a human, never asserted by preparation. */
export const PILOT_PROVENANCE_STATUSES = ["PENDING_HUMAN_CONFIRMATION", "CONFIRMED"] as const;
export type PilotProvenanceStatus = (typeof PILOT_PROVENANCE_STATUSES)[number];

/**
 * Keys that must never appear on a case entry: they would carry expected
 * answers, machine output, OCR text, scores, or compliance verdicts into a
 * pre-outcome intake record. The validator rejects any of them at runtime.
 */
export const PILOT_FORBIDDEN_CASE_KEYS = [
  "brand",
  "brandName",
  "expectedBrand",
  "alcohol",
  "alcoholValue",
  "expectedAlcohol",
  "abv",
  "ocrText",
  "ocr",
  "transcription",
  "expectedValue",
  "expectedAnswer",
  "groundTruth",
  "truth",
  "score",
  "humanScore",
  "modelOutput",
  "prediction",
  "compliance",
  "verdict",
  "passFail",
  "result",
] as const;

export interface PilotDerivative {
  readonly kind: "ORIENTATION_FOR_DISPLAY" | "FORMAT_FOR_BROWSER" | "DOWNSCALE_FOR_DISPLAY";
  readonly derivativeRef: string;
  readonly derivativeDigest: string;
  readonly transform: string;
}

export interface PilotCaseEntry {
  readonly pilotId: string;
  readonly localFilenameRef: string;
  readonly sourceDigest: string;
  readonly mediaType: PilotMediaType;
  readonly byteSize: number;
  readonly width: number;
  readonly height: number;
  readonly orientationMetadata: string;
  readonly derivative: PilotDerivative | null;
  readonly provenanceStatus: PilotProvenanceStatus;
  readonly intakeStatus: PilotIntakeStatus;
  readonly exclusionOrPendingReason: string | null;
  readonly challengeTags: readonly PilotChallengeTag[];
  readonly challengeTagNote: string | null;
  readonly nearDuplicateSuspicion: string | null;
  readonly preparedAt: string;
  readonly preparedBy: string;
  /** Explicit proof-of-absence: no expected/answer/score content is present. */
  readonly containsExpectedValues: false;
  readonly containsOcrOrModelOutput: false;
  readonly containsComplianceJudgment: false;
}

export interface PilotManifest {
  readonly schemaVersion: typeof PILOT_INTAKE_SCHEMA_VERSION;
  readonly pilotCorpusId: string;
  readonly expectedCaseCount: number;
  readonly firstId: number;
  readonly lastId: number;
  readonly preparedAt: string;
  readonly preparedBy: string;
  readonly cases: readonly PilotCaseEntry[];
}

export type ReviewMode = "MANUAL_BASELINE" | "ASSISTED";

export interface ReviewStep {
  readonly step: number;
  readonly block: 1 | 2;
  readonly pilotId: string;
  readonly mode: ReviewMode;
}

export interface CounterbalancedOrder {
  readonly seed: number;
  readonly caseIds: readonly string[];
  readonly manualFirstCount: number;
  readonly assistedFirstCount: number;
  readonly firstModeByCase: Readonly<Record<string, ReviewMode>>;
  readonly washoutNote: string;
  readonly sequence: readonly ReviewStep[];
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly issues: readonly string[];
}

const PILOT_ID = /^pilot-wine-\d{3}$/;
const SHA_256_HEX = /^[0-9a-f]{64}$/;
const MEDIA_TYPE_SET = new Set<string>(PILOT_MEDIA_TYPES);
const CHALLENGE_TAG_SET = new Set<string>(PILOT_CHALLENGE_TAGS);
const INTAKE_STATUS_SET = new Set<string>(PILOT_INTAKE_STATUSES);
const PROVENANCE_SET = new Set<string>(PILOT_PROVENANCE_STATUSES);
const FORBIDDEN_KEY_SET = new Set<string>(PILOT_FORBIDDEN_CASE_KEYS);

function isPositiveInt(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function nonEmpty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isSafeRelPath(value: unknown): boolean {
  if (typeof value !== "string" || value.length === 0) return false;
  if (value.includes("\0") || value.includes("\\") || value.startsWith("/")) return false;
  if (/^[A-Za-z]:/.test(value)) return false;
  return value.split("/").every((seg) => seg.length > 0 && seg !== "." && seg !== "..");
}

/** Reject any expected-answer / model-output / verdict key on a case object. */
export function scanCaseForForbiddenKeys(entry: object, index: number): string[] {
  return Object.keys(entry)
    .filter((key) => FORBIDDEN_KEY_SET.has(key))
    .map((key) => `cases[${index}]: forbidden expected-value/output key "${key}" is not allowed`);
}

function validateCase(entry: PilotCaseEntry, index: number): string[] {
  const issues: string[] = [];
  const at = (m: string) => `cases[${index}]: ${m}`;

  if (!PILOT_ID.test(entry.pilotId)) issues.push(at(`pilotId must match pilot-wine-NNN`));
  if (!isSafeRelPath(entry.localFilenameRef))
    issues.push(at("localFilenameRef must be a safe relative filename"));
  if (typeof entry.sourceDigest !== "string" || !SHA_256_HEX.test(entry.sourceDigest))
    issues.push(at("sourceDigest must be a 64-char lowercase SHA-256"));
  if (!MEDIA_TYPE_SET.has(entry.mediaType)) issues.push(at("mediaType must be jpeg or png"));
  if (!isPositiveInt(entry.byteSize)) issues.push(at("byteSize must be a positive integer"));
  if (!isPositiveInt(entry.width)) issues.push(at("width must be a positive integer"));
  if (!isPositiveInt(entry.height)) issues.push(at("height must be a positive integer"));
  if (!nonEmpty(entry.orientationMetadata))
    issues.push(at("orientationMetadata must be recorded (e.g. 'none')"));

  if (!PROVENANCE_SET.has(entry.provenanceStatus))
    issues.push(at("provenanceStatus must be pending or confirmed"));
  if (!INTAKE_STATUS_SET.has(entry.intakeStatus)) issues.push(at("intakeStatus is invalid"));
  if (entry.intakeStatus !== "INCLUDED" && !nonEmpty(entry.exclusionOrPendingReason))
    issues.push(at(`${entry.intakeStatus} requires an explicit reason`));
  if (entry.intakeStatus === "INCLUDED" && entry.exclusionOrPendingReason !== null)
    issues.push(at("INCLUDED cases must have a null reason"));

  if (!Array.isArray(entry.challengeTags) || entry.challengeTags.length === 0) {
    issues.push(at("challengeTags must list at least one presentation tag"));
  } else {
    if (new Set(entry.challengeTags).size !== entry.challengeTags.length)
      issues.push(at("challengeTags must be unique"));
    for (const tag of entry.challengeTags)
      if (!CHALLENGE_TAG_SET.has(tag)) issues.push(at(`unknown challenge tag ${String(tag)}`));
    if (entry.challengeTags.includes("OTHER_WITH_NOTE") && !nonEmpty(entry.challengeTagNote))
      issues.push(at("OTHER_WITH_NOTE requires challengeTagNote"));
  }

  if (entry.derivative !== null) {
    const d = entry.derivative;
    if (!isSafeRelPath(d.derivativeRef)) issues.push(at("derivative.derivativeRef unsafe"));
    if (typeof d.derivativeDigest !== "string" || !SHA_256_HEX.test(d.derivativeDigest))
      issues.push(at("derivative.derivativeDigest must be SHA-256"));
    if (!nonEmpty(d.transform)) issues.push(at("derivative.transform must be recorded"));
  }

  if (entry.containsExpectedValues !== false)
    issues.push(at("containsExpectedValues must be literal false"));
  if (entry.containsOcrOrModelOutput !== false)
    issues.push(at("containsOcrOrModelOutput must be literal false"));
  if (entry.containsComplianceJudgment !== false)
    issues.push(at("containsComplianceJudgment must be literal false"));

  issues.push(...scanCaseForForbiddenKeys(entry, index));
  return issues;
}

export function validatePilotManifest(manifest: PilotManifest): ValidationResult {
  const issues: string[] = [];
  if (manifest.schemaVersion !== PILOT_INTAKE_SCHEMA_VERSION)
    issues.push(`schemaVersion must be ${PILOT_INTAKE_SCHEMA_VERSION}`);
  if (!nonEmpty(manifest.pilotCorpusId)) issues.push("pilotCorpusId must be non-empty");

  if (!Array.isArray(manifest.cases)) {
    issues.push("cases must be an array");
    return { ok: false, issues };
  }

  // Every number firstId..lastId represented exactly once.
  const expectedIds: string[] = [];
  for (let n = manifest.firstId; n <= manifest.lastId; n += 1)
    expectedIds.push(`pilot-wine-${String(n).padStart(3, "0")}`);
  if (manifest.cases.length !== expectedIds.length)
    issues.push(`expected ${expectedIds.length} cases, received ${manifest.cases.length}`);

  const seen = new Map<string, number>();
  manifest.cases.forEach((entry, index) => {
    issues.push(...validateCase(entry, index));
    seen.set(entry.pilotId, (seen.get(entry.pilotId) ?? 0) + 1);
  });
  for (const [id, count] of seen) if (count > 1) issues.push(`duplicate pilotId ${id} (${count}x)`);
  for (const id of expectedIds) if (!seen.has(id)) issues.push(`missing required pilotId ${id}`);

  // Source-digest uniqueness (duplicates must be flagged, not silently dropped).
  const digestOwners = new Map<string, string[]>();
  for (const entry of manifest.cases) {
    if (typeof entry.sourceDigest === "string" && SHA_256_HEX.test(entry.sourceDigest))
      digestOwners.set(entry.sourceDigest, [
        ...(digestOwners.get(entry.sourceDigest) ?? []),
        entry.pilotId,
      ]);
  }
  for (const [digest, owners] of digestOwners)
    if (owners.length > 1)
      issues.push(
        `duplicate sourceDigest ${digest.slice(0, 12)}… shared by ${owners.sort().join(", ")} — flag or exclude explicitly`,
      );

  // Derivatives map to exactly one source and are distinct from the source ref.
  const derivativeRefs = new Map<string, number>();
  for (const entry of manifest.cases) {
    if (entry.derivative) {
      derivativeRefs.set(
        entry.derivative.derivativeRef,
        (derivativeRefs.get(entry.derivative.derivativeRef) ?? 0) + 1,
      );
    }
  }
  for (const [ref, count] of derivativeRefs)
    if (count > 1) issues.push(`derivative ${ref} maps to more than one source`);

  return { ok: issues.length === 0, issues };
}

// ---- Deterministic seeded counterbalancing -------------------------------

/** mulberry32 — small deterministic PRNG so an order is reproducible from a seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Preregistered counterbalanced review order over the reviewable (INCLUDED)
 * cases. Half of the cases begin with the manual baseline and half with the
 * assisted pass. A two-block design (all first passes, then all second passes)
 * guarantees a case's two modes are never reviewed back-to-back; the block
 * boundary is the washout point. Fully reproducible from `seed` + `caseIds`.
 */
export function generateCounterbalancedOrder(
  caseIds: readonly string[],
  seed: number,
): CounterbalancedOrder {
  const ids = [...caseIds].sort();
  const rng = mulberry32(seed);
  const shuffledForAssignment = seededShuffle(ids, rng);
  const manualFirstCount = Math.floor(ids.length / 2);

  const firstModeByCase: Record<string, ReviewMode> = {};
  shuffledForAssignment.forEach((id, i) => {
    firstModeByCase[id] = i < manualFirstCount ? "MANUAL_BASELINE" : "ASSISTED";
  });

  const blockOneOrder = seededShuffle(ids, rng);
  const blockTwoOrder = seededShuffle(ids, rng);
  const opposite = (m: ReviewMode): ReviewMode =>
    m === "MANUAL_BASELINE" ? "ASSISTED" : "MANUAL_BASELINE";

  const sequence: ReviewStep[] = [];
  blockOneOrder.forEach((id) =>
    sequence.push({ step: sequence.length + 1, block: 1, pilotId: id, mode: firstModeByCase[id] }),
  );
  blockTwoOrder.forEach((id) =>
    sequence.push({
      step: sequence.length + 1,
      block: 2,
      pilotId: id,
      mode: opposite(firstModeByCase[id]),
    }),
  );

  return {
    seed,
    caseIds: ids,
    manualFirstCount,
    assistedFirstCount: ids.length - manualFirstCount,
    firstModeByCase,
    washoutNote:
      "Block 1 records each case's first-pass mode; Block 2 records the opposite mode after a washout. A case's two modes are never adjacent (>= N steps apart).",
    sequence,
  };
}

/** Prove an order is reproducible from its recorded seed and case list. */
export function reviewOrderIsReproducible(order: CounterbalancedOrder): boolean {
  const regenerated = generateCounterbalancedOrder(order.caseIds, order.seed);
  return JSON.stringify(regenerated.sequence) === JSON.stringify(order.sequence);
}
