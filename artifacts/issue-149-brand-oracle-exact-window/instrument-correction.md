# Instrument correction — separator tokens

**Disclosed defect in the instrument, found after the first run.** The frozen
rule (`b57d6fc6…`) is unchanged; the implementation was brought into conformance
with it.

`oracleWindowInLine` normalized per token but did not skip tokens that normalize
to the empty string. On a line reading `… LUIGI & GIOVANNI`, `&` normalizes to
`""` and sits between `luigi` and `giovanni`, so no contiguous match was found.
The frozen rule specifies matching identical to PR #223's `classifyRawOcrMatch`,
which drops empty tokens before comparing, so the first implementation deviated
from the rule.

Fixed: empty-normalizing tokens are skipped when matching but retained inside the
emitted slice — what a real sub-window of that line would carry — and a window
may not begin on such a token. Two regression tests cover both properties.

Effect: oracle candidates produced rose from 37 to 39 of 40; the affected cases
were `luigi-giovanni-live`, `approved-wine-105` (both `Luigi & Giovanni`) and
`approved-wine-054`. The superseded aggregate is retained in
`superseded-pre-separator-fix/` rather than deleted. Production parity was
re-verified after the fix.

One case remains unproduced: `approved-wine-054` (`Henri Dufreres`). Its truth run
is visible in the diagnosis line text but not as contiguous `OcrWord` tokens in
any line, so no window could be emitted. It is reported as
`UNDETERMINABLE_ORACLE_NOT_PRODUCED`, not as a downstream failure.
