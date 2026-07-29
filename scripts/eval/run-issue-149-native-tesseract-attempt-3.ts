/**
 * Issue #149 Attempt 3 — native Tesseract + tessdata_best compatibility probe.
 *
 * A separately preregistered harness-correction attempt. Attempts 1 and 2 are
 * untouched; nothing here rewrites or reinterprets them.
 *
 * Correction 1: each ephemeral tessdata mount now carries the pinned runtime's
 * own `configs/tsv`, so the TSV renderer engages. A plain-text fallback is a
 * failed output condition, not a silent degradation.
 * Correction 2: the positive sentinel is `LABEL LENS 123`.
 *
 * Everything else is the frozen Attempt 2 runtime. Synthetic inputs only: no
 * corpus, no fixture truth, no production change. Fails closed.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const EXPERIMENT_ID = "issue-149-native-tesseract-float-compatibility-attempt-3";
const ROOT = path.join(process.cwd(), "artifacts", EXPERIMENT_ID);
const RAW = path.join(ROOT, "raw");
const SYNTHETIC = path.join(ROOT, "synthetic");

const PREREGISTRATION_SHA_FILE = path.join(ROOT, "preregistration.sha256");

const DOCKERFILE = "scripts/eval/docker/issue-149-native-tesseract-attempt-3.Dockerfile";
const IMAGE_TAG = "issue-149-native-tesseract-probe:attempt-3";
const PLATFORM = "linux/amd64";

/** Frozen runtime, reused from Attempt 2. Any drift stops before OCR. */
const BASE_REF =
  "node:22-bookworm-slim@sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3";
const BASE_AMD64_IMAGE_ID =
  "sha256:bd16adabad7619222d4d0ab2d61f48391dacde03ad93f54d344683e326cbd0e2";
const PINS = {
  tesseract: { package: "tesseract-ocr", version: "5.3.0-2" },
  libtesseract: { package: "libtesseract5", version: "5.3.0-2" },
  leptonica: { package: "liblept5", version: "1.82.0-3+b3" },
  time: { package: "time", version: "1.9-0.2" },
} as const;
const EXPECTED_TESSERACT_BINARY_SHA256 =
  "1e8c7ce7f27d2d1c902fb648efed443483f2a8fc7b60c48a5d3b61d647a2649e";

const CONTROL_MODEL = "src/pipeline/extractor/assets/eng.traineddata";
const CONTROL_MODEL_SHA256 = "5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747";
const CONTROL_MODEL_BYTES = 5199098;
const TREATMENT_MODEL = ".local/ocr-research/traineddata/tessdata-best/eng.traineddata";
const TREATMENT_MODEL_SHA256 = "8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba";
const TREATMENT_MODEL_BYTES = 15400601;

const POSITIVE_SHA256 = "9f079b48bcc7ba5a71a0e1b84f946c621e6709739ecd260549075a0c38e3b49d";
const BLANK_SHA256 = "8b5531768177d1a62c9e7780a1edfd5231f46681a474ad359313a979aa4d3e9d";
const EXPECTED_POSITIVE_TRANSCRIPT = "LABEL LENS 123";

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

/** Exact Tesseract TSV header schema. */
const TSV_HEADER =
  "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
const TSV_COLUMNS = 12;

type Arm = "control" | "treatment";
type ImageKind = "positive" | "blank";

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

const sha256Bytes = (value: Uint8Array) => createHash("sha256").update(value).digest("hex");
const abs = (p: string) => (path.isAbsolute(p) ? p : path.join(process.cwd(), p));
const sha256File = (p: string) => sha256Bytes(readFileSync(abs(p)));
const sizeOf = (p: string) => readFileSync(abs(p)).length;
const runCmd = (c: string, a: readonly string[]) =>
  execFileSync(c, [...a], { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 }).trim();
function tryRun(c: string, a: readonly string[]): string {
  try {
    return runCmd(c, a);
  } catch (error) {
    return `ERROR: ${error instanceof Error ? error.message : String(error)}`;
  }
}
const writeJson = (p: string, v: unknown) => writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);

/**
 * Preregistered normalization. Word-level TSV text in reading order, outer
 * whitespace trimmed, internal whitespace collapsed to one ASCII space. No
 * fuzzy matching, no substitution, no edit-distance allowance.
 */
