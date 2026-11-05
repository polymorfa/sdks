# Go web host

Run the same application with `net/http` or Gin. templ renders the page and HTMX submits the sign-in and sign-out forms. The browser mounts the existing Polymorfa Web Components; the Go SDK remains on the server.

From the repository root:

```sh
npm ci
node examples/go/web-host/build-assets.mjs
cd examples/go/web-host
go mod download
go test -race ./...
go run . -framework gin -port 8080
```

Before the last command, set `EXAMPLE_APP_USERNAME`, `EXAMPLE_APP_PASSWORD`, `POLYMORFA_PROJECT_TOKEN`, `POLYMORFA_SESSION`, `POLYMORFA_RECIPIENT` and `POLYMORFA_WEBHOOK_SECRET` in the server environment. The recipient is the authorized peer's phone number. Open `http://127.0.0.1:8080`. Use `-framework nethttp` for the standard library host. `POLYMORFA_API_BASE_URL` optionally selects an API origin; authenticated plaintext is restricted to loopback. Asset building bundles the workspace Web Components and downloads HTMX 2.0.4 after checking its SHA-256 digest.

This loopback example has one configured application account. Sign-in creates a random, server-held session with a 30-minute lifetime and an HttpOnly, SameSite=Strict cookie. Application POST routes enforce the application origin. Browser input cannot select an identity, number or recipient. Sign-out removes the server session and stops browser polling.

The inbox uses a custom data source. `POST /api/polymorfa/send` calls the native Go SDK's `Messages.Send`. The browser supplies text and a UUID `Idempotency-Key`; the server supplies the Number and recipient. Retry an unknown outcome with the same key and text. The example rejects changed text under an existing key and stops accepting new keys after 128 attempts.

Register `/webhooks/polymorfa` with the API for the assigned Number, native format, `message.received` and `message.ack`, using the same signing secret. The receiver verifies the exact bounded body with the Go SDK's `WebhookHandler`, decodes typed payloads, ignores other Numbers and recipients, and deduplicates event IDs. After a send, it matches the canonical conversation ID returned by the API, since events can omit the phone number. Production webhook delivery requires a reachable endpoint. For local acceptance, expose only this receiver through a temporary tunnel; keep application login and UI on loopback.

`GET /api/polymorfa/conversation` returns the authenticated user's application-owned conversation. It holds at most 100 messages and 1,024 recent event IDs in memory until this server stops. A browser reload preserves that state; a server restart clears it. This example does not enable HMS. Event streams omit bodies without authorized retention, so this example receives live signed webhooks instead. The browser uses shared Web Components for rendering and polls this native host; it does not send through the TypeScript browser API client.

Set `POLYMORFA_EXAMPLE_TRANSPORT=local-test-number` when using isolated local test numbers. The page then labels simulated WhatsApp transport. This is a local transport label, not evidence of real WhatsApp-network delivery.

Before hosting it publicly, integrate the application's real authentication, live membership and Number/recipient authorization, HTTPS origin, durable sessions and transactional message/idempotency storage. Keep project and organization credentials exclusively in the server process.

`main_test.go` and `conversation_test.go` use real HTTP servers with a fixture upstream to verify both hosts, native credential/version headers, authentication, assigned targets, origin rejection, caller-key replay and conflict handling, webhook signatures, event deduplication, target confinement and conversation reads after reload. Those tests do not prove a deployed or real WhatsApp-network exchange.

To change the template, regenerate the tracked Go view:

```sh
go run github.com/a-h/templ/cmd/templ@v0.3.960 generate
```

The SDK itself has no Gin, templ or HTMX dependency. This example uses a separate Go module and a local `replace` directive until an SDK release is available.

The separate authenticated `/api/polymorfa/token` and `/api/polymorfa/connect` routes remain examples of native client-token minting and supplementary linked-device invitations. They are not used by this native-server inbox. Token minting requires the issuer's complete delegation scopes. The API still checks Number assignment, eligibility, consent and funding; these routes do not establish initial pairing or change custody.
