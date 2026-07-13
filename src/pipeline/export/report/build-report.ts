import type {
  ApplicationBuildVersion,
  OcrEngineVersion,
} from "@/domain/run/version-manifest.types";
import type { AnalyzerFieldObservation } from "@/pipeline/analyzer/analyzer.types";
import type { DispositionEntry, PrecheckResult } from "@/pipeline/result/result.types";
import { err, ok, type Result } from "@/shared/result";

import {
  REPORT_SCHEMA_VERSION,
  type ReadableReport,
  type ReadableReportInput,
  type ReportError,
} from "./report.types";

/**
 * Build a deterministic, human-readable HTML report from an already-validated
 * result. No rule is re-executed and no current time is read: given the same
 * result, disposition history, and report schema version, the bytes and the
 * suggested filename are identical.
 */

const MACHINE_RESULT_ID = /^precheck-result\.v1-[0-9a-f]{64}$/;

/** Deterministic report filename, derived only from the stable machine-result id. */
export function reportFilename(result: PrecheckResult): Result<string, ReportError> {
  const id = result.machineResultId;
  if (!MACHINE_RESULT_ID.test(id)) {
    return err({
      code: "INVALID_REPORT_IDENTITY",
      message: "Machine result id is not a valid stable identity for a report filename.",
      issues: [`machineResultId: ${id}`],
    });
  }
  return ok(`label-lens-wine-precheck-${id}.html`);
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function ocrEngineText(engine: OcrEngineVersion): string {
  return engine.kind === "ocr"
    ? `${engine.engineId}@${engine.engineVersion}${engine.modelId ? ` (model ${engine.modelId})` : ""}`
    : "not applicable";
}

function ocrModelText(engine: OcrEngineVersion): string {
  return engine.kind === "ocr" && engine.modelSha256 ? engine.modelSha256 : "—";
}

function applicationBuildText(build: ApplicationBuildVersion): string {
  const commit = build.gitCommitSha
    ? `commit ${build.gitCommitSha}`
    : build.commitProvenance === "unavailable-development-fallback"
      ? "development build (no deployed commit)"
      : "commit unavailable";
  return `${build.packageVersion} · ${commit}`;
}

function observationRows(label: string, obs: AnalyzerFieldObservation): string {
  const geometry = obs.geometry
    ? `x${obs.geometry.x}, y${obs.geometry.y}, ${obs.geometry.width}×${obs.geometry.height} of ${obs.geometry.imageWidth}×${obs.geometry.imageHeight}`
    : "—";
  return [
    `<tr><th scope="row">${esc(label)} — state</th><td>${esc(obs.state)}</td></tr>`,
    `<tr><th scope="row">${esc(label)} — extracted value</th><td>${esc(obs.value ?? "— none extracted —")}</td></tr>`,
    `<tr><th scope="row">${esc(label)} — raw text</th><td>${esc(obs.rawText ?? "—")}</td></tr>`,
    `<tr><th scope="row">${esc(label)} — OCR evidence score</th><td>${obs.ocrEvidenceScore.toFixed(2)}</td></tr>`,
    `<tr><th scope="row">${esc(label)} — source region</th><td>${esc(geometry)}</td></tr>`,
  ].join("");
}

function findingBlock(result: PrecheckResult): string {
  return result.findings
    .map((f, index) => {
      const external = f.externalEvidenceDependency
        ? `<p class="external">External evidence required: ${esc(f.externalEvidenceDependency)}. This check cannot run from the label artwork alone and is not a pass or a failure.</p>`
        : "";
      return `<li>
  <h4>${index + 1}. ${esc(f.ruleId)} — <span class="status">${esc(f.findingStatus)}</span></h4>
  <p class="message">${esc(f.message)}</p>
  <table class="kv"><tbody>
    <tr><th scope="row">Rule execution</th><td>${esc(f.ruleExecutionStatus)}</td></tr>
    <tr><th scope="row">Authority</th><td>${esc(f.authority.citation)} (snapshot ${esc(f.authority.snapshotDate)})</td></tr>
    <tr><th scope="row">Rule / profile</th><td>${esc(f.ruleId)}@${esc(f.ruleVersion)} · ${esc(f.profileId)}@${esc(f.profileVersion)}</td></tr>
    <tr><th scope="row">Evidence references</th><td>${f.evidenceReferences.length}</td></tr>
  </tbody></table>
  ${external}
</li>`;
    })
    .join("\n");
}

function dispositionBlock(history: DispositionEntry[]): string {
  if (history.length === 0) {
    return `<p class="empty">No operator disposition has been recorded yet.</p>`;
  }
  const rows = history
    .map((e) => {
      const note = e.note ? `<tr><th scope="row">Note</th><td>${esc(e.note)}</td></tr>` : "";
      const refs =
        e.references && (e.references.ruleIds?.length || e.references.checkIds?.length)
          ? `<tr><th scope="row">References</th><td>${esc(
              [
                ...(e.references.ruleIds ?? []).map((r) => `rule:${r}`),
                ...(e.references.checkIds ?? []).map((c) => `check:${c}`),
              ].join(", "),
            )}</td></tr>`
          : "";
      return `<li>
  <h4>Sequence ${e.sequence} — ${esc(e.decision)}</h4>
  <table class="kv"><tbody>
    <tr><th scope="row">Reason code</th><td>${esc(e.reasonCode)}</td></tr>
    <tr><th scope="row">Actor</th><td>${esc(e.actorId)}</td></tr>
    <tr><th scope="row">Recorded at</th><td>${esc(e.recordedAt)}</td></tr>
    ${note}
    ${refs}
  </tbody></table>
</li>`;
    })
    .join("\n");
  return `<ol class="disposition">${rows}</ol>`;
}

export function buildReadableReport(
  input: ReadableReportInput,
): Result<ReadableReport, ReportError> {
  const filename = reportFilename(input.result);
  if (!filename.ok) return filename;

  const r = input.result;
  const brand = r.declaredFacts.applicationBrandName.value;
  const alcohol = r.declaredFacts.applicationAlcoholValue.value;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Wine label pre-check report — ${esc(r.machineResultId)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 48rem; margin: 2rem auto; padding: 0 1rem; color: #111; line-height: 1.5; }
  h1 { font-size: 1.5rem; } h2 { font-size: 1.2rem; margin-top: 2rem; border-bottom: 1px solid #ccc; padding-bottom: .25rem; }
  .advisory { border: 2px solid #444; background: #f6f6f6; padding: 1rem; border-radius: .5rem; }
  table.kv { border-collapse: collapse; width: 100%; margin: .5rem 0; }
  table.kv th, table.kv td { border: 1px solid #ddd; padding: .35rem .6rem; text-align: left; vertical-align: top; }
  table.kv th { width: 14rem; font-weight: 600; }
  .status { font-family: ui-monospace, monospace; }
  ol.findings > li, ol.disposition > li { margin-bottom: 1rem; }
  .external { background: #f0f0f0; padding: .5rem; border-radius: .25rem; }
  footer { margin-top: 2rem; font-size: .85rem; color: #444; }
</style>
</head>
<body>
<header>
  <h1>Wine label pre-check report</h1>
  <p>Report schema: <code>${esc(REPORT_SCHEMA_VERSION)}</code></p>
</header>

<section class="advisory" aria-label="Advisory notice">
  <p><strong>${esc(r.advisoryNotice.text)}</strong></p>
  <p>This is a pre-submission aid for internal review. It is <strong>not a TTB approval</strong>,
     not a legal determination, and not an official regulatory disposition. It presents no
     aggregate verdict and no numeric score.</p>
</section>

<section aria-label="Identity">
  <h2>Result identity</h2>
  <table class="kv"><tbody>
    <tr><th scope="row">Machine result id</th><td>${esc(r.machineResultId)}</td></tr>
    <tr><th scope="row">Mode</th><td>${esc(r.mode)}</td></tr>
    <tr><th scope="row">Profile</th><td>${esc(r.profile.id)}@${esc(r.profile.version)}</td></tr>
    <tr><th scope="row">Canonical JSON checksum (SHA-256)</th><td><code>${esc(input.jsonChecksum)}</code></td></tr>
  </tbody></table>
  <p>This report is generated from the already-validated machine result; no rules were re-executed.
     The checksum above is an integrity checksum for corruption/change detection — not a
     signature or proof of authenticity. Verify the corresponding canonical JSON export against
     it.</p>
</section>

<section aria-label="Provenance">
  <h2>Provenance</h2>
  <table class="kv"><tbody>
    <tr><th scope="row">Source artifact SHA-256</th><td><code>${esc(r.versionManifest.sourceArtifactSha256 ?? "—")}</code></td></tr>
    <tr><th scope="row">Sanitized derivative SHA-256</th><td><code>${esc(r.versionManifest.sanitizedDerivativeSha256)}</code></td></tr>
    <tr><th scope="row">Source ↔ derivative</th><td>${esc(r.versionManifest.derivativeRelationship ?? "—")}</td></tr>
    <tr><th scope="row">Extraction adapter</th><td>${esc(r.versionManifest.extractionAdapterId)}@${esc(r.versionManifest.extractionAdapterVersion)}</td></tr>
    <tr><th scope="row">OCR engine</th><td>${esc(ocrEngineText(r.versionManifest.ocrEngine))}</td></tr>
    <tr><th scope="row">OCR model digest</th><td><code>${esc(ocrModelText(r.versionManifest.ocrEngine))}</code></td></tr>
    <tr><th scope="row">Parser</th><td>${esc(r.versionManifest.parserId)}@${esc(r.versionManifest.parserVersion)}</td></tr>
    <tr><th scope="row">Profile</th><td>${esc(r.versionManifest.ruleProfileId)}@${esc(r.versionManifest.ruleProfileVersion)}</td></tr>
    <tr><th scope="row">Application build</th><td>${esc(applicationBuildText(r.versionManifest.applicationBuild))}</td></tr>
  </tbody></table>
</section>

<section aria-label="Application values">
  <h2>Declared application values</h2>
  <table class="kv"><tbody>
    <tr><th scope="row">Application brand name</th><td>${esc(brand)}</td></tr>
    <tr><th scope="row">Application alcohol value</th><td>${esc(alcohol)}</td></tr>
  </tbody></table>
</section>

<section aria-label="Observed evidence">
  <h2>Observed label evidence</h2>
  <table class="kv"><tbody>
    ${observationRows("Brand name", r.observations.brandName)}
    ${observationRows("Alcohol statement", r.observations.alcoholStatement)}
  </tbody></table>
</section>

<section aria-label="Evidence assessments">
  <h2>Independent evidence assessments</h2>
  <table class="kv"><tbody>
    ${r.evidenceAssessments
      .map(
        (a) =>
          `<tr><th scope="row">${esc(a.checkId)}</th><td>${esc(a.evidenceStatus)} — ${esc(a.reasonCode)}</td></tr>`,
      )
      .join("")}
  </tbody></table>
</section>

<section aria-label="Findings">
  <h2>Findings (deterministic rule outcomes, in evaluation order)</h2>
  <p>These are automated rule outcomes, not government decisions, and they are not combined into
     any aggregate outcome.</p>
  <ol class="findings">
${findingBlock(r)}
  </ol>
</section>

<section aria-label="Human disposition">
  <h2>Human disposition (operator internal workflow)</h2>
  <p>The entries below are the operator's internal workflow record. Machine findings above are
     automated rule outcomes. The human disposition is kept separate: it
     <strong>does not change the automated findings</strong> and it
     <strong>does not represent TTB action, approval, or rejection</strong>.</p>
  ${dispositionBlock(r.humanDispositionHistory)}
</section>

<footer>
  <p>Advisory pre-submission aid — not a TTB approval, legal determination, or official regulatory
     disposition.</p>
</footer>
</body>
</html>`;

  return ok({ schemaVersion: REPORT_SCHEMA_VERSION, filename: filename.value, html });
}
