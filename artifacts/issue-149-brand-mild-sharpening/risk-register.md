# Risk register

| Risk | Evidence in this experiment | Mitigation / disposition |
| --- | --- | --- |
| Small governed corpus | 11 regions from 10 fixtures; Wilson 95% interval for a 0/11 rate is 0–25.9%. | Report uncertainty and do not generalize beyond these slices. |
| Duplicate dependence | Three La Fattoria cases and two Dry Cellar regions share independence families. | Gate success on at least two independent families; no case improved here. |
| No correct control cases | Control exact, normalized, raw-truth, candidate-list, and top-3 outcomes are all 0/11. | Preserve the negative result; do not infer selector safety from accuracy improvement. |
| Latency noise from per-panel worker lifecycle | Primary ratios are 1.158× median / 1.176× p95; repeat ratios are 1.174× / 1.234×. OCR behavior hashes are stable while timings vary. | Apply ceilings to both runs. Both final runs are within the 1.25× / 1.35× ceilings, so latency is not a kill reason. |
| Treatment-induced empty OCR | Dry Cellar region 2 changes from non-empty OCR to empty OCR in both behavior-identical treatment runs. | Kill the treatment; keep it default-off and out of production. |
| Subjective visual slices | Style slices were assigned by paired-image-independent inspection before treatment. | Definitions, per-case assignments, and `unknown` policy are frozen in `slice-definitions.md`. |
| Mechanism overclaiming | Some images look crisper but still produce wrong or noisy OCR. | Use deterministic trace classifications; leave two cases `UNDETERMINED` and separate visual plausibility from causal claims. |
| Seller-truth leakage | Fixed truth is evaluated only after OCR execution; the execution input contract omits truth. | Retain the contract test and do not pass seller text or acceptable values to OCR. |
| Production behavior drift | The only runtime support change is under the research fixture module; three production extractor hashes match merged PR #197. | Keep treatment evaluation-only and default-off; production-hash tests must remain green. |
| Open PR #195 interference | Its Brand selector baseline file hash remains exactly the merged-main value. | Do not rebase, edit, merge, or close PR #195 in this task. |

## Disposition

The treatment is rejected. Preserve these artifacts as negative evidence. The single next recommendation is a separately preregistered **local contrast enhancement** experiment using one fixed Sharp CLAHE configuration (`width: 3`, `height: 3`, `maxSlope: 3`) against the same control and gates. It was not run in this task.
