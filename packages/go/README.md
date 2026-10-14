# Polymorfa Go SDK

Handwritten server SDK for Go 1.24 or newer. This source checkout is under development and has not been published. The checked coverage manifest records native request/response evidence for all 439 primary operations supported by TypeScript SDK commit `daac84b1bd24c9460a2bcad555629a5466d85e2c`, plus three campaign supplements in the ledger. Eight additional Graph and testing-phone routes have typed wire tests. This evidence describes SDK contracts, not deployed feature availability.

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

`RequestLogs().List` reads typed project request-log pages and retains nullable
status, durations and removed credentials. `Follow` advances the follow cursor;
`Tail` yields backfill chronologically and follows new requests, with bounded
rate-limit waits and context cancellation. Organization callers select a project;
project views reject foreign selections. API `logs:read` permission still applies.
`Events().LiveSource` adapts retained webhook bodies to cancellable subscriptions.
It skips events without retained payloads, passes their resume cursor to the
listener, reports terminal errors, and closes its reader before `Done` completes.

`ConstructWebhookEvent` verifies HMAC against exact raw bytes before parsing. `TypedPayload` exposes all 84 known event names through a closed interface with concrete payload types. Unknown event names and payloads survive decoding. Separate helpers verify local-forward and Flow-forward signatures with their timestamp rules. Native webhooks do not include timestamp replay protection. `WebhookHandler` integrates with `net/http`, enforces POST and a body bound, and verifies `X-Webhook-Signature` before invoking the application. Applications must handle duplicate deliveries according to their own persistence model.

Media downloads expose bytes or an `io.ReadCloser`, filenames and API metadata. The configured timeout covers response headers, storage redirects and the complete media body; closing the body cancels its request. API base paths are preserved for HTTP requests and Calls sockets. Signed download URLs redact routine Go formatting. Storage redirects receive no bearer credential, caller headers or cookie jar. WhatsApp media helpers parse supported descriptors, enforce HTTPS CDN hosts and size limits, derive HKDF keys, verify the ten-byte MAC and hashes, then decrypt AES-CBC before releasing bytes. `VerifyBeforeRelease` buffers plaintext until integrity checks pass. `VerifyStreaming` releases plaintext incrementally and reports final integrity failures through the reader; discard the output if the final read fails. File helpers write private sibling files and install them only after successful verification. API file helpers also enforce byte limits and preserve existing destinations on failure.

Calls use the native `github.com/coder/websocket` implementation. Lifecycle and media sockets send authentication as the first WebSocket message, never in the URL. `Follow` maintains the lifecycle connection, tracks incoming and outgoing calls, buffers events that precede REST admission, and reconnects with bounded backoff. `Call` exposes answering, joining, leaving, ending, PCM audio, H.264 video, confirmed media preferences, participants, reactions and hand state. Media reconnect keeps the same connection identity and restores confirmed preferences. An optional token provider shares refresh work and refreshes socket authentication before expiry. Quality/error reporters bound diagnostic traffic and stop on permanent refusal. Consume session and call events with a select on `Done()`; event channels remain open during concurrent cleanup.

## Verification and protocol evidence

Run `go test ./...` and `go vet ./...` from this directory. The tests execute native HTTP fixtures and a shared Node wire server. Run `go test ./...` in each `examples/go/*` directory to compile the consumer examples without network effects. `send-message` requires `POLYMORFA_API_KEY`, `POLYMORFA_SESSION` and `POLYMORFA_PHONE` and sends a message when run. `calls-agent` requires the API key and session and answers incoming calls when run. `webhook-server` requires `POLYMORFA_WEBHOOK_SECRET` and listens on loopback port 8080.

[`web-host`](../../examples/go/web-host/README.md) runs a Gin or `net/http` application with templ, HTMX and the existing Web Components. Its app-owned POST token endpoint derives the number and user from authenticated server state. The example has native HTTP tests for both hosts and a browser-tested sign-in, inbox mount and sign-out flow.

WhatsApp media behavior was checked against TypeScript SDK source and Cellar's shipped-client bundle `whatsapp-1049950004`:

- `/Users/purpshell/.cellar/bundles/whatsapp-1049950004/modules/WAWebCryptoCreateMediaKeys.js:23-29`: HKDF expansion to 112 bytes and IV/encryption/MAC/reference key slices.
- `/Users/purpshell/.cellar/bundles/whatsapp-1049950004/modules/WAWebCryptoDecryptMedia.js:19`: ten-byte MAC; lines 28-39: HMAC over IV and ciphertext, truncated comparison; lines 41-50: CBC decryption; lines 57-60: plaintext hash verification.

