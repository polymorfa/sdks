# Polymorfa PHP SDK

Handwritten server SDK for PHP 8.2+, with Guzzle, OpenSSL and cURL. Package identity: `polymorfa/sdk`. This source package is a development build and has not been published to Packagist.

```php
use Polymorfa\{Credential, MessagingClient, RequestOptions};

$client = new MessagingClient(Credential::organizationApiKey(getenv('POLYMORFA_API_KEY')));
$response = $client->messages->send('support', [
    'conversation' => ['phoneNumber' => '+15551234567'],
    'content' => ['text' => 'Hello'],
], new RequestOptions(idempotencyKey: 'order-123-confirmation'));
$messageId = $response->data['data']['id'];
$requestId = $response->metadata->requestId;
```

`Client` manages Platform resources; `Client::project($projectId)` returns an immutable project view. `ProjectClient` accepts an organization API key or project token and cannot rebind to another project. `MessagingClient` also accepts constrained client tokens for supported messaging actions; server-only operations reject them before a request.

Response array shapes have handwritten PHPStan types. Responses retain metadata, including status, attempts, version and request ID. Errors use status-specific exception classes and retain safe server error fields. Raw access is an explicit escape hatch, and project raw access remains confined to its project. Request options include per-request version, timeout, idempotency key, headers and cooperative cancellation. Reserved authentication headers cannot be overridden.

Reads retry transient failures at most twice by default. Writes retry only when an idempotency key exists; send and react create one key for each call when omitted. Retry-After is bounded, and a replayed final result never retries. Storage redirects do not receive API credentials. The SDK validates every hop, resolves relative targets against the current storage URL, rejects public HTTP targets and stops after five storage requests. HTTP targets are accepted only on loopback.

```php
use Polymorfa\Webhooks;

$event = Webhooks::constructEvent($rawBody, $signatureHeader, $signingSecret);
// Pass the exact HTTP request bytes. Unknown events retain their payload.
```

Native webhook signatures authenticate bytes with HMAC-SHA256. They have no timestamp or replay window; delivery deduplication belongs to the application. Do not parse or re-encode JSON before verification.

The package's `coverage.json` attributes each operation to native test evidence and records unfinished typed resources. The presence of a method does not imply full SDK parity or access to a gated service feature. Existing API authorization, enrollment, entitlements and availability checks still apply.

Development checks:

```sh
composer validate --strict
composer install
composer lint
composer format:check
composer typecheck
composer test
composer build
```

Tests require Node.js to run the shared local HTTP fixture server. `Dockerfile.test` supplies PHP 8.2, cURL, Composer and Node. `POLYMORFA_BUILD_DIR` selects the destination for the standalone source archive.

`$client->clientTokens->mint()` accepts one session or Customer target.
`retrieveRules()`, `updateRules()` and `deleteRules()` manage session client
rules. These methods require server credentials; API eligibility and
ownership checks govern Customer tokens.

`WhatsAppMedia::decode()`, `download()` and `decrypt()` handle existing media
for image, video, audio, document and sticker messages. Downloading requires
a plaintext hash and checks the encrypted hash, MAC, plaintext hash and
size. CDN fallback and redirects remain within WhatsApp CDN hosts and never
receive API credentials. Media key values are hidden in debug output.

Install `phrity/websocket:^4.0` to use `MediaSocket` with native sockets.
It authenticates in the first frame and uses `pmfa.calls.v2` for PCM and
H.264 media. [`CallsClient`](calls.md) adds lifecycle polling, credential
refresh, call admission/claim state, media reconnect and bounded diagnostics.
Applications drive its synchronous `poll()` loop while calls are active.
`WebhookRequest::fromSymfony()`, `fromLaravel()` and `fromPsr()` authenticate
raw framework bodies; install the relevant framework package. Application
examples are in `examples/php` in the source tree.

[`web-host`](../../examples/php/web-host/README.md) provides runnable Laravel
with Blade and Symfony HttpKernel with Twig, using HTMX and the existing Web
Components. Its authenticated POST endpoint mints browser tokens from
server-owned user and number assignments. Both hosts have native HTTP tests
and browser-tested sign-in, component mounting and sign-out flows.

`chats` provides typed stored history pages, message media downloads,
message edits, archive controls and service-window observations. The API
requires HMS enrollment for hosted history and separate Official API
eligibility for service-window access. `business` provides typed profile,
catalog, product, collection, order, compliance, linked-account and
eligibility methods, including asynchronous accepted response variants.

`voip` provides typed Calls REST controls, permission checks, participant
controls, call settings and quality/error reports. Call-link creation and
preview reject idempotency keys and never retry. Reactions and hand-state
changes also never retry. Other call writes retry only with an explicit
idempotency key. Client tokens cannot select a server participant and are
refused by server-only link, permission, check and settings operations.

`banSafe` reads and changes project ceilings, warmup plans, insurance
evidence, health policies and Number overrides with server credentials.
Platform equivalents are under `Client::$projects` and `Client::$sessions`.
Responses retain entitlement and applied-state fields; configuring a
setting does not grant access. Send the version from a recent health-policy
read when updating it.

Platform account resources expose organization details, members, API-key and
project-token metadata. `projects` creates development projects, lists Hybrid
Link merge candidates and submits or approves production enrollment. `sessions`
provides lifecycle and batch controls, tier quotes, quote confirmation and
WhatsApp capability observations. Quote requests reject simultaneous merge and
resolution choices; tier confirmation requires a reviewed quote ID.

`auditLogs`, `sessionBans`, `securityIncidents` and `optOuts` preserve their
native Platform envelopes. `billing` reads balances, transactions, pricing,
limits and priorities, and writes revision-guarded controls. Billing methods
validate UUIDs, revisions, priorities and six-decimal credit quantities before
sending a request. Passing validation grants no billing authority or feature
access. These families have native HTTP socket tests in addition to PHPStan
shape checks.

