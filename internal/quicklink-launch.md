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

## Onboarding availability checkpoint

API commit `c77ab109b` adds live feature-engine eligibility for Meta Cloud API
onboarding: active organization/project authority, beta enrollment, release
eligibility and operational enable. New work stops on revocation or outage;
already accepted operation results remain recoverable. No API request/response
shape changed, so SDK methods and serialization are unchanged. The README
availability guidance now reflects this behavior. This availability check does
not repin the older contract ledger or claim full parity with a moving API head.

The root README also corrects stale lifecycle/settings paths to `/messaging/quicklinks`
and `/platform/quicklink`, matching the existing implementation and package README.
No package publication, enrollment change, provider rollout or live Meta acceptance
is included.

## Phone-first and Premium attribution checkpoint

Implementation audited against monorepo phone lifecycle commit `9f7358523` and
combined branch `69e7b2bee19dd58d2079c78bd32baaa4288d3cd1`, including its staged
management specification. The specification is still being regenerated; these
are artifact identifiers, not a new repository-wide contract pin:

- Messaging SHA-256: `cc097dca55226fe44a9cbd0c298349c92f858b7bf3105fc9044295b06e8b059a`.
- Platform SHA-256: `c6b98cd2623128476d2cd7ff11e8cde6b4446a82fb7d2bb7afdd33ce6390623e`.

The saved settings resource adds `allowPhoneChange` to reads and updates and
serializes explicit `false` for it and `hideWatermark`. Premium enforcement stays
server-side. Creation still accepts only methods, identity/correlation, and expiry.
Customer types retain `externalCustomerId` and invitation `expectedPhone`, without
Customer profile phone fields or appearance overrides. Existing request tests
exercise the actual `/messaging/quicklinks` and `/platform/customers` paths.
The browser package's QuickLink controller consumes an integrator-provided
transport; hosted invitation-token phone confirmation is not a server-credential
SDK resource. Its transport contract remains unchanged.

A read-only ledger comparison against the artifacts above reports 454 operations,
347 absent ledger rows and six changed fingerprints. Scoped QuickLink/Customer
rows still name older prefixes in the pinned ledger; inspected handwritten
methods already use the new prefixes. This is stale accounting, not evidence of
347 missing implementations. The full snapshot/ledger reconciliation remains
blocked until the final combined API specification is committed and every
affected consumer is checked. No hashes were restamped to imply parity.

API: updated in the companion monorepo. SDK: settings types, serialization tests
and both package guides updated. CLI: saved settings already pass a typed JSON
body; its SDK dependency must be repinned to the verified SDK commit. Public
Mintlify guidance and feature-release records remain owned by monorepo PR147.
No registry release or deployed availability is established by this checkpoint.
