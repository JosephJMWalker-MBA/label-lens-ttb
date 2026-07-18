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
import {
  isWorkspaceOnlySellerState,
  SELLER_DECISION_LABEL,
  SELLER_REVIEW_ACTIONS,
  SELLER_REVIEW_FILTERS,
  sellerReviewProgress,
  sellerStateFromReview,
  sellerStateMatchesFilter,
  type SellerDecisionState,
  type SellerReviewActionState,
  type SellerReviewFilter,
} from "./seller-review";

interface ApiSuccess {
  ok: true;
  data: PrecheckServiceResponse;
}
interface ApiFailure {
  ok: false;
  error: PrecheckServiceError;
}

interface FieldDraft {
  decisionState: SellerDecisionState;
  correctedValue: string;
  note: string;
  humanGeometry: HumanFieldGeometry | null;
}

interface WorkspaceDecision {
  state: "not_this_field" | "unable_to_confirm";
  note: string;
  recordedAt: string;
}

const FIELD_IDS = ["brandName", "alcoholStatement"] as const satisfies readonly ReviewableFieldId[];

const FIELD_LABEL: Record<ReviewableFieldId, string> = {
  brandName: "Brand name",
  alcoholStatement: "Alcohol statement",
};

const FILTER_LABEL: Record<SellerReviewFilter, string> = {
  all: "All",
  unreviewed: "Unreviewed",
  accepted: "Accepted",
  revised: "Revised",
  uncertain: "Uncertain",
};

const LEGACY_CONFIRMATION_LABEL: Record<HumanFieldConfirmationDecisionType, string> = {
  "accepted-machine-reading": "Accepted machine reading",
  "selected-alternate": "Selected alternate candidate",
  "corrected-value": "Corrected value",
  "field-not-visible": "Field not visible",
  "field-unreadable": "Field unreadable",
};

function draftFromReview(review: ResolvedFieldReview): FieldDraft {
  const confirmation = review.activeConfirmation;
  return {
    decisionState: sellerStateFromReview(review),
    correctedValue:
      confirmation?.decisionType === "corrected-value"
        ? confirmation.correctedValue.rawValue
        : review.effective.source.kind === "selected-alternate"
          ? (review.effective.value ?? "")
          : "",
    note: confirmation?.note ?? "",
    humanGeometry: confirmation?.humanGeometry ?? null,
  };
}

function fieldHistory(
  response: PrecheckServiceResponse,
  fieldId: ReviewableFieldId,
): PrecheckServiceResponse["humanFieldConfirmationHistory"] {
  return response.humanFieldConfirmationHistory.filter((entry) => entry.fieldId === fieldId);
}

function confirmedValueText(review: ResolvedFieldReview, state: SellerDecisionState): string {
  if (state === "not_present") return "No value — seller marked it not present";
  if (state === "not_this_field") return "No value confirmed — evidence is disputed";
  if (state === "unable_to_confirm") return "No value confirmed — uncertainty preserved";
  if (state === "unreviewed") return "— not confirmed —";
  return review.effective.value ?? review.machineObservation.value ?? "— no value —";
}

