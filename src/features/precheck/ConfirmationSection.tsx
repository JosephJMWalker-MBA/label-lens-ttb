"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  resolveFieldReviews,
  validateHumanCorrectedValue,
} from "@/pipeline/result/field-confirmation";
import type {
  EffectiveReviewedField,
  HumanFieldConfirmationDecisionType,
  HumanFieldGeometry,
  ResolvedFieldReview,
  ReviewableFieldId,
} from "@/pipeline/result/result.types";
import type {
  PrecheckServiceError,
  PrecheckServiceResponse,
} from "@/server/precheck-service.types";

import { ConfirmationImageReview } from "./ConfirmationImageReview";

interface ApiSuccess {
  ok: true;
  data: PrecheckServiceResponse;
}
interface ApiFailure {
  ok: false;
  error: PrecheckServiceError;
}

type DecisionDraft = HumanFieldConfirmationDecisionType | "";

interface FieldDraft {
  decisionType: DecisionDraft;
  alternateId: string;
  correctedValue: string;
  note: string;
  humanGeometry: HumanFieldGeometry | null;
}

const FIELD_LABEL: Record<ReviewableFieldId, string> = {
  brandName: "Brand name",
  alcoholStatement: "Alcohol statement",
};

const DECISION_LABEL: Record<HumanFieldConfirmationDecisionType, string> = {
  "accepted-machine-reading": "Accept machine reading",
  "selected-alternate": "Select alternate candidate",
  "corrected-value": "Correct value manually",
  "field-not-visible": "Mark not visible",
  "field-unreadable": "Mark unreadable",
};

function decisionLabel(decisionType: HumanFieldConfirmationDecisionType): string {
  return DECISION_LABEL[decisionType];
}

function activeDecisionLabel(review: ResolvedFieldReview): string {
  const confirmation = review.activeConfirmation;
  if (!confirmation) return "Pending human confirmation";
  return decisionLabel(confirmation.decisionType);
}

function effectiveStateText(effective: EffectiveReviewedField): string {
  switch (effective.state) {
    case "HUMAN_CONFIRMED":
      return effective.value ?? "Human-confirmed with no value";
    case "NOT_VISIBLE":
      return "Confirmed not visible in the submitted image";
    case "UNREADABLE":
      return "Confirmed present but unreadable";
    case "AMBIGUOUS":
      return "Machine found competing candidates";
    case "NOT_OBSERVED":
      return "Machine did not identify usable evidence";
    case "OBSERVED":
    default:
      return effective.value ?? "Machine observation present";
  }
}

function draftFromReview(review: ResolvedFieldReview): FieldDraft {
  const confirmation = review.activeConfirmation;
  if (!confirmation) {
    return {
      decisionType: "",
      alternateId: "",
      correctedValue: "",
      note: "",
      humanGeometry: null,
    };
  }
  return {
    decisionType: confirmation.decisionType,
    alternateId: confirmation.decisionType === "selected-alternate" ? confirmation.alternateId : "",
    correctedValue:
      confirmation.decisionType === "corrected-value" ? confirmation.correctedValue.rawValue : "",
    note: confirmation.note ?? "",
    humanGeometry: confirmation.humanGeometry ?? null,
  };
}

function fieldHistory(
  response: PrecheckServiceResponse,
  fieldId: ReviewableFieldId,
): PrecheckServiceResponse["humanFieldConfirmationHistory"] {
  return response.humanFieldConfirmationHistory.filter((entry) => entry.fieldId === fieldId);
}

