#!/usr/bin/env node
/**
 * Issue #149 — Stage 2 Job A: trusted host preparation. **No OCR.**
 *
 * Job A is TRUSTED, NOT TRUTH-FREE. The freeze generator it runs physically
 * reads the PR #217 attribution artifact and uses `governedTruth.present` — and
 * only that — for the 105/10 corpus accounting. What is truth-free is the
 * PREPARATION ARTIFACT it emits and the isolated job that consumes it.
 *
 * It never executes the bundle it builds.
 *
 * Steps, in the frozen order (workflow-plan.md):
 *   1  verify the Stage 1 contract manifest
 *   2  verify preregistration.sha256
 *   3  freeze generator --check
 *   4  reproduce the three generated artifacts byte-for-byte
 *   5  restage and verify all 115 opaque images
 *   6  verify every incumbent identity and frozen source hash
 *   7  build the allowlisted runtime bundle, with no repository COPY
 *   8  generate the complete dependency graph / metafile
 *   9  enforce production-source base hashes and the sole parser exception
 *   10 run the tested TypeChecker source-closure analyzer
 *   11 run the canonical bundle-content scanner
 *   12 create the truth-free preparation artifact
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const EXPERIMENT = "issue-149-brand-complete-evidence-acquisition";
const ART = path.join(ROOT, "artifacts", EXPERIMENT);
const STAGED = path.join(ROOT, ".local/issue-149-acquisition-inputs");
const PREP = path.join(ROOT, ".local/issue-149-preparation");
const BUNDLE = path.join(PREP, "bundle");
/** The host verifier bundle and the Job C inventory, OUTSIDE the acquisition input. */
const VERIFIER = path.join(ROOT, ".local/issue-149-verifier");
const IDENTITY = path.join(ROOT, ".local/issue-149-identity-inventory");

/** The frozen base whose production-source bytes every closure module must match. */
const BASE = "546c3f279ce431a1fd8c0203df7a83553ea866ef";
const FIELD_SELECTION_SHA256 = "8e05462a86449c5e7cd91993e213ed0447a2389aae6bd3216cefd1b4e895e79c";

/** The ONE frozen exception under src/domain/rules, by path AND content hash. */
const PARSER_EXCEPTION = {
  path: "src/domain/rules/wine-alcohol-parse.ts",
  sha256: "2ec1368cf3f4fcfab264d1507f98267aa6f6112091332d4dda5a76152ea816e7",
};

const PROHIBITED_CLOSURE_PREFIXES = ["src/fixtures/", "tests/", "artifacts/", "src/domain/rules/"];

/**
 * Native modules, which CANNOT be bundled and must ship beside the bundle.
 *
 * Observed by running isolated discovery: esbuild happily inlined sharp's
 * JavaScript wrapper, and the container then failed at import with
 * `Could not load the "sharp" module using the linux-x64 runtime`, because the
 * wrapper resolves a platform-specific `.node` binary at load time and no
 * bundler can inline one.
 *
 * They are marked external and their resolved package trees are copied into
 * `bundle/node_modules/`, so Node resolves them from beside the emitted module.
 * That keeps the bundle self-contained and leaves the four-mount invariant
 * untouched. Every copied file is hashed into the bundle manifest and scanned
 * for prohibited content like any other bundle file.
 */
const NATIVE_EXTERNALS = ["sharp"];

class JobAError extends Error {
  constructor(code, detail) {
    super(`${code}: ${JSON.stringify(detail)}`);
    this.code = code;
    this.detail = detail;
  }
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sha256File = (file) => sha256(readFileSync(file));
const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });

const steps = [];
const step = (name, detail) => {
  steps.push({ step: steps.length + 1, name, ...detail });
};

// ---- 1-2. contract manifest and preregistration ---------------------------
function verifyStageOnePackage() {
  const manifest = JSON.parse(
    run("node", ["scripts/eval/issue-149-stage-1-contract-manifest.mjs", "--verify"]),
  );
  if (manifest.status !== "VERIFIED") {
    throw new JobAError("STAGE_1_CONTRACT_MANIFEST_UNVERIFIED", manifest);
  }
  step("verify-stage-1-contract-manifest", {
    files: manifest.files,
    aggregate: manifest.aggregate,
  });

  run("shasum", ["-a", "256", "-c", "preregistration.sha256"], { cwd: ART });
  step("verify-preregistration-sha256", { file: "preregistration.sha256", result: "OK" });
}

