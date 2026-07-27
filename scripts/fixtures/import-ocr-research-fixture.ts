import {
  importResearchFixture,
  type FixtureImportOptions,
  type ResearchFixture,
} from "@/fixtures/ocr-research/fixture-corpus";

function flags(argv: string[]): Map<string, string> {
  const parsed = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`INVALID_ARGUMENT: ${key ?? "missing"}`);
    }
    parsed.set(key.slice(2), value);
  }
  return parsed;
}

function required(values: Map<string, string>, key: string): string {
  const value = values.get(key)?.trim();
  if (!value) throw new Error(`MISSING_ARGUMENT: --${key}`);
  return value;
}

function optional(values: Map<string, string>, key: string): string | null {
  return values.get(key)?.trim() || null;
}

function region(values: Map<string, string>): ResearchFixture["regions"] {
  const raw = optional(values, "brand-region");
  if (!raw) return { brand: [] };
  const numbers = raw.split(",").map(Number);
  if (numbers.length !== 4 || !numbers.every(Number.isFinite)) {
    throw new Error("INVALID_ARGUMENT: --brand-region must be x,y,width,height");
  }
  return {
    brand: [
      {
        unit: "normalized-panel-relative",
        provenance: "seller-selected-region",
        x: numbers[0],
        y: numbers[1],
        width: numbers[2],
        height: numbers[3],
        label: optional(values, "brand-region-label") ?? "seller-selected Brand region",
      },
    ],
  };
}

function evidenceSource(
  values: Map<string, string>,
  prefix: "brand" | "warning" | "alcohol",
  wholeLabelReviewed = false,
) {
  return {
    kind: "human-transcription" as const,
    description: required(values, `${prefix}-truth-source`),
    reference: required(values, `${prefix}-truth-reference`),
    wholeLabelReviewed,
  };
}

function truth(values: Map<string, string>): ResearchFixture["truth"] {
  const brand = optional(values, "brand-truth");
  const warning = optional(values, "warning-truth");
  const alcohol = optional(values, "alcohol-truth");
  const wholeLabelReviewed = optional(values, "whole-label-reviewed") === "true";
  if (warning && warning !== "present" && warning !== "absent") {
    throw new Error("INVALID_ARGUMENT: --warning-truth must be present or absent");
  }
  const warningPresence: "present" | "absent" | null =
    warning === "present" || warning === "absent" ? warning : null;
  return {
    brand: brand
      ? {
          acceptableValues: brand
            .split("|")
            .map((value) => value.trim())
            .filter(Boolean),
          evidenceSource: evidenceSource(values, "brand"),
        }
      : null,
    warning: warningPresence
      ? {
          presence: warningPresence,
          expectedText: optional(values, "warning-expected-text"),
          evidenceSource: evidenceSource(values, "warning", wholeLabelReviewed),
        }
      : null,
    alcohol: alcohol
      ? {
          acceptableValues: alcohol
            .split("|")
            .map((value) => value.trim())
            .filter(Boolean),
          evidenceSource: evidenceSource(values, "alcohol"),
        }
      : null,
  };
}

async function main() {
  const values = flags(process.argv.slice(2));
  const mode = required(values, "mode");
  if (mode !== "local-private" && mode !== "committable") {
    throw new Error("INVALID_ARGUMENT: --mode must be local-private or committable");
  }
  const options: FixtureImportOptions = {
    sourcePath: required(values, "source"),
    mode,
    displayName: required(values, "display-name"),
    provenance: {
      sourceDescription: required(values, "provenance"),
      sourceReference: required(values, "provenance-reference"),
      acquisitionMethod: required(values, "acquisition-method"),
      acquiredBy: required(values, "acquired-by"),
      acquiredAt: optional(values, "acquired-at"),
    },
    redistribution: {
      status: mode === "committable" ? "approved-for-repository" : "private-not-approved",
      license: required(values, "license"),
      notes: required(values, "redistribution-notes"),
    },
    regions: region(values),
    truth: truth(values),
  };
  const imported = await importResearchFixture(options);
  console.log(
    JSON.stringify(
      {
        fixtureId: imported.fixture.fixtureId,
        mode: imported.fixture.mode,
        manifestPath: imported.manifestPath,
        fixtureDirectory: imported.fixtureDirectory,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
