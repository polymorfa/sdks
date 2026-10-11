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