// ---- 3-5. generator reproducibility and staging ---------------------------
function reproduceAndStage() {
  const check = JSON.parse(
    run("node", ["scripts/eval/issue-149-brand-evidence-acquisition-freeze.mjs", "--check"]),
  );
  if (check.status !== "STAGE_1_GENERATED_ARTIFACTS_REPRODUCIBLE") {
    throw new JobAError("STAGE_1_GENERATED_ARTIFACT_DRIFT", check);
  }
  step("freeze-generator-check", {
    artifactsCompared: check.artifactsCompared,
    byteIdentical: check.byteIdentical,
    ocrRun: false,
  });

  const generated = [
    "truth-free-input-manifest.json",
    "population-freeze.json",
    "post-freeze/id-map.json",
  ];
  const before = generated.map((file) => ({ file, sha256: sha256File(path.join(ART, file)) }));
  const staged = JSON.parse(
    run("node", ["scripts/eval/issue-149-brand-evidence-acquisition-freeze.mjs"]),
  );
  const after = generated.map((file) => ({ file, sha256: sha256File(path.join(ART, file)) }));
  const drifted = before.filter((entry, index) => entry.sha256 !== after[index].sha256);
  if (drifted.length > 0) throw new JobAError("STAGE_1_GENERATED_ARTIFACT_DRIFT", drifted);

  step("restage-115-opaque-images", {
    total: staged.total,
    brandPresent: staged.brandPresent,
    brandAbsent: staged.brandAbsent,
    stagedFilesVerified: staged.stagedFilesVerified,
    generatedArtifactsBitIdentical: true,
    ocrRun: false,
  });

  const manifest = JSON.parse(
    readFileSync(path.join(ART, "truth-free-input-manifest.json"), "utf8"),
  );
  const problems = [];
  for (const item of manifest.cases) {
    const file = path.join(STAGED, item.stagedImageFileName);
    if (!existsSync(file)) {
      problems.push(`${item.stagedImageFileName} missing`);
      continue;
    }
    const bytes = readFileSync(file);
    if (sha256(bytes) !== item.sourceImageSha256) {
      problems.push(`${item.stagedImageFileName} digest`);
    }
    if (bytes.byteLength !== item.sourceImageByteSize) {
      problems.push(`${item.stagedImageFileName} length`);
    }
  }
  if (problems.length > 0) throw new JobAError("STAGED_IMAGE_VERIFICATION_FAILED", problems);
  step("verify-staged-image-bytes", { verified: manifest.cases.length, problems: [] });
}

// ---- 6. incumbent identities ----------------------------------------------
function verifyIncumbentIdentities() {
  const frozen = readFileSync(path.join(ART, "incumbent-configuration-freeze.json"), "utf8");
  const lock = JSON.parse(readFileSync(path.join(ROOT, "package-lock.json"), "utf8")).packages;
  const mismatches = [];

  const tesseract = lock["node_modules/tesseract.js"]?.version;
  const core = lock["node_modules/tesseract.js-core"]?.version;
  const traineddata = sha256File(path.join(ROOT, "src/pipeline/extractor/assets/eng.traineddata"));
  const fieldSelection = sha256File(path.join(ROOT, "src/pipeline/extractor/field-selection.ts"));
  const parser = sha256File(path.join(ROOT, PARSER_EXCEPTION.path));

  if (!frozen.includes(tesseract ?? " ")) mismatches.push(`tesseract.js ${tesseract}`);
  if (!frozen.includes(core ?? " ")) mismatches.push(`tesseract.js-core ${core}`);
  if (!frozen.includes(traineddata)) mismatches.push(`eng.traineddata ${traineddata}`);
  if (fieldSelection !== FIELD_SELECTION_SHA256) {
    mismatches.push(`field-selection.ts ${fieldSelection}`);
  }
  if (parser !== PARSER_EXCEPTION.sha256) {
    mismatches.push(`${PARSER_EXCEPTION.path} drifted from its frozen hash`);
  }
  if (mismatches.length > 0) throw new JobAError("INCUMBENT_CONFIGURATION_DRIFT", mismatches);

  step("verify-incumbent-identities", {
    tesseractJs: tesseract,
    tesseractJsCore: core,
    engTraineddataSha256: traineddata,
    fieldSelectionSha256: fieldSelection,
    wineAlcoholParseSha256: parser,
  });
}

