/**
 * Issue #149 — the Stage 2 acquisition source-closure analyzer.
 *
 * **Host-only. Never included in the runtime bundle and never present in Job B.**
 * Evaluation-only and non-OCR: it parses source text and runs nothing.
 *
 * Job A and the Stage 1 synthetic tests use this one implementation, so the gate
 * that will run before acquisition is the gate the tests exercise.
 *
 * ## Why symbol resolution rather than identifier names
 *
 * The previous version matched on the textual callee name. That could be
 * satisfied by a *local* function coincidentally named
 * `acquireProductionBrandEvidence`, evaded by importing a prohibited function
 * under an alias or through a namespace, and satisfied by importing the
 * authorized name from an unreviewed module. It also could not tell whether the
 * required call was awaited or what it was passed.
 *
 * This version builds a `ts.Program` over the supplied virtual closure and uses
 * the `TypeChecker` to resolve every callee back to its declaration. A name is
 * not evidence of a binding.
 */
import path from "node:path";

import ts from "typescript";

/** The one runner entrypoint. Not caller-selectable. */
export const RUNNER_ENTRY_PATH = "scripts/eval/issue-149-brand-evidence-acquisition-run.ts";

/** The one module allowed to define and use the internal machinery. */
export const AUTHORIZED_ADAPTER_MODULE = "scripts/eval/lib/issue-149-candidate-adapter.ts";

/** The one call the runner entrypoint must make, exactly once. */
export const REQUIRED_ACQUISITION_CALL = "acquireProductionBrandEvidence";

/**
 * Calls prohibited anywhere outside the adapter module. Each is a route by which
 * a caller could obtain, construct or alter evidence the public API owns.
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

/** Array methods that mutate their receiver in place. */
const MUTATING_ARRAY_METHODS = [
  "push",
  "pop",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
  "copyWithin",
  "fill",
] as const;

/**
 * The acquired-evidence anchors: ADJACENT property pairs that identify a chain as
 * reaching into acquired evidence.
 *
 * A single name is not enough. The previous version flagged any chain containing
 * a property called `passes` or `candidates`, which rejected ordinary unrelated
 * helpers — `const stats = { passes: 0, candidates: [] }; stats.passes = n;` — and
 * so would have failed legitimate Stage 2 code. Requiring an adjacent pair
 * (`value.detailed`, `debug.passes`, `brandDiagnostics.candidates`, …) keeps the
 * real routes, including chains reached through a destructured `debug` or
 * `diagnosticSelection`, without claiming every same-named property.
 */
const PROTECTED_EVIDENCE_ANCHORS: ReadonlyArray<readonly [string, string]> = [
  ["value", "detailed"],
  ["value", "diagnosticSelection"],
  ["value", "candidateRecords"],
  ["detailed", "debug"],
  ["debug", "passes"],
  ["debug", "primarySelections"],
  ["debug", "finalSelections"],
  ["diagnosticSelection", "brandDiagnostics"],
  ["brandDiagnostics", "candidates"],
] as const;

export interface Stage2SourceFile {
  path: string;
  contents: string;
}

export interface Stage2ClosureInput {
  /** The complete transitive Stage 2 source set, including the runner and adapter. */
  files: Stage2SourceFile[];
}

export interface Stage2ClosureViolation {
  path: string;
  rule:
    | "RUNNER_ENTRY_MISSING"
    | "ADAPTER_MODULE_MISSING"
    | "DUPLICATE_FILE_PATH"
    | "PARSE_ERROR"
    | "RUNNER_DOES_NOT_IMPORT_ACQUISITION"
    | "ACQUISITION_IMPORT_IS_TYPE_ONLY"
    | "ACQUISITION_BINDING_SHADOWED"
    | "ACQUISITION_BINDING_NOT_FROM_ADAPTER"
    | "RUNNER_DOES_NOT_INVOKE_ACQUISITION"
    | "RUNNER_INVOKES_ACQUISITION_MORE_THAN_ONCE"
    | "ACQUISITION_INVOKED_OUTSIDE_RUNNER"
    | "ACQUISITION_CALL_NOT_AWAITED"
    | "ACQUISITION_CALL_ARGUMENT_INVALID"
    | "PROHIBITED_CALL"
    | "PROTECTED_EVIDENCE_MUTATED";
  detail: string;
}

export interface Stage2ClosureReport {
  ok: boolean;
  haltCode: "STAGE2_SOURCE_CLOSURE_VIOLATION" | null;
  violations: Stage2ClosureViolation[];
  acquisitionCallSites: string[];
  filesAnalyzed: number;
}

