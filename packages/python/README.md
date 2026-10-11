# Polymorfa Python SDK

Handwritten asynchronous server client for Python 3.10 or newer. The local
package is not published. `coverage.json` records implemented and missing
operations against the pinned TypeScript reference.

```python
import asyncio
import os
from polymorfa import AsyncMessagingClient, Credential, RequestOptions


async def main():
    credential = Credential("organization_api_key", os.environ["POLYMORFA_API_KEY"])
    async with AsyncMessagingClient(credential) as client:
        result = await client.messages.send(
            "support",
            {
                "conversation": {"phoneNumber": "+15551234567"},
                "content": {"text": "Hello"},
            },
            options=RequestOptions(idempotency_key="my-stable-send-id"),
        )
        print(result.metadata.request_id)


asyncio.run(main())
```

Use `AsyncClient` for organization Platform operations, and
`client.project(project_id)` for an immutable project binding. Initialize
`AsyncProjectClient` directly with a project token. A project client refuses
rebinding and confines `raw.request` paths to its bound project. A project
view shares its organization's connection pool; close the root after all
views have finished.

Every response has `data` and `metadata` (status, request ID, API version,
headers and attempts). Messaging methods retain API envelopes. Developer
Platform resources unwrap the envelope. Unknown response fields remain
available. HTTP failures raise semantic exception classes with code, request
metadata and API links. Non-JSON proxy errors become a safe HTTP error.

`RequestOptions` changes timeout, version, retry count, headers and idempotency
for one request. Cancelling an asyncio task interrupts the request or stream.
Safe reads and explicitly keyed writes retry at most twice by default.
Message sends and reactions create an idempotency key once when one is
omitted. Replayed responses are final. Configure `base_url`, `proxy` or
`http_transport` on construction. Credentials are refused in browser/WASM
runtimes. Default API version is `2026-09-22`.

`construct_webhook_event(raw_bytes, signature, secret)` checks HMAC-SHA256
before parsing JSON. Read the exact request bytes in your framework. Unknown
event types preserve their payload and set `known=False`. Native webhook
signatures have no timestamp/replay checks; deduplicate verified event IDs in
your durable store. `events.stream` reconnects with the last delivered cursor;
cancel the consuming task to stop it. `CursorPage` supports `next_page()` and
`async for` with cursor-loop detection.

Run package checks with `uv sync --extra test`, `uv run ruff check`,
`uv run ruff format --check`, `uv run mypy src/polymorfa`, `uv run pytest`, and
`uv run python -m build`. These checks exercise local mock contracts. They
do not establish production availability or registry publication.

`client.client_tokens.mint` accepts either a session target or a Customer
ID, and `retrieve_rules`, `update_rules`, and `delete_rules` manage session
client rules. These methods require a server credential. Customer token
access remains subject to the API's beta eligibility and ownership checks.

`decode_whatsapp_media`, `download_whatsapp_media` and
`decrypt_whatsapp_media` support image, video, audio, document and sticker
payloads. Downloading requires a plaintext hash, validates encrypted hashes
and the media MAC, limits bytes, confines redirects to WhatsApp CDN hosts,
and uses a connection without API credentials. The media key is hidden in
object representations.

Install the `calls` extra to use `MediaSocket` with native WebSockets.
The socket authenticates in its first frame, uses `pmfa.calls.v2`, and sends
or receives PCM and H.264 media. This is the media attachment primitive;
application call orchestration and additional lifecycle helpers remain
unfinished. Install the `fastapi` or `django` extras for framework examples;
`fastapi_webhook_event` and `django_webhook_event` verify the raw request body.
See `examples/python` in the source tree for executable application examples.

`chats` exposes typed stored history pages, message media downloads, message
edits, archive controls and service-window observations. Hosted history
requires the API's HMS enrollment and history permission; service windows
have separate Official API eligibility. `business` exposes profile,
catalog, product, collection, order, compliance and linked-account methods,
including asynchronous accepted response variants.

`voip` provides typed Calls REST controls, permission checks, participant
controls, call settings and quality/error reports. Call-link creation and
preview reject idempotency keys and never retry. Reactions and hand-state
changes also never retry. Other call writes retry only with an explicit
idempotency key. A browser client token cannot choose a server participant;
server-only link, permission, check and settings operations reject it.

`ban_safe` reads and changes project ceilings, warmup plans, insurance
evidence, health policies and Number overrides with server credentials.
Platform equivalents are under `AsyncClient.projects` and
`AsyncClient.sessions`. Entitlement and applied-state fields remain in the
response; configuring a setting does not grant access. Send the version
from a recent health-policy read when updating it.

Platform projects expose typed lists, creation, production enrollment and Hybrid
Link merge candidates. Platform sessions expose typed lifecycle batches, reviewed
tier quotes and capability variants. A quote preserves fractional credit amounts
and separates Hybrid Link transition progress from the tier change status.

Project templates use handwritten definitions for headers, buttons, carousels,
authentication and limited-time offers. Official API templates, linked catalogs,
marketing status and Flow public-key registration use their distinct provider
contracts. Provider template writes, template submission and Flow registration
send one request even when an idempotency key is supplied; reconcile an uncertain
result by reading provider state before sending another write.

Team call controls provide typed retention, blocked destination prefixes and a
cursor-paginated do-not-call list. Billing methods retain fractional credit
amounts, enforce UUID and revision bounds, and normalize ordered resource IDs.
Saving these settings uses the API's existing authorization and availability.

Organization metadata reads cover members, server key and project token metadata,
audit logs, bans and security incidents. Customer methods keep the project ID on
reads, provide cursor pagination, and distinguish the initial pairing-link URL
from the null URL returned after a replay.

Observation and Hybrid Link policy reads preserve inheritance and revisions.
Saved session and QuickLink defaults bind to the organization or project client.
Official API groups expose typed join decisions and force every provider change
to one attempt. Onboarding continuation and Testing methods require a server
credential; Testing phone methods expose simulated device and message results.
SIP trunks provide typed credentials and endpoint variants, with ownership checks
before an organization key acts through a project client.

Retained events, webhook signing generations and delivery attempts expose typed
metadata and payload-availability states. Indexed event pages preserve offsets
and filters across pages. The event stream decodes retained payloads, resumes
from checkpoints, reports gaps and reconnects, and supports explicit
acknowledgements. Closing a stream interrupts a pending connection or body read.
Operations support typed transitions, long polling and bounded waits.

Messaging campaigns retain delivery timestamps, A/B outcomes and send windows.
Platform campaigns require the owning project on reads, report conversions in
separate currencies, and return nullable drafts. Recipient and audience appends
send once unless both a request key and a retry override are supplied. Platform
draft creation does not accept request keys or automatic retries.

Project clients expose `functions` with deployments, secrets and invocations,
and `flows` with provider receipts, Number endpoints and encryption custody.
These resources bind every request to their project; inputs cannot replace it.
Writes and deletes send once. Function invocations require an explicit request
key, and a replay never returns the initial executor response. Forward Flow
endpoints return their signing secret once.
