/**
 * Issue #149 — the freeze script must reproduce its own committed artifacts.
 *
 * Non-OCR. Check mode writes only into `.local/`, touches no tracked artifact and
 * no real staging directory, and runs no recognizer.
 *
 * Job A is preregistered to rerun the freeze script and require bit-for-bit
 * reproduction of the committed outputs. Amendment 6 corrected the committed ID
 * map but not its generator, so Job A would have had to either fail or overwrite
 * reviewed artifacts with superseded metadata. This test is the standing guard
 * against that class of divergence.
 */
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  HALT_CODES,
  verifyWorkingTree,
  defaultModeForEnvironment,
  evaluateWorkingTree,
  parsePorcelain,
  resolveMode,
} from "../../../scripts/eval/issue-149-stage-1-working-tree.mjs";
import { describe, expect, it } from "vitest";

import {
  EVAL_MANIFEST_PATH,
  FreezeError,
  PR217_PATH,
  PR218_PATH,
  compareGeneratedArtifacts,
  generateStageOneArtifacts,
} from "../../../scripts/eval/lib/issue-149-freeze-core.mjs";

const SCRIPT = "scripts/eval/issue-149-brand-evidence-acquisition-freeze.mjs";
const CORE = "scripts/eval/lib/issue-149-freeze-core.mjs";
const ROOT = "artifacts/issue-149-brand-complete-evidence-acquisition";
const REAL_STAGED = path.join(process.cwd(), ".local/issue-149-acquisition-inputs");
const GOVERNED_DIRECTORY = "artifacts/issue-149-brand-complete-evidence-acquisition";

const read = (p: string): unknown => JSON.parse(readFileSync(path.join(process.cwd(), p), "utf8"));
const GENERATED = [
  `${ROOT}/truth-free-input-manifest.json`,
  `${ROOT}/population-freeze.json`,
  `${ROOT}/post-freeze/id-map.json`,
];

