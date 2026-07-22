# Limitations and observation log

## Audit limitations

- This is a point-in-time audit of `origin/main` at the SHA in [git-sha.txt](git-sha.txt) and the deployed demo on 2026-07-21/22. Deployment state and open issues can change after this record.
- The live demo was inspected only with repository-published public accounts and the bundled M Cellars fixture. No private, confidential, applicant, or proprietary material was uploaded.
- The audit did not create a new package submission or alter persisted review data. Existing shared-demo records were read only.
- The bundled legacy fixture demonstrates that the deployed extractor can complete one known server-side case; it does not close [#125](https://github.com/JosephJMWalker-MBA/label-lens-ttb/issues/125), whose acceptance requires ordinary real-image upload evidence.
- One deployed waiting submission observed during the audit failed stored integrity verification and could not be opened. No persisted data was modified. The audit did not have deployment logs, signing-key history, stored-byte history, or migration history, so the cause is `UNKNOWN_NOT_MEASURED`. Plausible mechanisms—not findings—include stale seeded data signed under another key, a deployment signing-key change, serialization/version drift, corrupted stored bytes, a migration defect, or a current verifier defect. The observation requires P0 reproduction and attribution; it does not prove a general integrity-design or persistence failure.
- `/api/health` was blocked by the in-app browser client ([LIVE-12](#live-observation-log)); its source was inspected, but live health was not independently verified.
- No current operator study or paired manual baseline was found. Human usefulness remains `UNKNOWN_NOT_MEASURED` even though machine accuracy is measured.
- Current combined commit status/check-run data for the audited SHA was unavailable from the connected GitHub surface; local validation of audit artifacts is reported separately. No statement that upstream CI is green is made.
- Historical PR claims were not treated as current product evidence. Proposed ADRs were treated as intended design unless source/tests/live behavior demonstrated them.

## Live observation log

All observations used `https://ttb-test.com` and were made with the in-app browser. Times are approximate; date boundary is local America/New_York.

| ID | Observation | Interpretation boundary |
| --- | --- | --- |
| LIVE-01 | Home displayed four active peer routes—Create, Prepare package, Single-image, Learn—plus two unavailable intents and no visible shared-demo upload warning. | Demonstrates current navigation/presentation only. |
| LIVE-02 | `/create` allowed progression with 0/8 facts to a starter scaffold whose six slots were all “Not provided yet” and repeatedly stated no cited requirement was held. | Demonstrates navigability; does not measure whether a filled scaffold helps. |
| LIVE-03 | `/review` displayed explicit front/back/additional-panel decisions, two categories, local-browser draft language, internal-agent submission language, and no in-product public shared-account/retention warning. Initial navigation hit a stale chunk-load error; a cache-busting query loaded the route successfully. | Treat chunk failure as a transient observed reliability event, not a diagnosed product defect. |
| LIVE-04 | `/learn` listed six wine checks: three artwork-evaluable and three explicitly `not_run` because external evidence was required; only brand and alcohol were read. | Confirms current trust language and narrow scope. |
| LIVE-05 | `/review/legacy` offered one image, declared brand/alcohol, bundled verified M Cellars sample, local/non-stored language, human confirmations, deterministic findings, downloads, and disposition. | Separate compatibility flow; no package/portal handoff observed. |
| LIVE-06 | Bundled M Cellars sample completed. Machine brand was `CELLARS`, state `AMBIGUOUS`, OCR evidence 0.31, with three alternates; declared brand was `M CELLARS`. Alcohol `12.5% ALC./VOL.` passed. Summary required human review of brand; three external-evidence checks were `not_run`. | Valid for this bundled fixture only; not a corpus result or ordinary-upload proof. |
| LIVE-07 | Public seller sign-in succeeded. `/seller` showed one submission, revision v1, “Waiting for agent review,” with no detail link, event history, note, or action. | Existing shared-demo data was not modified. |
| LIVE-08 | Public agent sign-in succeeded. Default waiting queue showed that same single seller package as non-demo, with “Begin internal review” and roughly six hours in queue. | Count is point-in-time and may drift. |
| LIVE-09 | Opening one deployed waiting submission observed during the audit rendered: “This record could not be displayed. Its stored integrity check did not pass, so it is not shown.” | Dated fail-closed observation only. Root cause and generality are unknown; persisted data was not modified; P0 diagnosis is required. |
| LIVE-10 | Agent Demo filter showed 0 submissions while the shared public seller’s record was in the normal waiting queue. | Supports a current demo-classification mismatch; no claim about all historical records. |
| LIVE-11 | Public admin sign-in succeeded. `/admin` showed an agent-queue link and server-side bootstrap command guidance, but no reset, retention, deletion, integrity repair, backup, or account controls. | Operator CLI capabilities outside inspected source may exist; none were demonstrated here. |
| LIVE-12 | Direct in-app browser navigation to `/api/health` returned `net::ERR_BLOCKED_BY_CLIENT`. | Access blocked by client; not evidence that the endpoint is unhealthy. |

## Confidence convention

- **High:** directly present in current source/tests, committed measurements, or repeatable live UI during this audit.
- **Medium:** inferred from multiple current artifacts but not exercised end to end.
- **Unknown:** no current measurement or access; stated plainly.

The audit deliberately does not assign a single numeric product score.
