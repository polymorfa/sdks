# Polymorfa Go SDK

Handwritten server SDK for Go 1.24 or newer. This source checkout is under development and has not been published. The checked coverage manifest records native request/response evidence for all 439 primary operations supported by TypeScript SDK commit `e24cb176fc1124f5fe852ff6c77902648fd13b4a`, plus three campaign supplements in the ledger. Eight additional Graph and testing-phone routes and the eleven frequency-cap, audience-segment and drip operations in `contracts/native-campaign-supplements.json` have typed wire tests. This evidence describes SDK contracts, not deployed feature availability.

The module import is `github.com/polymorfa/sdks/packages/go`. This corrects the proposed `github.com/polymorfa/sdks/go` name to match the actual repository subdirectory. A release from this layout needs a `packages/go/vX.Y.Z` tag. Do not advertise an installation version until that version exists. For local work, use the `replace` directive in `examples/go/send-message/go.mod`.

```go
client, err := polymorfa.NewMessagingClient(polymorfa.Config{
    Credential: polymorfa.Credential{
        Kind: polymorfa.OrganizationAPIKey,
        Value: os.Getenv("POLYMORFA_API_KEY"),
    },
})
```

`NewOrganizationClient` accepts an organization API key. `NewProjectClient` accepts an organization API key or a project token with an explicit project ID. `org.Project(id)` returns a separate view; project tokens cannot rebind to another project. `NewMessagingClient` additionally accepts a scoped client token, with server-only operations rejected before a request. Credential formatting redacts token values. `NewSystemClient` sends no credentials. `NewBridgeClient` accepts only project tokens for regional route discovery.

Pass `context.Context` to each request. Each `Response[T]` includes typed data and safe response metadata. Developer resources unwrap documented `data` envelopes; Messaging resources retain their native success envelope. Errors expose semantic kind, API code, request ID and metadata through `errors.As(err, &apiError)`. API codes remain open strings so new server errors do not break decoding.

`RequestOptions` controls version, timeout, retries, headers and idempotency. Safe requests retry network failures and retryable status codes; writes retry only with an idempotency key. Message send, reaction and other documented idempotent helpers create a key once per invocation. Application-level retries must reuse the application's own key. Replayed responses and responses carrying an operation ID are final. Failed response-body reads retain operation metadata; query the operation before retrying an admitted effect. Call link, reaction and socket commands use their documented retry restrictions. Authenticated plaintext URLs are allowed only for loopback servers.

`CursorPage[T]` loads the first page and follows cursors lazily through `All(ctx)` or `NextPage(ctx)`. Developer event streams expose typed frames, resume cursors, gaps, reconnect callbacks and manual acknowledgements. `Raw` provides an explicit JSON escape hatch; a project view confines raw paths and credentials to its project.

`RequestLogs().List` reads typed project request-log pages and retains nullable
status, durations and removed credentials. `Follow` advances the follow cursor;
`Tail` yields backfill chronologically and follows new requests, with bounded
rate-limit waits and context cancellation. Organization callers select a project;
project views reject foreign selections. API `logs:read` permission still applies.
`Events().LiveSource` adapts retained webhook bodies to cancellable subscriptions.
It skips events without retained payloads, passes their resume cursor to the
listener, reports terminal errors, and closes its reader before `Done` completes.

`ConstructWebhookEvent` verifies HMAC against exact raw bytes before parsing. `TypedPayload` exposes all 84 known event names through a closed interface with concrete payload types. Unknown event names and payloads survive decoding. Separate helpers verify local-forward and Flow-forward signatures with their timestamp rules. Native webhooks do not include timestamp replay protection. `WebhookHandler` integrates with `net/http`, enforces POST and a body bound, and verifies `X-Webhook-Signature` before invoking the application. Applications must handle duplicate deliveries according to their own persistence model.

Media downloads expose bytes or an `io.ReadCloser`, filenames and API metadata. The configured timeout covers response headers, storage redirects and the complete media body; closing the body cancels its request. Cancellation and timeout remain errors even when the transport ends its body with EOF. Reads after a successful EOF continue to return EOF. API base paths are preserved for HTTP requests and Calls sockets. Signed download URLs redact routine Go formatting. Storage redirects receive no bearer credential, caller headers or cookie jar. WhatsApp media helpers parse supported descriptors, enforce HTTPS CDN hosts and size limits, derive HKDF keys, verify the ten-byte MAC and hashes, then decrypt AES-CBC before releasing bytes. `VerifyBeforeRelease` buffers plaintext until integrity checks pass. `VerifyStreaming` releases plaintext incrementally and reports final integrity failures through the reader; discard the output if the final read fails. File helpers write private sibling files and install them only after successful verification. API file helpers also enforce byte limits and preserve existing destinations on failure.

Calls use the native `github.com/coder/websocket` implementation. Lifecycle and media sockets send authentication as the first WebSocket message, never in the URL. `Follow` maintains the lifecycle connection, tracks incoming and outgoing calls, buffers events that precede REST admission, and reconnects with bounded backoff. `Call` exposes answering, joining, leaving, ending, PCM audio, H.264 video, confirmed media preferences, participants, reactions and hand state. Media reconnect keeps the same connection identity and restores confirmed preferences. An optional token provider shares refresh work and refreshes socket authentication before expiry. Quality/error reporters bound diagnostic traffic and stop on permanent refusal. Consume session and call events with a select on `Done()`; event channels remain open during concurrent cleanup.

## Verification and protocol evidence

Run `go test ./...` and `go vet ./...` from this directory. The tests execute native HTTP fixtures and a shared Node wire server. Run `go test ./...` in each `examples/go/*` directory to compile the consumer examples without network effects. `send-message` requires `POLYMORFA_API_KEY`, `POLYMORFA_SESSION` and `POLYMORFA_PHONE` and sends a message when run. `calls-agent` requires the API key and session and answers incoming calls when run. `webhook-server` requires `POLYMORFA_WEBHOOK_SECRET` and listens on loopback port 8080.

