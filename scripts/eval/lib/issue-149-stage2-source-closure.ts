/**
 * Issue #149 — the Stage 2 acquisition source-closure analyzer.
 *
 * **Host-only. Never included in the runtime bundle and never present in Job B.**
 * Evaluation-only and non-OCR: it parses source text and runs nothing.
 *
 * Job A and the Stage 1 synthetic tests use this one implementation, so the gate
 * that will run before acquisition is the gate the tests exercise.
 *
 * ## Why a parser rather than substring matching
 *
 * The previous detector lived inside a test file and worked by substring
 * presence. Two problems followed. It could not tell a call from a mention, so it
 * approved a runner whose call shape could not satisfy the contract; and it
 * required *every* inspected file to invoke the acquisition API, which would have
 * rejected legitimate hashing, manifest and scanning helpers. This analyzer walks
 * the TypeScript AST and distinguishes the runner entrypoint from the rest of the
 * closure.
 */
import ts from "typescript";

/** The one module allowed to define and use the internal machinery. */
export const AUTHORIZED_ADAPTER_MODULE = "scripts/eval/lib/issue-149-candidate-adapter.ts";

/** The one call the runner entrypoint must make, exactly once. */
export const REQUIRED_ACQUISITION_CALL = "acquireProductionBrandEvidence";

/**
 * Calls that are prohibited anywhere outside the adapter module. Each is a route
 * by which a caller could obtain, construct or alter evidence the public API is
 * supposed to own.
 */
export const PROHIBITED_CALLS = [
  "extractLabelEvidenceDetailed",
  "selectBrandObservation",
  "selectBrandObservationWithCompleteFilterDiagnostics",
  "finalizeProductionBrandEvidence",
  "finalizeProductionCandidateArray",
  "toCandidateEvidenceRecord",
  "finalizeProductionCandidate",
  "finalizeCandidateRecord",
  "stableCandidateId",
] as const;

/**
 * Properties that must not be assigned, spread-replaced or constructed outside
 * the adapter. Reading them is fine — the runner persists
 * `detailed.debug.passes` — but writing or rebuilding them is how a filtered or
 * reordered population would be smuggled in.
 */
export const PROHIBITED_WRITES = [
  "primarySelections",
  "finalSelections",
  "brandDiagnostics",
  "candidates",
  "passes",
  "rankedPosition",
] as const;

export interface Stage2SourceFile {
  path: string;
  contents: string;
}

export interface Stage2ClosureInput {
  /** The runner entry file. It alone must invoke the acquisition API. */
  runnerEntryPath: string;
  /** The complete transitive Stage 2 source set, including the entry file. */
  files: Stage2SourceFile[];
  adapterModulePath?: string;
}

export interface Stage2ClosureViolation {
  path: string;
  rule:
    | "RUNNER_DOES_NOT_INVOKE_ACQUISITION"
    | "RUNNER_INVOKES_ACQUISITION_MORE_THAN_ONCE"
    | "ACQUISITION_INVOKED_OUTSIDE_RUNNER"
    | "PROHIBITED_CALL"
    | "PROHIBITED_WRITE"
    | "RUNNER_ENTRY_MISSING";
  detail: string;
}

export interface Stage2ClosureReport {
  ok: boolean;
  haltCode: "STAGE2_SOURCE_CLOSURE_VIOLATION" | null;
  violations: Stage2ClosureViolation[];
  acquisitionCallSites: string[];
  filesAnalyzed: number;
}

const parse = (file: Stage2SourceFile): ts.SourceFile =>
  ts.createSourceFile(file.path, file.contents, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);

/** The identifier a call expression ultimately targets, if it has one. */
function calleeName(node: ts.CallExpression): string | undefined {
  const target = node.expression;
  if (ts.isIdentifier(target)) return target.text;
  if (ts.isPropertyAccessExpression(target)) return target.name.text;
  return undefined;
}

/** Property writes: `x.foo = …`, `{ foo: … }` in an object literal, `foo:` shorthand. */
function writtenProperty(node: ts.Node): string | undefined {
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isPropertyAccessExpression(node.left)
  ) {
    return node.left.name.text;
  }
  if (ts.isPropertyAssignment(node)) {
    if (ts.isIdentifier(node.name)) return node.name.text;
    if (ts.isStringLiteral(node.name)) return node.name.text;
  }
  if (ts.isShorthandPropertyAssignment(node)) return node.name.text;
  return undefined;
}

/**
 * Analyze a complete Stage 2 source closure.
 *
 * The runner entrypoint must invoke the acquisition API exactly once. Every other
 * file — hashing, manifest writing, evidence scanning, pass validation — is
 * simply required to be free of prohibited routes. Requiring each of them to call
 * the API would reject legitimate helpers.
 */
export function analyzeStage2SourceClosure(input: Stage2ClosureInput): Stage2ClosureReport {
  const adapter = input.adapterModulePath ?? AUTHORIZED_ADAPTER_MODULE;
  const violations: Stage2ClosureViolation[] = [];
  const acquisitionCallSites: string[] = [];

  if (!input.files.some((file) => file.path === input.runnerEntryPath)) {
    violations.push({
      path: input.runnerEntryPath,
      rule: "RUNNER_ENTRY_MISSING",
      detail: "the runner entrypoint is not present in the analyzed closure",
    });
  }

  for (const file of input.files) {
    if (file.path === adapter) continue;

    const source = parse(file);
    const isRunner = file.path === input.runnerEntryPath;
    let acquisitionCalls = 0;

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const callee = calleeName(node);
        if (callee === REQUIRED_ACQUISITION_CALL) {
          acquisitionCalls += 1;
          acquisitionCallSites.push(file.path);
          if (!isRunner) {
            violations.push({
              path: file.path,
              rule: "ACQUISITION_INVOKED_OUTSIDE_RUNNER",
              detail: `${REQUIRED_ACQUISITION_CALL} is invoked outside the runner entrypoint`,
            });
          }
        } else if ((PROHIBITED_CALLS as readonly string[]).includes(callee ?? "")) {
          violations.push({
            path: file.path,
            rule: "PROHIBITED_CALL",
            detail: `calls ${callee}, which only ${adapter} may call`,
          });
        }
      }

      const written = writtenProperty(node);
      if (written !== undefined && (PROHIBITED_WRITES as readonly string[]).includes(written)) {
        violations.push({
          path: file.path,
          rule: "PROHIBITED_WRITE",
          detail: `constructs or replaces \`${written}\`, which only ${adapter} may derive`,
        });
      }

      ts.forEachChild(node, visit);
    };
    ts.forEachChild(source, visit);

    if (isRunner) {
      if (acquisitionCalls === 0) {
        violations.push({
          path: file.path,
          rule: "RUNNER_DOES_NOT_INVOKE_ACQUISITION",
          detail: `the runner entrypoint must invoke ${REQUIRED_ACQUISITION_CALL} exactly once`,
        });
      } else if (acquisitionCalls > 1) {
        violations.push({
          path: file.path,
          rule: "RUNNER_INVOKES_ACQUISITION_MORE_THAN_ONCE",
          detail: `${REQUIRED_ACQUISITION_CALL} is invoked ${acquisitionCalls} times; exactly one call is authorized`,
        });
      }
    }
  }

  return {
    ok: violations.length === 0,
    haltCode: violations.length === 0 ? null : "STAGE2_SOURCE_CLOSURE_VIOLATION",
    violations,
    acquisitionCallSites,
    filesAnalyzed: input.files.length,
  };
}
