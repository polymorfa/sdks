# Contract coverage

## Focused test-event update

`testing-events.json` records the four test-event schemas from API commit
`63111fec728ac3ebc9a825ea57ebc4c592abdafc`, including the source path and file
hash. The TypeScript test-event catalog and override types use that revision.
Local schema references are rebased to this supplement's `schemas` root.
The fixture contract test compares the exported catalog against this snapshot.
It adds `session.restriction_updated`, its boolean `restrictionActive` override,
and `call_restricted` to `callEndReason`. This focused supplement does not claim
that the full snapshots or coverage ledger below were reconciled to that newer
API revision. The SDK change is local and requires package publication before
CLI consumers can update their pinned dependency.

## Full snapshots

The snapshots are byte-identical copies of the Messaging and Platform OpenAPI
files at `polymorfa/polymorfa` commit
`63111fec728ac3ebc9a825ea57ebc4c592abdafc` on monorepo `dev`. It contains
BanSafe for calls, the SIP address, call analytics, and call retention. `source.json` records the original paths and
SHA-256 hashes. `coverage.json` uses the same source revision.

| Status              | Operations |
| ------------------- | ---------: |
| Covered             |        320 |
| Missing             |          2 |
| Excluded            |        111 |
| Partial             |          0 |
| Changed fingerprint |          0 |
| Total               |        433 |

The refresh from `9fe6c235` adds two public call-retention operations and two
Console-only counterparts. The public methods remain `missing` until SDK
PR #278 lands; the Console routes are excluded because they require dashboard
membership. Analytics is covered by `Client.calls.stats`, `Client.calls.list`,
and `Client.calls.export`; `Client.calls.exportAll` walks export pages. No existing
operation fingerprint changed in the retention refresh.

The BanSafe update recognizes `number_restricted`, types the
`session.restriction_updated` webhook and the `reason` and `code` on
`session.logged_out`, and preserves `call_restricted` through the Calls
client's lifecycle parser. Health changes use the same health-band union for
`band` and `previousBand` (with null for the latter's first evaluation), and
risk factor groups use the contract's sixteen-value union. `addon_required`
is recognized for the covered QuickLink settings endpoint.

`GET /console/sip/endpoint` remains excluded (Console-only), while
`GET /platform/sip/endpoint` is covered by `Client.sipTrunks.endpoint`.

The previous revision published the operations lifecycle on the Platform API. The eight
operation routes moved from `/console` to `/platform`, so their ledger rows
move from `excluded` (console-only) to `covered` by `Client.operations` and
`Client.project(projectId).operations`. The organization-wide reads accept a
`projectId` filter, `GET /platform/operations/{operationId}` accepts `wait`
and `afterSequence`, and the cancel routes keep their `Idempotency-Key`
contract. `Client.calls` covers `GET /platform/calls`, `/platform/calls/stats`,
and `/platform/calls/export`. Export pages carry CSV or NDJSON and the
`Polymorfa-Next-Cursor` header. The iterator refuses repeated cursors before
returning their page and removes subsequent CSV header rows. Stats accepts
IANA zones including single-name zones; string dates must be RFC 3339 instants.

This revision adds test event triggering
(`POST /messaging/testing/{projectId}/events`) and fixture listing
(`GET /messaging/testing/{projectId}/events/fixtures`), covered by
`MessagingClient.testing.triggerEvent` (with the optional `Idempotency-Key`
header through `options.idempotencyKey`) and
`MessagingClient.testing.listEventFixtures`.

An earlier revision added app-reported call diagnostics
(`POST /messaging/voip/calls/{id}/reports`, covered by
`MessagingClient.voip.report`, and sent automatically by the browser and
Calls clients), replaces `includeSelfAudio` with `conferenceMode` in session
call settings, and moves Console call detail from `clientReports` to
`appReports` (excluded, Console-only). Earlier revisions added
`hostCloudApiCalls` to session call settings, a `sip`
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

Revision `2259a1fd` adds the project event stream. `Client.events.stream`
covers `GET /platform/projects/{projectId}/events/stream` with reconnect and
resume, and `Client.events.acknowledgeStream` covers its manual
acknowledgement route. The Platform `PlatformAccessEventStreamFrame`
discriminator mapping now names the defined `PlatformAccessEventStream*Frame`
schemas, corrected in the analytics source. Revision `2259a1fd` also adds
`conversationTtlSeconds` to client rules, turns `recipientMode` into an enum,
and sets a minimum of 0 on `rateLimit` and `maxDaily`; the client-rules types
follow.

Revision `51026bfe` adds the optional `Idempotency-Key` header and its `409`
outcomes to seven Messaging writes, and four `idempotency_*` public error
codes to the shared error schema. That schema change moves the fingerprint of every Messaging
operation that references it; each keeps its existing typed method.

This revision adds `request_id` (required) and `request_log_url` to every
error object, and extends the `PublicError` code enum with the WhatsApp codes
(`recipient_not_on_whatsapp`, `conversation_window_closed`,
`template_not_approved`, `media_too_large`, `whatsapp_rate_limited`,
`new_chat_limit_reached`, `whatsapp_account_restricted`) and the BanSafe codes
the API now delivers. That moved 384 fingerprints; each was reviewed, and all
but three changed only in error responses. The other three are `createProject`
and `requestProductionEnrollment` (upstream Pay-As-You-Go changes, now typed as
`CreatedProject` and `ProductionEnrollmentResult.billingMode`), and the
excluded console logs read. `PolymorfaError` exposes the new fields.

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
enforcement appeals are Console-only and stay excluded. The typed BanSafe
alignment dependency on SDK PR #282 is recorded above.

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
discovery uses `BridgeClient`, and the CLI listener protocol stays CLI-only; the public event stream is a separate SDK method.

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

## Functions contract

Functions is tracked separately in `functions/openapi.json`, with its exact
monorepo source commit and extraction hash in `functions/source.json`. This
snapshot contains only the15 Functions operations and their transitive schemas.
`npm run check:functions` verifies their ledger; SDK tests exercise every method.
The main snapshots above retain their recorded baseline so a Functions change
does not silently reconcile unrelated Calls, QuickLink or webhook work.

All15 Functions methods require `client.project(projectId).functions` and an
organization enabled for Functions. The SDK never retries Function mutations or
invocations automatically. Browser/client-token SDKs do not expose this server
control plane. A local implementation or installed method does not establish
hosted availability.
