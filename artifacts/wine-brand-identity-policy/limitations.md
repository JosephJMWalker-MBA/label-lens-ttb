# Limitations

- **Not legal advice, not a TTB determination.** A research reading of public
  regulations to inform a corpus-policy decision.
- **TTB guidance is operator-verified, not worktree-fetched.** ttb.gov timed out
  from this environment on 2026-07-21; the four TTB pages (Brand Name, Anatomy of
  a Wine Label, Brand Label, Name and Address) were live-verified through
  operator/web research on 2026-07-21 and supplied to the worktree, per the
  provenance note in `source-memo.md` §6. They are **explanatory guidance**, not
  binding regulation. The CFR text is from the Cornell LII mirror (eCFR itself was
  behind a bot wall), retrieved 2026-07-21; verify against official eCFR before
  any reliance.
- **Roles are my visual reads.** The per-element role/status assessments come from
  inspecting the artwork this session; several are judgment calls (e.g. Caywood
  Vineyard as designation vs brand). They are analysis for review, not ground
  truth.
- **`currentSelectedCandidate`/`state` come from the committed extractor report**
  (`docs/extraction-full-corpus/extractor-report.json`, regenerated 2026-07-18),
  not a fresh run. Its brand figures were verified unchanged by the region round;
  #150/#151 were alcohol-only.
- **Artwork-only.** No case was resolved using permit, COLA, or marketing facts,
  which is exactly why several remain `UNRESOLVED_FROM_ARTWORK`.
- **Controls are lightly assessed.** They anchor archetypes and the authority
  audit; they are not given the full element-by-element treatment of the primary
  13.
- **The brand-absent fallback question** (`approved-wine-022`/`082`) is flagged,
  not resolved, and is out of scope for the primary 13.
- **No production, schema, fixture, test, OCR, ranking, authority, UI, package, or
  issue change was made.** This round is analysis only.