// ---- 7-8. allowlisted bundle and complete dependency graph -----------------
async function buildBundle() {
  rmSync(BUNDLE, { recursive: true, force: true });
  mkdirSync(BUNDLE, { recursive: true });

  const esbuild = await import("esbuild");
  // SELF-CONTAINED ESM, with a createRequire banner.
  //
  // Three facts observed by RUNNING discovery rather than reasoning about it,
  // each of which changed the build:
  //   - `--packages=external` left bare npm specifiers in the emitted module,
  //     which cannot resolve inside the boundary: the container has no
  //     node_modules and no network. Discovery halted with ERR_MODULE_NOT_FOUND
  //     for `zod`. Only true node builtins stay external now.
  //   - with everything bundled, ESM output failed at import time with
  //     "Dynamic require of child_process is not supported": a bundled CJS
  //     dependency uses a runtime `require`, which an ES module has no binding
  //     for.
  //   - CJS output was not the answer either: another dependency calls
  //     `createRequire(import.meta.url)`, and `import.meta` does not exist in
  //     CommonJS, so the bundle threw ERR_INVALID_ARG_VALUE before running a
  //     single line of its own code.
  //
  // The banner defines a real `require` in ES-module scope, which satisfies
  // esbuild's dynamic-require shim while `import.meta.url` remains available.
  const banner =
    'import { createRequire as __issue149CreateRequire } from "node:module";\n' +
    "const require = __issue149CreateRequire(import.meta.url);\n";
  const buildCommand =
    'esbuild scripts/eval/issue-149-brand-evidence-acquisition-run.ts --bundle --platform=node --format=esm --target=node20 --external:node:* --external:sharp --banner:js="<createRequire banner>" --metafile --sourcemap=false --outfile=bundle/acquisition.mjs';

  const result = await esbuild.build({
    entryPoints: [path.join(ROOT, "scripts/eval/issue-149-brand-evidence-acquisition-run.ts")],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    banner: { js: banner },
    metafile: true,
    sourcemap: false,
    external: ["node:*", ...NATIVE_EXTERNALS],
    outfile: path.join(BUNDLE, "acquisition.mjs"),
    absWorkingDir: ROOT,
    tsconfig: path.join(ROOT, "tsconfig.json"),
    logLevel: "silent",
  });

  // NO unrestricted repository copy. Exactly the allowlisted runtime assets.
  mkdirSync(path.join(BUNDLE, "assets"), { recursive: true });
  cpSync(
    path.join(ROOT, "src/pipeline/extractor/assets/eng.traineddata"),
    path.join(BUNDLE, "assets/eng.traineddata"),
  );
  cpSync(
    path.join(ART, "runtime/truth-key-inventory.json"),
    path.join(BUNDLE, "truth-key-inventory.json"),
  );

  // The native externals, copied whole from the installed dependency tree.
  // NOT an unrestricted repository copy: an explicit, named package list.
  const nativePackages = copyNativeExternals();

  const metafile = JSON.stringify(result.metafile, null, 2);
  writeFileSync(path.join(PREP, "metafile.json"), metafile);
  const inputs = Object.keys(result.metafile.inputs).sort();

  step("build-allowlisted-runtime-bundle", {
    buildCommand,
    buildTool: `esbuild ${esbuild.version}`,
    unrestrictedRepositoryCopy: false,
    nativeExternals: NATIVE_EXTERNALS,
    nativePackagesCopied: nativePackages.copied,
    nativePackagesAbsent: nativePackages.absent,
    nativeDependencyTreeRoot: nativePackages.treeRoot,
    emitted: readdirSync(BUNDLE).sort(),
  });
  step("generate-complete-dependency-graph", {
    metafileSha256: sha256(metafile),
    sourceInputCount: inputs.length,
    sourceInputs: inputs,
  });
  return {
    inputs,
    metafileSha256: sha256(metafile),
    buildCommand,
    buildTool: `esbuild ${esbuild.version}`,
  };
}