export function ConfirmationSection({
  response,
  previewImage,
  onConfirmed,
}: {
  response: PrecheckServiceResponse;
  previewImage?: { url: string; name: string } | null;
  onConfirmed: (updated: PrecheckServiceResponse) => void;
}) {
  const reviews = useMemo(
    () =>
      resolveFieldReviews({
        observations: response.observations,
        humanFieldConfirmationHistory: response.humanFieldConfirmationHistory,
      }),
    [response.observations, response.humanFieldConfirmationHistory],
  );

  const [activeField, setActiveField] = useState<ReviewableFieldId>("brandName");
  const [drafts, setDrafts] = useState<Record<ReviewableFieldId, FieldDraft>>({
    brandName: draftFromReview(reviews.brandName),
    alcoholStatement: draftFromReview(reviews.alcoholStatement),
  });
  const [savingField, setSavingField] = useState<ReviewableFieldId | null>(null);
  const [errors, setErrors] = useState<Partial<Record<ReviewableFieldId, string>>>({});
  const [announcement, setAnnouncement] = useState("");
  const firstMountRef = useRef(true);
  const lastMachineResultIdRef = useRef(response.machineResultId);

  useEffect(() => {
    if (firstMountRef.current) {
      firstMountRef.current = false;
      lastMachineResultIdRef.current = response.machineResultId;
      return;
    }
    if (lastMachineResultIdRef.current === response.machineResultId) return;
    lastMachineResultIdRef.current = response.machineResultId;
    setDrafts({
      brandName: draftFromReview(reviews.brandName),
      alcoholStatement: draftFromReview(reviews.alcoholStatement),
    });
    setErrors({});
  }, [response.machineResultId, reviews.alcoholStatement, reviews.brandName]);

  async function saveField(fieldId: ReviewableFieldId) {
    const draft = drafts[fieldId];
    if (draft.decisionType === "") {
      setErrors((current) => ({ ...current, [fieldId]: "Choose a confirmation action first." }));
      return;
    }
    if (draft.decisionType === "selected-alternate" && draft.alternateId.trim() === "") {
      setErrors((current) => ({ ...current, [fieldId]: "Select an alternate candidate first." }));
      return;
    }
    if (draft.decisionType === "corrected-value") {
      const corrected = validateHumanCorrectedValue(fieldId, draft.correctedValue);
      if (!corrected.ok) {
        setErrors((current) => ({ ...current, [fieldId]: corrected.error.message }));
        return;
      }
    }

    setSavingField(fieldId);
    setErrors((current) => ({ ...current, [fieldId]: undefined }));
    try {
      const res = await fetch("/api/precheck/confirmation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          exportJson: response.exportJson,
          appendToken: response.appendToken,
          fieldId,
          decisionType: draft.decisionType,
          ...(draft.alternateId.trim() !== "" ? { alternateId: draft.alternateId } : {}),
          ...(draft.correctedValue.trim() !== "" ? { correctedValue: draft.correctedValue } : {}),
          ...(draft.note.trim() !== "" ? { note: draft.note } : {}),
          ...(draft.humanGeometry ? { humanGeometry: draft.humanGeometry } : {}),
          file: response.file,
        }),
      });
      const json = (await res.json()) as ApiSuccess | ApiFailure;
      if (!json.ok) {
        setErrors((current) => ({ ...current, [fieldId]: json.error.message }));
        return;
      }
      onConfirmed(json.data);
      const nextReviews = resolveFieldReviews({
        observations: json.data.observations,
        humanFieldConfirmationHistory: json.data.humanFieldConfirmationHistory,
      });
      setDrafts((current) => ({
        ...current,
        [fieldId]: draftFromReview(
          fieldId === "brandName" ? nextReviews.brandName : nextReviews.alcoholStatement,
        ),
      }));
      setAnnouncement(`${FIELD_LABEL[fieldId]} confirmation saved.`);
    } catch {
      setErrors((current) => ({
        ...current,
        [fieldId]: "The confirmation could not be recorded. Check your connection and try again.",
      }));
    } finally {
      setSavingField(null);
    }
  }

  function updateDraft(fieldId: ReviewableFieldId, next: Partial<FieldDraft>) {
    setDrafts((current) => ({
      ...current,
      [fieldId]: {
        ...current[fieldId],
        ...next,
      },
    }));
  }

  return (
    <section
      aria-labelledby="confirmation-heading"
      className="flex flex-col gap-4 rounded-md border border-border p-4"
    >
      <div className="flex flex-col gap-2">
        <h3 id="confirmation-heading" className="text-lg font-semibold">
          Review and confirm fields
        </h3>
        <p className="text-sm text-muted-foreground">
          Machine observations remain preserved exactly. Your confirmation sets the effective
          reviewed result without rewriting the OCR record.
        </p>
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <ConfirmationImageReview
        previewImage={previewImage}
        reviews={reviews}
        activeField={activeField}
        onActiveFieldChange={setActiveField}
        activeDecisionType={drafts[activeField].decisionType}
        activeAlternateId={drafts[activeField].alternateId}
        activeHumanGeometry={drafts[activeField].humanGeometry}
        onHumanGeometryChange={(geometry) => updateDraft(activeField, { humanGeometry: geometry })}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {(
          [
            ["brandName", reviews.brandName],
            ["alcoholStatement", reviews.alcoholStatement],
          ] as const
        ).map(([fieldId, review]) => {
          const draft = drafts[fieldId];
          const history = fieldHistory(response, fieldId);
          const isSaving = savingField === fieldId;
          const machineHasValue = review.machineObservation.value !== null;
          return (
            <section
              key={fieldId}
              className="flex flex-col gap-4 rounded-md border border-border bg-card p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h4 className="text-base font-semibold">{FIELD_LABEL[fieldId]}</h4>
                  <p className="text-sm text-muted-foreground">
                    Current confirmation: {activeDecisionLabel(review)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant={activeField === fieldId ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveField(fieldId)}
                >
                  Review image
                </Button>
              </div>

              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                <p>
                  <span className="font-medium">Machine reading:</span>{" "}
                  {review.machineObservation.value ?? "— none extracted —"}
                </p>
                <p className="mt-1">
                  <span className="font-medium">Machine state:</span>{" "}
                  {review.machineObservation.state}
                </p>
                <p className="mt-1">
                  <span className="font-medium">Effective reviewed result:</span>{" "}
                  {effectiveStateText(review.effective)}
                </p>
              </div>

              <fieldset className="flex flex-col gap-2 border-0 p-0">
                <legend className="text-sm font-semibold">Confirmation action</legend>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name={`${fieldId}-decision`}
                    checked={draft.decisionType === "accepted-machine-reading"}
                    disabled={!machineHasValue}
                    onChange={() =>
                      updateDraft(fieldId, {
                        decisionType: "accepted-machine-reading",
                        alternateId: "",
                      })
                    }
                  />
                  <span>{DECISION_LABEL["accepted-machine-reading"]}</span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name={`${fieldId}-decision`}
                    checked={draft.decisionType === "selected-alternate"}
                    disabled={review.machineAlternates.length === 0}
                    onChange={() =>
                      updateDraft(fieldId, {
                        decisionType: "selected-alternate",
                        alternateId:
                          draft.alternateId || review.machineAlternates[0]?.alternateId || "",
                      })
                    }
                  />
                  <span>{DECISION_LABEL["selected-alternate"]}</span>
                </label>
                {draft.decisionType === "selected-alternate" ? (
                  <div className="ml-6 flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
                    {review.machineAlternates.length === 0 ? (
                      <p className="text-muted-foreground">
                        No alternate candidates were preserved.
                      </p>
                    ) : (
                      review.machineAlternates.map((alternate) => (
                        <label key={alternate.alternateId} className="flex items-start gap-2">
                          <input
                            type="radio"
                            name={`${fieldId}-alternate`}
                            checked={draft.alternateId === alternate.alternateId}
                            onChange={() =>
                              updateDraft(fieldId, {
                                alternateId: alternate.alternateId,
                              })
                            }
                          />
                          <span>
                            <span className="font-medium">{alternate.value}</span>
                            <span className="text-muted-foreground">
                              {" "}
                              · OCR evidence {alternate.ocrEvidenceScore.toFixed(2)}
                            </span>
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                ) : null}

                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name={`${fieldId}-decision`}
                    checked={draft.decisionType === "corrected-value"}
                    onChange={() =>
                      updateDraft(fieldId, {
                        decisionType: "corrected-value",
                      })
                    }
                  />
                  <span>{DECISION_LABEL["corrected-value"]}</span>
                </label>
                {draft.decisionType === "corrected-value" ? (
                  <div className="ml-6 flex flex-col gap-1.5">
                    <Label htmlFor={`${fieldId}-corrected`}>
                      {fieldId === "brandName"
                        ? "Corrected brand value"
                        : "Corrected alcohol statement"}
                    </Label>
                    <Input
                      id={`${fieldId}-corrected`}
                      value={draft.correctedValue}
                      onChange={(event) =>
                        updateDraft(fieldId, { correctedValue: event.target.value })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      The human-entered value is preserved exactly and does not inherit OCR
                      confidence.
                    </p>
                  </div>
                ) : null}

                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name={`${fieldId}-decision`}
                    checked={draft.decisionType === "field-not-visible"}
                    onChange={() => updateDraft(fieldId, { decisionType: "field-not-visible" })}
                  />
                  <span>{DECISION_LABEL["field-not-visible"]}</span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name={`${fieldId}-decision`}
                    checked={draft.decisionType === "field-unreadable"}
                    onChange={() => updateDraft(fieldId, { decisionType: "field-unreadable" })}
                  />
                  <span>{DECISION_LABEL["field-unreadable"]}</span>
                </label>
              </fieldset>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${fieldId}-note`}>Note (optional)</Label>
                <textarea
                  id={`${fieldId}-note`}
                  className="min-h-20 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                  value={draft.note}
                  onChange={(event) => updateDraft(fieldId, { note: event.target.value })}
                />
              </div>

              <div className="text-xs text-muted-foreground">
                {draft.humanGeometry ? (
                  <p>
                    Human review region attached (
                    {draft.humanGeometry.provenance.replaceAll("-", " ")}
                    ).
                  </p>
                ) : (
                  <p>No human review region attached.</p>
                )}
              </div>

              {errors[fieldId] ? (
                <div
                  role="alert"
                  className="rounded-md border border-alert-foreground/30 bg-alert p-3 text-sm text-alert-foreground"
                >
                  {errors[fieldId]}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <Button type="button" disabled={isSaving} onClick={() => saveField(fieldId)}>
                  {isSaving ? "Saving…" : "Save confirmation"}
                </Button>
              </div>

              <details className="rounded-md border border-border">
                <summary className="cursor-pointer list-none rounded-md px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  Confirmation history ({history.length})
                </summary>
                <div className="border-t border-border px-3 py-2">
                  {history.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No confirmation has been recorded yet.
                    </p>
                  ) : (
                    <ol className="flex flex-col gap-2 text-sm">
                      {history.map((entry) => (
                        <li
                          key={entry.confirmationId}
                          className="rounded-md border border-border/60 p-2"
                        >
                          <p className="font-medium">
                            Sequence {entry.sequence}: {decisionLabel(entry.decisionType)}
                          </p>
                          <p className="text-muted-foreground">{entry.recordedAt}</p>
                          {entry.note ? <p className="mt-1">{entry.note}</p> : null}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </details>
            </section>
          );
        })}
      </div>
    </section>
  );
}