`customers` covers Customer lifecycle, masked Number inventory, event records,
pairing links and confirmed transfers. Nullable update fields remain distinct
from omitted fields, and a replayed pairing-link creation can return a null URL.
`usage` unwraps measured records and gate observations and follows cursors lazily
through `iterateRecords()`. Project views always select their own usage project.
A usage record or configured gate does not establish a customer charge.

`sipTrunks` provides typed trunk configuration, endpoint discovery and credential
rotation. For organization clients, `list($projectId)` and
`create($input, $projectId)` select a project. Project views use their own project.
When a project view uses an organization key, writes first verify the trunk's
project using a read without the write's idempotency key. An environment without
SIP hosting returns the `sip_not_hosted` endpoint variant.

`quickLinkSettings` reads nullable saved branding settings and preserves explicit
null and false updates. `sessionConfiguration` reads and updates saved defaults
with their revisions. Both bind project views to the project's identity.

`ProjectClient::$functions` manages Functions, deployments, secret versions and
invocation receipts. Its requests always carry the owning project. Canonical
lowercase UUIDs and positive revisions are validated locally. Every Function
write runs once, including keyed invocations: after an uncertain result, inspect
the receipt before deciding on another invocation. Invocation creation requires
a printable idempotency key of 1 through 128 characters. Replayed results may
omit the original response, and `responseRetained` remains false.

Platform developer resources expose typed event, operation, webhook and delivery
records with payload availability and idempotency receipts. `events.listIndexed`
keeps 64-bit ingestion offsets as decimal strings and rejects non-advancing pages.
`operations.wait` uses bounded server long polls; cancellation creates one
idempotency key per invocation. Organization and immutable project views use
their respective native routes. `requestLogs.list`, `follow` and `tail` read the
project log; tail reverses backfill into chronological order, follows new records,
honors cancellation and bounds `Retry-After` delays.

`officialGroups` provides typed Official API group reads and writes. Every change
is sent once, including keyed requests with retry overrides. The API enforces
Number eligibility and enrollment. `hybridLink`, `observationPolicies`,
`cloudOnboarding` and `testing` follow the existing server contracts.
`SystemClient` sends credential-free liveness and version probes; `BridgeClient`
accepts only a project token and resolves regional Bridge routes.

Both campaign resources keep the API's campaign fields, recipient delivery
history, send windows, A/B variants and conversion reports typed. Messaging
creates and lifecycle actions create one invocation idempotency key. Platform
create sends once and ignores retry/key overrides. Recipient and audience
appends default to one attempt; an explicit retry override and key can re-enable
retries, which the API may process as another append. Reconcile a lost response
before appending again. Conversion report totals remain decimal strings of minor
units and currencies remain separate.

`ApiResponse` suppresses payload contents in `var_dump` to protect one-time
secrets and signed URLs. Access `data` explicitly when consuming a response.

`messages.send` accepts the complete typed content union, including interactive
and payment-order messages. `messages.operationStatus` reads the durable receipt
without resending. QuickLink models preserve connection goals, configuration
choices and separate Cloud sync request receipts from delivery progress.

`media.downloadStream` returns a PSR body to consume once or close.
`chats->downloadMessageMediaStream($session, $conversation, $messageId)` streams
a stored message copy with the same body, filename and response metadata.
It requires a server credential and the API's enrolled history access. Cancellation
interrupts body reads; a body failure preserves the original request metadata.
`downloadUrl` returns a signed storage URL without following it, or reports that
the API streams the body. Storage requests omit API credentials and caller
headers. `downloadToFile` writes a private sibling and replaces the destination
only after completion; bounded, cancelled or failed reads preserve the previous
file. Media filenames are display names stripped of path segments and controls.

The handwritten REST resources cover the 439 operations supported by the pinned
TypeScript SDK. `coverage.json` also records three explicitly tested Campaign
supplements separately from the TypeScript exclusions. `supplements.json` names
Graph catalog reads, marketing observations, Flow public key registration,
testing phone helpers, and additional runtime helper evidence.

`$event->knownEvent()` returns a PHPStan discriminated array union for all 84
known webhook names. Switch on `event` to narrow its `payload`. Linked and
Official API messages, session status, template status, history sync, and order
payment reports retain their distinct payload variants. Unknown events return
`null` from `knownEvent()` and keep their exact body in `raw` and `payload`.
`externalId` contains the application's supplied QuickLink reference.

`Webhooks::verifyFlowForwardSignature()` verifies the exact decrypted Flow request
body with the endpoint secret and a bounded timestamp. `Webhooks::verifyLocal()`
uses the separate local-forward protocol and its base64url byte secret. Native
webhook signatures authenticate the raw body without a timestamp.
`Webhooks::createFixture()` creates a body and matching native signature.
`ErrorCodes::KNOWN` lists the pinned API codes; `isKnown()` checks membership and
exceptions preserve unknown `errorCode` values.

`WhatsAppMedia::downloadStream()` and `media->downloadFromWhatsAppStream()` accept
a decoded descriptor or a webhook `{type, media}` pair. They return a read-once
`WhatsAppDownload` with a PSR body and attachment metadata. The default
`before-release` mode authenticates all plaintext before exposing any bytes.
Explicit `streaming` mode processes CBC, MAC and both hashes incrementally;
read through EOF to detect final integrity failures. `writeToFile()` writes a
private sibling and replaces the destination only after EOF succeeds. The
incremental path uses the same five independent crypto vectors as the buffered
path, with block/MAC split boundaries, cancellation and failed-file checks.

