import { z } from "zod";

export const RevisionResponseContextSchema = z.object({
  kind: z.literal("requested_changes_response"),
  submissionId: z.string().min(1),
  baseRevisionId: z.string().min(1),
  baseRevisionNumber: z.number().int().positive(),
  respondedToDecisionId: z.string().min(1),
  expectedSubmissionVersion: z.number().int().positive(),
});

export type RevisionResponseContext = z.infer<typeof RevisionResponseContextSchema>;

export function parseRevisionResponseContext(
  raw: unknown,
): { ok: true; value: RevisionResponseContext } | { ok: false; issues: string[] } {
  const parsed = RevisionResponseContextSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((issue) => issue.message) };
  }
  return { ok: true, value: parsed.data };
}