[`web-host`](../../examples/go/web-host/README.md) runs a Gin or `net/http` application with templ, HTMX and the existing Web Components. Its app-owned POST token endpoint derives the number and user from authenticated server state. The example has native HTTP tests for both hosts and a browser-tested sign-in, inbox mount and sign-out flow.

WhatsApp media behavior was checked against TypeScript SDK source and Cellar's shipped-client bundle `whatsapp-1049950004`:

- `/Users/purpshell/.cellar/bundles/whatsapp-1049950004/modules/WAWebCryptoCreateMediaKeys.js:23-29`: HKDF expansion to 112 bytes and IV/encryption/MAC/reference key slices.
- `/Users/purpshell/.cellar/bundles/whatsapp-1049950004/modules/WAWebCryptoDecryptMedia.js:19`: ten-byte MAC; lines 28-39: HMAC over IV and ciphertext, truncated comparison; lines 41-50: CBC decryption; lines 57-60: plaintext hash verification.

This is shipped-client protocol evidence, not proof of a current server or live-provider download. No live API credentials, real WhatsApp media, registry release or deployment were exercised.

`write_coverage.py` reconciles manually authored public-method wire fixtures with the pinned ledger. It emits coverage metadata only; SDK resources and types are handwritten. Operations remain missing until both the typed method and its request/response fixture pass. Direct-media/history and customer-owned storage consumers record their separate source pins below; the primary API default remains 2026-09-22.

The neutral Calls media interface is `Call.WriteAudio`, `Call.WriteVideo` and
`Call.Events`. Audio events contain signed 16-bit PCM at `Call.Snapshot().SampleRate`.
Video events retain H.264 bytes, source handle, microsecond timestamp and keyframe
flag; `video_source`, `video_source_removed` and `keyframe_request` controls reach
the same event channel. `Snapshot().VideoSources` provides typed owners and labels
and clears on media disconnection or call end. Outgoing video uses source zero.
Applications provide their own capture, codecs and playback; these server interfaces
do not create browser media devices. The actual WebSocket tests cover PCM/H.264
framing and source/keyframe controls.

## Campaign follow-ups (beta)

Both campaign surfaces accept `CampaignFollowUp` on create and update. A nil
`FollowUp` request field omits the setting; `&Nullable[CampaignFollowUp]{}` sends
`null` to remove it from an unlaunched draft. Use `CampaignFollowUpTextMessage{Text: ...}` or
`CampaignFollowUpTemplateMessage{TemplateID: ...}`. Each variant supplies its own
discriminator; a nil message is rejected before transport.

```go
followUp := polymorfa.CampaignFollowUp{
    Message: polymorfa.CampaignFollowUpTextMessage{Text: "Hi {{first_name}}, still interested?"},
}
_, err := client.Campaigns().Update(ctx, projectSlug, campaignID, polymorfa.UpdateCampaignRequest{
    FollowUp: &polymorfa.Nullable[polymorfa.CampaignFollowUp]{Value: &followUp},
})
```

The first delivery starts the delay; the first read restarts it before sending
starts. Replies and opt-outs cancel the follow-up, and expired waits never send.
`DelaySeconds` accepts 60 through 604800 and defaults at the API to 86400.
`ExpirySeconds` accepts 86400 through 2592000, defaults to 604800, and must exceed
the delay. Expiry starts at the first send. Returned timing fields remain optional.
A campaign must send a single first message; follow-up text cannot contain tracked
links. The API enforces beta enrollment and returns `403 feature_unavailable`
when the team is not enrolled.

`CampaignRecipient.FollowUp` retains typed status, receipt anchor, due/expiry times
and reason. `CampaignAnalytics.FollowUps` is required on both surfaces. `CampaignFollowUpReport` counts these outcomes separately from the first
message. Follow-up timestamps are Unix milliseconds. Native fixture verification
covers the merged contract; no live follow-up campaign or publication was exercised.

## Contact frequency caps, audience segments and drips (beta)

These methods follow `contracts/campaign-frequency-cap.json` and
`contracts/campaign-segments-drip.json`. They do not enroll a team in a beta;
the API returns `403 feature_unavailable` when a team lacks access.

The team cap is an organization setting. `Campaigns().GetFrequencyCap(ctx)`
returns both limits, `Revision` and `UpdatedAt` (nil until first saved).
`UpdateFrequencyCap` replaces both windows with the revision you read; nil
limits remove them. The PUT is sent once. A stale revision returns a
`ConflictError`; read again and reconcile. Campaign create and update accept
`FrequencyCap` (`&Nullable[CampaignFrequencyCap]{}` removes a campaign cap),
recipients report `CampaignFailureFrequencyCap`, and analytics add
`FrequencyCap.SkippedRecipientCount`.

`OrganizationClient.AudienceSegments()` lists, retrieves, creates, updates and
deletes saved segments, and previews a saved segment or unsaved rules. A
project client has no segment methods. Build rules from typed conditions such
as `AudienceSegmentTagContains` and `AudienceSegmentAttributeCompare`; conditions
the SDK does not model decode as `AudienceSegmentUnknownCondition` and are
rejected in requests. Updates and deletes need the last observed revision.
Writes and both previews are sent once; a 409 `state_conflict` means a stale
revision or an evaluation timeout, so re-read or simplify the rules.

Platform create accepts `SegmentID` (omit it rather than sending null) and
update accepts `SegmentID: &Nullable[string]{}` to clear it. `Drip` takes a
`CampaignDripInput` on create and a partial `CampaignDripPatch` on update; the
SDK applies no defaults, and omitted fields keep their stored values. Drip steps
accept `DelayUnit` and a per-step `SendWindow`. Ordinary creates allow
`DelayAfterSec` up to 86400; drip creates and every PATCH allow up to 2592000,
and the API checks the stored drip, delay unit and eligibility.
`Campaigns().Enroll` and `MessagingCampaigns.Enroll` add a contact to a
continuous drip and are never retried automatically. Campaign reads expose
`Drip`, `EnrollmentOpen`, `PauseReason`, `SegmentID` and `SegmentSnapshot`;
analytics expose per-step `Drip` results.

