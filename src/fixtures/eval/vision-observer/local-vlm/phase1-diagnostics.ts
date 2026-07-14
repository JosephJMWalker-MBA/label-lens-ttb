import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { LocalVlmResolvedConfig } from "./local-vlm.types";
import {
  runImageTransportDiagnostic,
  type ImageTransportDiagnosticReport,
} from "./image-transport-diagnostic";
import {
  blockedPhase1DiagnosticReport,
  type Phase1DiagnosticReport,
} from "./phase1-diagnostic-types";
import {
  runVisionAttentionDiagnostic,
  VISION_ATTENTION_IMAGE_MEDIA_TYPE,
  writeVisionAttentionSentinelPair,
  type VisionAttentionDiagnosticReport,
} from "./vision-attention-diagnostic";

export interface LocalVlmPhase1DiagnosticsResult {
  imageTransport: ImageTransportDiagnosticReport;
  visionAttention: VisionAttentionDiagnosticReport | Phase1DiagnosticReport<null>;
}

export async function runPhase1DiagnosticSequence(args: {
  runImageTransport: () => Promise<ImageTransportDiagnosticReport>;
  runVisionAttention: () => Promise<VisionAttentionDiagnosticReport>;
}): Promise<LocalVlmPhase1DiagnosticsResult> {
  const imageTransport = await args.runImageTransport();
  if (imageTransport.status !== "PASS") {
    return {
      imageTransport,
      visionAttention: blockedPhase1DiagnosticReport({
        layer: "vision-attention",
        blockedBy: "image-transport",
        summary: "Vision attention was blocked because image transport did not pass.",
        issues: ["upstream image transport must pass before vision attention can execute"],
      }),
    };
  }

  const visionAttention = await args.runVisionAttention();
  return {
    imageTransport,
    visionAttention,
  };
}

export async function runLocalVlmPhase1Diagnostics(args: {
  config: LocalVlmResolvedConfig;
}): Promise<LocalVlmPhase1DiagnosticsResult> {
  const sentinelDir = await mkdtemp(join(tmpdir(), "local-vlm-phase1-sentinels-"));
  try {
    const { blackImagePath, whiteImagePath } = await writeVisionAttentionSentinelPair({
      dir: sentinelDir,
    });

    return await runPhase1DiagnosticSequence({
      runImageTransport: () =>
        runImageTransportDiagnostic({
          config: args.config,
          imagePath: blackImagePath,
          imageMediaType: VISION_ATTENTION_IMAGE_MEDIA_TYPE,
        }),
      runVisionAttention: () =>
        runVisionAttentionDiagnostic({
          config: args.config,
          blackImagePath,
          whiteImagePath,
        }),
    });
  } finally {
    await rm(sentinelDir, { recursive: true, force: true });
  }
}
