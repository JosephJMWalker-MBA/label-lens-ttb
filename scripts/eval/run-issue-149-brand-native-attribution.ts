/**
 * Issue #149 — Brand native-runtime / float-model attribution benchmark.
 *
 * Three fixed arms over the frozen stylized Brand subset, on byte-identical
 * governed preprocessed crop pixels:
 *   A  incumbent tesseract.js 7.0.0 + integer traineddata
 *   B  native Tesseract 5.3.0     + the same integer traineddata bytes
 *   C  native Tesseract 5.3.0     + pinned float tessdata_best
 *
 * A vs B is the runtime-only contrast. B vs C is the model-only contrast.
 *
 * Evaluation-only. No production behaviour changes. Every arm and repeat is
 * executed and hashed BEFORE Brand truth is read. Fails closed.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { selectBrandObservation } from "@/pipeline/extractor/field-selection";
import { createLocalOcrEngine } from "@/pipeline/extractor/ocr-engine";
import type { OcrWord, RegionOcrResult } from "@/pipeline/extractor/extractor.types";

const EXPERIMENT_ID = "issue-149-brand-native-tesseract-model-attribution";
const ROOT = path.join(process.cwd(), "artifacts", EXPERIMENT_ID);
const INPUTS = path.join(ROOT, "inference-inputs");
const RAW = path.join(ROOT, "raw");
const EVALUATION = path.join(ROOT, "evaluation");

const DOCKERFILE = "scripts/eval/docker/issue-149-native-tesseract-attempt-3.Dockerfile";
const IMAGE_TAG = "issue-149-brand-attribution:native";
const PLATFORM = "linux/amd64";
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
const EXPECTED_BINARY_SHA256 = "1e8c7ce7f27d2d1c902fb648efed443483f2a8fc7b60c48a5d3b61d647a2649e";
const EXPECTED_TSV_CONFIG_SHA256 =
  "59d079bb75d8b3d7c839a3564580cb559e362c93a9d70f234e421c0c3e767e04";

const INTEGER_MODEL = "src/pipeline/extractor/assets/eng.traineddata";
const INTEGER_MODEL_SHA256 = "5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747";
const INTEGER_MODEL_BYTES = 5199098;
const FLOAT_MODEL = ".local/ocr-research/traineddata/tessdata-best/eng.traineddata";
const FLOAT_MODEL_SHA256 = "8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba";
const FLOAT_MODEL_BYTES = 15400601;

/** The governed Brand PSM. No DPI flag: the incumbent path sets none either. */
const PSM = 11;
const OEM = 1;
const CONTAINER = { cpus: "1", memory: "2g", timeoutSeconds: 120 } as const;
const CONTAINER_ENV = {
  LC_ALL: "C",
  LANG: "C",
  OMP_THREAD_LIMIT: "1",
  OMP_NUM_THREADS: "1",
} as const;

/** Preregistered improvement thresholds. */
const MATERIAL_RECALL_DELTA = 0.25;
const MATERIAL_CER_DELTA = 0.1;

const TSV_HEADER =
  "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext";
const TSV_COLUMNS = 12;

type ArmId = "A" | "B" | "C";
type RunId = "primary" | "repeat";

const sha256Bytes = (v: Uint8Array) => createHash("sha256").update(v).digest("hex");
const abs = (p: string) => (path.isAbsolute(p) ? p : path.join(process.cwd(), p));
const sha256File = (p: string) => sha256Bytes(readFileSync(abs(p)));
const sizeOf = (p: string) => readFileSync(abs(p)).length;
const runCmd = (c: string, a: readonly string[]) =>
  execFileSync(c, [...a], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).trim();
function tryRun(c: string, a: readonly string[]): string {
  try {
    return runCmd(c, a);
  } catch (error) {
    return `ERROR: ${error instanceof Error ? error.message : String(error)}`;
  }
}
const writeJson = (p: string, v: unknown) => writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);

/* ---------------- normalization (preregistered) ---------------- */
function normalizeText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
const collapse = (value: string) => normalizeText(value).replace(/ /g, "");

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/* ---------------- raw evidence shapes ---------------- */
interface RawWord {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}
interface RawInvocation {
  opaqueItemId: string;
  arm: ArmId;
  run: RunId;
  engine: string;
  modelSha256: string;
  inputSha256: string;
  rawTranscript: string;
  words: RawWord[];
  wordCount: number;
  meanConfidence: number | null;
  exitStatus: number | null;
  terminatingSignal: string | null;
  timedOut: boolean;
  latencyMs: number;
  peakMemoryKb: number | null;
  memoryMetric: string;
  stderr: string;
  rawArtifactPath: string;
  rawArtifactSha256: string;
  processFailure: boolean;
  tsvValid: boolean | null;
}

function readingOrderTranscript(words: readonly RawWord[]): string {
  return [...words]
    .sort((left, right) => {
      const ly = (left.bbox.y0 + left.bbox.y1) / 2;
      const ry = (right.bbox.y0 + right.bbox.y1) / 2;
      if (Math.abs(ly - ry) > 20) return ly - ry;
      return left.bbox.x0 - right.bbox.x0;
    })
    .map((word) => word.text)
    .join(" ")
    .trim();
}

function parseTsvWords(tsv: string): { words: RawWord[]; valid: boolean } {
  const lines = tsv.split("\n").filter((line) => line.length > 0);
  const valid = lines[0] === TSV_HEADER;
  const words: RawWord[] = [];
  for (const line of lines.slice(1)) {
    const columns = line.split("\t");
    if (columns.length !== TSV_COLUMNS) continue;
    const text = columns[11];
    if (!text || text.trim().length === 0) continue;
    const left = Number(columns[6]);
    const top = Number(columns[7]);
    const width = Number(columns[8]);
    const height = Number(columns[9]);
    words.push({
      text,
      confidence: Number(columns[10]),
      bbox: { x0: left, y0: top, x1: left + width, y1: top + height },
    });
  }
  return { words, valid };
}

