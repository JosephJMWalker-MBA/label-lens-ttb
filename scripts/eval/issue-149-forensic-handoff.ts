import { createHash } from "node:crypto";
import {
  chmodSync,
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
import { spawnSync } from "node:child_process";

import { canonicalize, sha256Bytes } from "./lib/issue-149-evidence-canonical";

const DIR_MODE = 0o755;
const FILE_MODE = 0o644;

type ManifestEntry = {
  path: string;
  type: "directory" | "file";
  length: number | null;
  digest: string | null;
  mode: string;
  uid: number;
  gid: number;
};

const arg = (name: string): string | null => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? null : (process.argv[index + 1] ?? null);
};

function sha256File(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function walk(root: string): ManifestEntry[] {
  const entries: ManifestEntry[] = [];
  const visit = (absolute: string, relative: string): void => {
    const lst = lstatSync(absolute);
    if (lst.isSymbolicLink()) throw new Error(`FORENSIC_HANDOFF_SYMLINK_REJECTED: ${relative}`);
    if (!lst.isDirectory() && !lst.isFile()) {
      throw new Error(`FORENSIC_HANDOFF_UNEXPECTED_FILE_TYPE: ${relative}`);
    }
    entries.push({
      path: relative,
      type: lst.isDirectory() ? "directory" : "file",
      length: lst.isFile() ? lst.size : null,
      digest: lst.isFile() ? sha256File(absolute) : null,
      mode: (lst.mode & 0o777).toString(8).padStart(4, "0"),
      uid: lst.uid,
      gid: lst.gid,
    });
    if (lst.isDirectory()) {
      for (const child of readdirSync(absolute).sort()) {
        visit(path.join(absolute, child), relative === "." ? child : path.join(relative, child));
      }
    }
  };
  visit(root, ".");
  return entries;
}

function copyNormalized(source: string, target: string): void {
  const lst = lstatSync(source);
  if (lst.isSymbolicLink()) throw new Error(`FORENSIC_HANDOFF_SYMLINK_REJECTED: ${source}`);
  if (lst.isDirectory()) {
    mkdirSync(target, { recursive: true, mode: DIR_MODE });
    chmodSync(target, DIR_MODE);
    for (const child of readdirSync(source).sort())
      copyNormalized(path.join(source, child), path.join(target, child));
    return;
  }
  if (!lst.isFile()) throw new Error(`FORENSIC_HANDOFF_UNEXPECTED_FILE_TYPE: ${source}`);
  copyFileSync(source, target);
  chmodSync(target, FILE_MODE);
}

function contentProjection(entries: ManifestEntry[]): string {
  return sha256Bytes(
    canonicalize(
      entries
        .filter((entry) => entry.type === "file")
        .map((entry) => ({ path: entry.path, length: entry.length, digest: entry.digest }))
        .sort((left, right) => left.path.localeCompare(right.path)),
    ),
  );
}

const source = arg("source");
const out = arg("out");
const snapshot = arg("snapshot");
if (source === null || out === null || snapshot === null) {
  throw new Error("usage: issue-149-forensic-handoff --source <dir> --out <dir> --snapshot <dir>");
}

const sourceRoot = path.resolve(source);
const outRoot = path.resolve(out);
const snapshotRoot = path.resolve(snapshot);

if (!existsSync(sourceRoot)) throw new Error(`FORENSIC_HANDOFF_SOURCE_ABSENT: ${sourceRoot}`);
rmSync(outRoot, { recursive: true, force: true });
rmSync(snapshotRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true, mode: DIR_MODE });

const sourceManifest = walk(sourceRoot);
const sourceManifestText = `${canonicalize({
  schemaVersion: "issue-149-forensic-source-manifest.v1",
  source: sourceRoot,
  entries: sourceManifest,
})}\n`;
writeFileSync(path.join(outRoot, "source-manifest.json"), sourceManifestText, { mode: FILE_MODE });
chmodSync(path.join(outRoot, "source-manifest.json"), FILE_MODE);

const tarPath = path.join(outRoot, "source-tree.tar");
const tar = spawnSync("tar", ["--format=ustar", "-cf", tarPath, "-C", sourceRoot, "."], {
  encoding: "utf8",
});
if (tar.status !== 0)
  throw new Error(`FORENSIC_HANDOFF_ARCHIVE_FAILED: ${tar.stderr || tar.stdout}`);
chmodSync(tarPath, FILE_MODE);

copyNormalized(sourceRoot, snapshotRoot);
const snapshotManifest = walk(snapshotRoot);
const snapshotManifestText = `${canonicalize({
  schemaVersion: "issue-149-forensic-snapshot-manifest.v1",
  source: sourceRoot,
  snapshot: snapshotRoot,
  entries: snapshotManifest,
})}\n`;
writeFileSync(path.join(outRoot, "snapshot-manifest.json"), snapshotManifestText, {
  mode: FILE_MODE,
});
chmodSync(path.join(outRoot, "snapshot-manifest.json"), FILE_MODE);

const receipt = {
  schemaVersion: "issue-149-forensic-handoff-receipt.v1",
  sourceRoot,
  snapshotRoot,
  sourceMutated: false,
  sourceManifestDigest: sha256Bytes(sourceManifestText),
  snapshotManifestDigest: sha256Bytes(snapshotManifestText),
  forensicArchive: {
    path: "source-tree.tar",
    length: statSync(tarPath).size,
    digest: sha256File(tarPath),
    compression: "none",
  },
  contentEquivalenceDigest: contentProjection(sourceManifest),
  snapshotContentEquivalenceDigest: contentProjection(snapshotManifest),
  contentEquivalent: contentProjection(sourceManifest) === contentProjection(snapshotManifest),
  normalizedSnapshotModes: { directory: "0755", file: "0644" },
  originalTreeModeNormalization: "not_mutated",
};
if (!receipt.contentEquivalent) throw new Error("FORENSIC_HANDOFF_CONTENT_EQUIVALENCE_FAILED");
writeFileSync(path.join(outRoot, "handoff-receipt.json"), `${canonicalize(receipt)}\n`, {
  mode: FILE_MODE,
});
chmodSync(path.join(outRoot, "handoff-receipt.json"), FILE_MODE);
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
