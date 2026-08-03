/**
 * Issue #149 — reading a sealed acquisition package back, for tests.
 *
 * Non-OCR. The public acquisition API returns **bytes**, not objects, so a test
 * that wants to assert something about the candidate population reads it out of
 * the sealed file the same way a replay would. That is the point: there is no
 * privileged in-memory view any more, not even for tests.
 *
 * This lives under `src/fixtures/**`, which the Stage 2 acquisition closure is
 * prohibited from importing. It is test support and must never be on the
 * acquisition route.
 */
import type {
  SealedEvidenceFile,
  SealedItemEvidence,
} from "../../../scripts/eval/lib/issue-149-candidate-adapter";
import type { CandidateEvidenceRecord } from "../../../scripts/eval/lib/issue-149-evidence-canonical";

export function sealedFile(sealed: SealedItemEvidence, suffix: string): SealedEvidenceFile {
  const file = sealed.files.find((entry) => entry.path.endsWith(suffix));
  if (file === undefined) {
    throw new Error(
      `no sealed file ending ${suffix}; package has ${sealed.files.map((f) => f.path).join(", ")}`,
    );
  }
  return file;
}

export const sealedText = (sealed: SealedItemEvidence, suffix: string): string =>
  Buffer.from(sealedFile(sealed, suffix).bytes).toString("utf8");

export function sealedJsonl(sealed: SealedItemEvidence, suffix: string): unknown[] {
  const text = sealedText(sealed, suffix);
  if (text.length === 0) return [];
  return text
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as unknown);
}

export const sealedJson = (sealed: SealedItemEvidence, suffix: string): Record<string, unknown> =>
  JSON.parse(sealedText(sealed, suffix)) as Record<string, unknown>;

export const sealedCandidates = (sealed: SealedItemEvidence): CandidateEvidenceRecord[] =>
  sealedJsonl(sealed, ".candidates.jsonl") as CandidateEvidenceRecord[];

export const sealedCounts = (sealed: SealedItemEvidence): Record<string, unknown> =>
  sealedJson(sealed, ".counts.json");

export const sealedPasses = (sealed: SealedItemEvidence): Array<Record<string, unknown>> =>
  JSON.parse(sealedText(sealed, ".passes.json")) as Array<Record<string, unknown>>;
