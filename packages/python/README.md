# Polymorfa Python SDK

Handwritten asynchronous server client for Python 3.10 or newer. The local
package is not published. `coverage.json` records implemented and excluded
operations against TypeScript source `ff51567105b64bf6997e7330ba8eb502d875e7b9`.

```python
import asyncio
import os
from polymorfa import AsyncMessagingClient, Credential, RequestOptions


async def main():
    credential = Credential("organization_api_key", os.environ["POLYMORFA_API_KEY"])
    async with AsyncMessagingClient(credential) as client:
        result = await client.messages.send(
            "support",
            {
                "conversation": {"phoneNumber": "+15551234567"},
                "content": {"text": "Hello"},
            },
            options=RequestOptions(idempotency_key="my-stable-send-id"),
        )
        print(result.metadata.request_id)


asyncio.run(main())
```

Use `AsyncClient` for organization Platform operations, and
`client.project(project_id)` for an immutable project binding. Initialize
`AsyncProjectClient` directly with a project token. A project client refuses
rebinding and confines `raw.request` and `raw.paginate` paths to its bound project. A project
view shares its organization's connection pool. Closing that view or leaving its
context keeps the pool open; close the root after all views have finished.
A directly constructed project client owns and closes its pool.

Every response has `data` and `metadata` (status, request ID, API version,
headers and attempts). Messaging methods retain API envelopes. Developer
Platform resources unwrap the envelope. Unknown response fields remain
available. HTTP failures raise semantic exception classes with code, request
metadata and API links. Non-JSON proxy errors become a safe HTTP error. JSON API requests reject 3xx
responses without following or retrying them; media downloads use their separate
validated storage redirect path.

`RequestOptions` changes timeout, version, retry count, headers and idempotency
for one request. Cancelling an asyncio task interrupts the request or stream.
Safe reads and explicitly keyed writes retry at most twice by default.
Message sends and reactions create an idempotency key once when one is
omitted. Replayed responses are final. Configure `base_url`, `proxy` or
`http_transport` on construction. Credentials are refused in browser/WASM
runtimes. Default API version is `2026-09-22`.

`construct_webhook_event(raw_bytes, signature, secret)` checks HMAC-SHA256
before parsing JSON. Read the exact request bytes in your framework. Unknown
event types preserve their payload and set `known=False`. Native webhook
signatures have no timestamp/replay checks; deduplicate verified event IDs in
your durable store. `events.stream` reconnects with the last delivered cursor;
cancel the consuming task to stop it. `CursorPage` supports `next_page()` and
`async for` with cursor-loop detection.

`raw.request` returns arbitrary JSON, including lists, scalar values and null.
Typed API resources keep their object-envelope checks. For a custom page shape,
use `raw.paginate(method, path, decode, cursor_parameter="after")`. The decoder
receives JSON and response metadata and returns `PageResult(items, next_cursor)`.
`RawCursorPage` supports `next_page()` and `async for`, preserves the original
method, body, options and other query values, and refuses repeated cursors.

```python
from polymorfa import PageResult
from polymorfa.transport import Json, ResponseMetadata


def decode_rows(value: Json, metadata: ResponseMetadata) -> PageResult[str]:
    if not isinstance(value, dict):
        raise ValueError("Expected a row page")
    rows = value.get("rows")
    cursor = value.get("after")
    if not isinstance(rows, list) or any(not isinstance(row, str) for row in rows):
        raise ValueError("Expected string rows")
    if cursor is not None and not isinstance(cursor, str):
        raise ValueError("Expected a string cursor")
    return PageResult([row for row in rows if isinstance(row, str)], cursor)


# Within your async application, using a route your API exposes:
# page = await client.raw.paginate("GET", "/your-route", decode_rows,
#                                  cursor_parameter="after")
# async for row in page:
#     print(row)
```

Seen, typing, reaction and star request targets require at least one of `id`,
`phoneNumber` or `bsuid`. The typed requests reject an empty target and fields
with the wrong value type. Presence catalogs are exported as immutable
`PRESENCE_STATES`, `PRESENCE_OBSERVATION_STATUSES`, `PRESENCE_UNKNOWN_REASONS`
and `PRESENCE_CHAT_STATES` tuples.

Platform campaign list, retrieve, create and update return dictionary-compatible
`campaign_models.PlatformCampaign` values. Read additional fields with
`campaign["field"]` and statically typed standard fields with
`campaign.known["id"]`. When updating code that previously treated every raw
response as a dictionary, narrow the returned JSON value before indexing it.
For statically typed Platform campaign field access, use `.known`.
For unnamed draft update fields, pass
`extra_fields={"field": value}` to `client.campaigns.update`; named fields stay
in its typed body. An extra field cannot replace a named campaign field.

`is_event(event, "message.received")` narrows the verified envelope to its typed
payload. Guards cover every known native event; payload types are available in
`polymorfa.webhook_models`. Message payloads retain their Linked and Official API
variants. Parsing preserves additional fields and unknown event payloads.

Run package checks with `uv sync --extra test`, `uv run ruff check`,
`uv run ruff format --check`, `uv run mypy --no-incremental src/polymorfa`,
`uv run pytest`, and `uv run python -m build`. These checks exercise local
request/response fixtures and native HTTP, TLS, WebSocket and framework hosts. They
do not establish production availability or registry publication.

`client.request_logs.list(project_id=...)` reads newest requests first;
`follow(after, project_id=...)` reads new requests oldest first. A project client
uses its bound project. `tail(backfill=20, interval_seconds=2, stop=event)` yields
backfill and new requests oldest first, follows queued pages immediately and waits
for `Retry-After` after a rate limit. Cancel the consuming task or set the asyncio
event to stop. A page keeps items, both cursors, `has_more` and response metadata.
Cursor pagination excludes filters; empty method/status lists send no filter.

