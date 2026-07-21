# Alcohol digit-OCR research — reading order

Two connected rounds are preserved here. Several documents in **this** directory
were written before the follow-on round and carry supersession banners; read in
this order so the corrections arrive before the conclusions they correct.

1. **`summary.md`** — the diagnosis: measured baseline, the two confirmed digit
   errors, their (different) visual mechanisms, the 896-run OCR matrix, and the
   corpus control that killed any value-*replacing* treatment.
2. **`decision-addendum.md`** — the correction round. Contains the
   diagnostic-history disclosure: an ad-hoc regex in the research instrument read
   `135%` as `35`, where production canonicalization correctly reads **13.5**. The
   two "false alarms" reported earlier are withdrawn here.
   Case detail: `contradiction-case-notes/`.
3. **`candidate-experiments.md`** — the ranked experiment list, including E1.
   Its "(recommended)" heading is historical and is marked as such.
4. **`../alcohol-corroborated-contradiction/specification.md`** — the full
   pre-implementation specification of E1: schema inspection, re-read
   configuration, independence analysis, measured cost.
5. **`../alcohol-corroborated-contradiction/decision.md`** — **the final
   disposition: KILLED (deferred). Nothing was implemented.**
6. **`../alcohol-corroborated-contradiction/limitations.md`** — what this research
   does *not* establish.
7. **`../alcohol-corroborated-contradiction/revisit-criteria.md`** — the
   conditions under which the work becomes eligible again.

**`omitted-intermediate.md`** records the one working file deliberately not
committed here (`all-cases-slim.json`, a 3.35 MiB derived OCR intermediate) with
its SHA-256, its generation command, and the verification that it regenerates
byte-identically. Two scripts need it rebuilt before they will run; the trigger
analysis that carries this record's conclusions does not.

Also in this directory: `state-semantics.md` (why `LOW_CONFIDENCE` is not an
honest substitute), `case-notes/` (per-case mechanism notes for
`approved-wine-018` and `approved-wine-037`), `commands.sh` (reproduction), and
the raw evidence files the numbers come from.

## Standing outcomes

- **`approved-wine-037`** — visible `13.0`, machine reads `19.0`. Confirmed OCR
  engine limitation. No production change was made.
- **`approved-wine-018`** — visible `13.5`, machine reads `3.5`. Confirmed engine
  limitation, **unresolved and not worked on**.
- **No document in this record recommends a production change**, and the schema
  extension sketched in `../alcohol-corroborated-contradiction/specification.md`
  §2 is a design candidate, never an approved contract.
