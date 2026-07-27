# Invalid run record

- Run location: `artifacts/issue-149-brand-otsu-threshold/` excluding
  `clean-retry/`
- Status: invalid; retained only as an audit record
- Date recorded: 2026-07-27
- Superseding run: `clean-retry/`

The first Otsu run was invalid because 7 of 11 control-equivalent PNGs were
RGBA while every treatment PNG was RGB. The treatment therefore changed both
thresholding and encoded channel layout. `gate-failure.md` records the
post-run finding.

All provisional OCR metrics, behavior hashes, mechanism classifications, and
the provisional `KILL` under this directory are excluded from the clean
retry's decision evidence. They must not be copied into, cited as support for,
or aggregated with the clean retry. The files remain unmodified so the invalid
run is auditable.
