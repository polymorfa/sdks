# Polymorfa Rust server SDK

Handwritten asynchronous clients for the native Messaging and Platform APIs.
The crate requires Rust 1.85 or later and Tokio. This development package has
not been published to crates.io. Its baseline REST contract source is recorded in `coverage.json`.

```rust,no_run
use polymorfa_sdk::{ClientOptions, Credential, MessagingClient, RequestOptions};
use polymorfa_sdk::models::{ConversationReference, SendMessageRequest};

# async fn run() -> polymorfa_sdk::Result<()> {
let credential = Credential::project_token(
    std::env::var("POLYMORFA_PROJECT_TOKEN").expect("project token")
)?;
let client = MessagingClient::new(credential, ClientOptions::default())?;
let request = SendMessageRequest::text(
    ConversationReference::phone("+15551234567"), "Hello"
);
let result = client.messages().send("support", &request, RequestOptions::default()).await?;
println!("{}", result.data.data.receipt.id);
# Ok(())
# }
```

Use `OrganizationClient` with an organization API key for Platform operations;
`organization.project("project-id")` creates an immutable project view. Project
tokens cannot bind to another project. Credentials are validated before network
requests. The crate refuses compilation for WASM: Rust frontend applications use
the existing `@polymorfa/browser` and `@polymorfa/elements` components, with token
issuance kept on a trusted server.

Every call returns `ApiResponse<T>` with response metadata. Native errors expose
a semantic `ErrorKind`, status, safe message, code and request metadata. Request
options support API version, headers, timeout, cancellation and idempotency key.
Retries apply to safe methods and mutations with an idempotency key, and stop on
a final replay response. Message sending and reactions generate an idempotency
key when omitted. Reuse a caller supplied key across application retries.

`ClientOptions::proxy` configures a proxy. `configure_http` customizes the
build-owned HTTP client; the SDK enforces disabled automatic redirects after
the callback. Media storage redirects use a separate credential-free client.
Treat signed download locations and reusable call-link tokens as secrets.

Verify webhook signatures against the exact received bytes using
`webhooks::construct_event` before parsing JSON. Native HMAC signatures contain
no timestamp; applications must deduplicate event IDs. The CLI local-forward
helper additionally verifies its signed timestamp tolerance. Unknown event types
retain the envelope and payload.

Existing WhatsApp media descriptors support authenticated AES-CBC decryption,
MAC and encrypted/plaintext hash verification, bounded downloads and an HTTPS
WhatsApp host allowlist. No plaintext is returned before verification. Calls
expose server control methods and programmatic PCM/H.264 media sockets.

All 439 primary operations exposed by the pinned Messaging and Platform clients have typed public methods and native request/response tests. The implementation includes
sessions, all merged message content variants, hosted chat/message history with stored
media streaming and service windows, Linked Devices groups and Channels, QuickLinks, webhooks, contacts, profile, privacy,
presence, identities, labels, quick replies, core projects and project safety/warmup/insurance/health policies, events, media and
VoIP controls, Official API credential health/pricing, Hybrid Link controls and
client-token grants/rules, Official API group management and template catalogs,
project draft templates, all Linked Devices business profile/catalog/merchant
operations and Messaging/Platform campaign workflows with typed A/B/variation
results, cursor recipients, send windows and reported conversions,
catalog/product/marketing and Flow encryption helpers,
embedded signup continuation and simulated Test phone/events, resolved observation
policies, organization identity/credential metadata/audit/security reads and
revision-guarded billing controls, Customer lifecycle and pairing links, audience
imports/member pages, keyword suppression settings, media upload metadata and
session bans, organization call policy and do-not-call imports/pages, resolved session configuration and sparse revision
patches, organization Number batches/tier quotes/safety/capabilities, owner-bound
QuickLink/default configuration and team call retention, and Platform webhook/delivery/operation resources in both owner scopes.
All pinned known webhook event types expose typed payloads, with provider
extensions and future event envelopes preserved. Metered usage includes cursor
iteration and duplicate-cursor detection. `SystemClient` exposes credential-free
health/version probes; `BridgeClient` restricts native route discovery to project
tokens. The raw escape hatch is not typed coverage. No feature access or
release availability changes: the API continues enforcing permission, funding,
enrollment and feature eligibility.

