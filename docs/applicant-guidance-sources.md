# Applicant guidance and its official sources

- Date: 2026-11-08
- Related issue: #226 (Block 2)

Label Lens shows each applicant step with a **Help** panel: what Label Lens checks, what it cannot check, what to have ready, and what TTB says. The panel is deterministic. No model writes, selects, or summarizes any of it, and it never reads label, OCR, or uploaded text.

## What the panel may say

| Kind of text | Source | Rule |
|---|---|---|
| What Label Lens checks | The rule guide's summaries (`RULE_SUMMARY`) | Reused verbatim; describes software behaviour, not law |
| What Label Lens does not check, what to have ready | Written for Label Lens | Instructions and honest limits only; tested to make no approval claim |
| Quotes and "questions TTB's page answers" | Official TTB pages | Verbatim; each string must be recorded as found on its page |
| Regulations this check cites | eCFR | Derived from the citation the registered rule carries, never typed separately |

A step without recorded guidance gets an explicit abstention ("Label Lens has no reviewed guidance for this step"), never improvised help. The panel contains no buttons, inputs, or forms: it can explain a step but cannot change a finding, a fact, readiness, or a submission, consistent with the proposed ADR 0016 in #222.

## The source registry

`src/features/guidance/official-sources.ts` lists every official page guidance may quote or link to, with the version its publisher exposes:

- **eCFR sections**: the latest amendment date reported by the eCFR versioner API.
- **TTB pages**: the page's own "Last updated" date.

Links are limited to `https://www.ttb.gov` and `https://www.ecfr.gov`, with no query strings or fragments.

## Verifying the sources

```bash
npm run guidance:verify-sources            # re-check and write the record
npm run guidance:verify-sources -- --check # re-check only
```

The script needs network access to both hosts. For each eCFR section it compares the section title and latest amendment date with the registry, and flags any amendment made after the snapshot date of a rule that cites the section. For each TTB page it compares the title and "Last updated" date and confirms that every quoted string appears verbatim, ignoring only whitespace. It writes `src/features/guidance/official-sources.verification.json` and exits non-zero on any drift, so a person reviews the change before the registry or guidance is updated.

Offline tests tie the registry, every displayed quote, and the `/learn` page's "Official sources and versions" list to that record. CI therefore needs no network access, and it cannot show a quote that was never checked.

## Result on 2026-11-08

All 13 sources matched. eCFR Title 27 was up to date as of 2026-11-05. No cited section (27 CFR 4.32, 4.33, 4.36, 16.20, 16.21, 16.22) had been amended after the snapshot date of the rule that cites it; the most recent amendment is § 4.33, on 2024-12-06. All 13 quoted strings were found on their TTB pages.

## Not included

- No retrieval chat and no language model. A future answer-composition model would need its own authorization, evaluation, and fallback gate.
- No guidance for label items Label Lens does not check. The final step points those to TTB's own pages instead of implying they are optional.