`events->stream()` returns a synchronous iterator with cursor resume and optional
manual acknowledgement. Pass `EventStreamOptions` as `streamOptions` to set
reconnect delay bounds in seconds and observe retention gaps or reconnects.
The stream reconnects after expiry, dropped connections and missed heartbeats;
revoked credentials and invalid cursors fail. Closing it or cancelling its
request token ends iteration gracefully. Payload bodies decode to typed webhook
events when retained. A missing payload remains `null`.

`events->liveSource()` adapts retained webhook bodies to application listeners.
`subscribe()` creates a subscription; the application drives `pump()` until it
closes or its cancellation token ends. The adapter skips missing bodies, passes
the cursor beside each delivery, and reports terminal errors through `onError`.
`close()` releases the active response body. It installs no background scheduler.

`operations->wait()` bounds each long-poll request and its retries by the
remaining wait budget, with a one-second allowance for the final state read.
An exhausted budget returns the latest observed state when available; caller
cancellation always propagates.

## Campaign follow-ups (beta)

Both campaign resources accept a `followUp` array on create or update. Omit it to
leave the setting unchanged, or send `null` to remove it from an unlaunched draft.
PHPStan's `CampaignModels` types include `FollowUp`, the text/template
`FollowUpMessage` union, `FollowUpStatus`, `FollowUpSummary` and `FollowUpReport`.

```php
$client->campaigns->update($projectSlug, $campaignId, [
    'followUp' => [
        'message' => ['type' => 'text', 'text' => 'Hi {{first_name}}, still interested?'],
    ],
]);
```

For a template, use `['type' => 'template', 'templateId' => $templateId]`.
The first delivery starts the delay; the first read restarts it before sending
starts. Replies and opt-outs cancel the follow-up, and expired waits never send.
`delaySeconds` accepts 60 through 604800 and defaults at the API to 86400.
`expirySeconds` accepts 86400 through 2592000, defaults to 604800, and must exceed
the delay. Expiry starts at the first send. Returned timing fields stay optional.
The campaign must send a single first message; follow-up text cannot contain
tracked links. The API enforces beta enrollment and returns
`403 feature_unavailable` when the team is not enrolled.

Each recipient's nullable `followUp` includes its status, receipt anchor,
due/expiry times and reason. Analytics `followUps` counts outcomes separately
from first-message counts; it is optional on Messaging and required on Platform.
Follow-up timestamps are Unix milliseconds. Native fixtures and PHPStan consumer
checks verify the merged contract; no live follow-up campaign or publication was
exercised.

## Raw JSON and pagination

`RawClient::request()` returns any successful JSON value, including objects,
arrays, strings, numbers, booleans and null. Objects decode to associative arrays.
Typed resource methods continue to require object response envelopes. Raw calls
still reject HTML, invalid JSON, unauthorized project paths and reserved headers.

`RawClient::paginate()` accepts a decoder for the endpoint's response shape.
Return `['items' => $items, 'nextCursor' => $cursor]`; omit the cursor or return
null to end pagination. `RawCursorPage<T>` retains the raw response and metadata,
provides `nextPage()`, and loads subsequent pages lazily when iterated. Set the
`cursorParameter` argument for a custom query key. Request bodies, options and the
bound project apply to every page. Repeated or malformed cursors fail.

```php
$page = $project->raw->paginate('GET', '/events', static function ($body, $metadata) {
    if (!is_array($body) || !isset($body['data']) || !is_array($body['data'])) {
        throw new RuntimeException('Expected an event collection.');
    }
    return ['items' => $body['data'], 'nextCursor' => $body['page']['nextCursor'] ?? null];
});
foreach ($page as $event) {
    // Consume one event. Further pages load as iteration advances.
}
```

Use typed resource methods when they represent the endpoint. Raw decoders are
application-owned. `GraphTransport::headers('official_api')` produces the
`X-Polymorfa-Transport` request header; it also accepts `linked_devices` and `auto`
and rejects other values. Pass its result through `RequestOptions(headers: ...)`.
This header selects routing; API permissions and transport eligibility still apply.

### Local upload encryption

`MediaEncryption::encrypt()` returns encrypted bytes and `EncryptedMediaInfo`.
`MediaEncryption::chunks()` consumes a PSR-7 stream incrementally and yields
ciphertext chunks with bounded working memory. Its generator return value is
the final `EncryptedMediaInfo`. Supported kinds are `image`, `video`, `audio`,
`ptt`, `document` and `sticker`. The helper creates a cryptographically random
32-byte media key; the default plaintext limit is 256 MiB.

```php
$encrypted = \Polymorfa\MediaEncryption::encrypt($plaintext, 'image', mimeType: 'image/jpeg');
// $encrypted->ciphertext includes its ten-byte MAC. Keep the media key private.
```

To verify an immutable repeat pass, give `chunks()` the first pass's `mediaKey`
and `EncryptedMediaInfo` through its `expected` argument. It checks source EOF,
plaintext/encrypted hashes and lengths before yielding the final ciphertext
block and MAC. Changed sources, cancellation, premature reads and size overruns
fail without a complete upload body. The caller owns and closes the source,
and must discard partial output after failure. The helper performs local
encryption; it does not finalize a CDN upload or send a message. Debug and JSON
serialization redact media keys and ciphertext. Independent vectors,
block-boundary round trips and repeat-pass failure tests cover all six kinds.

### Encrypted upload egress

Use `$client->whatsappMedia->uploadBytes()` for a string or `upload()` with a
closure that returns a fresh immutable PSR-7 plaintext stream. The factory
accepts the optional `CancellationToken`; its reads must honor cancellation
and bounded timeouts. The SDK closes streams it opens.