This is shipped-client protocol evidence, not proof of a current server or live-provider download. No live API credentials, real WhatsApp media, registry release or deployment were exercised.

`write_coverage.py` reconciles manually authored public-method wire fixtures with the pinned ledger. It emits coverage metadata only; SDK resources and types are handwritten. Operations remain missing until both the typed method and its request/response fixture pass. Direct-media history and self-hosted-storage contracts are not ported from unmerged customer-owned TypeScript branches.

The neutral Calls media interface is `Call.WriteAudio`, `Call.WriteVideo` and
`Call.Events`. Audio events contain signed 16-bit PCM at `Call.Snapshot().SampleRate`.
Video events retain H.264 bytes, source handle, microsecond timestamp and keyframe
flag; `video_source`, `video_source_removed` and `keyframe_request` controls reach
the same event channel. `Snapshot().VideoSources` provides typed owners and labels
and clears on media disconnection or call end. Outgoing video uses source zero.
Applications provide their own capture, codecs and playback; these server interfaces
do not create browser media devices. The actual WebSocket tests cover PCM/H.264
framing and source/keyframe controls.

## Campaign follow-ups (beta)

Both campaign surfaces accept `CampaignFollowUp` on create and update. A nil
`FollowUp` request field omits the setting; `&Nullable[CampaignFollowUp]{}` sends
`null` to remove it from an unlaunched draft. Use `CampaignFollowUpTextMessage{Text: ...}` or
`CampaignFollowUpTemplateMessage{TemplateID: ...}`. Each variant supplies its own
discriminator; a nil message is rejected before transport.

```go
followUp := polymorfa.CampaignFollowUp{
    Message: polymorfa.CampaignFollowUpTextMessage{Text: "Hi {{first_name}}, still interested?"},
}
_, err := client.Campaigns().Update(ctx, projectSlug, campaignID, polymorfa.UpdateCampaignRequest{
    FollowUp: &polymorfa.Nullable[polymorfa.CampaignFollowUp]{Value: &followUp},
})
```

The first delivery starts the delay; the first read restarts it before sending
starts. Replies and opt-outs cancel the follow-up, and expired waits never send.
`DelaySeconds` accepts 60 through 604800 and defaults at the API to 86400.
`ExpirySeconds` accepts 86400 through 2592000, defaults to 604800, and must exceed
the delay. Expiry starts at the first send. Returned timing fields remain optional.
A campaign must send a single first message; follow-up text cannot contain tracked
links. The API enforces beta enrollment and returns `403 feature_unavailable`
when the team is not enrolled.

`CampaignRecipient.FollowUp` retains typed status, receipt anchor, due/expiry times
and reason. `CampaignAnalytics.FollowUps` is optional; the Platform report is
required. `CampaignFollowUpReport` counts these outcomes separately from the first
message. Follow-up timestamps are Unix milliseconds. Native fixture verification
covers the merged contract; no live follow-up campaign or publication was exercised.

## Raw pagination

`PaginateRaw[T]` accepts any SDK client with a `Raw` method and a decoder that
receives the JSON body and response metadata. Return `PageResult[T]` with items
and the next cursor; an empty cursor ends pagination. `RawPaginationOptions`
changes the cursor query key from `cursor` to the API's key. `NextPage(ctx)` loads
one more page, and `All(ctx)` iterates lazily. Cancellation, request options and
project confinement apply to every page. Repeated cursors fail with
`invalid_response`. Query parameters and headers are copied before loading.

```go
page, err := polymorfa.PaginateRaw(ctx, project, polymorfa.RawRequest{
    Method: "GET", Path: "/events",
}, func(body json.RawMessage, metadata polymorfa.Metadata) (polymorfa.PageResult[polymorfa.PlatformEvent], error) {
    var wire struct {
        Data []polymorfa.PlatformEvent `json:"data"`
        Page struct { NextCursor string `json:"nextCursor"` } `json:"page"`
    }
    if err := json.Unmarshal(body, &wire); err != nil { return polymorfa.PageResult[polymorfa.PlatformEvent]{}, err }
    return polymorfa.PageResult[polymorfa.PlatformEvent]{Items: wire.Data, NextCursor: wire.Page.NextCursor}, nil
})
```

