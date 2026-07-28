import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { alcoholParsedAccurate } from "@/fixtures/eval/metrics";
import { selectAlcoholObservation } from "@/pipeline/extractor/field-selection";
import { createLocalOcrEngine, PAGE_SEG } from "@/pipeline/extractor/ocr-engine";
import { runOcrPass, type PlannedOcrPass } from "@/pipeline/extractor/regions";

// Evaluation-only boundary-stability check for approved-wine-023 ONLY.
//
// Rationale: approved-wine-023 has primary-pass confidence 0.58, within 0.02 of
// the 0.6 LOW_CONFIDENCE threshold, and its unrotated recovery candidate reached
// OBSERVED in the orientation-attribution experiment. A single repeat is thin
// evidence of stability for a case that close to a state boundary, so two
// ADDITIONAL treatment-arm repeats are run here (total 4 observations including
// the original primary + repeat).
//
// Varies nothing. Same crop, same 0-degree treatment rotation, same scale, PSM,
// preprocessing, parser, ranking, and model as the frozen experiment.

const CASE_ID = "approved-wine-023";
const IMAGE_PATH = "tests/fixtures/precheck/approved-wine-023/label.png";
const SIDE = "left" as const;
const TRUTH_PERCENTS = [14];
const EDGE_STRIP_SCALE = 3;
const EXTRA_REPEATS = 2;

const OUTPUT_PATH = path.join(
  process.cwd(),
  "artifacts/issue-149-alcohol-recovery-orientation-attribution/boundary-repeats-approved-wine-023.json",
);

async function main(): Promise<void> {
  const bytes = readFileSync(IMAGE_PATH);
  const imageSha256 = createHash("sha256").update(bytes).digest("hex");

  const sharp = (await import("sharp")).default;
  const meta = await sharp(bytes).metadata();
  const width = meta.width!;
  const height = meta.height!;

  // Same crop derivation as the frozen experiment and geometry audit.
  const stripWidth = Math.max(Math.min(72, width), Math.min(width, Math.round(width * 0.44)));
  const crop = { left: 0, top: 0, width: stripWidth, height };

  const pass: PlannedOcrPass = {
    passId: `orientation-attrib-${CASE_ID}-${SIDE}-treatment`,
    regionName: `${CASE_ID}-${SIDE}-treatment`,
    passKind: "left-edge-strip-rot270",
    triggerReasons: ["alcohol-not-observed"],
    preprocessing: [
      "crop:edge-strip",
      "rotate:0",
      "grayscale",
      "normalise",
      `scale:${EDGE_STRIP_SCALE}`,
    ],
    fieldEligibility: { brand: false, alcohol: true },
    pageSegMode: PAGE_SEG.SPARSE_TEXT,
    transform: {
      crop,
      rotate: 0,
      scale: EDGE_STRIP_SCALE,
      originalWidth: width,
      originalHeight: height,
    },
  };

  const engine = await createLocalOcrEngine();
  const observations = [];

  for (let i = 1; i <= EXTRA_REPEATS; i += 1) {
    const result = await runOcrPass(bytes, pass, engine);
    const raw = result.words.map((w) => w.text);
    const rawTranscript = raw.join(" ");
    const selection = selectAlcoholObservation([result]);
    const candidate = selection.observation.value;
    observations.push({
      repeatIndex: i,
      rawTranscript,
      rawWordCount: raw.length,
      candidate,
      candidateState: selection.observation.state,
      candidateConfidence: selection.observation.confidence,
      candidateCorrect: alcoholParsedAccurate(candidate, TRUTH_PERCENTS),
    });
    console.log(
      `repeat ${i}: candidate=${candidate} state=${selection.observation.state} conf=${selection.observation.confidence}`,
    );
  }

  const allIdentical =
    new Set(
      observations.map((o) => JSON.stringify([o.rawTranscript, o.candidate, o.candidateState])),
    ).size === 1;

  writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(
      {
        caseId: CASE_ID,
        imageSha256,
        arm: "treatment (0 degree rotation)",
        reason:
          "boundary-confidence stability check: primary-pass confidence 0.58 is within 0.02 of the 0.6 LOW_CONFIDENCE threshold, and the treatment candidate reached OBSERVED",
        extraRepeats: EXTRA_REPEATS,
        observations,
        allExtraRepeatsIdentical: allIdentical,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
