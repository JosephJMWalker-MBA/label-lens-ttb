import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { FAKE_OBSERVER_SCENARIOS } from "./fake-observer-fixtures";
import type {
  FakeObserverScenario,
  ObserverRegionProposal,
  VisionObserverAdapter,
  VisionObserverInput,
  VisionObserverResult,
} from "./observer-grid.types";

export const FAKE_OBSERVER_ID = "fake-deterministic-observer.v2";
export const FAKE_OBSERVER_VERSION = "2.0.0";
export const FAKE_OBSERVER_PROMPT_ID = "slice1-grid-contract";
export const FAKE_OBSERVER_PROMPT_VERSION = "2.0.0";

function cloneProposals(proposals: readonly ObserverRegionProposal[]): ObserverRegionProposal[] {
  return structuredClone(proposals) as ObserverRegionProposal[];
}

async function writeScenarioCanary(workspaceDir: string, scenarioId: string) {
  await writeFile(join(workspaceDir, "adapter-canary.txt"), `${scenarioId}\n`, "utf8");
}

export class FakeVisionObserverAdapter implements VisionObserverAdapter {
  readonly adapterId = FAKE_OBSERVER_ID;
  readonly adapterVersion = FAKE_OBSERVER_VERSION;
  readonly promptId = FAKE_OBSERVER_PROMPT_ID;
  readonly promptVersion = FAKE_OBSERVER_PROMPT_VERSION;

  #disposed = false;
  #scenarios = new Map<string, FakeObserverScenario>();
  #delayMs: number;

  constructor(
    scenarios: readonly FakeObserverScenario[] = FAKE_OBSERVER_SCENARIOS,
    options: { delayMs?: number } = {},
  ) {
    for (const scenario of scenarios) this.#scenarios.set(scenario.scenarioId, scenario);
    this.#delayMs = options.delayMs ?? 0;
  }

  async observe(input: VisionObserverInput): Promise<VisionObserverResult> {
    if (this.#disposed) throw new Error("fake observer adapter has been disposed");
    const scenario = this.#scenarios.get(input.scenarioId);
    if (!scenario) throw new Error(`unknown fake observer scenario ${input.scenarioId}`);
    if (this.#delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.#delayMs));
    }
    await writeScenarioCanary(input.workspaceDir, input.scenarioId);
    return {
      observationRunId: input.observationRunId,
      proposals: cloneProposals(scenario.proposals),
    };
  }

  async reset(): Promise<void> {
    if (this.#disposed) throw new Error("fake observer adapter has been disposed");
  }

  async dispose(): Promise<void> {
    this.#disposed = true;
  }
}