`PARITY.md` and `supplements.json` record the public helper and supplemental
route evidence beyond the primary coverage manifest. Known privacy, testing,
voice and Calls values are exported as immutable tuples and mappings.

`client.client_tokens.mint` accepts either a session target or a Customer
ID, and `retrieve_rules`, `update_rules`, and `delete_rules` manage session
client rules. These methods require a server credential. Customer token
access remains subject to the API's beta eligibility and ownership checks.

`decode_whatsapp_media`, `download_whatsapp_media` and
`decrypt_whatsapp_media` support image, video, audio, document and sticker
payloads. Downloading requires a plaintext hash, validates encrypted hashes
and the media MAC, limits bytes, confines redirects to WhatsApp CDN hosts,
and uses a connection without API credentials. The media key is hidden in
object representations.

`download_whatsapp_media_stream` accepts a decoded descriptor or a message payload
with `type` and `media`. Its default `before-release` mode verifies the MAC and
hashes before yielding bytes. Explicit `streaming` mode yields bytes during
decryption; discard them if consumption fails. `download_whatsapp_media_to_file`
streams into a private sibling file and publishes it after verification.
`download_media_to_file` writes API media with request metadata. File helpers
support `overwrite=False`, byte limits, and cancellation cleanup.

`construct_local_webhook_event` verifies CLI-forwarded timestamp signatures with
a base64url forwarding secret and a default 300-second tolerance. Native
`construct_webhook_event` continues to verify the original bytes without a
timestamp. `create_webhook_fixture` produces a body, signature and headers for
testing either application adapter.
`verify_flow_forward_signature` checks decrypted Flow forwarding bytes using
the endpoint's signing secret and timestamp tolerance. It preserves the timestamp
text when constructing the signed input. `FLOW_FORWARD_SIGNATURE_HEADER` names
its header. `parse_content_disposition_filename` decodes RFC 8187 filenames,
removes directory segments and control characters, and returns a display name.
`AsyncCallRetentionClient` reads the team-wide setting using an team key
or a project token without requiring a project ID. Updates retain server-side
team-key authorization. `POLYMORFA_ERROR_CODES` and `is_known_error_code` expose
documented codes while errors preserve unknown future codes.

Install the `calls` extra to use `CallsClient`, `LifecycleSocket` or `MediaSocket`
with native WebSockets. `CallsClient` follows one session, exposes incoming calls,
and places direct, participant and group calls. A `Call` supports answer, join,
reject, leave, end, roster controls, reactions, hand state and PCM/H.264 media.
Its `sample_rate` comes from the media handshake. The client refreshes expiring
credentials, reconnects media with the same connection ID, and restores confirmed
media preferences. `set_media_state` uses an ordered queue of at most 16 commands;
an unacknowledged command fails after five seconds and is never replayed.
`CallsTokenSource` caches credentials with a 30-second expiry skew and keeps
one caller's cancellation from cancelling other waiters. `CallsToken.expires_at`
uses Unix epoch seconds. Socket credentials travel in authentication frames.
Technical diagnostics can be disabled with `diagnostics=False`.
Lifecycle `ready` and `candidates` queues preserve authenticated connection and
ICE metadata. `CallsClient.send_candidate` writes candidates on that connection.
An early accepted event survives queued participant changes; duplicate departures
keep their initial reason. Disconnecting ends pending `incoming_calls` iterators.
`call.audio.frames()` and `call.video.frames()` expose typed track subscriptions;
their `write` methods return false while no media is attached. Video tracks expose
source ownership, source changes and keyframe requests. Audio keeps its negotiated
sample rate after the call ends. Tracks share one native reader and bound each
subscriber to 256 frames. The optional mixed `receive_media` buffer keeps its last
256 frames while track subscriptions consume media.
Install the `fastapi` or `django` extras for framework examples;
`fastapi_webhook_event` and `django_webhook_event` verify the raw request body.
The FastAPI adapter streams at most 1 MiB before signature verification. Set
`max_body_bytes` to your application's limit. Oversized declared or streamed
bodies raise `ValidationError` with status 413 and code `webhook_body_too_large`;
map that exception to a 413 response in your route.
See `examples/python` in the source tree for executable application examples.
The `web_host` example runs FastAPI or Django with templates, HTMX and the existing
Web Components, including application sign-in, server-selected browser grants
and sign-out revocation.

`chats` exposes typed stored history pages, message media downloads, message
edits, archive controls and service-window observations.
`download_message_media_stream` returns a single-use stream with request metadata.
Hosted history requires the API's HMS enrollment and history permission; service windows
have separate Official API eligibility. `business` exposes profile,
catalog, product, collection, order, compliance and linked-account methods,
including asynchronous accepted response variants.

`voip` provides typed Calls REST controls, permission checks, participant
controls, call settings and quality/error reports. Call-link creation and
preview reject idempotency keys and never retry. Reactions and hand-state
changes also never retry. Other call writes retry only with an explicit
idempotency key. A browser client token cannot choose a server participant;
server-only link, permission, check and settings operations reject it.

`ban_safe` reads and changes project ceilings, warmup plans, insurance
evidence, health policies and Number overrides with server credentials.
Platform equivalents are under `AsyncClient.projects` and
`AsyncClient.sessions`. Entitlement and applied-state fields remain in the
response; configuring a setting does not grant access. Send the version
from a recent health-policy read when updating it.

Platform projects expose typed lists, creation, production enrollment and Hybrid
Link merge candidates. Platform sessions expose typed lifecycle batches, reviewed
tier quotes and capability variants. A quote preserves fractional credit amounts
and separates Hybrid Link transition progress from the tier change status.