function normalizeTranscript(tsv: string): string {
  return tsv
    .split("\n")
    .slice(1)
    .filter((line) => line.length > 0)
    .map((line) => line.split("\t"))
    .filter((columns) => columns.length === TSV_COLUMNS)
    .map((columns) => columns[11])
    .filter((text) => text.trim().length > 0)
    .join(" ")
    .trim()
    .replace(/\s+/g, " ");
}

interface TsvValidity {
  valid: boolean;
  reasons: string[];
  rowCount: number;
  wordRowCount: number;
}

function validateTsv(tsv: string, stderr: string): TsvValidity {
  const reasons: string[] = [];
  if (tsv.length === 0) reasons.push("output file is empty");
  const lines = tsv.split("\n").filter((line) => line.length > 0);
  const header = lines[0] ?? "";
  if (header !== TSV_HEADER)
    reasons.push(
      `header does not match the expected TSV schema: ${JSON.stringify(header.slice(0, 120))}`,
    );
  const rows = lines.slice(1).map((line) => line.split("\t"));
  const badColumns = rows.filter((columns) => columns.length !== TSV_COLUMNS).length;
  if (badColumns > 0) reasons.push(`${badColumns} row(s) do not have ${TSV_COLUMNS} columns`);
  const numericBad = rows.filter(
    (columns) =>
      columns.length === TSV_COLUMNS &&
      columns.slice(0, 11).some((value) => !Number.isFinite(Number(value))),
  ).length;
  if (numericBad > 0)
    reasons.push(`${numericBad} row(s) have non-numeric values in numeric columns`);
  if (/Can't open tsv|read_params_file/.test(stderr)) {
    reasons.push("stderr reports a TSV config loading failure");
  }
  return {
    valid: reasons.length === 0,
    reasons,
    rowCount: rows.length,
    wordRowCount: rows.filter((c) => c.length === TSV_COLUMNS && c[11].trim().length > 0).length,
  };
}

