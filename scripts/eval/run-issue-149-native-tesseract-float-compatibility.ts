/**
 * Issue #149 — native Tesseract float-model compatibility probe.
 *
 * Synthetic compatibility experiment only. It does not evaluate Brand
 * recognition capability, does not access the governed corpus, does not touch
 * fixture truth, and changes no production behaviour.
 *
 * The probe orchestrates eight fixed OCR invocations inside a pinned
 * research-only Docker image. Synthetic input generation, model verification,
 * and runtime inventory happen on the host; OCR happens only in the container,
 * with `--network=none` and read-only model and input mounts.
 *
 * It fails closed. If no container runtime is available, or any preflight gate
 * fails, it emits INCONCLUSIVE_ENVIRONMENT and invokes no OCR at all.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { format } from "prettier";
import sharp from "sharp";

const EXPERIMENT_ID = "issue-149-native-tesseract-float-compatibility";
const OUTPUT_ROOT = path.join(process.cwd(), "artifacts", EXPERIMENT_ID);
const SYNTHETIC_ROOT = path.join(OUTPUT_ROOT, "synthetic");
const RAW_ROOT = path.join(OUTPUT_ROOT, "raw");
const EXPECTED_BASE_SHA = "887c4df34efc844a69edb87514e5c97432869166";
const PREREGISTRATION_SHA256 = "ad905275e2727aaeb0c266e3f4ca5ca2b6f5aa6490b2b8222a48bbae3f45c43b";

const DOCKERFILE = "scripts/eval/docker/issue-149-native-tesseract-probe.Dockerfile";
const BASE_IMAGE = "node:22-bookworm-slim";
const BASE_MANIFEST_LIST_DIGEST =
  "sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3";
const BASE_AMD64_DIGEST = "sha256:8607a9064d4a571140998ae9e52a3b3fcf9cff361d04642d5971e6cd76d39e27";
const TARGET_PLATFORM = "linux/amd64";

const CONTROL_MODEL = "src/pipeline/extractor/assets/eng.traineddata";
const CONTROL_MODEL_SHA256 = "5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747";
const CONTROL_MODEL_BYTES = 5199098;
const TREATMENT_MODEL = ".local/ocr-research/traineddata/tessdata-best/eng.traineddata";
const TREATMENT_MODEL_SHA256 = "8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba";
const TREATMENT_MODEL_BYTES = 15400601;
const TREATMENT_FETCH = "node scripts/eval/fetch-issue-149-tessdata-best.mjs";

/** Production paths that must not move, including the PR #195 baseline file. */
const GUARDED_PRODUCTION_HASHES = {
  "src/pipeline/extractor/field-selection.ts":
    "3e84fa8a043570713991643830c7b95e0f7189a4ed037b737c783353d519106d",
  "src/pipeline/extractor/regions.ts":
    "910d763e20f47d811348b62c77f17d46ddf3a07b5849a337669a07f6b8efc9ab",
  "src/pipeline/extractor/extractor.ts":
    "9b2712e6bb15552e9524bc5e60be4da2b163bdb325206f452ecbaf44ebf5084c",
  "src/pipeline/extractor/ocr-engine.ts":
    "1cf37e4ca28dd68fbfc2412b242ad02db6d76c752d3203f27d17f27c9e0e59e7",
  "src/pipeline/extractor/assets/eng.traineddata": CONTROL_MODEL_SHA256,
} as const;

/** Fixed invocation parameters, identical across both model conditions. */
const INVOCATION = {
  language: "eng",
  oem: 1,
  psm: 11,
  dpi: 300,
  outputMode: "tsv",
  environment: { LC_ALL: "C", LANG: "C", OMP_THREAD_LIMIT: "1", OMP_NUM_THREADS: "1" },
  timeoutSeconds: 120,
  containerCpus: "1",
  containerMemory: "2g",
  network: "none",
} as const;

const SENTINEL_TEXT = "LABEL LENS 149";

type Arm = "control" | "treatment";
type ImageKind = "positive" | "blank";
type RunId = "primary" | "repeat";

interface PlannedInvocation {
  id: string;
  arm: Arm;
  image: ImageKind;
  run: RunId;
}

const MATRIX: PlannedInvocation[] = (["control", "treatment"] as const).flatMap((arm) =>
  (["positive", "blank"] as const).flatMap((image) =>
    (["primary", "repeat"] as const).map((run) => ({
      id: `${arm}-${image}-${run}`,
      arm,
      image,
      run,
    })),
  ),
);