## Raw pagination

`PaginateRaw[T]` accepts any SDK client with a `Raw` method and a decoder that
receives the JSON body and response metadata. Return `PageResult[T]` with items
and the next cursor; an empty cursor ends pagination. `RawPaginationOptions`
changes the cursor query key from `cursor` to the API's key. `NextPage(ctx)` loads
one more page, and `All(ctx)` iterates lazily. Cancellation, request options and
project confinement apply to every page. Repeated cursors fail with
`invalid_response`. Query parameters and headers are copied before loading.

```go
page, err := polymorfa.PaginateRaw(ctx, project, polymorfa.RawRequest{
    Method: "GET", Path: "/events",
}, func(body json.RawMessage, metadata polymorfa.Metadata) (polymorfa.PageResult[polymorfa.PlatformEvent], error) {
    var wire struct {
        Data []polymorfa.PlatformEvent `json:"data"`
        Page struct { NextCursor string `json:"nextCursor"` } `json:"page"`
    }
    if err := json.Unmarshal(body, &wire); err != nil { return polymorfa.PageResult[polymorfa.PlatformEvent]{}, err }
    return polymorfa.PageResult[polymorfa.PlatformEvent]{Items: wire.Data, NextCursor: wire.Page.NextCursor}, nil
})
```

Use the typed resource method when it represents the endpoint. Raw decoders are
application-owned; validate the endpoint's response shape before returning items.
The follow-up union replaces the unpublished `CampaignFollowUpMessage` struct.
Use the text or template variant when upgrading a source checkout. Follow-up
business constraints and enrollment remain enforced by the API.

### Local upload encryption

`EncryptWhatsAppMedia` encrypts a byte slice. `EncryptWhatsAppMediaTo` reads an
`io.Reader` incrementally and writes encrypted bytes to an `io.Writer` with
bounded working memory. Choose `UploadImage`, `UploadVideo`, `UploadAudio`,
`UploadVoiceNote`, `UploadDocument` or `UploadSticker`; a 32-byte media key is
created with the operating system random source unless you supply one for an
immutable repeat pass. Plaintext defaults to a 256 MiB limit.

```go
media, err := polymorfa.EncryptWhatsAppMedia(ctx, plaintext, polymorfa.EncryptMediaOptions{
    MediaType: polymorfa.UploadImage,
    MimeType: "image/jpeg",
})
if err != nil { return err }
// media.Ciphertext is ciphertext plus its ten-byte MAC. Keep MediaKey private.
```

For a repeat pass, supply the first pass's `MediaKey` in `EncryptMediaOptions`
and its `EncryptedMediaInfo` as the final argument to `EncryptWhatsAppMediaTo`.
The source must reach EOF and match both hashes and lengths before the final
ciphertext block and MAC are released. Changed sources, cancellation, missing
EOF, read/write failures and size overruns fail without a complete upload body.
The caller owns and closes the reader/writer and must discard partial output
on failure. This helper performs local encryption; it does not finalize a CDN
upload or send a message. Formatting and JSON serialization omit the media key
and ciphertext. Independently calculated vectors and repeat-pass failure tests
cover all six media kinds.

### Encrypted upload egress

`MessagingClient.WhatsAppMedia().UploadBytes()` uploads a byte slice;
`Upload()` accepts a `WhatsAppMediaSource` factory returning a fresh
`io.ReadCloser` of the same plaintext on every call. The SDK closes each
returned stream. A hashing pass obtains the encrypted hash before the upload
pass; changed sources fail before a complete encrypted body or document
finalization is released.

`UploadWhatsAppMediaOptions.Egress` defaults to `relay`: the API receives
ciphertext plus its MAC and forwards it through the session's connection.
`direct` requests a short-lived grant and uploads from your process. Neither
upload mode sends plaintext or the media key to an upload endpoint. Keep the
returned `MediaKey` and location private.

Direct uploads preserve the exact grant token and upload parameters, refresh a
401 grant, resume interrupted ordinary uploads, and retry network errors,
408 and server errors except 507. Redirects are refused. Document uploads above
50 MiB use consecutive parts and finalize only after the source's EOF/hash
check. Part size is configurable from 1 byte to 64 MiB; the SDK buffers one
part for repeatable retries. API credentials, cookies and caller headers are
excluded from CDN requests. The direct network operation's timeout covers
requests and response bodies; the caller's context also cancels source reads.
A cancellation or timeout does not undo a provider upload that already ran.

`CreateUploadGrant()` and `RelayUpload()` are also available for applications
that supply their own encrypted-body factory. Applications using these lower
level methods own source immutability and integrity checks. Upload methods
select API version `2026-10-14` per request by default; existing SDK methods
retain their `2026-09-22` default. The additive API must be enabled and available
in the selected environment; a source checkout does not establish that access.

### Sending uploaded media

`ToWhatsAppMediaSendDescriptor(upload)` converts an encrypted upload result to a
validated descriptor. Set `MediaContent.Descriptor` for image, video, file or
voice messages, or `StickerContent.Descriptor` for a sticker. Voice notes also
set `MediaContent.PTT` to true. Optional `WhatsAppMediaSendMetadata` carries a
thumbnail, dimensions, duration, waveform, key timestamp or sticker animation.
Descriptors cannot be combined with URL/base64/MIME inputs; stickers require
`image/webp`. Keys and hashes use binary slices locally and standard base64 on
the wire. Returned descriptors remain typed and redact ordinary formatting and
JSON; `Wire()` explicitly exposes secret fields.

Descriptor message sends select API revision `2026-10-14` unless overridden;
ordinary sends keep the legacy default. A standard message send transmits its
media key to Polymorfa. Applications requiring customer key custody send through
their application sidecar instead. Keep descriptors and explicit wire maps out
of logs and error details.

### Local history chunks

