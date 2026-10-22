# Python web hosts

FastAPI and Django run the same loopback application. Jinja templates render
the page, HTMX submits sign-in and sign-out, and the browser mounts the existing
Polymorfa Web Components. The Python SDK remains in the server process.

From the repository root:

```sh
npm ci
node examples/python/web_host/build-assets.mjs
uv run --project packages/python --extra fastapi uvicorn \
  --app-dir examples/python/web_host fastapi_app:app --host 127.0.0.1 --port 8080
```

Set `EXAMPLE_APP_USERNAME`, `EXAMPLE_APP_PASSWORD`, `POLYMORFA_PROJECT_TOKEN` and
`POLYMORFA_SESSION`, `POLYMORFA_RECIPIENT` and `POLYMORFA_WEBHOOK_SECRET` in the server environment before starting the host. Open
`http://127.0.0.1:8080`. Use the `django` extra and `django_app:application` to
run Django. `EXAMPLE_APP_ORIGIN` changes the exact allowed loopback origin;
`POLYMORFA_API_BASE_URL` optionally changes the API origin. Asset building
bundles the workspace Web Components and checks the SHA-256 digest of HTMX 2.0.4.

The example has one configured application account. Sign-in creates a random
server-held session with a 30-minute lifetime and an HttpOnly, SameSite=Strict
cookie. POST routes check the application origin. The token endpoint derives
the application identity and authorized number on the server and requests a
ten-minute client token. Browser input cannot select a number or identity.
The endpoint returns only browser claims with `Cache-Control: no-store`.
Sign-out revokes the application session and disposes the browser client.
The connection indicator describes the browser grant; it does not establish
a connected WhatsApp number.

The inbox reads an authenticated, application-owned in-memory conversation. Text
sends call the native Python SDK with a caller UUID idempotency key and the
server-assigned Number and recipient. Unknown outcomes retain that key for a
retry; a changed body with the same key is rejected. The example keeps at most
128 send attempts and 100 messages until the process stops. It does not enable HMS.

Register `/webhooks/polymorfa` as a native webhook for the assigned Number with
`message.received` and `message.ack`, using the same signing secret. Both frameworks
verify the original bounded request bytes through the Python SDK before updating
the inbox. Display timestamps use whole seconds, matching native message events, so a
same-second reply retains arrival order rather than sorting before its send.
Incoming events must match the Number and canonical conversation ID
from the send receipt. Phone matching is only a fallback before that ID is known.
Duplicate event IDs are ignored within a bounded 1024-event window.
`POLYMORFA_EXAMPLE_TRANSPORT=local-test-number` labels simulated transport in the UI.

Before public hosting, integrate live application membership, authorization,
HTTPS, durable sessions and durable conversation/deduplication storage. Keep
project and organization credentials in the server. The separate token and
supplementary connection routes remain examples; this inbox does not use them.

`packages/python/tests/test_browser_hosts.py` runs both ASGI applications over
real HTTP. It verifies the upstream credential and API version, server-selected
mint fields, POST-only sign-in, invalid credentials, foreign origins and
revocation after sign-out. Both hosts were also exercised in a browser with a
synthetic upstream: sign-in mounted the real components, one mint served the
browser session, the inbox rendered, and sign-out removed the components.
No real number, customer credentials or live provider was used.

The Connect number endpoint creates a hosted supplementary linked-device invitation for the server-assigned `POLYMORFA_SESSION`. Assign an eligible Official Number that can add linked devices. The API still checks assignment, eligibility, consent and funding. Browser fields cannot choose another Number or change custody. This does not create an initial Number or establish live WhatsApp pairing.

The host HTTP tests also verify native sends, fixed targets, idempotent replay,
signed replies, event deduplication, reload and logout for both frameworks.
Local native Inspector video acceptance is recorded separately from these HTTP
tests and does not establish staging, production or registry availability.
