# State semantics for a re-read contradiction

The sentence the state has to represent honestly:

> *Primary OCR produced a complete, accepted alcohol statement, but two bounded
> re-reads of that statement's own pixels independently recognised a different
> number.*

(That sentence is the claim this document evaluates. Note that "independently"
overstates the evidence: the two re-reads share crop, preprocessing, engine,
model and language and differ only in page-segmentation mode — see
`../alcohol-corroborated-contradiction/limitations.md`. This document was written
before that treatment was killed; it recommends no production change.)

Two facts constrain the answer. First, the evidence is **asymmetric**: the primary
produced a complete statement; the re-reads produced only a **numeral** — on
`approved-wine-037` neither re-read assembles an accepted statement at all. Second,
the value is still the best complete reading available, and this experiment does
**not** replace it.

## The states that exist today

`src/pipeline/analyzer/analyzer.types.ts` defines exactly four:
`OBSERVED`, `LOW_CONFIDENCE`, `AMBIGUOUS`, `NOT_OBSERVED`, with an explicit
doctrine: *confidence is numeric evidence, never an execution gate; only
`NOT_OBSERVED` means nothing was extracted.* `AMBIGUOUS` carries a bounded
`ambiguityReason` (`competing_candidates` / `single_unconfirmed_candidate`) and
alternates, and is documented as the state that **defers to a human**.

There is no `NEEDS_REVIEW`. None should be invented.

## Options

### 1. Preserve value, demote `OBSERVED → LOW_CONFIDENCE`

**Honest?** Partly. It correctly refuses to assert certainty and keeps the value.
But it says *"this reading is weakly resolved"* when the actual finding is
*"this reading is contradicted"* — and it is factually the wrong description of
`approved-wine-037`, whose selected tokens carry confidences 79–96. Low confidence
and contradicted confidence are different failures, and the state would conflate
them with the six cases already sitting in `LOW_CONFIDENCE` for ordinary reasons.

### 2. Preserve state, attach conflicting-evidence diagnostics only

**Honest?** As a record, yes; as a signal, no. `OBSERVED` is the assertion of a
confident reading, and it would still be asserted. Every downstream consumer that
reads the state — and the reviewer glancing at the field — would be told the value
is confirmed while the contradiction sits in a diagnostic payload nobody is
obliged to read. This is the option that leaves the false certainty in place.

### 3. Force `NOT_OBSERVED`

**Dishonest.** The doctrine is explicit that `NOT_OBSERVED` means *nothing was
extracted*. A complete statement **was** extracted and read at high confidence.
Discarding it also destroys recall (`approved-wine-037` currently counts as
detected) in exchange for no information gain — the re-read is not being trusted
either.

### 4. `AMBIGUOUS` with `competing_candidates`, value preserved, re-read carried as an alternate

**The closest honest fit — with one caveat.** `AMBIGUOUS` is precisely the
repository's "two readings, defer to a human" state; it preserves the value, it
carries alternates, and it is already the documented human-deferral signal. It
describes a contradiction rather than a weak signal, which is what actually
happened.

The caveat: `competing_candidates` is currently defined as *candidates of
comparable prominence rivalling each other*, and a re-read numeral is not a
candidate the selector accepted. Using it as-is would stretch a bounded reason
past its written meaning. Honest options are (a) extend the bounded reason set
with a new, documented member such as `contradicted_by_reread`, or (b) do not use
`AMBIGUOUS`. Silently widening `competing_candidates` is not acceptable.

Also worth noting: **no case in the 115-case corpus is currently `AMBIGUOUS`**, so
this would be the first production use of the state, and its downstream rendering
would need checking before it is relied upon.

## Recommendation

`AMBIGUOUS` + a **new, explicitly documented** ambiguity reason, value preserved,
raw and re-read evidence both retained — with `LOW_CONFIDENCE` as the fallback if
extending the bounded reason set is judged out of scope. Option 2 is not
sufficient on its own, and option 3 is ruled out by the repository's own
definition.

Whichever is chosen, the selected value is **not** replaced by the re-read value.
