import { ShieldCheck } from "lucide-react";

import { PrecheckWorkspace } from "@/features/precheck/PrecheckWorkspace";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-4">
        <div className="flex items-center gap-3 text-muted-foreground">
          <ShieldCheck aria-hidden="true" className="h-6 w-6" />
          <span className="text-sm font-medium uppercase tracking-wide">Label Lens TTB</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Wine label pre-check (advisory)
        </h1>
        <p className="text-muted-foreground">
          Select one wine label image and enter the application brand and alcohol value. A local
          extractor reads the artwork, deterministic rules evaluate it, and you can download the
          result as JSON. This is a pre-submission aid, not a TTB approval.
        </p>
      </header>

      <PrecheckWorkspace />
    </main>
  );
}