`DownloadHistoryChunk(ctx, input, options)` accepts either a
`HistorySyncChunkDescriptor` or compressed `InlinePayload`. Descriptor downloads
use the WhatsApp History HKDF label and verify the encrypted hash, MAC,
compressed hash and optional length before decompression or a decoder callback.
No Polymorfa credential reaches the CDN. Compressed input defaults to a 256 MiB
bound and inflated data to 512 MiB; configure smaller limits for your process.
Gzip, zlib and raw deflate are accepted. Truncated data, trailing bytes, malformed
wire fields and size overruns fail. Context cancellation covers network bodies,
inflation steps and decoder admission.

`HistorySyncData.Protobuf` preserves the exact inflated proto2 message.
`Fields` retains every wire field, including unknown fields and groups.
`Conversations` exposes chat IDs, message protobuf and unsigned message order IDs;
`SyncType`, `ChunkOrder` and `Progress` expose core metadata. This handwritten
view does not replace the full WhatsApp schema. Supply `DecodeHistorySyncOptions.Decoder`
for your complete proto2 model; it receives a private verified copy, while the
original bytes remain available. Formatting and ordinary JSON redact content.
No decode helper stores data, acknowledges events or deletes chunks.

`MessagingClient.HistorySync().RequestChunkRetry()` requests another chunk from
the phone; `DeleteChunk()` explicitly deletes a processed CDN blob. Store the
chunk durably before deletion. Both commands require a server credential and
select API revision `2026-10-14` by default. The API enforces session authority,
consent and availability. Delete requests accept binary SHA-256 and encode it as
standard padded base64. Neither command retries automatically; timeouts and
cancellation do not undo an accepted request.

### Customer-hosted D1 binding

Import `github.com/polymorfa/sdks/packages/go/storage` for the storage-only
`Adapter` interface, schema-2 definitions/key encoding and `NewD1Adapter()`.
Provide your Worker URL, immutable authority and table prefix, and a separate
application secret. HTTPS is required except on loopback. The constructor
verifies a fresh signed handshake before exposing atomic commit capability;
a zero-value adapter exposes no capability. It supports setup only when the
Worker permits it, bounded get/query, and all-or-none conditional commits.

Every request signs its fresh nonce, method, exact path and exact body. Every
response must authenticate that nonce, status and exact body and match the
configured authority/prefix/schema. Foreign rows, scope/order violations and
unrelated conflict IDs fail closed. Redirects and automatic retries are refused;
operation deadlines cover response bodies. Unconditional deletes require a
same-session CAS lease write in the same atomic batch. Secrets and endpoint URLs
are omitted from errors and ordinary formatting/JSON.

This uses the customer Worker bridge pinned at
`9ae35e671f7f4868a67c1562422c5af9284b95c1`, backed by the D1 Worker binding.
Administrative D1 REST is not an atomic adapter. Native tests exercised the
actual bundled Worker/Miniflare binding with all-entity fixtures, 2,000-row
pagination, rollback, fenced deletion and checkpoint CAS. Set
`POLYMORFA_D1_BRIDGE_FIXTURE_URL` to repeat that opt-in proof. The adapter persists rows only; the shared engine below owns reducers and merge/replay policy. Provider adapters and their native proofs are listed below.


## Customer-owned Signal service client

The server-side sidecar client consumes the application HTTP contract pinned to
`8aa191ef0d4c318229c91bcdf474bf2d79dac47c`. The separate application bearer secret
is not a Polymorfa API credential: it needs at least 16 visible ASCII characters,
and values starting with the reserved `pmfa_` prefix are rejected before any
request or webhook HMAC check. Device keys remain with the customer-operated
Signal service; the SDK imports no Signal core and uses no FFI. Require HTTPS
except on loopback. Redirects, credential cookies and automatic retries are
refused. Request deadlines and caller cancellation do not undo a send or ACK.

Create `NewSignalSidecarClient(SignalSidecarOptions{URL: serviceURL,
Secret: applicationSecret})`. Use `Health`, `Sessions`, `Send` with
`SignalSendRequest`, and `OpenEvents(ctx, sessionID)`. Iterate `stream.Items()`
and close the stream. `ToSignalMediaDescriptor(upload)` converts a completed
local media upload into a secret-bearing send descriptor, including PTT audio.

An SSE connection delivers each record immediately and validates its ID, event
type and requested session. The SDK retains exact JSON and protobuf bytes,
including unknown fields; history notification enums remain nullable integers.
There is no cursor, automatic reconnection or automatic ACK. Durably persist
an event and its effects before calling `Acknowledge`.

`VerifySignalWebhook` verifies the timestamp window and HMAC of the exact raw
body. `ProcessSignalWebhook` requires a `SignalWebhookStore.ApplyOnce` implementation
that atomically deduplicates and durably commits effects. Return HTTP 2xx only
after it succeeds. No in-memory deduplication fallback is supplied. Ordinary
formatting and JSON serialization redact secret-bearing DTOs; explicit raw
bytes and wire conversion are customer-owned sensitive data and must not be logged.

Native tests cover HTTP, streaming cancellation, redirects, header isolation,
nullable history, raw protobuf and independent webhook HMAC vectors. The opt-in
`POLYMORFA_SIGNAL_FIXTURE_DIRECTORY` proof exercised the pinned service and real
core with synthetic pairing, encrypted receive, caller fsync before manual ACK,
and sends through a fake upstream WebSocket. This proves those local boundaries;
it does not establish live WhatsApp pairing, provider delivery or peer decryption.


## Schema2 storage engine and local history reduction

`storage.NewEngine(adapter, storage.EngineOptions{})` adds the shared deterministic
merge, deduplication and checkpoint policy to a storage-only adapter. The
process-local `storage.NewMemoryAdapter(500)` is available for tests and ephemeral
applications; use a durable adapter for restart recovery. Applications own data,
connections, namespaces and retention. The SDK does not send stored content to a
hosted database or log row contents.

