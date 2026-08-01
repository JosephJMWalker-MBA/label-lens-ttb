/**
 * Issue #149 — the isolated runtime-boundary discovery implementation.
 *
 * **This runs INSIDE the container**, in the same boundary execute will use. It
 * runs NO OCR, invokes no acquisition API and writes no evidence file.
 *
 * It verifies only what is actually mounted. It deliberately does NOT claim to
 * check the freeze script, `preregistration.md`, the Stage 1 artifacts, the
 * fixtures or the post-freeze ID map: those are not present inside the boundary,
 * and asserting that they were checked here would be false. What it does assert
 * about them is that they are **absent or unopenable**, which is a different and
 * checkable claim.
 */
import { createHash } from "node:crypto";
import {
  accessSync,
  constants as fsConstants,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import path from "node:path";

export const DISCOVERY_REPORT_VERSION = "issue-149-runtime-discovery-v1";

/** The four experiment-controlled data mounts, in their frozen order. */
export const EXPERIMENT_MOUNTS = [
  { ordinal: 1, id: "runtimeBundle", target: "/opt/acquisition", mode: "ro" },
  {
    ordinal: 2,
    id: "truthFreeInputManifest",
    target: "/input/truth-free-input-manifest.json",
    mode: "ro",
  },
  { ordinal: 3, id: "stagedImages", target: "/input/images", mode: "ro" },
  { ordinal: 4, id: "output", target: "/output", mode: "rw" },
] as const;

/** Writable by design: the output mount plus the named tmpfs scratch paths. */
export const NAMED_TMPFS_PATHS = ["/tmp", "/run"] as const;

/**
 * Unavoidable pseudo-filesystems. The "exactly four mounts" claim was not
 * implementable; the invariant is four experiment-controlled data mounts plus
 * this explicit allowlist.
 */
export const ALLOWED_PSEUDO_FILESYSTEMS = [
  "proc",
  "sysfs",
  "devtmpfs",
  "devpts",
  "mqueue",
  "shm",
  "cgroup",
  "cgroup2",
  "tmpfs",
  "overlay",
] as const;

/** Container-runtime generated files that are bind-mounted by every runtime. */
export const ALLOWED_RUNTIME_GENERATED_FILES = [
  "/etc/hosts",
  "/etc/hostname",
  "/etc/resolv.conf",
] as const;

/**
 * The exact environment allowlist. Anything else is a failure.
 *
 * Four of these are not ours and are allowlisted explicitly rather than quietly
 * ignored, the same way the unavoidable pseudo-filesystems are:
 *
 * - `NODE_VERSION` and `YARN_VERSION` are baked into the
 *   `node:20-bookworm-slim` image;
 * - `PWD` is set by the container runtime for the working directory;
 * - `VIPSHOME` is set by sharp's libvips package.
 *
 * The last two were found by the first successful in-container discovery run,
 * which is exactly what discovery is for. Nothing is inherited from the host:
 * the container starts with an empty env-file and exactly two `-e` variables.
 */
export const ENVIRONMENT_ALLOWLIST = [
  "PATH",
  "HOME",
  "HOSTNAME",
  "NODE_VERSION",
  "YARN_VERSION",
  "PWD",
  "VIPSHOME",
  "ISSUE_149_MODE",
  "ISSUE_149_HARNESS_REVISION",
] as const;

/** Substrings that would indicate a credential reached the boundary. */
export const CREDENTIAL_MARKERS = [
  "GITHUB_TOKEN",
  "GH_TOKEN",
  "ACTIONS_",
  "AWS_",
  "NPM_TOKEN",
  "SECRET",
  "PASSWORD",
  "PRIVATE_KEY",
  "SESSION",
] as const;

/** Paths that must not be openable from inside the boundary. */
export const FORBIDDEN_PATHS = [
  "/workspace",
  "/github/workspace",
  "/opt/acquisition/.git",
  "/.git",
  "/artifacts",
  "/src/fixtures",
  "/input/id-map.json",
  "/input/post-freeze",
  "/opt/acquisition/artifacts",
  "/opt/acquisition/src/fixtures",
] as const;

export interface DiscoveryFinding {
  check: string;
  ok: boolean;
  detail: unknown;
}

export interface DiscoveryReport {
  reportVersion: string;
  mode: string;
  ok: boolean;
  ocrEngineInvoked: false;
  acquisitionApiInvoked: false;
  sealedEvidenceWritten: false;
  outputFilesCreated: 0;
  platform: Record<string, unknown>;
  findings: DiscoveryFinding[];
  accessibleFiles: string[];
  mounts: string[];
  writablePaths: string[];
  bundleFiles: Array<{ path: string; sha256: string; byteLength: number }>;
  stagedImages: Array<{ file: string; sha256: string; byteLength: number }>;
}

const sha256 = (bytes: Uint8Array | string): string =>
  createHash("sha256")
    .update(Buffer.from(bytes as Uint8Array))
    .digest("hex");

/** Every accessible regular file under a root, with a hard cap so a surprise mount cannot hang the run. */
export function listAccessibleFiles(root: string, limit = 5000): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    if (found.length >= limit) return;
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= limit) return;
      const full = path.join(dir, entry);
      let info;
      try {
        info = statSync(full);
      } catch {
        continue;
      }
      if (info.isDirectory()) walk(full);
      else found.push(full);
    }
  };
  walk(root);
  return found.sort();
}