Project templates use handwritten definitions for headers, buttons, carousels,
authentication and limited-time offers. Official API templates, linked catalogs,
marketing status and Flow public-key registration use their distinct provider
contracts. Provider template writes, template submission and Flow registration
send one request even when an idempotency key is supplied; reconcile an uncertain
result by reading provider state before sending another write.

Team call controls provide typed retention, blocked destination prefixes and a
cursor-paginated do-not-call list. Billing methods retain fractional credit
amounts, enforce UUID and revision bounds, and normalize ordered resource IDs.
Saving these settings uses the API's existing authorization and availability.

Organization metadata reads cover members, server key and project token metadata,
audit logs, bans and security incidents. Customer methods keep the project ID on
reads, provide cursor pagination, and distinguish the initial pairing-link URL
from the null URL returned after a replay.

Observation and Hybrid Link policy reads preserve inheritance and revisions.
Saved session and QuickLink defaults bind to the organization or project client.
Official API groups expose typed join decisions and force every provider change
to one attempt. Onboarding continuation and Testing methods require a server
credential; Testing phone methods expose simulated device and message results.
SIP trunks provide typed credentials and endpoint variants, with ownership checks
before an team key acts through a project client.

Retained events, webhook signing generations and delivery attempts expose typed
metadata and payload-availability states. Indexed event pages preserve offsets
and filters across pages. The event stream decodes retained payloads, resumes
from checkpoints, reports gaps and reconnects, and supports explicit
acknowledgements. Closing a stream interrupts a pending connection or body read.
Operations support typed transitions, long polling and bounded waits.
`event_stream_source(lambda cursor: project.events.stream(since=cursor))` adapts
the stream for application stores. `subscribe` delivers webhook envelopes with
cursor metadata and accepts synchronous or asynchronous listeners. Events with
no retained payload are skipped. Call the subscription to unsubscribe, or await
its `close()` method to wait for cleanup.

Messaging campaigns retain delivery timestamps, A/B outcomes and send windows.
Platform campaigns require the owning project on reads, report conversions in
separate currencies, and return nullable drafts. Recipient and audience appends
send once unless both a request key and a retry override are supplied. Platform
draft creation does not accept request keys or automatic retries.

Campaign create and update bodies accept a receipt-timed `followUp`, with text
or a template ID. The API enforces beta enrollment and requires a single first
message. Use `{"message": {"type": "text", "text": "Still interested?"}}` to
leave timing to the API defaults, or provide `delaySeconds` and `expirySeconds`.
Send `{"followUp": None}` to remove the follow-up from an unlaunched draft.
`campaign_models.FollowUp` keeps timing optional in both requests and returned
campaigns. Recipient `followUp` summaries retain nullable receipt times;
analytics `followUps` counts outcomes separately from the first message.

Project clients expose `functions` with deployments, secrets and invocations,
and `flows` with provider receipts, Number endpoints and encryption custody.
These resources bind every request to their project; inputs cannot replace it.
Writes and deletes send once. Function invocations require an explicit request
key, and a replay never returns the initial executor response. Forward Flow
endpoints return their signing secret once.

`AsyncSystemClient` probes status, version, health and ping without credentials.
`AsyncBridgeClient` requires a project token for regional route discovery.
QuickLink configuration includes simulated account fields, billing controls,
connection goals and history consent; status keeps request receipts separate
from delivery progress. Messaging webhooks retain typed retry and header fields.

Voice libraries support uploads, synthesis, previews and provider credentials.
A project client reads its own assets and may read team-wide provider credentials;
manage team-wide credentials through the organization client. Upload helpers send
file bytes without the API credential and omit the create request key on completion.
`wait_until_ready` cancels an active read at its deadline and returns ready or failed
assets. The API decides feature access.

Media supports `download_stream`, `download_file` and `download_url` alongside
buffered downloads. Streams are single-use asynchronous iterators and context
managers. Signed URLs stay out of object representations; storage requests omit
API headers. Cancelling the consuming task closes the active response body.

Composed message types cover text, attachments, polls, contacts, products,
interactive lists/buttons, dynamic Flows, templates and payment orders. Optional
context uses `quotedMessage`, `mentions` and `isForwarded`.

Platform `calls` exposes typed stored records and diagnostics, grouped statistics,
cursor pagination and CSV/NDJSON exports. `export_all` removes subsequent CSV
headers and refuses a repeated cursor before yielding its body. `analytics`
returns typed message, device, conversation and call aggregates and validates
Prometheus/OpenMetrics gauge exports. Project analytics keeps its bound route.
`usage` provides metered records and totals; metering does not establish charging.
Organization `ban_safe` exposes health, telemetry, collection, findings,
enforcement, incidents and claim evidence. The API owns access and applied state.

Customer-owned upload and history commands select the pending `2026-10-14`
contract unless `RequestOptions.api_version` overrides it. Their local
implementation does not establish deployed availability. The default client
contract remains `2026-09-22`.

`encrypt_whatsapp_media` encrypts bytes or asynchronous byte iterators locally.
`encrypt_whatsapp_media_stream` returns a single-use ciphertext iterator and
an `info` future; consume the stream before awaiting that future. Encryption
supports image, video, audio, voice note (`ptt`), document and sticker.

`client.whatsapp_media.upload(session, source, media_type="image",
mimetype="image/jpeg")` uses relay egress by default. The relay upload receives
ciphertext and its hash, without the key or plaintext. Choose `egress="direct"`
to request a short-lived grant and upload from this process. Direct uploads
preserve the granted URL's auth/token/media_id, refuse redirects, refresh a
401 grant, resume interrupted uploads and upload large documents in parts.
Pass a callable returning a fresh asynchronous byte iterator for large media;
its hashing and upload passes stream without buffering the file. Changed
sources fail integrity checks before upload finalization. Custom transports
implement `MediaUploadTransport`; `whatsapp_media.transport(...)` creates a
reusable relay or direct transport.

