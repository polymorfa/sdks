# Native SDK release procedure

Use the [native SDK publication setup](native-release.md) for the current
workflow, registry identities, credentials, dependency order and release gates.
`native-release.yml` prepares and publishes accepted artifacts from reviewed
`main` by manual dispatch. Preparation and publication are separate jobs;
passing local checks or configuring credentials does not publish a package.

Nightlies require matching staging API acceptance. Stable packages require
matching production acceptance. Every contract snapshot and feature supplement,
including client-token ceilings, must reconcile with that exact accepted
producer. Keep publication holds until this reconciliation is reviewed.

The workflow binds inspected package bytes to `release-contract.json`, confirms
registry contents after publication and refuses conflicting existing versions.
Go tags and Composer mirror commits follow the same accepted source. A local
archive, feed, path install or extracted-crate patch proves packaging only.

## Customer documentation

After publication, verify each advertised install command in a clean environment
against its registry. Then update the matching Mintlify language guides,
overview, navigation and shipped-day changelog in `polymorfa/polymorfa` with the
actual package versions and coverage. Keep release-dependent guides and install
claims private until those checks pass.

Signal implementation remains with its owning workstream. Source presence and
SDK methods do not establish deployed custody, history, pairing or browser
tunnel availability.
