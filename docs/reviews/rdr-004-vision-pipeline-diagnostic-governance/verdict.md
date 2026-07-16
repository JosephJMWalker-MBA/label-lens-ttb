# RDR-004 Verdict — Vision Pipeline Diagnostic Governance

- Status: Accepted review conclusion
- Date: 2026-07-16
- Inputs: 6 of 6 feedback rounds plus repository verification

## Verdict

The Label Lens evaluation architecture is materially strong, but several parts of its diagnostic and human-evaluation governance are not yet sufficient for a real blinded benchmark or for product-readiness claims.

The review adopts five conclusions.

## 1. The Phase 5A report contains a materially overbroad causal heading

`Recovery passes that never improve outcomes` exceeds what fixed-order prefix-state marginal attribution proves.

The accepted interpretation is:

> The measured pass changed no selected field at its configured prefix in this corpus.

The review rejects the stronger interpretation that the pass is globally useless or safely removable. Pruning requires an explicit counterfactual experiment, such as leave-one-pass-out evaluation, controlled permutation, or another method that tests downstream dependence.

**Disposition:** documentation defect confirmed; production pruning not authorized.

## 2. PR #114's runtime validation boundary is incomplete

The proposed validator is useful and disciplined for typed repository fixtures, but it is not a total exact-schema validator for arbitrary runtime JSON. It can dereference missing structures, and undeclared runtime properties are not systematically rejected.

For a blinded digest-backed artifact, strict runtime rejection of unknown and malformed fields is part of experimental validity, not optional schema style.

**Disposition:** validator hardening required before real corpus-manifest creation or freezing may be authorized.

## 3. The human-evaluation protocol is calibration-grade, not advancement-grade

A single primary reviewer scoring 64 repeated items may be suitable for early rubric calibration if its limitations are stated. It is not sufficient by itself to support a claim that one research contract should replace or advance beyond another in a consequential workflow.

Explicit identifier removal protects the data layer but does not prove perceptual blinding. Advancement-grade evaluation needs a governed treatment of stylistic guessability, reviewer fatigue, independent scoring, and inter-rater agreement.

**Disposition:** current protocol may remain a bounded calibration instrument; model-advancement authority remains withheld.

## 4. Human provenance is not fully bound in the proposed frozen manifest

PR #114 records case selection but does not bind annotator identity or enforce selector-versus-annotator independence. A separate annotation type includes `annotatorId`, but the relationship is not frozen into the manifest contract.

The review does not require maximal bureaucracy for every calibration fixture. It does require that any claimed independent annotation be provable in the durable artifact.

**Disposition:** provenance relationship must be defined before the v1 real corpus is frozen.

## 5. Architectural integrity does not establish operational usefulness

Label Lens has earned credit for preserving evidence, uncertainty, deterministic evaluation, typed failures, provenance, authorization boundaries, and human authority. These are genuine engineering achievements.

They do not establish that the current extractor or future vision observer saves human work. Product progress must therefore be judged on two independent axes:

1. epistemic and governance integrity;
2. operational usefulness and reviewer-work reduction.

Neither may substitute for the other.

**Disposition:** extractor repair may continue within the existing scope, but product expansion remains gated by measured human-work reduction and safe abstention.

## Accepted governing principles

> Evidence generation, selection change, and counterfactual necessity are different measurements.

> A blind is an empirical property of the evaluation session, not merely the absence of an identifier field.

> Exactly-one primary attribution may support accounting without proving singular causation.

> A safely classified failure is better than a misclassified success, but it may still be operationally unacceptable.

> Architecture must preserve truth; the product must also save work.

## Rejected conclusions

The review rejects the following claims as unsupported:

- zero prefix correction proves a recovery pass is useless;
- compile-time TypeScript exclusions secure arbitrary runtime JSON;
- one reviewer plus hidden contract names proves perceptual blinding;
- a digest named `manifestDigest` necessarily communicates its intentionally limited projection;
- strong provenance or governance proves product readiness;
- raw extraction accuracy alone proves user value.

## Scope consequence

Until the ordered actions are complete:

- do not prune recovery passes based only on Phase 5A prefix marginals;
- do not authorize real corpus freezing through the current PR #114 boundary;
- do not use the 16-case, one-reviewer protocol as decisive model-advancement evidence;
- do not expand fields, beverage categories, cloud fallback, or seller/regulator product surfaces on the basis of architectural maturity alone.