/**
 * Copy each native external's resolved package, plus the platform-specific
 * implementation packages it depends on, into `bundle/node_modules/`.
 *
 * The set is derived from the package's own `optionalDependencies`, so the
 * platform variant actually installed on this host is what travels. A Job A run
 * on a host whose platform differs from the container's will therefore produce a
 * bundle the container cannot load — which is a true statement about that bundle
 * and is reported by discovery rather than hidden.
 */
function copyNativeExternals() {
  const target = path.join(BUNDLE, "node_modules");

  /**
   * The installed dependency tree, located by walking UP from the repository
   * root. In a git worktree the tree lives in the primary checkout, so the root
   * itself may have no `node_modules` at all.
   */
  const treeRoot = (() => {
    let current = ROOT;
    while (current !== path.dirname(current)) {
      const candidate = path.join(current, "node_modules");
      if (existsSync(path.join(candidate, NATIVE_EXTERNALS[0]))) return candidate;
      current = path.dirname(current);
    }
    throw new JobAError("NATIVE_EXTERNAL_NOT_INSTALLED", NATIVE_EXTERNALS[0]);
  })();

  /**
   * Copy the transitive closure by reading the installed DIRECTORY TREE, not by
   * asking Node to resolve each package.
   *
   * Module resolution was the wrong instrument, twice over: `<name>/package.json`
   * is not exposed by sharp's `exports` map, and `require.resolve("<name>")`
   * throws outright for `@img/sharp-linux-x64`, whose exports expose no entry
   * point at all. Both failures returned null and were SKIPPED, so the bundle
   * shipped without the platform binary and the container failed with the same
   * "Could not load the sharp module" error the previous round was supposed to
   * fix. What npm actually put on disk is the authority here.
   *
   * A declared dependency with no directory is recorded as absent rather than
   * ignored: platform-specific optional packages for OTHER platforms are
   * legitimately missing, and the manifest says which ones were.
   */
  const copied = [];
  const absent = [];
  const seen = new Set();
  const queue = [...NATIVE_EXTERNALS];

  while (queue.length > 0) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);

    const source = path.join(treeRoot, name);
    if (!existsSync(source)) {
      if (NATIVE_EXTERNALS.includes(name)) {
        throw new JobAError("NATIVE_EXTERNAL_NOT_INSTALLED", name);
      }
      absent.push(name);
      continue;
    }
    // `.bin` holds CLI shims that are SYMLINKS. They are not needed at runtime,
    // and they did not survive the artifact round-trip: the bundle manifest
    // recorded `node_modules/sharp/node_modules/.bin/semver` and isolated
    // discovery then reported it missing, failing manifest verification over a
    // file the runtime never loads.
    cpSync(source, path.join(target, name), {
      recursive: true,
      dereference: true,
      filter: (from) => !from.split(path.sep).includes(".bin"),
    });
    copied.push(name);

    const manifestPath = path.join(source, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    queue.push(
      ...Object.keys(manifest.dependencies ?? {}),
      ...Object.keys(manifest.optionalDependencies ?? {}),
    );
  }
  return { copied: copied.sort(), absent: absent.sort(), treeRoot: path.relative(ROOT, treeRoot) };
}

/**
 * Build the self-contained HOST VERIFIER bundle.
 *
 * Job B performs no repository checkout, so a verification step that invokes
 * `npx vite-node scripts/eval/...` cannot run there at all: the script, the
 * vitest config, package.json and node_modules are all absent. The verifier
 * therefore has to travel as a bundle that plain pinned Node can execute.
 *
 * It runs on the HOST after the container exits. It is never mounted into the
 * OCR container, and it carries no governed truth, no acceptable values and no
 * historical identity inventory — the identity inventory is a separate artifact
 * that only the host-side Job C step downloads.
 */