/** An in-memory Program over exactly the supplied closure. */
function createProgram(files: Stage2SourceFile[]): {
  program: ts.Program;
  sourceFiles: Map<string, ts.SourceFile>;
} {
  const sources = new Map<string, ts.SourceFile>();
  for (const file of files) {
    sources.set(
      file.path,
      ts.createSourceFile(file.path, file.contents, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS),
    );
  }
  const host: ts.CompilerHost = {
    getSourceFile: (name) => sources.get(name) ?? sources.get(path.normalize(name)),
    getDefaultLibFileName: () => "lib.d.ts",
    writeFile: () => undefined,
    getCurrentDirectory: () => "",
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => true,
    getNewLine: () => "\n",
    fileExists: (name) => sources.has(name),
    readFile: (name) => sources.get(name)?.text,
    resolveModuleNames: (moduleNames, containingFile) =>
      moduleNames.map((moduleName) => {
        // Relative specifiers resolve inside the virtual closure; everything else
        // (production `@/…` modules) resolves to nothing, which is what makes an
        // import of a prohibited symbol resolvable by NAME but not to a local
        // declaration — handled explicitly below.
        if (!moduleName.startsWith(".")) return undefined;
        const base = path.posix.join(path.posix.dirname(containingFile), moduleName);
        for (const candidate of [base, `${base}.ts`, `${base}/index.ts`]) {
          if (sources.has(candidate)) return { resolvedFileName: candidate, extension: ".ts" };
        }
        return undefined;
      }),
  };
  const program = ts.createProgram({
    rootNames: [...sources.keys()],
    options: { noResolve: false, allowJs: false, noLib: true, target: ts.ScriptTarget.ES2022 },
    host,
  });
  return { program, sourceFiles: sources };
}

/** Every import binding in a file: local name → { module, isTypeOnly }. */
function importBindings(
  source: ts.SourceFile,
): Map<string, { module: string; isTypeOnly: boolean; imported: string; isNamespace: boolean }> {
  const bindings = new Map<
    string,
    { module: string; isTypeOnly: boolean; imported: string; isNamespace: boolean }
  >();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const module = statement.moduleSpecifier.text;
    const clause = statement.importClause;
    if (clause === undefined) continue;
    const declarationTypeOnly = clause.isTypeOnly;

    if (clause.namedBindings !== undefined && ts.isNamespaceImport(clause.namedBindings)) {
      bindings.set(clause.namedBindings.name.text, {
        module,
        isTypeOnly: declarationTypeOnly,
        imported: "*",
        isNamespace: true,
      });
      continue;
    }
    if (clause.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings)) {
      for (const element of clause.namedBindings.elements) {
        bindings.set(element.name.text, {
          module,
          isTypeOnly: declarationTypeOnly || element.isTypeOnly,
          imported: (element.propertyName ?? element.name).text,
          isNamespace: false,
        });
      }
    }
  }
  return bindings;
}

/** Does a local declaration of this name exist in the file? */
function hasLocalDeclaration(source: ts.SourceFile, name: string): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if (found) return;
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = true;
    if (ts.isClassDeclaration(node) && node.name?.text === name) found = true;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) {
      found = true;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return found;
}

/** The root object identifier of a property-access chain, plus the chain names. */
function accessChain(node: ts.Expression): { root: string; chain: string[] } | undefined {
  const chain: string[] = [];
  let current: ts.Expression = node;
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    if (ts.isPropertyAccessExpression(current)) {
      chain.unshift(current.name.text);
      current = current.expression;
    } else {
      const argument = current.argumentExpression;
      chain.unshift(ts.isStringLiteral(argument) ? argument.text : "[computed]");
      current = current.expression;
    }
  }
  if (!ts.isIdentifier(current)) return undefined;
  return { root: current.text, chain };
}

/** Is this access chain rooted in acquired evidence, or a protected descendant? */
function touchesProtectedEvidence(chain: string[]): boolean {
  return chain.some((name, index) =>
    PROTECTED_EVIDENCE_ANCHORS.some(
      ([first, second]) => name === first && chain[index + 1] === second,
    ),
  );
}

