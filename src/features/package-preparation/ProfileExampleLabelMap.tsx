import { Button } from "@/components/ui/button";

import type { PackageCategoryInstruction } from "./package-profile";

export function ProfileExampleLabelMap({
  instructions,
  emphasizedCategoryId,
  onClose,
}: {
  instructions: readonly PackageCategoryInstruction[];
  emphasizedCategoryId?: PackageCategoryInstruction["categoryId"];
  onClose: () => void;
}) {
  return (
    <section
      className="grid min-w-0 gap-5 rounded-lg border border-border bg-card p-4 sm:p-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]"
      aria-labelledby="example-label-map-heading"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Contextual guide
        </p>
        <h2 id="example-label-map-heading" className="mt-1 text-2xl font-semibold">
          Example label map
        </h2>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          This synthetic map teaches placement only. It is not a real label and its wording should
          not be copied. Your own front and back images remain separate coordinate frames.
        </p>

        <div className="mt-4 grid min-w-0 grid-cols-2 gap-3" data-testid="example-label-map">
          {(["front", "back"] as const).map((role) => (
            <div key={role} className="min-w-0">
              <p className="mb-1 text-center text-xs font-semibold uppercase tracking-wide">
                Example {role}
              </p>
              <svg
                viewBox="0 0 100 150"
                role="img"
                aria-label={`Synthetic ${role} label with example category callouts`}
                className="block w-full rounded-md border border-border bg-[#f7f0df]"
              >
                <rect x="5" y="5" width="90" height="140" rx="4" fill="#fffaf0" />
                <path d="M20 18 H80 M26 128 H74" stroke="#bba87c" strokeWidth="1" />
                <text x="50" y="18" textAnchor="middle" fontSize="4" fill="#6b5b3e">
                  SYNTHETIC LABEL
                </text>
                {instructions
                  .filter((instruction) => instruction.examplePanelRole === role)
                  .map((instruction) => {
                    const region = instruction.exampleRegion;
                    return (
                      <g key={instruction.categoryId}>
                        <rect
                          x={region.x * 100}
                          y={region.y * 150}
                          width={region.width * 100}
                          height={region.height * 150}
                          fill="rgba(194,65,12,.12)"
                          stroke="#c2410c"
                          strokeWidth="1.2"
                        />
                        <text
                          x={(region.x + 0.02) * 100}
                          y={(region.y + region.height / 2) * 150}
                          fontSize="4"
                          fontWeight="700"
                          fill="#7c2d12"
                        >
                          {instruction.exampleValue}
                        </text>
                      </g>
                    );
                  })}
              </svg>
            </div>
          ))}
        </div>
        <p className="mt-2 text-center text-xs font-semibold text-muted-foreground">
          Example only — do not copy this wording or placement.
        </p>
      </div>

      <div className="flex min-w-0 flex-col justify-between gap-5">
        <div className="space-y-3">
          {instructions.map((instruction, index) => (
            <div
              key={instruction.categoryId}
              className={`rounded-md border p-3 ${
                instruction.categoryId === emphasizedCategoryId
                  ? "border-blue-600 bg-blue-50"
                  : "border-border"
              }`}
            >
              <p className="text-sm font-semibold">
                {index + 1}. {instruction.plainLanguageQuestion}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{instruction.placementHint}</p>
            </div>
          ))}
          <div className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
            Other label work can involve class/type, net contents, government warning, and more.
            Those future categories are educational context only and are not supported by this
            reviewed profile.
          </div>
        </div>
        <Button type="button" onClick={onClose}>
          Close guide
        </Button>
      </div>
    </section>
  );
}
