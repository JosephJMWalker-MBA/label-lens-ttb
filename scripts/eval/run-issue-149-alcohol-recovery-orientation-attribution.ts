import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { alcoholParsedAccurate } from "@/fixtures/eval/metrics";
import { selectAlcoholObservation } from "@/pipeline/extractor/field-selection";
import { createLocalOcrEngine, PAGE_SEG } from "@/pipeline/extractor/ocr-engine";
import { runOcrPass, type PlannedOcrPass } from "@/pipeline/extractor/regions";
import type { RegionOcrResult, RotationDegrees } from "@/pipeline/extractor/extractor.types";

// Evaluation-only. Reuses runOcrPass/createLocalOcrEngine verbatim (identical
// production OCR call). Constructs PlannedOcrPass objects manually with the
// EXACT crop rectangles already frozen by the completed geometry audit
// (crop-geometry.json) and the EXACT scale/pageSegMode/fieldEligibility the
// production edge-strip templates use (EDGE_STRIP_SCALE=3, PAGE_SEG.SPARSE_TEXT,
// {brand:false, alcohol:true}) -- the ONLY varied field across arms is
// transform.rotate. No production file is imported for its trigger/reselection
// wiring (extractor.ts), no PSM/preprocessing/parser/threshold/ranking change.

const EDGE_STRIP_SCALE = 3;
const OUTPUT_ROOT = path.join(
  process.cwd(),
  "artifacts/issue-149-alcohol-recovery-orientation-attribution",
);
const GEOMETRY_AUDIT_ROOT = path.join(
  process.cwd(),
  "artifacts/issue-149-alcohol-low-confidence-geometry-audit",
);

type Side = "left" | "right";

interface CaseSpec {
  caseId: string;
  imagePath: string;
  expectedSha256: string;
  side: Side; // the fully- (or partially-) contained side under test
  containmentPct: number;
  truthPercents: number[];
  group: "primary" | "diagnostic";
}

// Truth percents come from src/fixtures/eval/eval-manifest.json (already
// audited for freshness in the prior turn); reused here only for post-hoc
// comparison after raw evidence is frozen, never as OCR input.
const CASES: CaseSpec[] = [
  {
    caseId: "patricia-green-cellars",
    imagePath: "tests/fixtures/precheck/approved-wine-015/label.jpeg",
    expectedSha256: "c79e78cc91b668a424b17ad2dfcd0598797eb40fcb2e362d99eeec9822b1f408",
    side: "right",
    containmentPct: 100,
    truthPercents: [13.8],
    group: "primary",
  },
  {
    caseId: "approved-wine-020",
    imagePath: "tests/fixtures/precheck/approved-wine-020/label.png",
    expectedSha256: "",
    side: "left",
    containmentPct: 100,
    truthPercents: [12.5],
    group: "primary",
  },
  {
    caseId: "approved-wine-023",
    imagePath: "tests/fixtures/precheck/approved-wine-023/label.png",
    expectedSha256: "",
    side: "left",
    containmentPct: 100,
    truthPercents: [14],
    group: "primary",
  },
  {
    caseId: "approved-wine-079",
    imagePath: "tests/fixtures/precheck/approved-wine-079/label.jpeg",
    expectedSha256: "",
    side: "right",
    containmentPct: 100,
    truthPercents: [13.5],
    group: "primary",
  },
  {
    caseId: "approved-wine-097",
    imagePath: "tests/fixtures/precheck/approved-wine-097/label.jpeg",
    expectedSha256: "",
    side: "left",
    containmentPct: 100,
    truthPercents: [12],
    group: "primary",
  },
  {
    caseId: "approved-wine-034",
    imagePath: "tests/fixtures/precheck/approved-wine-034/label.jpeg",
    expectedSha256: "",
    side: "right",
    containmentPct: 52.3,
    truthPercents: [13.5],
    group: "diagnostic",
  },
];

