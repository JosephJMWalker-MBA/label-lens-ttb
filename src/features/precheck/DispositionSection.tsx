"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RESULT_DISPOSITION_DECISIONS } from "@/pipeline/result/result.types";
import type {
  PrecheckServiceError,
  PrecheckServiceResponse,
} from "@/server/precheck-service.types";

interface ApiSuccess {
  ok: true;
  data: PrecheckServiceResponse;
}
interface ApiFailure {
  ok: false;
  error: PrecheckServiceError;
}

/** Human-readable label for each bounded internal-workflow decision. */
const DECISION_LABEL: Record<string, string> = {
  accepted_for_internal_use: "Accepted for internal use",
  correction_requested: "Correction requested",
  additional_evidence_requested: "Additional evidence requested",
  escalated_for_human_review: "Escalated for human review",
  superseded: "Superseded",
  no_action: "No action",
};

export function DispositionSection({
  response,
  onAppended,
}: {
  response: PrecheckServiceResponse;
  onAppended: (updated: PrecheckServiceResponse) => void;
}) {
  const [actorId, setActorId] = useState("");
  const [decision, setDecision] = useState<string>(RESULT_DISPOSITION_DECISIONS[0]);
  const [reasonCode, setReasonCode] = useState("");
  const [note, setNote] = useState("");
  const [ruleRefs, setRuleRefs] = useState<Set<string>>(new Set());
  const [checkRefs, setCheckRefs] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  const historyHeadingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const history = response.humanDispositionHistory;
  const ruleIds = response.findings.map((f) => f.ruleId);
  const checkIds = response.evidenceAssessments.map((a) => a.checkId);

  function toggle(set: Set<string>, value: string): Set<string> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (actorId.trim() === "" || reasonCode.trim() === "") {
      setError("Enter both an operator identifier and a reason code.");
      requestAnimationFrame(() => errorRef.current?.focus());
      return;
    }
    setSubmitting(true);
    setError(null);
    const references = {
      ...(ruleRefs.size > 0 ? { ruleIds: [...ruleRefs] } : {}),
      ...(checkRefs.size > 0 ? { checkIds: [...checkRefs] } : {}),
    };
    try {
      const res = await fetch("/api/precheck/disposition", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          exportJson: response.exportJson,
          // Opaque server-issued token carried from the pre-check response; the
          // browser never computes or stores any signing secret.
          appendToken: response.appendToken,
          actorId,
          decision,
          reasonCode,
          ...(note.trim() !== "" ? { note } : {}),
          ...(references.ruleIds || references.checkIds ? { references } : {}),
          file: response.file,
        }),
      });
      const json = (await res.json()) as ApiSuccess | ApiFailure;
      if (json.ok) {
        onAppended(json.data);
        setReasonCode("");
        setNote("");
        setRuleRefs(new Set());
        setCheckRefs(new Set());
        setAnnounce(
          `Disposition recorded. The history now has ${json.data.humanDispositionHistory.length} ${
            json.data.humanDispositionHistory.length === 1 ? "entry" : "entries"
          }.`,
        );
        requestAnimationFrame(() => historyHeadingRef.current?.focus());
      } else {
        setError(json.error.message);
        requestAnimationFrame(() => errorRef.current?.focus());
      }
    } catch {
      setError("The disposition could not be recorded. Check your connection and try again.");
      requestAnimationFrame(() => errorRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="disposition-heading" className="flex flex-col gap-4">
      <h2 id="disposition-heading" className="text-xl font-semibold">
        Human disposition (operator internal workflow)
      </h2>
      <p className="rounded-md border border-border bg-muted/40 p-3 text-sm">
        The findings above are <strong>automated rule outcomes</strong>. A disposition is the
        operator&rsquo;s <strong>internal workflow record</strong>. Recording a disposition{" "}
        <strong>does not change the automated findings</strong> and{" "}
        <strong>does not represent a TTB action, approval, or rejection</strong>.
      </p>

      <div className="flex flex-col gap-2">
        <h3
          id="disposition-history-heading"
          ref={historyHeadingRef}
          tabIndex={-1}
          className="text-lg font-semibold"
        >
          Operator disposition history
        </h3>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No disposition has been recorded yet.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {history.map((entry) => (
              <li key={entry.dispositionId} className="rounded-md border border-border p-3 text-sm">
                <div className="font-medium">
                  Sequence {entry.sequence}: {DECISION_LABEL[entry.decision] ?? entry.decision}
                </div>
                <dl className="mt-1 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
                  <dt className="text-muted-foreground">Reason code</dt>
                  <dd>{entry.reasonCode}</dd>
                  <dt className="text-muted-foreground">Actor</dt>
                  <dd>{entry.actorId}</dd>
                  <dt className="text-muted-foreground">Recorded at</dt>
                  <dd>{entry.recordedAt}</dd>
                  {entry.note ? (
                    <>
                      <dt className="text-muted-foreground">Note</dt>
                      <dd>{entry.note}</dd>
                    </>
                  ) : null}
                  {entry.references &&
                  (entry.references.ruleIds?.length || entry.references.checkIds?.length) ? (
                    <>
                      <dt className="text-muted-foreground">References</dt>
                      <dd>
                        {[
                          ...(entry.references.ruleIds ?? []).map((r) => `rule:${r}`),
                          ...(entry.references.checkIds ?? []).map((c) => `check:${c}`),
                        ].join(", ")}
                      </dd>
                    </>
                  ) : null}
                </dl>
              </li>
            ))}
          </ol>
        )}
      </div>

      <form className="flex flex-col gap-4" onSubmit={submit}>
        <h3 className="text-lg font-semibold">Record a disposition</h3>

        {error ? (
          <div
            ref={errorRef}
            tabIndex={-1}
            role="alert"
            className="rounded-md border border-border bg-muted/40 p-3 text-sm"
          >
            <p className="font-semibold">The disposition was not recorded</p>
            <p className="mt-1">{error}</p>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="disposition-actor">Operator identifier</Label>
          <Input
            id="disposition-actor"
            value={actorId}
            required
            aria-required="true"
            onChange={(e) => setActorId(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="disposition-decision">Decision (internal workflow)</Label>
          <select
            id="disposition-decision"
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm"
            value={decision}
            onChange={(e) => setDecision(e.target.value)}
          >
            {RESULT_DISPOSITION_DECISIONS.map((d) => (
              <option key={d} value={d}>
                {DECISION_LABEL[d]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="disposition-reason">Reason code</Label>
          <Input
            id="disposition-reason"
            value={reasonCode}
            required
            aria-required="true"
            onChange={(e) => setReasonCode(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="disposition-note">Note (optional)</Label>
          <textarea
            id="disposition-note"
            className="min-h-16 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        <fieldset className="flex flex-col gap-2 border border-border rounded-md p-3">
          <legend className="px-1 text-sm font-medium">
            Referenced findings and checks (optional)
          </legend>
          <div className="flex flex-col gap-1">
            {ruleIds.map((id) => (
              <label key={id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={ruleRefs.has(id)}
                  onChange={() => setRuleRefs((s) => toggle(s, id))}
                />
                <span>rule: {id}</span>
              </label>
            ))}
            {checkIds.map((id) => (
              <label key={id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={checkRefs.has(id)}
                  onChange={() => setCheckRefs((s) => toggle(s, id))}
                />
                <span>check: {id}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <Button type="submit" disabled={submitting}>
            Record disposition
          </Button>
        </div>
      </form>

      <div aria-live="polite" role="status" className="text-sm text-muted-foreground">
        {announce}
      </div>
    </section>
  );
}
