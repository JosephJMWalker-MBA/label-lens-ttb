# Reviewer worksheet template — ship-readiness pilot

Two clearly separated phases. **Phase B must remain hidden while Phase A is in
progress.** Complete and save Phase A, then reveal Phase B. Capture no expected
answers here before the study — this records what the reviewer actually did.

Per-case instances are generated locally (gitignored) by:
`scripts/pilots/pilot-intake.ts worksheets`.

---

## Phase A — manual baseline (no Label Lens)

| Field | Value |
|-------|-------|
| pilotId | |
| reviewerId | |
| reviewOrderStep | |
| startTimestamp | |
| endTimestamp | |
| identifiedBrandEvidence | |
| identifiedAlcoholEvidence | |
| uncertaintyOrUnreadabilityNotes | |
| followUpOrReplacementImageNeeded | |
| escalationReadinessDisposition | |
| reviewerExplanation | |

<!-- ================= DO NOT REVEAL UNTIL PHASE A IS SAVED ================= -->

## Phase B — Label Lens assisted review

| Field | Value |
|-------|-------|
| startTimestamp | |
| endTimestamp | |
| runCompletionState | |
| timeToFirstUsableOutput | |
| machineBrandObservationRef | |
| machineAlcoholObservationRef | |
| acceptedMachineReading | |
| alternateSelected | |
| manualCorrection | |
| notVisibleUnreadableOrAmbiguousDecision | |
| replacementImageNeeded | |
| falseCertaintyEvent | |
| technicalFailureOrTimeout | |
| totalAssistedHandlingTime | |
| helpedHarmedOrNoDifference | |
| escalationReadinessDisposition | |
| reviewerExplanation | |