`to_whatsapp_media_send_descriptor(upload)` produces the typed descriptor used
by `messages.send`. Standard descriptor sends include the media key in the API
request. Zero-knowledge sends use the customer Signal service instead. Stickers
require WebP, support dimensions and animation metadata, and exclude captions
and thumbnails. Descriptor sends select `2026-10-14` unless explicitly overridden.

`client.history_sync.request_chunk_retry(session, {"syncType": "FULL",
"chunkOrder": 0})` requests another history chunk. After storing a chunk,
`history_sync.delete_chunk` accepts its `directPath`, standard base64
`fileEncSha256` with its trailing `=` padding, and optional `encHandle` and
`companionMetaNonce`. Encode the encrypted chunk's 32-byte SHA-256 with
`base64.b64encode(digest).decode("ascii")`. The path is limited to 1,024
characters; each optional handle is limited to 512 characters. Both commands
require a server credential and remain subject to API scopes and Number support.

Install the `history` extra for `polymorfa.history`. Its
`decode_history_sync_payload` accepts zlib, gzip or raw-deflate compressed
protobuf bytes and enforces a separate inflated byte limit (512 MiB by default).
`download_history_chunk(HistoryChunkDescriptor(...))` downloads without API
credentials, verifies encrypted/plaintext hashes and the media MAC, decrypts
with History keys, then decodes. `HistoryInlinePayload` skips download and
decryption. The result is the complete pinned `HistorySync` protobuf, including
nested messages and unknown wire fields. `history_sync_to_dict` returns protobuf
JSON names and lossless decimal strings for 64-bit integers.

Verified `history.sync` envelopes accept archive, Official API and mutually
exclusive direct `media` or `inline` payload variants. To select direct delivery
in session or QuickLink configuration, set `historySync.delivery="descriptor"`
and explicitly request `RequestOptions(api_version="2026-10-14")`. Earlier
contracts omit that optional field. Consent and runtime availability remain
server decisions.

`polymorfa.s3.S3MediaStore` accepts an application-owned async S3 client, such as
aioboto3, for S3/R2/MinIO APIs. `upload_to_whatsapp` pins both streaming reads to
the object's ETag. `archive` verifies into a private spool before beginning a
PUT; supply `scratch_directory` on durable local storage. Success, failure and
cancellation remove the spool. SDK-generated object metadata contains the media
kind and plaintext hash, with no media key. The SDK never closes the supplied
S3 client. Local protocol and filesystem checks do not establish hosted bucket
or WhatsApp acceptance.

`polymorfa.storage` provides customer-owned schema version 2 with 17 entities,
per-field version merges, event deduplication, permanent content revocation,
clear-chat watermarks and cleanup of media/reactions/receipts/poll votes.
`Storage(adapter)` requires atomic conditional commits. A failed commit stops
processing even when the adapter reports no conflicting row IDs. Durable session leases
fence every write chunk; a checkpoint can require its previous cursor. This
stores customer chat data only in the database your application supplies.

Use `memory_adapter()` for transient tests, or
`sqlite_adapter("customer.sqlite")` for native persistent SQLite. Call
`await adapter.setup()` to initialize an empty schema. Existing schema versions
require an explicit migration. SQL names and columns match the TypeScript
schema. A path-based SQLite adapter owns its connection and settles a native
transaction before propagating cancellation. A supplied SQLite connection
remains application-owned unless `close_client=True` is selected.

`reduce_event` and `reduce_history_chunk` produce deterministic operation
batches. History IDs use native `wa:` keys unless you supply a
`HistoryIdentityIndex`; direction and chat scope distinguish reused message IDs.
`storage_webhook_handler` commits a verified webhook before returning.
`sync_to_storage(project.events, storage)` resumes its saved cursor, writes data,
CASes the checkpoint, then acknowledges the event stream. Missing bodies and
retention gaps stop synchronization without advancing the cursor. Stop with
`sync.stop()` or `await sync.close()`. Configure a history decoder explicitly
when history payloads need downloading or decoding.

`await d1_bridge_adapter(url, application_secret, authority=..., table_prefix=...)`
connects to the customer-hosted D1 Worker bridge. It verifies fresh request-bound
response signatures, fixed authority/prefix/schema and conditional atomic
capabilities before exposing an adapter. Requests and responses are bounded.
This uses the Worker's actual D1 binding, without claiming administrative REST
calls are atomic. Setup requires the Worker's explicit operator setting. A timed
out or cancelled commit may have completed; reconcile through conditional
revisions, event markers and checkpoint CAS. The application secret is distinct
from Polymorfa credentials. The SDK refuses redirects and credential forwarding.

For native drivers, install the matching extra, for example
`polymorfa-sdk[postgres]`. The factories accept application-owned clients:

| Factory | Native client | Atomic boundary |
| --- | --- | --- |
| `postgres_adapter(pool)` | `asyncpg.Pool` | PostgreSQL transaction with conditional revisions |
| `mysql_adapter(pool)` | `aiomysql.Pool` | InnoDB transaction with conditional revisions |
| `libsql_adapter(client)` | `libsql_client.Client` | Guarded atomic batch, including HTTP clients |
| `mongodb_adapter(client, database, namespace=...)` | PyMongo `AsyncMongoClient` | Snapshot transaction with majority writes; replica set required |
| `dynamodb_adapter(client, namespace=..., table_name=...)` | `aioboto3` DynamoDB client | Conditional `TransactWriteItems`, up to 100 writes |
| `firestore_adapter(client, namespace=...)` | Google `AsyncClient` | Transaction with all reads before writes |
| `cosmos_adapter(container, namespace=...)` | Azure asynchronous `ContainerProxy` | One `/namespace` partition batch, ETag-fenced tombstones |
| `convex_adapter(client, references)` | Native Python `ConvexClient` | Application-installed storage query/mutation handlers |

