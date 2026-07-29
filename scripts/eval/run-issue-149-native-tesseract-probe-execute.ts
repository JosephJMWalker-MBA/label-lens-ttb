/**
 * Issue #149 — native Tesseract float-model compatibility probe, Attempt 2.
 *
 * Builds the pinned research image and runs the eight preregistered
 * invocations. Synthetic inputs only: no governed corpus, no fixture truth, no
 * production change. Attempt 1 artifacts are never rewritten; everything here
 * is written under `attempt-2/`.
 *
 * Fails closed. Refuses to run unless every pin, hash, and freeze verifies.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const EXPERIMENT_ID = "issue-149-native-tesseract-float-compatibility";
const ROOT = path.join(process.cwd(), "artifacts", EXPERIMENT_ID);
const OUT = path.join(ROOT, "attempt-2");
const RAW = path.join(OUT, "raw");
const SYNTHETIC = path.join(ROOT, "synthetic");

const PREREGISTRATION_SHA256 = "ad905275e2727aaeb0c266e3f4ca5ca2b6f5aa6490b2b8222a48bbae3f45c43b";
const ADDENDUM = path.join(ROOT, "preregistration-runtime-addendum.md");
const ADDENDUM_SHA_FILE = path.join(ROOT, "preregistration-runtime-addendum.sha256");
const PINS_FILE = path.join(OUT, "package-pins.json");

const DOCKERFILE = "scripts/eval/docker/issue-149-native-tesseract-probe.Dockerfile";
const IMAGE_TAG = "issue-149-native-tesseract-probe:attempt-2";
const PLATFORM = "linux/amd64";

const CONTROL_MODEL_DIR = "src/pipeline/extractor/assets";
const CONTROL_MODEL_SHA256 = "5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747";
const CONTROL_MODEL_BYTES = 5199098;
const TREATMENT_MODEL_DIR = ".local/ocr-research/traineddata/tessdata-best";
const TREATMENT_MODEL_SHA256 = "8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba";
const TREATMENT_MODEL_BYTES = 15400601;

const POSITIVE_SHA256 = "bfba28eec8422a5e1dc69a6e3e6aefdfaa4f68a71cae85d385d9877d88a0e2ab";
const BLANK_SHA256 = "8b5531768177d1a62c9e7780a1edfd5231f46681a474ad359313a979aa4d3e9d";
const SENTINEL_TEXT = "LABEL LENS 149";

/** Frozen invocation parameters. Identical for both model conditions. */
const INVOCATION = {
  language: "eng",
  oem: 1,
  psm: 11,
  dpi: 300,
  outputMode: "tsv",
  timeoutSeconds: 120,
  cpus: "1",
  memory: "2g",
  network: "none",
  env: { LC_ALL: "C", LANG: "C", OMP_THREAD_LIMIT: "1", OMP_NUM_THREADS: "1" },
} as const;

type Arm = "control" | "treatment";
type ImageKind = "positive" | "blank";
type RunId = "primary" | "repeat";

const MATRIX = (["control", "treatment"] as const).flatMap((arm) =>
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
function sizeOf(filePath: string): number {
  return readFileSync(path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath))
    .length;
}
function run(command: string, args: readonly string[]): string {
  return execFileSync(command, [...args], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  }).trim();
}
function tryRun(command: string, args: readonly string[]): string {
  try {
    return run(command, args);
  } catch (error) {
    return `ERROR: ${error instanceof Error ? error.message : String(error)}`;
  }
}
function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

/** Parse Tesseract TSV into rows. Column 12 is the recognized text. */
function parseTsv(tsv: string) {
  const lines = tsv.split("\n").filter((line) => line.length > 0);
  if (lines.length === 0) return { header: null as string | null, rows: [] as string[][] };
  const [header, ...rest] = lines;
  return { header, rows: rest.map((line) => line.split("\t")) };
}