From this directory:

```sh
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
cargo package --allow-dirty
```

The shared behavior tests spawn Node.js using the repository fixture server.
Other tests exercise actual native HTTP sockets, independent media vectors,
request serialization and decoded responses. No live provider requests are
needed or performed by the test suite.

Platform resources include typed BanSafe observations, project Functions and Flow drafts, Voice assets and provider credentials, call diagnostics/statistics/exports, and WhatsApp Analytics. Function and Flow writes are sent once; uncertain provider receipts are reconciled by reads. Project views preserve their identity and check organization-key resource mutations before acting. Voice upload URLs and one-time signing secrets omit `Debug`. Credit quantities named `Cents` retain fractional values.


Programmatic calls use `calls_runtime::CallsClient` and `calls_token::CallsTokenSource`. Native processes can use a short-lived client token for the granted Calls subset; placement omits session and participant identity, socket identity comes from the grant, and server-only resources remain refused. Server credentials and the Rust SDK stay outside browser/WASM builds.
A token source shares cached credentials across HTTP, lifecycle and media requests,
refreshes near expiry, and isolates cancellation among callers. Static server credentials
and asynchronous providers are supported; credentials never appear in socket URLs or
handshake headers. `connect()` observes incoming calls through `subscribe()`;
`place()` returns a `Call` handle. `answer`, `join`, `reject`, `leave`, `end`, participant
controls, audio/video writes, and confirmed media-state changes use that handle.
Reconnection preserves the connection ID and restores confirmed preferences, while
uncertain commands are refused. `disconnect()` releases accepted connections without
rejecting unanswered incoming calls. HTTP CONNECT proxies support these sockets;
HTTPS and SOCKS proxy URLs are supported by HTTP requests but not Calls sockets.

Voice `upload` takes an exact byte slice and `upload_stream` takes an asynchronous
byte stream plus its declared size. Both create an asset, send the bytes to credential-free
storage with redirects and retries disabled, then complete it without reusing the creation
idempotency key. Use `wait_until_ready` to await transcoding. Failed storage transfers do
not complete the asset and errors never retain the signed upload URL or storage body.

`request_logs().list` reads typed project request records and `follow` reads newer records from a follow cursor. `tail` yields optional backfill oldest first, follows without delay while pages remain, honors rate-limit retry headers, and stops when its cancellation token is canceled. A project view refuses another project selection; a cursor cannot be combined with new filters.

Calls diagnostics send technical error codes and final reconnect counts without blocking media. `calls_diagnostics::CallReporter` also accepts measured quality figures, removes invalid codecs and candidate types, clamps numeric limits, enforces one quality report per five seconds and twenty errors per minute, and stops after permanent HTTP refusals. Reports never retry and expire after five seconds.

`POLYMORFA_ERROR_CODES` exports all known documented API codes. `is_known_error_code` recognizes this catalog while every error retains its original open `code`, including future API or SDK codes.

`Events::live_source` adapts SSE to a native application-store listener. Subscribe with an optional resume cursor and error callback; each subscription delivers retained `WebhookEnvelope` bodies with their cursor and skips events without a body. `unsubscribe`, `close`, or dropping the subscription cancels only that consumer. Run subscriptions inside a Tokio runtime. `Call::snapshot().video_sources` exposes typed connection or participant owners and labels; removed participants, socket drops, and ended calls clear stale owners.