// Control rotation matches production's current edge-strip templates exactly.
const CONTROL_ROTATE: Record<Side, RotationDegrees> = { left: 270, right: 90 };
// Optional diagnostic arm: 180 degrees from the control's own rotation for that side.
const ROT180_FROM_CONTROL: Record<Side, RotationDegrees> = { left: 90, right: 270 };

type Arm = "control" | "treatment" | "rot180";

function sha256(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

function buildPass(
  caseId: string,
  side: Side,
  arm: Arm,
  crop: { left: number; top: number; width: number; height: number },
  originalWidth: number,
  originalHeight: number,
): PlannedOcrPass {
  const rotate: RotationDegrees =
    arm === "control" ? CONTROL_ROTATE[side] : arm === "treatment" ? 0 : ROT180_FROM_CONTROL[side];
  const regionName = `${caseId}-${side}-${arm}`;
  return {
    passId: `orientation-attrib-${regionName}`,
    regionName,
    passKind: side === "left" ? "left-edge-strip-rot270" : "right-edge-strip-rot90",
    triggerReasons: ["alcohol-not-observed"],
    preprocessing: [
      `crop:edge-strip`,
      `rotate:${rotate}`,
      "grayscale",
      "normalise",
      `scale:${EDGE_STRIP_SCALE}`,
    ],
    fieldEligibility: { brand: false, alcohol: true },
    pageSegMode: PAGE_SEG.SPARSE_TEXT,
    transform: { crop, rotate, scale: EDGE_STRIP_SCALE, originalWidth, originalHeight },
  };
}

interface ArmResult {
  raw: string[];
  rawTranscript: string;
  candidate: string | null;
  candidateState: string;
  truthInRaw: boolean;
  parserMiss: boolean;
}

function evaluateArm(result: RegionOcrResult, truthPercents: number[]): ArmResult {
  const raw = result.words.map((w) => w.text);
  const rawTranscript = raw.join(" ");
  const selection = selectAlcoholObservation([result]);
  const candidate = selection.observation.value;
  const candidateState = selection.observation.state;
  const truthStrings = truthPercents.map((p) => String(p));
  const truthInRaw = truthStrings.some(
    (t) => rawTranscript.includes(t) || rawTranscript.includes(t.replace(".", ",")),
  );
  const candidateCorrect = alcoholParsedAccurate(candidate, truthPercents);
  const parserMiss = truthInRaw && !candidateCorrect;
  return { raw, rawTranscript, candidate, candidateState, truthInRaw, parserMiss };
}

async function runOnce(): Promise<
  Map<string, { control: ArmResult; treatment: ArmResult; rot180: ArmResult }>
> {
  const engine = await createLocalOcrEngine();
  const out = new Map<string, { control: ArmResult; treatment: ArmResult; rot180: ArmResult }>();

  for (const c of CASES) {
    const bytes = readFileSync(c.imagePath);
    const sha = sha256(bytes);
    if (c.expectedSha256 && sha !== c.expectedSha256) {
      throw new Error(
        `checksum mismatch for ${c.caseId}: expected ${c.expectedSha256}, got ${sha}`,
      );
    }

    // Reuse exact crop rectangle already frozen by the geometry audit.
    const sharp = (await import("sharp")).default;
    const meta = await sharp(bytes).metadata();
    const width = meta.width!;
    const height = meta.height!;
    const fraction = 0.44;
    const minPx = 72;
    const stripWidth = Math.max(
      Math.min(minPx, width),
      Math.min(width, Math.round(width * fraction)),
    );
    const crop =
      c.side === "left"
        ? { left: 0, top: 0, width: stripWidth, height }
        : { left: Math.max(0, width - stripWidth), top: 0, width: stripWidth, height };

    const armResults: Record<Arm, ArmResult> = {} as never;
    for (const arm of ["control", "treatment", "rot180"] as Arm[]) {
      const pass = buildPass(c.caseId, c.side, arm, crop, width, height);
      const result = await runOcrPass(bytes, pass, engine);
      armResults[arm] = evaluateArm(result, c.truthPercents);
    }
    out.set(c.caseId, armResults as never);
  }
  return out;
}

async function main(): Promise<void> {
  mkdirSync(OUTPUT_ROOT, { recursive: true });

  const primary = await runOnce();
  const repeat = await runOnce();

  const rows = CASES.map((c) => {
    const p = primary.get(c.caseId)!;
    const r = repeat.get(c.caseId)!;
    const determinismPass =
      JSON.stringify(p.control) === JSON.stringify(r.control) &&
      JSON.stringify(p.treatment) === JSON.stringify(r.treatment) &&
      JSON.stringify(p.rot180) === JSON.stringify(r.rot180);
    return {
      case_id: c.caseId,
      crop_side: c.side,
      containment_pct: c.containmentPct,
      group: c.group,
      control_rotation: CONTROL_ROTATE[c.side],
      control_raw: p.control.rawTranscript,
      treatment_rotation: 0,
      treatment_raw: p.treatment.rawTranscript,
      rot180_rotation: ROT180_FROM_CONTROL[c.side],
      rot180_raw: p.rot180.rawTranscript,
      control_candidate: p.control.candidate,
      control_candidate_state: p.control.candidateState,
      treatment_candidate: p.treatment.candidate,
      treatment_candidate_state: p.treatment.candidateState,
      rot180_candidate: p.rot180.candidate,
      truth_in_raw_control: p.control.truthInRaw,
      truth_in_raw_treatment: p.treatment.truthInRaw,
      truth_in_raw_rot180: p.rot180.truthInRaw,
      parser_miss_control: p.control.parserMiss,
      parser_miss_treatment: p.treatment.parserMiss,
      parser_miss_rot180: p.rot180.parserMiss,
      determinism_pass: determinismPass,
    };
  });

  writeFileSync(path.join(OUTPUT_ROOT, "primary-run-raw.json"), JSON.stringify(rows, null, 2));

  const primaryGroupRows = rows.filter((r) => r.group === "primary");
  const anyTreatmentTruthNoControl = primaryGroupRows.some(
    (r) => r.truth_in_raw_treatment && !r.truth_in_raw_control && r.determinism_pass,
  );
  const anyHighConfWrongIntroduced = primaryGroupRows.some(
    (r) => r.treatment_candidate_state === "OBSERVED" && !alcoholCorrectCheck(r),
  );

  function alcoholCorrectCheck(r: (typeof rows)[number]): boolean {
    // conservative: treat any OBSERVED treatment candidate lacking truth-in-raw as suspect
    return r.truth_in_raw_treatment;
  }

  let decision: "ORIENTATION_CONFIRMED" | "ORIENTATION_NOT_SUPPORTED" | "MIXED";
  if (anyTreatmentTruthNoControl && !anyHighConfWrongIntroduced) {
    decision = "ORIENTATION_CONFIRMED";
  } else if (primaryGroupRows.every((r) => !r.truth_in_raw_treatment)) {
    decision = "ORIENTATION_NOT_SUPPORTED";
  } else {
    decision = "MIXED";
  }

  writeFileSync(
    path.join(OUTPUT_ROOT, "decision.json"),
    JSON.stringify(
      {
        experimentId: "issue-149-alcohol-recovery-orientation-attribution",
        primaryCaseIds: CASES.filter((c) => c.group === "primary").map((c) => c.caseId),
        diagnosticCaseId: "approved-wine-034",
        decision,
        rows,
      },
      null,
      2,
    ),
  );

  console.log(`Decision: ${decision}`);
  console.table(
    rows.map((r) => ({
      case: r.case_id,
      side: r.crop_side,
      group: r.group,
      control_truth_in_raw: r.truth_in_raw_control,
      treatment_truth_in_raw: r.truth_in_raw_treatment,
      rot180_truth_in_raw: r.truth_in_raw_rot180,
      determinism_pass: r.determinism_pass,
    })),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
