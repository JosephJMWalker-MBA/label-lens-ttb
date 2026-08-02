import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  chownSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import { canonicalize, sha256Bytes } from "./lib/issue-149-evidence-canonical";

const DIR_MODE = 0o755;
const FILE_MODE = 0o644;
const REQUIRED_COMPONENTS = [
  "source-pre-manifest.json",
  "source-post-manifest.json",
  "source-tree.tar",
  "snapshot-manifest.json",
  "handoff-receipt.json",
] as const;

type EntryType = "directory" | "file";
type HaltCode =
  | "FORENSIC_HANDOFF_SOURCE_ABSENT"
  | "FORENSIC_HANDOFF_SYMLINK_REJECTED"
  | "FORENSIC_HANDOFF_UNEXPECTED_FILE_TYPE"
  | "FORENSIC_HANDOFF_HARDLINK_REJECTED"
  | "FORENSIC_HANDOFF_ARCHIVE_FAILED"
  | "FORENSIC_HANDOFF_SOURCE_MUTATED"
  | "FORENSIC_HANDOFF_CONTENT_EQUIVALENCE_FAILED"
  | "FORENSIC_HANDOFF_HOST_READABILITY_FAILED"
  | "FORENSIC_HANDOFF_REPORT_INCOMPLETE"
  | "FORENSIC_HANDOFF_USAGE";

type ManifestEntry = {
  path: string;
  type: EntryType;
  length: number | null;
  digest: string | null;
  mode: string;
  uid: number;
  gid: number;
  dev: number | null;
  ino: number | null;
  nlink: number | null;
};

type Histogram = Record<string, number>;

type ClosedReport = {
  status: "VERIFIED" | "HALTED";
  haltCode: HaltCode | null;
  acquisitionExitStatus: number | null;
  sourceExists: boolean;
  sourcePreManifestDigest: string | null;
  sourcePostManifestDigest: string | null;
  archiveDigest: string | null;
  archiveLength: number | null;
  snapshotManifestDigest: string | null;
  contentEquivalent: boolean | null;
  sourceMutated: boolean | null;
  hostReadable: boolean;
  sourceHistograms: { uid: Histogram; gid: Histogram; mode: Histogram };
  snapshotHistograms: { uid: Histogram; gid: Histogram; mode: Histogram };
  unexpectedFileFindings: string[];
  requiredComponentInventory: Record<(typeof REQUIRED_COMPONENTS)[number], boolean>;
};

const arg = (name: string): string | null => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
};