WhatsApp media also supports `media_stream::decrypt_stream` and `MediaDecryptor` as native incremental CBC/MAC/hash backends. `MediaVerifyMode::BeforeRelease` buffers plaintext until verification succeeds. `Streaming` emits unverified plaintext and reports integrity failures at the end; discard all emitted bytes on an error. Both modes enforce encrypted and plaintext limits and cancellation. `media().download_from_whatsapp_stream` accepts `WhatsAppMediaInput::Message` or a decoded descriptor and returns a body stream. `MediaDownloadStream::into_bytes` buffers verified output; `write_to_file` promotes a private sibling file only after complete verification. On Unix, failures, cancellation, and a dropped write future remove partial files while preserving an existing destination. File replacement uses the host filesystem's rename semantics. CDN requests enforce HTTPS WhatsApp hosts and confined redirects, carry no Polymorfa credential, and preserve signed URL queries.

`webhooks::verify_flow_forward_signature` verifies the exact decrypted Flow request body and its timestamp with the endpoint signing secret. Its default clock-skew tolerance is 300 seconds. `webhooks::create_fixture` produces JSON bytes, a bare hexadecimal native HMAC signature and the two webhook headers for local handler tests. Native webhook signatures have no timestamp; Flow forwarding and CLI local-forward signatures use their distinct timestamp formats.

Receipt-timed campaign follow-ups are available in the typed Messaging and Platform
campaign requests, campaign responses, recipient summaries, and analytics reports.
A follow-up sends text or a template. Omit its timing fields to use API defaults;
returned timing fields also remain optional. Clear a draft follow-up with an explicit
null (`Some(None)`).
The API requires beta enrollment and a single first message, and owns receipt timing,
reply and opt-out cancellation, expiry, and send eligibility. The SDK never grants access.

Raw requests also support caller-defined pagination through `raw_paginate`,
`raw::RawRequest`, and `raw::DecodedRawPage`. A decoder receives the response JSON
and metadata, and returns items and an optional next cursor. Pass a custom cursor
parameter when the API uses a key other than `cursor`. Pages preserve the method,
body, filters, headers, cancellation token, and response metadata. Project clients
accept project-relative paths and keep every subsequent page in that project.
Use `next_page` for individual pages or `into_stream` for all items, including
when an intermediate page is empty.

`cloud_graph::graph_transport_headers(models::MessageTransport)` returns the
Graph route-choice header for raw requests. It does not grant access to a transport.

Call placement accepts optional `session`, `to` and `video`. Group/participant calls omit `to`; client-token calls omit `session`. Omitting `video` preserves the server default. Streamed API downloads enforce the configured timeout while reading the response body. Organization keys reject every reserved special-purpose token prefix, including padded values.

## Customer-owned media, history and Signal service

These development helpers follow TypeScript `254fc6a2d073e7fc79420cf95f9b03927d00c04a`
and the Signal service application contract `8aa191ef0d4c318229c91bcdf474bf2d79dac47c`.
They are unpublished. Server availability and enrollment remain separate gates.
New grant, relay, history retry/delete and descriptor-send requests select API
revision `2026-10-14`; existing operations retain their previous default.

`media_encrypt::encrypt_media_stream` encrypts incrementally. For uploads,
`media_upload::MediaSource::Reopen` supplies a fresh stream of identical plaintext
on every call. `prepare_upload` computes the encrypted hash first, then reopens
and streams the upload. It withholds the final bytes until EOF confirms the
second encrypted hash. Bytes and single-use streams buffer bounded ciphertext.
The default plaintext limit is 256 MiB. Cancellation stops local work; it does
not roll back bytes already accepted by a provider.

`client.whatsapp_media().upload_relay(...)` transfers ciphertext only through the
session's connection. `upload_direct(...)` obtains a short-lived grant and uses
an independent HTTPS client restricted to WhatsApp media hosts. It preserves the
exact grant URL parameters, refuses redirects, refreshes grants after 401,
resumes interrupted uploads, and uploads documents above 50 MiB in parts.
Configure separate CDN trust/proxy settings with `DirectUploadOptions`.
A failed or changed source never reaches multipart finalization.

