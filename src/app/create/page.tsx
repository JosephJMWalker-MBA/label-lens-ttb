import { SkipLink } from "@/components/a11y/SkipLink";
import { AppHeader } from "@/components/layout/AppHeader";
import { CreateWorkspace } from "@/features/create/CreateWorkspace";

import { AppProviders } from "../AppProviders";

/**
 * The first maker-facing workflow: start a label project from facts, with no
 * artwork and no finished label.
 *
 * Session-only. Nothing is persisted; the export is the artifact.
 */
export default function CreatePage() {
  return (
    <AppProviders>
      <SkipLink />
      <AppHeader current="create" />
      <main id="main-content" className="mx-auto max-w-3xl px-6 py-14">
        <div className="mb-8 flex flex-col gap-3">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Create a new label</h1>
          <p className="text-lg text-foreground">
            Start from what you know about your product. You do not need artwork, and you do not
            need all the answers.
          </p>
        </div>
        <CreateWorkspace />
      </main>
    </AppProviders>
  );
}
