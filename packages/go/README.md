# Polymorfa Go SDK

Handwritten server SDK for Go 1.24 or newer. This source checkout is under development and has not been published. The checked coverage manifest records per-operation wire evidence and remaining gaps against TypeScript SDK commit `ff51567105b64bf6997e7330ba8eb502d875e7b9`; it does not claim full parity or deployed feature availability.

The module import is `github.com/polymorfa/sdks/packages/go`. This corrects the proposed `github.com/polymorfa/sdks/go` name to match the actual repository subdirectory. A release from this layout needs a `packages/go/vX.Y.Z` tag. Do not advertise an installation version until that version exists. For local work, use the `replace` directive in `examples/go/send-message/go.mod`.

```go
client, err := polymorfa.NewMessagingClient(polymorfa.Config{
    Credential: polymorfa.Credential{
        Kind: polymorfa.OrganizationAPIKey,
        Value: os.Getenv("POLYMORFA_API_KEY"),
    },
})
```

`NewOrganizationClient` accepts an organization API key. `NewProjectClient` accepts an organization API key or a project token with an explicit project ID. `org.Project(id)` returns a separate view; project tokens cannot rebind to another project. `NewMessagingClient` additionally accepts a scoped client token, with server-only operations rejected before a request. Credential formatting redacts token values. `NewSystemClient` sends no credentials. `NewBridgeClient` accepts only project tokens for regional route discovery.

Pass `context.Context` to each request. Each `Response[T]` includes typed data and safe response metadata. Developer resources unwrap documented `data` envelopes; Messaging resources retain their native success envelope. Errors expose semantic kind, API code, request ID and metadata through `errors.As(err, &apiError)`. API codes remain open strings so new server errors do not break decoding.

`RequestOptions` controls version, timeout, retries, headers and idempotency. Safe requests retry network failures and retryable status codes; writes retry only with an idempotency key. Message send, reaction and other documented idempotent helpers create a key once per invocation. Application-level retries must reuse the application's own key. Replayed responses are final. Call link, reaction and socket commands use their documented retry restrictions. Authenticated plaintext URLs are allowed only for loopback servers.

`CursorPage[T]` loads the first page and follows cursors lazily through `All(ctx)` or `NextPage(ctx)`. Developer event streams expose typed frames, resume cursors, gaps, reconnect callbacks and manual acknowledgements. `Raw` provides an explicit JSON escape hatch; a project view confines raw paths and credentials to its project.

`ConstructWebhookEvent` verifies HMAC against exact raw bytes before parsing. Unknown event names and payloads survive decoding. Native webhooks do not include timestamp replay protection. `WebhookHandler` integrates with `net/http`, enforces POST and a body bound, and verifies `X-Webhook-Signature` before invoking the application. Applications must handle duplicate deliveries according to their own persistence model.

Media downloads expose bytes or an `io.ReadCloser`, filenames and API metadata. Storage redirects receive no bearer credential, caller headers or cookie jar. WhatsApp media helpers parse supported descriptors, enforce HTTPS CDN hosts and size limits, derive HKDF keys, verify the ten-byte MAC and hashes, then decrypt AES-CBC before releasing bytes. Incremental plaintext release is not implemented.

Calls use the native `github.com/coder/websocket` implementation. Lifecycle and media sockets send authentication as the first WebSocket message, never in the URL. Audio and video codecs and acknowledged media-state updates are supported. Automatic socket reconnect, credential refresh providers and the full higher-level TypeScript call model remain gaps; do not assume call-client parity.

## Verification and protocol evidence

Run `go test ./...` and `go vet ./...` from this directory. The tests execute native HTTP fixtures and a shared Node wire server. Run `go test ./...` in `examples/go/send-message` to compile the consumer example without sending a message. Running the example sends a message and requires `POLYMORFA_API_KEY`, `POLYMORFA_SESSION` and `POLYMORFA_PHONE`.

WhatsApp media behavior was checked against TypeScript SDK source and Cellar's shipped-client bundle `whatsapp-1049950004`:

- `/Users/purpshell/.cellar/bundles/whatsapp-1049950004/modules/WAWebCryptoCreateMediaKeys.js:23-29`: HKDF expansion to 112 bytes and IV/encryption/MAC/reference key slices.
- `/Users/purpshell/.cellar/bundles/whatsapp-1049950004/modules/WAWebCryptoDecryptMedia.js:19`: ten-byte MAC; lines 28-39: HMAC over IV and ciphertext, truncated comparison; lines 41-50: CBC decryption; lines 57-60: plaintext hash verification.

This is shipped-client protocol evidence, not proof of a current server or live-provider download. No live API credentials, real WhatsApp media, registry release or deployment were exercised.

`write_coverage.py` reconciles manually authored public-method wire fixtures with the pinned ledger. It emits coverage metadata only; SDK resources and types are handwritten. Operations remain missing until both the typed method and its request/response fixture pass. Direct-media history and self-hosted-storage contracts are not ported from unmerged customer-owned TypeScript branches.
