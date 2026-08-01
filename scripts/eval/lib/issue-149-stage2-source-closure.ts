/**
 * Issue #149 — the Stage 2 acquisition source-closure analyzer.
 *
 * **Host-only. Never included in the runtime bundle and never present in Job B.**
 * Evaluation-only and non-OCR: it parses source text and runs nothing.
 *
 * Job A and the Stage 1 synthetic tests use this one implementation, so the gate
 * that will run before acquisition is the gate the tests exercise.
 *
 * ## Why the TypeChecker and not an import-name map
 *
 * The previous version built a `ts.Program` and then never asked it anything: it
 * compared callee TEXT against a manually constructed map of import names. That
 * left concrete bypasses open.
 *
 * ```ts
 * import { acquireProductionBrandEvidence as run } from "./lib/issue-149-candidate-adapter";
 * export const hidden = (input) => run(input);          // never counted, never rejected
 *
 * import { acquireProductionBrandEvidence, acquireProductionBrandEvidence as again } from "...";
 * await acquireProductionBrandEvidence(extractionInput);
 * await again(extractionInput);                          // reported as ONE call
 * ```
 *
 * The callee's TEXT is not its identity. This version resolves every call
 * through `checker.getSymbolAtLocation` and `checker.getAliasedSymbol`, and
 * compares the resulting DECLARATION against the exported declaration in the
 * authorized adapter module. An alias, a namespace member, a re-export and a
 * second local name all resolve to the same symbol; a local function with the
 * authorized name resolves to a different one.
 *
 * ## Two separate controls
 *
 * This is the SOURCE gate. It can prove which function is called, from where,
 * how often, and whether the argument is an identifier. It cannot prove that the
 * identifier holds a valid `ExtractionInput` — that is a RUNTIME property, and
 * `acquireProductionBrandEvidence` performs the schema and identity validation
 * itself. Nothing here claims otherwise.
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
 * Production modules the bundle legitimately contains.
 *
 * The prohibition exists to stop ACQUISITION code from reaching around the
 * adapter to a lower-level production function. It was never meant to police
 * production's own internals — and running the gate against the real Stage 2
 * closure showed it doing exactly that: `src/pipeline/extractor/extractor.ts`
 * calls `selectBrandObservation`, because that is what the incumbent extractor
 * does, and the gate rejected the incumbent for behaving like the incumbent.
 *
 * These modules are exempt from the CALL prohibitions. They are not exempt from
 * analysis, and they remain subject to the dependency-closure and base-drift
 * gates in Job A, which is what actually constrains which production modules may
 * be present at all.
 */
const PRODUCTION_MODULE_PREFIX = "src/";

/** The one authenticated persistence call, resolved the same way. */
export const REQUIRED_WRITER_CALL = "writeSealedEvidencePackage";

/**
 * Evidence-writing routes prohibited outside the authenticated writer.
 *
 * The writer is the only thing that can persist an AUTHENTIC package; a direct
 * filesystem write bypasses that entirely and can put anything on disk in the
 * shape of evidence.
 */
export const PROHIBITED_WRITE_ROUTES = [
  "writeFile",
  "writeFileSync",
  "appendFile",
  "appendFileSync",
  "createWriteStream",
  "open",
  "openSync",
  "copyFile",
  "copyFileSync",
] as const;

/**
 * Calls prohibited anywhere outside the adapter module. Each is a route by which
 * a caller could obtain, construct or alter evidence the public API owns.
 *
 * These are resolved BY SYMBOL where the symbol is reachable in the closure, and
 * by imported-name otherwise: a production module such as
 * `@/pipeline/extractor/extractor` is not part of the supplied Stage 2 closure,
 * so no declaration exists to resolve to. An import of `extractLabelEvidenceDetailed`
 * from an unresolvable module is therefore matched on the IMPORTED name — which
 * is the name in the exporting module and cannot be changed by an alias.
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
 * Operations prohibited on a sealed evidence package.
 *
 * A sealed package is a complete set of byte descriptors. Every one of these
 * produces a DIFFERENT set — a subset, a copy, or a reordering — and persisting
 * the result would persist incomplete evidence while leaving the package
 * untouched. Mutation is not required for that, so a mutation-only rule cannot
 * catch it.
 */
