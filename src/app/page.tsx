import { ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <div className="flex items-center gap-3 text-muted-foreground">
        <ShieldCheck aria-hidden="true" className="h-6 w-6" />
        <span className="text-sm font-medium uppercase tracking-wide">Label Lens TTB</span>
      </div>

      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Fast, explainable alcohol label verification
      </h1>

      <p className="text-muted-foreground">
        A standalone proof of concept. AI and OCR may extract evidence; deterministic rules evaluate
        it; human reviewers remain authoritative. The verification workflow is under construction.
      </p>

      <div>
        <Button disabled>Start a review (coming soon)</Button>
      </div>
    </main>
  );
}