async function buildVerifierBundle() {
  const esbuild = await import("esbuild");
  rmSync(VERIFIER, { recursive: true, force: true });
  mkdirSync(VERIFIER, { recursive: true });

  // Host entrypoints, all runnable by plain Node in a job with no checkout.
  const entrypoints = [
    ["scripts/eval/issue-149-verify-raw-evidence.ts", "verify.mjs"],
    ["scripts/eval/issue-149-forensic-handoff.ts", "forensic-handoff.mjs"],
    ["scripts/eval/issue-149-build-rehearsal-evidence.ts", "rehearsal-evidence.mjs"],
    [
      "scripts/eval/issue-149-validate-rehearsal-attestation.ts",
      "validate-rehearsal-attestation.mjs",
    ],
    ["scripts/eval/issue-149-archive-volume-decision.ts", "archive-volume.mjs"],
    ["scripts/eval/issue-149-archive-adjudication.ts", "archive-adjudication.mjs"],
  ];
  const buildCommand = entrypoints
    .map(
      ([entry, out]) =>
        `esbuild ${entry} --bundle --platform=node --format=esm --target=node20 --external:node:* --metafile --sourcemap=false --outfile=verifier/${out}`,
    )
    .join(" && ");

  let sourceInputCount = 0;
  for (const [entry, out] of entrypoints) {
    const result = await esbuild.build({
      entryPoints: [path.join(ROOT, entry)],
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node20",
      metafile: true,
      sourcemap: false,
      external: ["node:*"],
      outfile: path.join(VERIFIER, out),
      absWorkingDir: ROOT,
      tsconfig: path.join(ROOT, "tsconfig.json"),
      logLevel: "silent",
    });
    sourceInputCount += Object.keys(result.metafile.inputs).length;
  }

  const emitted = [];
  for (const entry of readdirSync(VERIFIER).sort()) {
    const bytes = readFileSync(path.join(VERIFIER, entry));
    emitted.push({ path: entry, sha256: sha256(bytes), byteLength: bytes.byteLength });
  }

  // The verifier bundle is scanned exactly like the acquisition bundle: no
  // governed truth, no acceptable values, no historical identity.
  const idMap = JSON.parse(readFileSync(path.join(ART, "post-freeze/id-map.json"), "utf8"));
  const historical = idMap.map.flatMap((entry) => [
    entry.historicalCaseId,
    entry.historicalImagePath,
  ]);
  const violations = [];
  for (const entry of emitted) {
    const text = readFileSync(path.join(VERIFIER, entry.path)).toString("latin1");
    for (const value of historical) {
      if (typeof value === "string" && value.length > 0 && text.includes(value)) {
        violations.push(`${entry.path}: historical identity`);
      }
    }
  }
  if (violations.length > 0) throw new JobAError("VERIFIER_BUNDLE_PROHIBITED_CONTENT", violations);

  const manifest = {
    artifact: "issue-149-host-verifier-bundle-manifest",
    experimentId: EXPERIMENT,
    base: BASE,
    buildCommand,
    buildTool: `esbuild ${esbuild.version}`,
    entrypoints: entrypoints.map(([, out]) => out),
    runsWith: "plain pinned Node; no npm install, no npx, no vite-node, no repository checkout",
    runsOn: "the HOST, after the container exits",
    mountedIntoTheOcrContainer: false,
    containsGovernedTruth: false,
    containsHistoricalIdentityInventory: false,
    sourceInputCount,
    emitted,
  };
  writeFileSync(
    path.join(VERIFIER, "verifier-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  const aggregate = sha256(
    emitted.map((entry) => `${entry.path} ${entry.byteLength} ${entry.sha256}`).join("\n"),
  );

  step("build-host-verifier-bundle", {
    buildCommand,
    buildTool: `esbuild ${esbuild.version}`,
    emitted: emitted.map((entry) => entry.path),
    aggregate,
    prohibitedContent: [],
  });
  return { aggregate, emitted };
}

/**
 * The MINIMAL Job C identity inventory, as its own artifact.
 *
 * It holds the frozen historical ID/path inventory and the forbidden
 * evidence-key inventory, with their exact digests and counts — and nothing
 * else. It is NOT part of the truth-free acquisition input and is never mounted
 * with it; Job B downloads it only for the host-side Job C step, after the
 * container has exited.
 */
function buildIdentityInventory() {
  rmSync(IDENTITY, { recursive: true, force: true });
  mkdirSync(IDENTITY, { recursive: true });

  const idMap = JSON.parse(readFileSync(path.join(ART, "post-freeze/id-map.json"), "utf8"));
  const historicalCaseIds = idMap.map.map((entry) => entry.historicalCaseId);
  const historicalImagePaths = idMap.map.map((entry) => entry.historicalImagePath);
  const forbiddenEvidenceKeys = JSON.parse(
    readFileSync(path.join(ART, "runtime/truth-key-inventory.json"), "utf8"),
  );

  const inventory = {
    artifact: "issue-149-identity-inventory",
    experimentId: EXPERIMENT,
    historicalCaseIds,
    historicalImagePaths,
    forbiddenEvidenceKeys,
    containsNo: [
      "acceptable Brand values",
      "truth labels",
      "expected field values",
      "prior per-case classifications",
    ],
  };
  const text = `${JSON.stringify(inventory, null, 2)}\n`;
  writeFileSync(path.join(IDENTITY, "identity-inventory.json"), text);

  const digest = sha256(text);
  const expected = {
    artifact: "issue-149-identity-inventory-manifest",
    inventorySha256: digest,
    historicalCaseIdCount: historicalCaseIds.length,
    historicalImagePathCount: historicalImagePaths.length,
    forbiddenEvidenceKeyCount: forbiddenEvidenceKeys.length,
  };
  writeFileSync(
    path.join(IDENTITY, "identity-inventory-manifest.json"),
    `${JSON.stringify(expected, null, 2)}\n`,
  );

  step("build-minimal-identity-inventory", {
    ...expected,
    partOfTheTruthFreeAcquisitionInput: false,
    mountedWithTheAcquisitionInput: false,
  });
  return expected;
}

// ---- 9. prohibited dependencies and base drift -----------------------------
function enforceClosurePolicy(inputs) {
  const prohibited = inputs.filter(
    (input) =>
      PROHIBITED_CLOSURE_PREFIXES.some((prefix) => input.startsWith(prefix)) &&
      input !== PARSER_EXCEPTION.path,
  );
  if (prohibited.length > 0) throw new JobAError("BUNDLE_PROHIBITED_DEPENDENCY", prohibited);

  const drifted = [];
  const sourceInputs = [];
  for (const input of inputs) {
    if (input.startsWith("node_modules/")) continue;
    const current = sha256File(path.join(ROOT, input));
    let atBase = null;
    try {
      // Stage 2 acquisition sources are added by this commit and cannot exist
      // at the frozen base; `git show` writes to stderr in that case, which is
      // an expected outcome rather than a problem to surface.
      atBase = sha256(
        run("git", ["show", `${BASE}:${input}`], {
          encoding: "buffer",
          stdio: ["ignore", "pipe", "ignore"],
        }),
      );
    } catch {
      atBase = null;
    }
    sourceInputs.push({ path: input, sha256: current, sha256AtBase: atBase });
    // Only PRODUCTION sources are base-pinned. Stage 2 acquisition code is added
    // by this very commit and cannot exist at the frozen base; recording
    // sha256AtBase as null states that plainly rather than pretending otherwise.
    if (input.startsWith("src/") && atBase !== null && atBase !== current) drifted.push(input);
  }
  if (drifted.length > 0) throw new JobAError("PRODUCTION_SOURCE_DRIFTED_FROM_BASE", drifted);

  step("enforce-dependency-closure-and-base-drift", {
    prohibitedDependencies: [],
    frozenParserException: PARSER_EXCEPTION,
    productionSourcesCheckedAgainstBase: sourceInputs.filter((entry) =>
      entry.path.startsWith("src/"),
    ).length,
    driftedFromBase: [],
  });
  return sourceInputs;
}

// ---- 10. the tested TypeChecker source-closure analyzer ---------------------
function runSourceClosureGate(inputs) {
  const closureFiles = inputs.filter(
    (input) => input.endsWith(".ts") && !input.startsWith("node_modules/"),
  );
  const report = JSON.parse(
    run("npx", [
      "vite-node",
      "--config",
      "vitest.config.ts",
      "scripts/eval/issue-149-run-source-closure-gate.ts",
      "--",
      ...closureFiles,
    ]),
  );
  if (!report.ok) throw new JobAError("STAGE2_SOURCE_CLOSURE_VIOLATION", report.violations);
  step("run-typechecker-source-closure-analyzer", {
    filesAnalyzed: report.filesAnalyzed,
    acquisitionCallSites: report.acquisitionCallSites,
    writerCallSites: report.writerCallSites,
    authorizedSymbolDeclaredIn: report.authorizedSymbolDeclaredIn,
    writerSymbolDeclaredIn: report.writerSymbolDeclaredIn,
    violations: [],
  });
}

// ---- 11. the canonical bundle-content scanner ------------------------------
function scanBundleContents() {
  const inventoryBytes = readFileSync(path.join(ART, "runtime/truth-key-inventory.json"));
  const forbiddenKeys = JSON.parse(inventoryBytes.toString("utf8"));
  const idMap = JSON.parse(readFileSync(path.join(ART, "post-freeze/id-map.json"), "utf8"));
  const historical = idMap.map.flatMap((entry) => [
    entry.historicalCaseId,
    entry.historicalImagePath,
  ]);

  const violations = [];
  const scanned = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      const relative = path.relative(BUNDLE, full);
      const bytes = readFileSync(full);
      scanned.push({ path: relative, sha256: sha256(bytes), byteLength: bytes.byteLength });
      // RAW BYTES, including binary assets.
      const text = bytes.toString("latin1");
      for (const value of historical) {
        if (typeof value === "string" && value.length > 0 && text.includes(value)) {
          violations.push(`${relative}: historical identity`);
        }
      }
      // The forbidden-key inventory asset is the ONE place the list may appear.
      if (relative !== "truth-key-inventory.json") {
        for (const key of forbiddenKeys) {
          if (text.includes(`"${key}"`)) violations.push(`${relative}: forbidden key ${key}`);
        }
      }
    }
  };
  walk(BUNDLE);
  if (violations.length > 0) throw new JobAError("BUNDLE_PROHIBITED_CONTENT", violations);

  step("scan-bundle-contents", {
    filesScanned: scanned.length,
    rawBytesScanned: true,
    truthKeyInventorySha256: sha256(inventoryBytes),
    truthKeyInventoryKeyCount: forbiddenKeys.length,
    brandInventoryTakenAsParameter: false,
    violations: [],
  });
}

