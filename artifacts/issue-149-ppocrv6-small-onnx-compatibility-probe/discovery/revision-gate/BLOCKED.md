# Blocked — governing plan document unavailable

Refs Issue #149. Evaluation-only. Nothing was downloaded, no runtime was built, no
inference ran, the frozen Brand corpus was not accessed, and no production code or
dependency changed.

## What was asked

Execute §17 of `ppocrv6_candidate_selection_revised.md` exactly: run the four
governed phases (discovery, preregistration freeze, four fixed inference
invocations, typed verdict and sealing) using the exact official ONNX artifact and
ONNX Runtime design selected in that plan.

## What is blocking

**`ppocrv6_candidate_selection_revised.md` is not available.** It is not in the
worktree, not in `origin/main` at `5161a58e02341753a31c2ab889b148b2cecedf81`, and
not anywhere in git history. A follow-up instruction referred to it as attached,
but no document content arrived — only the instruction text.

The nearest file in the repository is
`artifacts/issue-149-parseq-compatibility-probe/candidate-selection-corrections.md`,
which concerns the PARSeq candidate and is a different document.

## What was completed anyway, because it is fully specified

The revision gate was **independently re-verified and preserved before any
download**, as instructed. Result recorded in `revision-gate-verification.json`:

- Expected revision `b8f84f0b80c529de40b4fbb3544b84fa7233a513`
- Observed current revision `b8f84f0b80c529de40b4fbb3544b84fa7233a513`
- **Gate result: PASS**
- Last modified 2026-06-18T11:08:57Z; model card licence `apache-2.0`
- `inference.onnx`: 21,159,378 bytes, LFS-attested
  `sha256:5435fd747c9e0efe15a96d0b378d5bd157e9492ed8fd80edf08f30d02fa24634`

Those observed values are recorded as evidence. They are **not** a preregistration
and they select no runtime design.

## Why the remaining phases were not improvised

Executing "§17 exactly" requires values that only §17 can supply. Each is a
substantive preregistration decision, not a detail with a safe default:

1. **Which ONNX artifact, and the hash and size to freeze.** `inference.onnx` and
   `5435fd74…` were observed, but whether the plan selects that file and pins those
   values must come from the plan.
2. **The ONNX Runtime design** — `onnxruntime` version pin, execution provider,
   thread and determinism settings, input tensor layout, resize and normalization —
   and critically the **character dictionary source and CTC decoding rule**.
   Recognition output is meaningless without the charset, and both `inference.yml`
   (150,579 bytes) and `inference.json` (208,004 bytes) could carry it. Which is
   designated, and how labels map, is a decision.
3. **The four fixed invocations** — which inputs, which repeats.
4. **The typed verdict vocabulary and decision rules.**
5. **The artifact list, freeze and seal mechanics, and workflow mode names.**

Inventing these and labelling the result "§17 executed exactly" would misstate the
work's provenance. That is the same line held earlier in this programme when a
frozen character-error threshold was not relaxed after favourable results, and when
a checkpoint licence was not inferred across three naming systems.

## How to unblock

Paste §17 **as text in the message body** — attachments are not reaching this
session. Alternatively, authorise a preregistration authored here, which would be
labelled as such and explicitly not as §17.

## Provisional location

This directory name is provisional. Once the plan is available, the governed
experiment package should be created at whatever path §17 specifies, and this gate
record can be absorbed into its discovery phase or superseded.