export const PROHIBITED_SEALED_PACKAGE_OPERATIONS = [
  "filter",
  "slice",
  "map",
  "concat",
  "reverse",
  "sort",
  "splice",
  "push",
  "pop",
  "shift",
  "unshift",
  "find",
  "flatMap",
] as const;

/** Reading these off a sealed package is legitimate and must stay allowed. */
export const PERMITTED_SEALED_PACKAGE_READS = [
  "itemId",
  "outcome",
  "fileCount",
  "totalBytes",
  "aggregateSha256",
  "failure",
] as const;

export interface Stage2SourceFile {
  path: string;
  contents: string;
}

export interface Stage2ClosureInput {
  /** The complete transitive Stage 2 source set, including the runner and adapter. */
  files: Stage2SourceFile[];
}

export type Stage2ClosureRule =
  | "RUNNER_ENTRY_MISSING"
  | "ADAPTER_MODULE_MISSING"
  | "ADAPTER_EXPORT_MISSING"
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
  | "SEALED_PACKAGE_PROJECTED"
  | "SEALED_EVIDENCE_PARSED"
  | "WRITER_EXPORT_MISSING"
  | "RUNNER_DOES_NOT_WRITE_THE_SEALED_PACKAGE"
  | "SEALED_PACKAGE_WRITTEN_MORE_THAN_ONCE"
  | "WRITER_INVOKED_OUTSIDE_AUTHORIZED_LOCATION"
  | "UNAUTHENTICATED_EVIDENCE_WRITE";

export interface Stage2ClosureViolation {
  path: string;
  rule: Stage2ClosureRule;
  detail: string;
}