/** Is a path writable, tested by the kernel rather than by convention? */
export function isWritable(target: string): boolean {
  try {
    accessSync(target, fsConstants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/** Parse /proc/self/mountinfo into (fstype, mountpoint) pairs. */
export function readMounts(): Array<{ mountPoint: string; fsType: string }> {
  let raw = "";
  try {
    raw = readFileSync("/proc/self/mounts", "utf8");
  } catch {
    return [];
  }
  return raw
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      const [, mountPoint, fsType] = line.split(/\s+/);
      return { mountPoint, fsType };
    });
}

/**
 * The complete discovery pass.
 *
 * Every check is recorded as a finding with its evidence, and `ok` is the
 * conjunction. A check that could not be performed is reported as a failure, not
 * skipped: "we did not look" and "we looked and it was fine" must not produce the
 * same report.
 */
export async function runRuntimeDiscovery(
  environment: NodeJS.ProcessEnv,
): Promise<DiscoveryReport> {
  const findings: DiscoveryFinding[] = [];
  const record = (check: string, ok: boolean, detail: unknown): boolean => {
    findings.push({ check, ok, detail });
    return ok;
  };

  // 1. platform identity
  const platform = {
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    pid: process.pid,
    uid: typeof process.getuid === "function" ? process.getuid() : null,
  };
  record("platform-is-linux-x64", process.platform === "linux" && process.arch === "x64", platform);

  // 2. bundle manifest verification
  const manifestPath = "/opt/acquisition/bundle-manifest.json";
  const bundleFiles: DiscoveryReport["bundleFiles"] = [];
  let bundleOk = false;
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      emitted: Array<{ path: string; sha256: string; byteLength: number }>;
    };
    const mismatches: string[] = [];
    for (const emitted of manifest.emitted) {
      const full = path.join("/opt/acquisition", emitted.path);
      if (!existsSync(full)) {
        mismatches.push(`${emitted.path} missing`);
        continue;
      }
      const bytes = readFileSync(full);
      const digest = sha256(bytes);
      bundleFiles.push({ path: emitted.path, sha256: digest, byteLength: bytes.byteLength });
      if (digest !== emitted.sha256) mismatches.push(`${emitted.path} digest`);
      if (bytes.byteLength !== emitted.byteLength) mismatches.push(`${emitted.path} length`);
    }
    bundleOk = mismatches.length === 0 && manifest.emitted.length > 0;
    record("bundle-manifest-verified", bundleOk, {
      emittedCount: manifest.emitted.length,
      mismatches,
    });
  } else {
    record("bundle-manifest-verified", false, "bundle-manifest.json is not mounted");
  }

  // 3. truth-free manifest and every staged image
  const stagedImages: DiscoveryReport["stagedImages"] = [];
  const manifestFile = "/input/truth-free-input-manifest.json";
  if (existsSync(manifestFile)) {
    const inputManifest = JSON.parse(readFileSync(manifestFile, "utf8")) as {
      cases: Array<{
        opaqueItemId: string;
        stagedImageFileName: string;
        sourceImageSha256: string;
        sourceImageByteSize: number;
      }>;
    };
    const problems: string[] = [];
    for (const entry of inputManifest.cases) {
      const full = path.join("/input/images", entry.stagedImageFileName);
      if (!existsSync(full)) {
        problems.push(`${entry.stagedImageFileName} missing`);
        continue;
      }
      const bytes = readFileSync(full);
      const digest = sha256(bytes);
      stagedImages.push({
        file: entry.stagedImageFileName,
        sha256: digest,
        byteLength: bytes.byteLength,
      });
      if (digest !== entry.sourceImageSha256) problems.push(`${entry.stagedImageFileName} digest`);
      if (bytes.byteLength !== entry.sourceImageByteSize) {
        problems.push(`${entry.stagedImageFileName} length`);
      }
    }
    record("staged-images-verified", problems.length === 0 && stagedImages.length === 115, {
      declared: inputManifest.cases.length,
      verified: stagedImages.length,
      problems,
    });
    // The acquisition input must carry no truth-bearing field.
    const serialized = JSON.stringify(inputManifest.cases).toLowerCase();
    const truthMarkers = ["truth", "expected", "acceptable", "brandpresent", "caseid", "imagepath"];
    record(
      "acquisition-input-carries-no-truth-bearing-field",
      truthMarkers.every((marker) => !serialized.includes(marker)),
      truthMarkers.filter((marker) => serialized.includes(marker)),
    );
  } else {
    record("staged-images-verified", false, "truth-free-input-manifest.json is not mounted");
    record("acquisition-input-carries-no-truth-bearing-field", false, "manifest not mounted");
  }

  // 4. complete accessible-file inventory
  const accessibleFiles = [
    ...listAccessibleFiles("/opt/acquisition"),
    ...listAccessibleFiles("/input"),
    ...listAccessibleFiles("/output"),
  ];
  record("accessible-file-inventory-collected", accessibleFiles.length > 0, {
    count: accessibleFiles.length,
  });

  // 5. mount inventory: four experiment mounts plus the allowlist
  const mounts = readMounts();
  const experimentTargets = EXPERIMENT_MOUNTS.map((mount) => mount.target);
  const unexpected = mounts.filter(
    (mount) =>
      !experimentTargets.includes(mount.mountPoint as (typeof experimentTargets)[number]) &&
      !(ALLOWED_PSEUDO_FILESYSTEMS as readonly string[]).includes(mount.fsType) &&
      !(ALLOWED_RUNTIME_GENERATED_FILES as readonly string[]).includes(mount.mountPoint) &&
      mount.mountPoint !== "/",
  );
  record("only-allowlisted-mounts-present", unexpected.length === 0, {
    unexpected,
    experimentMountsPresent: experimentTargets.filter((target) => existsSync(target)),
  });

  // 6. read-only root; only the output mount and named tmpfs writable
  const writableProbes = [
    "/",
    "/opt/acquisition",
    "/input",
    "/input/images",
    "/output",
    ...NAMED_TMPFS_PATHS,
  ];
  const writablePaths = writableProbes.filter((target) => existsSync(target) && isWritable(target));
  const shouldBeWritable = new Set<string>(["/output", ...NAMED_TMPFS_PATHS]);
  record(
    "read-only-root-and-writable-allowlist",
    writablePaths.every((target) => shouldBeWritable.has(target)) && !isWritable("/"),
    { writablePaths, rootWritable: isWritable("/") },
  );

  // 7. environment allowlist and credential absence
  const presentKeys = Object.keys(environment).sort();
  const outsideAllowlist = presentKeys.filter(
    (key) => !(ENVIRONMENT_ALLOWLIST as readonly string[]).includes(key),
  );
  record("environment-matches-allowlist", outsideAllowlist.length === 0, {
    presentKeys,
    outsideAllowlist,
  });
  const credentialLike = presentKeys.filter((key) =>
    (CREDENTIAL_MARKERS as readonly string[]).some((marker) => key.toUpperCase().includes(marker)),
  );
  record("no-credential-in-environment", credentialLike.length === 0, credentialLike);

  // 8. network denial, tested rather than assumed
  const networkProbe = await probeNetwork();
  record("network-unavailable", networkProbe.denied, networkProbe);

  // 9. forbidden paths cannot be opened
  const openable = FORBIDDEN_PATHS.filter((target) => {
    try {
      accessSync(target, fsConstants.R_OK);
      return true;
    } catch {
      return false;
    }
  });
  record("forbidden-paths-unopenable", openable.length === 0, { openable });

  // 10. the output mount starts empty
  const outputFiles = existsSync("/output") ? listAccessibleFiles("/output") : [];
  record("output-mount-initially-empty", outputFiles.length === 0, outputFiles);

  return {
    reportVersion: DISCOVERY_REPORT_VERSION,
    mode: environment.ISSUE_149_MODE ?? "unset",
    ok: findings.every((finding) => finding.ok),
    ocrEngineInvoked: false,
    acquisitionApiInvoked: false,
    sealedEvidenceWritten: false,
    outputFilesCreated: 0,
    platform,
    findings,
    accessibleFiles,
    mounts: mounts.map((mount) => `${mount.fsType} ${mount.mountPoint}`).sort(),
    writablePaths,
    bundleFiles,
    stagedImages,
  };
}

