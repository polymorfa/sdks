# Rust integration examples

`axum` verifies the exact HTTP request bytes before decoding a webhook. Set
`POLYMORFA_WEBHOOK_SECRET`, then run:

```sh
cargo run --manifest-path examples/rust/axum/Cargo.toml
```

The route returns `401` for a missing or invalid signature and `204` after
verification. Add durable event-ID deduplication and enqueueing for production.
Native signatures do not bind a timestamp. Use your deployment's HTTPS ingress
for incoming production webhooks; the example listens on loopback.

Yew and Leptos applications keep this Rust SDK on the server. Their browser
frontends use the existing Polymorfa Web Components:

```js
import { definePolymorfa } from "@polymorfa/elements";
definePolymorfa({ tokenEndpoint: "/api/polymorfa/token" });
```

Render `<pmfa-session-status>`, `<pmfa-connect-whatsapp>` and `<pmfa-inbox>`
through the framework's custom-element support. There is no second Rust UI
implementation. The token endpoint must authenticate your application user,
derive their authorized session or customer from server state, and use
`MessagingClient.client_tokens().mint()` to issue a short-lived token. Never
accept the session/customer target or ephemeral identity as trusted browser
input, and never send a project token or organization API key to WASM.

The Web Component integration is documented wiring, not a tested Yew/Leptos
browser application in this checkpoint.