function normalizedTranscript(tsv: string): string {
  const { rows } = parseTsv(tsv);
  return rows
    .map((columns) => (columns.length >= 12 ? columns[11] : ""))
    .map((text) => text.trim())
    .filter((text) => text.length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function tsvIsValid(tsv: string): boolean {
  const { header } = parseTsv(tsv);
  return Boolean(header && header.startsWith("level\t") && header.includes("text"));
}

function modelDirFor(arm: Arm): string {
  return arm === "control" ? CONTROL_MODEL_DIR : TREATMENT_MODEL_DIR;
}

interface InvocationRecord {
  id: string;
  arm: Arm;
  image: ImageKind;
  run: RunId;
  command: string;
  environment: Record<string, string>;
  modelSha256: string;
  inputSha256: string;
  imageIdentity: string;
  executed: boolean;
  failureStage: string | null;
  exitStatus: number | null;
  terminatingSignal: string | null;
  timedOut: boolean | null;
  wallClockMs: number | null;
  maxResidentKb: number | null;
  tsvPath: string | null;
  stderrPath: string | null;
  tsvBytes: number | null;
  stderrBytes: number | null;
  tsvValid: boolean | null;
  normalizedTranscript: string | null;
  tsvSha256: string | null;
}

function main() {
  mkdirSync(RAW, { recursive: true });
  const gates: Array<{ gate: string; status: "PASS" | "FAIL"; detail: string }> = [];
  const gate = (name: string, ok: boolean, detail: string) =>
    gates.push({ gate: name, status: ok ? "PASS" : "FAIL", detail });

  // ---- Gates -------------------------------------------------------------
  const preregOk = sha256File(path.join(ROOT, "preregistration.md")) === PREREGISTRATION_SHA256;
  gate("original-preregistration-hash", preregOk, `expected ${PREREGISTRATION_SHA256}`);

  const addendumPresent = existsSync(ADDENDUM) && existsSync(ADDENDUM_SHA_FILE);
  const addendumExpected = addendumPresent
    ? readFileSync(ADDENDUM_SHA_FILE, "utf8").trim().split(/\s+/)[0]
    : null;
  const addendumOk = addendumPresent && sha256File(ADDENDUM) === addendumExpected;
  gate(
    "runtime-addendum-frozen",
    addendumOk,
    addendumPresent ? `expected ${addendumExpected}` : "addendum missing",
  );

  const pinsPresent = existsSync(PINS_FILE);
  const pins = pinsPresent ? JSON.parse(readFileSync(PINS_FILE, "utf8")) : null;
  const pinsConcrete =
    pinsPresent &&
    [pins.tesseract, pins.libtesseract, pins.leptonica].every(
      (entry: { package?: string; version?: string } | undefined) =>
        Boolean(entry?.package) &&
        Boolean(entry?.version) &&
        !String(entry?.version).includes("*") &&
        String(entry?.version).toUpperCase() !== "NONE",
    );
  gate(
    "package-pins-concrete",
    Boolean(pinsConcrete),
    pinsPresent ? JSON.stringify(pins) : "package-pins.json missing",
  );

  const controlModel = path.join(CONTROL_MODEL_DIR, "eng.traineddata");
  const controlOk =
    existsSync(controlModel) &&
    sha256File(controlModel) === CONTROL_MODEL_SHA256 &&
    sizeOf(controlModel) === CONTROL_MODEL_BYTES;
  gate("control-model-integrity", controlOk, `${CONTROL_MODEL_SHA256} / ${CONTROL_MODEL_BYTES}`);

  const treatmentModel = path.join(TREATMENT_MODEL_DIR, "eng.traineddata");
  const treatmentOk =
    existsSync(treatmentModel) &&
    sha256File(treatmentModel) === TREATMENT_MODEL_SHA256 &&
    sizeOf(treatmentModel) === TREATMENT_MODEL_BYTES;
  gate(
    "treatment-model-integrity",
    treatmentOk,
    `${TREATMENT_MODEL_SHA256} / ${TREATMENT_MODEL_BYTES}`,
  );

  const positive = path.join(SYNTHETIC, "positive.png");
  const blank = path.join(SYNTHETIC, "blank.png");
  const inputsOk = sha256File(positive) === POSITIVE_SHA256 && sha256File(blank) === BLANK_SHA256;
  gate("synthetic-input-hashes", inputsOk, "positive and blank PNG sha256 must match Attempt 1");

  const changed = tryRun("git", ["diff", "--name-only", "origin/main...HEAD"]);
  const forbidden = changed
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter(
      (file) =>
        file.startsWith("src/") ||
        file.startsWith("tests/") ||
        file === "Dockerfile" ||
        file === "render.yaml" ||
        file === "package.json" ||
        file.startsWith("next.config"),
    );
  gate(
    "no-production-or-fixture-changes",
    forbidden.length === 0,
    forbidden.length === 0 ? "clean" : `forbidden paths changed: ${forbidden.join(", ")}`,
  );

  const blocking = gates.filter((item) => item.status === "FAIL");
  if (blocking.length > 0) {
    writeJson(path.join(OUT, "execute-gates.json"), { gates, blocked: true });
    console.error(JSON.stringify({ blocked: true, gates }, null, 2));
    throw new Error(`EXECUTE_GATES_FAILED: ${blocking.map((item) => item.gate).join(", ")}`);
  }
  writeJson(path.join(OUT, "execute-gates.json"), { gates, blocked: false });

  // ---- Build -------------------------------------------------------------
  const buildArgs = [
    "build",
    "--platform",
    PLATFORM,
    "-f",
    DOCKERFILE,
    "--build-arg",
    `TESSERACT_VERSION=${pins.tesseract.version}`,
    "--build-arg",
    `LIBTESSERACT_VERSION=${pins.libtesseract.version}`,
    "--build-arg",
    `LEPTONICA_VERSION=${pins.leptonica.version}`,
    "-t",
    IMAGE_TAG,
    ".",
  ];
  run("docker", buildArgs);

  const imageId = run("docker", ["image", "inspect", IMAGE_TAG, "--format", "{{.Id}}"]);
  const inContainer = (script: string) =>
    tryRun("docker", [
      "run",
      "--rm",
      "--platform",
      PLATFORM,
      "--network=none",
      IMAGE_TAG,
      "sh",
      "-lc",
      script,
    ]);

  const inventory = {
    imageTag: IMAGE_TAG,
    imageId,
    platform: PLATFORM,
    tesseractVersionRaw: inContainer("tesseract --version 2>&1"),
    tesseractPath: inContainer("command -v tesseract"),
    tesseractSha256: inContainer("sha256sum \"$(command -v tesseract)\" | cut -d' ' -f1"),
    ldd: inContainer('ldd "$(command -v tesseract)"'),
    dpkgVersions: inContainer(
      `dpkg-query -W -f='\${Package}=\${Version}\\n' ${pins.tesseract.package} ${pins.libtesseract.package} ${pins.leptonica.package} time 2>&1`,
    ),
    architecture: inContainer("dpkg --print-architecture; uname -m"),
    runner: {
      unameAll: tryRun("uname", ["-a"]),
      nproc: tryRun("nproc", []),
      memoryBytes: tryRun("sh", ["-c", "free -b | awk '/Mem:/ {print $2}'"]),
      githubRunId: process.env.GITHUB_RUN_ID ?? null,
      runnerArch: process.env.RUNNER_ARCH ?? null,
      imageOs: process.env.ImageOS ?? null,
      imageVersion: process.env.ImageVersion ?? null,
      nativeAmd64: tryRun("uname", ["-m"]) === "x86_64",
    },
    dockerVersion: tryRun("docker", ["version", "--format", "{{json .}}"]),
  };
  writeJson(path.join(OUT, "docker-image-provenance.json"), {
    artifact: "docker-image-provenance",
    experimentId: EXPERIMENT_ID,
    attempt: 2,
    ...inventory,
  });

  // ---- Eight fixed invocations -------------------------------------------
  const records: InvocationRecord[] = [];
  for (const item of MATRIX) {
    const modelDir = path.join(process.cwd(), modelDirFor(item.arm));
    const inputName = `${item.image}.png`;
    const inner =
      `/usr/bin/time -v -o /out/${item.id}.time timeout ${INVOCATION.timeoutSeconds} ` +
      `tesseract /inputs/${inputName} stdout -l ${INVOCATION.language} ` +
      `--oem ${INVOCATION.oem} --psm ${INVOCATION.psm} --dpi ${INVOCATION.dpi} ${INVOCATION.outputMode} ` +
      `> /out/${item.id}.tsv 2> /out/${item.id}.stderr; echo $? > /out/${item.id}.exit`;
    const args = [
      "run",
      "--rm",
      "--platform",
      PLATFORM,
      "--network=none",
      "--cpus",
      INVOCATION.cpus,
      "--memory",
      INVOCATION.memory,
      "-v",
      `${modelDir}:/models:ro`,
      "-v",
      `${SYNTHETIC}:/inputs:ro`,
      "-v",
      `${RAW}:/out`,
      "-e",
      "TESSDATA_PREFIX=/models",
      ...Object.entries(INVOCATION.env).flatMap(([key, value]) => ["-e", `${key}=${value}`]),
      IMAGE_TAG,
      "sh",
      "-lc",
      inner,
    ];

    const started = Date.now();
    const result = spawnSync("docker", args, { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
    const wallClockMs = Date.now() - started;

    const tsvPath = path.join(RAW, `${item.id}.tsv`);
    const stderrPath = path.join(RAW, `${item.id}.stderr`);
    const exitPath = path.join(RAW, `${item.id}.exit`);
    const timePath = path.join(RAW, `${item.id}.time`);
    const producedTsv = existsSync(tsvPath);
    const exitStatus = existsSync(exitPath)
      ? Number.parseInt(readFileSync(exitPath, "utf8").trim(), 10)
      : (result.status ?? null);
    const timeText = existsSync(timePath) ? readFileSync(timePath, "utf8") : "";
    const rssMatch = timeText.match(/Maximum resident set size \(kbytes\):\s*(\d+)/);
    const tsv = producedTsv ? readFileSync(tsvPath, "utf8") : null;

    if (!producedTsv) {
      // Explicit absent-output marker. No empty TSV is synthesised.
      writeFileSync(
        path.join(RAW, `${item.id}.ABSENT-OUTPUT.md`),
        `# Absent output — ${item.id}\n\nNo TSV was produced.\n\n- exit status: ${exitStatus ?? "unknown"}\n- signal: ${result.signal ?? "none"}\n- failure stage: invocation\n\nStderr is preserved alongside this marker when the container produced any.\n`,
      );
    }

    records.push({
      id: item.id,
      arm: item.arm,
      image: item.image,
      run: item.run,
      command: `docker ${args.join(" ")}`,
      environment: { ...INVOCATION.env, TESSDATA_PREFIX: "/models" },
      modelSha256: item.arm === "control" ? CONTROL_MODEL_SHA256 : TREATMENT_MODEL_SHA256,
      inputSha256: item.image === "positive" ? POSITIVE_SHA256 : BLANK_SHA256,
      imageIdentity: imageId,
      executed: true,
      failureStage: producedTsv ? null : "invocation",
      exitStatus,
      terminatingSignal: result.signal ?? null,
      timedOut: exitStatus === 124,
      wallClockMs,
      maxResidentKb: rssMatch ? Number.parseInt(rssMatch[1], 10) : null,
      tsvPath: producedTsv ? path.relative(process.cwd(), tsvPath) : null,
      stderrPath: existsSync(stderrPath) ? path.relative(process.cwd(), stderrPath) : null,
      tsvBytes: producedTsv ? sizeOf(tsvPath) : null,
      stderrBytes: existsSync(stderrPath) ? sizeOf(stderrPath) : null,
      tsvValid: tsv === null ? null : tsvIsValid(tsv),
      normalizedTranscript: tsv === null ? null : normalizedTranscript(tsv),
      tsvSha256: producedTsv ? sha256File(tsvPath) : null,
    });
  }
  writeJson(path.join(OUT, "run-results.json"), {
    artifact: "run-results",
    experimentId: EXPERIMENT_ID,
    attempt: 2,
    executionHost: "github-hosted ubuntu-latest, native linux/amd64",
    plannedInvocations: MATRIX.length,
    executedInvocations: records.filter((item) => item.executed).length,
    emptyTsvSynthesised: false,
    fixedParameters: INVOCATION,
    results: records,
  });

  // ---- Determinism --------------------------------------------------------
  const byId = new Map(records.map((item) => [item.id, item]));
  const pairs = (["control", "treatment"] as const).flatMap((arm) =>
    (["positive", "blank"] as const).map((image) => {
      const primary = byId.get(`${arm}-${image}-primary`);
      const repeat = byId.get(`${arm}-${image}-repeat`);
      const rawIdentical =
        primary?.tsvSha256 !== null &&
        primary?.tsvSha256 !== undefined &&
        primary.tsvSha256 === repeat?.tsvSha256;
      const parsedIdentical =
        primary?.normalizedTranscript === repeat?.normalizedTranscript &&
        primary?.tsvValid === repeat?.tsvValid &&
        primary?.exitStatus === repeat?.exitStatus;
      return {
        arm,
        image,
        rawTsvByteIdentical: rawIdentical,
        parsedIdentical,
        deterministic: rawIdentical || parsedIdentical,
        rawDifferenceAttributed: rawIdentical
          ? null
          : parsedIdentical
            ? "raw bytes differ but parsed rows, transcript and exit status are identical"
            : null,
      };
    }),
  );
  const allDeterministic = pairs.every((item) => item.deterministic);
  writeJson(path.join(OUT, "determinism-report.json"), {
    artifact: "determinism-report",
    experimentId: EXPERIMENT_ID,
    attempt: 2,
    assessable: true,
    pairs,
    allDeterministic,
  });

  // ---- Resources ----------------------------------------------------------
  writeJson(path.join(OUT, "resource-report.json"), {
    artifact: "resource-report",
    experimentId: EXPERIMENT_ID,
    attempt: 2,
    assessable: true,
    nativeAmd64Runner: inventory.runner.nativeAmd64,
    emulationUsed: !inventory.runner.nativeAmd64,
    interpretation:
      "Measured on a native linux/amd64 GitHub-hosted runner. Diagnostic only: these figures do not establish Render production performance.",
    perInvocation: records.map((item) => ({
      id: item.id,
      wallClockMs: item.wallClockMs,
      maxResidentKb: item.maxResidentKb,
      timedOut: item.timedOut,
    })),
  });

  // ---- Verdict (frozen rules, unmodified) ---------------------------------
  const controlRecords = records.filter((item) => item.arm === "control");
  const treatmentRecords = records.filter((item) => item.arm === "treatment");
  const controlAllSucceeded = controlRecords.every(
    (item) => item.exitStatus === 0 && item.tsvValid === true,
  );
  const treatmentAllSucceeded = treatmentRecords.every(
    (item) => item.exitStatus === 0 && item.tsvValid === true,
  );
  const treatmentPositive = treatmentRecords.filter((item) => item.image === "positive");
  const treatmentBlank = treatmentRecords.filter((item) => item.image === "blank");
  const treatmentPositiveExact = treatmentPositive.every(
    (item) => item.normalizedTranscript === SENTINEL_TEXT,
  );
  const treatmentBlankEmpty = treatmentBlank.every(
    (item) => (item.normalizedTranscript ?? "").trim().length === 0,
  );
  const anyTimeout = records.some((item) => item.timedOut === true);
  const anySignal = records.some((item) => item.terminatingSignal !== null);
  const treatmentStderr = treatmentRecords
    .map((item) =>
      item.stderrPath ? readFileSync(path.join(process.cwd(), item.stderrPath), "utf8") : "",
    )
    .join("\n");
  const compatibilityErrorPattern =
    /(unsupported|cannot load|failed loading language|not a valid|version mismatch|undefined symbol|GLIBC|error while loading shared libraries|Error opening data file)/i;
  const treatmentCompatibilityError = compatibilityErrorPattern.test(treatmentStderr);
  const treatmentReproduciblyFailed =
    !treatmentAllSucceeded &&
    treatmentPositive.every((item) => item.exitStatus !== 0 || item.tsvValid !== true);

  let verdict:
    "COMPATIBLE" | "INCOMPATIBLE_FLOAT_MODEL" | "INCONCLUSIVE_ENVIRONMENT" | "INCONCLUSIVE_OUTPUT";
  let rationale: string;

  if (!controlAllSucceeded) {
    verdict = "INCONCLUSIVE_ENVIRONMENT";
    rationale =
      "The native control model did not execute cleanly, so the runtime itself is not established as sound.";
  } else if (!allDeterministic) {
    verdict = "INCONCLUSIVE_OUTPUT";
    rationale = "Repeat output was nondeterministic. Nondeterminism overrides compatibility.";
  } else if (
    treatmentAllSucceeded &&
    treatmentPositiveExact &&
    treatmentBlankEmpty &&
    !anyTimeout &&
    !anySignal
  ) {
    verdict = "COMPATIBLE";
    rationale =
      "Control and treatment both initialized and exited successfully, both produced valid TSV for both inputs, the treatment sentinel transcript matched exactly, the treatment blank transcript was empty, and repeats were deterministic.";
  } else if (treatmentReproduciblyFailed && treatmentCompatibilityError) {
    verdict = "INCOMPATIBLE_FLOAT_MODEL";
    rationale =
      "Control completed successfully while the float treatment reproducibly failed to initialize or execute with a model/runtime compatibility error.";
  } else {
    verdict = "INCONCLUSIVE_OUTPUT";
    rationale =
      "Treatment loaded and exited but did not satisfy the frozen output criteria, or its failure could not be separated from a non-compatibility cause.";
  }

  const decision = {
    artifact: "attempt-2-decision",
    experimentId: EXPERIMENT_ID,
    attempt: 2,
    evaluationOnly: true,
    syntheticOnly: true,
    corpusAccessed: false,
    productionChanged: false,
    verdict,
    rationale,
    controlAllSucceeded,
    treatmentAllSucceeded,
    treatmentPositiveExactMatch: treatmentPositiveExact,
    treatmentBlankEmpty,
    allDeterministic,
    anyTimeout,
    anySignal,
    transcripts: records.map((item) => ({
      id: item.id,
      normalizedTranscript: item.normalizedTranscript,
    })),
    expectedSentinel: SENTINEL_TEXT,
    frozenVerdictRulesModified: false,
  };
  writeJson(path.join(OUT, "decision.json"), decision);

  console.log(
    JSON.stringify(
      {
        verdict,
        rationale,
        allDeterministic,
        records: records.map((item) => ({
          id: item.id,
          exit: item.exitStatus,
          valid: item.tsvValid,
          transcript: item.normalizedTranscript,
          ms: item.wallClockMs,
          rssKb: item.maxResidentKb,
        })),
      },
      null,
      2,
    ),
  );
}

main();