```php
$result = $client->whatsappMedia->uploadBytes('session', $plaintext,
    new \Polymorfa\UploadWhatsAppMediaOptions('image', mimeType: 'image/jpeg'));
// Keep $result->info->mediaKey and $result->location private.
```

Egress defaults to `relay`, which forwards ciphertext plus its MAC through the
session's connection. Choose `egress: 'direct'` to request a short-lived grant
and upload from your process. Upload endpoints receive encrypted bytes and
hashes; they do not receive plaintext or the media key. Results redact keys
and locations in debug and JSON output.

Direct uploads preserve grant parameters, refresh a rejected 401 grant, resume
ordinary uploads and retry connection errors, 408 and server errors except
507. Redirects are refused. Documents above 50 MiB use consecutive byte ranges;
the final part and `final_hash` are sent only after the repeat pass reaches EOF
and verifies both hashes and lengths. One part is buffered for stable retries;
`documentPartSize` accepts 1 byte to 64 MiB. CDN requests omit API credentials,
cookies, default client headers and caller headers. The direct operation's
timeout covers all requests and response-body reads. Timeout or cancellation
does not undo an upload already accepted by its provider.

`createUploadGrant()` and `relayUpload()` support applications that supply their
own encrypted-body factory and own its integrity checks. These methods select
API revision `2026-10-14` by default; existing methods retain `2026-09-22`.
The additive contract must be enabled and available in the target environment;
a source checkout does not establish customer access.

### Sending uploaded media

Convert an upload using `WhatsAppMediaSendDescriptor::fromUpload($upload)` and
pass the descriptor object to the matching message content:

```php
$descriptor = \Polymorfa\WhatsAppMediaSendDescriptor::fromUpload($result);
$client->messages->send('session', ['conversation' => ['id' => 'conversation'],
    'content' => ['image' => ['descriptor' => $descriptor, 'caption' => 'Photo']]]);
```

Image, video, file, voice and sticker content accept typed descriptors; voice
notes also set `ptt` to true. `WhatsAppMediaSendMetadata` supplies optional
thumbnails, dimensions, duration, waveform, key timestamp and sticker animation.
Stickers require `image/webp`. URL/base64/MIME inputs are exclusive with a
descriptor. Keys and hashes stay binary locally and use standard base64 on the
wire. Response descriptors are typed objects and redact debug/JSON output;
`toWire()` explicitly returns secret fields and must not be logged.

Descriptor sends select `2026-10-14` unless explicitly overridden. Ordinary
sends retain the existing API default. Standard sends transmit the media key to
Polymorfa; customer key custody requires the application's sidecar path.

### Local history chunks

`HistorySyncCodec::download($input)` accepts a `HistorySyncChunkDescriptor` or
compressed inline bytes. It verifies the encrypted SHA-256, MAC, compressed
SHA-256 and optional length before inflating or invoking your decoder. CDN
requests exclude API credentials. Compressed and inflated limits default to
256 MiB and 512 MiB; choose smaller bounds for your PHP process. Gzip, zlib and
raw deflate are accepted. Truncation, trailing bytes, invalid wire fields and
size overruns fail. Cancellation is checked during download and inflation.

`HistorySyncData` keeps exact `protobuf` and every wire field, including unknown
fields and groups. It exposes core metadata, chat IDs and raw message protobuf;
unsigned message order varints remain bytes, avoiding PHP float conversion.
The handwritten core view does not replace the full WhatsApp proto2 schema.
Pass `decoder: fn(string $verifiedProtobuf) => ...` for your complete model;
the original bytes remain available. PHP's official generator does not support
this proto2 schema, so the SDK does not silently convert it to proto3. All history
objects redact debug and ordinary JSON output. Decoding alone performs no
storage write, event acknowledgement or CDN deletion.

`$client->historySync->requestChunkRetry()` asks the phone for a fresh chunk;
`deleteChunk()` explicitly deletes a processed CDN blob after durable local
storage. Both require server credentials and default to `2026-10-14` per request.
The API enforces session authority, consent and availability. Delete takes a
32-byte binary encrypted hash and sends standard padded base64. Commands do not
retry automatically. Timeout or cancellation does not undo an accepted effect.

### Customer-hosted D1 binding

`Polymorfa\Storage\D1Bridge` implements the storage-only `Adapter` interface for
a customer Worker using the atomic D1 binding. Supply its URL, fixed authority,
table prefix and a separate application secret. HTTPS is required except on
loopback. A fresh signed handshake must confirm schema 2, identity, atomicity and
bounds before capability is exposed. Setup requires the Worker's explicit
permission. `get()`, `query()` and conditional `commit()` validate schema, row
identity and revision, query scope/order and conflict IDs.

Fresh request nonces bind method/path/exact body; response signatures bind the
nonce/status/exact body. Wrong authority, prefix, schema, capability, nonce or
body fails closed. Redirects and automatic retries are disabled. Bounded reads
and operation deadlines cover response bodies. A delete without an explicit
revision requires a same-session CAS lease write in the same atomic commit.
Endpoint URLs and secrets stay out of errors, debug output and ordinary JSON.

The producer is pinned to
`9ae35e671f7f4868a67c1562422c5af9284b95c1`. Administrative D1 REST is not advertised
as atomic. Native PHP HTTP tests exercised the actual bundled Worker/Miniflare
D1 binding with all-entity fixtures, 2,000-row paging, rollback, lease-fenced
deletion and checkpoint CAS. Repeat the opt-in proof using
`POLYMORFA_D1_BRIDGE_FIXTURE_URL`; the Docker test transport can use
`POLYMORFA_D1_BRIDGE_FIXTURE_HOST` to reach the host fixture. The adapter persists
rows only; the shared engine below owns reducers and merge/replay policy. Provider adapters
and their native proofs are listed below.


