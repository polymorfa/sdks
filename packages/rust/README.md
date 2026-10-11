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

Typed coverage is still being expanded. The current implementation includes
sessions, all merged message content variants, QuickLinks, webhooks, contacts, profile, privacy,
presence, identities, labels, quick replies, core projects, events, media and
VoIP controls, Official API credential health/pricing, Hybrid Link controls and
client-token grants/rules, resolved session configuration and sparse revision
patches, and Platform webhook/delivery/operation resources in both owner scopes.
Some event payload models remain
partial; the raw escape hatch is not typed coverage. No feature access or
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
