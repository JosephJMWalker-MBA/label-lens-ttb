# Complete Brand filter diagnostics — governance report

## Scope

**Diagnostics only. Evaluation-only. Default-off.**

This change makes every Brand filter predicate result *observable*. It changes no
selection behaviour, relaxes no filter, authorizes no treatment, and adds no
production caller.

## The ten-rule ladder, in exact evaluation order

`producer-line` → `no-letters-or-too-short` → `non-brand-keyword` →
`too-many-words` → `domain-like` → `varietal-or-designation` →
`generic-product-language` → `location-or-appellation` →
`low-information-fragment` → `sentence-fragment`

The authoritative ladder short-circuits on the first failing rule. That is why
`activeRejectionReasons[0]` equals the authoritative `filterReason`.

## Optional schema

```ts
export const BRAND_FILTER_CHECK_ORDER = [ /* the ten rules above */ ] as const;
export type BrandFilterCheckName = (typeof BRAND_FILTER_CHECK_ORDER)[number];
export interface BrandFilterCheck { check: BrandFilterCheckName; failed: boolean }

// optional on BrandCandidateDiagnostic, added by conditional spread:
filterChecks?: BrandFilterCheck[];
activeRejectionReasons?: BrandFilterCheckName[];

export function selectBrandObservationWithCompleteFilterDiagnostics(
  results: RegionOcrResult[],
): FieldSelection;
```

`collectCompleteFilterDiagnostics` defaults to **false**.

## Predicate purity audit

Evaluating all ten rules after one has already fired is only sound if every
predicate is pure. All ten were read:

- each takes a `string` or a read-only `OcrWord[]` and returns a `boolean`;
- none mutates its argument — only `.some`, `.filter`, `.map`, `.split`,
  `.join`;
- `PRODUCER_WORD` and `NON_BRAND_LINE` carry **only `/i`**, so no
  `.test()` call advances a `lastIndex`; the `/g` regexes present are used
  with `String.replace`, which keeps no state between calls;
- the lookup tables are `Set`/array reads;
- no I/O, clock, randomness or mutable closure state.

**No predicate is stateful, destructive or order-dependent.** The completeness
claim is substantiated, not assumed.

## Authoritative-decision-first structural isolation

`analyzeBrandSpan` is **untouched**. It runs first and fixes `kept` and
`filterReason` *before any additional predicate executes*. A wrapper then
decorates a copy of the resulting diagnostic.

A later diagnostic check therefore cannot alter the authoritative result — not
because the code is careful, but because the decision already exists by the time
any extra predicate runs. The only deletions in the production diff are three
call-site renames.

## Runtime invariant checks

When and only when diagnostics are enabled, eight invariants are enforced. A
violation throws an `Error` whose message begins exactly
`BRAND_FILTER_DIAGNOSTIC_INVARIANT_FAILURE`:

1. exactly `BRAND_FILTER_CHECK_ORDER.length` checks exist;
2. every check occurs exactly once;
3. checks occur in exact ladder order;
4. `activeRejectionReasons` equals the failed checks in ladder order;
5. every rejected candidate has at least one active reason;
6. a rejected candidate's first active reason equals its authoritative
   `filterReason`;
7. every kept candidate has zero active reasons;
8. every kept candidate has zero failed checks.

The assertion reads the authoritative fields and never writes them, so a failure
surfaces a diagnostic defect rather than changing a production outcome. The
default path performs neither the additional predicates nor these checks.

## Default output has no new own properties

The fields are attached by conditional spread, so on the default path a candidate
has **neither key as an own property** — not merely `undefined`. `Object.keys`
and `JSON.stringify` are unchanged from before the fields existed. Tests assert
`Object.hasOwn(...) === false` on the default path and `=== true` on the
evaluation-only path.

## Focused tests

`src/pipeline/extractor/brand-filter-diagnostics.test.ts` — **30 tests**, all
built from synthetic words constructed in the test file. No fixture, no governed
corpus, no Brand truth, no expected answer.

Coverage: the five ladder invariants across every candidate the pipeline builds;
single-rule and multi-rule failures including `producer-line`,
`too-many-words` and `domain-like` each paired with a later rule; default
omission and evaluation-only inclusion; `Object.hasOwn`, `Object.keys` and
JSON-serialization shape; full equivalence of ranked order, kept status,
authoritative reason, score, ranking, selected value, confidence, alternates,
authority state, abstention reason and line diagnostics with diagnostics off and
on; and each of the eight runtime invariants rejecting a malformed input with the
exact message prefix.

## OCR disclosure

**The governed 115-case corpus was NOT run.**

The standard test suite does execute pre-existing real-OCR cases on bundled
benchmark images — `extractor.test.ts` and the precheck integration tests. Those
run on every PR regardless of this change and are unrelated to the governed
corpus. This is disclosed rather than left implicit under a blanket "no OCR"
claim.

## Boundary transition

`field-selection.ts` moved from
`3e84fa8a043570713991643830c7b95e0f7189a4ed037b737c783353d519106d` to
`8e05462a86449c5e7cd91993e213ed0447a2389aae6bd3216cefd1b4e895e79c` under explicit owner authorization. See `boundary-rebaseline.md`.

## What is NOT authorized

No filter treatment. No filter relaxation. No change to candidate formation,
ranking, selection, authority or state semantics. This change makes the complete
rejection-reason set observable and nothing more.

## PR #219 and PR #195

Both remained **untouched** by this work.

**PR #195 consequence, recorded without modifying it:** its branch is untouched;
its prior validation does **not** authorize merging after this main-boundary move;
after PR #220 merges, PR #195 must be rebased on the new main and must rerun its
focused Brand evaluation and ordinary CI before any merge decision. That rebase is
deliberately **not** performed here.
