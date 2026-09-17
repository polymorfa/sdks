# Contract coverage

The snapshots are byte-identical copies of the Messaging and Platform OpenAPI
files at `polymorfa/polymorfa` commit
`51eb4370979fd5781e7a64f483215ba13ee16b06` on branch
`t3code/calls-unified-clients`. That commit is pushed but not merged; re-pin to
the merged commit before release. `source.json` records the original paths and
SHA-256 hashes. `coverage.json` uses the same source revision.

| Status              | Operations |
| ------------------- | ---------: |
| Covered             |        303 |
| Missing             |          0 |
| Excluded            |        116 |
| Partial             |          0 |
| Changed fingerprint |          0 |
| Total               |        419 |

This revision adds `hostCloudApiCalls` to session call settings, a `sip`
connection transport in Console call detail, and the SIP trunk operations, covered by `Client.sipTrunks`,
and the calling switch, routing and revision fields of session call settings. The SIP error codes and
`calls_disabled` added to the shared public error enum changed the fingerprint of every
operation that references it; those operations were reviewed and only the
error enum differs. The Console SIP trunk and call operations are excluded.
`createProject` and `requestProductionEnrollment` match `CreatedProject` and
the `billingMode` field of the production enrollment result.

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

BanSafe is reconciled against these same snapshots. `Client.banSafe`,
`Client.projects`, and `Client.sessions` cover the 25 Platform Health,
telemetry, findings, enforcement, incident, claim, and settings operations.
`MessagingClient.banSafe` covers the 10 Messaging Safe Mode, warm-up, Ban
Insurance evidence, and Health policy operations. Finding acknowledgement and
enforcement appeals are Console-only and stay excluded. No BanSafe gap remains.

The Platform `BanSafeNumberDetail` schema at this revision lists `sessionId`,
`session`, `phoneNumber`, `projectId`, and `enforcement` as required but omits
them from `properties` while setting `additionalProperties: false`. The API
handler returns those fields, so `BanSafeNumberDetail` keeps them. Console,
staff, browser-owned onboarding, and capability-token routes have explicit
exclusion reasons. No whole-contract parity or package release is claimed.

`MessagingClient.voip` covers the Calls place, accept, reject, leave
(`voipLeaveCall`), end, and add-participant operations and the session call
settings (`getCallSettings`, `updateCallSettings`). Request tests invoke these
methods and check the HTTP method, encoded path, body, authentication, and
response handling. Calls contract revision 1 removed the mode, socket-ticket,
agent-token, and browser-token routes. It also added three call-state codes
to the shared `PublicError` enum, which changes the fingerprint of every
Messaging operation that returns it. The Console-only
`/console/call-settings/{sessionId}` routes are excluded.

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
are not retained as compatibility aliases.
