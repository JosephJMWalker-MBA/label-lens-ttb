"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
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

export function PrecheckWorkspace() {
  const [file, setFile] = useState<File | null>(null);
  const [brand, setBrand] = useState("");
  const [alcohol, setAlcohol] = useState("");
  const [phase, setPhase] = useState<Phase>("ready");
  const [response, setResponse] = useState<PrecheckServiceResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resultRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const canRunUpload = file !== null && brand.trim() !== "" && alcohol.trim() !== "";

  async function submit(body: FormData) {
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

  return (
    <section className="flex flex-col gap-8">
      <p className="rounded-md border border-border bg-muted/40 p-4 text-sm text-foreground">
        This is a pre-submission aid. It is <strong>not a TTB approval</strong> and not a legal or
        official determination. Findings reflect only the evidence extracted from the image and the
        application values you enter; a qualified person remains responsible for review and
        submission decisions. This slice processes one image for the current check and does not
        store it.
      </p>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">1 · Label image</h2>
        <Label htmlFor="label-image">Select one label image (PNG or JPEG)</Label>
        <Input
          id="label-image"
          type="file"
          accept={ACCEPTED}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setPhase("ready");
          }}
        />
        {file ? (
          <p className="text-sm text-muted-foreground">
            Selected: {file.name} · {file.type || "unknown type"} · {file.size} bytes
          </p>
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
          <legend className="text-lg font-semibold">2 · Application values</legend>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="declared-brand">
              Application brand name <span aria-hidden="true">*</span>
            </Label>
            <Input
              id="declared-brand"
              value={brand}
              required
              aria-required="true"
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
              onChange={(event) => setAlcohol(event.target.value)}
            />
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">3 · Run pre-check</h2>
          <div>
            <Button type="submit" disabled={!canRunUpload || phase === "processing"}>
              Run pre-check
            </Button>
          </div>
          {!canRunUpload ? (
            <p className="text-sm text-muted-foreground">
              Select one image and enter both application values to run a check, or load the sample.
            </p>
          ) : null}
        </div>
      </form>

      <div aria-live="polite" role="status" className="text-sm">
        {phase === "processing" ? (
          <p className="text-muted-foreground">Extracting evidence and evaluating checks…</p>
        ) : null}
        {phase === "complete" ? <p className="text-muted-foreground">Pre-check complete.</p> : null}
      </div>

      {phase === "failed" && error ? (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="rounded-md border border-border bg-muted/40 p-4 text-sm text-foreground"
        >
          <h2 className="font-semibold">Pre-check could not complete</h2>
          <p className="mt-1">{error}</p>
        </div>
      ) : null}

      {phase === "complete" && response ? (
        <div ref={resultRef} tabIndex={-1} className="flex flex-col gap-8">
          <ResultView response={response} />
          <DispositionSection response={response} onAppended={setResponse} />
        </div>
      ) : null}
    </section>
  );
}
