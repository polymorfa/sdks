# Yew with Axum and Polymorfa Web Components

The Yew application renders the existing Polymorfa Web Components. Its WASM
binary has no dependency on the Rust server SDK. Axum owns the project token,
authenticates a local example user, and mints short-lived browser tokens for
that user's server-assigned WhatsApp session.

This example provides an application-owned empty inbox. It stores no WhatsApp
content and enables no hosted history. Replace the history source with your
application's authorized webhook store or an explicitly enabled HMS source
when retained conversations are required. The Connect control creates a
QuickLink on the server for the assigned session and opens Polymorfa's pairing
page. Client rules, funding, enrollment, and API permissions remain enforced
by Polymorfa.

Install Rust 1.85 or later, Trunk 0.21, and Node.js. From the SDK repository root:

```sh
rustup target add wasm32-unknown-unknown
pnpm install --frozen-lockfile
node examples/rust/yew/build-elements.mjs
cd examples/rust/yew/frontend
trunk build --release
cd ../../../..
cargo run --locked --manifest-path examples/rust/yew/server/Cargo.toml
```

Configure these environment variables in the server process before running it:

| Variable                  | Purpose                                                  |
| ------------------------- | -------------------------------------------------------- |
| `POLYMORFA_PROJECT_TOKEN` | Server project credential; never passed to WASM          |
| `POLYMORFA_SESSION`       | Session assigned by your application to the example user |
| `EXAMPLE_APP_USERNAME`    | Local example login name                                 |
| `EXAMPLE_APP_PASSWORD`    | Local example login password                             |
| `POLYMORFA_EXAMPLE_PORT`  | Loopback port, defaults to `3000`                        |
| `POLYMORFA_API_BASE_URL`  | Optional API origin for local contract fixtures          |

Open `http://127.0.0.1:3000` (or the selected port). Sign in with the local
example credentials. The browser receives an opaque, HttpOnly, SameSite cookie;
it cannot choose the session, customer, or ephemeral ID sent to Polymorfa.
POST requests check the exact application origin. Logout revokes the server-side
application session immediately. Token responses are marked `no-store` and
include the grant consumed by `definePolymorfa`.

The login and bounded in-memory session store are for this loopback example.
Replace them with your application's durable authentication and live
membership/assignment checks before deployment. Production cookies require
HTTPS and `Secure`. Preserve the server-derived session and user identity.
Do not replace authentication with a browser identity header or unsigned cookie.

Verification:

```sh
cargo test --locked --manifest-path examples/rust/yew/server/Cargo.toml
cargo clippy --locked --manifest-path examples/rust/yew/server/Cargo.toml --all-targets -- -D warnings
cargo check --locked --manifest-path examples/rust/yew/frontend/Cargo.toml --target wasm32-unknown-unknown
```

The native integration test exercises real Axum HTTP login, cookie validation,
logout, and the Rust SDK's authenticated token request. It verifies that foreign
origins, forged cookies, and browser-supplied session/identity fields cannot select
a different grant. Browser rendering and native API fixtures are separate from
live WhatsApp pairing or retained-history acceptance.
