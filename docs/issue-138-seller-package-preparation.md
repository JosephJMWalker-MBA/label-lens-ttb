# Issue 138 — seller package preparation vertical slice

## Authority and scope

This implementation is the smallest end-to-end slice authorized by GitHub Issue #138 and its
binding comments. It starts from `e575ca664b6ea897b0d7a25235dc87da428b69dd` on `origin/main`.

It proves this lifecycle:

```text
front + explicit back/additional-panel decisions
  -> reviewed-profile category checklist
  -> seller values, uncertainty, absence, and panel-relative regions
  -> local draft save
  -> package analysis
  -> immutable machine run + append-only seller history
  -> correction and reanalysis
  -> readiness gate
  -> local agent-package download
```

The final arrow is not a transmission. There is no agent receiver, TTB integration, government
authentication, approval, or submission receipt in this slice.

## Before and after

Before this slice, `/review` was a one-image pre-check whose declared facts had to exist before the
analyzer ran. Seller evidence-region work happened only after a machine result. That unchanged
workflow remains available at `/review/legacy`.

After this slice, `/review` starts with package and seller evidence preparation. The front label is
required. The seller must either upload a back label or explicitly choose "No back label," and must
either add another panel or explicitly choose "No additional panels." These decisions do not
create placeholder artifacts. Uploaded back, neck, side, and other panels preserve a stable id,
order, SHA-256, decoded dimensions, media type, byte size, rotation, and their own normalized
coordinate frame.

## Reused production boundaries

- Category definitions are projected from `wineRequirementsRegistry`; the UI does not author a new
  regulatory field or citation.
- Each panel uses the existing local `extractLabelEvidenceDetailed` extractor and executable
  provenance source.
- Existing analyzer observation types and geometry are reused without mutation.
- The existing one-image analyzer, deterministic rule registry, finding states, result schema,
  evidence schema, provenance schema, JSON export, HTML export, and export bytes are unchanged.
- The existing browser download helper is reused for the new, separately versioned local package
  record.

Package states (`clearly_readable`, `needs_review`, `not_found`, `not_applicable`) are preparation
readability states. They are not regulatory findings and do not replace `PASS`, `NEEDS_REVIEW`,
`not_run`, or internal dispositions.

## New contracts

`seller-package-draft.v1` contains:

- package identity and reviewed requirements-profile identity;
- ordered panel metadata and independently persisted image files;
- per-category seller decision (`provided`, `unresolved`, or `not_present`), expected value, and
  zero-to-many seller regions across panels;
- append-only seller change history with sequential ids and snapshots;
- append-only package analysis runs containing immutable per-panel machine records;
- the seller-history sequence analyzed by each run, so later material seller changes make readiness
  stale until reanalysis.

Issue #140 adds optional, backward-compatible `panelDecisions` workflow metadata to that draft
contract. It records whether the back and additional-panel choices are unresolved, uploaded/added,
or explicitly absent. It is not seller evidence, does not add a regulatory category, and does not
change the `seller-package-draft.v1` schema identifier. Older drafts infer safe decisions from their
real panels; no decision ever creates a fake panel or checksum.

`seller-agent-package.v1` is a checksum-protected local download. Its boundary states
`local-download-only`, `governmentApproval: false`, `receivingAgent: not-configured-local-export`,
and that it was not sent to an agent or TTB.

Machine geometry may be copied into a new seller region only through an explicit seller action.
The original observation remains unchanged. An OCR `NOT_OBSERVED` result never deletes or disables
seller evidence; it produces `not_found` and keeps the package in seller review.

## Local persistence truth

The current draft and original `File` objects are stored in versioned IndexedDB in the current
browser profile. Reload recovery is tested. This is not authenticated server persistence, not a
multi-device account, not durable archival storage, and not an evidence-retention system. Analysis
is disabled until the current working draft has been saved successfully.

## Interaction coverage

The annotation canvas supports:

- explicit panel and category selection;
- draw mode with a visible live rectangle and rejection of empty geometry;
- move, four-corner resize, delete, and multiple regions;
- normalized keyboard/numeric coordinates as a pointer alternative;
- zoom, pan, rotate, and reset controls separated from evidence-edit controls;
- simultaneous but visually distinct seller and machine overlays;
- front/back-independent coordinate preservation, including high-DPI and responsive rendering.

## Files and responsibilities

- `src/features/package-preparation/package-model.ts` — typed package, history, analysis, readiness,
  and export contracts.
- `src/features/package-preparation/package-profile.ts` — read-only projection of the reviewed
  requirements registry.
- `src/features/package-preparation/package-draft-store.ts` — versioned browser-local draft and file
  persistence.
- `src/features/package-preparation/PackageAnnotationCanvas.tsx` — panel-relative evidence editor.
- `src/features/package-preparation/PackagePreparationWorkspace.tsx` — package lifecycle and gates.
- `src/app/api/package/analyze/route.ts` — bounded checksummed multi-panel extraction adapter.
- `src/app/review/page.tsx` — package-first workflow.
- `src/app/review/legacy/page.tsx` — unchanged single-image workflow compatibility route.

## Explicit deferrals

- authenticated server-side drafts or evidence retention;
- seller accounts, shared sessions, cross-device resume, or conflict resolution;
- a real agent queue, agent identity, assignment, receipt, or status tracking;
- any TTB/COLA transmission, government authentication, or approval claim;
- new regulatory categories or requirements not present in the reviewed registry;
- regulatory-rule changes, automatic seller decisions, or inference that a conditional requirement
  is not applicable;
- OCR training, cloud APIs, or external vision models;
- package-level readable HTML, PDF, or legacy export-schema changes.

## Validation and production smoke

Local validation:

```text
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run docs:check
npm run eval:production-parity
npm run smoke:relocation
npx playwright test tests/e2e/package-preparation.spec.ts --project=chromium
npx playwright test tests/e2e/review.spec.ts tests/e2e/evidence-overlays.spec.ts --project=chromium
```

Production smoke after deploying the reviewed commit:

1. Confirm the deployment's build commit equals the reviewed PR head before testing behavior.
2. Open `/review` in a new browser profile and verify the package-first heading and local-storage
   boundary.
3. Upload a front and choose "No back label" and "No additional panels"; verify no fake artifact is
   created. Return to panel decisions, upload a back PNG/JPEG, and verify both real files keep their
   filename, dimensions, partial checksum, and distinct panel controls.
4. Enter one category through pointer geometry and the other through keyboard coordinates. Save,
   reload, and confirm files, regions, values, panel identity, and save status recover.
5. Analyze. Confirm the result reports each category separately and never converts uncertainty or
   `NOT_OBSERVED` into a clear result.
6. Make a material seller correction. Confirm the agent-package control disables and says reanalysis
   is required. Save and reanalyze; confirm the run count increases and prior runs remain.
7. At readiness, download the local package and inspect its commit provenance, boundary statement,
   package history, machine runs, and SHA-256 integrity.
8. Verify no network request represents an agent or TTB submission and no success message claims a
   transmission, receipt, approval, or legal determination.
9. Open `/review/legacy`, run the M Cellars fixture, and compare its JSON and HTML export bytes with
   the established regression expectations.
10. Repeat the package workspace at desktop width and 390 px; verify side-by-side/stacking behavior,
    overlay containment, keyboard focus, and no horizontal document overflow.