function sha256File(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function emptyHistograms(): { uid: Histogram; gid: Histogram; mode: Histogram } {
  return { uid: {}, gid: {}, mode: {} };
}

function addHistogram(
  histograms: { uid: Histogram; gid: Histogram; mode: Histogram },
  entry: ManifestEntry,
): void {
  histograms.uid[String(entry.uid)] = (histograms.uid[String(entry.uid)] ?? 0) + 1;
  histograms.gid[String(entry.gid)] = (histograms.gid[String(entry.gid)] ?? 0) + 1;
  histograms.mode[entry.mode] = (histograms.mode[entry.mode] ?? 0) + 1;
}

function writeJson(file: string, value: unknown, uid: number | null, gid: number | null): void {
  writeFileSync(file, `${canonicalize(value)}\n`, { mode: FILE_MODE });
  chmodSync(file, FILE_MODE);
  if (uid !== null && gid !== null) chownSync(file, uid, gid);
}

function walk(root: string): {
  entries: ManifestEntry[];
  findings: string[];
  histograms: { uid: Histogram; gid: Histogram; mode: Histogram };
} {
  const entries: ManifestEntry[] = [];
  const findings: string[] = [];
  const histograms = emptyHistograms();
  const seenFiles = new Map<string, string>();

  const visit = (absolute: string, relative: string): void => {
    const lst = lstatSync(absolute);
    if (lst.isSymbolicLink()) {
      findings.push(`SYMLINK:${relative}`);
      throw Object.assign(new Error(`FORENSIC_HANDOFF_SYMLINK_REJECTED: ${relative}`), {
        haltCode: "FORENSIC_HANDOFF_SYMLINK_REJECTED" as HaltCode,
      });
    }
    if (!lst.isDirectory() && !lst.isFile()) {
      findings.push(`UNEXPECTED:${relative}`);
      throw Object.assign(new Error(`FORENSIC_HANDOFF_UNEXPECTED_FILE_TYPE: ${relative}`), {
        haltCode: "FORENSIC_HANDOFF_UNEXPECTED_FILE_TYPE" as HaltCode,
      });
    }
    const fileIdentity = lst.isFile() ? `${lst.dev}:${lst.ino}` : null;
    if (lst.isFile()) {
      if (lst.nlink !== 1) {
        findings.push(`HARDLINK_NLINK:${relative}:${lst.nlink}`);
        throw Object.assign(new Error(`FORENSIC_HANDOFF_HARDLINK_REJECTED: ${relative}`), {
          haltCode: "FORENSIC_HANDOFF_HARDLINK_REJECTED" as HaltCode,
        });
      }
      const first = seenFiles.get(fileIdentity!);
      if (first !== undefined) {
        findings.push(`HARDLINK_DUPLICATE:${first}:${relative}`);
        throw Object.assign(new Error(`FORENSIC_HANDOFF_HARDLINK_REJECTED: ${first} ${relative}`), {
          haltCode: "FORENSIC_HANDOFF_HARDLINK_REJECTED" as HaltCode,
        });
      }
      seenFiles.set(fileIdentity!, relative);
    }
    const entry: ManifestEntry = {
      path: relative,
      type: lst.isDirectory() ? "directory" : "file",
      length: lst.isFile() ? lst.size : null,
      digest: lst.isFile() ? sha256File(absolute) : null,
      mode: (lst.mode & 0o777).toString(8).padStart(4, "0"),
      uid: lst.uid,
      gid: lst.gid,
      dev: lst.isFile() ? lst.dev : null,
      ino: lst.isFile() ? lst.ino : null,
      nlink: lst.isFile() ? lst.nlink : null,
    };
    entries.push(entry);
    addHistogram(histograms, entry);
    if (lst.isDirectory()) {
      for (const child of readdirSync(absolute).sort()) {
        visit(path.join(absolute, child), relative === "." ? child : path.join(relative, child));
      }
    }
  };
  visit(root, ".");
  return { entries, findings, histograms };
}

function manifestText(kind: "source" | "snapshot", root: string, entries: ManifestEntry[]): string {
  return `${canonicalize({ schemaVersion: `issue-149-forensic-${kind}-manifest.v2`, root, entries })}\n`;
}

function pathDigestSet(entries: ManifestEntry[]): string {
  return sha256Bytes(
    canonicalize(
      entries
        .filter((entry) => entry.type === "file")
        .map((entry) => ({ path: entry.path, length: entry.length, digest: entry.digest }))
        .sort((left, right) => left.path.localeCompare(right.path)),
    ),
  );
}

function copyNormalized(source: string, target: string, uid: number, gid: number): void {
  const lst = lstatSync(source);
  if (lst.isDirectory()) {
    mkdirSync(target, { recursive: true, mode: DIR_MODE });
    chmodSync(target, DIR_MODE);
    chownSync(target, uid, gid);
    for (const child of readdirSync(source).sort())
      copyNormalized(path.join(source, child), path.join(target, child), uid, gid);
    return;
  }
  if (!lst.isFile()) {
    throw Object.assign(new Error(`FORENSIC_HANDOFF_UNEXPECTED_FILE_TYPE: ${source}`), {
      haltCode: "FORENSIC_HANDOFF_UNEXPECTED_FILE_TYPE" as HaltCode,
    });
  }
  copyFileSync(source, target);
  chmodSync(target, FILE_MODE);
  chownSync(target, uid, gid);
}

function checkHostReadable(entries: ManifestEntry[], hostUid: number, hostGid: number): boolean {
  return entries.every((entry) => {
    if (entry.uid !== hostUid || entry.gid !== hostGid) return false;
    return entry.type === "directory" ? entry.mode === "0755" : entry.mode === "0644";
  });
}

function inventory(outRoot: string): Record<(typeof REQUIRED_COMPONENTS)[number], boolean> {
  return Object.fromEntries(
    REQUIRED_COMPONENTS.map((name) => [name, existsSync(path.join(outRoot, name))]),
  ) as Record<(typeof REQUIRED_COMPONENTS)[number], boolean>;
}

function halt(
  report: ClosedReport,
  outRoot: string,
  code: HaltCode,
  uid: number | null,
  gid: number | null,
): never {
  report.status = "HALTED";
  report.haltCode = code;
  mkdirSync(outRoot, { recursive: true, mode: DIR_MODE });
  writeJson(path.join(outRoot, "handoff-receipt.json"), report, uid, gid);
  report.requiredComponentInventory = inventory(outRoot);
  writeJson(path.join(outRoot, "handoff-receipt.json"), report, uid, gid);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(1);
}

const source = arg("source");
const out = arg("out");
const snapshot = arg("snapshot");
const hostUid = arg("host-uid") === null ? null : Number(arg("host-uid"));
const hostGid = arg("host-gid") === null ? null : Number(arg("host-gid"));
const acquisitionExitStatus =
  arg("acquisition-status") === null ? null : Number(arg("acquisition-status"));

const outRoot = path.resolve(out ?? ".");
const report: ClosedReport = {
  status: "HALTED",
  haltCode: null,
  acquisitionExitStatus: Number.isFinite(acquisitionExitStatus) ? acquisitionExitStatus : null,
  sourceExists: false,
  sourcePreManifestDigest: null,
  sourcePostManifestDigest: null,
  archiveDigest: null,
  archiveLength: null,
  snapshotManifestDigest: null,
  contentEquivalent: null,
  sourceMutated: null,
  hostReadable: false,
  sourceHistograms: emptyHistograms(),
  snapshotHistograms: emptyHistograms(),
  unexpectedFileFindings: [],
  requiredComponentInventory: inventory(outRoot),
};

if (
  source === null ||
  out === null ||
  snapshot === null ||
  hostUid === null ||
  hostGid === null ||
  !Number.isInteger(hostUid) ||
  !Number.isInteger(hostGid)
) {
  halt(report, outRoot, "FORENSIC_HANDOFF_USAGE", null, null);
}

const sourceRoot = path.resolve(source);
const snapshotRoot = path.resolve(snapshot);
rmSync(outRoot, { recursive: true, force: true });
rmSync(snapshotRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true, mode: DIR_MODE });
chownSync(outRoot, hostUid, hostGid);
report.sourceExists = existsSync(sourceRoot);
if (!report.sourceExists) halt(report, outRoot, "FORENSIC_HANDOFF_SOURCE_ABSENT", hostUid, hostGid);