Use the typed resource method when it represents the endpoint. Raw decoders are
application-owned; validate the endpoint's response shape before returning items.
The follow-up union replaces the unpublished `CampaignFollowUpMessage` struct.
Use the text or template variant when upgrading a source checkout. Follow-up
business constraints and enrollment remain enforced by the API.

### Local upload encryption

`EncryptWhatsAppMedia` encrypts a byte slice. `EncryptWhatsAppMediaTo` reads an
`io.Reader` incrementally and writes encrypted bytes to an `io.Writer` with
bounded working memory. Choose `UploadImage`, `UploadVideo`, `UploadAudio`,
`UploadVoiceNote`, `UploadDocument` or `UploadSticker`; a 32-byte media key is
created with the operating system random source unless you supply one for an
immutable repeat pass. Plaintext defaults to a 256 MiB limit.

```go
media, err := polymorfa.EncryptWhatsAppMedia(ctx, plaintext, polymorfa.EncryptMediaOptions{
    MediaType: polymorfa.UploadImage,
    MimeType: "image/jpeg",
})
if err != nil { return err }
// media.Ciphertext is ciphertext plus its ten-byte MAC. Keep MediaKey private.
```

For a repeat pass, supply the first pass's `MediaKey` in `EncryptMediaOptions`
and its `EncryptedMediaInfo` as the final argument to `EncryptWhatsAppMediaTo`.
The source must reach EOF and match both hashes and lengths before the final
ciphertext block and MAC are released. Changed sources, cancellation, missing
EOF, read/write failures and size overruns fail without a complete upload body.
The caller owns and closes the reader/writer and must discard partial output
on failure. This helper performs local encryption; it does not finalize a CDN
upload or send a message. Formatting and JSON serialization omit the media key
and ciphertext. Independently calculated vectors and repeat-pass failure tests
cover all six media kinds.

### Encrypted upload egress

`MessagingClient.WhatsAppMedia().UploadBytes()` uploads a byte slice;
`Upload()` accepts a `WhatsAppMediaSource` factory returning a fresh
`io.ReadCloser` of the same plaintext on every call. The SDK closes each
returned stream. A hashing pass obtains the encrypted hash before the upload
pass; changed sources fail before a complete encrypted body or document
finalization is released.

`UploadWhatsAppMediaOptions.Egress` defaults to `relay`: the API receives
ciphertext plus its MAC and forwards it through the session's connection.
`direct` requests a short-lived grant and uploads from your process. Neither
upload mode sends plaintext or the media key to an upload endpoint. Keep the
returned `MediaKey` and location private.

Direct uploads preserve the exact grant token and upload parameters, refresh a
401 grant, resume interrupted ordinary uploads, and retry network errors,
408 and server errors except 507. Redirects are refused. Document uploads above
50 MiB use consecutive parts and finalize only after the source's EOF/hash
check. Part size is configurable from 1 byte to 64 MiB; the SDK buffers one
part for repeatable retries. API credentials, cookies and caller headers are
excluded from CDN requests. The direct network operation's timeout covers
requests and response bodies; the caller's context also cancels source reads.
A cancellation or timeout does not undo a provider upload that already ran.

`CreateUploadGrant()` and `RelayUpload()` are also available for applications
that supply their own encrypted-body factory. Applications using these lower
level methods own source immutability and integrity checks. Upload methods
select API version `2026-10-14` per request by default; existing SDK methods
retain their `2026-09-22` default. The additive API must be enabled and available
in the selected environment; a source checkout does not establish that access.

### Sending uploaded media

`ToWhatsAppMediaSendDescriptor(upload)` converts an encrypted upload result to a
validated descriptor. Set `MediaContent.Descriptor` for image, video, file or
voice messages, or `StickerContent.Descriptor` for a sticker. Voice notes also
set `MediaContent.PTT` to true. Optional `WhatsAppMediaSendMetadata` carries a
thumbnail, dimensions, duration, waveform, key timestamp or sticker animation.
Descriptors cannot be combined with URL/base64/MIME inputs; stickers require
`image/webp`. Keys and hashes use binary slices locally and standard base64 on
the wire. Returned descriptors remain typed and redact ordinary formatting and
JSON; `Wire()` explicitly exposes secret fields.

Descriptor message sends select API revision `2026-10-14` unless overridden;
ordinary sends keep the legacy default. A standard message send transmits its
media key to Polymorfa. Applications requiring customer key custody send through
their application sidecar instead. Keep descriptors and explicit wire maps out
of logs and error details.
