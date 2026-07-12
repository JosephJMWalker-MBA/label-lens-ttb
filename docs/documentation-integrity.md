# Documentation Integrity Validator

- Status: Accepted
- Date: 2026-07-12

## Purpose

The repository treats documentation, ADRs, policies, and review artifacts as
part of the governed system. This validator catches **mechanical and structural**
documentation failures that ordinary TypeScript tests do not — broken repository
links, malformed or unclosed code fences, ADR identity/metadata drift, and abrupt
truncation. It requires no network access and adds no new dependency.

## How it runs

```bash
npm run docs:check     # focused validator run
npm test               # also runs it as part of the suite
```

The validator is implemented under `src/docs/` and driven by
`src/docs/documentation-validator.test.ts`. Discovery is deterministic
filesystem walking; build output, dependencies, and the intentionally broken
regression fixtures under `src/docs/__fixtures__/` are excluded.

## Checks and diagnostic codes

Every finding is a structured `DocumentationDiagnostic` with a stable `code`, a
`severity` (`error` gates; `warning` is advisory), the source `file`, and a
`line` where applicable.

- **Links** — `LINK_BROKEN`, `LINK_EMPTY`, `LINK_ANCHOR_MISSING` (warning). External `http(s)`, `mailto`, and in-code links are ignored.
- **Fences** — `FENCE_UNCLOSED`, respecting fences longer than three characters and both `` ``` `` and `~~~` markers.
- **ADR identity** — `ADR_ID_DUPLICATE`, `ADR_ID_MISMATCH`, `ADR_TITLE_MISSING`, `ADR_STATUS_MISSING`, `ADR_STATUS_INVALID`, and `ADR_DATE_MISSING` (warning). Both the bullet-metadata format and the older `## Status` section format are supported; section-format ADRs are grandfathered for the date requirement.
- **Accepted policies** — `POLICY_TITLE_MISSING`, `POLICY_SECTION_MISSING` (warning), applied only to documents that self-declare an accepted governing status.
- **Truncation** — `TRUNC_EMPTY_FINAL_HEADING`, `TRUNC_DANGLING_WORD`, `TRUNC_PROSE_NO_TERMINAL`, `TRUNC_TRAILING_COLON` (a file ending inside an unclosed fence is reported as `FENCE_UNCLOSED`). These are deliberately conservative to avoid flagging tables, code, diagrams, filenames, versions, and short taglines.
- **Structure** — `HEADING_NO_SPACE`, `TABLE_SEPARATOR_INVALID` (warning).

## Known-issue baseline

The validator surfaced several genuine, pre-existing truncations in governing
documents on `main`. Because repairing them is substantive policy authoring
(out of scope for the validator itself), they are recorded explicitly in
`src/docs/known-issues.ts`. The gate asserts the live error set equals that
baseline exactly: a **new** un-baselined error fails CI, and a baseline entry
that no longer reproduces also fails — so the list can only shrink as documents
are repaired. The baseline must never be used to silence a genuinely new defect.