## Customer-owned Signal service client

The server-side sidecar client consumes the application HTTP contract pinned to
`8aa191ef0d4c318229c91bcdf474bf2d79dac47c`. The separate application bearer secret
is not a Polymorfa API credential. Device keys remain with the customer-operated
Signal service; the SDK imports no Signal core and uses no FFI. Require HTTPS
except on loopback. Redirects, credential cookies and automatic retries are
refused. Request deadlines and caller cancellation do not undo a send or ACK.

Create `new SignalSidecarClient($serviceUrl, $applicationSecret)`. Use
`health()`, `sessions()`, `send()` with `SignalSendRequest`, and
`events($sessionId, $cancellation)`. Iterate the returned stream and close it.
`SignalMediaDescriptor::fromUpload($upload)` converts a completed local media
upload into a secret-bearing send descriptor, including PTT audio.

An SSE connection delivers each record immediately and validates its ID, event
type and requested session. The SDK retains exact JSON and protobuf bytes,
including unknown fields; history notification enums remain nullable integers.
There is no cursor, automatic reconnection or automatic ACK. Durably persist
an event and its effects before calling `acknowledge()`.

`SignalWebhooks::constructEvent()` verifies the timestamp window and HMAC of the exact raw
body. `SignalWebhooks::process()` requires a persistence callback
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


## Schema2 engine, reducers and synchronization

`Polymorfa\Storage\Engine` wraps a durable `Adapter` with the shared merge,
deduplication, lease and checkpoint policy. Pass a typed `Batch` containing
`Upsert`, `Patch`, `Delete`, `ClearChat` or `Checkpoint` operations and versioned
`FieldWrite` values. `expectedCursor: Unspecified::Value` skips the checkpoint assertion;
`expectedCursor: null` explicitly requires no saved cursor. Customer applications
own database access, namespace isolation, retention and row contents.

Each field merges by version and a deterministic value tie-breaker. Revoked
content and media references use a final version so older history cannot restore
them. Every payload chunk reserves a slot for the same-transaction lease CAS;
release advances its durable revision. Between bounded planning reads and clear-query
pages, the engine conditionally renews at half its lease TTL. Expired or replaced
leases remain rejected before data or the event marker can commit. The first failed chunk stops later data
and the final event marker, including failures without conflict IDs. Large events
can partially commit and recover through replay before the marker is saved.
Clear-chat deletes media, reactions, receipts and votes with messages, while a
stored chat watermark rejects equal or older late copies.

`EventReducer::reduce($verifiedEvent)` covers the documented chat-data events;
calls, campaigns, billing and presence do not enter chat storage.
`HistoryReducer::reduce(...)` consumes complete decoded protocol arrays.
When passing `HistorySyncData`, provide its complete-schema decoder-hook result;
the minimal built-in protobuf view is rejected. Keep the codec's original
protobuf bytes when unknown fields must remain available. Local decoding and
reduction never enable the Signal service's history consent.

`WebhookHandler` applies verified events and can call the customer's local
history decoder. `new Sync(new ApiEventSource($project->events), $engine)` creates
a cooperative consumer: call `pump()` to run and `close()` to stop it. It resumes
from the durable checkpoint and commits the event, checkpoint CAS, then manual
ACK. Missing required payloads, retention gaps and checkpoint conflicts stop
before advancing or acknowledging the affected record. No SDK helper logs data
or creates a hosted database.

PHP 8.2/8.4 native tests cover the portable event/history fixtures, 2,000-message
history, replay, permanent revocation, child deletion, lease expiry/replacement,
first-failed-chunk refusal and explicit-null checkpoint CAS. A native HTTP/SSE
fixture proves event persistence and checkpoint-before-manual-ACK order. The
opt-in signed Worker/D1 proof runs the same engine with actual atomic commits.


## SQL, document databases and ORM exports

Storage adapters use application-owned connections and trusted namespace/table
prefixes. Call `setup()` before constructing `Engine`; capabilities remain
unavailable until the adapter verifies its storage contract. Setup refuses an
incompatible version marker. Closing an adapter preserves borrowed client and
connection ownership. Database errors omit URLs, credentials and provider bodies.

`SqlAdapter::pdo($pdo, tablePrefix: 'polymorfa_')` supports PDO PostgreSQL, MySQL
and SQLite. Enable PDO exception mode and install the matching PDO extension.
Do not pass a connection with an active application transaction. All conditional
writes execute in one native transaction; MySQL additionally verifies strict SQL
mode and InnoDB for every storage table. `SqlSchema::statements()` exports the
same schema2 columns and indexes. Actual PostgreSQL 16, MySQL 8.4 and SQLite
proofs covered the portable fixtures, 2,000 messages, rollback, checkpoint CAS,
stale-lease refusal and borrowed-transaction preservation on PHP 8.2 and 8.4.
Customer Supabase/Neon PostgreSQL and compatible PlanetScale MySQL connections
use these drivers; their hosted services were not exercised by local tests.

`SupabaseSchema::sql()` exports customer-installed PostgreSQL schema and FORCE RLS
policies. A distinct server writer receives data writes and version reads;
browser readers receive SELECT only for sessions with live `auth.uid()`
membership. Restricted native PostgreSQL roles verified membership revocation
and browser write refusal. The SDK never installs this preset automatically or
gives a browser the writer credential.

Optional document adapters use the official packages installed by the customer:

| Adapter | Official client | Atomic commit limit |
| --- | --- | --- |
| `MongodbAdapter($client, $database, $namespace)` | `mongodb/mongodb` with the MongoDB extension and a replica set | 500 |
| `DynamodbAdapter($client, $namespace, $table, createTable: false)` | `aws/aws-sdk-php` | 100 |
| `FirestoreAdapter($rpc, $namespace, $projectId, $databaseId = '(default)')` | `google/cloud-firestore` 1.55.0 typed V1 RPC client with gRPC 1.84 | 250 |