The extra names are `postgres`, `mysql`, `libsql`, `mongodb`, `dynamodb`,
`firestore`, `cosmos` and `convex`. SQL adapters accept a trusted `table_prefix`;
PostgreSQL also accepts `schema`. Initialize an empty database with `setup()`;
existing schema versions require an explicit migration. libSQL installs the
same conditional guard table used by the TypeScript adapter. MySQL pools use
`autocommit=True`. SQL JSON codecs must accept JSON strings.

Document database namespaces come from trusted application identity. Bounded
queries fail if the configured read limit is exceeded. Cosmos requires
`await adapter.setup()` to verify `/namespace` before advertising atomicity.
DynamoDB can create its customer-owned table only with `create_table=True`.
No factory accepts a Polymorfa database credential or changes hosted retention.
Borrowed clients remain open unless that adapter's `close_client=True` option
is selected. Cosmos and Convex always borrow their container/client.

`supabase_preset()` returns customer-installed SQL with FORCE RLS, live
session membership, a separate server writer and browser SELECT only. Review
and install it through your own administrative connection. It grants no browser
storage writes or membership management. Use `postgres_adapter` for the server
writer. Convex applications install the owning TypeScript schema and handlers,
then pass `ConvexFunctionReferences("storage:get", "storage:commit",
"storage:query")`; the server resolves the namespace from authenticated identity.
Python sends no caller namespace to those functions.

SQLite, PostgreSQL, MySQL, libSQL's file driver, MongoDB and DynamoDB were checked
with native local drivers/servers; Firestore used its emulator, and D1 used a
real Worker binding. Cosmos and Convex have adapter contract tests without a
hosted service acceptance claim. JavaScript IndexedDB, Drizzle and Prisma exports
remain integrations for their owning browser/ORM runtimes; Python uses its
native database factories and the shared schema2 wire format.

Native aioboto3/MinIO tests also verify two-pass S3 reads, ETag precondition
failure when an object changes, and integrity-checked archive replacement.
The helper keeps the application-owned S3 client open.

`SignalNodeClient` talks to the customer-operated Signal service's local
application API. This is a server client. Supply the service's application bearer
secret; Polymorfa project, organization and client credentials are refused.
The default address is `http://127.0.0.1:8080`. HTTPS endpoints are supported;
private-network HTTP outside loopback requires `allow_insecure_http=True`.
Redirects, proxy environment settings and cookie forwarding are disabled. Health
checks omit credentials. Request failures preserve safe status/code information,
and sends are attempted once because a lost response may follow a completed send.

```python
from polymorfa import SignalNodeClient

async with SignalNodeClient(application_secret) as signal:
    sessions = await signal.list_sessions()
    outcome = await signal.send_text("my-session", "15551234567@s.whatsapp.net", "Hello")
    async with signal.events(session_id="my-session") as events:
        async for event in events:
            await persist_and_deduplicate(event.id, event.message_bytes(), event.raw)
            await signal.acknowledge_event(event.id)
```

The event stream never acknowledges automatically. It reconnects after transport
loss without inventing cursor replay: the service relies on unacknowledged
ciphertext redelivery from the relay. Use the event ID for durable deduplication.
Closing the client or stream cancels a waiting read. Keep the stream in an async
context manager, especially when leaving iteration early. Event size is bounded
by `max_event_bytes` (8 MiB by default). Errors and object representations omit
plaintext, media keys and upstream response text.

`SignalTextMessage` and `SignalMediaMessage` form the send request union.
`to_signal_media_descriptor(upload_result)` converts an encrypted upload result
into the service's snake_case media descriptor; PTT remains audio with `ptt=True`.
Image, video, audio, document and sticker kinds use the exact pinned service
shape. The local application contract has no thumbnail, waveform or animation
field; those descriptor options are not exposed by this client. The service
constructs the encrypted message and retains its Signal keys. Send standard API
media descriptors only when that Number's standard custody mode permits them.
Metadata that the pinned service ignores for a media kind is refused before send.

`SignalNodeEvent` retains the complete raw event and serialized message protobuf.
History descriptors preserve nullable numeric `sync_type`, `chunk_order`,
`progress` and `file_length`, plus the serialized notification. Optional media and
history values remain local to the application. Decode/download history through
the explicit local helpers, after the service operator enables history delivery
and the customer grants consent. The client grants neither history consent nor
hosted retention.

For a local signed webhook, call
`verify_signal_node_webhook(raw_body, headers, webhook_secret)` after enforcing the
raw request body limit while reading. It verifies the service's exact HMAC,
timestamp window and event-ID header before parsing the event. Persist and
deduplicate before returning a successful webhook response. Its signing secret is
separate from both the local application bearer and Polymorfa credentials.

This consumer is pinned to Signal service
`8aa191ef0d4c318229c91bcdf474bf2d79dac47c` and its application OpenAPI. Fixture and
loopback HTTP tests establish the local boundary. An opt-in harness also uses the
actual Rust service and Signal core with synthetic accounts to verify encrypted
receive, decoded protobuf and persistence before manual acknowledgement. These
tests do not establish WhatsApp acceptance, registry publication or deployed
availability. Provider receive time
and alternate sender depend on the owning relay producer supplying those values;
a parsed zero timestamp is not proof of provider time.

## Campaigns, customer-supplied profiles and custody defaults

The additive helpers below select `2026-10-14` only when a request does not
provide `RequestOptions(api_version=...)`. Other methods keep the package's
`2026-09-22` default. These source additions are not published and do not establish
availability in a deployed environment. The API enforces scopes, feature access,
enrollment, opt-outs and funding.

