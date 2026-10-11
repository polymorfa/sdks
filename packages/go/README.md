# Polymorfa Go SDK

Handwritten server SDK for Go 1.24 or newer. This source checkout is under development and has not been published. The checked coverage manifest records native request/response evidence for all 439 primary operations supported by TypeScript SDK commit `ff51567105b64bf6997e7330ba8eb502d875e7b9`, plus three campaign supplements in the ledger. Eight additional Graph and testing-phone routes have typed wire tests. This evidence describes SDK contracts, not deployed feature availability.

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

`RequestOptions` controls version, timeout, retries, headers and idempotency. Safe requests retry network failures and retryable status codes; writes retry only with an idempotency key. Message send, reaction and other documented idempotent helpers create a key once per invocation. Application-level retries must reuse the application's own key. Replayed responses and responses carrying an operation ID are final. Failed response-body reads retain operation metadata; query the operation before retrying an admitted effect. Call link, reaction and socket commands use their documented retry restrictions. Authenticated plaintext URLs are allowed only for loopback servers.

`CursorPage[T]` loads the first page and follows cursors lazily through `All(ctx)` or `NextPage(ctx)`. Developer event streams expose typed frames, resume cursors, gaps, reconnect callbacks and manual acknowledgements. `Raw` provides an explicit JSON escape hatch; a project view confines raw paths and credentials to its project.

`ConstructWebhookEvent` verifies HMAC against exact raw bytes before parsing. `TypedPayload` exposes all 84 known event names through a closed interface with concrete payload types. Unknown event names and payloads survive decoding. Separate helpers verify local-forward and Flow-forward signatures with their timestamp rules. Native webhooks do not include timestamp replay protection. `WebhookHandler` integrates with `net/http`, enforces POST and a body bound, and verifies `X-Webhook-Signature` before invoking the application. Applications must handle duplicate deliveries according to their own persistence model.

Media downloads expose bytes or an `io.ReadCloser`, filenames and API metadata. Storage redirects receive no bearer credential, caller headers or cookie jar. WhatsApp media helpers parse supported descriptors, enforce HTTPS CDN hosts and size limits, derive HKDF keys, verify the ten-byte MAC and hashes, then decrypt AES-CBC before releasing bytes. `VerifyBeforeRelease` buffers plaintext until integrity checks pass. `VerifyStreaming` releases plaintext incrementally and reports final integrity failures through the reader; discard the output if the final read fails. File helpers write private sibling files and install them only after successful verification. API file helpers also enforce byte limits and preserve existing destinations on failure.

Calls use the native `github.com/coder/websocket` implementation. Lifecycle and media sockets send authentication as the first WebSocket message, never in the URL. `Follow` maintains the lifecycle connection, tracks incoming and outgoing calls, buffers events that precede REST admission, and reconnects with bounded backoff. `Call` exposes answering, joining, leaving, ending, PCM audio, H.264 video, confirmed media preferences, participants, reactions and hand state. Media reconnect keeps the same connection identity and restores confirmed preferences. An optional token provider shares refresh work and refreshes socket authentication before expiry. Quality/error reporters bound diagnostic traffic and stop on permanent refusal. Consume session and call events with a select on `Done()`; event channels remain open during concurrent cleanup.

## Verification and protocol evidence

Run `go test ./...` and `go vet ./...` from this directory. The tests execute native HTTP fixtures and a shared Node wire server. Run `go test ./...` in each `examples/go/*` directory to compile the consumer examples without network effects. `send-message` requires `POLYMORFA_API_KEY`, `POLYMORFA_SESSION` and `POLYMORFA_PHONE` and sends a message when run. `calls-agent` requires the API key and session and answers incoming calls when run. `webhook-server` requires `POLYMORFA_WEBHOOK_SECRET` and listens on loopback port 8080.

WhatsApp media behavior was checked against TypeScript SDK source and Cellar's shipped-client bundle `whatsapp-1049950004`:

- `/Users/purpshell/.cellar/bundles/whatsapp-1049950004/modules/WAWebCryptoCreateMediaKeys.js:23-29`: HKDF expansion to 112 bytes and IV/encryption/MAC/reference key slices.
- `/Users/purpshell/.cellar/bundles/whatsapp-1049950004/modules/WAWebCryptoDecryptMedia.js:19`: ten-byte MAC; lines 28-39: HMAC over IV and ciphertext, truncated comparison; lines 41-50: CBC decryption; lines 57-60: plaintext hash verification.

This is shipped-client protocol evidence, not proof of a current server or live-provider download. No live API credentials, real WhatsApp media, registry release or deployment were exercised.

`write_coverage.py` reconciles manually authored public-method wire fixtures with the pinned ledger. It emits coverage metadata only; SDK resources and types are handwritten. Operations remain missing until both the typed method and its request/response fixture pass. Direct-media history and self-hosted-storage contracts are not ported from unmerged customer-owned TypeScript branches.