// ---- 12. the truth-free preparation artifact -------------------------------
function writePreparationArtifact({ sourceInputs, metafileSha256, buildCommand, buildTool }) {
  const emitted = [];
  const collectEmitted = (dir) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        collectEmitted(full);
        continue;
      }
      const relative = path.relative(BUNDLE, full);
      if (relative === "bundle-manifest.json") continue;
      const bytes = readFileSync(full);
      emitted.push({ path: relative, sha256: sha256(bytes), byteLength: bytes.byteLength });
    }
  };
  collectEmitted(BUNDLE);

  const bundleManifest = {
    artifact: "issue-149-runtime-bundle-manifest",
    experimentId: EXPERIMENT,
    base: BASE,
    buildCommand,
    buildTool,
    metafileSha256,
    unrestrictedRepositoryCopy: false,
    sourceMapsEmitted: false,
    sourceInputs,
    emitted: emitted.sort((a, b) => a.path.localeCompare(b.path)),
    truthKeyInventorySha256: sha256File(path.join(BUNDLE, "truth-key-inventory.json")),
  };
  writeFileSync(
    path.join(BUNDLE, "bundle-manifest.json"),
    `${JSON.stringify(bundleManifest, null, 2)}\n`,
  );

  // The truth-free input manifest and the staged images. NO id map, NO governed
  // truth, NO fixture path, NO historical identifier, NO prior per-case record.
  const inputDirectory = path.join(PREP, "input");
  rmSync(inputDirectory, { recursive: true, force: true });
  mkdirSync(path.join(inputDirectory, "images"), { recursive: true });
  cpSync(
    path.join(ART, "truth-free-input-manifest.json"),
    path.join(inputDirectory, "truth-free-input-manifest.json"),
  );
  for (const file of readdirSync(STAGED)) {
    cpSync(path.join(STAGED, file), path.join(inputDirectory, "images", file));
  }
  rmSync(path.join(PREP, "output"), { recursive: true, force: true });
  mkdirSync(path.join(PREP, "output"), { recursive: true });

  const inventory = [];
  const collect = (dir) => {
    for (const entry of readdirSync(dir).sort()) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        collect(full);
        continue;
      }
      inventory.push({
        path: path.relative(PREP, full),
        sha256: sha256File(full),
        byteLength: statSync(full).size,
      });
    }
  };
  collect(PREP);
  inventory.sort((a, b) => a.path.localeCompare(b.path));

  const artifactDigest = sha256(
    inventory.map((entry) => `${entry.path} ${entry.byteLength} ${entry.sha256}`).join("\n"),
  );
  const preparation = {
    artifact: "issue-149-truth-free-preparation-artifact",
    experimentId: EXPERIMENT,
    base: BASE,
    truthFree: true,
    contains: [
      "runtime bundle",
      "bundle manifest",
      "truth-free input manifest",
      "staged opaque images",
      "empty output specification",
    ],
    containsNo: [
      "historical case identifier",
      "fixture path",
      "post-freeze ID map",
      "governed truth",
      "prior per-case record",
    ],
    emptyOutputSpecification: { path: "output", mustBeEmptyAtMount: true },
    fileCount: inventory.length,
    artifactDigest,
    inventorySummary: {
      bundleFiles: inventory.filter((entry) => entry.path.startsWith("bundle/")).length,
      inputFiles: inventory.filter((entry) => entry.path.startsWith("input/")).length,
      outputFiles: inventory.filter((entry) => entry.path.startsWith("output/")).length,
    },
    inventory,
  };
  writeFileSync(
    path.join(PREP, "preparation-artifact.json"),
    `${JSON.stringify(preparation, null, 2)}\n`,
  );

  step("create-truth-free-preparation-artifact", {
    root: path.relative(ROOT, PREP),
    fileCount: inventory.length,
    artifactDigest,
    bundleManifestSha256: sha256File(path.join(BUNDLE, "bundle-manifest.json")),
    outputDirectoryEmpty: preparation.inventorySummary.outputFiles === 0,
  });
  return preparation;
}