`client.campaigns` adds `get_reply_flow`, `create_reply_flow`, `set_reply_flow`,
`test_send`, `list_launch_approvals`, `links`, `export_recipients` and
`get_settings`. Organization calls select a `projectId` explicitly. The first
seven methods are also available on `client.project(project_id).campaigns`,
which captures its project and rejects a `projectId` supplied inside an input.
It exposes no campaign settings, audience import, retargeting or STOP settings.
The six matching Messaging methods take a project slug; they reject Client
tokens locally before sending a request. Platform methods retain the `data`
envelope, and Messaging methods retain the `success` and `data` envelope.

```python
async with AsyncClient(credential) as client:
    project = client.project(project_id)
    await project.campaigns.set_reply_flow(campaign_id, {"replyFlowId": None})
    sent = await project.campaigns.test_send(
        campaign_id,
        {"sessionId": session_id, "to": "+15551234567", "variables": {"count": 0}},
        options=RequestOptions(idempotency_key="reviewed-test-1"),
    )
    page = await project.campaigns.export_recipients(campaign_id, {"limit": 1000})
    csv = page.data["csv"]
    cursor = page.data["nextCursor"]
```

A test send captures one idempotency key and request body across retries. Other
new writes default to zero network retries, including writes with a caller key.
An explicit retry override retains its existing transport meaning. An import's
`replayKey` is a body field, separate from HTTP idempotency. After an uncertain
write, inspect the existing resource or job rather than creating a replacement.

`export_recipients` returns one CSV page without parsing, requoting, redirects or
automatic pagination. It preserves BOMs, CRLFs, quoting, the next cursor, the
parsed display filename and safe response metadata. Filters cannot be combined
with a cursor or a limit smaller than 1000. Request the next unfiltered page
explicitly when the API supplies a cursor.

`client.audience_profiles` provides `list`, `retrieve`, `put`, `delete` and
`list_consent`. `list` and `list_consent` return finite `{data, page}` envelopes.
`client.audience_profiles.imports` provides `create`, `retrieve` and `cancel`.
CSV imports accept canonical padded base64 of UTF-8 CSV, at most 10 MiB decoded,
and an optional distinct-header mapping. These profiles contain customer-supplied
campaign information; do not populate them from synchronized WhatsApp contacts.
Cancelling a Python task cancels its HTTP waiter. Cancel the durable import
explicitly with `imports.cancel(job_id)`.

`client.audiences.create_from_campaign` creates a retargeted audience.
`client.opt_outs` adds `get_confirmation_settings`,
`update_confirmation_settings` and `get_confirmation_summary`. Enabling STOP
confirmation requires an explicit supported locale. A consent assertion never
overrides an opt-out or grants permission to send.

Custody defaults are available through `client.projects.get_signal_custody` /
`update_signal_custody`, `client.customers.get_signal_custody` /
`update_signal_custody`, and the four bound `project.signal_custody` methods
`retrieve`, `update`, `retrieve_customer`, `update_customer`. Bound custody
methods unwrap the `data` envelope. Updates require `expectedRevision`; only a
Customer default accepts `None` to restore Project inheritance. Defaults apply
to future reservations and never convert existing Numbers or export keys.
QuickLink and browser tunnel grants, Origins and consent remain server authority.

Named request and result `TypedDict` models are exported from `polymorfa` and
`polymorfa.campaign_contract_models`. Required nullable response fields remain
present, optional fields remain omitted, and unknown response extensions remain
available. Malformed success shapes raise `ServerError(code="invalid_response")`.
Server-normalized response values are not revalidated as outbound inputs. API
errors preserve `param`, open error codes and safe request/routing metadata;
`content-disposition`, `x-trace-id` and `idempotent-replayed` are safe headers.

The existing campaign APIs also expose named `CampaignVariableMapping`,
`CampaignVariableBinding` and `CampaignTrackedLink` inputs. Empty bindings are
valid. Create mapping fields are optional and nonnull; PATCH accepts `None` to
reset `templateId`, `variableMapping` or `trackedLinks`. Returned campaigns
require `trackedLinks`, nullable `experimentOutcome` and nullable `followUp`.
Returned follow-up timing can be omitted. Recipient filters accept `reason`
together with `status`, `cursor` and `limit`; sequence fields preserve zero,
null and fractional Messaging `nextMessageAt` values.

Platform draft `messagesArray` accepts typed `CampaignMessageFields` or
`CampaignMessage` objects. Use `CampaignMessage`, `CampaignMessageMedia` and
`CampaignMessageButton` with typed fields plus `extra_fields` for open nested
extensions. Extensions cannot overwrite named fields. Platform PATCH supports
an empty or omitted body; Messaging PATCH requires at least one field.
`LaunchPlatformCampaign` requires the organization's `projectId` and accepts
`scheduledAt` and `skipMissingVariables`, including zero and false. Launch
approval, funding and campaign state remain API decisions.

History delivery reads accept `archive` or `descriptor`; writes accept only
`descriptor`. Delivery edits and the exact `historySync.delivery` reset select
`2026-10-14` only when `RequestOptions.api_version` is absent. Whole-history
resets and ordinary GETs retain `2026-09-22`; pass an explicit version to read
new delivery fields. An explicit caller version always wins. `Session.signalMode`
is an optional immutable fact and is not a generic configuration write.

Initial QuickLinks accept top-level `signalMode`. Supplementary QuickLinks
require `session` and `addConnection`, exclude initial billing/customer/custody
fields, and can only request the hybrid connection goal. Mode or descriptor
intent selects the newer version only when absent. Recipient history consent,
requested/effective settings, funding, beta access and tunnel grants remain
separate server decisions.

`history_sync.request_chunk_retry` returns required `requestId` and literal
`status="requested"`. `delete_chunk` checks a `status="deleted"` acknowledgement
before returning `None`. Neither acknowledges delivered history or local storage.
Direct grants and direct upload reject Client credentials before source reading;
scoped Client relay and pure custom ciphertext transports remain available.
Hand-authored sticker sends receive descriptor checks and capture their request
before caller-keyed retries. Unsafe append routes still send once by default.