`media_descriptor::media_send_descriptor` validates upload metadata and builds a
standard descriptor. `MessageContent::DescriptorImage`, `DescriptorVideo`,
`DescriptorFile`, `DescriptorVoice` and `Sticker` send that descriptor, including
its media key, through the standard API. For a zero-knowledge session, use
`descriptor.signal_descriptor(...)` with `SignalSendRequest::Media` instead.
The pinned service does not accept thumbnail, waveform or animation metadata;
the conversion rejects those fields instead of dropping them.

`history_chunks::download_history_chunk` authenticates the ciphertext and hashes
with the History Keys HKDF label before decompressing or parsing. It accepts
an encrypted descriptor or inline compressed payload, detects zlib/gzip/raw
DEFLATE and bounds inflation at 512 MiB by default. Common history fields are
typed; the complete original protobuf, unknown fields and full-width integers
remain in `HistoryChunk::proto`. Use `decode_with` with your application's full
schema. This is narrower typed support than TypeScript's complete generated
history schema, without importing the Signal core into this MIT package.

`signal::SignalClient` takes the service URL and a separate application bearer
secret. It runs on servers, sends no Origin header, refuses redirects, and never
receives a Signal master or session key. Its native SSE stream has no resume
cursor and never automatically acknowledges an event. Commit application data
before `ack`; repeated delivery is possible. `verify_signal_webhook` verifies
HMAC over the exact timestamp and raw body before parsing. Enforce a timestamp
window and durable event-ID deduplication before returning 2xx. Convert local
history notifications with `SignalHistoryDescriptor::chunk_input`.

### Custom encrypted upload transports

Implement `media_upload_transport::MediaUploadTransport` to use application-owned
upload code. `EncryptedUploadBody` exposes only media type, encrypted SHA-256,
encrypted length and verified ciphertext streams from an offset. It has no media
key, plaintext hash, plaintext or Polymorfa credential accessor. The upload result
keeps the media key with the caller. Custom transport names use an owned `String`
in `MediaUploadResult::egress` in this unpublished SDK.

`relay_transport` and `direct_transport` return the built-in implementations of
that same trait, so a custom transport can wrap them without reimplementing the
wire protocol. Existing `upload_relay` and `upload_direct` methods remain available.

```rust,no_run
# async fn upload(client: &polymorfa_sdk::MessagingClient, bytes: Vec<u8>) -> polymorfa_sdk::Result<()> {
use polymorfa_sdk::{media_encrypt::{MediaEncryptionOptions, UploadMediaType},
    media_upload::MediaSource, media_upload_transport::upload_with_transport};
let transport = client.whatsapp_media().relay_transport(Default::default());
let result = upload_with_transport("session", MediaSource::Bytes(bytes),
    MediaEncryptionOptions::new(UploadMediaType::Image), &transport).await?;
# let _ = result;
# Ok(())
# }
```

Custom transports own their network requests and opened streams. Forward the
operation cancellation token, close streams, and finalize only after the verified
stream ends. A changed second pass fails before the final ciphertext bytes;
caller transport errors remain unchanged. Pre-cancellation stops encryption and
transport invocation. Cancellation drops an in-progress custom upload future.

### Customer-owned storage

`polymorfa_sdk::storage` provides schema-2 operations, deterministic per-field
merges, conditional checkpoints, durable session leases and an in-memory adapter.
`storage::d1::D1BridgeAdapter::connect` verifies the signed capabilities of a
customer-hosted D1 Worker binding before returning an atomic adapter. Configure
its expected authority and table prefix from trusted application configuration.
Use a separate customer application secret, never a Polymorfa API credential.
HTTPS is required outside loopback fixtures; redirects are refused.

```rust,no_run
# async fn example() -> Result<(), Box<dyn std::error::Error>> {
use polymorfa_sdk::storage::{d1::{D1BridgeAdapter, D1BridgeOptions}, Storage, StorageOptions};
use std::sync::Arc;
let adapter = D1BridgeAdapter::connect(D1BridgeOptions::new(
    "https://storage.example.com/", "customer-app", "app_",
    std::env::var("CUSTOMER_STORAGE_SECRET")?,
)).await?;
let storage = Storage::new(Arc::new(adapter), StorageOptions::default())?;
# let _ = storage;
# Ok(()) }
```