MongoDB uses snapshot/majority transactions. DynamoDB requires an active table
with string `pk` and `sk` keys. Firestore uses the official
`Google\Cloud\Firestore\V1\Client\FirestoreClient` typed RPC boundary, with
explicit project and database IDs. It reads conditional rows before an atomic
Commit RPC and preserves raw protobuf map values, including numeric object keys.
The engine reserves one commit slot for its lease. High-level snapshot and
BulkWriter APIs are not interchangeable with this verified boundary.

MongoDB and Firestore persist raw schema2 rows with exact encoded document IDs.
DynamoDB stores `{pk: namespace+":"+entity, sk: encodedKey, row}`. These physical
layouts match the shared storage contract; JSON null, booleans, numbers, empty
objects and empty lists retain their distinctions. Native replica-set, DynamoDB
Local and Firestore emulator tests verify portable fixtures, 2,000-message
history, replay, rollback, checkpoint CAS, stale lease fencing and client ownership.
The accepted PHP matrix excludes Convex, Cosmos DB and IndexedDB.

`EloquentSchema::models()` exports application-owned Eloquent query-model source
for all schema2 entities. `EloquentSchema::adapter($connection)` borrows the
connection's PDO boundary and rejects an active transaction. Install
`illuminate/database` separately. Use read-only database credentials for ORM
queries and write synchronized state through the engine; generated model guards
do not constrain arbitrary query-builder SQL. Illuminate 12 with actual SQLite
verified model casts and engine/model interoperability.

The optional technical-preview `LibsqlDriver($connection)` accepts an official
`turso/libsql` connection, pinned at
`4f6c5669ee844074865a1ea4935d5440ebd28571`. It requires PHP 8.3 or newer and FFI;
install it separately so its eager FFI autoload does not affect PHP 8.2 core
applications. Pass it to `new SqlAdapter($driver)`. Actual file and HTTP libSQL
proofs verified full fixtures, 2,000 messages, rollback, checkpoints and preserved
borrowed transactions. The boundary executes checked transaction statements;
it does not infer atomicity from an HTTP batch response. Other libSQL PHP
packages are not interchangeable with this verified driver.

Optional proof inputs are `POLYMORFA_STORAGE_SQL_FIXTURE` (and Docker host override
`POLYMORFA_STORAGE_SQL_HOST`), `POLYMORFA_SUPABASE_NATIVE_FIXTURE`,
`POLYMORFA_STORAGE_PROVIDER_AUTOLOAD` with
`POLYMORFA_MONGODB_NATIVE_FIXTURE`, `POLYMORFA_DYNAMODB_NATIVE_FIXTURE` or
`POLYMORFA_FIRESTORE_NATIVE_ENDPOINT`,
and `POLYMORFA_LIBSQL_NATIVE_AUTOLOAD` with optional
`POLYMORFA_LIBSQL_NATIVE_URL`. Without those task-owned clients and endpoints,
the suite reports the corresponding native proof as skipped. Local server and
emulator checks do not establish cloud permissions, hosting or deployed access.


## S3-compatible media storage

`new S3MediaStore($s3Client, $bucket, $prefix)` borrows an optional official
`Aws\S3\S3Client` configured for the customer's AWS, R2 or MinIO bucket.
`uploadToWhatsApp($client->whatsappMedia, $session, $key, $uploadOptions)` uses the
existing encrypted upload options. It requires an ETag and known bounded length,
then makes two `IfMatch` reads of that object. Changed sources fail before an
upload POST or multipart finalization. Media encryption and upload retain their
local final-hash barrier.

`archive($descriptor, new S3ArchiveOptions(key: $key, scratchDirectory: $directory))`
also accepts a decoded `{type, media}` input. It verifies and decrypts into a
private file before any S3 PUT, checks the known plaintext length, then writes
that verified file. Integrity, length and pre-PUT cancellation failures leave
existing objects unchanged. Cancellation during an admitted PUT cannot guarantee
rollback.
The SDK removes its own spool and preserves other files in the scratch directory.
Optional metadata uses bounded ASCII; media kind, plaintext hash and encoded
filename are added automatically. Media keys and credentials must not be metadata.
The store redacts debug/JSON output, and `close()` preserves the borrowed AWS client.

`S3ArchiveOptions::requestOptions` and the upload options' `RequestOptions` bound
operation time and cancellation. Native S3 requests disable redirects and redact
upstream diagnostics. Actual PHP 8.2/8.4 MinIO tests cover relay, direct and
multipart uploads, same-ETag reads, real 412 refusal without finalization,
verified archives, corruption/known-length/cancellation/deadline refusal, private
spool permissions and cleanup, metadata and borrowed-client behavior. Repeat with
`POLYMORFA_S3_NATIVE_FIXTURE` and `POLYMORFA_S3_NATIVE_SCRATCH`, plus the optional
provider autoload path. These tests do not establish AWS/R2 account permissions,
cloud hosting availability or live WhatsApp delivery.


`UploadWhatsAppMediaOptions::uploadTransport` accepts a customer implementation
of `WhatsAppMediaUploadTransport` with `name()` and `upload($session, $body)`.
The `WhatsAppEncryptedUploadBody` exposes readonly `mediaType`, `fileEncSha256`
and `encryptedLength`, plus `open(offset: 0, cancellation: $token)`. It exposes
no plaintext, media key or API credential. Each opening retains the final
EOF/hash barrier, and a later integrity failure remains fatal even if the
callback ignores it. The SDK requires complete verified encrypted consumption,
closes abandoned streams and refuses to reopen a finished body. Callback errors
become safe SDK exceptions without their raw cause.