Descriptor-history webhook types use public `whatsapp_ids`, optional original
IDs, ISO `oldestMessageAt` and `media.type="md-msg-hist"`. Media and inline
branches are mutually exclusive in static typing, including typed variables.
Archive and Cloud payloads remain available. `is_event` narrows by event name;
HMAC parsing verifies the signature and envelope and preserves the parsed payload. Neither performs
full payload schema or cryptographic validation. Never log media-key descriptors.
These source additions do not establish registry or deployed availability.

### Contact frequency caps, audience segments and drips (beta)

These methods follow `contracts/campaign-frequency-cap.json` and
`contracts/campaign-segments-drip.json`. They do not enroll a team in a beta;
the API returns `403 feature_unavailable` when a team lacks access.

`client.campaigns.get_frequency_cap()` returns the team limits, `revision` and
`updatedAt` (`None` until first saved). `update_frequency_cap()` replaces both
windows with the revision you read; `None` limits remove them. The PUT is sent
once, and a stale revision raises `ConflictError`, so read again and reconcile.
Campaign create and update accept `frequencyCap` (`None` removes a campaign
cap), recipients report `failureReason="frequency_cap"` and accept it as a
`reason` filter, and analytics add `frequencyCap.skippedRecipientCount`.

`client.audience_segments` lists, retrieves, creates, updates and deletes saved
segments, and previews a saved segment or unsaved rules. Project clients have
no segment resource. Rules use the typed condition shapes in
`polymorfa.audience_segments`; other shapes and value types raise
`ValidationError` before sending. Updates and deletes need the last observed
revision. Writes and both previews are sent once; a 409 `state_conflict` means
a stale revision or an evaluation timeout, so re-read or simplify the rules.

Platform create accepts `segmentId` (omit it rather than sending `None`), and
Platform update accepts `segmentId: None` to clear it. `drip` takes
`DripInput` on create and a partial `DripPatch` on update; the SDK applies no
defaults and omitted fields keep their stored values. Drip steps accept
`delayUnit` and a per-step `sendWindow`. Ordinary creates allow
`delayAfterSec` up to 86400; drip creates and every PATCH allow up to 2592000,
and the API checks the stored drip, delay unit and eligibility.
`campaigns.enroll()` on both clients adds a contact to a continuous drip and is
never retried automatically. Campaign reads expose `drip`, `enrollmentOpen`,
`pauseReason`, `segmentId` and `segmentSnapshot`; analytics expose per-step
`drip` results.

## Strict compressed history support

History decoding requires one complete gzip, zlib or raw DEFLATE stream, with
exact input consumption and wrapper checksums before protobuf parsing. Tails,
concatenated streams, truncation, reserved gzip flags and preset dictionaries
are refused. Required protobuf fields remain enforced; compressed empty output
is a protobuf refusal. The compressed and inflated byte caps remain unchanged.

The tested Python 3.10.20 and 3.13.5 zlib runtimes accept complete optional gzip
headers through the retained 1 MiB filename plus 1 MiB comment control. The SDK
adds no separate filename/comment cap. This is a tested boundary, not a claim of
unlimited headers or support on every platform. Stored, fixed, dynamic and
multiple blocks, valid final-byte padding, exact caps and late-corrupt trailers
have independent public regression controls.

Async download cancellation works while awaiting the network. The synchronous
zlib and protobuf calls have no decode cancellation API and cannot be interrupted
by an asyncio task during those calls. Authentication still completes before
compressed/protobuf parsing. Signed archive storage controls use an application
projection; descriptor dispatch and generic full-schema storage remain separate.
Local package tests do not establish registry publication or live availability.

### Descriptor history storage

`decode_history` remains archive-only, with the same event argument and nullable
progress-only result. Use the separate `decode_history_descriptor` callback for
projected media/inline descriptors. It receives the validated public descriptor
and original event and returns a non-null mapping or generated `HistorySync`.

```python
async def decode_descriptor(descriptor, event):
    if "inline" in descriptor:
        return await download_history_chunk(HistoryInlinePayload(descriptor["inline"]["data"]))
    return await download_decode_and_project_authorized_media(descriptor, event)


handle = storage_webhook_handler(storage, decode_history_descriptor=decode_descriptor)
```

Import the history helpers from `polymorfa.history` and the handler from
`polymorfa.storage`. The application defines the media callback and owns authorized
access, full-schema projection and key custody. Storage never downloads media
implicitly. Default `history_descriptor_mode="decode"` refuses missing, null,
failed or invalid decoding before content, progress, marker, checkpoint or ACK.
A legitimate empty mapping is allowed. Descriptor callback errors are sanitized.

Explicit `history_descriptor_mode="metadata-only"` validates and consumes progress
and the event marker, skips every decoder, then permits cursor/ACK advancement.
It deduplicates the event; adding a decoder later cannot import it through ordinary
replay. No automatic backfill or marker deletion is provided. Valid duplicates
skip decoders even when their configuration changes. Notification IDs never map
individual messages; existing native `wa:` fallback keys retain their joining
limits. Content/marker commit precedes checkpoint CAS and manual ACK. ACK failure
leaves committed data intact. Archive and Cloud behavior remain unchanged. This
change establishes local package behavior, not registry or deployed availability.

Decoded-history numeric strings follow the producer's finite `Number(string)`
contract: exact ECMAScript whitespace, complete ASCII decimal/radix grammar and
nearest-even binary64 rounding. Generic row numbers and safe revisions remain
strict. This parser compatibility does not change durable key spelling outside
the normal producer's uint32 chunk-order domain. Local fixtures and physical
wheel/sdist consumers do not establish registry or deployed acceptance.

