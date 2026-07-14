"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { triggerDownload } from "@/features/precheck/download";

import type { ProjectFacts } from "./facts";
import {
  buildProjectFactsExport,
  parseProjectFactsExport,
  projectFactsFilename,
} from "./session-export";

const EXPORT_ERROR = "The project file could not be created. Try again.";

/**
 * Export the session as canonical, checksum-verified JSON.
 *
 * This is the only durable artifact the slice produces. Nothing is stored: no
 * database, no project record, no account. When the tab closes, the session is
 * gone, and the panel says so rather than letting a maker assume otherwise.
 *
 * The checksum is re-verified against the committed parser before the download
 * is offered, so a file that could not be read back is never handed over.
 */
export function ExportPanel({ facts }: { facts: ProjectFacts }) {
  const [error, setError] = useState<string | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  async function exportSession() {
    setError(null);
    try {
      const text = await buildProjectFactsExport(facts);
      // Verify the artifact reads back through the committed parser before it is
      // offered. An export that cannot be re-verified is not an export.
      const reparsed = await parseProjectFactsExport(text);
      if (!reparsed.ok) {
        setError(EXPORT_ERROR);
        requestAnimationFrame(() => errorRef.current?.focus());
        return;
      }
      triggerDownload({
        content: text,
        filename: projectFactsFilename(reparsed.value.integrity.value),
        mimeType: "application/json",
      });
    } catch {
      setError(EXPORT_ERROR);
      requestAnimationFrame(() => errorRef.current?.focus());
    }
  }

  return (
    <section aria-labelledby="export-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 id="export-heading" className="text-2xl font-semibold tracking-tight">
          Export your project
        </h2>
        <p className="max-w-2xl text-muted-foreground">
          Save the facts you entered and the cited requirements this system holds, as one canonical
          JSON file with a SHA-256 checksum.
        </p>
      </div>

      <p className="max-w-2xl rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Nothing is saved here.</span> This session is
        held in your browser only — there is no account, no project storage, and no history. If you
        close this tab without exporting, the facts are gone.
      </p>

      <div>
        <Button type="button" onClick={() => void exportSession()}>
          Export project file (JSON)
        </Button>
      </div>

      {error ? (
        <div
          ref={errorRef}
          tabIndex={-1}
          role="alert"
          className="max-w-2xl rounded-md border border-alert-foreground/30 bg-alert p-3 text-sm text-alert-foreground"
        >
          {error}
        </div>
      ) : null}

      <p className="max-w-2xl text-xs text-muted-foreground">
        The file separates what you declared from what this system cites, so a designer, reviewer,
        or specialist can see which is which. It is not an approval, and it does not state that a
        label is complete.
      </p>
    </section>
  );
}
