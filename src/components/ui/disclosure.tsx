import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * A progressive-disclosure section built on native <details>/<summary>, so it is
 * keyboard-operable and screen-reader-announced without custom ARIA. Collapsed
 * content stays in the DOM (never deleted), so all information remains reachable.
 */
export function Disclosure({
  title,
  children,
  defaultOpen = false,
  summaryAccessory,
  className,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  /** Optional short status text shown in the summary (e.g. a count). */
  summaryAccessory?: ReactNode;
  className?: string;
}) {
  return (
    <details open={defaultOpen} className={cn("rounded-md border border-border", className)}>
      <summary
        className={cn(
          "flex cursor-pointer list-none items-center gap-2 rounded-md px-4 py-3 text-base font-semibold",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          "[&::-webkit-details-marker]:hidden",
        )}
      >
        <ChevronRight
          aria-hidden="true"
          className="h-4 w-4 shrink-0 transition-transform [details[open]>summary_&]:rotate-90"
        />
        <span className="flex-1">{title}</span>
        {summaryAccessory ? (
          <span className="text-sm font-normal text-muted-foreground">{summaryAccessory}</span>
        ) : null}
      </summary>
      <div className="border-t border-border px-4 py-4">{children}</div>
    </details>
  );
}
