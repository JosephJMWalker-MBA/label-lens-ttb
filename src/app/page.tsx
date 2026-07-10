import { ShieldCheck } from "lucide-react";

import { ReviewWorkspace } from "@/features/review/ReviewWorkspace";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-4">
        <div className="flex items-center gap-3 text-muted-foreground">
          <ShieldCheck aria-hidden="true" className="h-6 w-6" />
          <span className="text-sm font-medium uppercase tracking-wide">Label Lens TTB</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Fast, explainable alcohol label verification
        </h1>
        <p className="text-muted-foreground">
          Upload a label image and enter the expected application data. AI and OCR may extract
          evidence; deterministic rules evaluate it; human reviewers remain authoritative.
        </p>
      </header>

      <ReviewWorkspace />
    </main>
  );
}
