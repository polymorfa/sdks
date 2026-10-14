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
metadata and API links. Non-JSON proxy errors become a safe HTTP error.

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
`AsyncCallRetentionClient` reads the team-wide setting using an organization key
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
before an organization key acts through a project client.

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
`history_sync.delete_chunk` accepts its `directPath`, unpadded base64url
`fileEncSha256`, and optional `encHandle` and `companionMetaNonce`. Both commands
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
`Storage(adapter)` requires atomic conditional commits. Durable session leases
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
