# Contract coverage

## Message provider references

Native message receipts, webhook references, acknowledgements, history, and
channel messages expose `whatsapp_ids`, with `linked_devices`, `official_api`,
or both observed provider references. A temporary optional `whatsapp_id`
output alias remains for older consumers. The Polymorfa `id` remains the
action and reply identifier. The server and browser SDK types reflect both
fields; the alias does not select a transport.

Hybrid Link adds six covered server methods: `quickLinks.availability`,
`messages.operationStatus`, and `hybridLink.getPolicy`, `setPolicy`, `state`,
and `setPaused`. Native send, reaction, edit, and delete requests accept an
explicit transport. Graph-compatible calls remain outside typed API coverage;
`graphTransportHeaders` supplies their routing header. The API enforces
preview enrollment and live Number authority independently of these SDK types.

## Test-event supplement

The integrated snapshot uses Hybrid Link API source commit
`2dd0c1563b1fc4e6525f708afc12e0685110cfe0`, now merged into API `dev`
by PR #260. It includes the merged
campaign, usage, voice, and HMS history API contracts. SDK package publication
remains separate.
`Client.callPolicy` and `Client.callOptOuts` cover six team-policy operations;
`MessagingClient.voip.retrieveCallPermission` and `.check` cover two Messaging
operations. The six Console counterparts are excluded. Message content and
`call.permission_changed` are typed in server and browser packages where
applicable.

`testing-events.json` records the four test-event schemas from API source commit
`6839976e7ad54e044c4d789fd296edc44772a907`, including the source path and file
hash. The TypeScript test-event catalog and override types use that revision.
Local schema references are rebased to this supplement's `schemas` root.
The fixture contract test compares the exported catalog against this snapshot.
It adds `session.restriction_updated`, its boolean `restrictionActive` override,
and `call_restricted` to `callEndReason`. The full snapshots and coverage ledger
below use the merged API revision. CLI consumers require a
published SDK package before updating their pinned dependency.

## Full snapshots

The snapshots are byte-identical copies of the Messaging and Platform OpenAPI
files at API PR #335 head `59edaad03b2d020240123c3873353f957478ee87`.
This source is not merged or published. It adds the Platform
`createAudienceFromCampaign` operation, mapped to
`Client.audiences.createFromCampaign`. `source.json` records the source paths
and SHA-256 hashes. Re-pin to the merged API commit before publishing this
SDK; CLI registry pin and deployment remain separate.

The merged Campaigns failed-state follow-up updates the `campaign.failed`
reason example and the public archive/delete `409` descriptions. It changes no
operation fingerprint or SDK method mapping.

The Platform event-list contract adds `afterOffset` and indexed page metadata
for both organization and project routes. `Client.events.list` and project-view
`events.list` expose `FollowableIndexedEventPage` in that mode; `nextPage()` follows
`nextOffset` rather than combining an offset with a cursor.
Both views also expose `events.listIndexed` with explicit `page.nextOffset` and
`page.highWatermark` metadata for callers that manage their own polling loop.

The preceding refresh added 17 operation rows and removes eight. Eight removed Console
operation routes moved to `/platform/operations` and
`/platform/projects/{projectId}/operations`; the existing `Client.operations`
and project-view `operations` resources cover list, get, transitions and cancel.
Three new Console retention and SIP discovery operations stay excluded.
`Client.callRetention` covers `GET` and `PUT /platform/call-retention`, merged
from SDK `dev`. The three public Calls analytics operations are covered by
`Client.calls.list`, `Client.calls.export`, and `Client.calls.stats`.
`Client.calls.exportAll` walks export pages. The 13 public Voice operations are
covered by `Client.voice.audio` and `Client.voice.providerCredentials`; their
13 Console counterparts are excluded. The full 509-operation snapshot includes
all 15 Functions routes already merged to API `dev`.

HMS history adds four server-only Messaging reads under
`MessagingClient.chats`: `list`, `retrieve`, `listMessages`, and
`retrieveMessage`. All four are covered; they require an organization key or
project token, their respective `chats:read` or `messages:read` scope, HMS on
the Number, and `messaging.history` beta enrollment. Client tokens are refused
locally. Pagination retains both cursors and the data-region response header.
The only pre-existing schema change is `hms_not_enabled` in the shared public
error enum, which changes 166 Messaging and 46 Platform fingerprints. Those
fingerprints were reconciled against the source specs; no pre-existing route or
response shape changed.