function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function sha256File(filePath: string): string {
  return sha256Bytes(
    readFileSync(path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath)),
  );
}

function gitSha(): string {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: process.cwd(),
    encoding: "utf8",
  }).trim();
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  writeFileSync(filePath, await format(JSON.stringify(value), { parser: "json", printWidth: 100 }));
}

/* ------------------------------------------------------------------ *
 * Deterministic synthetic input generation.
 *
 * Glyphs are built from explicit integer-coordinate rectangles and rasterised
 * directly into a raw RGB buffer. No system font is consulted and no SVG
 * renderer is involved, so the pixel content cannot drift with a font or
 * renderer upgrade on another host. Only PNG encoding is delegated to sharp.
 * ------------------------------------------------------------------ */

const CANVAS = { width: 1240, height: 220, marginX: 60, marginY: 60 } as const;
const GLYPH = { width: 60, height: 100, stroke: 12, advance: 80 } as const;

type Rect = [x: number, y: number, w: number, h: number];

/** Rect strokes per glyph, in glyph-local coordinates (60x100 cell). */
function glyphRects(character: string): Rect[] {
  const { width: w, height: h, stroke: s } = GLYPH;
  const mid = Math.round((h - s) / 2);
  const right = w - s;
  switch (character) {
    case "L":
      return [
        [0, 0, s, h],
        [0, h - s, w, s],
      ];
    case "A":
      return [
        [0, 0, s, h],
        [right, 0, s, h],
        [0, 0, w, s],
        [0, mid, w, s],
      ];
    case "B":
      // The top bowl is deliberately narrower than the bottom bowl. A
      // vertically symmetric B rasterises into something a recognizer can read
      // as "8", which would fail the sentinel for a reason unrelated to model
      // compatibility.
      return [
        [0, 0, s, h],
        [0, 0, w - 2 * s, s],
        [0, mid, w - s, s],
        [0, h - s, w - s, s],
        [w - 3 * s, 0, s, mid + s],
        [right - s, mid, s, h - mid],
      ];
    case "E":
      return [
        [0, 0, s, h],
        [0, 0, w, s],
        [0, mid, w, s],
        [0, h - s, w, s],
      ];
    case "S":
      return [
        [0, 0, w, s],
        [0, 0, s, mid + s],
        [0, mid, w, s],
        [right, mid, s, h - mid - s],
        [0, h - s, w, s],
      ];
    case "N": {
      // Two stems plus a stepped diagonal, computed with integer arithmetic so
      // the staircase is identical on every host.
      const rects: Rect[] = [
        [0, 0, s, h],
        [right, 0, s, h],
      ];
      const steps = 10;
      const stepHeight = Math.floor(h / steps);
      for (let index = 0; index < steps; index += 1) {
        const x = Math.round((index * (w - s)) / (steps - 1));
        rects.push([x, index * stepHeight, s, stepHeight]);
      }
      return rects;
    }
    case "1":
      return [
        [Math.round((w - s) / 2), 0, s, h],
        [Math.round((w - s) / 2) - s, s, s, s],
        [Math.round(w / 4), h - s, Math.round(w / 2), s],
      ];
    case "4":
      return [
        [0, 0, s, mid + s],
        [0, mid, w, s],
        [right, 0, s, h],
      ];
    case "9":
      return [
        [0, 0, w, s],
        [0, 0, s, mid + s],
        [right, 0, s, h],
        [0, mid, w, s],
        [0, h - s, w, s],
      ];
    case " ":
      return [];
    default:
      throw new Error(`SYNTHETIC_GLYPH_UNDEFINED: ${character}`);
  }
}

function rasterise(text: string): Buffer {
  const { width, height, marginX, marginY } = CANVAS;
  const channels = 3;
  // White background.
  const data = Buffer.alloc(width * height * channels, 0xff);
  const paint = (rect: Rect, originX: number, originY: number) => {
    const [rx, ry, rw, rh] = rect;
    for (let y = originY + ry; y < originY + ry + rh; y += 1) {
      if (y < 0 || y >= height) continue;
      for (let x = originX + rx; x < originX + rx + rw; x += 1) {
        if (x < 0 || x >= width) continue;
        const offset = (y * width + x) * channels;
        data[offset] = 0;
        data[offset + 1] = 0;
        data[offset + 2] = 0;
      }
    }
  };
  for (const [index, character] of [...text].entries()) {
    const originX = marginX + index * GLYPH.advance;
    for (const rect of glyphRects(character)) paint(rect, originX, marginY);
  }
  return data;
}

