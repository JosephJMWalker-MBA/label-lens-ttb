"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ExpectedFields } from "@/domain/label/label.types";
import { REQUIRED_EXPECTED_FIELDS } from "@/domain/label/label.schema";
import { validateUpload } from "@/pipeline/upload/validate-upload";

import { DISTILLED_SPIRITS_SAMPLE } from "./sample-defaults";

type FormState = Record<keyof ExpectedFields, string>;

const EMPTY_FORM: FormState = {
  brandName: "",
  classType: "",
  alcoholContent: "",
  netContents: "",
  nameAndAddress: "",
  countryOfOrigin: "",
};

const FIELDS: { key: keyof FormState; label: string; required: boolean }[] = [
  { key: "brandName", label: "Brand name", required: true },
  { key: "classType", label: "Class / type", required: true },
  { key: "alcoholContent", label: "Alcohol content", required: true },
  { key: "netContents", label: "Net contents", required: true },
  { key: "nameAndAddress", label: "Name and address", required: true },
  { key: "countryOfOrigin", label: "Country of origin (imports)", required: false },
];

export function ReviewWorkspace() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fileName, setFileName] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Revoke the object URL when it changes or the component unmounts.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleFile(file: File | undefined) {
    setSubmitted(false);
    if (!file) return;

    const result = validateUpload({ name: file.name, type: file.type, size: file.size });
    if (!result.ok) {
      setUploadError(result.error.message);
      setFileName(null);
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      return;
    }

    setUploadError(null);
    setFileName(file.name);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }

  function updateField(key: keyof FormState, value: string) {
    setSubmitted(false);
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const requiredComplete = REQUIRED_EXPECTED_FIELDS.every((key) => form[key].trim() !== "");
  const canAnalyze = fileName !== null && requiredComplete;

  return (
    <section className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">1 · Label image</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setForm({ ...EMPTY_FORM, ...DISTILLED_SPIRITS_SAMPLE });
              setSubmitted(false);
            }}
          >
            Fill sample data
          </Button>
        </div>

        <Label htmlFor="label-image">Upload a label image (PNG, JPEG, or WebP)</Label>
        <Input
          id="label-image"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-describedby={uploadError ? "upload-error" : undefined}
          onChange={(event) => handleFile(event.target.files?.[0])}
        />

        {uploadError ? (
          <p id="upload-error" role="alert" className="text-sm text-foreground">
            {uploadError}
          </p>
        ) : null}

        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- object URL preview, not a remote asset
          <img
            src={previewUrl}
            alt={`Preview of ${fileName ?? "selected label"}`}
            className="max-h-64 w-auto rounded-md border border-border"
          />
        ) : null}
      </div>

      <form className="flex flex-col gap-4" onSubmit={(event) => event.preventDefault()}>
        <fieldset className="flex flex-col gap-4 border-0 p-0">
          <legend className="text-lg font-semibold">2 · Expected application data</legend>
          {FIELDS.map(({ key, label, required }) => (
            <div key={key} className="flex flex-col gap-1.5">
              <Label htmlFor={key}>
                {label}
                {required ? <span aria-hidden="true"> *</span> : null}
              </Label>
              <Input
                id={key}
                value={form[key]}
                required={required}
                aria-required={required}
                onChange={(event) => updateField(key, event.target.value)}
              />
            </div>
          ))}
        </fieldset>

        <div className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">3 · Analyze</h2>
          <div>
            <Button type="button" disabled={!canAnalyze} onClick={() => setSubmitted(true)}>
              Analyze label
            </Button>
          </div>
          {!canAnalyze ? (
            <p className="text-sm text-muted-foreground">
              Add a label image and complete the required fields (*) to enable analysis.
            </p>
          ) : null}
          {submitted ? (
            <p role="status" className="text-sm text-muted-foreground">
              Inputs are ready. The analysis pipeline connects in a later slice — no results are
              fabricated here.
            </p>
          ) : null}
        </div>
      </form>
    </section>
  );
}
