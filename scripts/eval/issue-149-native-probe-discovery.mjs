#!/usr/bin/env node
/**
 * Issue #149 — native Tesseract probe, Attempt 2 DISCOVERY mode.
 *
 * Environment discovery only. This script performs NO OCR: it never invokes
 * `tesseract` on any image, never touches the governed corpus, and never reads
 * Brand truth. It pulls the already-pinned base image and asks apt which
 * package versions that exact base offers.
 *
 * Package names are discovered from `apt-cache depends`, never guessed.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const EXPERIMENT_ID = "issue-149-native-tesseract-float-compatibility";
const OUT_DIR = path.join(process.cwd(), "artifacts", EXPERIMENT_ID, "attempt-2");
const BASE_IMAGE = "node:22-bookworm-slim";
const BASE_MANIFEST_LIST_DIGEST =
  "sha256:6c74791e557ce11fc957704f6d4fe134a7bc8d6f5ca4403205b2966bd488f6b3";
const BASE_REF = `${BASE_IMAGE}@${BASE_MANIFEST_LIST_DIGEST}`;
const PLATFORM = "linux/amd64";

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  }).trim();
}

function tryRun(command, args, options = {}) {
  try {
    return run(command, args, options);
  } catch (error) {
    return `ERROR: ${error instanceof Error ? error.message : String(error)}`;
  }
}

function readFileOrNull(filePath) {
  try {
    return readFileSync(filePath, "utf8").trim();
  } catch {
    return null;
  }
}

// Discovery runs entirely inside the pinned base. It resolves the libtesseract
// and Leptonica package NAMES from the dependency graph rather than assuming
// them, then reports the candidate version apt would install for each.
const IN_CONTAINER = `
set -eu
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq >/dev/null 2>&1

TESS_PKG=tesseract-ocr
LIBTESS_PKG=$(apt-cache depends "$TESS_PKG" | awk '/Depends:/ {print $2}' | grep -E '^libtesseract' | head -1 || true)
LEPT_PKG=""
if [ -n "$LIBTESS_PKG" ]; then
  LEPT_PKG=$(apt-cache depends "$LIBTESS_PKG" | awk '/Depends:/ {print $2}' | grep -E '^liblept' | head -1 || true)
fi

candidate() { apt-cache policy "$1" 2>/dev/null | awk '/Candidate:/ {print $2}' | head -1; }

echo "KEY tesseract_package=$TESS_PKG"
echo "KEY tesseract_candidate=$(candidate "$TESS_PKG")"
echo "KEY libtesseract_package=$LIBTESS_PKG"
echo "KEY libtesseract_candidate=$([ -n "$LIBTESS_PKG" ] && candidate "$LIBTESS_PKG" || echo NONE)"
echo "KEY leptonica_package=$LEPT_PKG"
echo "KEY leptonica_candidate=$([ -n "$LEPT_PKG" ] && candidate "$LEPT_PKG" || echo NONE)"
echo "KEY time_package=time"
echo "KEY time_candidate=$(candidate time)"
echo "KEY usr_bin_time_present=$([ -x /usr/bin/time ] && echo yes || echo no)"
echo "KEY dpkg_architecture=$(dpkg --print-architecture)"
echo "KEY uname_machine=$(uname -m)"
echo "KEY debian_version=$(cat /etc/debian_version 2>/dev/null || echo unknown)"

echo "BLOCK policy_tesseract"
apt-cache policy "$TESS_PKG" || true
echo "BLOCK depends_tesseract"
apt-cache depends "$TESS_PKG" || true
echo "BLOCK policy_libtesseract"
[ -n "$LIBTESS_PKG" ] && apt-cache policy "$LIBTESS_PKG" || echo "no libtesseract dependency discovered"
echo "BLOCK policy_leptonica"
[ -n "$LEPT_PKG" ] && apt-cache policy "$LEPT_PKG" || echo "no leptonica dependency discovered"
echo "BLOCK policy_time"
apt-cache policy time || true
echo "BLOCK os_release"
cat /etc/os-release || true
echo "END"
`;

function parseContainerOutput(text) {
  const keys = {};
  const blocks = {};
  let currentBlock = null;
  const buffer = [];
  const flush = () => {
    if (currentBlock) blocks[currentBlock] = buffer.join("\n").trim();
    buffer.length = 0;
  };
  for (const line of text.split("\n")) {
    if (line.startsWith("KEY ")) {
      const [name, ...rest] = line.slice(4).split("=");
      keys[name.trim()] = rest.join("=").trim();
      continue;
    }
    if (line.startsWith("BLOCK ")) {
      flush();
      currentBlock = line.slice(6).trim();
      continue;
    }
    if (line.trim() === "END") {
      flush();
      currentBlock = null;
      continue;
    }
    if (currentBlock) buffer.push(line);
  }
  flush();
  return { keys, blocks };
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const dockerVersion = tryRun("docker", ["version", "--format", "{{json .}}"]);
  const runnerArch = run("uname", ["-m"]);
  const cpuModel =
    (readFileOrNull("/proc/cpuinfo") || "")
      .split("\n")
      .find((line) => line.startsWith("model name")) ?? null;

  // Pull the exact pinned base for the declared platform. Nothing else is pulled.
  const pullOutput = tryRun("docker", ["pull", "--platform", PLATFORM, BASE_REF]);
  const imageInspect = tryRun("docker", [
    "image",
    "inspect",
    BASE_REF,
    "--format",
    "{{.Id}}|{{.Architecture}}|{{.Os}}|{{index .RepoDigests 0}}",
  ]);

  const containerRaw = tryRun("docker", [
    "run",
    "--rm",
    "--platform",
    PLATFORM,
    BASE_REF,
    "bash",
    "-lc",
    IN_CONTAINER,
  ]);
  const { keys, blocks } = parseContainerOutput(containerRaw);

  const [imageId, imageArch, imageOs, repoDigest] = imageInspect.includes("|")
    ? imageInspect.split("|")
    : [null, null, null, null];

  const pinsComplete = Boolean(
    keys.tesseract_candidate &&
    keys.tesseract_candidate !== "NONE" &&
    keys.libtesseract_package &&
    keys.libtesseract_candidate &&
    keys.libtesseract_candidate !== "NONE" &&
    keys.leptonica_package &&
    keys.leptonica_candidate &&
    keys.leptonica_candidate !== "NONE",
  );

  const discovery = {
    artifact: "discovery",
    experimentId: EXPERIMENT_ID,
    attempt: 2,
    mode: "discover",
    ocrInvoked: false,
    corpusAccessed: false,
    brandTruthInspected: false,
    collectedAtUtc: new Date().toISOString().replace(/\.\d+Z$/, "Z"),
    executionHost: {
      platform: "github-hosted runner",
      runnerOs: process.env.RUNNER_OS ?? null,
      runnerArch: process.env.RUNNER_ARCH ?? null,
      runnerName: process.env.RUNNER_NAME ?? null,
      imageOs: process.env.ImageOS ?? null,
      imageVersion: process.env.ImageVersion ?? null,
      githubRunId: process.env.GITHUB_RUN_ID ?? null,
      githubWorkflowRef: process.env.GITHUB_WORKFLOW_REF ?? null,
      unameMachine: runnerArch,
      unameAll: tryRun("uname", ["-a"]),
      osRelease: readFileOrNull("/etc/os-release"),
      kernel: tryRun("uname", ["-r"]),
      nproc: tryRun("nproc", []),
      cpuModel,
      memoryBytes: tryRun("sh", ["-c", "free -b | awk '/Mem:/ {print $2}'"]),
      nativeAmd64: runnerArch === "x86_64",
      emulationUsed: runnerArch !== "x86_64",
    },
    docker: { versionJson: dockerVersion },
    baseImage: {
      reference: BASE_REF,
      image: BASE_IMAGE,
      manifestListDigest: BASE_MANIFEST_LIST_DIGEST,
      platform: PLATFORM,
      pullOutputTail: pullOutput.split("\n").slice(-3).join("\n"),
      imageId,
      imageArchitecture: imageArch,
      imageOs,
      repoDigest,
    },
    packages: {
      discoveredNotGuessed: true,
      tesseract: { package: keys.tesseract_package, candidate: keys.tesseract_candidate },
      libtesseract: { package: keys.libtesseract_package, candidate: keys.libtesseract_candidate },
      leptonica: { package: keys.leptonica_package, candidate: keys.leptonica_candidate },
      time: {
        package: keys.time_package,
        candidate: keys.time_candidate,
        usrBinTimePresentInBase: keys.usr_bin_time_present,
      },
    },
    containerArchitecture: {
      dpkgArchitecture: keys.dpkg_architecture,
      unameMachine: keys.uname_machine,
      debianVersion: keys.debian_version,
    },
    rawAptOutput: blocks,
    pinsComplete,
    nextStep: pinsComplete
      ? "Update the research Dockerfile with these exact package names and versions, write and hash preregistration-runtime-addendum.md, commit and push, then dispatch mode=execute."
      : "Package discovery is incomplete. Do not proceed to execute.",
  };

  const outputPath = path.join(OUT_DIR, "discovery.json");
  writeFileSync(outputPath, `${JSON.stringify(discovery, null, 2)}\n`);
  console.log(
    JSON.stringify({ written: outputPath, pinsComplete, packages: discovery.packages }, null, 2),
  );
  if (!pinsComplete) process.exitCode = 1;
}

main();