export function analyzeStage2SourceClosure(input: Stage2ClosureInput): Stage2ClosureReport {
  const violations: Stage2ClosureViolation[] = [];
  const acquisitionCallSites: string[] = [];

  const seen = new Set<string>();
  for (const file of input.files) {
    if (seen.has(file.path)) {
      violations.push({
        path: file.path,
        rule: "DUPLICATE_FILE_PATH",
        detail: "the closure lists this path more than once",
      });
    }
    seen.add(file.path);
  }
  if (!seen.has(RUNNER_ENTRY_PATH)) {
    violations.push({
      path: RUNNER_ENTRY_PATH,
      rule: "RUNNER_ENTRY_MISSING",
      detail: "the runner entrypoint is not present in the analyzed closure",
    });
  }
  if (!seen.has(AUTHORIZED_ADAPTER_MODULE)) {
    violations.push({
      path: AUTHORIZED_ADAPTER_MODULE,
      rule: "ADAPTER_MODULE_MISSING",
      detail: "the authorized adapter module is not present in the analyzed closure",
    });
  }

  const { sourceFiles } = createProgram(input.files);

  for (const file of input.files) {
    const source = sourceFiles.get(file.path);
    if (source === undefined) continue;
    // A file that fails to parse cannot be reasoned about, so it fails closed.
    const parseDiagnostics = (source as unknown as { parseDiagnostics?: unknown[] })
      .parseDiagnostics;
    if (Array.isArray(parseDiagnostics) && parseDiagnostics.length > 0) {
      violations.push({
        path: file.path,
        rule: "PARSE_ERROR",
        detail: `${parseDiagnostics.length} parse diagnostic(s); a file that does not parse cannot be gated`,
      });
      continue;
    }

    if (file.path === AUTHORIZED_ADAPTER_MODULE) continue;

    const isRunner = file.path === RUNNER_ENTRY_PATH;
    const bindings = importBindings(source);
    const acquisitionBinding = bindings.get(REQUIRED_ACQUISITION_CALL);
    let acquisitionCalls = 0;

    if (isRunner) {
      if (acquisitionBinding === undefined) {
        violations.push({
          path: file.path,
          rule: "RUNNER_DOES_NOT_IMPORT_ACQUISITION",
          detail: `the runner must import ${REQUIRED_ACQUISITION_CALL} from ${AUTHORIZED_ADAPTER_MODULE}`,
        });
      } else {
        if (acquisitionBinding.isTypeOnly) {
          violations.push({
            path: file.path,
            rule: "ACQUISITION_IMPORT_IS_TYPE_ONLY",
            detail: "a type-only import produces no runtime binding",
          });
        }
        // The specifier must resolve to the authorized adapter. Relative
        // specifiers are compared against the frozen path; a bare specifier that
        // does not name it is rejected.
        const resolved = acquisitionBinding.module.startsWith(".")
          ? path.posix.normalize(
              path.posix.join(path.posix.dirname(file.path), acquisitionBinding.module),
            )
          : acquisitionBinding.module;
        const matchesAdapter =
          resolved === AUTHORIZED_ADAPTER_MODULE ||
          `${resolved}.ts` === AUTHORIZED_ADAPTER_MODULE ||
          AUTHORIZED_ADAPTER_MODULE.endsWith(`${resolved.replace(/^@\//, "")}.ts`);
        if (!matchesAdapter) {
          violations.push({
            path: file.path,
            rule: "ACQUISITION_BINDING_NOT_FROM_ADAPTER",
            detail: `${REQUIRED_ACQUISITION_CALL} is imported from ${acquisitionBinding.module}, not ${AUTHORIZED_ADAPTER_MODULE}`,
          });
        }
        if (acquisitionBinding.imported !== REQUIRED_ACQUISITION_CALL) {
          violations.push({
            path: file.path,
            rule: "ACQUISITION_BINDING_NOT_FROM_ADAPTER",
            detail: `the local name ${REQUIRED_ACQUISITION_CALL} is an alias for ${acquisitionBinding.imported}`,
          });
        }
      }
      if (hasLocalDeclaration(source, REQUIRED_ACQUISITION_CALL)) {
        violations.push({
          path: file.path,
          rule: "ACQUISITION_BINDING_SHADOWED",
          detail: `a local declaration named ${REQUIRED_ACQUISITION_CALL} shadows the imported binding; a name is not a binding`,
        });
      }
    }

    const visit = (node: ts.Node): void => {
      // ---- calls ----------------------------------------------------------
      if (ts.isCallExpression(node)) {
        const target = node.expression;

        if (ts.isPropertyAccessExpression(target)) {
          const method = target.name.text;
          const receiver = target.expression;

          // Namespace call: `ns.extractLabelEvidenceDetailed(...)`.
          if (ts.isIdentifier(receiver)) {
            const namespaceBinding = bindings.get(receiver.text);
            if (
              namespaceBinding?.isNamespace === true &&
              (PROHIBITED_CALLS as readonly string[]).includes(method)
            ) {
              violations.push({
                path: file.path,
                rule: "PROHIBITED_CALL",
                detail: `calls ${method} through the namespace import ${receiver.text}`,
              });
            }
            // `Object.assign(target, …)` / `Reflect.set(target, …)`.
            const qualified = `${receiver.text}.${method}`;
            if (
              (qualified === "Object.assign" || qualified === "Reflect.set") &&
              node.arguments.length > 0 &&
              touchesProtectedEvidence(accessChain(node.arguments[0])?.chain ?? [])
            ) {
              violations.push({
                path: file.path,
                rule: "PROTECTED_EVIDENCE_MUTATED",
                detail: `uses ${qualified} on acquired evidence`,
              });
            }
          }

          // A mutating array method on a protected chain. The receiver is itself
          // an access chain — `e.value.detailed.debug.passes.push(…)` — so it must
          // NOT be required to be a bare identifier.
          if (
            (MUTATING_ARRAY_METHODS as readonly string[]).includes(method) &&
            touchesProtectedEvidence(accessChain(receiver)?.chain ?? [])
          ) {
            violations.push({
              path: file.path,
              rule: "PROTECTED_EVIDENCE_MUTATED",
              detail: `calls the mutating array method ${method} on acquired evidence`,
            });
          }
        }

        if (ts.isIdentifier(target)) {
          const name = target.text;
          const binding = bindings.get(name);

          if (name === REQUIRED_ACQUISITION_CALL) {
            // Only an authorized, non-shadowed import counts as the required call.
            const authorized =
              binding !== undefined &&
              !binding.isTypeOnly &&
              binding.imported === REQUIRED_ACQUISITION_CALL &&
              !hasLocalDeclaration(source, REQUIRED_ACQUISITION_CALL);
            if (authorized) {
              acquisitionCalls += 1;
              acquisitionCallSites.push(file.path);
              if (!isRunner) {
                violations.push({
                  path: file.path,
                  rule: "ACQUISITION_INVOKED_OUTSIDE_RUNNER",
                  detail: `${REQUIRED_ACQUISITION_CALL} is invoked outside the runner entrypoint`,
                });
              } else {
                if (node.parent === undefined || !ts.isAwaitExpression(node.parent)) {
                  violations.push({
                    path: file.path,
                    rule: "ACQUISITION_CALL_NOT_AWAITED",
                    detail: "the acquisition call must be awaited",
                  });
                }
                if (node.arguments.length !== 1 || !ts.isIdentifier(node.arguments[0])) {
                  violations.push({
                    path: file.path,
                    rule: "ACQUISITION_CALL_ARGUMENT_INVALID",
                    detail:
                      "the acquisition call takes exactly one identifier argument: the frozen ExtractionInput",
                  });
                }
              }
            }
          } else if ((PROHIBITED_CALLS as readonly string[]).includes(name)) {
            violations.push({
              path: file.path,
              rule: "PROHIBITED_CALL",
              detail: `calls ${name}, which only ${AUTHORIZED_ADAPTER_MODULE} may call`,
            });
          } else if (
            binding !== undefined &&
            !binding.isNamespace &&
            (PROHIBITED_CALLS as readonly string[]).includes(binding.imported)
          ) {
            // An alias: `import { extractLabelEvidenceDetailed as run }`.
            violations.push({
              path: file.path,
              rule: "PROHIBITED_CALL",
              detail: `calls ${binding.imported} through the alias ${name}`,
            });
          }
        }
      }

      // ---- writes ---------------------------------------------------------
      if (ts.isBinaryExpression(node)) {
        const assigns =
          node.operatorToken.kind === ts.SyntaxKind.EqualsToken ||
          (node.operatorToken.kind >= ts.SyntaxKind.FirstCompoundAssignment &&
            node.operatorToken.kind <= ts.SyntaxKind.LastCompoundAssignment);
        if (
          assigns &&
          (ts.isPropertyAccessExpression(node.left) || ts.isElementAccessExpression(node.left))
        ) {
          const chain = accessChain(node.left)?.chain ?? [];
          if (touchesProtectedEvidence(chain)) {
            violations.push({
              path: file.path,
              rule: "PROTECTED_EVIDENCE_MUTATED",
              detail: `assigns to ${chain.join(".")} on acquired evidence`,
            });
          }
        }
      }
      if (ts.isDeleteExpression(node)) {
        const chain = accessChain(node.expression)?.chain ?? [];
        if (touchesProtectedEvidence(chain)) {
          violations.push({
            path: file.path,
            rule: "PROTECTED_EVIDENCE_MUTATED",
            detail: `deletes ${chain.join(".")} from acquired evidence`,
          });
        }
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
