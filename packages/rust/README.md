# Polymorfa Rust server SDK

Handwritten asynchronous clients for the native Messaging and Platform APIs.
The crate requires Rust 1.85 or later and Tokio. This development package has
not been published to crates.io. Its contract source is the merged TypeScript
SDK at `ff51567105b64bf6997e7330ba8eb502d875e7b9`.

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


Programmatic calls use `calls_runtime::CallsClient` and `calls_token::CallsTokenSource`.
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