SDK `dev` through `8392f66` adds `Client.sipTrunks.endpoint()` for
`GET /platform/sip/endpoint`. Its `SipEndpoint` result is a discriminated union:
`hosted` carries the host, transports and RTP range; `sip_not_hosted` carries
null host/RTP and no transports. Those existing types and request tests match
this exact snapshot, so the operation is covered. The merge also retains the
release script's compiled-version stamping and the single BanSafe payload block.

The preceding 192 refreshed fingerprints were reviewed. Most reflect `number_restricted`
in the shared public error enum. Testing fixtures add
`session.restriction_updated`, `restrictionActive`, and the `call_restricted`
call-end reason. SIP transport schema wrappers preserve their existing type.
QuickLink settings declare an add-on-required `402`, handled by the existing
payment-required error class. The webhook catalog also adds the restriction
payload, requires `code` on `session.logged_out`, narrows its reason enum, and
narrows the previous BanSafe health band; SDK types follow those schemas.

The latest schema refresh changes only `POST /platform/campaigns`: its required
body is now `CreatePlatformCampaignRequest`, with required `name`, named optional
fields, and no additional top-level properties. The SDK requires `projectId`
because its Platform campaign resource belongs to organization clients. The
six opaque JSON fields remain `unknown`, while `senderConfig` remains an open
object. No routes were added or removed by this schema refresh.

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

Two campaign contracts changed in a way callers can observe.
`GET /platform/campaigns/{campaignId}/recipients` answers with `{ data, page }`
and a `status` filter instead of a bare array, and each recipient carries
`sentAt`, `deliveredAt`, `readAt`, `failedAt` and `respondedAt`;
`Client.campaigns.recipients` was updated to match. Campaign stop answers with
`CampaignStopOperation`, whose `operationId` is null when the campaign had no
active delivery run and was cancelled immediately;
`MessagingClient.campaigns.stop` no longer shares `CampaignOperationResponse`.
Campaign create on both surfaces accepts inline `recipients`.

This revision also declares `projectId` as a query parameter on the
single-campaign Platform operations: `GET`, `PATCH` and `DELETE`
`/platform/campaigns/{campaignId}`, plus `/analytics`, `/events` and
`/recipients`. It is deliberately `required: false`: a team API key is not
bound to one project and must name the owning project, while a project token is
bound to its own project and must omit it at the API. The SDK exposes
`Client.campaigns` only on organization clients, so its types require
`projectId`; project views and project-token clients do not expose that resource.
`Client.campaigns.retrieve`,
`update`, `delete`, `analytics` and `events` take a `PlatformCampaignParams`
argument for it, and `recipients` carries it in its existing params.

`PATCH /platform/campaigns/{campaignId}` accepts `recipientListId`, a string or
null, which points an unlaunched draft at another audience or detaches it. The
API refuses the change once the campaign has launched or its audience has been
copied into recipients. The contract still declares this request body as an
open object, so the SDK does not close it: `UpdatePlatformCampaignRequest`
names `recipientListId` and keeps an index signature for every other field.
The operation declares `409` for the refusal after launch, which the transport
already maps to `PolymorfaConflictError`; no SDK change was needed for it.

The webhook catalog includes `contact.opted_out` and `contact.opted_in` with the
exported `ContactOptPayload`. The unproduced `bansafe.health_changed`,
`bansafe.risk_changed`, and `bansafe.enforcement` names are retired. Historical
signed events with these names still decode as unknown events.

| Status              | Operations |
| ------------------- | ---------: |
| Covered             |        379 |
| Missing             |          0 |
| Excluded            |        130 |
| Partial             |          0 |
| Changed fingerprint |          0 |
| Total               |        509 |

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
acknowledgement route. The source pinned here corrects the
`PlatformAccessEventStreamFrame` discriminator to reference the defined,
Platform-prefixed schemas. Revision `2259a1fd` also adds
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
Message responses expose exact provider IDs in `whatsapp_ids`; the temporary
optional `whatsapp_id` alias remains for older consumers. Channel
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
snapshot contains only the 15 Functions operations and their transitive schemas.
`npm run check:functions` verifies their ledger; SDK tests exercise every method.
The main Messaging and Platform snapshots use the pinned Hybrid Link API branch;
Functions subset retains its separate source revision.

All 15 Functions methods require `client.project(projectId).functions` and an
organization enabled for Functions. The SDK never retries Function mutations or
invocations automatically. Browser/client-token SDKs do not expose this server
control plane. A local implementation or installed method does not establish
hosted availability.