export interface Stage2ClosureReport {
  ok: boolean;
  haltCode: "STAGE2_SOURCE_CLOSURE_VIOLATION" | null;
  violations: Stage2ClosureViolation[];
  acquisitionCallSites: string[];
  /** The resolved declaration the authorized call was checked against. */
  authorizedSymbolDeclaredIn: string | null;
  /** The resolved declaration the writer call was checked against. */
  writerSymbolDeclaredIn: string | null;
  writerCallSites: string[];
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
        // Only specifiers that resolve INSIDE the supplied closure resolve at
        // all. Production modules are deliberately unresolved: the closure is
        // what is under review, and an unresolved import is handled by the
        // imported-name rule rather than silently ignored.
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

/** Follow an alias symbol to the thing it actually names. */
function resolveAliased(
  checker: ts.TypeChecker,
  symbol: ts.Symbol | undefined,
): ts.Symbol | undefined {
  if (symbol === undefined) return undefined;
  if ((symbol.flags & ts.SymbolFlags.Alias) === 0) return symbol;
  try {
    return checker.getAliasedSymbol(symbol);
  } catch {
    return symbol;
  }
}

/** The symbol a callee expression resolves to, following aliases. */
function calleeSymbol(checker: ts.TypeChecker, callee: ts.Expression): ts.Symbol | undefined {
  const target = ts.isPropertyAccessExpression(callee) ? callee.name : callee;
  return resolveAliased(checker, checker.getSymbolAtLocation(target));
}

/** A module's exported symbol by name, covering both `export fn` and `export { fn }`. */
function exportedSymbol(
  checker: ts.TypeChecker,
  source: ts.SourceFile,
  name: string,
): ts.Symbol | undefined {
  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (moduleSymbol === undefined) return undefined;
  return (
    moduleSymbol.exports?.get(name as ts.__String) ??
    checker.getExportsOfModule(moduleSymbol).find((symbol) => symbol.getName() === name)
  );
}

/** Where a symbol is declared, as a file path — or null when it is unresolved. */
function declarationFile(symbol: ts.Symbol | undefined): string | null {
  const declaration = symbol?.declarations?.[0];
  return declaration === undefined ? null : declaration.getSourceFile().fileName;
}

/**
 * The IMPORTED name behind an identifier, if it came from an import in this file.
 *
 * This is the name in the EXPORTING module, so it is unaffected by a local alias.
 * It is the fallback identity for symbols whose declarations are outside the
 * supplied closure — production modules, which are not part of Stage 2 source.
 */
function importedNameOf(checker: ts.TypeChecker, node: ts.Node): string | null {
  const symbol = checker.getSymbolAtLocation(node);
  const declaration = symbol?.declarations?.[0];
  if (declaration === undefined) return null;
  if (ts.isImportSpecifier(declaration)) {
    return (declaration.propertyName ?? declaration.name).text;
  }
  if (ts.isImportClause(declaration)) return "default";
  if (ts.isNamespaceImport(declaration)) return "*";
  return null;
}

/** Is this identifier a namespace import (`import * as ns`)? */
function isNamespaceImport(checker: ts.TypeChecker, node: ts.Node): boolean {
  const symbol = checker.getSymbolAtLocation(node);
  const declaration = symbol?.declarations?.[0];
  return declaration !== undefined && ts.isNamespaceImport(declaration);
}

/** Is a declaration type-only (`import type` or `import { type x }`)? */
function isTypeOnlyDeclaration(declaration: ts.Declaration): boolean {
  if (ts.isImportSpecifier(declaration)) {
    return (
      declaration.isTypeOnly || declaration.parent.parent.parent.importClause?.isTypeOnly === true
    );
  }
  return false;
}

/** The dotted property chain an expression reads, innermost first. */
function accessChain(node: ts.Node): string[] {
  const chain: string[] = [];
  let current: ts.Node = node;
  while (ts.isPropertyAccessExpression(current) || ts.isElementAccessExpression(current)) {
    if (ts.isPropertyAccessExpression(current)) chain.unshift(current.name.text);
    else if (ts.isStringLiteralLike(current.argumentExpression)) {
      chain.unshift(current.argumentExpression.text);
    } else chain.unshift("[computed]");
    current = current.expression;
  }
  if (ts.isIdentifier(current)) chain.unshift(current.text);
  return chain;
}

/**
 * Does this chain reach the `files` descriptor list of a sealed package?
 *
 * A sealed package's ONLY evidence-bearing member is `files`. Everything else is
 * a count, an identifier or a digest, which a helper may freely read. So the rule
 * is anchored on the `files` member rather than on a general lineage analysis,
 * which source text cannot support.
 *
 * It is anchored on `files` ALONE. An earlier version also matched a bare
 * `bytes`, which rejected `Buffer.from(bytes)` in the canonical evidence helper —
 * an ordinary parameter that has nothing to do with a sealed package. A chain
 * that genuinely reaches sealed bytes passes through `files`
 * (`sealed.files[0].bytes`), or through a destructured rename, which is tracked
 * separately per file.
 */
const touchesSealedFiles = (chain: string[]): boolean => chain.includes("files");

export function analyzeStage2SourceClosure(input: Stage2ClosureInput): Stage2ClosureReport {
  const violations: Stage2ClosureViolation[] = [];
  const acquisitionCallSites: string[] = [];
  const add = (path: string, rule: Stage2ClosureRule, detail: string): void => {
    violations.push({ path, rule, detail });
  };

  const seen = new Set<string>();
  for (const file of input.files) {
    if (seen.has(file.path)) {
      add(file.path, "DUPLICATE_FILE_PATH", "the closure lists this path more than once");
    }
    seen.add(file.path);
  }

  const runnerPresent = input.files.some((file) => file.path === RUNNER_ENTRY_PATH);
  const adapterPresent = input.files.some((file) => file.path === AUTHORIZED_ADAPTER_MODULE);
  if (!runnerPresent) {
    add(
      RUNNER_ENTRY_PATH,
      "RUNNER_ENTRY_MISSING",
      "the closure does not contain the runner entrypoint",
    );
  }
  if (!adapterPresent) {
    add(
      AUTHORIZED_ADAPTER_MODULE,
      "ADAPTER_MODULE_MISSING",
      "the closure does not contain the authorized adapter module",
    );
  }

  const { program, sourceFiles } = createProgram(input.files);
  const checker = program.getTypeChecker();

  for (const [filePath, source] of sourceFiles) {
    // `ts.createSourceFile` records recoverable syntax errors here.
    const diagnostics = (source as unknown as { parseDiagnostics?: ts.Diagnostic[] })
      .parseDiagnostics;
    if (diagnostics !== undefined && diagnostics.length > 0) {
      add(
        filePath,
        "PARSE_ERROR",
        ts.flattenDiagnosticMessageText(diagnostics[0].messageText, " "),
      );
    }
  }

  // ---- the authorized symbol, resolved once ------------------------------
  const adapterSource = sourceFiles.get(AUTHORIZED_ADAPTER_MODULE);
  let authorizedSymbol: ts.Symbol | undefined;
  if (adapterSource !== undefined) {
    authorizedSymbol = resolveAliased(
      checker,
      exportedSymbol(checker, adapterSource, REQUIRED_ACQUISITION_CALL),
    );
    if (authorizedSymbol === undefined) {
      add(
        AUTHORIZED_ADAPTER_MODULE,
        "ADAPTER_EXPORT_MISSING",
        `the adapter module does not export ${REQUIRED_ACQUISITION_CALL}`,
      );
    }
  }
  let writerSymbol: ts.Symbol | undefined;
  if (adapterSource !== undefined) {
    writerSymbol = resolveAliased(
      checker,
      exportedSymbol(checker, adapterSource, REQUIRED_WRITER_CALL),
    );
    if (writerSymbol === undefined) {
      add(
        AUTHORIZED_ADAPTER_MODULE,
        "WRITER_EXPORT_MISSING",
        `the adapter module does not export ${REQUIRED_WRITER_CALL}`,
      );
    }
  }

  const authorizedDeclaration = authorizedSymbol?.declarations?.[0];
  const writerDeclaration = writerSymbol?.declarations?.[0];

  const sameSymbol = (
    symbol: ts.Symbol | undefined,
    target: ts.Symbol | undefined,
    declaration: ts.Declaration | undefined,
  ): boolean =>
    symbol !== undefined &&
    target !== undefined &&
    (symbol === target || (declaration !== undefined && symbol.declarations?.[0] === declaration));

  const isAuthorized = (symbol: ts.Symbol | undefined): boolean =>
    sameSymbol(symbol, authorizedSymbol, authorizedDeclaration);
  const isWriter = (symbol: ts.Symbol | undefined): boolean =>
    sameSymbol(symbol, writerSymbol, writerDeclaration);
  const writerCallSites: string[] = [];

  // ---- per-file analysis --------------------------------------------------
  for (const [filePath, source] of sourceFiles) {
    const isRunner = filePath === RUNNER_ENTRY_PATH;
    const isAdapter = filePath === AUTHORIZED_ADAPTER_MODULE;
    // The adapter defines the machinery; production modules ARE the machinery.
    const exemptFromCallProhibitions = isAdapter || filePath.startsWith(PRODUCTION_MODULE_PREFIX);

    // Locals that were destructured out of a sealed package under a new name.
    const sealedAliases = new Set<string>();
    const touchesSealed = (chain: string[]): boolean =>
      touchesSealedFiles(chain) || chain.some((name) => sealedAliases.has(name));

    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const symbol = calleeSymbol(checker, node.expression);

        // --- the authorized acquisition call, by SYMBOL -------------------
        if (isAuthorized(symbol)) {
          if (!isRunner) {
            add(
              filePath,
              "ACQUISITION_INVOKED_OUTSIDE_RUNNER",
              `${node.expression.getText()} resolves to the authorized acquisition function, which only the runner entrypoint may call`,
            );
          } else {
            acquisitionCallSites.push(filePath);
            if (!ts.isAwaitExpression(node.parent)) {
              add(
                filePath,
                "ACQUISITION_CALL_NOT_AWAITED",
                "the acquisition call must be awaited directly; an un-awaited promise can be dropped, raced or resolved elsewhere",
              );
            }
            if (node.arguments.length !== 1 || !ts.isIdentifier(node.arguments[0])) {
              add(
                filePath,
                "ACQUISITION_CALL_ARGUMENT_INVALID",
                `the acquisition call takes exactly one identifier argument, received ${node.arguments.map((a) => a.getText()).join(", ")}`,
              );
            }
            if (ts.isPropertyAccessExpression(node.expression)) {
              add(
                filePath,
                "PROHIBITED_CALL",
                `the acquisition call must use a direct import binding, not the member access ${node.expression.getText()}`,
              );
            }
          }
        } else if (isWriter(symbol)) {
          // --- the authenticated persistence call ------------------------
          writerCallSites.push(filePath);
          if (!isRunner) {
            add(
              filePath,
              "WRITER_INVOKED_OUTSIDE_AUTHORIZED_LOCATION",
              `${node.expression.getText()} resolves to ${REQUIRED_WRITER_CALL}, which only the runner entrypoint may call`,
            );
          }
          if (ts.isPropertyAccessExpression(node.expression)) {
            add(
              filePath,
              "PROHIBITED_CALL",
              `the writer call must use a direct import binding, not the member access ${node.expression.getText()}`,
            );
          }
          if (node.arguments.length === 0 || !ts.isIdentifier(node.arguments[0])) {
            add(
              filePath,
              "ACQUISITION_CALL_ARGUMENT_INVALID",
              `${REQUIRED_WRITER_CALL} must receive the acquired package as an identifier, received ${node.arguments.map((a) => a.getText()).join(", ")}`,
            );
          }
        } else if (!exemptFromCallProhibitions) {
          // --- prohibited calls ------------------------------------------
          const target = ts.isPropertyAccessExpression(node.expression)
            ? node.expression.name
            : node.expression;
          const declaredIn = declarationFile(symbol);
          const imported = importedNameOf(checker, target);

          // Resolved inside the closure: identity is the declaration.
          if (declaredIn === AUTHORIZED_ADAPTER_MODULE && symbol !== undefined) {
            const name = symbol.getName();
            if ((PROHIBITED_CALLS as readonly string[]).includes(name)) {
              add(filePath, "PROHIBITED_CALL", `calls ${name}, declared in the adapter module`);
            }
          }
          // Unresolved (a production module): identity is the IMPORTED name,
          // which an alias cannot change.
          if (imported !== null && (PROHIBITED_CALLS as readonly string[]).includes(imported)) {
            const local = target.getText();
            add(
              filePath,
              "PROHIBITED_CALL",
              local === imported
                ? `calls ${imported}`
                : `calls ${imported} through the local name ${local}`,
            );
          }
          // A namespace member call: `extractor.extractLabelEvidenceDetailed(…)`.
          if (
            ts.isPropertyAccessExpression(node.expression) &&
            ts.isIdentifier(node.expression.expression) &&
            isNamespaceImport(checker, node.expression.expression) &&
            (PROHIBITED_CALLS as readonly string[]).includes(node.expression.name.text)
          ) {
            add(
              filePath,
              "PROHIBITED_CALL",
              `calls ${node.expression.name.text} through the namespace import ${node.expression.expression.getText()}`,
            );
          }
          // An unresolved import of the AUTHORIZED name is not the authorized
          // symbol — it comes from somewhere unreviewed.
          if (imported === REQUIRED_ACQUISITION_CALL || imported === REQUIRED_WRITER_CALL) {
            add(
              filePath,
              "ACQUISITION_BINDING_NOT_FROM_ADAPTER",
              `${target.getText()} is imported as ${imported} but does not resolve to the adapter module's export`,
            );
          }

          // --- direct filesystem evidence writes --------------------------
          // The authenticated writer is the ONLY thing that can persist an
          // authentic package. A direct write bypasses authenticity entirely.
          const nodeFsRoute =
            (imported !== null &&
              (PROHIBITED_WRITE_ROUTES as readonly string[]).includes(imported)) ||
            (ts.isPropertyAccessExpression(node.expression) &&
              ts.isIdentifier(node.expression.expression) &&
              isNamespaceImport(checker, node.expression.expression) &&
              (PROHIBITED_WRITE_ROUTES as readonly string[]).includes(node.expression.name.text));
          if (nodeFsRoute) {
            add(
              filePath,
              "UNAUTHENTICATED_EVIDENCE_WRITE",
              `${node.expression.getText()} writes to the filesystem outside ${REQUIRED_WRITER_CALL}; only the authenticated writer may persist evidence`,
            );
          }
        }

        // --- sealed-package projection -----------------------------------
        if (!exemptFromCallProhibitions && ts.isPropertyAccessExpression(node.expression)) {
          const method = node.expression.name.text;
          const chain = accessChain(node.expression.expression);
          if (
            (PROHIBITED_SEALED_PACKAGE_OPERATIONS as readonly string[]).includes(method) &&
            touchesSealed(chain)
          ) {
            add(
              filePath,
              "SEALED_PACKAGE_PROJECTED",
              `${chain.join(".")}.${method}(…) produces a different file set; a sealed package is written whole or not at all`,
            );
          }
          if (
            (method === "parse" || method === "toString" || method === "from") &&
            node.arguments.some((argument) => touchesSealed(accessChain(argument)))
          ) {
            add(
              filePath,
              "SEALED_EVIDENCE_PARSED",
              `${node.expression.getText()}(…) reads sealed evidence bytes; the runner writes them and never interprets them`,
            );
          }
        }
      }

      // Spread or index into the sealed file list: `[...pkg.files]`, `files[0]`.
      if (ts.isSpreadElement(node) && touchesSealed(accessChain(node.expression))) {
        add(
          node.getSourceFile().fileName,
          "SEALED_PACKAGE_PROJECTED",
          `spreading ${node.expression.getText()} produces a new, separately mutable file list`,
        );
      }
      if (
        ts.isElementAccessExpression(node) &&
        touchesSealed(accessChain(node.expression)) &&
        node.getSourceFile().fileName !== AUTHORIZED_ADAPTER_MODULE
      ) {
        add(
          node.getSourceFile().fileName,
          "SEALED_PACKAGE_PROJECTED",
          `${node.getText()} selects a single sealed file; the package is written whole`,
        );
      }

      // `const { files: parts } = sealed;` renames the property, so a later
      // `parts.slice(0, 1)` carries no `files` in its access chain. The RENAMED
      // local is therefore tracked as a sealed-file binding for this file.
      if (
        ts.isVariableDeclaration(node) &&
        ts.isObjectBindingPattern(node.name) &&
        node.initializer !== undefined
      ) {
        for (const element of node.name.elements) {
          const property = (element.propertyName ?? element.name).getText();
          if ((property === "files" || property === "bytes") && ts.isIdentifier(element.name)) {
            sealedAliases.add(element.name.text);
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    // Every file is traversed, including the adapter: the adapter is exempt from
    // specific RULES (it defines the machinery), not from analysis. The previous
    // `if (!isAdapter || true)` was an always-true condition that said the
    // opposite of what it did.
    visit(source);
  }

  // ---- runner-level requirements -----------------------------------------
  const runnerSource = sourceFiles.get(RUNNER_ENTRY_PATH);
  if (runnerSource !== undefined) {
    const bindings = runnerAcquisitionBindings(checker, runnerSource);
    if (bindings.length === 0) {
      add(
        RUNNER_ENTRY_PATH,
        "RUNNER_DOES_NOT_IMPORT_ACQUISITION",
        `the runner must import ${REQUIRED_ACQUISITION_CALL} from ${AUTHORIZED_ADAPTER_MODULE}`,
      );
    }
    for (const binding of bindings) {
      if (binding.typeOnly) {
        add(
          RUNNER_ENTRY_PATH,
          "ACQUISITION_IMPORT_IS_TYPE_ONLY",
          `${binding.local} is imported type-only and is erased at runtime`,
        );
      }
      if (binding.shadowed) {
        add(
          RUNNER_ENTRY_PATH,
          "ACQUISITION_BINDING_SHADOWED",
          `${binding.local} is shadowed by a local declaration; the call would reach the local one`,
        );
      }
    }

    const shadowingLocals = localDeclarationsNamed(runnerSource, REQUIRED_ACQUISITION_CALL);
    if (shadowingLocals.length > 0 && bindings.length === 0) {
      add(
        RUNNER_ENTRY_PATH,
        "ACQUISITION_BINDING_SHADOWED",
        `${REQUIRED_ACQUISITION_CALL} is declared locally (${shadowingLocals.join(", ")}); a name is not a binding`,
      );
    }

    const runnerWrites = writerCallSites.filter((site) => site === RUNNER_ENTRY_PATH).length;
    if (runnerWrites === 0) {
      add(
        RUNNER_ENTRY_PATH,
        "RUNNER_DOES_NOT_WRITE_THE_SEALED_PACKAGE",
        `the runner acquires evidence but never calls ${REQUIRED_WRITER_CALL}; an unwritten package is not persisted evidence`,
      );
    } else if (runnerWrites > 1) {
      add(
        RUNNER_ENTRY_PATH,
        "SEALED_PACKAGE_WRITTEN_MORE_THAN_ONCE",
        `${runnerWrites} writer calls; each item's package is written exactly once`,
      );
    }

    const runnerCalls = acquisitionCallSites.filter((site) => site === RUNNER_ENTRY_PATH).length;
    if (runnerCalls === 0) {
      add(
        RUNNER_ENTRY_PATH,
        "RUNNER_DOES_NOT_INVOKE_ACQUISITION",
        `the runner entrypoint does not call the adapter module's ${REQUIRED_ACQUISITION_CALL}`,
      );
    } else if (runnerCalls > 1) {
      add(
        RUNNER_ENTRY_PATH,
        "RUNNER_INVOKES_ACQUISITION_MORE_THAN_ONCE",
        `${runnerCalls} acquisition calls; each item is acquired exactly once and never retried`,
      );
    }
  }

  return {
    ok: violations.length === 0,
    haltCode: violations.length === 0 ? null : "STAGE2_SOURCE_CLOSURE_VIOLATION",
    violations,
    acquisitionCallSites: [...new Set(acquisitionCallSites)],
    writerCallSites: [...new Set(writerCallSites)],
    authorizedSymbolDeclaredIn: declarationFile(authorizedSymbol),
    writerSymbolDeclaredIn: declarationFile(writerSymbol),
    filesAnalyzed: sourceFiles.size,
  };
}

/**
 * Every local binding in the runner that resolves to the authorized export.
 *
 * Two imports under different local names produce two bindings, which is exactly
 * what the previous name-map missed.
 */
function runnerAcquisitionBindings(
  checker: ts.TypeChecker,
  source: ts.SourceFile,
): Array<{ local: string; typeOnly: boolean; shadowed: boolean }> {
  const bindings: Array<{ local: string; typeOnly: boolean; shadowed: boolean }> = [];
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) {
      continue;
    }
    const named = statement.importClause?.namedBindings;
    if (named === undefined || !ts.isNamedImports(named)) continue;
    for (const element of named.elements) {
      const importedName = (element.propertyName ?? element.name).text;
      if (importedName !== REQUIRED_ACQUISITION_CALL) continue;

      const symbol = resolveAliased(checker, checker.getSymbolAtLocation(element.name));
      const declaredIn = declarationFile(symbol);
      const typeOnly = element.isTypeOnly || statement.importClause?.isTypeOnly === true;
      if (declaredIn !== AUTHORIZED_ADAPTER_MODULE && !typeOnly) continue;

      bindings.push({
        local: element.name.text,
        typeOnly,
        shadowed: localDeclarationsNamed(source, element.name.text).length > 0,
      });
    }
  }
  return bindings;
}

/**
 * Local declarations of a name, in any binding position.
 *
 * The previous version looked only at top-level function and variable
 * declarations, so a function PARAMETER, a `catch` binding, a destructured
 * declaration or a block-scoped declaration could shadow the authorized import
 * without being noticed.
 */
function localDeclarationsNamed(source: ts.SourceFile, name: string): string[] {
  const found: string[] = [];
  const record = (kind: string): void => {
    found.push(kind);
  };
  const visitBindingName = (binding: ts.BindingName, kind: string): void => {
    if (ts.isIdentifier(binding)) {
      if (binding.text === name) record(kind);
      return;
    }
    for (const element of binding.elements) {
      if (ts.isBindingElement(element)) visitBindingName(element.name, `${kind} (destructured)`);
    }
  };

  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) record("function declaration");
    if (ts.isClassDeclaration(node) && node.name?.text === name) record("class declaration");
    if (ts.isVariableDeclaration(node)) visitBindingName(node.name, "variable declaration");
    if (ts.isParameter(node)) visitBindingName(node.name, "parameter");
    if (ts.isCatchClause(node) && node.variableDeclaration !== undefined) {
      visitBindingName(node.variableDeclaration.name, "catch binding");
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}
