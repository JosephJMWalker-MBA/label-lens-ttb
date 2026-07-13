# Rubber Duck Review Tooling and Privacy Path

**Status:** Accepted operating record  
**Scope:** Label Lens TTB review workflow  
**Purpose:** Record the tools used to turn repository evidence into Rubber Duck Review debate material, transcripts, critiques, and implementation gates, while distinguishing the current homework workflow from a future internal government-capable implementation.

## Current workflow

Rubber Duck Review is a structured engineering-review process used to expose contradictions, hidden assumptions, authority confusion, evidence gaps, and implementation risk before additional work is assigned.

The current workflow is:

1. Gather a bounded review packet from repository evidence.
2. Prepare a script or structured source document that frames the review question.
3. Use NotebookLM to generate a multi-voice discussion from that bounded packet.
4. Capture the discussion as audio.
5. Use MacWhisper locally to transcribe the audio.
6. Review the transcript against the source audio where exact wording matters.
7. Use Joseph + ChatGPT to reconcile claims against GitHub evidence.
8. Convert supported findings into issues, gates, ADRs, task packets, or explicit future work.

The discussion is advisory. Repository evidence, measured reports, tests, and human review remain authoritative.

## Tool roles

### NotebookLM

NotebookLM is used to turn a bounded packet into a multi-perspective discussion. Its value is not that it makes decisions. Its value is that it can surface:

- contradictions between documents;
- unstated assumptions;
- competing interpretations;
- questions that a single linear review may miss;
- language that sounds more authoritative than the implementation warrants;
- places where human context is required.

NotebookLM output is discussion material, not an evidentiary source. It must not be treated as proof that a repository claim is true.

### MacWhisper

MacWhisper is used locally to transcribe the generated review audio.

The transcript is a working artifact. It may contain omissions, substitutions, speaker confusion, punctuation errors, or incorrect technical terms. Before precise wording becomes a requirement, issue, or ADR, the relevant segment should be checked against the source audio and repository evidence.

### Joseph + ChatGPT

Joseph + ChatGPT serve as the review control plane. They:

- define the review question;
- decide what evidence enters the packet;
- distinguish findings from speculation;
- reconcile the transcript with GitHub;
- identify where maintainer context is missing;
- convert supported findings into bounded next actions;
- preserve human authority over product and merge decisions.

### GitHub

GitHub is the durable synchronization layer. A review conclusion is not repository truth until represented by an issue, ADR, report, accepted policy, task packet, PR, or other durable record.

## Review packet requirements

A bounded review packet should include:

- the review question;
- current product and authority boundaries;
- implemented behavior;
- measured capability;
- relevant ADRs and accepted policies;
- current issues and known limitations;
- exact areas where contradiction or drift is suspected;
- explicit exclusions;
- a distinction between homework scope and future operational scope.

The packet should avoid unnecessary personal data, credentials, secrets, unrelated repository material, and speculative future features.

## Evidence discipline

Rubber Duck Review must distinguish:

- implemented fact;
- measured result;
- documented target;
- open issue;
- preview-only behavior;
- future work;
- inference;
- uncertainty;
- maintainer context required.

A compelling discussion does not override tests, metrics, source code, accepted ADRs, or human authority.

## Current homework boundary

For this hiring assignment, repository-available scripts and review material may be used to generate the review, provided the packet stays bounded and contains no secrets or inappropriate private material.

The homework does not require building an internal review-generation system. NotebookLM and MacWhisper are practical tools for the present workflow.

## Future government-capable privacy path

A real government deployment could involve information that should not be sent to an external hosted discussion system.

A future internal workflow should support:

- redacted or sanitized review packets;
- automatic exclusion of sensitive sections before script generation;
- approved internal model hosting where required;
- internal speech generation or a text-only debate mode;
- internal transcription;
- role-based access;
- audit logging;
- retention and deletion policy;
- provenance for every generated statement;
- reproducible review packets;
- separation between advisory discussion and authoritative findings.

The system could generate a multi-perspective review internally using patterns already explored in other projects: bounded role prompts, structured debate, contradiction detection, evidence citation, confidence labeling, and a human-controlled findings ledger.

That is feasible future work, but it is explicitly outside this assignment.

## Censorship and sanitization model

For a sensitive deployment, the source script should be generated from an approved evidence view rather than the entire repository.

The pipeline should permit:

1. classify source material by sensitivity;
2. exclude prohibited content;
3. replace sensitive values with stable placeholders where discussion still requires structure;
4. preserve citations to approved internal references;
5. generate the debate only from the sanitized packet;
6. prevent the discussion layer from retrieving omitted material;
7. retain the original and sanitized packet hashes for audit;
8. require human approval before findings are promoted into authoritative work.

Sanitization must happen before external processing. Redacting only the final transcript is insufficient.

## Output and follow-through

A completed Rubber Duck Review should produce:

- executive verdict;
- strongest coherent elements;
- contradictions and drift;
- authority and evidence findings;
- accessibility and interaction findings where relevant;
- test and performance adequacy findings;
- uncertainty and missing context;
- findings ledger with severity;
- questions for the maintainer;
- recommendations separated by immediate homework, post-assignment, and future government-grade work.

Not every observation becomes backlog work. The coordination layer decides which findings justify an issue, gate, ADR, correction, or no action.

## Review triggers

Run or refresh a Rubber Duck Review when:

- multiple major phases have merged;
- architecture, UI, and measured capability may have drifted apart;
- a new workflow changes user expectations;
- authority or evidence language changes;
- an agent exceeds scope;
- the README or governance documents contradict current behavior;
- a release or assignment submission approaches;
- a future government-grade deployment materially changes privacy requirements.