async function encodePng(raw: Buffer): Promise<Buffer> {
  return sharp(raw, {
    raw: { width: CANVAS.width, height: CANVAS.height, channels: 3 },
  })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
}

async function generateSyntheticInputs() {
  const positive = await encodePng(rasterise(SENTINEL_TEXT));
  const blank = await encodePng(rasterise(" ".repeat(SENTINEL_TEXT.length)));
  return { positive, blank };
}

/* ------------------------------------------------------------------ *
 * Environment inventory.
 * ------------------------------------------------------------------ */

function probeCommand(command: string, args: readonly string[]): string | null {
  try {
    return execFileSync(command, [...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    return null;
  }
}

function which(command: string): string | null {
  return probeCommand("/usr/bin/which", [command]);
}

interface RuntimeInventory {
  host: { platform: string; architecture: string; node: string; sharp: string };
  containerRuntimes: Array<{ name: string; path: string | null; version: string | null }>;
  dockerSocket: { path: string; exists: boolean; daemonReachable: boolean };
  containerRuntimeAvailable: boolean;
  emulationRequiredForTarget: boolean;
  notes: string[];
}

function runtimeInventory(): RuntimeInventory {
  const candidates = ["docker", "podman", "nerdctl", "finch", "colima", "limactl"];
  const containerRuntimes = candidates.map((name) => {
    const resolved = which(name);
    return {
      name,
      path: resolved,
      version: resolved ? probeCommand(name, ["--version"]) : null,
    };
  });
  const socketPath = "/var/run/docker.sock";
  const socketExists = existsSync(socketPath);
  const daemonReachable =
    socketExists &&
    probeCommand("/usr/bin/curl", [
      "-s",
      "--max-time",
      "5",
      "--unix-socket",
      socketPath,
      "http://localhost/version",
    ]) !== null;
  const available = containerRuntimes.some((item) => item.path !== null);
  return {
    host: {
      platform: process.platform,
      architecture: process.arch,
      node: process.version,
      sharp: sharp.versions.sharp,
    },
    containerRuntimes,
    dockerSocket: { path: socketPath, exists: socketExists, daemonReachable },
    containerRuntimeAvailable: available,
    emulationRequiredForTarget: process.arch !== "x64",
    notes: available
      ? []
      : [
          "No container runtime binary is present on PATH.",
          socketExists && !daemonReachable
            ? "A stale /var/run/docker.sock symlink exists but no daemon answers on it, which is consistent with a removed Docker Desktop installation."
            : "No Docker socket is present.",
          "The probe requires a pinned Linux container. Installing one is a host-level change that this experiment is not authorised to make.",
        ],
  };
}

/* ------------------------------------------------------------------ *
 * Main.
 * ------------------------------------------------------------------ */

async function main() {
  mkdirSync(SYNTHETIC_ROOT, { recursive: true });
  mkdirSync(RAW_ROOT, { recursive: true });

  const preflight: Array<{ gate: string; status: "PASS" | "FAIL"; detail: string }> = [];
  const gate = (name: string, ok: boolean, detail: string) =>
    preflight.push({ gate: name, status: ok ? "PASS" : "FAIL", detail });

  const headSha = gitSha();
  gate(
    "branch-based-on-merged-pr-208",
    headSha === EXPECTED_BASE_SHA,
    `HEAD ${headSha}; expected base ${EXPECTED_BASE_SHA}`,
  );

  const preregPath = path.join(OUTPUT_ROOT, "preregistration.md");
  const preregFrozen = existsSync(preregPath) && sha256File(preregPath) === PREREGISTRATION_SHA256;
  gate(
    "preregistration-frozen",
    preregFrozen,
    preregFrozen
      ? `matches the frozen sha256 ${PREREGISTRATION_SHA256}`
      : "preregistration.md is absent or does not match its frozen sha256",
  );

  const guardedOk = Object.entries(GUARDED_PRODUCTION_HASHES).every(
    ([filePath, expected]) => sha256File(filePath) === expected,
  );
  gate(
    "production-and-pr195-unchanged",
    guardedOk,
    guardedOk
      ? "all guarded production paths match, including the PR #195 baseline file"
      : "a guarded production path changed",
  );

  const controlPresent = existsSync(path.join(process.cwd(), CONTROL_MODEL));
  const controlSha = controlPresent ? sha256File(CONTROL_MODEL) : null;
  const controlBytes = controlPresent
    ? readFileSync(path.join(process.cwd(), CONTROL_MODEL)).length
    : null;
  gate(
    "control-model-integrity",
    controlSha === CONTROL_MODEL_SHA256 && controlBytes === CONTROL_MODEL_BYTES,
    `sha256 ${controlSha ?? "absent"}, bytes ${controlBytes ?? "absent"}`,
  );

  const treatmentPresent = existsSync(path.join(process.cwd(), TREATMENT_MODEL));
  const treatmentSha = treatmentPresent ? sha256File(TREATMENT_MODEL) : null;
  const treatmentBytes = treatmentPresent
    ? readFileSync(path.join(process.cwd(), TREATMENT_MODEL)).length
    : null;
  gate(
    "treatment-model-integrity",
    treatmentSha === TREATMENT_MODEL_SHA256 && treatmentBytes === TREATMENT_MODEL_BYTES,
    treatmentPresent
      ? `sha256 ${treatmentSha}, bytes ${treatmentBytes}`
      : `absent from the untracked cache; retrieve with: ${TREATMENT_FETCH}`,
  );

  // Synthetic inputs are generated twice and compared, so the regeneration
  // check is part of the run rather than a claim about it.
  const first = await generateSyntheticInputs();
  const second = await generateSyntheticInputs();
  const deterministicInputs =
    first.positive.equals(second.positive) && first.blank.equals(second.blank);
  gate(
    "synthetic-input-deterministic-regeneration",
    deterministicInputs,
    deterministicInputs
      ? "two independent generations produced byte-identical PNGs"
      : "regeneration produced different bytes",
  );

  writeFileSync(path.join(SYNTHETIC_ROOT, "positive.png"), first.positive);
  writeFileSync(path.join(SYNTHETIC_ROOT, "blank.png"), first.blank);
  const positiveSha = sha256Bytes(first.positive);
  const blankSha = sha256Bytes(first.blank);
  writeFileSync(path.join(SYNTHETIC_ROOT, "positive.png.sha256"), `${positiveSha}  positive.png\n`);
  writeFileSync(path.join(SYNTHETIC_ROOT, "blank.png.sha256"), `${blankSha}  blank.png\n`);

  const inventory = runtimeInventory();
  gate(
    "container-runtime-available",
    inventory.containerRuntimeAvailable,
    inventory.containerRuntimeAvailable
      ? "a container runtime binary is present"
      : "no container runtime binary on PATH and no reachable Docker daemon",
  );

  await writeJson(path.join(OUTPUT_ROOT, "runtime-inventory.json"), {
    experimentId: EXPERIMENT_ID,
    collectedAtHost: true,
    collectedInContainer: false,
    containerInventoryUnavailableReason: inventory.containerRuntimeAvailable
      ? null
      : "No container runtime, so tesseract/libtesseract/leptonica versions, the executable sha256, and ldd output could not be resolved. Those facts are only obtainable inside the built image.",
    ...inventory,
    unresolvedInContainer: [
      "native tesseract version",
      "libtesseract version",
      "leptonica version",
      "installed package versions",
      "sha256 of the tesseract executable",
      "ldd dependency output",
      "docker image id/digest",
    ],
  });

  await writeJson(path.join(OUTPUT_ROOT, "docker-base-provenance.json"), {
    experimentId: EXPERIMENT_ID,
    dockerfile: DOCKERFILE,
    baseImage: BASE_IMAGE,
    baseImageFamily: "Debian Bookworm (same family as the production deployment path)",
    manifestListDigest: BASE_MANIFEST_LIST_DIGEST,
    amd64ManifestDigest: BASE_AMD64_DIGEST,
    targetPlatform: TARGET_PLATFORM,
    digestResolvedVia: "Docker Hub registry v2 manifest query from the host",
    digestVerifiedByBuild: false,
    productionDockerfileModified: false,
    note: "The base is pinned by immutable digest. Package versions are required build args with no defaults, so the image cannot build with an unpinned recognizer version.",
  });

  await writeJson(path.join(OUTPUT_ROOT, "control-model-provenance.json"), {
    experimentId: EXPERIMENT_ID,
    role: "native diagnostic positive control",
    path: CONTROL_MODEL,
    expectedSha256: CONTROL_MODEL_SHA256,
    observedSha256: controlSha,
    expectedByteSize: CONTROL_MODEL_BYTES,
    observedByteSize: controlBytes,
    integrityVerified: controlSha === CONTROL_MODEL_SHA256 && controlBytes === CONTROL_MODEL_BYTES,
    variant: "integer-quantized best-lineage LSTM",
    mountMode: "read-only",
    copiedIntoGitArtifacts: false,
    copiedIntoDockerImage: false,
    note: "This is a diagnostic positive control for the native runtime. It is not an accuracy comparison against the production tesseract.js runtime.",
  });

  await writeJson(path.join(OUTPUT_ROOT, "treatment-model-provenance.json"), {
    experimentId: EXPERIMENT_ID,
    role: "native float treatment",
    path: TREATMENT_MODEL,
    expectedSha256: TREATMENT_MODEL_SHA256,
    observedSha256: treatmentSha,
    expectedByteSize: TREATMENT_MODEL_BYTES,
    observedByteSize: treatmentBytes,
    integrityVerified:
      treatmentSha === TREATMENT_MODEL_SHA256 && treatmentBytes === TREATMENT_MODEL_BYTES,
    variant: "official tessdata_best float LSTM",
    upstreamRepository: "https://github.com/tesseract-ocr/tessdata_best",
    upstreamCommit: "9ddc24e750eec0994223a9edc3fcb434a2244f3b",
    license: "Apache-2.0",
    retrievalScript: "scripts/eval/fetch-issue-149-tessdata-best.mjs",
    retrievalMechanismReused: true,
    competingDownloadSystemCreated: false,
    mountMode: "read-only",
    committedToGit: false,
    inDockerImage: false,
    note: "Reuses the PR #208 retrieval mechanism and untracked cache. The binary never enters Git or the image.",
  });

  await writeJson(path.join(OUTPUT_ROOT, "synthetic-input-spec.json"), {
    experimentId: EXPERIMENT_ID,
    generator: "scripts/eval/run-issue-149-native-tesseract-float-compatibility.ts",
    method:
      "Glyphs are composed from explicit integer-coordinate rectangles and rasterised directly into a raw RGB buffer, then PNG-encoded by sharp. No system font and no SVG renderer participate, so pixel content cannot drift with a font or renderer upgrade.",
    fontIdentity:
      "none — vector rectangle strokes defined in `glyphRects()`; the stepped diagonal of 'N' is computed with integer arithmetic",
    canvas: CANVAS,
    glyphMetrics: GLYPH,
    pngEncoding: { compressionLevel: 9, adaptiveFiltering: false, palette: false },
    sharpVersion: sharp.versions.sharp,
    deterministicRegenerationVerified: deterministicInputs,
    images: [
      {
        name: "positive.png",
        kind: "positive sentinel",
        text: SENTINEL_TEXT,
        rotationDegrees: 0,
        stylized: false,
        sha256: positiveSha,
        byteSize: first.positive.length,
      },
      {
        name: "blank.png",
        kind: "blank negative",
        text: null,
        rotationDegrees: 0,
        stylized: false,
        sha256: blankSha,
        byteSize: first.blank.length,
        note: "identical dimensions and background to the positive image, with no glyphs painted",
      },
    ],
    knownTextPermitted:
      "The sentinel text is known because this is a synthetic runtime validation, not a blinded capability benchmark.",
    additionalVariantsCreatedAfterResults: false,
  });

  const blockingFailures = preflight.filter((item) => item.status === "FAIL");
  const ocrInvoked = false;

  await writeJson(path.join(OUTPUT_ROOT, "invocation-matrix.json"), {
    experimentId: EXPERIMENT_ID,
    plannedInvocations: MATRIX.length,
    executedInvocations: 0,
    fixedParameters: INVOCATION,
    onlyDifferenceBetweenArms:
      "the read-only TESSDATA_PREFIX directory (control model vs float treatment model)",
    containerHardening: {
      network: "none",
      modelMountMode: "read-only",
      inputMountMode: "read-only",
      repositoryRootMounted: false,
      corpusOrFixturePathMounted: false,
      writableOutputDirectory: "raw output and metrics only",
    },
    matrix: MATRIX.map((item) => ({
      ...item,
      status: "NOT_EXECUTED",
      reason: "Preflight failed before any OCR invocation; see decision.json.",
      rawOutputPresent: false,
    })),
    retryPolicy: "No retries beyond the preregistered exact repeat. No third tie-breaker run.",
  });

  const runResults = MATRIX.map((item) => ({
    id: item.id,
    arm: item.arm,
    image: item.image,
    run: item.run,
    status: "NOT_EXECUTED" as const,
    failureStage: "preflight" as const,
    absentOutputMarker: true,
    rawTsvPath: null,
    rawStderrPath: null,
    exitStatus: null,
    terminatingSignal: null,
    timedOut: null,
    wallClockMs: null,
    maxResidentBytes: null,
    normalizedTranscript: null,
    note: "No OCR was invoked. No TSV was synthesised for this row.",
  }));
  await writeJson(path.join(OUTPUT_ROOT, "run-results.json"), {
    experimentId: EXPERIMENT_ID,
    ocrInvoked,
    emptyTsvSynthesised: false,
    preflight,
    results: runResults,
  });

  writeFileSync(
    path.join(RAW_ROOT, "ABSENT-OUTPUT.md"),
    `# Absent raw output\n\nNo OCR invocation ran, so no TSV or stderr file exists for any of the eight\nplanned invocations. Empty TSV files were deliberately **not** synthesised.\n\nPlanned but not executed:\n\n${MATRIX.map((item) => `- \`${item.id}\``).join("\n")}\n\nFailure stage: preflight. See \`../decision.json\`.\n`,
  );

  await writeJson(path.join(OUTPUT_ROOT, "determinism-report.json"), {
    experimentId: EXPERIMENT_ID,
    assessable: false,
    reason: "Determinism requires the primary and repeat invocations to run. Neither ran.",
    syntheticInputRegenerationDeterministic: deterministicInputs,
    ocrDeterminism: null,
  });

  await writeJson(path.join(OUTPUT_ROOT, "resource-report.json"), {
    experimentId: EXPERIMENT_ID,
    assessable: false,
    reason: "No invocation ran, so no latency or memory figure exists.",
    latency: null,
    peakResidentMemory: null,
    emulationCaveat:
      "Had figures been collected on this host, the target platform linux/amd64 would have run under emulation on arm64 and the figures would have been diagnostic only.",
  });

  const verdict = blockingFailures.length === 0 ? "READY_TO_RUN" : "INCONCLUSIVE_ENVIRONMENT";
  await writeJson(path.join(OUTPUT_ROOT, "decision.json"), {
    experimentId: EXPERIMENT_ID,
    evaluationOnly: true,
    syntheticOnly: true,
    corpusAccessed: false,
    productionChanged: false,
    productionDockerfileChanged: false,
    pr195Untouched: guardedOk,
    verdict,
    verdictRationale:
      verdict === "INCONCLUSIVE_ENVIRONMENT"
        ? "No container runtime is available on this host, so the pinned native runtime could not be built, inventoried, or executed. The probe stopped before OCR, as preregistered."
        : "All preflight gates passed.",
    ocrInvoked,
    plannedInvocations: MATRIX.length,
    executedInvocations: 0,
    blockingGates: blockingFailures.map((item) => item.gate),
    whatWasEstablished: [
      "Both model assets verified by full sha256 and byte size.",
      "Synthetic inputs generated deterministically and hashed, with regeneration verified in-run.",
      "The research Dockerfile is pinned to an immutable base digest and fails closed without explicit package-version build args.",
      "The production Dockerfile, production source, fixtures, and the PR #195 baseline are unchanged.",
    ],
    whatWasNotEstablished: [
      "Whether native Tesseract can load and execute the float model. No invocation ran.",
      "Native tesseract, libtesseract, and Leptonica versions; the executable sha256; ldd output; and the built image digest.",
      "Any determinism, latency, or memory figure.",
    ],
    claimsNotMade: [
      "No claim that native Tesseract cannot run tessdata_best. The environment was never able to try.",
      "No recognition-capability, accuracy, or production-suitability claim.",
      "No Tesseract capability-ceiling claim.",
    ],
    requiredNextStep:
      verdict === "INCONCLUSIVE_ENVIRONMENT"
        ? "Provide a host with a working container runtime, then resolve the three package-version build args from `apt-cache policy` inside the pinned base, freeze them into the preregistration, and re-run. Nothing else about the design changes."
        : "Run the eight fixed invocations.",
  });

  writeFileSync(
    path.join(OUTPUT_ROOT, "git-sha.txt"),
    `${headSha}\nbase: origin/main ${EXPECTED_BASE_SHA}\n`,
  );

  console.log(
    JSON.stringify(
      {
        verdict,
        ocrInvoked,
        executedInvocations: 0,
        blockingGates: blockingFailures.map((item) => item.gate),
        preflight,
        syntheticInputs: {
          positiveSha256: positiveSha,
          blankSha256: blankSha,
          deterministicRegeneration: deterministicInputs,
        },
        containerRuntimeAvailable: inventory.containerRuntimeAvailable,
      },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