`Apply` accepts a `storage.Batch` with typed field writes and operation kinds.
Each field uses its version and a deterministic value tie-breaker, including
UTF-16 ordering and ECMAScript canonical number spellings. Revoked content and
media references use a final version so older history cannot restore them.
Every payload chunk reserves one slot for the durable session lease CAS. Lease
release advances its revision rather than deleting it. Between bounded planning
reads and clear-query pages, the engine conditionally renews a lease at half its
TTL. An expired or replaced lease still fails before data or the event marker
can commit. A failed chunk stops
later writes, including the event marker, even when no conflict IDs are returned.
Retries re-read and re-plan; a large event can partially commit and is recovered
by replay before the final deduplication marker appears.

`ReduceEvent` covers the listed WhatsApp chat-data events and excludes calls,
campaigns, billing and presence from chat storage. `ReduceHistoryChunk` consumes
complete decoded protocol JSON, with scoped chat/direction/participant identity
and device-JID normalization. `ReduceHistoryData` requires the local history
codec's explicit complete-schema decoder result; the minimal built-in protobuf
view is insufficient and fails closed. Retain the codec's exact raw protobuf
when unknown fields must remain available. Local history decoding and reduction
never enable service history consent.

`engine.ApplyEvent` accepts a verified webhook and an optional local history
decoder. `SyncToStorage(ctx, storage.APIEventSource{Events: project.Events()},
engine, options)` resumes from the saved cursor and orders event commit,
checkpoint CAS, then manual ACK. A retention gap or missing required payload
stops consumption before checkpoint or ACK. `ExpectedCursor == nil` means no
cursor assertion; `&storage.ExpectedCursor{}` explicitly requires no saved cursor.
Callers cancel the context to stop the consumer.

Native race tests cover both shared portable event/history fixtures, 2,000-message
history, replay, concurrent engines, atomic rollback, permanent revocation,
clear-chat media/child deletion, equal/late watermarks, first-failed-chunk refusal,
checkpoint CAS and actual API HTTP/SSE persistence-before-ACK. The opt-in D1 proof
runs the same engine over the signed actual Worker/Miniflare binding; administrative
D1 REST is never treated as atomic.


## PostgreSQL, MySQL and SQLite

`storage.NewSQLAdapter(ctx, db, storage.PostgreSQL, options)` accepts a configured
`*sql.DB` using pgx's standard driver; use `storage.MySQL` with go-sql-driver/mysql
or `storage.SQLite` with modernc SQLite. Connections remain borrowed unless
`OwnsClient` is selected. Use a trusted `TablePrefix` and optional PostgreSQL
`Schema` for independent application namespaces. The exported
`SQLSchemaStatements` and `SQLMigration` use the shared schema2 column names and
indexes. PostgreSQL clients include customer-operated Supabase and Neon SQL
connections; MySQL clients include compatible customer PlanetScale connections.
Their actual cloud hosting and credentials were not exercised by local tests.

Setup creates schema2 tables unless `CreateTables` is explicitly false. It never
rewrites a different saved version. Reads and writes verify that version and
fail closed on mismatch. MySQL also requires InnoDB for every storage table and
strict SQL mode before atomic commits are exposed. Conditional writes execute
in one native transaction; stale revisions roll the entire batch back. An
unconditional delete requires a matching session lease CAS in that same batch.
Errors omit database URLs, credentials and upstream exception text.

Native tests use pgx with PostgreSQL 16, go-sql-driver/mysql with MySQL 8.4 and
modernc SQLite. Each runs shared event/history fixtures, 2,000-message history,
pagination, rollback, lease/checkpoint behavior and schema-version refusal.
They verify borrowed/owned close behavior and reject nontransactional MySQL.
Set `POLYMORFA_SQL_FIXTURE_METADATA` to a task-owned metadata file containing
`postgres` and `mysql` test DSNs to repeat the optional server proofs. The provider and ORM adapters below reuse this SQL contract.


`storage.NewLibSQLAdapter(ctx, db, options)` accepts an application-configured
`github.com/tursodatabase/libsql-client-go/libsql` pool and uses the same schema2
SQL contract. The official HTTP client pinned at
`v0.0.0-20260528064733-9d5d30a29a60` passed the complete native SQL conformance
suite against an actual libSQL server, including conditional rollback and
2,000-row paging. Set `POLYMORFA_LIBSQL_FIXTURE_URL` to repeat that opt-in proof.

The official driver controls transport timeouts. Its commit/rollback methods
use their own context; caller cancellation does not promise to interrupt an
in-flight commit. The adapter waits for the native transaction to settle before
returning or closing an owned pool, and never changes global HTTP settings.
A cancelled or failed operation can have an uncertain committed outcome; replay
from the durable checkpoint and deduplication marker rather than assuming undo.


## Customer-owned document databases and ORM exports

All adapters borrow caller-configured official clients and use a trusted
`storage.ProviderOptions.Namespace`. Set `Create` only when this application may
initialize its schema2 version marker; setup refuses a different saved version.
`MaxQueryRows` bounds indexed reads before local ordering and pagination. The
engine supplies conditional revisions and reserves one commit slot for its
same-transaction lease. Adapters never evaluate webhook policy or store device keys.

| Adapter | Client verified by native tests | Atomic batch limit |
| --- | --- | --- |
| `NewMongoAdapter(ctx, database, options)` | `go.mongodb.org/mongo-driver/v2` 2.8.2, MongoDB 7 replica set | 500 |
| `NewDynamoAdapter(ctx, client, DynamoOptions{ProviderOptions: options, TableName: table})` | AWS SDK v2 DynamoDB 1.70.3, DynamoDB Local | 100 |
| `NewFirestoreAdapter(ctx, client, options)` | `cloud.google.com/go/firestore` 1.21.0, Firestore emulator | 250 |
| `NewCosmosAdapter(ctx, container, options)` | Azure `azcosmos` 1.4.2, Cosmos vNext emulator | 100 |

MongoDB requires a replica set and native snapshot/majority transactions.
DynamoDB verifies an active table with string `pk` hash and `sk` range keys.
Firestore reads all conditional rows before issuing writes in its native
transaction. Cosmos requires exactly the `/namespace` partition key and retains
ETag-guarded tombstones so a logical delete cannot race with recreation. Its
physical document IDs must fit the provider's 1,023-byte limit.

