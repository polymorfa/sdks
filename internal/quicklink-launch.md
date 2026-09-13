# QuickLink launch contract checkpoint

API source for the implemented contract below:
`94bf27476` in polymorfa/polymorfa PR147.
SDK source before this documentation correction: `97b0672`.
SDK base dev: `e15da860973ee9c81a8ffcccc95463ce3b22166f`.
CLI companion: polymorfa/cli PR4 at `5d1387a`.

Implemented: QuickLink and Session externalId, native session lifecycle webhook
correlation, project-owned callback settings, typed Meta Cloud API history/contact/
echo events, and saved connection policy. Removed invitation callbackUrl, the
settings redirect allowlist, Customer profile phone fields, and per-invitation
branding/theme/history overrides. Customer invitations retain expectedPhone;
connected Numbers retain their phone information. Customer locale/theme overrides
are removed in API, SDK and CLI. Pairing methods remain invitation input.

Verification by checkpoint:

- SDK `1c0658d`: typecheck and407tests pass after invitation request-field removal.
- SDK `37a2696`: typecheck and8clienttests pass after adding saved connection fields.
- SDK `97b0672`: formatting-only correction to3existingtests; fullformatcheckpasses.
- CLI `5d1387a`: fullverify237tests and Node20/22 CI pass.
- API `94bf27476`:49focusedAPItests,23Console tests and Mintlifylinks/build pass.
  Incremental typechecks were insufficient: subsequent CI found the missing
  externalId-conflict error literal; main PR's review correction owns that fix.

Coverage comparison is a separate, older checkpoint: the read-only comparison
against API `c012141e64049c64200dedb00892221c745bdc03` reported451operations,
344absentledgerrows and6changedfingerprints. It was not rerun against94bf27476,
and these counts are not coverage evidence for the current candidate. Many rows
reflect prefix changes, not proven missing implementations. The repository-wide
ledger and snapshots still pin `6918c561`; complete reconciliation against the
final API commit is required before review-ready status. Do not refresh hashes
without verifying actual consumers. The inspected repo contains TypeScript server
and browser/UI packages; no claim of other-language parity is made.

API implementation/public guides remain in PR147; SDK in PR12; CLI in PR4.
No registry publication, feature rollout or hosted acceptance is established.
The broader new feature's narrated video remains required in PR147. Phone-first
lookup, Customer original-issuance policy snapshots, four setup videos and real
Meta acceptance remain unfinished. This checkpoint records contract corrections,
not a launch completion claim.
