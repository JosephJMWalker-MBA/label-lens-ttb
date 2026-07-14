// @vitest-environment node
import { describe, expect, it } from "vitest";

import { parseObserverResponse } from "./observer-response-parser";
import type { LocalVlmResolvedConfig } from "./local-vlm.types";

const CONFIG: LocalVlmResolvedConfig = {
  schemaVersion: "local-vlm-config.v1",
  llamaServerBin: "/tmp/llama-server",
  llamaExecutableSha256: "1".repeat(64),
  runtimeKind: "fake-server",
  llamaVersionArgs: ["--version"],
  modelPath: "/tmp/model.gguf",
  modelSha256: "2".repeat(64),
  modelFileSize: 1,
  modelDisplayId: "model-Q4_K_M.gguf",
  modelQuantization: "Q4_K_M",
  mmprojPath: null,
  mmprojSha256: null,
  mmprojFileSize: null,
  host: "127.0.0.1",
  startupTimeoutMs: 1_000,
  requestTimeoutMs: 1_000,
  terminationTimeoutMs: 500,
  maxImageBytes: 1_000_000,
  maxOutputTokens: 500,
  contextSize: 4_096,
  gpuLayers: null,
  threadCount: null,
  responseBytesMax: 24_000,
  stdoutBytesMax: 64_000,
  stderrBytesMax: 64_000,
  resourceSampleIntervalMs: 250,
  maxProposalsPerImage: 12,
  maxReasonCodesPerProposal: 9,
  maxDescriptionLength: 160,
  temperature: 0,
  seed: 17,
  readinessPath: "/health",
  chatCompletionsPath: "/v1/chat/completions",
};

function validPayload(observationRunId = "00000000-0000-4000-8000-000000000001") {
  return JSON.stringify({
    observationRunId,
    proposals: [
      {
        observationId: "obs-1",
        proposalId: "proposal-1",
        observationType: "text-like-region",
        source: "machine-observer",
        authority: "non-authoritative",
        purpose: "ocr-region-proposal",
        gridRange: {
          start: { column: "A", row: 1, columnIndex: 0, rowIndex: 0, id: "A1" },
          end: { column: "B", row: 2, columnIndex: 1, rowIndex: 1, id: "B2" },
          notation: "A1:B2",
        },
        localRefinement: null,
        observationRotation: 0,
        apparentOrientation: "horizontal",
        visibility: "full",
        reasonCodes: ["high_salience"],
        description: "generic text-like region near the center",
      },
    ],
  });
}

describe("observer response parser", () => {
  it("accepts exact JSON", () => {
    const parsed = parseObserverResponse({
      observationRunId: "00000000-0000-4000-8000-000000000001",
      rawResponseText: validPayload(),
      responseBytes: Buffer.byteLength(validPayload()),
      config: CONFIG,
    });
    expect(parsed.ok).toBe(true);
  });

  it("accepts fenced JSON", () => {
    const raw = `\`\`\`json\n${validPayload()}\n\`\`\``;
    const parsed = parseObserverResponse({
      observationRunId: "00000000-0000-4000-8000-000000000001",
      rawResponseText: raw,
      responseBytes: Buffer.byteLength(raw),
      config: CONFIG,
    });
    expect(parsed.ok).toBe(true);
  });

  it("rejects prose-wrapped JSON", () => {
    const raw = `Here is the result:\n${validPayload()}`;
    const parsed = parseObserverResponse({
      observationRunId: "00000000-0000-4000-8000-000000000001",
      rawResponseText: raw,
      responseBytes: Buffer.byteLength(raw),
      config: CONFIG,
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.parseState.jsonExtractionSuccess).toBe(false);
  });

  it("rejects malformed JSON", () => {
    const raw = `{"observationRunId":`;
    const parsed = parseObserverResponse({
      observationRunId: "00000000-0000-4000-8000-000000000001",
      rawResponseText: raw,
      responseBytes: Buffer.byteLength(raw),
      config: CONFIG,
    });
    expect(parsed.ok).toBe(false);
  });

  it("rejects duplicate proposal IDs", () => {
    const payload = JSON.stringify({
      observationRunId: "00000000-0000-4000-8000-000000000001",
      proposals: [JSON.parse(validPayload()).proposals[0], JSON.parse(validPayload()).proposals[0]],
    });
    const parsed = parseObserverResponse({
      observationRunId: "00000000-0000-4000-8000-000000000001",
      rawResponseText: payload,
      responseBytes: Buffer.byteLength(payload),
      config: CONFIG,
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.parseState.duplicateProposalIdsDetected).toBe(true);
  });

  it("rejects too many proposals", () => {
    const seed = JSON.parse(validPayload()).proposals[0];
    const payload = JSON.stringify({
      observationRunId: "00000000-0000-4000-8000-000000000001",
      proposals: Array.from({ length: 13 }, (_, idx) => ({
        ...seed,
        observationId: `obs-${idx}`,
        proposalId: `proposal-${idx}`,
      })),
    });
    const parsed = parseObserverResponse({
      observationRunId: "00000000-0000-4000-8000-000000000001",
      rawResponseText: payload,
      responseBytes: Buffer.byteLength(payload),
      config: CONFIG,
    });
    expect(parsed.ok).toBe(false);
  });

  it("rejects prohibited descriptions", () => {
    const value = JSON.parse(validPayload());
    value.proposals[0].description = "approved brand text at the top edge";
    const payload = JSON.stringify(value);
    const parsed = parseObserverResponse({
      observationRunId: "00000000-0000-4000-8000-000000000001",
      rawResponseText: payload,
      responseBytes: Buffer.byteLength(payload),
      config: CONFIG,
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.parseState.prohibitedClaimDetected).toBe(true);
  });
});
