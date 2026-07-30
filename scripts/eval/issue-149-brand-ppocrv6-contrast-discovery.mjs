#!/usr/bin/env node
/**
 * Issue #149 — PP-OCRv6-small ONNX versus Tesseract Brand contrast: discovery.
 *
 * Verifies every frozen identity before any network retrieval, then verifies the
 * pinned model revision, hashes, byte sizes and licence. Runs NO Brand inference
 * and never calls session.run on a crop.
 *
 * The upstream default-branch head is recorded as an OBSERVATION. A changed head
 * does not block: an immutable approved revision is not invalidated by a later
 * upstream commit. Only a failure of the pinned-revision checks halts.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const EXPERIMENT_ID = "issue-149-brand-ppocrv6-small-onnx-contrast";
const ROOT = path.join(process.cwd(), "artifacts", EXPERIMENT_ID);
const DISCOVERY = path.join(ROOT, "discovery");

const MODEL_REPO = "PaddlePaddle/PP-OCRv6_small_rec_onnx";
const PINNED_REVISION = "b8f84f0b80c529de40b4fbb3544b84fa7233a513";
const EXPECTED_ONNX_SHA256 = "5435fd747c9e0efe15a96d0b378d5bd157e9492ed8fd80edf08f30d02fa24634";
const EXPECTED_ONNX_BYTES = 21159378;
const EXPECTED_CONFIG_SHA256 = "ab078671bb49f06228eadccd34f1bb501e157f7a047095ffb943ba81512c77d1";
const EXPECTED_CONFIG_BYTES = 150579;
const EXPECTED_LICENSE = "apache-2.0";

const FROZEN_PREREGISTRATION_SHA256 =
  "3971fea1fd2a9cac04d698892fdeacf8458ca861dab2acfbdc09ab8791921a37";
const PLANNING_HEAD = "2ccfe22771a9f5f071099f0ec4e8641b3089ea5c";

/** Result artifacts that must NOT already exist when discovery starts. */
const RESULT_ARTIFACTS = [
  "raw-output-manifest.json",
  "per-item-results.json",
  "pixel-set-results.json",
  "case-results.json",
  "crop-cluster-results.json",
  "design-cluster-results.json",
  "determinism-report.json",
  "score-ordering-risk.json",
  "output-risk-report.json",
  "visual-support-review.json",
  "resource-report.json",
  "decision.json",
  "artifact-manifest.json",
  "truth-isolation-report.json",
  "arm-a-recomputation-crosscheck.json",
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const writeJson = (p, v) => writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);