/**
 * Network denial, actually observed.
 *
 * A DNS resolution and a TCP connect are both attempted and **awaited**. Denial
 * is the observed outcome of both, not an assertion that `--network none` was
 * passed. An earlier draft of this function returned `denied: true`
 * unconditionally and recorded the probe output beside it, which is restating
 * the intent and calling it evidence.
 */
export async function probeNetwork(): Promise<{
  denied: boolean;
  dns: string;
  tcp: string;
}> {
  const dns = await new Promise<string>((resolve) => {
    void import("node:dns")
      .then((dnsModule) => {
        dnsModule.lookup("registry.npmjs.org", (error, address) => {
          resolve(
            error === null ? `RESOLVED ${address}` : `denied: ${error.code ?? error.message}`,
          );
        });
      })
      .catch((cause: unknown) => resolve(`denied: ${String(cause)}`));
  });

  const tcp = await new Promise<string>((resolve) => {
    void import("node:net")
      .then((net) => {
        const socket = net.connect({ host: "1.1.1.1", port: 443, timeout: 2000 });
        const finish = (outcome: string): void => {
          socket.removeAllListeners();
          socket.destroy();
          resolve(outcome);
        };
        socket.once("connect", () => finish("CONNECTED"));
        socket.once("timeout", () => finish("denied: timeout"));
        socket.once("error", (error: NodeJS.ErrnoException) =>
          finish(`denied: ${error.code ?? error.message}`),
        );
      })
      .catch((cause: unknown) => resolve(`denied: ${String(cause)}`));
  });

  return { denied: dns.startsWith("denied") && tcp.startsWith("denied"), dns, tcp };
}