`StorageSync.stop()` stops admission. It lets an admitted event finish decoding
and applying, checkpoint CAS, manual Platform ACK and the awaited `on_applied`
callback, then closes the owned stream. Repeated `stop()`/`close()` calls share
that completion. Cancelling a `close()` waiter does not cancel the worker.
Errors, fence loss, checkpoint conflicts and ACK failures still reach `done`;
an ACK failure leaves committed state and an uncertain remote outcome.

Call `stop()` inside `on_applied` and await `close()` externally. Awaiting
`close()` from that worker raises a self-join error. Explicit `done.cancel()` or
cancelling a task that directly awaits `done` remains hard cancellation. Use
`await asyncio.shield(sync.done)` when only the waiting task should be cancelled.
A custom source that cannot settle its cancelled next read can keep shutdown
pending; the SDK does not detach it or close a borrowed client or storage adapter.
These methods run on the owning asyncio loop.

Project views returned by `client.project(id)` borrow the root transport.
Closing a view or leaving its context does not close that transport. The root,
or an independently constructed project client, owns its transport lifetime.

## Credential handling

Treat every Polymorfa credential as an opaque string. Pass the complete value
from the Console. Never parse credentials or assume a fixed length. Store at
least 512 characters, preferably unrestricted text. Client-token length varies
with its bindings, Customer block and signing key ID.

The SDK checks server-credential prefixes, canonical base64url and the checksum.
These checks do not authenticate a credential. The API checks the issuance record
and live permissions. Test keys use the same project-token format; their test-only
restriction is enforced by the service.

### Event-stream validation and limits

Project event streams advance the resume cursor only after the base64 payload and
webhook envelope validate. Malformed server data follows the existing reconnect
policy. The parser has a 4 MiB UTF-8 byte budget per frame, including incomplete
lines, all `data:` lines, field syntax and comments. CRLF counts as one line
terminator; a blank line resets the budget. An oversized frame reconnects from
the previous validated cursor. Storage still commits the event, saves its
checkpoint with CAS, then manually acknowledges it. These changes are unreleased
source behavior.


## Official API round-2 betas

Native Number catalog-cache reads/sync, marketing status, Official group JPEG
upload, identity changes, incoming carts and signed webhook batches have source
counterparts. These additions remain unreleased betas and may return
`feature_unavailable`. They grant no enrollment or provider authority. See
[the shared beta guide](../../docs/official-api-round2.md) for ownership, batching,
whole-body signatures and release gates.

The following uses an existing server client. Preserve the API's opaque cursor;
stop when the response omits it. Catalog prices remain exact strings.

```python
page = await client.catalogs.list_products("number-id", "123", limit=100, cursor="opaque_-")
next_cursor = page.data["data"].get("nextCursor")
```

## Simultaneous calls source preparation

This counterpart is prepared against API #559 merge `c1a43a1e`. It is not a
registry availability claim. Use the HTTP API until a matching SDK release is
published and accepted against the target environment.

Call-settings reads expose `simultaneousCalls`, default false. Updates accept
`simultaneousCalls` and `acknowledgeRisk`. Omission preserves stored state;
explicit false disables the setting. Acknowledgment alone changes no setting
and is rejected. The API requires a team key and `acknowledgeRisk: true` for an
off-to-on transition. Project tokens may disable it. The SDK forwards values
without guessing the stored state. Existing `invalid_parameter`,
`permission_denied` and `state_conflict` errors remain authoritative.

The setting affects linked-device Numbers. Cloud API Numbers ignore it.
Unlimited concurrent calls differ from WhatsApp's apps and void Ban Insurance
when the 30-day claim window overlaps an enabled period. Claim verdicts and
`bansafe.claim` webhook verdicts recognize `simultaneous_calls`. Claim evidence
includes `simultaneousCalls`; the webhook does not acquire an evidence object.

No browser/client-token authority, call media behavior, automatic state read,
retry policy or feature availability is added by these SDK fields.

## Campaign webhook metadata (unreleased source)

Automatic `campaign.paused` payloads can include open-string `reason` and
`code`; manual pauses omit both. `pausedAt` is Unix seconds.
`campaign.recipient_skipped` can include nonnegative `messageIndex` (including
zero) and a UUID `followUpId`. `skippedAt` is Unix milliseconds. Missing optional
fields remain absent. Do not infer a pause cause from an unknown future code.

```python
# event is verified by construct_webhook_delivery.
if event.event == "campaign.paused":
    print(event.payload.get("code"), event.payload["pausedAt"])  # seconds
elif event.event == "campaign.recipient_skipped":
    print(
        event.payload.get("messageIndex"),
        event.payload.get("followUpId"),
        event.payload["skippedAt"],
    )  # milliseconds
```

These are verified-event handling fragments, not complete receivers. Preserve
whole-body signature verification before decoding and deduplicate batch members.
See [the scoped source contract and compatibility notes](../../docs/campaign-webhook-metadata.md).
Package publication and matching API environment acceptance remain separate gates.

## Channel observations

`newsletter.update` can include metadata-only `messages` for `live_update`, or a
`milestone` object. Counts are reported observations. Missing is distinct from
zero, and an explicitly empty reaction map stays present. `viewCounts` preserves
each typed or untyped definition; do not choose one by list order. Unknown valid
milestone types remain strings. Existing channel reads also expose optional
`forwards`.

A row's `position` is an ordering cursor. Its optional `message` reference is
present only when an original WhatsApp message ID was observed. A partial
reference alone does not authorize message actions. No message body is included.

After verifying the delivery signature and dispatching individual batch members:

```python
if is_event(event, "newsletter.update"):
    for row in event.payload.get("messages", []):
        if "forwards" in row:
            print(row["position"], row["forwards"])
```

Source contract: [`newsletter-observations.json`](../../contracts/newsletter-observations.json).
This source supplement does not establish registry publication or API deployment.
