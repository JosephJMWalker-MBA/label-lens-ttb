"use client";

import { useEffect, useRef, useState } from "react";

import { useOnboarding } from "@/components/onboarding/onboarding-context";
import { Button } from "@/components/ui/button";
import { Disclosure } from "@/components/ui/disclosure";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  PrecheckServiceError,
  PrecheckServiceResponse,
} from "@/server/precheck-service.types";

import { DispositionSection } from "./DispositionSection";
import { ResultView } from "./ResultView";
import { SAMPLE_DECLARED } from "./sample";

type Phase = "ready" | "processing" | "complete" | "failed";

const ACCEPTED = "image/png,image/jpeg";

interface ApiSuccess {
  ok: true;
  data: PrecheckServiceResponse;
}
interface ApiFailure {
  ok: false;
  error: PrecheckServiceError;
}

/** Human-readable byte size (kept simple; bytes are also shown for exactness). */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Local preview of the selected image (never uploaded to build it). */
function LabelPreview({ file, url }: { file: File; url: string }) {
  return (
    <figure className="flex flex-col gap-2">
      {/* A local blob object URL for a not-yet-uploaded file; next/image
          optimization does not apply and must not fetch/upload it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={`Preview of the selected label image: ${file.name}`}
        className="max-h-80 w-full rounded-md border border-border object-contain"
      />
      <figcaption className="text-sm text-muted-foreground">
        <span className="break-words font-medium text-foreground">{file.name}</span>
        <br />
        {file.type || "unknown type"} · {formatSize(file.size)}
      </figcaption>
    </figure>
  );
}

export function PrecheckWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [brand, setBrand] = useState("");
  const [alcohol, setAlcohol] = useState("");
  const [phase, setPhase] = useState<Phase>("ready");
  const [response, setResponse] = useState<PrecheckServiceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const startedAtRef = useRef(0);

  // Onboarding must yield to a running or ready result — capture its close via a
  // ref so it can be called on phase changes without re-subscribing effects.
  const onboarding = useOnboarding();
  const closeOnboardingRef = useRef(onboarding.close);
  closeOnboardingRef.current = onboarding.close;

  // A late-arriving or in-progress result must never be hidden behind the intro.
  useEffect(() => {
    if (phase === "processing" || phase === "complete") closeOnboardingRef.current();
  }, [phase]);

  // Honest elapsed-time counter while processing (no fake percentage or ETA).
  useEffect(() => {
    if (phase !== "processing") return;
    startedAtRef.current = Date.now();
    setElapsedSeconds(0);
    const id = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  // Create a local object URL for the preview and revoke it when the file
  // changes or the component unmounts, so no object URL is ever leaked.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    // Object URLs are unavailable in some non-browser environments; degrade to
    // no preview rather than throwing.
    let url: string | null = null;
    try {
      url = URL.createObjectURL(file);
    } catch {
      url = null;
    }
    setPreviewUrl(url);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [file]);

  const canRunUpload = file !== null && brand.trim() !== "" && alcohol.trim() !== "";
  const showPreview =
    file !== null &&
    previewUrl !== null &&
    (file.type === "image/png" || file.type === "image/jpeg");

  async function submit(body: FormData) {
    // Guard against a duplicate in-flight request (belt-and-braces with the
    // disabled controls) so a double activation never launches two pre-checks.
    if (phase === "processing") return;
    setPhase("processing");
    setError(null);
    setResponse(null);
    try {
      const res = await fetch("/api/precheck", { method: "POST", body });
      const json = (await res.json()) as ApiSuccess | ApiFailure;
      if (json.ok) {
        setResponse(json.data);
        setPhase("complete");
        requestAnimationFrame(() => resultRef.current?.focus());
      } else {
        setError(json.error.message);
        setPhase("failed");
        requestAnimationFrame(() => errorRef.current?.focus());
      }
    } catch {
      setError("The pre-check could not be reached. Check your connection and try again.");
      setPhase("failed");
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  }

  function runUpload() {
    if (!file) return;
    const body = new FormData();
    body.set("source", "upload");
    body.set("file", file);
    body.set("brand", brand);
    body.set("alcohol", alcohol);
    void submit(body);
  }

  function runSample() {
    setBrand(SAMPLE_DECLARED.brand);
    setAlcohol(SAMPLE_DECLARED.alcohol);
    const body = new FormData();
    body.set("source", "sample");
    body.set("brand", SAMPLE_DECLARED.brand);
    body.set("alcohol", SAMPLE_DECLARED.alcohol);
    void submit(body);
  }

  function clearImage() {
    setFile(null);
    setPhase("ready");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const previewNode = showPreview ? <LabelPreview file={file} url={previewUrl} /> : null;
  // Structured preview reference for the result's evidence overlays. Null for the
  // bundled sample (server-side only) or when no usable local preview exists.
  const previewImage =
    showPreview && file !== null && previewUrl !== null
      ? { url: previewUrl, name: file.name }
      : null;

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">1 · Label image</h2>
        <Label htmlFor="label-image">Select one label image (PNG or JPEG)</Label>
        <p id="label-image-help" className="text-xs text-muted-foreground">
          The image is processed for this check only and the tool does not store it.
        </p>
        <Input
          id="label-image"
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED}
          aria-describedby="label-image-help"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setPhase("ready");
          }}
        />

        {showPreview ? (
          <div className="flex flex-col gap-3">
            <div className="max-w-sm">{previewNode}</div>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                Replace image
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={clearImage}>
                Clear image
              </Button>
            </div>
          </div>
        ) : null}

        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={runSample}
            disabled={phase === "processing"}
          >
            Load verified M Cellars sample
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">
            Bundled demonstration fixture. It runs through the same real image extractor as an
            upload — it does not inject prepared results.
          </p>
        </div>
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (canRunUpload) runUpload();
        }}
      >
        <fieldset className="flex flex-col gap-4 border-0 p-0">
          <legend className="text-lg font-semibold">2 · Application facts</legend>
          <p id="facts-help" className="text-sm text-muted-foreground">
            Enter the values stated in the application so the tool can compare them with the
            evidence found on the artwork. These are not read from the image by OCR.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="declared-brand">
              Application brand name <span aria-hidden="true">*</span>
            </Label>
            <Input
              id="declared-brand"
              value={brand}
              required
              aria-required="true"
              aria-describedby="facts-help"
              onChange={(event) => setBrand(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="declared-alcohol">
              Application alcohol value (percent) <span aria-hidden="true">*</span>
            </Label>
            <Input
              id="declared-alcohol"
              inputMode="decimal"
              value={alcohol}
              required
              aria-required="true"
              aria-describedby="facts-help"
              onChange={(event) => setAlcohol(event.target.value)}
            />
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">3 · Run prescreen</h2>
          <div>
            <Button
              type="submit"
              disabled={!canRunUpload || phase === "processing"}
              aria-describedby={!canRunUpload ? "run-help" : undefined}
            >
              {phase === "processing" ? "Running…" : "Run pre-check"}
            </Button>
          </div>
          {!canRunUpload ? (
            <p id="run-help" className="text-sm text-muted-foreground">
              Select one image and enter both application facts to run a check, or load the sample.
            </p>
          ) : null}
        </div>
      </form>

      {/* A persistent live region announces stable status text once per change.
          The ticking elapsed time lives outside it so screen readers are not
          interrupted every second. */}
      <div role="status" aria-live="polite" aria-busy={phase === "processing"} className="text-sm">
        {phase === "processing" ? (
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <span
              aria-hidden="true"
              className="processing-spinner inline-block h-4 w-4 shrink-0 rounded-full border-2 border-muted-foreground/40 border-t-muted-foreground"
            />
            Analyzing label evidence…
          </span>
        ) : null}
        {phase === "complete" ? (
          <span className="text-muted-foreground">Pre-check complete.</span>
        ) : null}
      </div>
      {phase === "processing" ? (
        <p aria-hidden="true" className="text-xs text-muted-foreground">
          Working for {elapsedSeconds}s. A first run can take longer while the image is analyzed;
          nothing is stuck.
        </p>
      ) : null}

      {phase === "failed" && error ? (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="rounded-md border border-alert-foreground/30 bg-alert p-4 text-sm text-alert-foreground"
        >
          <h2 className="font-semibold">Pre-check could not complete</h2>
          <p className="mt-1">{error}</p>
        </div>
      ) : null}

      {phase === "complete" && response ? (
        <div ref={resultRef} tabIndex={-1} className="flex flex-col gap-6">
          <ResultView response={response} previewImage={previewImage} />
          <Disclosure title="Record internal disposition">
            <DispositionSection response={response} onAppended={setResponse} />
          </Disclosure>
        </div>
      ) : null}
    </section>
  );
}
