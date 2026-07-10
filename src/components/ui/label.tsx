import * as React from "react";

import { cn } from "@/lib/utils";

/** Minimal styled label. A plain element keeps the dependency surface small. */
const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn("text-sm font-medium leading-none text-foreground", className)}
      {...props}
    />
  ),
);
Label.displayName = "Label";

export { Label };