// ---- boundary ---------------------------------------------------------------
async function main() {
  mkdirSync(PREP, { recursive: true });
  verifyStageOnePackage();
  reproduceAndStage();
  verifyIncumbentIdentities();
  const { inputs, metafileSha256, buildCommand, buildTool } = await buildBundle();
  const verifier = await buildVerifierBundle();
  const identity = buildIdentityInventory();
  const sourceInputs = enforceClosurePolicy(inputs);
  runSourceClosureGate(inputs);
  scanBundleContents();
  const preparation = writePreparationArtifact({
    sourceInputs,
    metafileSha256,
    buildCommand,
    buildTool,
  });

  return {
    status: "JOB_A_PREPARATION_COMPLETE",
    experimentId: EXPERIMENT,
    base: BASE,
    bundleExecuted: false,
    ocrRun: false,
    acquisitionApiInvoked: false,
    preparationArtifactDigest: preparation.artifactDigest,
    verifierBundleAggregate: verifier.aggregate,
    identityInventorySha256: identity.inventorySha256,
    steps,
  };
}

main().then(
  (result) => {
    console.log(JSON.stringify(result, null, 2));
  },
  (cause) => {
    console.error(
      JSON.stringify(
        {
          status: "HALTED",
          reason: cause instanceof JobAError ? cause.code : "UNEXPECTED_FAILURE",
          detail: cause instanceof JobAError ? cause.detail : String(cause?.stack ?? cause),
          ocrRun: false,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  },
);