The D1 adapter uses `polymorfa-d1-storage-v1`, schema 2, bridge source
`9ae35e671f7f4868a67c1562422c5af9284b95c1`. It signs the exact request bytes
and authenticates each response's exact body, nonce, authority and table prefix.
Commit limits are 50 writes, including the engine's session fence; reads and
queries are paged at 1,000 rows. Requests and responses are bounded at 8 MiB.
Schema setup is disabled unless the customer explicitly enables it in the Worker.
D1 administrative REST batches are not used or represented as atomic commits.

Large operation batches span multiple fenced commits. The deduplication marker
is committed last; a failed chunk stops before later rows or the marker. A
request timeout or cancellation can leave a commit outcome unknown. Resume
through conditional revisions and durable event/checkpoint state. Persist content,
then its conditional checkpoint, then acknowledge the application event. Storage
never enables hosted history or acknowledges Signal events automatically.

The schema/merge baseline is storage source
`3bacf46f9c4213426314001586f5bae43aaa77de`; the native engine additionally
stops immediately after a failed CAS chunk to preserve marker ordering. Event/history reducers share the portable core described below; provider availability is listed separately.
This package remains unpublished.


Enable the optional `storage-sql` feature for `storage::sql::SqlStorageAdapter`.
It uses SQLx 0.8.6's native PostgreSQL, MySQL and SQLite drivers. Choose the
matching `SqlDialect` explicitly and pass your customer database connection URL.
The client does not read Polymorfa database configuration. Configure transport
security and database roles in that connection; a table prefix is naming, not
tenant authorization. PostgreSQL supports an explicitly configured schema.
`SqlStorageOptions::create_tables = false` leaves schema creation to your operator.
`schema_statements` exports schema-2 DDL for that workflow.

```rust,no_run
# async fn sql_example() -> Result<(), Box<dyn std::error::Error>> {
# #[cfg(feature="storage-sql")] {
use polymorfa_sdk::storage::sql::{SqlDialect, SqlStorageAdapter, SqlStorageOptions};
let adapter = SqlStorageAdapter::connect(SqlDialect::Postgres,
    &std::env::var("CUSTOMER_DATABASE_URL")?, SqlStorageOptions::default()).await?;
# let _ = adapter;
# }
# Ok(()) }
```

Every SQL commit runs in one database transaction and rolls back all its writes
on a stale revision. The engine reserves a write for its session fence. Commit
capacities are 500 writes for SQLite and 1,000 for PostgreSQL/MySQL. Queries use
schema-defined scope and cursor indexes. Invalid or oversized derived identifiers
are refused before connecting, preventing PostgreSQL name truncation. Driver
errors omit connection strings, SQL and customer row values. These adapters are
server clients; hosted Supabase/Neon/PlanetScale authority and deployment acceptance
require the customer's own configuration and verification. Document-store and browser adapters have separate configuration. A Supabase
RLS preset is exported below.

Chat clears and row planning renew a live lease conditionally between reads once half
the configured lease duration remains. An expired or replaced lease still
fails closed. Configure customer operation deadlines and lease duration so one
individual query or commit can finish before expiry.

### Portable storage core and browser IndexedDB

Existing server paths under `polymorfa_sdk::storage`, including `Storage`,
`StorageOptions`, `StorageAdapter`, `schema`, `merge`, `memory` and `engine`,
re-export the canonical `polymorfa-storage-core` crate. Server adapters use the
same types and retain native thread-safety bounds and Tokio timers. The server
SDK retains its WASM compilation prohibition. The separate
`polymorfa-storage-indexeddb` WASM crate uses that exact core with browser clocks,
timers and local futures, without importing the server HTTP clients.

