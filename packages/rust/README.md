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
stops immediately after a failed CAS chunk to preserve marker ordering. Provider
adapters beyond memory and the D1 bridge, and full event/history reducers, are
not included in this slice. This package remains unpublished.