`$client->whatsappMedia->uploadTransport('relay', $options)` and its `'direct'`
variant return reusable built-ins for a custom transport to wrap. Pass fresh
builtin options without an `uploadTransport` value. These wrappers retain the
existing grant, credential isolation, retry/resume and finalization policy.
The custom callback owns its endpoint and must finalize only after its encrypted
read succeeds. Native TLS tests cover custom bytes and offsets, wrapped
relay/direct uploads, incomplete consumption, ignored failure, blocked-source
deadlines, cancellation, redaction and extension forwarding through S3 uploads.

### Campaign, profile and future custody helpers

This development source adds typed helpers for the `2026-10-14` contract.
They select that version when `RequestOptions::apiVersion` is omitted and
preserve explicit overrides. The package-wide default remains `2026-09-22`.
These additions are unpublished and do not establish feature availability.

Messaging campaign helpers include `links`, `testSend`, `createReplyFlow`,
`getReplyFlow`, `setReplyFlow` and `exportRecipients`. They require an
organization API key or Project token. Platform `campaigns` exposes the
matching helpers plus `listLaunchApprovals` and organization-only `getSettings`.
A Project view exposes exactly the seven Project campaign helpers, with the
Project captured by its readonly resource. It rejects caller-supplied Project
selection fields.

```php
use Polymorfa\{Client, Credential, RequestOptions};

$platform = new Client(Credential::organizationApiKey(getenv('POLYMORFA_API_KEY')));
$project = $platform->project($projectId);
$sent = $project->campaigns->testSend($campaignId, [
    'sessionId' => $sessionId,
    'to' => '+15555555555',
    'variables' => ['first_name' => 'Ada'],
], new RequestOptions(idempotencyKey: $logicalTestSendId));

$page = $project->campaigns->exportRecipients($campaignId, ['limit' => 1000]);
$csvBytes = $page->data->csv;
$nextCursor = $page->data->nextCursor; // Fetch another finite page explicitly.
```

CSV pages preserve server bytes, quoting and line endings. A filtered export
cannot use a cursor or a limit below 1000. Exports require a `text/csv` HTTP200
response and never follow redirects. Cancellation is checked before and after
body consumption and at reads; an underlying blocking read remains bounded by
the configured read timeout. Cancelling an HTTP waiter does not undo an
admitted operation.

Organization clients also expose `audiences->createFromCampaign`,
`audienceProfiles->{list,retrieve,put,delete,listConsent}` and
`audienceProfiles->imports->{create,retrieve,cancel}`. Profiles contain
customer-supplied campaign data. They do not synchronize WhatsApp contacts.
Profile and consent lists return one finite page. Imports accept canonical
standard base64 containing at most 10MiB of UTF-8 CSV, with a 14MiB compact JSON
request limit. An import replay key is distinct from the HTTP idempotency key.
`optOuts->{getConfirmationSettings,updateConfirmationSettings,getConfirmationSummary}`
preserves explicit `false`, nullable locale and revision guards. A consent
assertion never overrides an opt-out or authorizes a send.

`projects->{getSignalCustody,updateSignalCustody}` and
`customers->{getSignalCustody,updateSignalCustody}` select future reservation
defaults. A Project view provides `signalCustody->{retrieve,update,retrieveCustomer,updateCustomer}`.
Customer `signalModeDefault:null` restores inheritance; Project updates require
`standard` or `zero_knowledge`. These settings do not convert an existing
Number's custody or move Signal keys.

New request models reject unknown fields, invalid nulls and incompatible
variants before HTTP. Empty dictionary fields encode as `{}`; lists encode as
`[]`. Successful responses validate JSON object/list identity and required
nullable fields before becoming the package's PHP array shapes. Unknown
response extensions survive. The public aliases live in
`CampaignContractModels`, `AudienceProfileModels` and `SignalCustodyModels`.

Test-send creates one idempotency key per logical call when omitted. Other new
writes default to one attempt; explicit retry choices remain available. Captured
request bytes and selected query/header values remain stable across retries.
For manual retry of one logical effect, retain the original explicit key.
`Idempotency-Key` remains a reserved custom header; use the
`RequestOptions::idempotencyKey` property. Exceptions expose remote `param`
separately from local `ConfigurationException::field`. Safe metadata includes
trace ID, replay disposition and content disposition, without arbitrary headers.

These methods preserve API authentication, membership, enrollment, funding,
consent and feature gates. They add no QuickLink invitation authority, browser
tunnel transport or customer Signal-core implementation.

### Changed campaign, session and history contracts

Campaigns expose `trackedLinks`, required nullable `experimentOutcome` and
`followUp`, and optional nullable `variableMapping`. Create accepts a mapping;
PATCH also accepts `templateId: null`, `variableMapping: null` and
`trackedLinks: null`. PHP uses associative arrays for maps. Numeric keys such as
`'0'` and empty bindings `[]` are encoded as JSON objects. Lists stay arrays.
Platform `messagesArray` accepts open composed message shapes, including an
empty draft object. Platform PATCH remains open. Its body cannot replace the selected `projectId` or path `id`. Launch takes a closed request
with `projectId`, optional `scheduledAt` and `skipMissingVariables`.

Recipient lists accept `reason`, `status`, `cursor` and `limit` together. Their
required nullable timing and failure fields retain null; `messagesSent` retains
zero. Analytics retain null timing measurements and required follow-up reports.
Request limits do not apply to normalized campaign responses.