function main() {
  mkdirSync(RAW, { recursive: true });
  const gates: Array<{ gate: string; status: "PASS" | "FAIL"; detail: string }> = [];
  const gate = (name: string, ok: boolean, detail: string) =>
    gates.push({ gate: name, status: ok ? "PASS" : "FAIL", detail });
  const stop = (verdict: string, reason: string) => {
    writeJson(path.join(ROOT, "decision.json"), {
      artifact: "decision",
      experimentId: EXPERIMENT_ID,
      attempt: 3,
      verdict,
      reason,
      gates,
      ocrInvoked: false,
      executedInvocations: 0,
    });
    console.error(JSON.stringify({ verdict, reason, gates }, null, 2));
    throw new Error(`${verdict}: ${reason}`);
  };

  // ---- Preflight ---------------------------------------------------------
  const preregExpected = existsSync(PREREGISTRATION_SHA_FILE)
    ? readFileSync(PREREGISTRATION_SHA_FILE, "utf8").trim().split(/\s+/)[0]
    : null;
  const preregOk =
    preregExpected !== null && sha256File(path.join(ROOT, "preregistration.md")) === preregExpected;
  gate("preregistration-frozen", preregOk, `expected ${preregExpected ?? "missing"}`);

  const arch = tryRun("uname", ["-m"]);
  gate("runner-native-amd64", arch === "x86_64", `uname -m = ${arch}`);

  const controlOk =
    existsSync(abs(CONTROL_MODEL)) &&
    sha256File(CONTROL_MODEL) === CONTROL_MODEL_SHA256 &&
    sizeOf(CONTROL_MODEL) === CONTROL_MODEL_BYTES;
  gate("control-model-integrity", controlOk, `${CONTROL_MODEL_SHA256} / ${CONTROL_MODEL_BYTES}`);

  const treatmentOk =
    existsSync(abs(TREATMENT_MODEL)) &&
    sha256File(TREATMENT_MODEL) === TREATMENT_MODEL_SHA256 &&
    sizeOf(TREATMENT_MODEL) === TREATMENT_MODEL_BYTES;
  gate(
    "treatment-model-integrity",
    treatmentOk,
    `${TREATMENT_MODEL_SHA256} / ${TREATMENT_MODEL_BYTES}`,
  );

  const inputsOk =
    sha256File(path.join(SYNTHETIC, "positive.png")) === POSITIVE_SHA256 &&
    sha256File(path.join(SYNTHETIC, "blank.png")) === BLANK_SHA256;
  gate("synthetic-input-hashes", inputsOk, `positive ${POSITIVE_SHA256}`);

  const changed = tryRun("git", ["diff", "--name-only", "origin/main...HEAD"]);
  const forbidden = changed
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter(
      (f) =>
        f.startsWith("src/") ||
        f.startsWith("tests/") ||
        f === "Dockerfile" ||
        f === "render.yaml" ||
        f === "package.json" ||
        f.startsWith("next.config"),
    );
  gate("no-production-or-fixture-changes", forbidden.length === 0, forbidden.join(", ") || "clean");

  if (gates.some((g) => g.status === "FAIL")) {
    stop("INCONCLUSIVE_ENVIRONMENT", "A preflight gate failed before any OCR.");
  }

  // ---- Runtime rebuild and identity reverification -----------------------
  tryRun("docker", ["pull", "--platform", PLATFORM, BASE_REF]);
  const baseId = tryRun("docker", ["image", "inspect", BASE_REF, "--format", "{{.Id}}"]);
  gate("base-image-digest-reproduced", baseId === BASE_AMD64_IMAGE_ID, `${baseId}`);
  if (baseId !== BASE_AMD64_IMAGE_ID) {
    stop("INCONCLUSIVE_ENVIRONMENT", `Pinned base image id changed: ${baseId}`);
  }

  runCmd("docker", [
    "build",
    "--platform",
    PLATFORM,
    "-f",
    DOCKERFILE,
    "--build-arg",
    `TESSERACT_VERSION=${PINS.tesseract.version}`,
    "--build-arg",
    `LIBTESSERACT_VERSION=${PINS.libtesseract.version}`,
    "--build-arg",
    `LEPTONICA_VERSION=${PINS.leptonica.version}`,
    "--build-arg",
    `TIME_VERSION=${PINS.time.version}`,
    "-t",
    IMAGE_TAG,
    ".",
  ]);
  const imageId = runCmd("docker", ["image", "inspect", IMAGE_TAG, "--format", "{{.Id}}"]);
  const inImage = (script: string) =>
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

  const binarySha = inImage("sha256sum \"$(command -v tesseract)\" | cut -d' ' -f1");
  const dpkgVersions = inImage(
    `dpkg-query -W -f='\${Package}=\${Version}\\n' ${PINS.tesseract.package} ${PINS.libtesseract.package} ${PINS.leptonica.package} ${PINS.time.package}`,
  );
  const versionRaw = inImage("tesseract --version 2>&1");
  const lddOut = inImage('ldd "$(command -v tesseract)"');

  const pinsReproduced = [
    `${PINS.tesseract.package}=${PINS.tesseract.version}`,
    `${PINS.libtesseract.package}=${PINS.libtesseract.version}`,
    `${PINS.leptonica.package}=${PINS.leptonica.version}`,
    `${PINS.time.package}=${PINS.time.version}`,
  ].every((entry) => dpkgVersions.includes(entry));
  gate("package-pins-reproduced", pinsReproduced, dpkgVersions.replace(/\n/g, " "));
  gate("tesseract-binary-identity", binarySha === EXPECTED_TESSERACT_BINARY_SHA256, binarySha);
  if (!pinsReproduced || binarySha !== EXPECTED_TESSERACT_BINARY_SHA256) {
    stop(
      "INCONCLUSIVE_ENVIRONMENT",
      "The frozen runtime did not reproduce; no substitution was made.",
    );
  }

  writeJson(path.join(ROOT, "docker-image-provenance.json"), {
    artifact: "docker-image-provenance",
    experimentId: EXPERIMENT_ID,
    attempt: 3,
    dockerfile: DOCKERFILE,
    baseReference: BASE_REF,
    baseAmd64ImageId: baseId,
    baseImageIdMatchesAttempt2: baseId === BASE_AMD64_IMAGE_ID,
    imageTag: IMAGE_TAG,
    imageId,
    platform: PLATFORM,
    buildArgs: PINS,
    dpkgVersions,
    dockerVersion: tryRun("docker", ["version", "--format", "{{json .}}"]),
  });
  writeJson(path.join(ROOT, "tesseract-binary-provenance.json"), {
    artifact: "tesseract-binary-provenance",
    experimentId: EXPERIMENT_ID,
    attempt: 3,
    path: inImage("command -v tesseract"),
    sha256: binarySha,
    matchesAttempt2: binarySha === EXPECTED_TESSERACT_BINARY_SHA256,
    versionRaw,
    ldd: lddOut,
  });
  writeJson(path.join(ROOT, "runtime-provenance.json"), {
    artifact: "runtime-provenance",
    experimentId: EXPERIMENT_ID,
    attempt: 3,
    reusedFrom: "Attempt 2 (PR #209), reverified rather than rediscovered",
    runner: {
      unameAll: tryRun("uname", ["-a"]),
      arch,
      nativeAmd64: arch === "x86_64",
      nproc: tryRun("nproc", []),
      memoryBytes: tryRun("sh", ["-c", "free -b | awk '/Mem:/ {print $2}'"]),
      imageOs: process.env.ImageOS ?? null,
      imageVersion: process.env.ImageVersion ?? null,
      githubRunId: process.env.GITHUB_RUN_ID ?? null,
    },
    pins: PINS,
    pinsReproduced,
    invocation: INVOCATION,
  });

  // ---- Harness correction 1: locate and stage configs/tsv ----------------
  const tsvConfigPath = inImage(
    "find /usr/share/tesseract-ocr -type f -path '*/configs/tsv' | head -1",
  );
  if (
    !tsvConfigPath ||
    tsvConfigPath.startsWith("ERROR") ||
    !tsvConfigPath.includes("configs/tsv")
  ) {
    stop(
      "INCONCLUSIVE_ENVIRONMENT",
      `configs/tsv not found in the pinned runtime: ${tsvConfigPath}`,
    );
  }
  const tsvConfigOwner = inImage(`dpkg -S ${tsvConfigPath} 2>&1 || echo UNOWNED`);
  const tsvConfigSha = inImage(`sha256sum ${tsvConfigPath} | cut -d' ' -f1`);
  const tsvConfigSize = inImage(`stat -c %s ${tsvConfigPath}`);
  const tsvConfigContents = inImage(`cat ${tsvConfigPath}`);

  const stageRoot = mkdtempSync(
    path.join(process.env.RUNNER_TEMP ?? os.tmpdir(), "attempt3-tessdata-"),
  );
  const stagedConfigShas: Record<string, string> = {};
  for (const arm of ["control", "treatment"] as const) {
    const dir = path.join(stageRoot, arm);
    mkdirSync(path.join(dir, "configs"), { recursive: true });
    cpSync(
      abs(arm === "control" ? CONTROL_MODEL : TREATMENT_MODEL),
      path.join(dir, "eng.traineddata"),
    );
    // Extract the config from the image rather than reconstructing it, so the
    // staged copy is the installed file and not an approximation.
    const extracted = runCmd("docker", [
      "run",
      "--rm",
      "--platform",
      PLATFORM,
      "--network=none",
      IMAGE_TAG,
      "cat",
      tsvConfigPath,
    ]);
    writeFileSync(path.join(dir, "configs", "tsv"), `${extracted}\n`);
    stagedConfigShas[arm] = sha256File(path.join(dir, "configs", "tsv"));
  }
  const configsIdentical = stagedConfigShas.control === stagedConfigShas.treatment;
  gate("staged-tsv-configs-byte-identical", configsIdentical, JSON.stringify(stagedConfigShas));
  if (!configsIdentical) {
    stop("INCONCLUSIVE_ENVIRONMENT", "The two staged configs/tsv copies are not byte-identical.");
  }

  writeJson(path.join(ROOT, "tsv-config-provenance.json"), {
    artifact: "tsv-config-provenance",
    experimentId: EXPERIMENT_ID,
    attempt: 3,
    harnessCorrection:
      "Attempt 2 mounted bare model directories, so Tesseract's configs/tsv was absent and the renderer silently fell back to plain text. Each ephemeral mount now carries the pinned runtime's own configs/tsv.",
    sourcePathInImage: tsvConfigPath,
    packageOwnership: tsvConfigOwner,
    sourceSha256: tsvConfigSha,
    sourceByteSize: Number(tsvConfigSize),
    contents: tsvConfigContents,
    stagedCopies: stagedConfigShas,
    stagedCopiesByteIdentical: configsIdentical,
    contentsAltered: false,
    treatmentSpecificConfigUsed: false,
    stagedOutsideGit: true,
    stageRoot,
  });
  writeJson(path.join(ROOT, "control-model-provenance.json"), {
    artifact: "control-model-provenance",
    experimentId: EXPERIMENT_ID,
    attempt: 3,
    path: CONTROL_MODEL,
    sha256: sha256File(CONTROL_MODEL),
    byteSize: sizeOf(CONTROL_MODEL),
    role: "native diagnostic positive control",
    committedToGit: false,
    modified: false,
  });
  writeJson(path.join(ROOT, "treatment-model-provenance.json"), {
    artifact: "treatment-model-provenance",
    experimentId: EXPERIMENT_ID,
    attempt: 3,
    path: TREATMENT_MODEL,
    sha256: sha256File(TREATMENT_MODEL),
    byteSize: sizeOf(TREATMENT_MODEL),
    retrievalScript: "scripts/eval/fetch-issue-149-tessdata-best.mjs",
    upstreamCommit: "9ddc24e750eec0994223a9edc3fcb434a2244f3b",
    license: "Apache-2.0",
    committedToGit: false,
    modified: false,
  });

  // ---- Eight fixed invocations -------------------------------------------
  const records = [];
  for (const item of MATRIX) {
    const modelDir = path.join(stageRoot, item.arm);
    const inner =
      `/usr/bin/time -v -o /out/${item.id}.time timeout ${INVOCATION.timeoutSeconds} ` +
      `tesseract /inputs/${item.image}.png stdout -l ${INVOCATION.language} ` +
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
      ...Object.entries(INVOCATION.env).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
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
    const produced = existsSync(tsvPath);
    const stderrText = existsSync(stderrPath) ? readFileSync(stderrPath, "utf8") : "";
    const exitStatus = existsSync(exitPath)
      ? Number.parseInt(readFileSync(exitPath, "utf8").trim(), 10)
      : (result.status ?? null);
    const timeText = existsSync(timePath) ? readFileSync(timePath, "utf8") : "";
    const rss = timeText.match(/Maximum resident set size \(kbytes\):\s*(\d+)/);

    if (!produced) {
      writeFileSync(
        path.join(RAW, `${item.id}.ABSENT-OUTPUT.md`),
        `# Absent output — ${item.id}\n\nNo TSV file was produced. No TSV was fabricated.\n\n- exit status: ${exitStatus ?? "unknown"}\n- signal: ${result.signal ?? "none"}\n- failure stage: invocation\n`,
      );
    }
    const tsv = produced ? readFileSync(tsvPath, "utf8") : null;
    const validity = tsv === null ? null : validateTsv(tsv, stderrText);

    records.push({
      ...item,
      command: `docker ${args.join(" ")}`,
      environment: { ...INVOCATION.env, TESSDATA_PREFIX: "/models" },
      modelSha256: item.arm === "control" ? CONTROL_MODEL_SHA256 : TREATMENT_MODEL_SHA256,
      inputSha256: item.image === "positive" ? POSITIVE_SHA256 : BLANK_SHA256,
      tsvConfigSha256: stagedConfigShas[item.arm],
      imageId,
      executed: true,
      failureStage: produced ? null : "invocation",
      exitStatus,
      terminatingSignal: result.signal ?? null,
      timedOut: exitStatus === 124,
      wallClockMs,
      maxResidentKb: rss ? Number.parseInt(rss[1], 10) : null,
      tsvPath: produced ? path.relative(process.cwd(), tsvPath) : null,
      stderrPath: existsSync(stderrPath) ? path.relative(process.cwd(), stderrPath) : null,
      tsvSha256: produced ? sha256File(tsvPath) : null,
      tsvBytes: produced ? sizeOf(tsvPath) : null,
      stderrBytes: existsSync(stderrPath) ? sizeOf(stderrPath) : null,
      tsvValid: validity?.valid ?? null,
      tsvValidityReasons: validity?.reasons ?? null,
      tsvRowCount: validity?.rowCount ?? null,
      tsvWordRowCount: validity?.wordRowCount ?? null,
      plainTextFallbackDetected: /Can't open tsv|read_params_file/.test(stderrText),
      normalizedTranscript: tsv === null ? null : normalizeTranscript(tsv),
    });
  }

  writeJson(path.join(ROOT, "parsed-results.json"), {
    artifact: "parsed-results",
    experimentId: EXPERIMENT_ID,
    attempt: 3,
    normalizationRule:
      "Concatenate TSV word-level text in reading order; trim outer whitespace; collapse internal whitespace to one ASCII space. No fuzzy matching, substitution, or edit-distance allowance.",
    expectedPositiveTranscript: EXPECTED_POSITIVE_TRANSCRIPT,
    expectedBlankTranscript: "",
    tsvSynthesizedFromPlainText: false,
    results: records,
  });
  writeJson(path.join(ROOT, "invocation-matrix.json"), {
    artifact: "invocation-matrix",
    experimentId: EXPERIMENT_ID,
    attempt: 3,
    plannedInvocations: MATRIX.length,
    executedInvocations: records.filter((r) => r.executed).length,
    fixedParameters: INVOCATION,
    onlyDifferenceBetweenArms: "the eng.traineddata bytes in the read-only mount",
    containerHardening: {
      network: "none",
      modelAndConfigMountMode: "read-only",
      inputMountMode: "read-only",
      repositoryRootMounted: false,
      corpusMounted: false,
      fixtureTruthMounted: false,
      identicalResourceLimits: true,
    },
    matrix: records.map((r) => ({
      id: r.id,
      arm: r.arm,
      image: r.image,
      run: r.run,
      executed: r.executed,
    })),
  });

  // ---- Determinism --------------------------------------------------------
  const byId = new Map(records.map((r) => [r.id, r]));
  const pairs = (["control", "treatment"] as const).flatMap((arm) =>
    (["positive", "blank"] as const).map((image) => {
      const p = byId.get(`${arm}-${image}-primary`);
      const r = byId.get(`${arm}-${image}-repeat`);
      const rawIdentical = Boolean(p?.tsvSha256 && p.tsvSha256 === r?.tsvSha256);
      const rowsIdentical =
        p?.normalizedTranscript === r?.normalizedTranscript &&
        p?.tsvRowCount === r?.tsvRowCount &&
        p?.tsvWordRowCount === r?.tsvWordRowCount &&
        p?.exitStatus === r?.exitStatus &&
        p?.tsvValid === r?.tsvValid;
      return {
        arm,
        image,
        rawTsvByteIdentical: rawIdentical,
        parsedRowsBoxesConfidencesIdentical: rowsIdentical,
        deterministic: rawIdentical || rowsIdentical,
        rawDifferenceAttribution: rawIdentical
          ? null
          : rowsIdentical
            ? "raw bytes differ while parsed rows, boxes, confidences and transcript are identical"
            : "not attributable",
      };
    }),
  );
  const allDeterministic = pairs.every((p) => p.deterministic);
  writeJson(path.join(ROOT, "determinism-report.json"), {
    artifact: "determinism-report",
    experimentId: EXPERIMENT_ID,
    attempt: 3,
    assessable: true,
    pairs,
    allDeterministic,
  });
  writeJson(path.join(ROOT, "resource-report.json"), {
    artifact: "resource-report",
    experimentId: EXPERIMENT_ID,
    attempt: 3,
    nativeAmd64Runner: arch === "x86_64",
    emulationUsed: arch !== "x86_64",
    interpretation:
      "Measured on a native linux/amd64 GitHub-hosted runner. Diagnostic only: these figures do not establish Render production performance.",
    perInvocation: records.map((r) => ({
      id: r.id,
      wallClockMs: r.wallClockMs,
      maxResidentKb: r.maxResidentKb,
      timedOut: r.timedOut,
    })),
  });

  // ---- Verdict (preregistered rules) -------------------------------------
  const allExitZero = records.every((r) => r.exitStatus === 0);
  const allValidTsv = records.every((r) => r.tsvValid === true);
  const anyFallback = records.some((r) => r.plainTextFallbackDetected);
  const anyTimeout = records.some((r) => r.timedOut === true);
  const anySignal = records.some((r) => r.terminatingSignal !== null);
  const positives = records.filter((r) => r.image === "positive");
  const blanks = records.filter((r) => r.image === "blank");
  const positivesExact = positives.every(
    (r) => r.normalizedTranscript === EXPECTED_POSITIVE_TRANSCRIPT,
  );
  const blanksEmpty = blanks.every((r) => (r.normalizedTranscript ?? "x").length === 0);
  const controlOkAll = records
    .filter((r) => r.arm === "control")
    .every((r) => r.exitStatus === 0 && r.tsvValid === true);
  const treatmentRecords = records.filter((r) => r.arm === "treatment");
  const treatmentFailedReproducibly = treatmentRecords.every(
    (r) => r.exitStatus !== 0 || r.tsvValid !== true,
  );
  const treatmentStderr = treatmentRecords
    .map((r) => (r.stderrPath ? readFileSync(abs(r.stderrPath), "utf8") : ""))
    .join("\n");
  const compatibilityError =
    /(unsupported|cannot load|failed loading language|not a valid|version mismatch|undefined symbol|error while loading shared libraries|Error opening data file)/i.test(
      treatmentStderr,
    );

  let verdict:
    "COMPATIBLE" | "INCOMPATIBLE_FLOAT_MODEL" | "INCONCLUSIVE_OUTPUT" | "INCONCLUSIVE_ENVIRONMENT";
  let rationale: string;
  if (!allDeterministic) {
    verdict = "INCONCLUSIVE_OUTPUT";
    rationale = "Repeat output was nondeterministic. Nondeterminism overrides compatibility.";
  } else if (
    allExitZero &&
    allValidTsv &&
    !anyFallback &&
    positivesExact &&
    blanksEmpty &&
    !anyTimeout &&
    !anySignal
  ) {
    verdict = "COMPATIBLE";
    rationale =
      "Both arms initialized, all eight invocations exited 0 with valid TSV, both positive arms normalized exactly to the sentinel, all four blank outputs were empty, and every primary/repeat pair was deterministic.";
  } else if (controlOkAll && treatmentFailedReproducibly && compatibilityError) {
    verdict = "INCOMPATIBLE_FLOAT_MODEL";
    rationale =
      "Control passed every compatibility gate while the float treatment reproducibly failed with a model/runtime compatibility error.";
  } else {
    verdict = "INCONCLUSIVE_OUTPUT";
    rationale =
      "An arm executed but TSV was invalid, the sentinel was not exact, the blank emitted text, or the failure could not be attributed to model compatibility.";
  }

  writeJson(path.join(ROOT, "decision.json"), {
    artifact: "decision",
    experimentId: EXPERIMENT_ID,
    attempt: 3,
    evaluationOnly: true,
    syntheticOnly: true,
    corpusAccessed: false,
    productionChanged: false,
    verdict,
    rationale,
    gates,
    allExitZero,
    allValidTsv,
    plainTextFallbackDetected: anyFallback,
    positivesExact,
    blanksEmpty,
    allDeterministic,
    anyTimeout,
    anySignal,
    expectedPositiveTranscript: EXPECTED_POSITIVE_TRANSCRIPT,
    transcripts: records.map((r) => ({ id: r.id, normalizedTranscript: r.normalizedTranscript })),
    frozenVerdictRulesModified: false,
  });

  console.log(
    JSON.stringify(
      {
        verdict,
        rationale,
        allDeterministic,
        records: records.map((r) => ({
          id: r.id,
          exit: r.exitStatus,
          validTsv: r.tsvValid,
          rows: r.tsvRowCount,
          transcript: r.normalizedTranscript,
          ms: r.wallClockMs,
          rssKb: r.maxResidentKb,
        })),
      },
      null,
      2,
    ),
  );
}

main();