MongoDB and Firestore keep raw schema2 rows, with exact encoded keys as document
IDs. DynamoDB uses `{pk: namespace+":"+entity, sk: encodedKey, row}`. Cosmos uses
`{id: entity+":"+encodedKey, namespace, entity, row, deleted}` in one customer
partition. These layouts match the shared TypeScript storage contract. Provider
errors omit credentials, URLs and upstream diagnostic bodies.

Clients remain borrowed by default. MongoDB, DynamoDB and Firestore support
`OwnsClient`; closing an owned adapter waits for active adapter operations.
Cosmos rejects `OwnsClient` because its container client exposes no close boundary.
Neither adapter changes global transport configuration. Context cancellation and
provider deadlines do not establish that an accepted write was undone; recover
with checkpoint and event replay.

`SupabaseSchema(SupabaseOptions{...})` exports customer-installed PostgreSQL schema
and FORCE RLS policies. A distinct server role writes; browser readers see only
sessions with live `auth.uid()` membership and receive no write grant. The preset
never installs itself or grants a browser server credentials. Actual restricted
PostgreSQL roles verified live revocation and browser write refusal; hosted
Supabase and Neon services were not exercised.

`GORMModels(dialect, sqlOptions)` exports table names and schema-derived model
values for customer-owned GORM migrations and reads. Pass each value to
`db.Table(model.Table).AutoMigrate(model.Value)`, then initialize the version marker
with `SQLMigration` or `NewSQLAdapter`. Persist synchronized data through the
shared engine; ORM models do not replace revision, watermark or lease policy.
The official GORM 1.31.1/PostgreSQL driver 1.6.0 passed actual PostgreSQL migration,
engine-write and ORM-read interoperability checks.

Opt-in native tests use `POLYMORFA_MONGO_FIXTURE_URI`,
`POLYMORFA_DYNAMO_FIXTURE_METADATA`, `POLYMORFA_FIRESTORE_FIXTURE_HOST` and
`POLYMORFA_COSMOS_FIXTURE_METADATA`. They exercise the portable all-entity event
and history fixtures, 2,000-message history, bounded paging, replay, atomic
rollback, lease-fenced deletion, checkpoint CAS and namespace isolation against
actual drivers. These emulator/local-server proofs do not establish cloud
account permissions, hosting availability or deployment readiness. Convex and
IndexedDB are outside the accepted Go adapter matrix.


## S3-compatible media storage

`NewS3MediaStore(S3MediaStoreOptions{Client: client, Bucket: bucket, Prefix: prefix})`
borrows an official AWS SDK v2 S3 client configured for the customer's bucket,
including compatible R2 or MinIO endpoints. `UploadToWhatsApp` takes a Messaging
media resource, session, relative key and the existing encrypted upload options.
It requires an object ETag, pins both reads with `If-Match`, and preserves the
source-length and final encrypted-hash barriers before provider finalization.
An object changed between reads fails instead of finalizing mismatched media.

`Archive(ctx, descriptor, S3ArchiveOptions{Key: key, ScratchDirectory: privateDir})`
snapshots the descriptor, downloads and verifies into a private file, checks its
known plaintext length, then starts the object PUT. Corruption, wrong length or
pre-PUT cancellation cannot start an overwrite. Cancellation during an admitted
PUT cannot guarantee rollback. Each private spool is removed after
success or failure. Optional metadata is bounded ASCII; the SDK adds media kind,
plaintext hash and encoded filename, and never writes the media key. Caller
metadata must not contain secrets.

The official S3 client 1.114.3 passed actual MinIO proofs for relay/direct upload,
both conditional reads, changed-source 412 refusal, verified archive, descriptor
mutation isolation, corrupt-source overwrite refusal, known-length mismatch,
cancellation and spool cleanup. Repeat with task-owned synthetic metadata in
`POLYMORFA_S3_FIXTURE_METADATA`. AWS and R2 account credentials, provider hosting
and live WhatsApp delivery were not exercised by these native tests.


`UploadWhatsAppMediaOptions.UploadTransport` accepts a customer
`WhatsAppMediaUploadTransport` instead of an `Egress` string. Its `Name()` identifies
the result; `Upload(ctx, session, body)` receives encrypted-body metadata and
`body.Open(ctx, offset)`, without plaintext, the media key or API credentials.
Each opening revalidates the immutable plaintext source before releasing final
encrypted bytes. The SDK rejects success if no complete verified encrypted body
was consumed and closes all outstanding streams when the callback returns.
Custom callback failures become safe SDK errors; cancellation stops owned streams.

`client.WhatsAppMedia().UploadTransport("relay", options)` and its `"direct"`
variant return reusable built-ins that a customer transport can wrap. Existing
grant, credential isolation, retry/resume and finalization rules remain in those
built-ins. Native TCP tests exercise custom encrypted wire bytes and offsets,
wrapped relay/direct uploads, changed-source refusal, incomplete consumption,
blocked-source cancellation, error redaction and refusal to reopen a completed body.
A customer transport owns its external endpoint and must finalize the destination
only after its encrypted-body read succeeds.

## Additional campaign and custody contracts (development source)

This checkout adds 30 handwritten operations from API source
`f97ad78b172e80788c33bdc0fcf28f75db9283ec`, using TypeScript reference
`44d5426f90bf376940a5198edac5da4cd893cbe9`. The additive contract remains
unpublished. The primary coverage snapshots and global API default stay at their
existing revisions. These methods select `2026-10-14` per request when
`RequestOptions.APIVersion` is empty; an explicit request version takes precedence.
An SDK method does not establish deployed beta access or package availability.

`MessagingClient.Campaigns()` adds `GetReplyFlow`, `CreateReplyFlow`,
`SetReplyFlow`, `TestSend`, `Links` and `ExportRecipients`, using a project slug.
All six require an organization API key or project token; client tokens fail
before HTTP. The API still checks live scopes, project ownership, feature access,
funding and sender eligibility. Test sends require both campaign read and manage
scopes and send real messages.

