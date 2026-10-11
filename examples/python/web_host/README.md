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
`POLYMORFA_SESSION` in the server environment before starting the host. Open
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

The history handler exposes an empty application-owned store and retains no
WhatsApp content. Connect it to your authorized history source to display
conversations. Before hosting publicly, integrate your application's actual
authentication, live membership and number authorization, HTTPS origin and
durable sessions. Keep project and organization credentials in the server.

`packages/python/tests/test_browser_hosts.py` runs both ASGI applications over
real HTTP. It verifies the upstream credential and API version, server-selected
mint fields, POST-only sign-in, invalid credentials, foreign origins and
revocation after sign-out. Both hosts were also exercised in a browser with a
synthetic upstream: sign-in mounted the real components, one mint served the
browser session, the empty inbox rendered, and sign-out removed the components.
No real number, customer credentials or live provider was used.
