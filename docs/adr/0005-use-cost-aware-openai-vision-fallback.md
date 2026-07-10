# ADR 0005: Use a Cost-Aware OpenAI Vision Fallback

- Status: Accepted
- Date: 2026-07-09

## Context

The prototype should operate cheaply and remain useful in environments where outbound network access may be constrained. A local OCR-first pipeline supports those goals, but difficult label images may still contain glare, perspective distortion, decorative fonts, low contrast, or partial occlusion that prevent reliable extraction.

A strict local-only design would minimize per-request cost, but it could also interrupt reviewer work, increase manual re-entry, or force unnecessary requests for replacement images. The system is intended to support employee throughput and judgment, not optimize infrastructure cost in isolation.

## Decision

Label Lens will use a tiered extraction strategy:

1. Validate and preprocess the uploaded image.
2. Run the low-cost local OCR provider.
3. Measure extraction quality using confidence, field coverage, disagreement, and image-quality signals.
4. If the evidence is insufficient and outbound access is available, invoke an OpenAI vision provider as a bounded fallback.
5. Merge or compare the resulting evidence without allowing either provider to make compliance decisions.
6. Apply deterministic, versioned rules to produce findings.
7. Route unresolved disagreement or low confidence to human review.

OpenAI is therefore an escalation provider, not the default system dependency and not the compliance authority.

## Escalation Signals

The fallback may run when one or more conditions are met:

- required-field coverage is below threshold;
- local OCR confidence is below threshold;
- OCR engines disagree materially;
- the warning statement cannot be recovered reliably;
- image-quality analysis detects glare, perspective distortion, blur, or low contrast;
- parsed values are internally inconsistent, such as ABV and proof disagreement;
- a reviewer explicitly requests a second extraction attempt.

Thresholds must be configurable and measured against the evaluation corpus.

## Cost and Throughput Controls

- Record whether fallback was invoked and why.
- Record provider latency and estimated request cost.
- Prevent repeated fallback calls for the same evidence and pipeline version.
- Apply request-size and timeout limits.
- Support a deployment mode in which outbound fallback is disabled.
- Track fallback rate as an engineering metric.
- Optimize local extraction over time so fallback usage declines without reducing accuracy.

The desired outcome is not zero fallback usage. It is the lowest responsible fallback rate that keeps reviewers moving and preserves verification quality.

## Security and Privacy

- The API key remains server-side.
- The browser never calls OpenAI directly.
- Images are transmitted only when the configured deployment mode and retention policy permit it.
- The evidence record identifies the provider and model/pipeline version used.
- No uploaded label is silently retained or promoted to training data.
- Production deployment requires agency-approved authorization, network, data-handling, and vendor controls.

## Consequences

### Positive

- Difficult images receive a second extraction path.
- Reviewer queues are less likely to stall because local OCR failed.
- The application remains cheap for routine labels.
- The architecture demonstrates pragmatic cost-quality tradeoffs.
- Provider implementations remain replaceable behind the OCR/analyzer interface.

### Negative

- Some requests incur external API cost and latency.
- Cloud fallback may be unavailable in restricted networks.
- Additional provenance, privacy, timeout, and error handling are required.
- Evaluation must measure whether fallback actually improves field accuracy.

## Governance

The fallback extracts evidence only. It may not approve, reject, or reinterpret compliance requirements. Deterministic rules and authorized human reviewers remain responsible for findings and final decisions.