`org.Campaigns()` exposes the corresponding Platform methods plus
`ListLaunchApprovals` and organization-only `GetSettings`. Its project selection
belongs in the typed query or request body. `org.Project(projectID).Campaigns()`
and a project-token client's `Campaigns()` expose only the seven confined
operations. They retain their project privately and accept no caller project
selector. Creating another project view does not retarget an existing resource.

Reply flows use `CampaignReplyFlowDefinition`, named nodes and edges, and sealed
message variants `CampaignReplyText`, `CampaignReplyButtons`, `CampaignReplyList`
and `CampaignReplyFlowForm`. Match variants are `CampaignReplyChoice`,
`CampaignReplyKeyword` and `CampaignReplySubmission`. Each variant supplies its
own discriminator. The SDK checks structural and byte limits; the API owns graph
semantics, compliance and campaign state. `SetCampaignReplyFlowRequest{}` sends
required `replyFlowId:null` to detach; a non-null `Nullable[string].Value` attaches.

`org.AudienceProfiles()` adds `List`, `Retrieve`, `Put`, `Delete` and `ListConsent`;
its `Imports()` resource adds `Create`, `Retrieve` and `Cancel`. These team-wide
resources are absent from project clients. Profiles are customer-supplied campaign
data, independent of WhatsApp-synchronized contacts. `Put` replaces tags and
attributes: provide non-nil collections, including `[]string{}` and an empty map.
A nil `ExpectedRevision` omits it when creating; replacement uses the observed
positive revision. `AudienceProfileAttribute{}` is explicit null; a non-null
`Value` uses exactly one string, finite-number or boolean `CampaignVariable`
variant. Consent `Allowed:false` and `AssertedAt:0` remain explicit values;
consent assertions never override an opt-out or grant permission to send.

Imports send JSON containing `ReplayKey`, canonical padded standard-base64 UTF-8
CSV and optional named column mapping. They accept at most 10 MiB of decoded CSV;
invalid rows and revision conflicts remain visible in the returned job report.
Aborting an HTTP waiter does not cancel a job; call `Imports().Cancel` explicitly.
Committed rows remain after cancellation. `Audiences().CreateFromCampaign` creates
a team audience from an explicit outcome and optional source-project selector.

`OptOuts()` adds `GetConfirmationSettings`, `UpdateConfirmationSettings` and
`GetConfirmationSummary`. These confirmation settings are separate from keyword
capture. The update requires the exact team and revision; false, zero and a null
locale remain explicit. Enabling requires a supported non-null locale.

`project.SignalCustody()` adds `Retrieve`, `Update`, `RetrieveCustomer` and
`UpdateCustomer`. Organization aliases live on `Projects()` and `Customers()`.
These defaults apply to future Number reservations and never convert existing
Numbers. Project mode cannot be null. Customer null restores inheritance:

```go
project, err := org.Project(projectID)
if err != nil {
    return err
}
observed, err := project.SignalCustody().RetrieveCustomer(ctx, customerID)
if err != nil {
    return err
}
_, err = project.SignalCustody().UpdateCustomer(ctx, customerID,
    polymorfa.CustomerSignalCustodyUpdate{
        ExpectedRevision: observed.Data.Data.Revision,
        SignalModeDefault: polymorfa.Nullable[polymorfa.SignalCustodyMode]{},
    })
```

Keep revision conflicts visible: reload and reconcile rather than silently retry
with a new revision. Required nullable values use a `Nullable[T]` value; optional
nullable fields elsewhere use a pointer to it. A zero revision is valid for
custody defaults and stays in JSON. New typed success models check required
fields and scalar shapes while tolerating response extensions. Optional nonnullable
fields accept omission and reject explicit JSON null. Reply keyword requests retain
the 64-byte UTF-8 bound; returned keywords preserve the API's lowercase form,
including Unicode expansions within its 64 UTF-16-unit response bound.

New writes default to no automatic retry, except `TestSend`, which captures one
idempotency key and body for its retries. Preserve an explicit caller key across
an uncertain result. `IdempotencyKey` takes precedence over `Headers`; a single
`Idempotency-Key` header is recognized regardless of casing. Conflicting or
multivalued caller keys are rejected before HTTP. A completed replay returns the API's conflict; an unknown
outcome does not prove no message was sent. An explicit retry override on other
writes has no declared replay guarantee. A profile-import body replay key is
separate from an HTTP idempotency key.

`ExportRecipients` returns one finite `CampaignRecipientExportPage`, preserving
server CSV quoting, CRLF, optional next cursor and sanitized filename. It requires
HTTP 200 with `text/csv` and rejects redirects. With a status or reason filter,
omit cursor and use limit 1000 or omit it. Unfiltered pages are separate reads,
not a global snapshot. Cancellation closes the response; no next page is fetched
automatically. Request metadata retains the request ID, trace ID, replay header,
retry advice and content disposition. Native fixtures exercise these contracts;
live campaign sends, import processing, custody availability and publication
remain separate acceptance gates.

## Campaign and descriptor delivery contracts

Campaign requests use `CampaignVariableMapping` and `CampaignTrackedLinks`.
A nil create mapping omits it. PATCH uses `*Nullable[CampaignVariableMapping]`
and `*Nullable[string]` for mapping and template resets. A nil field omits the
change; an empty `Nullable` sends null. Empty mappings encode `{}`, and an empty
`CampaignTrackedLinks` value encodes `[]`. Numeric and `__proto__` mapping keys
are valid. Bounds count UTF-16 units. Follow-up defaults participate in the
expiry-greater-than-delay check before HTTP.

Platform `MessagesArray` uses open `CampaignComposedMessage`, media and button
models. `Extra` retains extension fields. Empty composed messages are valid.
Platform PATCH remains open and accepts empty updates. Messaging PATCH requires
at least one change. `LaunchPlatformCampaignRequest` requires an explicit project;
`SkipMissingVariables` and `ScheduledAt` pointers preserve false and zero.
Approval, consent, funding, sender and enrollment remain API decisions.