/* ---------------- main ---------------- */
async function main() {
  mkdirSync(RAW, { recursive: true });
  const gates: Array<{ gate: string; status: "PASS" | "FAIL"; detail: string }> = [];
  const gate = (name: string, ok: boolean, detail: string) =>
    gates.push({ gate: name, status: ok ? "PASS" : "FAIL", detail });

  const preregExpected = existsSync(path.join(ROOT, "preregistration.sha256"))
    ? readFileSync(path.join(ROOT, "preregistration.sha256"), "utf8").trim().split(/\s+/)[0]
    : null;
  gate(
    "preregistration-frozen",
    preregExpected !== null && sha256File(path.join(ROOT, "preregistration.md")) === preregExpected,
    `expected ${preregExpected ?? "missing"}`,
  );

  const arch = tryRun("uname", ["-m"]);
  gate("runner-native-amd64", arch === "x86_64", `uname -m = ${arch}`);

  gate(
    "integer-model-integrity",
    sha256File(INTEGER_MODEL) === INTEGER_MODEL_SHA256 &&
      sizeOf(INTEGER_MODEL) === INTEGER_MODEL_BYTES,
    INTEGER_MODEL_SHA256,
  );
  gate(
    "float-model-integrity",
    existsSync(abs(FLOAT_MODEL)) &&
      sha256File(FLOAT_MODEL) === FLOAT_MODEL_SHA256 &&
      sizeOf(FLOAT_MODEL) === FLOAT_MODEL_BYTES,
    FLOAT_MODEL_SHA256,
  );

  const pixelManifest = JSON.parse(
    readFileSync(path.join(ROOT, "input-pixel-manifest.json"), "utf8"),
  );
  const items: Array<{ opaqueItemId: string; preprocessedSha256: string }> = pixelManifest.items;
  const inputsOk = items.every(
    (item) => sha256File(path.join(INPUTS, `${item.opaqueItemId}.png`)) === item.preprocessedSha256,
  );
  gate("inference-input-hashes", inputsOk, `${items.length} inputs verified against the freeze`);

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
    writeJson(path.join(ROOT, "decision.json"), {
      artifact: "decision",
      experimentId: EXPERIMENT_ID,
      verdict: "INCONCLUSIVE_ENVIRONMENT",
      reason: "A preflight gate failed before any OCR.",
      gates,
    });
    throw new Error("INCONCLUSIVE_ENVIRONMENT: preflight gate failed");
  }

  /* ---- native runtime rebuild + identity reverification ---- */
  tryRun("docker", ["pull", "--platform", PLATFORM, BASE_REF]);
  const baseId = tryRun("docker", ["image", "inspect", BASE_REF, "--format", "{{.Id}}"]);
  if (baseId !== BASE_AMD64_IMAGE_ID) {
    throw new Error(`INCONCLUSIVE_ENVIRONMENT: base image id changed: ${baseId}`);
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
  const pinsOk = Object.values(PINS).every((p) =>
    dpkgVersions.includes(`${p.package}=${p.version}`),
  );
  if (binarySha !== EXPECTED_BINARY_SHA256 || !pinsOk) {
    throw new Error("INCONCLUSIVE_ENVIRONMENT: pinned native runtime did not reproduce");
  }
  const tsvConfigPath = inImage(
    "find /usr/share/tesseract-ocr -type f -path '*/configs/tsv' | head -1",
  );
  const tsvConfigSha = inImage(`sha256sum ${tsvConfigPath} | cut -d' ' -f1`);
  if (tsvConfigSha !== EXPECTED_TSV_CONFIG_SHA256) {
    throw new Error(`INCONCLUSIVE_ENVIRONMENT: configs/tsv changed: ${tsvConfigSha}`);
  }

  // Stage one tessdata directory per native arm: model + the runtime's own
  // configs/tsv, so the TSV renderer engages and the only difference is weights.
  const stageRoot = mkdtempSync(path.join(process.env.RUNNER_TEMP ?? os.tmpdir(), "brand-attr-"));
  const nativeModelDir: Record<"B" | "C", string> = { B: "", C: "" };
  for (const [armId, model] of [
    ["B", INTEGER_MODEL],
    ["C", FLOAT_MODEL],
  ] as const) {
    const dir = path.join(stageRoot, armId);
    mkdirSync(path.join(dir, "configs"), { recursive: true });
    cpSync(abs(model), path.join(dir, "eng.traineddata"));
    writeFileSync(path.join(dir, "configs", "tsv"), `${inImage(`cat ${tsvConfigPath}`)}\n`);
    nativeModelDir[armId] = dir;
  }
  const stagedConfigOk =
    sha256File(path.join(nativeModelDir.B, "configs", "tsv")) ===
    sha256File(path.join(nativeModelDir.C, "configs", "tsv"));
  if (!stagedConfigOk) throw new Error("INCONCLUSIVE_ENVIRONMENT: staged tsv configs differ");

  writeJson(path.join(ROOT, "runtime-provenance.json"), {
    artifact: "runtime-provenance",
    experimentId: EXPERIMENT_ID,
    armA: {
      engine: "tesseract.js@7.0.0 / tesseract.js-core@7.0.0",
      oem: OEM,
      psm: PSM,
      dpiFlag: "none — the incumbent evaluation path sets no DPI, so no arm sets one",
      executionPath: "in-process on the runner, via createLocalOcrEngine().recognizeWords",
    },
    armsBC: {
      engine: "native Tesseract 5.3.0",
      oem: OEM,
      psm: PSM,
      dpiFlag: "none",
      imageTag: IMAGE_TAG,
      imageId,
      baseReference: BASE_REF,
      baseAmd64ImageId: baseId,
      binarySha256: binarySha,
      binaryMatchesAttempt3: binarySha === EXPECTED_BINARY_SHA256,
      dpkgVersions,
      pinsReproduced: pinsOk,
      tsvConfigPath,
      tsvConfigSha256: tsvConfigSha,
      tsvConfigMatchesAttempt3: tsvConfigSha === EXPECTED_TSV_CONFIG_SHA256,
      container: { ...CONTAINER, network: "none", env: CONTAINER_ENV },
    },
    runner: {
      arch,
      nativeAmd64: arch === "x86_64",
      unameAll: tryRun("uname", ["-a"]),
      nproc: tryRun("nproc", []),
      memoryBytes: tryRun("sh", ["-c", "free -b | awk '/Mem:/ {print $2}'"]),
      imageOs: process.env.ImageOS ?? null,
      imageVersion: process.env.ImageVersion ?? null,
      githubRunId: process.env.GITHUB_RUN_ID ?? null,
    },
  });
  writeJson(path.join(ROOT, "model-provenance.json"), {
    artifact: "model-provenance",
    experimentId: EXPERIMENT_ID,
    integer: {
      path: INTEGER_MODEL,
      sha256: sha256File(INTEGER_MODEL),
      byteSize: sizeOf(INTEGER_MODEL),
      usedByArms: ["A", "B"],
      variant: "integer-quantized best-lineage LSTM",
    },
    float: {
      path: FLOAT_MODEL,
      sha256: sha256File(FLOAT_MODEL),
      byteSize: sizeOf(FLOAT_MODEL),
      usedByArms: ["C"],
      variant: "official tessdata_best float LSTM",
      retrievalScript: "scripts/eval/fetch-issue-149-tessdata-best.mjs",
      license: "Apache-2.0",
    },
    committedToGit: false,
    bakedIntoImage: false,
  });
  writeJson(path.join(ROOT, "configuration-isolation.json"), {
    artifact: "configuration-isolation",
    experimentId: EXPERIMENT_ID,
    contrasts: [
      {
        id: "runtime",
        arms: ["A", "B"],
        changedDimension: "recognition runtime (tesseract.js WASM -> native Tesseract)",
        heldConstant: [
          "preprocessed crop PNG bytes",
          "traineddata bytes",
          "OEM 1",
          "PSM 11",
          "no DPI flag",
          "language eng",
        ],
        singleVariable: true,
      },
      {
        id: "model",
        arms: ["B", "C"],
        changedDimension: "traineddata weights (integer-quantized -> float tessdata_best)",
        heldConstant: [
          "native runtime and binary",
          "preprocessed crop PNG bytes",
          "OEM 1",
          "PSM 11",
          "no DPI flag",
          "configs/tsv",
          "container limits, locale, thread limits",
        ],
        singleVariable: true,
      },
      {
        id: "bundled-stack",
        arms: ["A", "C"],
        changedDimension: "runtime AND weights together",
        singleVariable: false,
        reportingRule:
          "Descriptive only. Arm A versus Arm C is a bundled stack comparison and is never treated as a single-variable causal contrast.",
      },
    ],
    noFourthArm: true,
    noModelSweep: true,
    noPsmSweep: true,
    noPreprocessingVariant: true,
    noScaleVariant: true,
    noEnsemble: true,
    noBestOfN: true,
  });

  /* ---- Arm A: incumbent tesseract.js ---- */
  const raws: RawInvocation[] = [];
  const engine = await createLocalOcrEngine();
  try {
    for (const run of ["primary", "repeat"] as const) {
      for (const item of items) {
        const png = readFileSync(path.join(INPUTS, `${item.opaqueItemId}.png`));
        const rssBefore = process.memoryUsage().rss;
        const started = Date.now();
        let words: RawWord[] = [];
        let failure = false;
        let stderr = "";
        try {
          const recognized = await engine.recognizeWords(png, PSM);
          words = recognized
            .filter((word: OcrWord) => word.text && word.text.trim().length > 0)
            .map((word: OcrWord) => ({
              text: word.text,
              confidence: word.rawConfidence,
              bbox: { ...word.bbox },
            }));
        } catch (error) {
          failure = true;
          stderr = error instanceof Error ? error.message : String(error);
        }
        const latencyMs = Date.now() - started;
        const rssDeltaKb = Math.max(0, Math.round((process.memoryUsage().rss - rssBefore) / 1024));
        const id = `A-${item.opaqueItemId}-${run}`;
        const rawPath = path.join(RAW, `${id}.json`);
        const payload = {
          invocation: id,
          arm: "A",
          engine: "tesseract.js@7.0.0/eng/OEM1",
          psm: PSM,
          opaqueItemId: item.opaqueItemId,
          inputSha256: item.preprocessedSha256,
          words,
          rawTranscript: readingOrderTranscript(words),
        };
        writeJson(rawPath, payload);
        writeFileSync(path.join(RAW, `${id}.stderr`), stderr);
        raws.push({
          opaqueItemId: item.opaqueItemId,
          arm: "A",
          run,
          engine: "tesseract.js@7.0.0/eng/OEM1",
          modelSha256: INTEGER_MODEL_SHA256,
          inputSha256: item.preprocessedSha256,
          rawTranscript: payload.rawTranscript,
          words,
          wordCount: words.length,
          meanConfidence:
            words.length === 0
              ? null
              : words.reduce((sum, w) => sum + w.confidence, 0) / words.length,
          exitStatus: failure ? 1 : 0,
          terminatingSignal: null,
          timedOut: false,
          latencyMs,
          peakMemoryKb: rssDeltaKb,
          memoryMetric:
            "node process RSS delta around recognize (not comparable to container peak RSS)",
          stderr,
          rawArtifactPath: path.relative(process.cwd(), rawPath),
          rawArtifactSha256: sha256File(rawPath),
          processFailure: failure,
          tsvValid: null,
        });
      }
    }
  } finally {
    await engine.terminate();
  }

  /* ---- Arms B and C: native Tesseract ---- */
  for (const arm of ["B", "C"] as const) {
    for (const run of ["primary", "repeat"] as const) {
      for (const item of items) {
        const id = `${arm}-${item.opaqueItemId}-${run}`;
        const inner =
          `/usr/bin/time -v -o /out/${id}.time timeout ${CONTAINER.timeoutSeconds} ` +
          `tesseract /inputs/${item.opaqueItemId}.png stdout -l eng --oem ${OEM} --psm ${PSM} tsv ` +
          `> /out/${id}.tsv 2> /out/${id}.stderr; echo $? > /out/${id}.exit`;
        const args = [
          "run",
          "--rm",
          "--platform",
          PLATFORM,
          "--network=none",
          "--cpus",
          CONTAINER.cpus,
          "--memory",
          CONTAINER.memory,
          "-v",
          `${nativeModelDir[arm]}:/models:ro`,
          "-v",
          `${INPUTS}:/inputs:ro`,
          "-v",
          `${RAW}:/out`,
          "-e",
          "TESSDATA_PREFIX=/models",
          ...Object.entries(CONTAINER_ENV).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
          IMAGE_TAG,
          "sh",
          "-lc",
          inner,
        ];
        const started = Date.now();
        const result = spawnSync("docker", args, {
          encoding: "utf8",
          maxBuffer: 256 * 1024 * 1024,
        });
        const latencyMs = Date.now() - started;

        const tsvPath = path.join(RAW, `${id}.tsv`);
        const stderrPath = path.join(RAW, `${id}.stderr`);
        const exitPath = path.join(RAW, `${id}.exit`);
        const timePath = path.join(RAW, `${id}.time`);
        const produced = existsSync(tsvPath);
        const stderr = existsSync(stderrPath) ? readFileSync(stderrPath, "utf8") : "";
        const exitStatus = existsSync(exitPath)
          ? Number.parseInt(readFileSync(exitPath, "utf8").trim(), 10)
          : (result.status ?? null);
        const timeText = existsSync(timePath) ? readFileSync(timePath, "utf8") : "";
        const rss = timeText.match(/Maximum resident set size \(kbytes\):\s*(\d+)/);
        if (!produced) {
          writeFileSync(
            path.join(RAW, `${id}.ABSENT-OUTPUT.md`),
            `# Absent output — ${id}\n\nNo TSV produced; none fabricated.\n\n- exit: ${exitStatus ?? "unknown"}\n- signal: ${result.signal ?? "none"}\n- failure stage: invocation\n`,
          );
        }
        const tsv = produced ? readFileSync(tsvPath, "utf8") : "";
        const parsed = parseTsvWords(tsv);
        raws.push({
          opaqueItemId: item.opaqueItemId,
          arm,
          run,
          engine: "native tesseract 5.3.0 / eng / OEM1",
          modelSha256: arm === "B" ? INTEGER_MODEL_SHA256 : FLOAT_MODEL_SHA256,
          inputSha256: item.preprocessedSha256,
          rawTranscript: readingOrderTranscript(parsed.words),
          words: parsed.words,
          wordCount: parsed.words.length,
          meanConfidence:
            parsed.words.length === 0
              ? null
              : parsed.words.reduce((sum, w) => sum + w.confidence, 0) / parsed.words.length,
          exitStatus,
          terminatingSignal: result.signal ?? null,
          timedOut: exitStatus === 124,
          latencyMs,
          peakMemoryKb: rss ? Number.parseInt(rss[1], 10) : null,
          memoryMetric: "container peak RSS from /usr/bin/time -v",
          stderr,
          rawArtifactPath: produced ? path.relative(process.cwd(), tsvPath) : "",
          rawArtifactSha256: produced ? sha256File(tsvPath) : "",
          processFailure: !produced || exitStatus !== 0,
          tsvValid: produced ? parsed.valid : false,
        });
      }
    }
  }

  /* ---- TRUTH BOUNDARY: freeze and hash every raw output first ---- */
  writeJson(path.join(ROOT, "raw-output-manifest.json"), {
    artifact: "raw-output-manifest",
    experimentId: EXPERIMENT_ID,
    truthReadBeforeThisPoint: false,
    totalInvocations: raws.length,
    expectedInvocations: 3 * items.length * 2,
    arms: ["A", "B", "C"],
    invocations: raws.map((r) => ({
      arm: r.arm,
      run: r.run,
      opaqueItemId: r.opaqueItemId,
      engine: r.engine,
      modelSha256: r.modelSha256,
      inputSha256: r.inputSha256,
      rawArtifactPath: r.rawArtifactPath,
      rawArtifactSha256: r.rawArtifactSha256,
      wordCount: r.wordCount,
      exitStatus: r.exitStatus,
      processFailure: r.processFailure,
      tsvValid: r.tsvValid,
      latencyMs: r.latencyMs,
      peakMemoryKb: r.peakMemoryKb,
    })),
  });

  /* ---- Normalized evidence adapter (evaluation-only) ---- */
  const normalized = raws.map((r) => ({
    opaqueItemId: r.opaqueItemId,
    armId: r.arm,
    run: r.run,
    engineIdentity: r.engine,
    modelSha256: r.modelSha256,
    rawTranscript: r.rawTranscript,
    normalizedTranscript: normalizeText(r.rawTranscript),
    orderedWords: r.words.map((w) => w.text),
    originalConfidences: r.words.map((w) => w.confidence),
    originalMeanConfidence: r.meanConfidence,
    normalizedConfidenceField: null,
    normalizedConfidenceOmittedBecause:
      "tesseract.js and native Tesseract confidence scales are not proven comparable, so no cross-runtime normalized confidence is emitted.",
    boundingBoxes: r.words.map((w) => w.bbox),
    latencyMs: r.latencyMs,
    peakMemoryKb: r.peakMemoryKb,
    memoryMetric: r.memoryMetric,
    warnings: r.stderr ? r.stderr.split("\n").filter(Boolean).slice(0, 20) : [],
    errors: r.processFailure ? ["process or output failure"] : [],
    outputFingerprint: sha256Bytes(Buffer.from(JSON.stringify({ t: r.rawTranscript, w: r.words }))),
  }));
  writeJson(path.join(ROOT, "normalized-evidence.json"), {
    artifact: "normalized-evidence",
    experimentId: EXPERIMENT_ID,
    evaluationOnly: true,
    productionConfidenceHandlingChanged: false,
    records: normalized,
  });

  /* ---- Truth revealed here, and not before ---- */
  const { composeResearchManifest } = await import("@/fixtures/ocr-research/fixture-corpus");
  const manifest = composeResearchManifest({ includePrivate: false });
  const idMap = JSON.parse(readFileSync(path.join(EVALUATION, "id-map.json"), "utf8")) as {
    map: Array<{
      opaqueItemId: string;
      ocrItemId: string;
      caseId: string;
      cropClusterId: string;
      designClusterId: string;
    }>;
  };
  const truthOf = new Map<string, string[]>();
  for (const entry of idMap.map) {
    const fixture = manifest.fixtures.find((f) => f.fixtureId === entry.caseId);
    truthOf.set(entry.opaqueItemId, fixture?.truth.brand?.acceptableValues ?? []);
  }

  const byKey = new Map(raws.map((r) => [`${r.arm}-${r.opaqueItemId}-${r.run}`, r]));

  function metricsFor(r: RawInvocation) {
    const truths = truthOf.get(r.opaqueItemId) ?? [];
    const hypNorm = normalizeText(r.rawTranscript);
    const hypFlat = collapse(r.rawTranscript);
    let best = {
      exactNormalizedMatch: false,
      cer: 1,
      usefulTokenRecall: null as number | null,
      matchedTokens: 0,
      totalTokens: 0,
      truthPresentInRaw: false,
    };
    for (const truth of truths) {
      const truthNorm = normalizeText(truth);
      const truthFlat = collapse(truth);
      const tokens = truthNorm.split(" ").filter((t) => t.length >= 3);
      const matched = tokens.filter((t) => hypFlat.includes(t)).length;
      const cer = truthFlat.length === 0 ? 1 : levenshtein(hypFlat, truthFlat) / truthFlat.length;
      const candidate = {
        exactNormalizedMatch: hypNorm === truthNorm,
        cer,
        usefulTokenRecall: tokens.length === 0 ? null : matched / tokens.length,
        matchedTokens: matched,
        totalTokens: tokens.length,
        truthPresentInRaw: truthFlat.length > 0 && hypFlat.includes(truthFlat),
      };
      const better =
        candidate.exactNormalizedMatch !== best.exactNormalizedMatch
          ? candidate.exactNormalizedMatch
          : candidate.cer < best.cer;
      if (better) best = candidate;
    }
    // Evaluation-only pass through the existing deterministic Brand selector.
    const pass: RegionOcrResult = {
      passId: `attribution-${r.arm}-${r.opaqueItemId}`,
      regionName: "governed-brand-region",
      passKind: "seller-region",
      triggerReasons: ["seller-region-target"],
      preprocessing: ["recovered-governed-preprocessed-bytes"],
      fieldEligibility: { brand: true, alcohol: false },
      transform: {
        crop: { left: 0, top: 0, width: 1, height: 1 },
        rotate: 0,
        scale: 1,
        originalWidth: 1,
        originalHeight: 1,
      },
      transformedSize: { width: 1, height: 1 },
      pageSegMode: PSM,
      rawWordCount: r.words.length,
      discardedWordCount: 0,
      timings: { preprocessMs: 0, ocrMs: r.latencyMs, inverseMappingMs: 0, totalMs: r.latencyMs },
      words: r.words.map((w) => ({
        text: w.text,
        rawConfidence: w.confidence,
        bbox: w.bbox,
        originalGeometry: {
          x: w.bbox.x0,
          y: w.bbox.y0,
          width: w.bbox.x1 - w.bbox.x0,
          height: w.bbox.y1 - w.bbox.y0,
        },
      })) as OcrWord[],
    };
    let selected: { state: string; value: string | null; score: number; reliable: boolean };
    try {
      const observation = selectBrandObservation([pass]);
      selected = {
        state: observation.observation.state,
        value: observation.observation.value,
        score: observation.observation.ocrEvidenceScore,
        reliable:
          observation.observation.state === "OBSERVED" &&
          observation.observation.ocrEvidenceScore >= 0.8,
      };
    } catch {
      selected = { state: "SELECTOR_ERROR", value: null, score: 0, reliable: false };
    }
    const candidateCorrect =
      selected.value !== null &&
      truths.some((t) => normalizeText(t) === normalizeText(selected.value as string));
    return {
      ...best,
      truthBearingFragmentCount: best.matchedTokens,
      emptyOutput: r.words.length === 0,
      hallucinatedText: null as null,
      hallucinatedTextNote:
        "Not automatically adjudicable. Visually unsupported text would require paired human review, which this package does not perform.",
      selectedCandidate: selected.value,
      selectedState: selected.state,
      selectorEvidenceScore: selected.score,
      candidateCorrect,
      authorityStateExploratory: selected.state,
      falseReliableRead: selected.reliable && !candidateCorrect,
    };
  }

  type Metrics = ReturnType<typeof metricsFor>;
  const perItem = [];
  for (const entry of idMap.map) {
    const armMetrics: Record<
      string,
      { primary: Metrics; repeat: Metrics; deterministic: boolean; raw: RawInvocation }
    > = {};
    for (const arm of ["A", "B", "C"] as const) {
      const primary = byKey.get(`${arm}-${entry.opaqueItemId}-primary`)!;
      const repeat = byKey.get(`${arm}-${entry.opaqueItemId}-repeat`)!;
      const deterministic =
        primary.rawTranscript === repeat.rawTranscript &&
        JSON.stringify(primary.words) === JSON.stringify(repeat.words) &&
        primary.exitStatus === repeat.exitStatus;
      armMetrics[arm] = {
        primary: metricsFor(primary),
        repeat: metricsFor(repeat),
        deterministic,
        raw: primary,
      };
    }
    perItem.push({ entry, armMetrics });
  }

  function improvement(from: Metrics, to: Metrics): "IMPROVEMENT" | "REGRESSION" | "NO_EFFECT" {
    const recallFrom = from.usefulTokenRecall ?? 0;
    const recallTo = to.usefulTokenRecall ?? 0;
    const gained =
      (!from.exactNormalizedMatch && to.exactNormalizedMatch) ||
      (!from.truthPresentInRaw && to.truthPresentInRaw) ||
      (recallTo - recallFrom >= MATERIAL_RECALL_DELTA && to.matchedTokens > from.matchedTokens) ||
      from.cer - to.cer >= MATERIAL_CER_DELTA;
    const lost =
      (from.exactNormalizedMatch && !to.exactNormalizedMatch) ||
      (from.truthPresentInRaw && !to.truthPresentInRaw) ||
      (recallFrom - recallTo >= MATERIAL_RECALL_DELTA && from.matchedTokens > to.matchedTokens) ||
      to.cer - from.cer >= MATERIAL_CER_DELTA ||
      (!from.falseReliableRead && to.falseReliableRead);
    if (lost) return "REGRESSION";
    if (gained) return "IMPROVEMENT";
    return "NO_EFFECT";
  }

  interface IdEntry {
    opaqueItemId: string;
    ocrItemId: string;
    caseId: string;
    cropClusterId: string;
    designClusterId: string;
  }
  interface ContrastRow extends IdEntry {
    classification: string;
    from: Metrics;
    to: Metrics;
  }
  const runtimeResults: ContrastRow[] = [];
  const modelResults: ContrastRow[] = [];
  for (const row of perItem) {
    const a = row.armMetrics.A;
    const b = row.armMetrics.B;
    const c = row.armMetrics.C;
    const runtimeClass =
      !a.deterministic || !b.deterministic
        ? "NATIVE_RUNTIME_NONDETERMINISTIC"
        : a.raw.processFailure || b.raw.processFailure
          ? "NATIVE_RUNTIME_INCOMPARABLE"
          : (`NATIVE_RUNTIME_${improvement(a.primary, b.primary)}` as string);
    const modelClass =
      !b.deterministic || !c.deterministic
        ? "FLOAT_MODEL_NONDETERMINISTIC"
        : b.raw.processFailure || c.raw.processFailure
          ? "FLOAT_MODEL_INCOMPARABLE"
          : (`FLOAT_MODEL_${improvement(b.primary, c.primary)}` as string);
    runtimeResults.push({
      ...row.entry,
      classification: runtimeClass,
      from: a.primary,
      to: b.primary,
    });
    modelResults.push({
      ...row.entry,
      classification: modelClass,
      from: b.primary,
      to: c.primary,
    });
  }

  writeJson(path.join(ROOT, "per-item-results.json"), {
    artifact: "per-item-results",
    experimentId: EXPERIMENT_ID,
    truthUsedOnlyAfterRawFreeze: true,
    primaryMetrics:
      "raw-recognition metrics (exact normalized match, CER, useful-token recall, truth-in-raw)",
    exploratoryMetrics:
      "selector-derived candidate, authority state and false reliable read; cross-runtime confidence comparability is not proven",
    items: perItem.map((row) => ({
      ...row.entry,
      arms: Object.fromEntries(
        Object.entries(row.armMetrics).map(([arm, value]) => [
          arm,
          {
            engine: value.raw.engine,
            modelSha256: value.raw.modelSha256,
            rawTranscript: value.raw.rawTranscript,
            normalizedTranscript: normalizeText(value.raw.rawTranscript),
            deterministic: value.deterministic,
            latencyMs: value.raw.latencyMs,
            peakMemoryKb: value.raw.peakMemoryKb,
            processFailure: value.raw.processFailure,
            metrics: value.primary,
          },
        ]),
      ),
    })),
  });
  writeJson(path.join(ROOT, "runtime-contrast-results.json"), {
    artifact: "runtime-contrast-results",
    experimentId: EXPERIMENT_ID,
    contrast: "Arm A (tesseract.js) vs Arm B (native), same integer traineddata",
    singleVariable: true,
    items: runtimeResults,
  });
  writeJson(path.join(ROOT, "model-contrast-results.json"), {
    artifact: "model-contrast-results",
    experimentId: EXPERIMENT_ID,
    contrast: "Arm B (native integer) vs Arm C (native float tessdata_best)",
    singleVariable: true,
    items: modelResults,
  });

  /* ---- Cluster aggregation ---- */
  const groups = JSON.parse(readFileSync(path.join(ROOT, "independence-groups.json"), "utf8"));
  function clusterRoll(
    results: readonly ContrastRow[],
    key: "cropClusterId" | "designClusterId",
    prefix: string,
  ) {
    const ids = [...new Set(results.map((r) => r[key] as string))].sort();
    return ids.map((id) => {
      const members = results.filter((r) => r[key] === id);
      const classes = members.map((m) => m.classification);
      const rank = [
        `${prefix}_NONDETERMINISTIC`,
        `${prefix}_REGRESSION`,
        `${prefix}_IMPROVEMENT`,
        `${prefix}_INCOMPARABLE`,
        `${prefix}_NO_EFFECT`,
      ];
      const chosen = rank.find((r) => classes.includes(r)) ?? `${prefix}_NO_EFFECT`;
      return {
        clusterId: id,
        members: members.map((m) => m.opaqueItemId),
        memberClassifications: classes,
        clusterClassification: chosen,
        countsOnce: true,
      };
    });
  }
  const runtimeCrop = clusterRoll(runtimeResults, "cropClusterId", "NATIVE_RUNTIME");
  const runtimeDesign = clusterRoll(runtimeResults, "designClusterId", "NATIVE_RUNTIME");
  const modelCrop = clusterRoll(modelResults, "cropClusterId", "FLOAT_MODEL");
  const modelDesign = clusterRoll(modelResults, "designClusterId", "FLOAT_MODEL");
  writeJson(path.join(ROOT, "crop-cluster-results.json"), {
    artifact: "crop-cluster-results",
    experimentId: EXPERIMENT_ID,
    distinctCropImagesAtCaseLevel: groups.counts.distinctCropImagesAtCaseLevel,
    rule: "Duplicate crop evidence counts once.",
    runtimeContrast: runtimeCrop,
    modelContrast: modelCrop,
  });
  writeJson(path.join(ROOT, "design-cluster-results.json"), {
    artifact: "design-cluster-results",
    experimentId: EXPERIMENT_ID,
    distinctBrandDesigns: groups.counts.distinctBrandDesigns,
    rule: "Shared-design evidence counts once at design level.",
    runtimeContrast: runtimeDesign,
    modelContrast: modelDesign,
  });

  /* ---- Determinism, resources, false reliable reads ---- */
  const determinism = perItem.flatMap((row) =>
    Object.entries(row.armMetrics).map(([arm, value]) => ({
      opaqueItemId: row.entry.opaqueItemId,
      arm,
      deterministic: value.deterministic,
    })),
  );
  const allDeterministic = determinism.every((d) => d.deterministic);
  writeJson(path.join(ROOT, "determinism-report.json"), {
    artifact: "determinism-report",
    experimentId: EXPERIMENT_ID,
    perArmItem: determinism,
    allDeterministic,
  });
  writeJson(path.join(ROOT, "resource-report.json"), {
    artifact: "resource-report",
    experimentId: EXPERIMENT_ID,
    nativeAmd64Runner: arch === "x86_64",
    comparabilityWarning:
      "Arm A memory is a node process RSS delta; Arms B and C are container peak RSS from /usr/bin/time -v. These are different metrics and must not be compared directly. All figures are diagnostic only and establish nothing about Render production performance.",
    perInvocation: raws.map((r) => ({
      arm: r.arm,
      run: r.run,
      opaqueItemId: r.opaqueItemId,
      latencyMs: r.latencyMs,
      peakMemoryKb: r.peakMemoryKb,
      memoryMetric: r.memoryMetric,
    })),
  });
  const frr = perItem.flatMap((row) =>
    Object.entries(row.armMetrics).map(([arm, value]) => ({
      opaqueItemId: row.entry.opaqueItemId,
      caseId: row.entry.caseId,
      arm,
      selectedCandidate: value.primary.selectedCandidate,
      candidateCorrect: value.primary.candidateCorrect,
      falseReliableRead: value.primary.falseReliableRead,
    })),
  );
  const frrByArm = Object.fromEntries(
    (["A", "B", "C"] as const).map((arm) => [
      arm,
      frr.filter((f) => f.arm === arm && f.falseReliableRead).length,
    ]),
  );
  const newFrrVsA = frr.filter(
    (f) =>
      f.arm !== "A" &&
      f.falseReliableRead &&
      !frr.some((g) => g.arm === "A" && g.opaqueItemId === f.opaqueItemId && g.falseReliableRead),
  );
  writeJson(path.join(ROOT, "false-reliable-read-report.json"), {
    artifact: "false-reliable-read-report",
    experimentId: EXPERIMENT_ID,
    status:
      "exploratory — derived from the existing selector; cross-runtime confidence comparability is not proven",
    perArmItem: frr,
    countsByArm: frrByArm,
    newFalseReliableReadsVersusIncumbent: newFrrVsA.length,
    newEntries: newFrrVsA,
    isPrimarySafetyVeto: true,
  });

  /* ---- Decisions ---- */
  const runtimeCropImproved = runtimeCrop.filter(
    (c) => c.clusterClassification === "NATIVE_RUNTIME_IMPROVEMENT",
  ).length;
  const runtimeDesignImproved = runtimeDesign.filter(
    (c) => c.clusterClassification === "NATIVE_RUNTIME_IMPROVEMENT",
  ).length;
  const runtimeRegressed = runtimeCrop.some(
    (c) => c.clusterClassification === "NATIVE_RUNTIME_REGRESSION",
  );
  const modelCropImproved = modelCrop.filter(
    (c) => c.clusterClassification === "FLOAT_MODEL_IMPROVEMENT",
  ).length;
  const modelDesignImproved = modelDesign.filter(
    (c) => c.clusterClassification === "FLOAT_MODEL_IMPROVEMENT",
  ).length;
  const modelRegressed = modelCrop.some(
    (c) => c.clusterClassification === "FLOAT_MODEL_REGRESSION",
  );
  const anyProcessFailure = raws.some((r) => r.processFailure);
  const newFrr = newFrrVsA.length;

  const runtimeDecision =
    !allDeterministic || anyProcessFailure
      ? "RUNTIME_INCONCLUSIVE"
      : runtimeRegressed
        ? "RUNTIME_REGRESSION"
        : runtimeCropImproved > 0 && runtimeDesignImproved > 0 && newFrr === 0
          ? "KEEP_NATIVE_RUNTIME_FOR_FURTHER_EVALUATION"
          : "RUNTIME_NO_EVIDENCE_OF_GAIN";
  const modelDecision =
    !allDeterministic || anyProcessFailure
      ? "FLOAT_MODEL_INCONCLUSIVE"
      : modelRegressed
        ? "FLOAT_MODEL_REGRESSION"
        : modelCropImproved > 0 && modelDesignImproved > 0 && newFrr === 0
          ? "KEEP_FLOAT_MODEL_FOR_FURTHER_EVALUATION"
          : "FLOAT_MODEL_NO_EVIDENCE_OF_GAIN";

  const runtimeGained = runtimeDecision === "KEEP_NATIVE_RUNTIME_FOR_FURTHER_EVALUATION";
  const modelGained = modelDecision === "KEEP_FLOAT_MODEL_FOR_FURTHER_EVALUATION";
  let overall: string;
  if (newFrr > 0) {
    overall = "BLOCK_PRODUCTION_FACING_FOLLOW_UP_NEW_FALSE_RELIABLE_READ";
  } else if (runtimeGained && modelGained) {
    overall = "AUTHORIZE_ENGINE_NEUTRAL_ADAPTER_PLANNING_AND_RETAIN_FLOAT_CANDIDATE";
  } else if (runtimeGained && !modelGained) {
    overall = "AUTHORIZE_ENGINE_NEUTRAL_ADAPTER_PLANNING_PREFER_NATIVE_INTEGER";
  } else if (!runtimeGained && modelGained) {
    overall = "FLOAT_WEIGHTS_NOT_RUNTIME_ARE_THE_USEFUL_CHANGE";
  } else {
    overall = "STOP_TESSERACT_TUNING_ON_THIS_SUBSET_AUTHORIZE_MODERN_RECOGNIZER_PLANNING";
  }

  writeJson(path.join(ROOT, "decision.json"), {
    artifact: "decision",
    experimentId: EXPERIMENT_ID,
    evaluationOnly: true,
    corpusScope: "frozen governed stylized Brand subset only",
    productionChanged: false,
    gates,
    counts: groups.counts,
    runtimeContrast: {
      decision: runtimeDecision,
      improvedCropClusters: runtimeCropImproved,
      improvedDesignClusters: runtimeDesignImproved,
      regression: runtimeRegressed,
      classifications: Object.fromEntries(
        [...new Set(runtimeResults.map((r) => r.classification))].map((c) => [
          c,
          runtimeResults.filter((r) => r.classification === c).length,
        ]),
      ),
    },
    modelContrast: {
      decision: modelDecision,
      improvedCropClusters: modelCropImproved,
      improvedDesignClusters: modelDesignImproved,
      regression: modelRegressed,
      classifications: Object.fromEntries(
        [...new Set(modelResults.map((r) => r.classification))].map((c) => [
          c,
          modelResults.filter((r) => r.classification === c).length,
        ]),
      ),
    },
    bundledStackComparison: {
      arms: ["A", "C"],
      reportedDescriptivelyOnly: true,
      causalClaim: false,
    },
    overallNextStep: overall,
    allDeterministic,
    anyProcessFailure,
    newFalseReliableReadsVersusIncumbent: newFrr,
    falseReliableReadIsPrimaryVeto: true,
    claimsNotMade: [
      "No population accuracy, prevalence, or production-rate claim.",
      "No final engine-selection decision.",
      "No production suitability or Render resource claim.",
      "No universal Tesseract capability ceiling.",
      "No authorization for production replacement or shadow mode.",
    ],
  });

  console.log(
    JSON.stringify(
      {
        runtimeDecision,
        modelDecision,
        overall,
        allDeterministic,
        anyProcessFailure,
        newFalseReliableReads: newFrr,
        runtime: runtimeResults.map((r) => ({ item: r.ocrItemId, class: r.classification })),
        model: modelResults.map((r) => ({ item: r.ocrItemId, class: r.classification })),
        transcripts: perItem.map((row) => ({
          item: row.entry.ocrItemId,
          A: row.armMetrics.A.raw.rawTranscript,
          B: row.armMetrics.B.raw.rawTranscript,
          C: row.armMetrics.C.raw.rawTranscript,
        })),
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
