# Python parity evidence

Reference: handwritten TypeScript server SDK and Calls source at
`ff51567105b64bf6997e7330ba8eb502d875e7b9`. Native source is handwritten;
OpenAPI snapshots supply coverage attribution, not generated implementations.
The raw pagination, presence catalogs and typing audit also inspected merged
TypeScript `daac84b1bd24c9460a2bcad555629a5466d85e2c` on 2026-10-14.
Primary operation and supplemental API contract pins retain their own revisions.
The coverage manifest and the frequency-cap, audience-segment and drip
entries in `supplements.json` reference TypeScript
`e24cb176fc1124f5fe852ff6c77902648fd13b4a`, which pins the implementation
mirrored, not API acceptance.

`coverage.json` attributes all 439 primary covered operations to typed public
methods and passing request/response tests. The other 140 primary operations
retain the pinned TypeScript exclusions. Its `testFile` values identify the
per-family request/response cases; cases check routes, query/body/header serialization,
decoded response fields, API version and response metadata. The manifest is
not an execution report. Family fixtures use HTTPX request/response seams; shared
behavior fixtures, streams, media, Calls, retention and framework hosts also
exercise actual HTTP/TLS/WebSocket sockets. Neither test category establishes
live API or provider acceptance.

The audit checks the pinned `packages/typescript/src/index.ts`, its client-bound
resources, and `packages/calls/src/index.ts` public exports. Every merged server
resource has a Python public method; `supplements.json` adds twelve route entries
outside the primary ledger and maps the helper groups below to executed tests.
Python uses `cryptography` for the exported TypeScript WebCrypto media algorithms
and asyncio tasks/events for cancellation. The language-specific adapters do not
change the wire protocol. The table records the exercised inventory; route coverage alone does not
establish helper or typing parity.

| Surface beyond primary route coverage | Public Python surface | Execution evidence |
| --- | --- | --- |
| Official API supplements | `cloud_catalogs`, `cloud_marketing`, `flow_encryption` | `tests/test_templates_graph.py` |
| Testing supplements | `testing` phone methods | `tests/test_onboarding.py` |
| Campaign supplements | `campaigns.update` and organization/project `reschedule` | `tests/test_campaigns.py` |
| Generic raw JSON and decoded pagination | `raw.request`, `raw.paginate`, `PageResult`, `RawCursorPage` | `tests/test_python_parity.py`: native HTTP arrays/scalars/null, custom envelopes/cursor names, metadata, request replay, project confinement, invalid cursor and error paths |
| Conversation targets and open Platform campaigns | request target union, `PlatformCampaign.known`, update `extra_fields` | `tests/test_python_parity.py`: native request bodies and preserved unknown fields, strict positive/negative mypy checks |
| Presence catalogs | four public immutable `PRESENCE_*` tuples | `tests/test_python_parity.py`: exact known values |
| Project request logs | `request_logs.list`, `follow`, `tail` | `tests/test_request_logs.py`: actual HTTP for both principals, filter/cursor/date serialization, metadata, oldest-first backfill, rate limits and cancellation |
| Known public catalog values | immutable privacy/presence/testing/voice tuples and mappings, Calls reactions/sample rate and media limit | `tests/test_catalogs.py`: pinned public-export values and frozen privacy mapping |
| Native and local forwarded webhook signatures | `construct_webhook_event`, `construct_local_webhook_event`, signature/fixture helpers | Shared native fixture bodies; `tests/test_wire.py`, `tests/test_webhook_utilities.py` |
| Known webhook DTOs and unknown preservation | `webhook_models`, `is_event` | `tests/test_webhook_models.py`: all 84 event names, typed overload map, signed payloads and envelope extras |
| Decrypted Flow forwarding | `verify_flow_forward_signature` | `tests/test_additional_helpers.py`: exact timestamp bytes, tolerance, altered body, wrong secret and malformed signatures |
| Indexed events, SSE and application-store subscriptions | `events`, `EventStream`, `event_stream_source` | `tests/test_developer_resources.py`, `tests/test_event_stream_native.py`, `tests/test_tracks_event_source.py`: real HTTP resume, gap, acknowledgement, absent payload, cursor and cancellation |
| Existing stored message/media downloads | `media`, `chats.download_message_media_stream`, display filename/signed expiry helpers | `tests/test_downloads.py`, `tests/test_additional_helpers.py`: bytes, metadata, redirects, RFC 8187 names and credential isolation |
| WhatsApp media crypto | `decode_whatsapp_media`, derivation/decryption and download stream helpers | `tests/test_media.py`, `tests/test_media_streams.py`: independent five-kind vectors and real verified TLS CDN fixture requests |
| Atomic file helpers | `write_stream_to_file`, API/WhatsApp file downloads | `tests/test_media_streams.py`: limits, permissions, cancellation/corruption cleanup and preserving an existing destination |
| Voice upload and readiness helpers | `voice.audio.upload`, `wait_until_ready` | `tests/test_voice.py`, `tests/test_additional_helpers.py`: stream bytes, bounded waits, actual HTTP cookie/credential separation and create-only request keys |
| Server Calls and credential caching | `CallsClient`, `Call`, `CallsTokenSource`, lifecycle/media sockets | `tests/test_calls_tokens.py`, `tests/test_calls_runtime.py`, `tests/test_calls_ordering.py`, `tests/test_integrations_calls.py`: actual native WebSocket auth, PCM/H.264, claim handling, token replacement, reconnect and preference acknowledgements |
| Neutral audio/video tracks | `call.audio`, `call.video` | `tests/test_tracks_event_source.py`: native PCM/H.264, source ownership, keyframe requests, detach and final sample rate |
| Team retention facade and known error codes | `AsyncCallRetentionClient`, error-code helpers | `tests/test_team_retention.py` and `tests/test_webhook_utilities.py`: native read/write authorization and pinned code list |
| FastAPI and Django webhook adapters | `fastapi_webhook_event`, `django_webhook_event` | `tests/test_integrations_calls.py`, `tests/test_webhook_examples.py`: real framework request bytes and shipped views |
| FastAPI and Django browser hosts | `examples/python/web_host` | `tests/test_browser_hosts.py`: real ASGI HTTP and upstream SDK mint; both hosts also exercised in a browser with the actual TypeScript Web Components |

