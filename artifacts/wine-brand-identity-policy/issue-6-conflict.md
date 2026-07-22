# Issue #6 conflict audit

**Issue #6 is not edited in this round.** This documents a tension and proposes
revised wording for a *later*, separate decision.

## The exact issue #6 language

Issue #6 ("Formalize and bind versioned field-specific normalization policies"),
under **### Brand → Continue to forbid**, lists:

> "- treating producer or bottler text as brand evidence;"

The production encoding of that rule is `isProducerLine()`
(`src/pipeline/extractor/field-selection.ts:1517`): a line with a `PRODUCER_WORD`
(*produced/bottled/made/vinted/cellared/grown/packed/blended*) **and** a
standalone `by` is dropped with reason `producer-line`. The corpus QC check
`producer-importer-bottler-not-brand` enforces the same idea in fixture truth.

## The tension with 27 CFR 4.33(a)

§4.33(a): *"…if not sold under a brand name, then the name of the person required
to appear on the brand label shall be deemed a brand name…"*

So the regulation makes the responsible-person (producer/bottler) name **the
brand** in one specific circumstance — when no separate brand is used. Issue #6's
rule, read literally as *"producer or bottler text is never brand evidence,"*
would **forbid the very fallback the regulation requires.**

`patricia-green-cellars` is the concrete collision: its brand `Patricia Green
Cellars` appears only in the URL and the "PRODUCED & BOTTLED BY" line. Under
§4.33(a) that responsible-person name is the deemed brand; under a literal reading
of issue #6 it is inadmissible as brand evidence.

## But the two are not actually opposed — they answer different questions

Read precisely, issue #6's concern is **override**: producer/bottler text must not
*displace* or *outrank* an explicit marketed brand, and must not be treated as
brand evidence *by default*. §4.33(a) is about **fallback**: when there is no
other brand, the responsible person is deemed the brand. These are compatible if
stated as an ordered rule rather than an absolute prohibition.

The current implementation is too blunt in one direction (it drops producer lines
unconditionally, so it cannot ever surface the §4.33(a) fallback) and the
authority gate is too blunt in the other (a designator token can make a producer
name `positive` regardless of role — see `authority-impact.md`).

## Proposed revised policy wording (for a later issue #6 amendment — NOT applied)

Replace the single bullet *"treating producer or bottler text as brand evidence"*
with a four-part rule:

1. **No override.** Producer/bottler/importer text must never *displace or outrank*
   an explicit marketed brand shown elsewhere on the brand label.
2. **Not automatic evidence.** Producer/bottler identity is not, by itself, brand
   evidence; a §4.35 name-and-address statement is presumed a responsible-person
   statement, not a brand.
3. **Regulated fallback.** A responsible-party name **may** serve as the brand
   **only** as the §4.33(a) *deemed brand*, and only when no separate marketed
   brand is identified — and it must be recorded *as a fallback*, distinct from an
   explicit marketed brand.
4. **Artwork-only uncertainty stays visible.** Where the artwork cannot establish
   whether a name is the marketed brand, a responsible person, or a §4.33(a)
   fallback, the role is left unresolved rather than assigned.

This keeps issue #6's real intent (no override, no default brand-from-bottler)
while making room for the regulation's fallback and for honest uncertainty. It
also matches the two-axis model: (2) is `RESPONSIBLE_PERSON_NAME`+`NOT_BRAND`, (3)
is `RESPONSIBLE_PERSON_NAME`+`FALLBACK_DEEMED_BRAND`, (4) is `UNRESOLVED_*`.

## Recommendation

Do not edit issue #6 now. Carry the revised wording into a dedicated issue #6
amendment decision, alongside the schema question in `recommendation.md`. The
current literal rule should be understood as *"do not treat producer/bottler text
as brand evidence **that overrides an explicit brand**"* — which is what the
implementation actually does for cases with a competing brand, and what the corpus
truths (e.g. `approved-wine-049` forbidding `Damiani Wine Cellars`) actually
encode.