IndexedDB commits at most 1,000 writes in one native transaction, including the
session fence. Its crate README describes namespace ownership, bounded queries,
cancellation and browser persistence. This adds no Signal acknowledgement, API
browser credential or remote grant. The core must be published and verified
before either dependent package can be installed from a registry. All three
packages remain unpublished.

### Event/history persistence and manual stream ACK

`storage::reducer::events::reduce_event` handles all 24 stored event types from
storage source `3bacf46f9c4213426314001586f5bae43aaa77de`.
`storage::reducer::history` exposes full typed inputs for the fields read by the
owning decoded-history reducer, including PN/LID identity mapping. An explicit
`storage::sync::HistoryChunkDecoder` supplies a complete decoded chunk. The
existing common protobuf history decoder is not a complete storage projection;
no raw-protobuf mapping or opaque media descriptor decoding is inferred here.

Use `storage_sync::apply_verified_event` only after `webhooks::construct_event`
verifies the exact received bytes. Send a successful webhook response after
persistence succeeds. `storage_sync::NativeStorageEventSource::new` wraps an
existing project/organization Events resource with its existing credential and
request authority. Pass it to `storage::sync::sync_to_storage` explicitly;
SDK construction never enables retention or starts a consumer.

The consumer forces manual ACK and resumes from its saved checkpoint. It writes
content and the event marker, conditionally saves the cursor, then acknowledges
the stream item. Missing payloads, retention gaps, decoder/provider failures and
checkpoint conflicts stop progress. Metadata-only consumption requires explicit
`require_payload = false`. Stop prevents new admission while an admitted event
finishes its checkpoint and ACK. Dropping the future may leave an uncertain
provider result; reconcile saved markers/checkpoints before resuming. The
applied callback runs after ACK and may observe a replay with `applied = false`.

Native wire tests inspect content, event marker and checkpoint when the actual
HTTP ACK arrives and reject a gap preceding an event in the same SSE packet.
SQLite and actual Chromium IndexedDB run identical reducer/sync fixtures,
including decoded 2,000-message history and crash/replay failure boundaries.
These packages remain unpublished; storage-core must be published and verified
before dependent packages. Local exact-artifact package verification does not
establish registry or deployed customer availability.

### Customer-owned libSQL and Turso

Enable `storage-libsql` for `storage::libsql::LibsqlStorageAdapter`. The adapter
uses native `libsql` 0.9.30 with its remote and TLS features. Pass a connection
created by your application using independent customer credentials. The adapter
never reads a Polymorfa API key, builds an HTTP fallback or closes your database.

```rust,no_run
# async fn libsql_example() -> Result<(), Box<dyn std::error::Error>> {
# #[cfg(feature="storage-libsql")] {
use polymorfa_sdk::storage::libsql::{LibsqlStorageAdapter, LibsqlStorageOptions};
let database = libsql::Builder::new_remote(
    std::env::var("CUSTOMER_LIBSQL_URL")?,
    std::env::var("CUSTOMER_LIBSQL_TOKEN")?,
).build().await?;
let adapter = LibsqlStorageAdapter::new(database.connect()?, LibsqlStorageOptions::default())?;
# let _ = adapter;
# }
# Ok(()) }
```

The adapter shares all 17 schema-2 entities, JSON encoding and closed index
queries with the SQL adapters. `schema_statements` exports DDL;
`LibsqlStorageOptions::create_tables = false` leaves installation to the caller.
Table prefixes select names and do not grant tenant access. Configure database
permissions, TLS, retries and operation deadlines in the native client.

Each commit uses one native `BEGIN IMMEDIATE` transaction with at most 500
writes, including the engine's session fence. Every stale revision rolls back
earlier writes. Duplicate inserts and other provider failures also roll back;
remote conflict classification reads the failed row after rollback rather than
matching private driver error text. A lost response or cancelled future can
leave an outcome unknown. Resume through saved revisions, event markers and
checkpoints. The adapter does not retry uncertain commits automatically.

