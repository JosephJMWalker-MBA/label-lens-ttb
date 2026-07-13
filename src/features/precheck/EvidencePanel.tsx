"use client";

import { useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type {
  AnalyzerFieldObservation,
  EvidenceGeometry,
} from "@/pipeline/analyzer/analyzer.types";
import type { ResultObservations } from "@/pipeline/result/result.types";

import { observationGeometry, overlayStyle } from "./evidence-geometry";
import {
  observationStateLabel,
  stateExplanation,
  summarizeAlcohol,
  summarizeBrand,
} from "./observation-language";

/**
 * Evidence-centered result summary: the uploaded label with server-provided
 * evidence regions overlaid, beside concise Brand and Alcohol evidence cards.
 *
 * Overlays use only server geometry (never client-inferred coordinates) and are
 * positioned as percentages of the geometry's own reference frame, so they track
 * responsive scaling and browser zoom. Selecting a card highlights and focuses
 * its image region; activating an image region focuses its card. Alternates are
 * presented for inspection only — nothing here changes or stores machine
 * evidence, and no confirmation is persisted.
 */

type FieldKey = "brand" | "alcohol";

interface PreviewImage {
  url: string;
  name: string;
}

const FIELD_TITLE: Record<FieldKey, string> = {
  brand: "Detected brand",
  alcohol: "Detected alcohol",
};

const FIELD_REGION_NAME: Record<FieldKey, string> = {
  brand: "Brand",
  alcohol: "Alcohol",
};

/** How many candidate rows are shown before the rest go behind "Show all". */
const VISIBLE_CANDIDATES = 5;

interface Inspection {
  field: FieldKey;
  value: string;
  geometry: EvidenceGeometry;
}

export function EvidencePanel({
  observations,
  previewImage,
}: {
  observations: ResultObservations;
  previewImage?: PreviewImage | null;
}) {
  const [activeField, setActiveField] = useState<FieldKey | null>(null);
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const overlayRefs = {
    brand: useRef<HTMLButtonElement>(null),
    alcohol: useRef<HTMLButtonElement>(null),
  };
  const cardRefs = {
    brand: useRef<HTMLDivElement>(null),
    alcohol: useRef<HTMLDivElement>(null),
  };

  const fields: { key: FieldKey; obs: AnalyzerFieldObservation; summary: string }[] = [
    { key: "brand", obs: observations.brandName, summary: summarizeBrand(observations) },
    { key: "alcohol", obs: observations.alcoholStatement, summary: summarizeAlcohol(observations) },
  ];

  const hasImage = Boolean(previewImage);

  /** Card → image: highlight and focus the field's overlay region. The overlay
      node already exists (only its active state changes), so focus is direct. */
  function showOnLabel(field: FieldKey) {
    setActiveField(field);
    setInspection(null);
    setAnnouncement(`${FIELD_REGION_NAME[field]} evidence region highlighted on the label image.`);
    overlayRefs[field].current?.focus();
  }

  /** Image → card: focus the corresponding evidence card. */
  function focusCard(field: FieldKey) {
    setActiveField(field);
    setAnnouncement(`${FIELD_TITLE[field]} card focused.`);
    cardRefs[field].current?.focus();
  }

  /** Inspect-only candidate highlight; never changes the selected machine result. */
  function inspectCandidate(field: FieldKey, value: string, geometry: EvidenceGeometry) {
    setInspection({ field, value, geometry });
    setActiveField(null);
    setAnnouncement(
      `Candidate ${FIELD_REGION_NAME[field].toLowerCase()} reading highlighted for inspection: ${value}. The selected machine reading is unchanged.`,
    );
  }

  function clearInspection() {
    setInspection(null);
    setAnnouncement("Candidate highlight cleared.");
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      {/* Screen-reader announcements for highlight changes. */}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {/* Image pane with evidence overlays. */}
      <div className="min-w-0">
        {hasImage && previewImage ? (
          <figure className="flex flex-col gap-2">
            <div className="relative w-full">
              {/* Local blob URL of the user's file; next/image must not fetch it. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewImage.url}
                alt={`Preview of the selected label image: ${previewImage.name}`}
                className="block h-auto w-full rounded-md border border-border object-contain"
              />
              {fields.map(({ key, obs, summary }) => {
                const geometry = observationGeometry(obs);
                if (!geometry) return null;
                return (
                  <button
                    key={key}
                    ref={overlayRefs[key]}
                    type="button"
                    data-field={key}
                    data-active={activeField === key}
                    className="evidence-overlay"
                    style={overlayStyle(geometry)}
                    aria-label={`${FIELD_REGION_NAME[key]} evidence region: ${summary}. Activate to open the ${FIELD_TITLE[key].toLowerCase()} card.`}
                    onClick={() => focusCard(key)}
                  >
                    <span aria-hidden="true" className="evidence-chip">
                      {FIELD_REGION_NAME[key]}
                    </span>
                  </button>
                );
              })}
              {inspection ? (
                <span
                  data-field="candidate"
                  className="evidence-overlay"
                  style={overlayStyle(inspection.geometry)}
                  role="img"
                  aria-label={`Candidate reading location: ${inspection.value}`}
                >
                  <span aria-hidden="true" className="evidence-chip">
                    Candidate
                  </span>
                </span>
              ) : null}
            </div>
            <figcaption className="text-xs text-muted-foreground">
              Highlighted regions show where the evidence was read. Solid = brand, dashed = alcohol.
            </figcaption>
          </figure>
        ) : (
          <div className="flex h-full min-h-32 flex-col justify-center rounded-md border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">No image preview for this run</p>
            <p className="mt-1">
              Evidence locations cannot be shown without a local preview (the bundled sample runs
              entirely server-side). Region coordinates remain listed under Technical provenance.
            </p>
          </div>
        )}
      </div>

      {/* Evidence cards. */}
      <dl className="flex min-w-0 flex-col gap-3">
        {fields.map(({ key, obs, summary }) => (
          <EvidenceCard
            key={key}
            field={key}
            obs={obs}
            summary={summary}
            cardRef={cardRefs[key]}
            canLocate={hasImage && observationGeometry(obs) !== null}
            hasGeometry={observationGeometry(obs) !== null}
            onShowOnLabel={() => showOnLabel(key)}
            onInspectCandidate={(value, geometry) => inspectCandidate(key, value, geometry)}
            canInspect={hasImage}
          />
        ))}
        {inspection ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>
              Inspecting candidate:{" "}
              <span className="break-words font-medium">{inspection.value}</span>
            </span>
            <Button type="button" variant="outline" size="sm" onClick={clearInspection}>
              Clear candidate highlight
            </Button>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

function EvidenceCard({
  field,
  obs,
  summary,
  cardRef,
  canLocate,
  hasGeometry,
  canInspect,
  onShowOnLabel,
  onInspectCandidate,
}: {
  field: FieldKey;
  obs: AnalyzerFieldObservation;
  summary: string;
  cardRef: React.RefObject<HTMLDivElement | null>;
  /** Geometry exists AND an image is available to show it on. */
  canLocate: boolean;
  /** Geometry exists at all (even without a preview image). */
  hasGeometry: boolean;
  canInspect: boolean;
  onShowOnLabel: () => void;
  onInspectCandidate: (value: string, geometry: EvidenceGeometry) => void;
}) {
  const headingId = useId();
  const [showAll, setShowAll] = useState(false);
  const alternates = obs.alternates;
  const visible = showAll ? alternates : alternates.slice(0, VISIBLE_CANDIDATES);

  return (
    <div
      ref={cardRef}
      tabIndex={-1}
      aria-labelledby={headingId}
      className="rounded-md border border-border bg-card p-4 text-card-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <dt id={headingId} className="text-sm font-semibold">
        {FIELD_TITLE[field]}
      </dt>
      <dd className="mt-1 flex flex-col gap-2">
        <p className="text-base font-medium">
          <span className="mr-2 inline-block rounded border border-border px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
            {observationStateLabel(obs.state)}
          </span>
          <span className="break-words">{summary}</span>
        </p>
        <p className="text-sm text-muted-foreground">{stateExplanation(field, obs.state)}</p>

        {canLocate ? (
          <div>
            <Button type="button" variant="outline" size="sm" onClick={onShowOnLabel}>
              View on label
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {hasGeometry
              ? "Location coordinates were reported, but no local preview is available to show them on."
              : "No location coordinates were reported for this reading."}
          </p>
        )}

        {alternates.length > 0 ? (
          <details className="rounded-md border border-border">
            <summary className="cursor-pointer list-none rounded-md px-3 py-2 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
              {alternates.length} other candidate {alternates.length === 1 ? "reading" : "readings"}
            </summary>
            <div className="border-t border-border px-3 py-2">
              <p className="text-xs text-muted-foreground">
                Shown for inspection only — the selected machine reading above is unchanged.
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {visible.map((alt, i) => (
                  <li
                    key={`${alt.value}-${i}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/60 px-2 py-1.5 text-sm"
                  >
                    <span className="min-w-0 break-words">{alt.value}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-xs text-muted-foreground">
                        OCR evidence {alt.ocrEvidenceScore?.toFixed(2) ?? "—"}
                      </span>
                      {canInspect && alt.geometry ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => onInspectCandidate(alt.value, alt.geometry!)}
                        >
                          View on label
                        </Button>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
              {alternates.length > VISIBLE_CANDIDATES ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2"
                  aria-expanded={showAll}
                  onClick={() => setShowAll((v) => !v)}
                >
                  {showAll ? "Show fewer candidates" : `Show all ${alternates.length} candidates`}
                </Button>
              ) : null}
            </div>
          </details>
        ) : null}

        <p className="text-xs text-muted-foreground">
          Technical: machine state: {obs.state} · OCR evidence{" "}
          {obs.ocrEvidenceScore?.toFixed(2) ?? "—"}
        </p>
      </dd>
    </div>
  );
}
