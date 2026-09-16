# Contract coverage

The snapshots are byte-identical copies of the Messaging and Platform OpenAPI
files at `polymorfa/polymorfa` commit
`aca849cda44ad8582d7ae87489404d2483173a53`. `source.json` records their original
paths and SHA-256 hashes. `coverage.json` uses the same source revision.

| Status              | Operations |
| ------------------- | ---------: |
| Covered             |        265 |
| Missing             |         37 |
| Excluded            |        158 |
| Partial             |          0 |
| Changed fingerprint |          0 |
| Total               |        460 |

Coverage spans the TypeScript server SDK, browser transport, and Calls package.
It does not claim coverage in other languages, package publication, or a
successful live call.

## Reconciliation

This revision replaces raw account platform codes with `phonePlatform` and
`accountType` on the session account, profile, and `session.connected`
contracts, and removes the unreturned `verifiedJids` client-rules field. The
three changed operations keep their existing typed methods.

This refresh retires direct session creation and observation-policy writes. QuickLinks supply typed configuration and test simulation. The SDK adds project history fixture upload, saved defaults, and trusted-server Meta continuation tied to an existing QuickLink.

Public Number, conversation, user and message identifiers remain supported.
Message responses retain the exact provider ID in `whatsapp_id`. Channel
actions use the public message ID; call participants expose public identities;
history events carry a public message index and a separate provider archive.
The raw LID resolver is replaced by `MessagingClient.identities.resolve`.

The ledger reconciles moved Messaging and Platform paths against the exact
source revision. Component references are resolved before fingerprinting, so a
referenced request or response change cannot pass unnoticed. Removed console-only
operation polling and unsupported browser handoff methods are not SDK APIs.

The 37 missing operations belong to the separately introduced BanSafe health
and policy APIs. This identifier change does not implement that feature. They
remain explicit gaps, not covered methods or credential exclusions. Console,
staff, browser-owned onboarding, and capability-token routes have explicit
exclusion reasons. No whole-contract parity or package release is claimed.

`HttpCallsApi.place`, `accept`, `reject`, `addParticipant`, and `setMode` cover
the five Calls operations. Request tests invoke these methods and check the
HTTP method, encoded path, body, authentication, and response handling.

The unified `Client` owns organization control-plane resources and creates
immutable project views with `client.project(projectId)`. QuickLink management
uses `Client.quickLinkSettings`; obsolete `/v1/widget` mappings are gone.
Credential-free service probes use `SystemClient`, project-token Bridge route
discovery uses `BridgeClient`, and listener transport remains CLI-only.

## Updating the ledger

1. Select one exact source commit on the matching branch. Record whether it is
   merged or a coordinated PR dependency. Copy both
   authoritative OpenAPI files without editing or formatting them.
2. Run `scripts/check-coverage.mjs` against the new files and the existing
   ledger without `--strict` to inspect gaps and removed operations. Determine
   absent rows by their family, HTTP method, and path; an old reason string is
   not evidence that a row is absent.
3. Inspect the real SDK transport before assigning coverage. A renamed API
   route does not inherit coverage from a method that still calls its old
   path. Keep unimplemented methods missing and explain credential-based
   exclusions. Raw requests do not count as typed methods.
4. Update the ledger, source revision, hashes, and mapping tests together.
   Remove obsolete rows after reviewing their replacements.
5. Run the full SDK CI checks. The repository coverage tests require the
   reviewed counts, zero changed fingerprints, valid public method mappings,
   and source snapshot integrity.

`npm run check:coverage` uses the checked-in snapshots. Its strict flag requires
a ledger row for every operation; it does not require every row to be covered.
The cross-repository workflow compares an exact source revision and reports
missing or changed contracts for follow-up. Its dedicated GitHub App must have
access to read SDK contents and write coverage issues. A token-creation failure
occurs before comparison and says nothing about SDK parity.

The merged Platform and billing adjustments reuse reviewed source from SDK commit
`75146778f7a20257a6c0f0f3139329ab308f40f0` (billing API parity): client-token administration, session lifecycle
routes, paid-number expiry, tier quotes and confirmation, and payment-required
errors. They are checked against these same canonical API snapshots. Removed
dashboard-only billing reminders and client-token session start/status helpers
are not retained as compatibility aliases. BanSafe methods remain explicitly
missing where the ledger says so.