function geometryText(review: ResolvedFieldReview): string {
  const geometry = review.machineObservation.geometry;
  if (!geometry) return "No machine region was preserved.";
  return `Image ${geometry.imageIndex + 1}: x ${geometry.x}, y ${geometry.y}, ${geometry.width} × ${geometry.height} in ${geometry.imageWidth} × ${geometry.imageHeight}`;
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
  const [filter, setFilter] = useState<SellerReviewFilter>("all");
  const [drafts, setDrafts] = useState<Record<ReviewableFieldId, FieldDraft>>({
    brandName: draftFromReview(reviews.brandName),
    alcoholStatement: draftFromReview(reviews.alcoholStatement),
  });
  const [workspaceDecisions, setWorkspaceDecisions] = useState<
    Record<ReviewableFieldId, WorkspaceDecision | null>
  >({
    brandName: null,
    alcoholStatement: null,
  });
  const [savingField, setSavingField] = useState<ReviewableFieldId | null>(null);
  const [errors, setErrors] = useState<Partial<Record<ReviewableFieldId, string>>>({});
  const [announcement, setAnnouncement] = useState("");
  const firstMountRef = useRef(true);
  const lastMachineResultIdRef = useRef(response.machineResultId);

  const savedStates = useMemo(
    () => ({
      brandName: workspaceDecisions.brandName?.state ?? sellerStateFromReview(reviews.brandName),
      alcoholStatement:
        workspaceDecisions.alcoholStatement?.state ??
        sellerStateFromReview(reviews.alcoholStatement),
    }),
    [reviews.alcoholStatement, reviews.brandName, workspaceDecisions],
  );
  const progress = sellerReviewProgress(FIELD_IDS.map((fieldId) => savedStates[fieldId]));
  const visibleFields = FIELD_IDS.filter((fieldId) =>
    sellerStateMatchesFilter(savedStates[fieldId], filter),
  );
  const activeReview = activeField === "brandName" ? reviews.brandName : reviews.alcoholStatement;
  const activeDraft = drafts[activeField];
  const activeSavedState = savedStates[activeField];

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
    setWorkspaceDecisions({ brandName: null, alcoholStatement: null });
    setFilter("all");
    setActiveField("brandName");
    setErrors({});
  }, [response.machineResultId, reviews.alcoholStatement, reviews.brandName]);

  function updateDraft(fieldId: ReviewableFieldId, next: Partial<FieldDraft>) {
    setDrafts((current) => ({
      ...current,
      [fieldId]: { ...current[fieldId], ...next },
    }));
  }

  function selectField(fieldId: ReviewableFieldId) {
    setActiveField(fieldId);
    if (!sellerStateMatchesFilter(savedStates[fieldId], filter)) setFilter("all");
  }

  function selectFilter(nextFilter: SellerReviewFilter) {
    setFilter(nextFilter);
    const nextVisible = FIELD_IDS.filter((fieldId) =>
      sellerStateMatchesFilter(savedStates[fieldId], nextFilter),
    );
    if (nextVisible.length > 0 && !nextVisible.includes(activeField)) {
      setActiveField(nextVisible[0]);
    }
  }

  async function saveField(fieldId: ReviewableFieldId) {
    const draft = drafts[fieldId];
    const review = fieldId === "brandName" ? reviews.brandName : reviews.alcoholStatement;
    const state = draft.decisionState;

    if (state === "unreviewed" || state === "seller_added") {
      setErrors((current) => ({ ...current, [fieldId]: "Choose a seller decision first." }));
      return;
    }
    if (state === "accepted_as_observed" && review.machineObservation.value === null) {
      setErrors((current) => ({
        ...current,
        [fieldId]: "There is no machine-observed value to accept. Choose another decision.",
      }));
      return;
    }
    if (state === "region_revised" && review.machineObservation.value === null) {
      setErrors((current) => ({
        ...current,
        [fieldId]: "A revised region cannot confirm a missing value. Choose another decision.",
      }));
      return;
    }
    if (
      (state === "region_revised" || state === "value_and_region_revised") &&
      draft.humanGeometry?.provenance !== "human-selected-region"
    ) {
      setErrors((current) => ({
        ...current,
        [fieldId]: "Draw a replacement evidence region on the image before saving this decision.",
      }));
      return;
    }
    if (state === "value_revised" || state === "value_and_region_revised") {
      const corrected = validateHumanCorrectedValue(fieldId, draft.correctedValue);
      if (!corrected.ok) {
        setErrors((current) => ({ ...current, [fieldId]: corrected.error.message }));
        return;
      }
    }

    setErrors((current) => ({ ...current, [fieldId]: undefined }));

    if (state === "not_this_field" || state === "unable_to_confirm") {
      const saved: WorkspaceDecision = {
        state,
        note: draft.note,
        recordedAt: new Date().toISOString(),
      };
      setWorkspaceDecisions((current) => ({ ...current, [fieldId]: saved }));
      setAnnouncement(`${FIELD_LABEL[fieldId]} seller decision saved for this review session.`);
      return;
    }

    const decisionType: HumanFieldConfirmationDecisionType =
      state === "not_present"
        ? "field-not-visible"
        : state === "value_revised" || state === "value_and_region_revised"
          ? "corrected-value"
          : "accepted-machine-reading";

    setSavingField(fieldId);
    try {
      const res = await fetch("/api/precheck/confirmation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          exportJson: response.exportJson,
          appendToken: response.appendToken,
          fieldId,
          decisionType,
          ...(decisionType === "corrected-value" ? { correctedValue: draft.correctedValue } : {}),
          ...(draft.note.trim() !== "" ? { note: draft.note } : {}),
          ...(state === "region_revised" || state === "value_and_region_revised"
            ? { humanGeometry: draft.humanGeometry }
            : {}),
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
      const nextReview =
        fieldId === "brandName" ? nextReviews.brandName : nextReviews.alcoholStatement;
      setDrafts((current) => ({ ...current, [fieldId]: draftFromReview(nextReview) }));
      setWorkspaceDecisions((current) => ({ ...current, [fieldId]: null }));
      setAnnouncement(`${FIELD_LABEL[fieldId]} seller decision saved.`);
    } catch {
      setErrors((current) => ({
        ...current,
        [fieldId]:
          "The seller decision could not be recorded. Check your connection and try again.",
      }));
    } finally {
      setSavingField(null);
    }
  }

  function chooseAction(state: SellerReviewActionState) {
    updateDraft(activeField, { decisionState: state });
  }

  const activeHistory = fieldHistory(response, activeField);
  const activeWorkspaceDecision = workspaceDecisions[activeField];

  return (
    <section
      aria-labelledby="seller-review-heading"
      className="flex min-w-0 flex-col gap-5 rounded-md border border-border p-4 sm:p-5"
    >
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Seller evidence review workspace v1
        </p>
        <h3 id="seller-review-heading" className="text-xl font-semibold">
          Review what the machine found
        </h3>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Machine observations stay unchanged. Your seller decision is recorded separately so
          disagreement and uncertainty remain visible.
        </p>
      </div>

      <div className="grid gap-4 rounded-md border border-border bg-muted/25 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-semibold">Review progress</p>
            <p className="text-sm" aria-live="polite">
              {progress.reviewed} of {progress.total} findings reviewed
            </p>
          </div>
          <progress
            className="mt-2 h-2 w-full accent-primary"
            max={progress.total}
            value={progress.reviewed}
            aria-label={`${progress.reviewed} of ${progress.total} findings reviewed`}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {progress.complete
              ? "Every current finding has an explicit seller decision."
              : `${progress.remaining} ${progress.remaining === 1 ? "finding remains" : "findings remain"} unreviewed.`}
          </p>
        </div>
        <Button type="button" variant="outline" disabled title="Available in Slice 2">
          Add missing finding
        </Button>
      </div>

      <div>
        <p className="text-sm font-semibold">Filter findings</p>
        <div className="mt-2 flex flex-wrap gap-2" aria-label="Filter seller review findings">
          {SELLER_REVIEW_FILTERS.map((filterId) => {
            const count = FIELD_IDS.filter((fieldId) =>
              sellerStateMatchesFilter(savedStates[fieldId], filterId),
            ).length;
            return (
              <Button
                key={filterId}
                type="button"
                size="sm"
                variant={filter === filterId ? "default" : "outline"}
                aria-pressed={filter === filterId}
                onClick={() => selectFilter(filterId)}
              >
                {FILTER_LABEL[filterId]} ({count})
              </Button>
            );
          })}
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,0.85fr)] lg:items-start">
        <div className="min-w-0 lg:sticky lg:top-4">
          <ConfirmationImageReview
            previewImage={previewImage}
            reviews={reviews}
            activeField={activeField}
            onActiveFieldChange={selectField}
            activeHumanGeometry={activeDraft.humanGeometry}
            onHumanGeometryChange={(geometry) =>
              updateDraft(activeField, { humanGeometry: geometry })
            }
          />
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="grid gap-2" aria-label="Findings in current filter">
            {visibleFields.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                No findings match this filter.
              </div>
            ) : (
              visibleFields.map((fieldId) => {
                const review =
                  fieldId === "brandName" ? reviews.brandName : reviews.alcoholStatement;
                return (
                  <button
                    key={fieldId}
                    type="button"
                    className={`w-full rounded-md border bg-card p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      activeField === fieldId
                        ? "border-primary ring-1 ring-primary"
                        : "border-border"
                    }`}
                    data-active={activeField === fieldId}
                    aria-pressed={activeField === fieldId}
                    onClick={() => selectField(fieldId)}
                  >
                    <span className="flex flex-wrap items-start justify-between gap-2">
                      <span className="font-semibold">{FIELD_LABEL[fieldId]}</span>
                      <span className="rounded border border-border px-2 py-0.5 text-xs font-medium">
                        {SELLER_DECISION_LABEL[savedStates[fieldId]]}
                      </span>
                    </span>
                    <span className="mt-1 block break-words text-sm text-muted-foreground">
                      Machine: {review.machineObservation.value ?? "— none extracted —"}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {visibleFields.includes(activeField) ? (
            <section
              aria-labelledby={`${activeField}-finding-heading`}
              className="flex min-w-0 flex-col gap-4 rounded-md border border-border bg-card p-4"
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Active finding
                </p>
                <h4 id={`${activeField}-finding-heading`} className="text-lg font-semibold">
                  {FIELD_LABEL[activeField]}
                </h4>
              </div>

              <section
                aria-labelledby={`${activeField}-machine-heading`}
                className="rounded-md border border-border p-3"
              >
                <h5 id={`${activeField}-machine-heading`} className="font-semibold">
                  Machine observation
                </h5>
                <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-[minmax(8rem,auto)_minmax(0,1fr)]">
                  <dt className="text-muted-foreground">Machine-observed text</dt>
                  <dd className="break-words">
                    {activeReview.machineObservation.rawText ?? "— not preserved —"}
                  </dd>
                  <dt className="text-muted-foreground">Machine-selected value</dt>
                  <dd className="break-words">
                    {activeReview.machineObservation.value ?? "— none extracted —"}
                  </dd>
                  <dt className="text-muted-foreground">Machine-normalized value</dt>
                  <dd className="break-words">
                    {activeReview.machineObservation.normalizedValue ?? "— not produced —"}
                  </dd>
                  <dt className="text-muted-foreground">Machine evidence</dt>
                  <dd>
                    <span className="block">State: {activeReview.machineObservation.state}</span>
                    <span className="block">
                      OCR evidence: {activeReview.machineObservation.ocrEvidenceScore.toFixed(2)}
                    </span>
                    <span className="block break-words">{geometryText(activeReview)}</span>
                    <span className="block">
                      Alternates preserved: {activeReview.machineAlternates.length}
                    </span>
                  </dd>
                </dl>
                {activeReview.machineAlternates.length > 0 ? (
                  <details className="mt-3 rounded-md border border-border/70">
                    <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                      Machine alternate candidates ({activeReview.machineAlternates.length})
                    </summary>
                    <ol className="flex flex-col gap-2 border-t border-border/70 p-3 text-sm">
                      {activeReview.machineAlternates.map((alternate) => (
                        <li
                          key={alternate.alternateId}
                          className="rounded border border-border/70 p-2"
                        >
                          <p className="break-words font-medium">{alternate.value}</p>
                          <p className="text-xs text-muted-foreground">
                            OCR evidence {alternate.ocrEvidenceScore.toFixed(2)} · machine region{" "}
                            {alternate.geometry ? "preserved" : "not preserved"}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
              </section>

              <section
                aria-labelledby={`${activeField}-seller-heading`}
                className="rounded-md border border-border bg-muted/20 p-3"
              >
                <h5 id={`${activeField}-seller-heading`} className="font-semibold">
                  Seller review
                </h5>
                <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-[minmax(8rem,auto)_minmax(0,1fr)]">
                  <dt className="text-muted-foreground">Seller decision</dt>
                  <dd>{SELLER_DECISION_LABEL[activeSavedState]}</dd>
                  <dt className="text-muted-foreground">Seller-confirmed value</dt>
                  <dd className="break-words">
                    {confirmedValueText(activeReview, activeSavedState)}
                  </dd>
                  <dt className="text-muted-foreground">Record status</dt>
                  <dd>
                    {activeWorkspaceDecision
                      ? "Saved in this review session only; not included in current downloads."
                      : activeReview.activeConfirmation
                        ? "Recorded in the append-only human confirmation history."
                        : "No seller decision has been saved."}
                  </dd>
                </dl>
              </section>

              <fieldset className="flex flex-col gap-2 border-0 p-0">
                <legend className="text-sm font-semibold">Seller decision</legend>
                {SELLER_REVIEW_ACTIONS.map((action) => {
                  const requiresMachineValue =
                    action.state === "accepted_as_observed" || action.state === "region_revised";
                  const requiresImage =
                    action.state === "region_revised" ||
                    action.state === "value_and_region_revised";
                  return (
                    <label
                      key={action.state}
                      className="flex items-start gap-2 rounded-sm py-1 text-sm"
                    >
                      <input
                        type="radio"
                        name={`${activeField}-seller-decision`}
                        checked={activeDraft.decisionState === action.state}
                        disabled={
                          (requiresMachineValue &&
                            activeReview.machineObservation.value === null) ||
                          (requiresImage && !previewImage)
                        }
                        onChange={() => chooseAction(action.state)}
                      />
                      <span>
                        <span>{action.label}</span>
                        {isWorkspaceOnlySellerState(action.state) ? (
                          <span className="ml-1 text-xs text-muted-foreground">
                            (review session only in this slice)
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
                <div className="flex items-start gap-2 rounded-sm py-1 text-sm text-muted-foreground">
                  <input type="radio" disabled aria-label="Add missing finding" />
                  <span>
                    Add missing finding — unavailable in Slice 1; the seller-added, multi-region
                    contract is reserved for Slice 2.
                  </span>
                </div>
              </fieldset>

              {activeDraft.decisionState === "value_revised" ||
              activeDraft.decisionState === "value_and_region_revised" ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${activeField}-corrected-value`}>Seller-confirmed value</Label>
                  <Input
                    id={`${activeField}-corrected-value`}
                    value={activeDraft.correctedValue}
                    onChange={(event) =>
                      updateDraft(activeField, { correctedValue: event.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Seller-entered text is preserved separately and receives no OCR confidence.
                  </p>
                </div>
              ) : null}

              {activeDraft.decisionState === "region_revised" ||
              activeDraft.decisionState === "value_and_region_revised" ? (
                <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                  <p className="font-medium">Replacement evidence region required</p>
                  <p className="mt-1 text-muted-foreground">
                    Use Draw region on the image. Slice 2 will add move, resize, multi-region,
                    keyboard, and undo controls.
                  </p>
                </div>
              ) : null}

              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${activeField}-seller-note`}>Seller note (optional)</Label>
                <textarea
                  id={`${activeField}-seller-note`}
                  className="min-h-20 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm"
                  value={activeDraft.note}
                  onChange={(event) => updateDraft(activeField, { note: event.target.value })}
                />
              </div>

              {errors[activeField] ? (
                <div
                  role="alert"
                  className="rounded-md border border-alert-foreground/30 bg-alert p-3 text-sm text-alert-foreground"
                >
                  {errors[activeField]}
                </div>
              ) : null}

              <Button
                type="button"
                disabled={savingField === activeField}
                onClick={() => saveField(activeField)}
              >
                {savingField === activeField ? "Saving…" : "Save seller decision"}
              </Button>

              <details className="rounded-md border border-border">
                <summary className="cursor-pointer list-none rounded-md px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  Existing confirmation history ({activeHistory.length})
                </summary>
                <div className="border-t border-border px-3 py-2">
                  {activeHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No confirmation has been recorded yet.
                    </p>
                  ) : (
                    <ol className="flex flex-col gap-2 text-sm">
                      {activeHistory.map((entry) => (
                        <li
                          key={entry.confirmationId}
                          className="rounded-md border border-border/60 p-2"
                        >
                          <p className="font-medium">
                            Sequence {entry.sequence}:{" "}
                            {LEGACY_CONFIRMATION_LABEL[entry.decisionType]}
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
          ) : null}
        </div>
      </div>

      <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
        <p className="font-semibold">Current slice boundary</p>
        <p className="mt-1 text-muted-foreground">
          “Not this field” and new “Unable to confirm” decisions remain in this review session
          because the frozen confirmation schema has no exact equivalent. Add missing finding is
          unavailable. Current downloads include only confirmation records the existing export can
          represent faithfully.
        </p>
      </div>
    </section>
  );
}