The optional feature deliberately excludes libSQL's local core/replication
features, keeping the adapter's own driver independent of native SQLite linkage.
Remote libSQL is tested against a task-owned libSQL server over Hrana. Local
embedded replicas and hosted Turso credentials, permissions and availability
are not covered by that acceptance. Native tests cover all 17 entities, JSON
values, 2,000-message pagination, atomic stale/duplicate/provider rollback,
independent-client CAS, lease/replay/checkpoint fences and redacted HTML errors.
Run the real-server test with `POLYMORFA_STORAGE_LIBSQL_URL` and an optional
`POLYMORFA_STORAGE_LIBSQL_TOKEN`; without the URL the real-server case returns
without exercising a provider. This SDK remains unpublished.

### Customer-owned S3 media

The optional `storage-s3` feature adds `polymorfa_sdk::s3::S3MediaStore` using
the official AWS S3 driver. It stays outside the default dependency graph. Pass
a separately configured `aws_sdk_s3::Client` with customer credentials, endpoint,
TLS trust, retry policy and operation deadlines. The store clones that client;
it does not read Polymorfa configuration or copy API credentials into storage.

```rust,ignore
use polymorfa_sdk::s3::{S3ArchiveOptions, S3MediaStore, S3UploadOptions};
use polymorfa_sdk::media_encrypt::UploadMediaType;
let store = S3MediaStore::new(customer_s3_client, "customer-media", "app/")?;
let archived = store.archive(&descriptor,
    S3ArchiveOptions::new("incoming/photo", customer_private_spool_directory)).await?;
let uploaded = store.upload_to_whatsapp(&messaging.whatsapp_media(), &session_id,
    S3UploadOptions::new("incoming/photo", UploadMediaType::Image)).await?;
```

`archive` accepts decoded descriptors; `archive_input` also accepts inbound
media/type message fields. Both require a caller-selected private spool parent. It writes a private
bounded disk spool, then verifies the MAC, padding and plaintext hash, plus the ciphertext hash
and exact length when supplied, before starting an object PUT. Corrupt,
truncated and cancelled downloads preserve an existing object. Metadata contains
the selected media kind, plaintext hash, optional encoded filename and explicit
caller metadata; the helper never derives metadata from the media key.

`upload_to_whatsapp` uses two streaming GETs pinned to the same object ETag.
A failed conditional GET or changed complete second-pass hash fails before
final encrypted bytes or finalization. Relay is the default; select
`S3WhatsAppEgress::Direct` and configure independent direct-upload TLS/proxy
options for grant-based upload. Cancellation and transport failures during PUT
can leave the object-write outcome uncertain. Spool directories are removed on
completion, failure and dropped futures on Unix.

For a custom ciphertext transport, use
`S3MediaStore::upload_to_whatsapp_with_transport` with the same upload options
and a `MediaUploadTransport`. It retains the two ETag-pinned reads and does not
call the Polymorfa API when the custom transport uploads independently.

The media helper follows source
`254fc6a2d073e7fc79420cf95f9b03927d00c04a`. Native tests exercise the official
driver against MinIO, including verification before PUT, conditional reads,
changed objects, cancellation and ciphertext-only relay/direct uploads. Hosted
AWS/R2 credentials, IAM policies and deployment acceptance remain separate gates.
This SDK remains unpublished.


`storage::sql::supabase_preset` exports the schema-2 customer database tables,
live session memberships and forced-RLS policies from storage source
`3bacf46f9c4213426314001586f5bae43aaa77de`. Review and install the SQL once in a
customer-owned migration using `SupabasePresetOptions`; adapter setup never
installs these policies. Pass the resulting schema and prefix to the server
SQL adapter with `create_tables: false`.

The separate reader role can select only sessions mapped to `auth.uid()` in
`storage_memberships`. It cannot write storage data or memberships. Configure
trusted Supabase/PostgREST JWT enforcement; never expose a direct reader SQL
credential or let a browser set the database subject. Keep reader and server
roles distinct, without superuser/BYPASSRLS rights or reader inheritance of the
writer role. Membership deletion takes effect on the next database query.
Native PostgreSQL tests prove all 17 entities, anonymous/write denial, a
non-superuser owner's FORCE-RLS boundary, revocation and missing-subject denial.
Hosted Supabase JWT and deployment acceptance remain separate gates.