let sourcePre: ReturnType<typeof walk>;
try {
  sourcePre = walk(sourceRoot);
} catch (cause) {
  report.unexpectedFileFindings.push(cause instanceof Error ? cause.message : String(cause));
  halt(
    report,
    outRoot,
    ((cause as { haltCode?: HaltCode }).haltCode ??
      "FORENSIC_HANDOFF_UNEXPECTED_FILE_TYPE") as HaltCode,
    hostUid,
    hostGid,
  );
}
report.sourceHistograms = sourcePre.histograms;
const sourcePreText = manifestText("source", sourceRoot, sourcePre.entries);
report.sourcePreManifestDigest = sha256Bytes(sourcePreText);
writeFileSync(path.join(outRoot, "source-pre-manifest.json"), sourcePreText, { mode: FILE_MODE });

const tarPath = path.join(outRoot, "source-tree.tar");
const tar = spawnSync("tar", ["--format=ustar", "-cf", tarPath, "-C", sourceRoot, "."], {
  encoding: "utf8",
});
if (tar.status !== 0) halt(report, outRoot, "FORENSIC_HANDOFF_ARCHIVE_FAILED", hostUid, hostGid);
chmodSync(tarPath, FILE_MODE);
chownSync(tarPath, hostUid, hostGid);
report.archiveDigest = sha256File(tarPath);
report.archiveLength = statSync(tarPath).size;

copyNormalized(sourceRoot, snapshotRoot, hostUid, hostGid);

let sourcePost: ReturnType<typeof walk>;
let snapshotManifest: ReturnType<typeof walk>;
try {
  sourcePost = walk(sourceRoot);
  snapshotManifest = walk(snapshotRoot);
} catch (cause) {
  report.unexpectedFileFindings.push(cause instanceof Error ? cause.message : String(cause));
  halt(
    report,
    outRoot,
    ((cause as { haltCode?: HaltCode }).haltCode ??
      "FORENSIC_HANDOFF_UNEXPECTED_FILE_TYPE") as HaltCode,
    hostUid,
    hostGid,
  );
}
const sourcePostText = manifestText("source", sourceRoot, sourcePost.entries);
report.sourcePostManifestDigest = sha256Bytes(sourcePostText);
writeFileSync(path.join(outRoot, "source-post-manifest.json"), sourcePostText, { mode: FILE_MODE });
report.sourceMutated = sourcePreText !== sourcePostText;
if (report.sourceMutated)
  halt(report, outRoot, "FORENSIC_HANDOFF_SOURCE_MUTATED", hostUid, hostGid);

const snapshotText = manifestText("snapshot", snapshotRoot, snapshotManifest.entries);
report.snapshotManifestDigest = sha256Bytes(snapshotText);
report.snapshotHistograms = snapshotManifest.histograms;
writeFileSync(path.join(outRoot, "snapshot-manifest.json"), snapshotText, { mode: FILE_MODE });

report.contentEquivalent =
  pathDigestSet(sourcePre.entries) === pathDigestSet(snapshotManifest.entries);
if (!report.contentEquivalent)
  halt(report, outRoot, "FORENSIC_HANDOFF_CONTENT_EQUIVALENCE_FAILED", hostUid, hostGid);
report.hostReadable = checkHostReadable(snapshotManifest.entries, hostUid, hostGid);
if (!report.hostReadable)
  halt(report, outRoot, "FORENSIC_HANDOFF_HOST_READABILITY_FAILED", hostUid, hostGid);

for (const file of [
  "source-pre-manifest.json",
  "source-post-manifest.json",
  "snapshot-manifest.json",
]) {
  chmodSync(path.join(outRoot, file), FILE_MODE);
  chownSync(path.join(outRoot, file), hostUid, hostGid);
}
report.status = "VERIFIED";
report.haltCode = null;
report.requiredComponentInventory = inventory(outRoot);
writeJson(path.join(outRoot, "handoff-receipt.json"), report, hostUid, hostGid);
report.requiredComponentInventory = inventory(outRoot);
writeJson(path.join(outRoot, "handoff-receipt.json"), report, hostUid, hostGid);
if (!Object.values(report.requiredComponentInventory).every(Boolean))
  halt(report, outRoot, "FORENSIC_HANDOFF_REPORT_INCOMPLETE", hostUid, hostGid);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
