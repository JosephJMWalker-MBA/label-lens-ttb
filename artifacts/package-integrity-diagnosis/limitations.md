# Limitations

- The exact deployed record remains unattributed. Local reproduction identified a credible and fixed mechanism, but production SQL mode, row size, migration state, logs, build identity, and signing-key history were unavailable.
- Existing historical rows that are already truncated or signed under another secret remain fail-closed. This change prevents future MySQL `TEXT` truncation of canonical revisions; it does not recover missing original bytes.
- The large-canonical regression isolates `canonical_json` by padding `applicationBuild`. Other duplicated snapshot columns still use MySQL `TEXT`. Those columns can reject or truncate very large individual field strings, but that is a separate scope from the observed integrity failure because they are not the canonical verifier input.
- Current source does not define a canonical JSON byte ceiling below the MySQL `MEDIUMTEXT` maximum. This work does not claim unbounded submissions.
- This work did not access or mutate live persisted submission data.
- The artifact commands use placeholders and omit secret values, private filesystem paths, raw canonical JSON, declared values, uploaded bytes, session material, and complete signatures.
- The migration has been applied and tested against a disposable local MySQL database only. Deployment still needs an operator-confirmed migration run and synthetic live handoff proof.
