#!/usr/bin/env node
/**
 * Issue #149 — PP-OCRv6-small ONNX probe, Phase 0 network discovery gates.
 *
 * Executes the plan's §17 Phase 0 steps 1 to 5 and nothing else. Every expected
 * value is compiled in from the plan; none is read from the network and then
 * accepted. Any mismatch exits non-zero so no later phase can run.
 *
 * Step 6 (container build and dry session load), step 7 (full ONNX retrieval and
 * byte verification), step 8 (network disabled) and step 9 (dictionary audit)
 * happen inside the pinned container, driven by the workflow.
 *
 * Downloads no model weights. Reads no corpus and no fixture truth.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const EXPERIMENT_ID = "issue-149-ppocrv6-small-onnx-compatibility-probe";
const ROOT = path.join(process.cwd(), "artifacts", EXPERIMENT_ID);

const MODEL_REPO = "PaddlePaddle/PP-OCRv6_small_rec_onnx";
/** §3.1 — the immutable revision the plan pins. Not negotiable at runtime. */
const EXPECTED_REVISION = "b8f84f0b80c529de40b4fbb3544b84fa7233a513";

/** §3.3 — the exact five-file inventory, with git blob OIDs and byte sizes. */
const EXPECTED_INVENTORY = [
  { path: ".gitattributes", oid: "a6344aac8c09253b3b630fb776ae94478aa0275b", size: 1519 },
  { path: "README.md", oid: "1a37eb559d6575f4cd03c8685fcc96cceba3bbb6", size: 16585 },
  { path: "inference.json", oid: "89267025ba75ceca5c06787979079406a9d92591", size: 208004 },
  { path: "inference.onnx", oid: "666cee731b98bee55376f02690226d60db9a8187", size: 21159378 },
  { path: "inference.yml", oid: "f1887595d177511e6af56fabd0baa25756d33bd8", size: 150579 },
];

const EXPECTED_ONNX_LFS_SHA256 = "5435fd747c9e0efe15a96d0b378d5bd157e9492ed8fd80edf08f30d02fa24634";
const EXPECTED_ONNX_BYTES = 21159378;
const EXPECTED_ONNX_POINTER_SIZE = 133;
const EXPECTED_YML_BYTES = 150579;
const EXPECTED_LICENSE = "apache-2.0";

/**
 * PaddleOCR source pin. §17 names the files whose contents must be confirmed
 * during discovery — `ppocr/data/imaug/rec_img_aug.py` for the normalization
 * formula and the postprocessor for the CTC blank index — but names no commit.
 * This commit is an engineering pin chosen during discovery so the confirmation
 * is reproducible; it is not a value supplied by the plan.
 */