Existing methods keep the default `2026-09-22` API version. A new QuickLink
`signalMode`, descriptor delivery setting or exact `historySync.delivery` reset
selects `2026-10-14` only when `RequestOptions::apiVersion` is absent. An explicit
version is preserved. A whole `historySync` reset stays on the legacy version.
Read delivery can be `archive` or `descriptor`; writes accept `descriptor`.
Session `signalMode` is an optional immutable response fact. Supplementary
QuickLinks require `session` and `addConnection` and cannot change initial
Customer, external ID, billing controls or custody. Consent and API admission
remain separate from requested delivery.

Use `RequestOptions::idempotencyKey`, never a custom `Idempotency-Key` header.
Recipient and audience-member appends run once by default, including when a key
is supplied. Select `maxNetworkRetries` explicitly to authorize retries. Those
retries reuse the captured body and caller key. Audience create retains its
ordinary keyed retry policy; lifecycle operations retain their existing keys.

Scoped Client credentials support relay uploads and custom encrypted transports.
Direct uploads and public `createUploadGrant` require server credentials. History
retry/delete also require server credentials and canonical success responses.
`deleteChunk` accepts a binary 32-byte hash and returns its typed `ApiResponse`.
Sticker sends require a WebP descriptor; returned message IDs remain strings.

`WebhookModels::KnownEvent` includes projected descriptor history with exactly
one of `media` or `inline`, alongside archive and Cloud payloads. Signed/verified
parsing narrowly validates descriptor history; `knownEvent()` is a typed view,
not a general event schema validator. Raw forward fields remain available. Use
`whatsapp_ids` for chunk correlation. Never log key-bearing descriptors.
PHPStan uses structural array shapes and can accept excess keys that runtime
validators reject. Runtime guards also protect owner selection and closed inputs.

These SDK contracts do not grant hosted invitation, Console setup, feature
evaluation/enrollment, Signal custody, browser-tunnel, billing or approval
authority. Package installation does not establish feature or API availability.
Generic JSON redirect policy, framework raw-body bounds and numeric-reducer
parity remain separate work. Compressed-history validation and descriptor storage
dispatch are described below.

## Strict compressed history support

History decoding accepts one complete gzip, zlib or raw DEFLATE stream. It
requires stream end and exact consumed input before protobuf parsing, rejecting
tails, concatenated streams, truncation, dictionaries, reserved gzip flags and
corrupt checksums. Required protobuf fields remain enforced, so complete empty
output is a protobuf refusal. Compressed and inflated limits remain unchanged.

The tested PHP 8.2.34 and 8.4.26 native zlib runtimes accept the retained complete
1 MiB filename plus 1 MiB comment header. The SDK adds no separate name/comment
cap. This is a tested boundary, not unlimited-header or all-platform support.
Independent public controls also cover stored, fixed, dynamic and multiple blocks,
valid final-byte padding, exact byte caps and quota with a later corrupt trailer.

Cancellation is cooperative between inflate steps and through the existing HTTP
callbacks. It does not interrupt a synchronous native call. A stalled synthetic
cURL download can report cancellation only when the transport returns; the local
control reached the existing 30-second HTTP timeout. No real-time cancellation
guarantee follows. Authentication still precedes compressed/protobuf parsing.
Signed archive storage controls use an application projection of common fields;
they do not establish descriptor dispatch or generic full-schema storage. Local
archive tests do not establish registry publication or live availability.

### Descriptor history storage

`WebhookHandler` and `Sync` keep `decodeHistory` archive-only, with its original
event argument and nullable progress-only result. Use the separate named
`decodeHistoryDescriptor` callback for validated projected media/inline payloads:

```php
$handler = new WebhookHandler(
    $storage,
    decodeHistoryDescriptor: static function (array $descriptor, WebhookEvent $event): array|HistorySyncData {
        return downloadDecodeAndProjectAuthorizedHistory($descriptor, $event);
    },
);
```

The application defines this function and owns authorized download, key custody,
full-schema decoding and projection. `HistorySyncCodec` verifies bytes and accepts
a caller's complete-schema codec. Storage never downloads media itself. The new
callback must return a non-null array projection or fully decoded `HistorySyncData`.
A legitimate empty array is allowed. Missing, null, failed or invalid descriptor
decoding fails before progress, event marker, checkpoint or ACK. Callback error
details are omitted because they can contain descriptor secrets.

The default is `historyDescriptorMode: HistoryDescriptorMode::Decode`. Explicit
`HistoryDescriptorMode::MetadataOnly` validates and consumes progress and the event
marker, skipping all decoders even when configured. Sync then saves the cursor and
ACKs. Ordinary replay cannot import this event later, because it is deduplicated.
There is no automatic backfill or marker deletion. Valid duplicate descriptors
skip decoders before checking availability. Descriptor notification IDs never map
individual messages; existing native `wa:` fallback identities retain their
joining limits. Content/marker commit precedes checkpoint CAS and manual ACK.
Remote ACK failure leaves completed storage intact. Archive and Cloud behavior
remain unchanged. This change establishes local package behavior, not registry
or deployed availability.

Decoded-history numeric strings follow the producer's finite `Number(string)`
contract, including exact ECMAScript whitespace and unsigned radix values beyond
uint64. Radix conversion keeps a bounded 53-bit prefix, guard and sticky bits,
then rounds once to nearest even; GMP and BCMath are not required. Generic row
numbers, safe revisions and fenced CAS remain strict. Shared vectors, native
SQLite and local archive consumers establish local compatibility only. Registry
publication and matching environment acceptance remain separate gates.

Ordinary JSON requests require HTTP 200-299 before body reading or decoding.
Final informational and redirect responses fail as `invalid_response`, retaining
safe status/request metadata and closing the body without a follow or retry.
Direct binary media uses its separate validated redirect policy.