function fail(gate, reason, detail) {
  console.error(
    JSON.stringify(
      {
        status: "DISCOVERY_BLOCKED",
        experimentId: EXPERIMENT_ID,
        gate,
        reason,
        detail,
        downloadPerformed: false,
        inferenceMustNotRun: true,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

async function getJson(url, gate) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) fail(gate, "HTTP_ERROR", `${response.status} ${response.statusText} ${url}`);
  return response.json();
}

async function getBytes(url, gate) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) fail(gate, "HTTP_ERROR", `${response.status} ${response.statusText} ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function frontmatterLicense(markdown) {
  const text = markdown.replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---", 4);
  if (end === -1) return null;
  for (const line of text.slice(4, end).split("\n")) {
    const match = /^license:\s*(\S+)\s*$/.exec(line);
    if (match) return match[1];
  }
  return null;
}

async function main() {
  mkdirSync(DISCOVERY, { recursive: true });
  const verifiedAtUtc = new Date().toISOString();

  // ---- frozen identity gates, all BEFORE any network access ------------
  const preregistrationSha = sha256(readFileSync(path.join(ROOT, "preregistration.md")));
  if (preregistrationSha !== FROZEN_PREREGISTRATION_SHA256) {
    fail("preregistration", "PREREGISTRATION_ALTERED", {
      expected: FROZEN_PREREGISTRATION_SHA256,
      observed: preregistrationSha,
    });
  }
  const recorded = readFileSync(path.join(ROOT, "preregistration.sha256"), "utf8").trim();
  if (!recorded.startsWith(FROZEN_PREREGISTRATION_SHA256)) {
    fail("preregistration", "PREREGISTRATION_SHA_FILE_MISMATCH", recorded);
  }

  const pixels = readJson(path.join(ROOT, "input-pixel-manifest.json"));
  if (pixels.items.length !== 6) fail("inputs", "INPUT_COUNT_MISMATCH", pixels.items.length);
  for (const item of pixels.items) {
    const bytes = readFileSync(path.join(process.cwd(), item.inferenceInputPath));
    if (sha256(bytes) !== item.sourcePngSha256) {
      fail("inputs", "STAGED_PNG_SHA256_MISMATCH", item.inferenceInputPath);
    }
    if (bytes.length !== item.sourcePngByteSize) {
      fail("inputs", "STAGED_PNG_BYTE_SIZE_MISMATCH", item.inferenceInputPath);
    }
  }

  const carryforward = readJson(path.join(ROOT, "arm-a-carryforward.json"));
  if (carryforward.carriedFileCount !== 12) {
    fail("arm-a", "ARM_A_FILE_COUNT_MISMATCH", carryforward.carriedFileCount);
  }
  for (const entry of carryforward.carriedFiles) {
    const bytes = readFileSync(path.join(ROOT, "arm-a-frozen", entry.file));
    if (sha256(bytes) !== entry.pr214RecordedSha256) {
      fail("arm-a", "ARM_A_SHA256_MISMATCH", entry.file);
    }
  }

  const alreadyPresent = RESULT_ARTIFACTS.filter((f) => existsSync(path.join(ROOT, f)));
  if (alreadyPresent.length > 0) {
    fail("no-prior-results", "RESULT_ARTIFACTS_ALREADY_EXIST", alreadyPresent);
  }

  // ---- pinned revision, retrievability and identity --------------------
  const info = await getJson(`https://huggingface.co/api/models/${MODEL_REPO}`, "revision");
  const upstreamHead = info.sha;
  const upstreamHeadChanged = upstreamHead !== PINNED_REVISION;

  const tree = await getJson(
    `https://huggingface.co/api/models/${MODEL_REPO}/tree/${PINNED_REVISION}?recursive=1`,
    "revision",
  );
  const files = tree.filter((entry) => entry.type === "file");
  const onnx = files.find((entry) => entry.path === "inference.onnx");
  const config = files.find((entry) => entry.path === "inference.yml");
  if (!onnx || !config) {
    fail(
      "revision",
      "PINNED_REVISION_FILE_MISSING",
      files.map((f) => f.path),
    );
  }
  if (!onnx.lfs || onnx.lfs.oid !== EXPECTED_ONNX_SHA256) {
    fail("onnx", "ONNX_SHA256_MISMATCH", {
      expected: EXPECTED_ONNX_SHA256,
      observed: onnx.lfs?.oid,
    });
  }
  if (onnx.lfs.size !== EXPECTED_ONNX_BYTES) {
    fail("onnx", "ONNX_BYTE_SIZE_MISMATCH", {
      expected: EXPECTED_ONNX_BYTES,
      observed: onnx.lfs.size,
    });
  }
  if (config.size !== EXPECTED_CONFIG_BYTES) {
    fail("config", "CONFIG_BYTE_SIZE_MISMATCH", {
      expected: EXPECTED_CONFIG_BYTES,
      observed: config.size,
    });
  }

  const configBytes = await getBytes(
    `https://huggingface.co/${MODEL_REPO}/resolve/${PINNED_REVISION}/inference.yml`,
    "config",
  );
  const configSha = sha256(configBytes);
  if (configSha !== EXPECTED_CONFIG_SHA256 || configBytes.length !== EXPECTED_CONFIG_BYTES) {
    fail("config", "CONFIG_INTEGRITY_MISMATCH", {
      expected: { sha256: EXPECTED_CONFIG_SHA256, bytes: EXPECTED_CONFIG_BYTES },
      observed: { sha256: configSha, bytes: configBytes.length },
    });
  }
  mkdirSync(path.join(ROOT, "vendor"), { recursive: true });
  writeFileSync(path.join(ROOT, "vendor", "inference.yml"), configBytes);

  const readmeBytes = await getBytes(
    `https://huggingface.co/${MODEL_REPO}/resolve/${PINNED_REVISION}/README.md`,
    "license",
  );
  const declaredLicense = frontmatterLicense(readmeBytes.toString("utf8"));
  const apiLicense = (info.cardData || {}).license || null;
  if (declaredLicense !== EXPECTED_LICENSE) {
    fail("license", "LICENSE_NOT_APACHE_TWO_AT_PINNED_REVISION", declaredLicense);
  }

  writeJson(path.join(ROOT, "upstream-head-observation.json"), {
    artifact: "upstream-head-observation",
    experimentId: EXPERIMENT_ID,
    observedAtUtc: verifiedAtUtc,
    repository: MODEL_REPO,
    pinnedRevision: PINNED_REVISION,
    upstreamDefaultBranchHead: upstreamHead,
    upstreamHeadChangedSincePinning: upstreamHeadChanged,
    treatedAsBlocker: false,
    rule: "A later upstream commit does not invalidate an immutable approved revision. The experiment proceeds with the pinned revision provided its bytes, sizes, configuration and licence still verify. Only a failure of those checks halts.",
    pinnedRevisionStillRetrievable: true,
    lastModifiedAtPinning: "2026-06-18T11:08:57.000Z",
    lastModifiedObservedNow: info.lastModified,
  });

  writeJson(path.join(DISCOVERY, "frozen-identity-verification.json"), {
    artifact: "frozen-identity-verification",
    experimentId: EXPERIMENT_ID,
    verifiedAtUtc,
    verifiedBeforeAnyNetworkRetrieval: true,
    planningHeadExpectedAncestor: PLANNING_HEAD,
    preregistrationSha256: preregistrationSha,
    preregistrationMatchesFrozen: true,
    stagedInputCount: pixels.items.length,
    stagedInputsVerified: true,
    armACarriedFileCount: carryforward.carriedFileCount,
    armACarriedFilesVerified: true,
    priorResultArtifactsPresent: false,
  });

  writeJson(path.join(DISCOVERY, "model-identity-verification.json"), {
    artifact: "model-identity-verification",
    experimentId: EXPERIMENT_ID,
    verifiedAtUtc,
    repository: MODEL_REPO,
    pinnedRevision: PINNED_REVISION,
    pinnedRevisionRetrievable: true,
    onnx: {
      expectedSha256: EXPECTED_ONNX_SHA256,
      observedLfsOid: onnx.lfs.oid,
      expectedByteSize: EXPECTED_ONNX_BYTES,
      observedByteSize: onnx.lfs.size,
      matches: true,
    },
    config: {
      expectedSha256: EXPECTED_CONFIG_SHA256,
      observedSha256: configSha,
      expectedByteSize: EXPECTED_CONFIG_BYTES,
      observedByteSize: configBytes.length,
      matches: true,
      committedCopy: "vendor/inference.yml",
    },
    license: {
      expected: EXPECTED_LICENSE,
      readmeFrontmatter: declaredLicense,
      apiCardData: apiLicense,
      tiedToArtifactAtPinnedRevision: true,
    },
    fileInventoryAtPinnedRevision: files.map((f) => ({ path: f.path, size: f.size })),
    brandInferencePerformed: false,
  });

  console.log(
    JSON.stringify(
      {
        status: "DISCOVERY_GATES_PASS",
        preregistrationSha256: preregistrationSha,
        stagedInputsVerified: 6,
        armACarriedFilesVerified: 12,
        priorResultArtifacts: 0,
        pinnedRevision: PINNED_REVISION,
        upstreamDefaultBranchHead: upstreamHead,
        upstreamHeadChangedSincePinning: upstreamHeadChanged,
        upstreamHeadTreatedAsBlocker: false,
        onnxSha256Verified: true,
        configSha256Verified: true,
        license: declaredLicense,
        brandInferencePerformed: false,
      },
      null,
      2,
    ),
  );
}

main().catch((error) =>
  fail("unexpected", "UNEXPECTED_ERROR", error instanceof Error ? error.stack : String(error)),
);