const PADDLEOCR_COMMIT = "2661c7c0ef5c613e8f93c6e93b2e052399f0f854";
const PADDLEOCR_SOURCE_FILES = [
  "ppocr/data/imaug/rec_img_aug.py",
  "ppocr/postprocess/rec_postprocess.py",
  "LICENSE",
];

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const writeJson = (p, v) => writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`);

function fail(gate, reason, detail) {
  console.error(
    JSON.stringify(
      {
        status: "BLOCKED_DISCOVERY",
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

/** Minimal YAML frontmatter reader: only the leading `---` block, keys only. */
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
  mkdirSync(path.join(ROOT, "discovery"), { recursive: true });
  mkdirSync(path.join(ROOT, "vendor"), { recursive: true });
  mkdirSync(path.join(ROOT, "vendor-license"), { recursive: true });

  const verifiedAtUtc = new Date().toISOString();

  // ---- Gate 1: revision re-assertion -----------------------------------
  // The canonical first-gate record is discovery/revision-gate/, written before
  // anything else and preserved unmodified. This is an independent re-assertion
  // performed inside the governed run, recorded separately.
  const info = await getJson(`https://huggingface.co/api/models/${MODEL_REPO}`, "revision");
  if (info.sha !== EXPECTED_REVISION) {
    fail(
      "revision",
      "REVISION_CHANGED",
      `expected ${EXPECTED_REVISION}, observed ${info.sha}. Halt: download nothing, run no inference, do not substitute the new revision, do not update the preregistration.`,
    );
  }

  // ---- Gate 2: exact five-file inventory -------------------------------
  const tree = await getJson(
    `https://huggingface.co/api/models/${MODEL_REPO}/tree/${EXPECTED_REVISION}?recursive=1`,
    "inventory",
  );
  const observed = tree
    .filter((entry) => entry.type === "file")
    .map((entry) => ({
      path: entry.path,
      oid: entry.oid,
      size: entry.size,
      lfs: entry.lfs
        ? { oid: entry.lfs.oid, size: entry.lfs.size, pointerSize: entry.lfs.pointerSize }
        : null,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
  const directories = tree.filter((entry) => entry.type !== "file").map((entry) => entry.path);
  if (directories.length > 0) {
    fail("inventory", "UNEXPECTED_DIRECTORY_ENTRIES", JSON.stringify(directories));
  }
  if (observed.length !== EXPECTED_INVENTORY.length) {
    fail(
      "inventory",
      "FILE_COUNT_MISMATCH",
      `expected ${EXPECTED_INVENTORY.length} files, observed ${observed.length}: ${observed.map((e) => e.path).join(", ")}`,
    );
  }
  for (const expected of EXPECTED_INVENTORY) {
    const actual = observed.find((entry) => entry.path === expected.path);
    if (!actual) fail("inventory", "FILE_MISSING", expected.path);
    if (actual.oid !== expected.oid) {
      fail(
        "inventory",
        "GIT_OID_MISMATCH",
        `${expected.path}: expected ${expected.oid}, observed ${actual.oid}`,
      );
    }
    if (actual.size !== expected.size) {
      fail(
        "inventory",
        "BYTE_SIZE_MISMATCH",
        `${expected.path}: expected ${expected.size}, observed ${actual.size}`,
      );
    }
  }
  // §3.4 — the absence of LICENSE and NOTICE is itself a discovery finding.
  const licenseFilePresent = observed.some((entry) => /^(LICENSE|NOTICE)/i.test(entry.path));

  // ---- Gate 3: Apache-2.0 model-card gate ------------------------------
  const readmeBytes = await getBytes(
    `https://huggingface.co/${MODEL_REPO}/resolve/${EXPECTED_REVISION}/README.md`,
    "license",
  );
  const declaredLicense = frontmatterLicense(readmeBytes.toString("utf8"));
  if (declaredLicense !== EXPECTED_LICENSE) {
    fail(
      "license",
      "BLOCKED_MODEL_LICENSE",
      `README frontmatter license is ${JSON.stringify(declaredLicense)}, expected ${JSON.stringify(EXPECTED_LICENSE)} at ${EXPECTED_REVISION}`,
    );
  }
  const apiLicense = (info.cardData || {}).license || null;
  if (apiLicense !== EXPECTED_LICENSE) {
    fail(
      "license",
      "BLOCKED_MODEL_LICENSE",
      `API cardData.license is ${JSON.stringify(apiLicense)}`,
    );
  }
  writeFileSync(path.join(ROOT, "vendor", "model-card-README.md"), readmeBytes);

  // ---- Gate 4: inference.yml hash, size, preprocessing, dictionary -----
  const ymlBytes = await getBytes(
    `https://huggingface.co/${MODEL_REPO}/resolve/${EXPECTED_REVISION}/inference.yml`,
    "config",
  );
  if (ymlBytes.length !== EXPECTED_YML_BYTES) {
    fail(
      "config",
      "BYTE_SIZE_MISMATCH",
      `inference.yml expected ${EXPECTED_YML_BYTES}, observed ${ymlBytes.length}`,
    );
  }
  const ymlSha256 = sha256(ymlBytes);
  writeFileSync(path.join(ROOT, "vendor", "inference.yml"), ymlBytes);
  // The authoritative dictionary parse runs in the container with the pinned
  // PyYAML, because a hand-rolled parse of 18k quoted scalars would not be
  // trustworthy. This script only records the bytes and their identity.

  // ---- Gate 5: ONNX LFS pointer metadata, no full download -------------
  const onnxEntry = observed.find((entry) => entry.path === "inference.onnx");
  if (!onnxEntry.lfs) fail("onnx-pointer", "NOT_AN_LFS_FILE", "inference.onnx has no lfs metadata");
  if (onnxEntry.lfs.oid !== EXPECTED_ONNX_LFS_SHA256) {
    fail(
      "onnx-pointer",
      "LFS_OID_MISMATCH",
      `expected ${EXPECTED_ONNX_LFS_SHA256}, observed ${onnxEntry.lfs.oid}`,
    );
  }
  if (onnxEntry.lfs.size !== EXPECTED_ONNX_BYTES) {
    fail(
      "onnx-pointer",
      "LFS_SIZE_MISMATCH",
      `expected ${EXPECTED_ONNX_BYTES}, observed ${onnxEntry.lfs.size}`,
    );
  }
  // `/raw/` serves the pointer text itself for an LFS file, so the pointer can be
  // retained verbatim without pulling 21 MB.
  const pointerBytes = await getBytes(
    `https://huggingface.co/${MODEL_REPO}/raw/${EXPECTED_REVISION}/inference.onnx`,
    "onnx-pointer",
  );
  const pointerText = pointerBytes.toString("utf8");
  if (pointerBytes.length !== EXPECTED_ONNX_POINTER_SIZE) {
    fail(
      "onnx-pointer",
      "POINTER_SIZE_MISMATCH",
      `expected ${EXPECTED_ONNX_POINTER_SIZE}, observed ${pointerBytes.length}`,
    );
  }
  if (!pointerText.includes(`oid sha256:${EXPECTED_ONNX_LFS_SHA256}`)) {
    fail("onnx-pointer", "POINTER_OID_MISMATCH", pointerText);
  }
  if (!pointerText.includes(`size ${EXPECTED_ONNX_BYTES}`)) {
    fail("onnx-pointer", "POINTER_SIZE_FIELD_MISMATCH", pointerText);
  }
  writeFileSync(path.join(ROOT, "vendor-license", "inference.onnx.lfs-pointer.txt"), pointerBytes);

  // ---- Upstream source confirmation and Apache-2.0 text ----------------
  const sourceRecords = [];
  for (const file of PADDLEOCR_SOURCE_FILES) {
    const bytes = await getBytes(
      `https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/${PADDLEOCR_COMMIT}/${file}`,
      "code-provenance",
    );
    sourceRecords.push({ path: file, byteSize: bytes.length, sha256: sha256(bytes) });
    if (file === "LICENSE") {
      writeFileSync(path.join(ROOT, "vendor-license", "LICENSE-Apache-2.0.txt"), bytes);
    }
  }
  // Does PaddleOCR carry a NOTICE file at the pinned commit? Recorded either way.
  const noticeResponse = await fetch(
    `https://raw.githubusercontent.com/PaddlePaddle/PaddleOCR/${PADDLEOCR_COMMIT}/NOTICE`,
    { redirect: "follow" },
  );
  const paddleNoticePresent = noticeResponse.ok;
  if (paddleNoticePresent) {
    writeFileSync(
      path.join(ROOT, "vendor-license", "NOTICE-PaddleOCR.txt"),
      Buffer.from(await noticeResponse.arrayBuffer()),
    );
  }

  // ---- Artifacts -------------------------------------------------------
  writeJson(path.join(ROOT, "discovery", "revision-recheck.json"), {
    artifact: "revision-recheck",
    experimentId: EXPERIMENT_ID,
    purpose:
      "Independent re-assertion of the revision gate inside the governed §17 run. The canonical first-gate record is discovery/revision-gate/revision-gate-verification.json, written earlier and preserved unmodified.",
    verifiedAtUtc,
    repository: MODEL_REPO,
    expectedRevision: EXPECTED_REVISION,
    observedRevision: info.sha,
    gateResult: "PASS",
    lastModified: info.lastModified,
    createdAt: info.createdAt,
    gated: info.gated,
    disabled: Boolean(info.disabled),
    private: info.private,
    pipelineTag: info.pipeline_tag,
    libraryName: info.library_name,
    usedStorage: info.usedStorage,
    downloadPerformed: false,
    inferencePerformed: false,
  });

  writeJson(path.join(ROOT, "file-inventory.json"), {
    artifact: "file-inventory",
    experimentId: EXPERIMENT_ID,
    verifiedAtUtc,
    repository: MODEL_REPO,
    revision: EXPECTED_REVISION,
    gateResult: "PASS",
    expectedFileCount: EXPECTED_INVENTORY.length,
    observedFileCount: observed.length,
    exactInventoryMatch: true,
    additionalFilesPresent: false,
    filesMissing: false,
    files: observed,
    licenseOrNoticeFileInModelRepository: licenseFilePresent,
    licenseFileAbsenceNote:
      "The model repository carries no LICENSE and no NOTICE file at this revision. Attribution therefore references the PaddleOCR main repository Apache-2.0 licence, retained at vendor-license/LICENSE-Apache-2.0.txt.",
    inferenceJsonRole:
      "PaddlePaddle PIR static graph in JSON form. Not an ONNX Runtime config and not a model. Its git blob OID is recorded here; the file is neither committed nor loaded.",
  });

  writeJson(path.join(ROOT, "config-provenance.json"), {
    artifact: "config-provenance",
    experimentId: EXPERIMENT_ID,
    verifiedAtUtc,
    file: "inference.yml",
    repository: MODEL_REPO,
    revision: EXPECTED_REVISION,
    gitBlobOid: "f1887595d177511e6af56fabd0baa25756d33bd8",
    expectedByteSize: EXPECTED_YML_BYTES,
    observedByteSize: ymlBytes.length,
    byteSizeGate: "PASS",
    sha256: ymlSha256,
    committedCopy: "vendor/inference.yml",
    committedVerbatim: true,
    prettierIgnored: true,
    prettierIgnoreReason:
      "Committed verbatim from the pinned revision and hashed; reformatting would break its recorded identity.",
    roleForInference:
      "Not loaded by ONNX Runtime. Supplies the preprocessing shape and the PostProcess.character_dict used to build the token-to-character map.",
    dictionaryParsedIn:
      "the pinned container, with pinned PyYAML — see dictionary-audit.json. Not parsed here, because a hand-rolled parse of ~18k quoted scalars would not be trustworthy.",
  });

  writeJson(path.join(ROOT, "code-provenance.json"), {
    artifact: "code-provenance",
    experimentId: EXPERIMENT_ID,
    verifiedAtUtc,
    codeRepository: "https://github.com/PaddlePaddle/PaddleOCR",
    codeCommit: PADDLEOCR_COMMIT,
    commitPinProvenance:
      "Engineering pin chosen during discovery so the confirmation is reproducible. §17 names the files to confirm but names no commit, so this commit is not a value supplied by the plan.",
    floatingMainUsed: false,
    codeLicense: "Apache-2.0",
    codeLicenseEvidence:
      "LICENSE at the pinned commit, retained at vendor-license/LICENSE-Apache-2.0.txt",
    noticeFileInPaddleOcrRepository: paddleNoticePresent,
    inspectedSources: sourceRecords,
    sourcesCommitted: false,
    sourcesCommittedNote:
      "Only the URL, byte size and SHA-256 of each inspected file are recorded, so the confirmation is reproducible without vendoring 88 kB of upstream Python into this repository.",
    purpose:
      "Confirms the inference-time preprocessing formula and the CTC blank index, which the plan marks as INFERENCE-level and requires discovery to confirm from these files.",
  });

  console.log(
    JSON.stringify(
      {
        status: "DISCOVERY_GATES_1_TO_5_PASS",
        revision: info.sha,
        inventory: observed.map((entry) => `${entry.path}:${entry.size}`),
        license: declaredLicense,
        licenseOrNoticeFileInModelRepository: licenseFilePresent,
        inferenceYmlSha256: ymlSha256,
        inferenceYmlBytes: ymlBytes.length,
        onnxLfsSha256: onnxEntry.lfs.oid,
        onnxBytes: onnxEntry.lfs.size,
        onnxPointerBytes: pointerBytes.length,
        paddleOcrCommit: PADDLEOCR_COMMIT,
        paddleNoticePresent,
        downloadPerformed: false,
      },
      null,
      2,
    ),
  );
}

main().catch((error) =>
  fail("unexpected", "UNEXPECTED_ERROR", error instanceof Error ? error.stack : String(error)),
);