### Customer-owned DynamoDB

The optional `storage-dynamodb` feature adds
`storage::dynamodb::DynamoStorageAdapter` using the official AWS SDK. Pass an
independent customer `aws_sdk_dynamodb::Client` and
`DynamoStorageOptions::new(namespace, table_name)`. The caller configures
credentials, TLS/endpoints, retries and operation deadlines. The adapter clones
that client and never reads Polymorfa API credentials.

The table needs string partition key `pk` and sort key `sk`. Setup validates
these key names and can create a table only with explicit `create_table: true`.
Use operator-managed active tables for deployments; AWS table activation is a
separate provisioning gate. Namespaces separate stored keys; configure customer
IAM/table authority independently.

Each conditional transaction contains at most 100 writes, including the
engine's session fence. Reads are strongly consistent and queries page at
1,000 rows, scanning the entity partition before applying the schema index.
`max_query_rows` defaults to 100,000 for the whole scanned partition, so bound
customer retention or adjust it explicitly. DynamoDB item and transaction byte
limits still apply. A timeout or transport failure can leave a write outcome
unknown; resume using saved event/checkpoint state and conditional revisions.

The adapter follows storage source
`3bacf46f9c4213426314001586f5bae43aaa77de`. Tests against DynamoDB Local use the
official native driver and cover all 17 entities, nested/scalar JSON, atomic
rollback, 2,000 messages, replay, cursor paging, checkpoint conflicts and expired
writer fencing. Hosted AWS credentials, IAM and deployment acceptance remain
separate gates. This SDK remains unpublished.


### Customer-owned MongoDB

Enable `storage-mongodb` for `storage::mongodb::MongoStorageAdapter` using the
native official MongoDB driver. Pass a customer-owned `mongodb::Database` and
`MongoStorageOptions::new(namespace)`. Configure TLS, credentials, server
selection, connection and operation timeouts on that independent client. The
adapter derives transaction sessions from the database's client and never reads
Polymorfa API credentials.

```rust,ignore
use polymorfa_sdk::storage::mongodb::{MongoStorageAdapter, MongoStorageOptions};
let adapter = MongoStorageAdapter::new(customer_database,
    MongoStorageOptions::new("my_app"))?;
```

Use a replica set or sharded deployment with transaction support. Setup checks
topology and refuses standalone servers before creating indexes. It creates
schema-2 indexes by default; set `create_indexes = false` when the operator owns
index creation. Each collection is `polymorfa_{namespace}_{entity}`. Namespace
isolation complements customer database permissions; it does not replace them.

Commits use native snapshot/majority transactions, conditional row revisions,
and at most 500 writes including the engine fence. Driver transaction retries
retain the same prepared values. MongoDB transaction lifetime and BSON document
limits still apply. A transport failure or timeout can leave a commit outcome
unknown; recover using saved event/checkpoint state and conditional revisions.

Queries send only the declared index scope fields. They read at most
`max_query_rows + 1` matching rows before applying cursor/range ordering;
`max_query_rows` defaults to 100,000. Bound retention or configure this limit for
the customer workload. Stored values remain JSON, including literal objects
with `$date`, `$binary` or `$numberLong` keys; BSON-specific stored types are
refused.

The schema source is `3bacf46f9c4213426314001586f5bae43aaa77de`.
Actual local replica-set tests cover all 17 entities, JSON scalars, conditional
replacement, atomic rollback, 2,000-message history, checkpoints, expired-writer
fencing, namespaces and read bounds. Standalone-server tests prove refusal
without partial writes. Hosted MongoDB authorization, TLS, sharded deployment
and operational failover remain customer acceptance gates. This SDK is
unpublished.