Campaign analytics preserve null timing metrics separately from zero.
Recipient `FailureReason`, `MessagesSent`, `NextMessageAt`, `SequenceError` and
`FollowUp` reflect the returned report. `NextMessageAt` is `*float64` so Messaging
fractional values survive. Recipient-list reason/status/cursor/limit can coexist.
CSV export keeps its separate filtering rules.

`HistorySyncPolicy` reads archive or descriptor delivery. Writes use
`HistorySyncPolicyPatch` and `HistoryDeliverySetDescriptor`. Setting delivery or
resetting `SessionResetHistoryDelivery` selects `2026-10-14` only when the request
version is absent. A whole-history reset and ordinary GET keep `2026-09-22`.
Explicit versions are preserved. Go treats an empty `RequestOptions.APIVersion`
as absent. Initial QuickLinks also accept `SignalMode`; supplementary links
cannot change custody. `Session.SignalMode` is an optional immutable read fact.
Configuration cannot change custody or grant browser tunnel access.

`WebhookEvent.TypedPayload` distinguishes `DirectHistorySyncMediaPayload` and
`DirectHistorySyncInlinePayload` before archive and Cloud history. They use
projected `whatsapp_ids`, `original_whatsapp_ids` and `oldestMessageAt`. Media
uses `type: md-msg-hist`; inline uses `zlib-base64-protobuf`. Exactly one branch
is required. Retry correlation uses a Linked Devices chunk ID, never an event
UUID. Treat media keys and inline history as private; formatted descriptors are
redacted. Public event parsing does not decrypt, download, store or acknowledge
history.

Scoped Client tokens may use relay media upload and pure custom encrypted-byte
transports. Direct upload grants and history commands require a server principal.
Selected built-in direct upload is refused before plaintext is read. No-key
unsafe writes retain conservative retry behavior; a caller key and explicit
retry count authorize replay where supported. Request body, recipient and owner
bytes are captured once. Safe response headers include trace/replay metadata;
request ID and trace ID remain distinct. Unknown error codes remain available.

These source and local package contracts do not establish registry publication,
deployed API availability, provider acceptance or feature enrollment. Hosted
QuickLink invitation controls, Console configuration/enrollment and the host
feature evaluator remain excluded. Signal core/service work, strict compressed
history, history-storage dispatch, numeric coercion, general cursor and stream
repairs have separate checkpoints.

## Strict compressed history support

The local history decoder accepts one complete gzip, zlib or raw DEFLATE stream.
It rejects unused compressed bytes, concatenated streams, truncation, dictionaries,
reserved gzip flags and corrupt wrapper checksums before protobuf parsing.
The Go standard gzip reader accepts at most 511 non-NUL bytes in each filename
and comment. Complete streams exceeding either existing limit are unsupported;
the SDK does not replace the standard reader. Extra fields retain the gzip
16-bit length boundary. Required HistorySync.syncType remains enforced, so a
complete stream with empty output is a protobuf refusal.

Independent public tests cover stored, fixed, dynamic and multiple DEFLATE
blocks, optional headers, exact byte caps, valid unused final-byte bits and
malformed streams. Context cancellation is checked before and between reads; it
does not interrupt a synchronous standard-library read or protobuf parse.
Authenticated downloads still verify ciphertext, MAC and plaintext hash before
decoding. Signed archive storage tests use an application projection of common
fields; they do not establish descriptor dispatch or full-schema storage.
These local tests do not establish registry publication or live availability.

### Descriptor history storage

`storage.ApplyEventOptions.DecodeHistory` remains archive-only, with its original
arguments and nullable progress-only result. Use `DecodeHistoryDescriptor` for
validated public media/inline descriptors and return a non-nil map containing your
application's decoded storage projection. For example:

```go
options := storage.ApplyEventOptions{
    DecodeHistoryDescriptor: func(ctx context.Context, payload map[string]any, event polymorfa.WebhookEvent) (map[string]any, error) {
        return downloadDecodeAndProjectAuthorizedHistory(ctx, payload, event)
    },
}
```

The application defines `downloadDecodeAndProjectAuthorizedHistory`; existing
public history helpers verify compressed/encrypted bytes and accept a caller's
full-schema codec. The bridge never downloads media or changes custody. Default
`DescriptorDecode` rejects missing, nil, failed or invalid decoding before any
progress, marker, checkpoint or ACK. A legitimate empty map is allowed.
`HistoryDescriptorMode: storage.DescriptorMetadataOnly` validates and consumes
progress without any decoder. This deduplicates the event; configuring a decoder
later cannot import it through ordinary replay. Valid duplicates skip callbacks.
Descriptor notification IDs are not message IDs; existing `wa:` fallback keys
remain, without an opaque-ID joining guarantee. Content/marker commit precedes
checkpoint CAS and manual ACK. A failed ACK leaves committed data intact. Cloud
history and archive behavior are unchanged. This is local package behavior,
not registry or deployed availability.

Decoded-history numeric strings use the TypeScript producer's finite
`Number(string)` results, including exact ECMAScript whitespace, unsigned radix
integers and nearest-even binary64 rounding beyond uint64. Generic row numbers,
safe revisions, leases and CAS remain strict. Shared producer vectors and local
physical-module consumers verify this compatibility; registry publication and
matching environment acceptance remain separate release gates.

### Event-stream validation and limits

Project event streams retain the previous resume cursor until an event's base64
payload and webhook envelope validate. Malformed server data follows the existing
reconnect policy. A frame has a 4 MiB UTF-8 wire-byte budget, including incomplete
lines, all `data:` lines, field syntax and comments. A terminating blank line
resets the budget. Oversized frames reconnect from the previous validated cursor.
Storage synchronization preserves `Params.Since` when no durable checkpoint
exists; a saved checkpoint overrides it. Event commit, checkpoint CAS and manual
ACK keep that order. These changes are unreleased source behavior.
