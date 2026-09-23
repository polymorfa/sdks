# Contract coverage

## Message provider references

The whole-API snapshot includes the native message-reference contract for send
receipts, webhook message references, acknowledgements, quotes, history indexes,
and channel messages. The focused identifier schema remains pinned in
`whatsapp-message-ids.json` to monorepo task commit `6a457a0ed8a7d6cabdb1e326d7053a1e8f9c2b41`.
This scoped revision replaces `whatsapp_id` with `whatsapp_ids`, with at least
one of `linked_devices` or `official_api`. Both values remain exact observed
provider strings. The Polymorfa `id` remains the action/reply identifier.
Server and browser SDK types use the same object. No Hybrid routing or
activation availability is implied by this identifier revision.

`testing-events.json` records the four test-event schemas from API commit
`9c876c16c60b74370d934e1275f23ef6096bee12`, including the source path and file
hash. The TypeScript test-event catalog and override types use that revision.
Local schema references are rebased to this supplement's `schemas` root.
The fixture contract test compares the exported catalog against this snapshot.
It adds `session.restriction_updated`, its boolean `restrictionActive` override,
and `call_restricted` to `callEndReason`. The full snapshots and coverage ledger
below use the pinned API source revision. CLI consumers require a
published SDK package before updating their pinned dependency.

## Whole-API snapshot

The snapshots are byte-identical copies of the Messaging and Platform OpenAPI
files at unmerged `polymorfa/polymorfa` Hybrid Link branch commit
`4e147ef7865a3a3481e38e14a9bbe45448d2ea97`. This revision includes Hybrid Link, Beta HMS retained-history reads,
and Voice audio on top of usage gates, Calls analytics, Campaigns P0 and Functions. `source.json`
records the source paths and SHA-256 hashes. The snapshots and ledger use
the same revision; it does not establish package publication, deployed
availability, or Hybrid Link enrollment.

Native Messaging and Platform calls default to API revision `2026-09-22`,
which requires `whatsapp_ids` in place of the singular provider reference.
The browser Messaging transport pins the same date without importing server code;
its explicit request headers and client-token restrictions remain in force.
Explicit older pins remain explicit and are rejected by the API; Graph keeps
its path-based version.

The 13 public Voice operations are covered by `Client.voice.audio` and
`Client.voice.providerCredentials`; their 13 Console counterparts are excluded.

This revision adds six typed server methods: `quickLinks.availability`,
`messages.operationStatus`, and `hybridLink.getPolicy`, `setPolicy`, `state`,
and `setPaused`. Native sends, reactions, edits, and deletes accept transport
selection. QuickLinks carry explicit initial or supplementary purpose and
single or Hybrid connection goals. Graph remains outside typed API coverage;
`graphTransportHeaders` supplies only the routing header.

The snapshot also includes Calls restriction events and testing overrides.
Their types match the contract, including `session.restriction_updated` and
`call_restricted`. The shared error catalog includes `number_restricted` and
the Hybrid refusal codes. The retired `premium_required` code is no longer
listed; unrecognized API error codes remain readable as strings.

The merged SDK covers Calls analytics, export, and retention. Console equivalents
stay excluded because they require dashboard identity.

This revision also covers `GET /platform/usage`, `/platform/usage/records`,
and `/platform/gates` through `Client.usage.summary`, `listRecords`, and
`listGates`. `iterateRecords` follows record-page cursors. Usage is measured
but not charged; gate state requires an organization credential.

The Campaigns P0 revision added these operations. Audiences gain member
management (`POST`/`GET /platform/audiences/{listId}/members` and
`DELETE .../{phone}`), campaigns gain recipient append and listing on both
surfaces, and the organization gains STOP/START keyword settings
(`GET`/`PUT /platform/optouts/settings`). All eight are covered by
`Client.audiences`, `Client.campaigns`, `Client.optOuts` and
`MessagingClient.campaigns`.

The same revision adds `gate_limit_reached` and a 402 call-placement response;
`PolymorfaPaymentRequiredError` surfaces that response. The webhook event map
exposes `usage.recorded` with the revisioned record payload.

The SDK implements the campaign compliance operations against the pinned
contract. The global `campaign_throughput_capped` error code remains readable
through the SDK's open error-code type.

The merged SDK exposes all 15 public Functions operations. Production-number deletion now returns 409;
the existing `Client.sessions.delete` and `deleteMany` methods still use the
same routes and surface that response as a conflict error.

`Client.sipTrunks.endpoint` covers `GET /platform/sip/endpoint` for organization
keys and project tokens. Its response distinguishes `hosted`, with a host,
transports and RTP range, from `sip_not_hosted`, with null host and RTP fields
and no transports. This method was merged from SDK `dev`; its response shape
matches the same pinned API snapshot. The Console endpoint remains excluded.

An earlier revision published the operations lifecycle on the Platform API. The eight
operation routes moved from `/console` to `/platform`, so their ledger rows
move from `excluded` (console-only) to `covered` by `Client.operations` and
`Client.project(projectId).operations`. The organization-wide reads accept a
`projectId` filter, `GET /platform/operations/{operationId}` accepts `wait`
and `afterSequence`, and the cancel routes keep their `Idempotency-Key`
contract. `/platform/projects/{projectId}/events/stream` keeps a refreshed
fingerprint from the upstream frame `$ref` fix; only its discriminator mapping
changed. The same re-sync picks up the management MCP tools and the call analytics work
on `dev`. The MCP tools change no published operation this SDK covers. Call
analytics adds `GET /platform/calls`, `/platform/calls/stats`, and
`/platform/calls/export`, covered by the merged `Client.calls` implementation.

| Status              | Operations |
| ------------------- | ---------: |
| Covered             |        371 |
| Missing             |          0 |
| Excluded            |        124 |
| Partial             |          0 |
| Changed fingerprint |          0 |
| Total               |        495 |

An earlier revision added test event triggering
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
discriminator mapping at this revision points at unprefixed schema names
(`EventStreamReadyFrame` and so on) that the document does not define; the
snapshot keeps the source bytes unchanged. The same revision adds
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
Message responses retain exact provider IDs in `whatsapp_ids`. Channel
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
   reviewed counts, the exact unresolved changed-operation list, valid public
   method mappings, and source snapshot integrity.

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