function runCheck(): { status: string; [key: string]: unknown } {
  const stdout = execFileSync("node", [SCRIPT, "--check"], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(stdout) as { status: string };
}

describe("Issue #149 Stage 1 generated-artifact reproducibility", () => {
  it("reproduces all three committed artifacts byte-for-byte", () => {
    const before = GENERATED.map((file) => readFileSync(path.join(process.cwd(), file)));

    const report = runCheck() as {
      status: string;
      artifactsCompared: string[];
      byteIdentical: boolean;
      trackedArtifactsModified: boolean;
      realStagingDirectoryModified: boolean;
      ocrRun: boolean;
    };

    expect(report.status).toBe("STAGE_1_GENERATED_ARTIFACTS_REPRODUCIBLE");
    expect(report.byteIdentical).toBe(true);
    expect(report.ocrRun).toBe(false);
    expect(report.artifactsCompared).toEqual([
      "truth-free-input-manifest.json",
      "population-freeze.json",
      "post-freeze/id-map.json",
    ]);

    // Check mode must not have rewritten what it was comparing against.
    const after = GENERATED.map((file) => readFileSync(path.join(process.cwd(), file)));
    after.forEach((bytes, index) => expect(bytes.equals(before[index])).toBe(true));
    expect(report.trackedArtifactsModified).toBe(false);
    expect(report.realStagingDirectoryModified).toBe(false);
  }, 180_000);

  it("uses a unique temporary directory rather than one fixed scratch path", () => {
    const cli = readFileSync(path.join(process.cwd(), SCRIPT), "utf8");
    expect(cli).toContain("mkdtempSync");
    expect(cli).not.toContain(".local/issue-149-freeze-check");
    expect(existsSync(path.join(process.cwd(), ".local/issue-149-freeze-check"))).toBe(false);
  });

  it("uses one implementation for staging and for checking", () => {
    // Two separately maintained serializers would let the check pass while the
    // real staging path drifted. Both entry points call the shared core; the CLI
    // holds no generation logic of its own.
    const cli = readFileSync(path.join(process.cwd(), SCRIPT), "utf8");
    expect(cli).toContain("generateStageOneArtifacts");
    expect(cli.match(/generateStageOneArtifacts\(/g) ?? []).toHaveLength(2);
    expect(cli).not.toContain("writeJson");
    expect(cli).not.toContain("copyFileSync");

    const core = readFileSync(path.join(process.cwd(), CORE), "utf8");
    expect(core.match(/writeJson\(/g) ?? []).toHaveLength(3);
    expect(core).toMatch(/export function generateStageOneArtifacts/);
  });

  it("never calls process.exit from the core or the generation path", () => {
    // process.exit from inside a try terminates before finally can remove the
    // temporary staging tree, so cleanup was not actually guaranteed on failure.
    const core = readFileSync(path.join(process.cwd(), CORE), "utf8");
    // The call, not the word: the comment explains why the call is absent.
    expect(core).not.toContain("process.exit(");
    expect(core).toContain("throw new FreezeError");
    const cli = readFileSync(path.join(process.cwd(), SCRIPT), "utf8");
    expect(cli).not.toContain("process.exit(");
    expect(cli).toContain("process.exitCode = 1");
    expect(cli).toContain("mkdtempSync");
  });

  describe("intentional drift", () => {
    it("halts, reports the preregistered code, and still cleans up", () => {
      // A real failing check against deliberately mutated expected artifacts,
      // rather than a search for the halt-code string in the source.
      const scratch = mkdtempSync(path.join(tmpdir(), "issue-149-drift-expected-"));
      const before = GENERATED.map((file) => readFileSync(path.join(process.cwd(), file)));
      const stagedBefore = existsSync(REAL_STAGED) ? readdirSync(REAL_STAGED).sort() : "ABSENT";

      try {
        // Copy the committed artifacts, then flip one byte of one of them.
        const expected = {
          truthFreeInputManifest: path.join(scratch, "truth-free-input-manifest.json"),
          populationFreeze: path.join(scratch, "population-freeze.json"),
          idMap: path.join(scratch, "id-map.json"),
        };
        const sources = [
          `${ROOT}/truth-free-input-manifest.json`,
          `${ROOT}/population-freeze.json`,
          `${ROOT}/post-freeze/id-map.json`,
        ];
        Object.values(expected).forEach((destination, index) =>
          copyFileSync(path.join(process.cwd(), sources[index]), destination),
        );
        const mutated = readFileSync(expected.idMap);
        mutated[mutated.length - 2] = mutated[mutated.length - 2] === 0x20 ? 0x09 : 0x20;
        writeFileSync(expected.idMap, mutated);

        // Drive the REAL core and comparator, into their own temporary output.
        const generationRoot = mkdtempSync(path.join(tmpdir(), "issue-149-drift-generated-"));
        let thrown: unknown;
        try {
          const generated = generateStageOneArtifacts({
            pr217: read(PR217_PATH) as Parameters<typeof generateStageOneArtifacts>[0]["pr217"],
            pr218: read(PR218_PATH) as Parameters<typeof generateStageOneArtifacts>[0]["pr218"],
            evalManifest: read(EVAL_MANIFEST_PATH) as Parameters<
              typeof generateStageOneArtifacts
            >[0]["evalManifest"],
            loadSourceImage: (imagePath: string) =>
              readFileSync(path.join(process.cwd(), imagePath)),
            forbiddenEvidenceKeys: read(`${ROOT}/runtime/truth-key-inventory.json`) as string[],
            out: {
              root: path.join(generationRoot, "artifacts"),
              postFreeze: path.join(generationRoot, "artifacts/post-freeze"),
              staged: path.join(generationRoot, "staged"),
            },
          });
          compareGeneratedArtifacts({ generated: generated.written, expected });
        } catch (error) {
          thrown = error;
        } finally {
          rmSync(generationRoot, { recursive: true, force: true });
          expect(existsSync(generationRoot)).toBe(false);
        }

        expect(thrown).toBeInstanceOf(FreezeError);
        expect((thrown as InstanceType<typeof FreezeError>).code).toBe(
          "STAGE_1_GENERATED_ARTIFACT_DRIFT",
        );
        expect((thrown as InstanceType<typeof FreezeError>).ocrRun).toBe(false);
        const detail = (thrown as InstanceType<typeof FreezeError>).detail as Array<{
          artifact: string;
        }>;
        expect(detail.map((entry) => entry.artifact)).toEqual(["post-freeze/id-map.json"]);
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }

      // Tracked artifacts and the real staging directory are untouched.
      const after = GENERATED.map((file) => readFileSync(path.join(process.cwd(), file)));
      after.forEach((bytes, index) => expect(bytes.equals(before[index])).toBe(true));
      const stagedAfter = existsSync(REAL_STAGED) ? readdirSync(REAL_STAGED).sort() : "ABSENT";
      expect(stagedAfter).toEqual(stagedBefore);
    }, 180_000);

    it("returns a non-success status and exit code from the CLI on drift", () => {
      // The CLI boundary, end to end, against TEMPORARY expected artifacts. An
      // earlier version appended a byte to the committed population-freeze.json
      // and restored it in `finally`, which protects the final working tree but
      // races with any other Vitest file reading the same governed package.
      const expectedRoot = mkdtempSync(path.join(tmpdir(), "issue-149-drift-cli-expected-"));
      const before = GENERATED.map((file) => readFileSync(path.join(process.cwd(), file)));
      try {
        const destinations = [
          path.join(expectedRoot, "truth-free-input-manifest.json"),
          path.join(expectedRoot, "population-freeze.json"),
          path.join(expectedRoot, "id-map.json"),
        ];
        GENERATED.forEach((source, index) =>
          copyFileSync(path.join(process.cwd(), source), destinations[index]),
        );
        writeFileSync(
          destinations[1],
          Buffer.concat([readFileSync(destinations[1]), Buffer.from("\n")]),
        );

        let status = 0;
        let stderr = "";
        try {
          execFileSync("node", [SCRIPT, "--check", `--expected-root=${expectedRoot}`], {
            cwd: process.cwd(),
            encoding: "utf8",
            maxBuffer: 32 * 1024 * 1024,
            stdio: ["ignore", "pipe", "pipe"],
          });
        } catch (error) {
          const failure = error as { status?: number; stderr?: string };
          status = failure.status ?? 0;
          stderr = failure.stderr ?? "";
        }
        expect(status).toBe(1);
        const report = JSON.parse(stderr) as {
          status: string;
          reason: string;
          ocrRun: boolean;
          detail: Array<{ artifact: string }>;
        };
        expect(report.status).toBe("HALTED");
        expect(report.reason).toBe("STAGE_1_GENERATED_ARTIFACT_DRIFT");
        expect(report.ocrRun).toBe(false);
        expect(report.detail.map((entry) => entry.artifact)).toEqual(["population-freeze.json"]);
      } finally {
        rmSync(expectedRoot, { recursive: true, force: true });
      }
      expect(existsSync(expectedRoot)).toBe(false);

      // No tracked artifact was ever opened for writing.
      const after = GENERATED.map((file) => readFileSync(path.join(process.cwd(), file)));
      after.forEach((bytes, index) => expect(bytes.equals(before[index])).toBe(true));
    }, 300_000);
  });

  describe("tracked Stage 1 artifacts are not written by tests", () => {
    it("verifies the contract manifest through the REAL verifier", () => {
      // The authoritative intactness check: the real manifest verifier, run end
      // to end through the CLI entrypoint. It proves the package's recorded
      // digests match the files on disk NOW; it cannot detect a write that was
      // performed and restored mid-test. The intentional-drift tests
      // demonstrably use only temporary paths, which is a separate and
      // executable fact.
      //
      // The working-tree VERDICT is deliberately NOT asserted here. Local
      // amendment work leaves the repository dirty by construction, and a check
      // that has to tolerate that is the check this amendment removed. The
      // verdict belongs to the `posttest` lifecycle, which runs `--clean` on a
      // committed tree after the suite; the mode-specific cases below drive the
      // real evaluator directly.
      const report = verifyWorkingTree(["--clean"]) as {
        status: string;
        manifestVerified?: boolean;
        reason?: string;
      };
      expect(report.reason).not.toBe(HALT_CODES.MANIFEST_UNVERIFIED);
      if (report.status !== "HALTED") expect(report.manifestVerified).toBe(true);
    }, 180_000);

    it("verifies the working tree through the REAL mode-explicit verifier", () => {
      // The previous version of this assertion inferred its own regime: a
      // nonempty porcelain status was read as "an amendment must be in
      // progress", so anything that dirtied the tree also switched the check
      // into its lenient branch and the strict assertion could never fail.
      // That branch is gone. The mode is now an explicit argument, and these
      // cases drive the real `evaluateWorkingTree`/`resolveMode` rather than
      // restating what they are supposed to do.
      const dirty = parsePorcelain(
        [
          ` M ${GOVERNED_DIRECTORY}/preregistration.md`,
          `?? ${GOVERNED_DIRECTORY}/preregistration-amendment-12.md`,
        ].join("\n"),
      );
      const manifested = new Set([`${GOVERNED_DIRECTORY}/preregistration-amendment-12.md`]);

      // Clean mode fails on ANY difference. No allowance, no work-in-progress.
      const strict = evaluateWorkingTree({
        mode: "clean",
        entries: dirty,
        manifestedPaths: manifested,
      });
      expect(strict).toMatchObject({ ok: false, code: HALT_CODES.DIRTY });

      // Local mode permits that same diff, because it is confined to the package
      // and the untracked file is manifested.
      const lenient = evaluateWorkingTree({
        mode: "local",
        entries: dirty,
        manifestedPaths: manifested,
      });
      expect(lenient.ok).toBe(true);

      // Local mode is still a real check: a path outside the package fails, and
      // so does an untracked governed file the manifest does not account for.
      expect(
        evaluateWorkingTree({
          mode: "local",
          entries: parsePorcelain(" M src/pipeline/extractor/extractor.ts"),
          manifestedPaths: manifested,
        }),
      ).toMatchObject({ ok: false, code: HALT_CODES.OUTSIDE_PACKAGE });

      // ...and that outcome is REACHABLE from the CLI, which it previously was
      // not: local mode scoped `git status` to the governed directory, so an
      // outside modification could never enter `entries` at all.
      const localScope = verifyWorkingTree.toString();
      expect(localScope).toContain('run("git", ["status", "--porcelain"])');
      expect(
        evaluateWorkingTree({
          mode: "local",
          entries: parsePorcelain(`?? ${GOVERNED_DIRECTORY}/scratch.json`),
          manifestedPaths: manifested,
        }),
      ).toMatchObject({ ok: false, code: HALT_CODES.UNACCOUNTED });

      // Clean mode passes only on an actually clean package.
      expect(
        evaluateWorkingTree({ mode: "clean", entries: [], manifestedPaths: manifested }).ok,
      ).toBe(true);
    });

    it("never infers the mode, and selects the strict one in CI", () => {
      // No mode is not a default-to-lenient; it is a halt.
      expect(resolveMode([])).toMatchObject({ ok: false, code: HALT_CODES.NO_MODE });
      expect(resolveMode(["--clean", "--local"])).toMatchObject({
        ok: false,
        code: HALT_CODES.AMBIGUOUS_MODE,
      });
      expect(resolveMode(["--clean"])).toMatchObject({ ok: true, mode: "clean" });
      expect(resolveMode(["--local"])).toMatchObject({ ok: true, mode: "local" });

      // `--mode-from-env` reads the ENVIRONMENT, never the working tree.
      expect(defaultModeForEnvironment({ CI: "true" })).toBe("--clean");
      expect(defaultModeForEnvironment({ CI: "1" })).toBe("--clean");
      expect(defaultModeForEnvironment({})).toBe("--local");
      expect(resolveMode(["--mode-from-env"], { CI: "true" })).toMatchObject({
        ok: true,
        mode: "clean",
        modeSource: "environment",
      });
      expect(resolveMode(["--mode-from-env"], {})).toMatchObject({ ok: true, mode: "local" });

      // A dirty tree cannot change the mode: the selector never sees one.
      // The selector cannot consult the working tree: it receives only argv and
      // an environment, and its body names no Git command.
      const selectorSource = resolveMode.toString();
      for (const marker of [["porce", "lain"].join(""), ["git ", "status"].join(""), "execFile"]) {
        expect(selectorSource).not.toContain(marker);
      }
    });

    it("asks Git about the WHOLE repository in local mode", () => {
      // An end-to-end demonstration on a throwaway repository: a modification
      // OUTSIDE the governed package must fail --local. This cannot be shown by
      // dirtying the real checkout, so a scratch repository stands in.
      const scratch = mkdtempSync(path.join(tmpdir(), "issue-149-worktree-scope-"));
      try {
        const governed = path.join(scratch, GOVERNED_DIRECTORY);
        mkdirSync(path.join(scratch, "src"), { recursive: true });
        mkdirSync(governed, { recursive: true });
        writeFileSync(path.join(scratch, "src/production.ts"), "export const x = 1;\n");
        writeFileSync(path.join(governed, "contract.json"), "{}\n");

        const git = (...args: string[]): string =>
          execFileSync("git", args, { cwd: scratch, encoding: "utf8" });
        git("init", "--quiet");
        git("config", "user.email", "test@example.com");
        git("config", "user.name", "test");
        git("add", "-A");
        git("commit", "--quiet", "-m", "base");

        // Clean: nothing differs anywhere.
        expect(parsePorcelain(git("status", "--porcelain"))).toEqual([]);

        // Now change a file OUTSIDE the governed package.
        writeFileSync(path.join(scratch, "src/production.ts"), "export const x = 2;\n");
        const repositoryWide = parsePorcelain(git("status", "--porcelain"));
        const packageScoped = parsePorcelain(
          git("status", "--porcelain", "--", GOVERNED_DIRECTORY),
        );

        // The scoped query cannot see it. That is precisely why local mode must
        // not use the scoped query.
        expect(packageScoped).toEqual([]);
        expect(repositoryWide.map((entry) => entry.file)).toEqual(["src/production.ts"]);

        expect(
          evaluateWorkingTree({
            mode: "local",
            entries: repositoryWide,
            manifestedPaths: new Set<string>(),
          }),
        ).toMatchObject({ ok: false, code: HALT_CODES.OUTSIDE_PACKAGE });
        expect(
          evaluateWorkingTree({
            mode: "local",
            entries: packageScoped,
            manifestedPaths: new Set<string>(),
          }),
        ).toMatchObject({ ok: true });
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    }, 60_000);

    it("runs the strict check AFTER the suite, via the posttest lifecycle", () => {
      // Verifying cleanliness BEFORE the tests proves nothing about the tests.
      const scripts = (
        JSON.parse(readFileSync(path.join(process.cwd(), "package.json"), "utf8")) as {
          scripts: Record<string, string>;
        }
      ).scripts;
      expect(scripts.posttest).toBe(
        "node scripts/eval/issue-149-stage-1-working-tree.mjs --mode-from-env",
      );
      expect(scripts.test).toBe("vitest run");
    });

    it("describes clean mode's scope exactly, without overclaiming", () => {
      // Clean mode intentionally checks the governed package only. It is the
      // post-suite "the tests changed nothing" assertion, not a repository-wide
      // cleanliness claim, and the source must not describe it as one.
      const source = readFileSync(
        path.join(process.cwd(), "scripts/eval/issue-149-stage-1-working-tree.mjs"),
        "utf8",
      );
      const prose = source.replace(/\s*\n\s*(?:\/\/)?\s*/g, " ");
      expect(prose).toContain("`--clean` deliberately checks the governed package ONLY");
      expect(prose).toContain("not a repository-wide cleanliness claim");
      expect(prose).toContain(
        "`--local` claims every difference is confined to the governed package, so it must ask Git about the WHOLE REPOSITORY",
      );
    });

    it("finds no obvious tracked write in the Stage 1 tests — a SUPPLEMENTARY heuristic", () => {
      // Deliberately labelled. This scans a fixed set of filesystem call names in
      // a small source window. It cannot see aliases, `fs.promises`, helper
      // functions or indirect writes, so it is a smoke check and NOT proof that a
      // tracked write is impossible. The authoritative facts are the test above
      // and the drift tests, which use only temporary expected artifacts.
      const testsDirectory = path.join(process.cwd(), "src/fixtures/eval");
      const stage1Tests = readdirSync(testsDirectory).filter(
        (entry) => entry.startsWith("issue-149-") && entry.endsWith(".test.ts"),
      );
      expect(stage1Tests.length).toBeGreaterThanOrEqual(8);

      const writers = [
        /writeFileSync\(/,
        /appendFileSync\(/,
        /copyFileSync\(/,
        /rmSync\(/,
        /mkdirSync\(/,
      ];
      const offences: string[] = [];
      for (const file of stage1Tests) {
        const source = readFileSync(path.join(testsDirectory, file), "utf8");
        const lines = source.split("\n");
        lines.forEach((line, index) => {
          if (!writers.some((pattern) => pattern.test(line))) return;
          const window = lines.slice(index, index + 4).join(" ");
          if (!/ROOT|artifacts\/issue-149-brand-complete-evidence-acquisition/.test(window)) return;
          if (/expectedRoot|scratch|tmpdir\(\)|destinations\[/.test(window)) return;
          offences.push(`${file}:${index + 1}`);
        });
      }
      expect(offences).toEqual([]);
    });
  });

  it("reads the forbidden-key inventory from the canonical asset", () => {
    // Not from a list maintained inside the script; a second list is a second
    // source of truth.
    const cli = readFileSync(path.join(process.cwd(), SCRIPT), "utf8");
    expect(cli).toContain('path.join(ROOT, "runtime/truth-key-inventory.json")');
    expect(cli).toContain("forbiddenEvidenceKeys");
    // The superseded inline substring list is gone.
    expect(cli).not.toContain('["truth", "acceptable", "brandPresent", "expected"');
  });

  it("generates the corrected id-map boundary and none of the obsolete aliases", () => {
    const source = readFileSync(path.join(process.cwd(), CORE), "utf8");
    for (const key of [
      "trustedStagingMayReadGenerateAndVerify",
      "mountedIntoIsolatedDiscovery",
      "mountedIntoIsolatedExecution",
      "importedByAcquisitionCode",
      "physicalInaccessibilityClaimed",
    ]) {
      expect(source).toContain(key);
    }
    // The obsolete keys appear only inside the comment explaining their removal.
    const boundary = source.slice(
      source.indexOf("const ID_MAP_ACCESS_BOUNDARY = {"),
      source.indexOf("const sha256 ="),
    );
    for (const obsolete of [
      "readableOnlyAfter",
      "mountedIntoAcquisition",
      "importedByAcquisitionHarness",
    ]) {
      expect(boundary).not.toContain(obsolete);
    }
  });
});
