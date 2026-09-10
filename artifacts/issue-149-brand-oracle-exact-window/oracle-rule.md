# Frozen oracle construction rule

Frozen and hashed **before** any treatment result was inspected.

## Nature of the instrument

**This treatment is NOT deployable.** The token run is identified offline using
governed Brand truth. It measures downstream headroom only — an upper bound on
what a better enumerator could achieve. It is not, and must never be reported as,
a production mechanism.

## Injection route, and why the alternative was rejected

The synthetic-`RegionOcrResult` route was tested and **rejected**.
`candidateFamilyKey` returns `line:${lineIndexes[0]}` for ordinary candidates —
keyed on line index alone, not on pass id — and line indices restart at 0 in each
pass, so `bestFamilyCandidates` keeps one winner for family `line:0` across all
passes. A synthetic single-line pass necessarily joins that family and can
displace a real candidate, which is a behaviour change for a reason other than
the added candidate.

The route used instead is a narrow default-off evaluation seam,
`oracleExactWindows`, reached only through
`selectBrandObservationWithOracleExactWindows`. Default `[]` emits nothing.
Full-corpus default-path parity is 115/115 byte-identical.

## Eligible unit

Any reconstructed line of any Brand-eligible pass, as the production selector
groups lines. No new pass, region or line is created.

## Truth matching

A line is eligible when its `OcrWord` texts contain the run contiguously under
per-token normalization
`NFD → strip diacritics → lowercase → strip [^a-z0-9]`, identical to the frozen
rule validated in PR #223. The run is the normalized token sequence of a governed
acceptable Brand.

## Multiple-match resolution

Deterministic: within a line, the **earliest start index** wins. Across lines and
passes, every eligible line emits its own oracle window, exactly as an enumerator
would; no cross-line preference is imposed.

## Candidate construction

The span is built from **the line's own `OcrWord` objects**, sliced — never
synthesized. Text, `rawConfidence`, `bbox` and `originalGeometry` are the real
ones. It is built through the production `buildBrandSpan` with:

- assembly `line-window`, the same assembly a real sub-window would carry;
- `lineIndexes` `[lineIndex]` of the true containing line, so it joins that
  line's real candidate family;
- pass and region metadata inherited from the true containing pass, so
  `sourceRegion`, `supportPassIds`, `supportPassKinds` and `recoveryPassUsed`
  report the genuine source.

A window equal to the whole line is skipped, since the whole-line candidate
already exists.

## Placement relative to the trim gate

The oracle span is emitted **before** `shouldTrimWholeLineCandidate`, which gates
ordinary sub-window enumeration on the whole-line candidate being kept and
positive. That gate is precisely what withholds the window today: on a rejected
whole-line span no sub-windows are enumerated at all. Honouring the gate would
guarantee a null result by construction and answer nothing. Recorded here as a
deliberate design choice.

## No privilege

The oracle candidate receives no score bonus, bypasses no filter, and is not
exempt from family suppression, deduplication, ranking, selection or the
authority gate. It is analysed by the same `analyzeBrandSpanWithOptions` and
scored by the same `scoreBrandCandidate` as every other candidate.

## Duplicate handling

Left entirely to production `bestFamilyCandidates` and `dedupeBestCandidates`. If
an equal-valued candidate already exists, the ordinary rules decide; the oracle
gets no tiebreak.

## Population

Treatment applies only to the **40 class-E cases** established by PR #224. Every
other case receives an empty run list and must be byte-identical to baseline. Any
non-E behavioural change is an integrity failure, not a result.
