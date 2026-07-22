# Deferred post-#161 integrity verification

Runtime verification passed; the app-surface integrity gate was run with repository-owned synthetic data.

## Scope

Use only repository-owned synthetic material. Do not upload private, confidential, applicant, proprietary, or regulated material.

## Required verification after runtime recovery

1. Confirm deployed build includes `c3dfb9428a3e189d938c3b63f8e22aac45c095fc` or a descendant.
2. Confirm migration `0001_tiny_marauders` is applied.
3. Confirm production `submission_revisions.canonical_json` is `MEDIUMTEXT`.
4. Finalize a new synthetic package whose canonical JSON is larger than 65,535 UTF-8 bytes.
5. Confirm finalization succeeds.
6. Confirm stored canonical byte length and non-reversible digest match the submitted canonical string.
7. Open deployed agent detail for the synthetic submission and confirm `integrityVerified:true`.
8. Retrieve the synthetic panel through the authorized agent route.
9. Confirm seller and anonymous requests cannot read agent detail or panel bytes.
10. Confirm the historical failing row remains untouched.

## Live app-surface result

| Check | Result |
|---|---|
| Deployed build includes post-#161 commit | Hostinger metadata confirms deployed commit `c3dfb942` for the recovered deployment. |
| Migration `0001_tiny_marauders` applied | Maintainer-confirmed: both committed migrations are recorded. |
| `canonical_json` column type | Maintainer-confirmed: `MEDIUMTEXT NOT NULL`. |
| Seller login / seller-only access | Passed: seller login/session OK; `/seller` HTTP 200; agent queue API HTTP 403. |
| Agent login / agent access | Passed: agent login/session OK; agent queue API HTTP 200. |
| Admin login / admin access | Passed: admin login/session OK; `/admin` HTTP 200; agent queue API HTTP 200. |
| Anonymous agent detail | Passed: synthetic submission detail blocked with HTTP 401. |
| Seller agent detail | Passed: synthetic submission detail blocked with HTTP 403. |
| Anonymous panel bytes | Passed: synthetic panel route blocked with HTTP 401 and no image bytes. |
| Seller panel bytes | Passed: synthetic panel route blocked with HTTP 403 and no image bytes. |
| Synthetic canonical size | Passed: submitted canonical string was 96,256 UTF-8 bytes. |
| Synthetic canonical digest | Submitted canonical SHA-256: `3986c838fa8457071f7e560c01f8943d11c97c9693c6f2fb0eb0958706273351`. |
| Stored canonical byte length/digest | Passed by maintainer-side bounded DB query: `matching_revisions = 1`, `canonical_utf8_bytes = 96256`, exact submitted SHA-256 predicate matched. |
| Finalization | Passed: HTTP 200 with receipt. |
| Agent detail | Passed: HTTP 200 and `integrityVerified:true`. |
| Authorized panel delivery | Passed: HTTP 200, `image/png`, byte length and checksum matched the submitted synthetic PNG. |
| Historical failing row | Not touched by this verification. |

## Stored DB comparison completion

The app-surface verification proves finalization succeeded and the stored revision opens through agent detail with `integrityVerified:true`.

Maintainer-side production DB verification is now complete. The bounded query returned one matching revision, byte length `96256`, and a match against the exact submitted SHA-256 predicate:

```text
3986c838fa8457071f7e560c01f8943d11c97c9693c6f2fb0eb0958706273351
```

No canonical JSON, signature, credential, or historical failing-row content was exposed or modified.

## Bounded DB metadata

Allowed after synthetic finalization:

- column metadata from `information_schema`;
- migration table count/ids/timestamps;
- for the new synthetic package only: `OCTET_LENGTH(canonical_json)` and `SHA2(canonical_json, 256)`.

Not allowed:

- raw `canonical_json`;
- integrity signatures;
- uploaded image bytes;
- user-submitted declared values;
- broad submission rows;
- historical failed row contents.

## Historical row boundary

The historical failing row must not be repaired, deleted, resigned, backfilled, or manually marked valid during this issue. This verification addressed only a new synthetic package through public app surfaces. If the maintainer wants historical-row adjudication later, open a separate issue with a retention and audit policy.
