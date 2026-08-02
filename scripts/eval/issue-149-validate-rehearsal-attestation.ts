import { readFileSync } from "node:fs";

type AttestationEntry = {
  path: string;
  type: "directory" | "file";
  mode: string;
  uid: number;
  gid: number;
  length: number | null;
  sha256: string | null;
};

type BuildReport = {
  status: string;
  runtimeUid: unknown;
  runtimeGid: unknown;
  restrictiveUmask: unknown;
  sourceAttestation: unknown;
  ocrRun: unknown;
  acquisitionApiInvoked: unknown;
  governedCorpusUsed: unknown;
};

type SourcePreManifest = {
  entries: Array<{
    path: string;
    type: "directory" | "file";
    mode: string;
    uid: number;
    gid: number;
    length: number | null;
    digest: string | null;
  }>;
};

const REQUIRED_PATHS = [
  "raw",
  "raw/primary",
  "raw/primary/item-9001",
  "planted-unreadable-0700/raw/primary/item-9001",
  "planted-unreadable-0700/raw/primary/item-9001/partial.txt",
] as const;
const PARTIAL_PATH = "planted-unreadable-0700/raw/primary/item-9001/partial.txt";
const PARTIAL_SHA256 = "7ee0e7f63b9b65e302add82986c18196ecb8da0121575e4733219572eeac2712";

export function validateRehearsalBuildReport(
  report: BuildReport,
  expectedUid: number,
  expectedGid: number,
): AttestationEntry[] {
  const fail = (code: string): never => {
    throw new Error(code);
  };
  if (report.status !== "REHEARSAL_EVIDENCE_BUILT") fail("REHEARSAL_BUILD_STATUS_INVALID");
  if (report.runtimeUid !== expectedUid) fail("REHEARSAL_RUNTIME_UID_MISMATCH");
  if (report.runtimeGid !== expectedGid) fail("REHEARSAL_RUNTIME_GID_MISMATCH");
  if (report.restrictiveUmask !== "077") fail("REHEARSAL_RESTRICTIVE_UMASK_MISMATCH");
  if (report.ocrRun !== false) fail("REHEARSAL_OCR_FLAG_INVALID");
  if (report.acquisitionApiInvoked !== false) fail("REHEARSAL_ACQUISITION_FLAG_INVALID");
  if (report.governedCorpusUsed !== false) fail("REHEARSAL_GOVERNED_CORPUS_FLAG_INVALID");
  if (!Array.isArray(report.sourceAttestation)) fail("REHEARSAL_SOURCE_ATTESTATION_MISSING");

  const entries = report.sourceAttestation as AttestationEntry[];
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  for (const required of REQUIRED_PATHS) {
    if (!byPath.has(required)) fail(`REHEARSAL_SOURCE_ATTESTATION_PATH_MISSING:${required}`);
  }
  for (const entry of entries) {
    if (!REQUIRED_PATHS.includes(entry.path as (typeof REQUIRED_PATHS)[number])) {
      fail(`REHEARSAL_SOURCE_ATTESTATION_UNEXPECTED_PATH:${entry.path}`);
    }
    if (entry.type !== "directory" && entry.type !== "file") {
      fail(`REHEARSAL_SOURCE_ATTESTATION_TYPE_INVALID:${entry.path}`);
    }
    if (!/^[0-7]{4}$/.test(entry.mode)) {
      fail(`REHEARSAL_SOURCE_ATTESTATION_MODE_INVALID:${entry.path}`);
    }
    if (entry.uid !== expectedUid || entry.gid !== expectedGid) {
      fail(`REHEARSAL_SOURCE_ATTESTATION_OWNER_MISMATCH:${entry.path}`);
    }
    if (entry.type === "directory" && (entry.length !== null || entry.sha256 !== null)) {
      fail(`REHEARSAL_SOURCE_ATTESTATION_DIRECTORY_BYTES_PRESENT:${entry.path}`);
    }
    if (
      entry.type === "file" &&
      (entry.length === null ||
        !Number.isInteger(entry.length) ||
        entry.length < 0 ||
        !/^[0-9a-f]{64}$/.test(String(entry.sha256)))
    ) {
      fail(`REHEARSAL_SOURCE_ATTESTATION_FILE_BYTES_INVALID:${entry.path}`);
    }
  }

  const raw = byPath.get("raw");
  const plantedItem = byPath.get("planted-unreadable-0700/raw/primary/item-9001");
  const partial = byPath.get(PARTIAL_PATH);
  if (raw?.type !== "directory" || raw.mode !== "0700") fail("REHEARSAL_RAW_MODE_MISMATCH");
  if (plantedItem?.type !== "directory" || plantedItem.mode !== "0700") {
    fail("REHEARSAL_PLANTED_ITEM_MODE_MISMATCH");
  }
  if (partial?.type !== "file" || partial.mode !== "0600") {
    fail("REHEARSAL_PLANTED_PARTIAL_MODE_MISMATCH");
  }
  if (partial === undefined || partial.length !== 10 || partial.sha256 !== PARTIAL_SHA256) {
    fail("REHEARSAL_PLANTED_PARTIAL_DIGEST_MISMATCH");
  }
  return entries;
}

export function compareAttestationToSourcePreManifest(
  attestation: AttestationEntry[],
  sourcePreManifest: SourcePreManifest,
): void {
  const source = new Map(sourcePreManifest.entries.map((entry) => [entry.path, entry]));
  for (const entry of attestation) {
    const actual = source.get(entry.path);
    if (actual === undefined) throw new Error(`REHEARSAL_SOURCE_PRE_PATH_MISSING:${entry.path}`);
    if (actual.type !== entry.type)
      throw new Error(`REHEARSAL_SOURCE_PRE_TYPE_MISMATCH:${entry.path}`);
    if (actual.mode !== entry.mode)
      throw new Error(`REHEARSAL_SOURCE_PRE_MODE_MISMATCH:${entry.path}`);
    if (actual.uid !== entry.uid || actual.gid !== entry.gid) {
      throw new Error(`REHEARSAL_SOURCE_PRE_OWNER_MISMATCH:${entry.path}`);
    }
    if (actual.length !== entry.length) {
      throw new Error(`REHEARSAL_SOURCE_PRE_LENGTH_MISMATCH:${entry.path}`);
    }
    if (actual.digest !== entry.sha256) {
      throw new Error(`REHEARSAL_SOURCE_PRE_DIGEST_MISMATCH:${entry.path}`);
    }
  }
}

const arg = (name: string): string | null => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
};

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

if (process.argv[1]?.includes("issue-149-validate-rehearsal-attestation")) {
  const buildReport = arg("build-report");
  const expectedUid = Number(arg("runtime-uid"));
  const expectedGid = Number(arg("runtime-gid"));
  if (!buildReport || !Number.isInteger(expectedUid) || !Number.isInteger(expectedGid)) {
    throw new Error("REHEARSAL_ATTESTATION_USAGE");
  }
  const attestation = validateRehearsalBuildReport(
    readJson(buildReport) as BuildReport,
    expectedUid,
    expectedGid,
  );
  const sourcePre = arg("source-pre-manifest");
  if (sourcePre !== null) {
    compareAttestationToSourcePreManifest(attestation, readJson(sourcePre) as SourcePreManifest);
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        status: "REHEARSAL_ATTESTATION_VERIFIED",
        attestedPaths: attestation.map((entry) => entry.path),
        comparedToSourcePreManifest: sourcePre !== null,
      },
      null,
      2,
    )}\n`,
  );
}
