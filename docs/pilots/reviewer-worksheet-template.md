# Reviewer worksheet template — ship-readiness pilot

Two clearly separated passes. **Which mode comes first is not fixed** — it is set
per case by the preregistered counterbalanced order (`review-order.json`): a
manual-first case renders the manual pass first; an assisted-first case renders
the assisted pass first. The **Second pass must remain hidden until the First
pass is saved.** Capture no expected answers here before the study — this records
what the reviewer actually did.

Per-case instances are generated locally (gitignored) by
`scripts/pilots/pilot-intake.ts worksheets`, which stamps each case's assigned
first-pass mode from the order file. The headings below are the neutral template;
in a generated instance each pass names its assigned mode
(`MANUAL_BASELINE` or `ASSISTED`).

---

Preregistered assignment: First pass = `<assigned mode>`, Second pass = `<opposite mode>`.

## First pass — `<assigned mode>`

- assignedMode:
- *(manual-baseline fields, or assisted fields, depending on the assigned mode)*

<!-- ===== DO NOT READ OR COMPLETE THE SECOND PASS UNTIL THE FIRST PASS IS SAVED ===== -->

## Second pass — `<opposite mode>`

- assignedMode:
- *(the remaining mode's fields)*

### Manual-baseline pass fields (no Label Lens)

`reviewerId`, `reviewOrderStep`, `startTimestamp`, `endTimestamp`,
`identifiedBrandEvidence`, `identifiedAlcoholEvidence`,
`uncertaintyOrUnreadabilityNotes`, `followUpOrReplacementImageNeeded`,
`escalationReadinessDisposition`, `reviewerExplanation`.

### Assisted pass fields (Label Lens)

`startTimestamp`, `endTimestamp`, `runCompletionState`, `timeToFirstUsableOutput`,
`machineBrandObservationRef`, `machineAlcoholObservationRef`,
`acceptedMachineReading`, `alternateSelected`, `manualCorrection`,
`notVisibleUnreadableOrAmbiguousDecision`, `replacementImageNeeded`,
`falseCertaintyEvent`, `technicalFailureOrTimeout`, `totalAssistedHandlingTime`,
`helpedHarmedOrNoDifference`, `escalationReadinessDisposition`,
`reviewerExplanation`.
