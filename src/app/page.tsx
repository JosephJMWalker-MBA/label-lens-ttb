import { ShieldCheck } from "lucide-react";

import { PrecheckWorkspace } from "@/features/precheck/PrecheckWorkspace";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 px-6 py-16">
      <header className="flex flex-col gap-4">
        <div className="flex items-center gap-3 text-muted-foreground">
          <ShieldCheck aria-hidden="true" className="h-6 w-6" />
          <span className="text-sm font-medium uppercase tracking-wide">Label Lens TTB</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Label Lens TTB</h1>
        <p className="text-lg text-foreground">Prescreen a wine label before formal review.</p>
        <p className="text-muted-foreground">
          Upload one label to extract brand and alcohol evidence, identify items that need review,
          and create a traceable report.
        </p>
        <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          This tool supports preparation and review. It does not approve or reject a label, and it
          is not a TTB approval or legal determination.
        </p>
      </header>

      <PrecheckWorkspace />
    </main>
  );
}