Media derivation follows shipped-client evidence from Cellar bundle
`whatsapp-1049950004`: `WAWebCryptoCreateMediaKeys.js:23-29`,
`WAWebCryptoMediaTypeInfo.js:4-12`, and
`WAWebCryptoDecryptMedia.js:19,28-39,41-50,57-60`. These citations establish
the client algorithm; TLS/vector tests establish this SDK's implementation.

The framework hosts expose an empty application-owned history store and one
configured loopback account. They demonstrate authorized server token minting,
template/HTMX integration and mounting the existing browser components. They do
not establish live membership integration, a connected WhatsApp number or real
provider acceptance.

Customer-owned media encryption, relay/direct uploads, send descriptors and
history recovery commands follow TypeScript `254fc6a` and backend
`87af94a85ab5f17dbcca2a06295dcb321ffadf3a`, with new requests selecting pending
`2026-10-14`. Golden vectors, real HTTP relay and negative/static wire checks
verify local behavior. These checks do not prove deployed Number access or
WhatsApp provider acceptance. Local history download/decrypt/inflate/protobuf
decoding, complete protocol types, direct webhook variants, and ETag-pinned
S3 upload/verified archive helpers follow the same producer pins. Generated
protobuf protocol artifacts have schema SHA and compiler provenance; SDK
implementation remains handwritten and strict checked. Customer-owned storage
and the external Signal application consumer are being ported separately.
Browser-only WASM, IndexedDB and UI implementations remain in TypeScript.

API contracts are consumed without server changes. The SDK and local examples
are updated; public Mintlify pages and release preparation are consolidated by
the lead. CLI commands and admin capabilities need no changes because this
package adds no command, state, entitlement or staff control. Registry publication
and live environment acceptance remain separate release gates. Installing a
method does not bypass the API's authorization, HMS enrollment or feature access.
