# Revisit criteria

This research is **deferred, not refuted**. It becomes eligible for another round
when **at least one** of the following is true. Any future round should re-read
`decision.md` and `limitations.md` first, and must not treat the schema sketch in
`specification.md` §2 as approved.

## A — a second naturally occurring case

At least one additional corpus case shows the same mechanism: a primary
full-image pass produces a complete, accepted alcohol statement, and bounded
re-reads of that candidate's own pixels recover a different canonicalized
numeral. Two independent positives make a precision estimate meaningful for the
first time; one does not.

The case must occur naturally. Constructing a fixture to produce the mechanism
does not satisfy this criterion.

## B — a genuinely more independent evidence source, available locally

The core weakness is that the two reads share crop, preprocessing, engine, model
and language. Any of the following would materially change that, provided it adds
no dependency and no external service:

- **a separately derived crop** whose geometry does not come from the same token
  union — and which is demonstrated not to be a *worse* reader (the full-width
  line band already failed this: it re-segments `13.0` as `| 3.0`);
- **a different OCR engine already present in the repository**;
- **character-level evidence** — per-glyph alternatives or confidences from the
  existing engine, which would give a second opinion without a second pass;
- **another non-shared preprocessing path** demonstrated safe against the fixed
  corpus before it is used as a corroborator.

## C — a corpus large enough to measure precision

The corpus grows enough that the trigger's precision and its false-ambiguity rate
can be estimated with a meaningful interval rather than asserted from zero
observed false alarms in 68 correct cases. This will also require the evaluator to
be able to *see* the outcome: `classifyAlcohol` currently has no `AMBIGUOUS`
branch, so a contradicted `OBSERVED` and a corroborated one classify identically.

## D — a general product requirement

The product contract develops a general requirement to preserve contradictory
machine observations — for any field, not as a special case for one alcohol
fixture. If contradiction-preservation becomes a contract-level obligation, the
schema extension is justified by the contract rather than by this single case, and
the cost question changes accordingly.

## Explicitly not a revisit trigger

- Desire for the corpus metric to improve. Implementing this changes no metric.
- `approved-wine-037` alone. It is already recorded as a confirmed engine
  limitation; re-litigating one fixture is what these criteria exist to prevent.
- `approved-wine-018`. Out of scope here and unaddressed; it needs its own round.
