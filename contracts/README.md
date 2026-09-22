# Contract coverage

The snapshots are byte-identical copies of the Messaging and Platform OpenAPI
files at `polymorfa/polymorfa` commit
`cdc7ec09a32309ee8233d9f8a3007eea18203c6e` on monorepo `dev`. `source.json`
records the original paths and SHA-256 hashes. `coverage.json` uses the same
source revision.

This revision merges PR #229 (public SIP address) into `dev`, on top of #223
(operations lifecycle) that a parallel re-sync already reconciled. The
Messaging document is unchanged; SIP address touches only the Platform
document. Eight SIP-trunk and Console-SIP-trunk fingerprints shift again
(unrelated documentation-only edits carried by `dev` since the last SIP
re-sync); their reviewed shapes and SDK mappings are unchanged. The eleven
operations-lifecycle and call-analytics rows already reconciled by the
parallel re-sync keep their status: the eight operations rows are `covered` by
`Client.operations` and `Client.project(projectId).operations`, and the three
call-analytics rows stay `missing` pending `Client.calls` in a separate pull
request.

| Status              | Operations |
| ------------------- | ---------: |
| Covered             |        317 |
| Missing             |          3 |
| Excluded            |        109 |
| Partial             |          0 |
| Changed fingerprint |          0 |
| Total               |        429 |

Revision `576176a6` publishes the operations lifecycle on the Platform API. The
eight operation routes moved from `/console` to `/platform`, so their ledger
rows move from `excluded` (console-only) to `covered` by `Client.operations`
and `Client.project(projectId).operations`. The organization-wide reads accept
a `projectId` filter, `GET /platform/operations/{operationId}` accepts `wait`
and `afterSequence`, and the cancel routes keep their `Idempotency-Key`
contract. `/platform/projects/{projectId}/events/stream` keeps a refreshed
fingerprint from the upstream frame `$ref` fix; only its discriminator mapping
changed. The same re-sync picks up the management MCP tools and the call
analytics work on `dev`. The MCP tools change no published operation this SDK
covers. Call analytics adds `GET /platform/calls`, `/platform/calls/stats`,
and `/platform/calls/export`; they are recorded as `missing` here because
`Client.calls` implements them in a separate pull request.

Revision `b2dc135a` declares the `sip_not_hosted` member's `host` and `rtp` as
`nullable: true` beside the `enum: [null]` they already carried. That moves the
same two fingerprints as the previous revision, `getSipEndpoint` and the
excluded `getConsoleSipEndpoint`; both were reviewed and the resolved shapes
differ only by those two keywords. `null` was already the single permitted
value, so `SipEndpointNotHosted` keeps `host: null` and `rtp: null` and no SDK
type changes. The revision also merges monorepo `dev`, which adds no Messaging
or Platform operation: the MCP management-tools work lands in
`apps/api/docs/mcp/tools-reference.md`, not in either OpenAPI document. The
Messaging document is byte identical to `10a91351`, and the reviewed counts are
unchanged.

Revision `10a91351` splits the SIP address response on `status`:
`PlatformAccessSipEndpoint` is a `oneOf` of `PlatformAccessSipEndpointHosted`,
which carries a non-null `host`, at least one transport and the
`PlatformAccessSipEndpointRtp` range, and `PlatformAccessSipEndpointNotHosted`,
which carries a null `host`, a null `rtp` and no transports. Two fingerprints
move, `getSipEndpoint` and the excluded `getConsoleSipEndpoint`; both were
reviewed and only that response schema differs. `SipEndpoint` follows as
`SipEndpointHosted | SipEndpointNotHosted`, so narrowing on `status` gives a
`host` and an `rtp` range without a cast. The Messaging document is byte
identical to `8a7caf47`, and the reviewed counts are unchanged.

Revision `8a7caf47` added the environment's SIP address
(`GET /platform/sip/endpoint`, `getSipEndpoint`), covered by
`Client.sipTrunks.endpoint`, and its Console-only counterpart
(`getConsoleSipEndpoint`, excluded). It also carried monorepo `dev` changes
since `2259a1fd`: the SIP trunk operations drop the beta enrollment wording and
move the `targetUri` transport description into an `allOf` wrapper (eight public
and Console SIP trunk fingerprints; request and response fields are
unchanged), and the `PlatformAccessEventStreamFrame` discriminator mapping now
points at the prefixed schema names the document defines (`streamProjectEvents`
fingerprint). The Messaging document adds the `bansafe.risk_changed` and
`bansafe.health_changed` webhooks, typed as `BanSafeRiskChangedPayload` and
`BanSafeHealthChangedPayload`; webhooks are not ledger operations.

Revision `129d58ae` added `customer` and `allow` to `mintClientToken` (covered by
`MessagingClient.clientTokens.mint`). An earlier re-sync restored the Calls
diagnostics route (`voipReportCallDiagnostics`), covered by
`MessagingClient.voip.report`.

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

## Pending contract: Voice Automation audio (`voice-audio-v1`)

`Client.voice` implements contract revision `voice-audio-v1` from
polymorfa/polymorfa branch `t3code/voice-audio-library` (based on `dev`
`91444480e`). That branch had not published its OpenAPI files when the SDK side
was written, so the snapshots, `source.json` and `coverage.json` above do not
contain the 13 `/platform/voice/*` operations, the two `voice.*` webhook events
or the eight voice error codes. The ledger does not count those operations as
covered. `packages/typescript/test/support/pending-contract.ts` lists the codes
and events the SDK types ahead of the snapshot; the parity tests add them
explicitly and fail once a re-synced snapshot contains one. The next re-sync
must copy the published files, add ledger rows mapping the operations to
`Client.voice.audio` and `Client.voice.providerCredentials`, and empty that
list. Other languages have no voice resources.

Revision `2259a1fd` adds the project event stream. `Client.events.stream`
covers `GET /platform/projects/{projectId}/events/stream` with reconnect and
resume, and `Client.events.acknowledgeStream` covers its manual
acknowledgement route. The Platform `PlatformAccessEventStreamFrame`
discriminator mapping at that revision pointed at unprefixed schema names
(`EventStreamReadyFrame` and so on) that the document did not define; revision
`8a7caf47` corrects the mapping. The same revision adds
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
