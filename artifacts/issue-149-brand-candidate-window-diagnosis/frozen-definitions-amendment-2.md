# Amendment 2 — B and C become secondary phenotypes

**Disclosure: post-inspection taxonomy refinement.** Aggregate results had
already been seen when this was written. It is not recorded as a pre-inspection
decision. Both earlier hashes are retained unchanged:

- `frozen-definitions.md` — `deed0705e41db544d65bb60ecafdf10e6602b4745c31a66a6745f1c52e23a9ea`
- `frozen-definitions-amendment-1.md` — `7ec0e4a74014b5f7f532862f60cb808aa574524c9a6e2e010326301c56da3ace`

## The refinement

`B` (overwide) and `C` (partial) described *what the generator happened to
produce near the truth*, not *why the correct candidate ceased to exist*. If the
exact Brand tokens sit contiguously inside one eligible generation unit and the
generator emits a six-word overwide span and a one-word partial span but never
the exact two-word Brand, the earliest actual loss is that the available correct
window was not enumerated. Calling it `B` or `C` reports a symptom.

## Amended primary classification — earliest actual loss

1. **A** — an exact correct candidate was generated pre-filter, then rejected.
   (Kept → scope violation; the case does not belong to the loss population.)
2. **F** — the exact truth span was representable and emitted, but
   tokenization / normalization / value construction prevented an exact correct
   candidate.
3. **D** — the truth cannot be represented inside one generation unit because it
   crosses a line, region or pass boundary.
4. **E** — the exact truth token run exists inside one eligible generation unit,
   but the generator never emitted that exact window.
5. **G / H** — other / undeterminable.

## Secondary window phenotypes — counted independently, not mutually exclusive

- **B flag** — an overwide candidate was also generated.
- **C flag** — a partial / underwide candidate was also generated.

A case may carry both flags, or neither, independently of its primary class.

## Effect on counts

Primary classes change; the roll-up does not. Every case previously classified
`B` had a truth-bearing generation unit and no exact candidate and no emitted
exact span, so its earliest actual loss is `E`. `WINDOW_SPAN_FORMATION_LOSS` was
already `B + C + E` and is now `E` alone, so the roll-up total is unchanged. The
exact figures are reported in `aggregate.json` and in the checkpoint.

`approved-wine-024` remains `F`.
