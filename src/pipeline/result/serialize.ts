import { createHash } from "node:crypto";

import type { PrecheckResult } from "./result.types";

/**
 * Stable, deterministic serialization for the pre-check result.
 *
 * Keys are sorted, arrays preserve order (findings, rules, alternates), and no
 * current time, randomness, timing, or environment path is ever introduced.
 * The machine result serializes independently of the human disposition history,
 * so appending disposition never changes the machine identity or its bytes.
 */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** The immutable machine portion, excluding disposition history and the id itself. */
function machineContent(result: PrecheckResult): Record<string, unknown> {
  const { machineResultId: _id, humanDispositionHistory: _history, ...machine } = result;
  void _id;
  void _history;
  return machine;
}

/**
 * Derive the machine result id from immutable machine content only. Version
 * prefixed and disposition-independent, so the same machine inputs always yield
 * the same id and a later disposition append cannot change it.
 */
export function deriveMachineResultId(result: Omit<PrecheckResult, "machineResultId">): string {
  const { humanDispositionHistory: _history, ...machine } = result;
  void _history;
  const digest = createHash("sha256").update(stableStringify(machine)).digest("hex");
  return `precheck-result.v1-${digest}`;
}

/** Serialize only the machine result (excludes human disposition history). */
export function serializeMachineResult(result: PrecheckResult): string {
  return stableStringify({ machineResultId: result.machineResultId, ...machineContent(result) });
}

/** Serialize the complete result, including the append-only disposition history. */
export function serializePrecheckResult(result: PrecheckResult): string {
  return stableStringify(result);
}
