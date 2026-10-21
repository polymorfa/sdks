# PHP web hosts

Run Laravel with Blade or Symfony HttpKernel with Twig. Both hosts use the PHP server SDK and mount the existing Polymorfa Web Components. HTMX submits the sign-in and sign-out forms.

From the repository root:

```sh
npm ci
node examples/php/web-host/build-assets.mjs
cd examples/php/web-host
composer install
php -S 127.0.0.1:8080 -t public public/router.php
```

Before starting PHP, configure `EXAMPLE_APP_USERNAME`, `EXAMPLE_APP_PASSWORD`, `POLYMORFA_PROJECT_TOKEN`, `POLYMORFA_SESSION`, `EXAMPLE_APP_ORIGIN=http://127.0.0.1:8080` and an absolute `EXAMPLE_STATE_DIR` under a persistent private application directory. The host creates private session and template-cache directories there. Open the configured origin. `EXAMPLE_FRAMEWORK=laravel` is the default; select `symfony` for HttpKernel and Twig. `POLYMORFA_API_BASE_URL` optionally selects the API origin. Authenticated plaintext API URLs are confined to loopback.

These are loopback demonstration hosts with one configured application account. Sign-in creates an opaque random session, retained in a private file for 30 minutes, and an HttpOnly, SameSite=Strict cookie. POST routes enforce the configured application origin. The authenticated token endpoint derives the user and authorized number on the server, mints a ten-minute client token through `clientTokens->mint`, and returns browser claims with `Cache-Control: no-store, private`. Browser request fields cannot select the user or number. Sign-out removes the stored session and disposes the browser client. The inbox uses the native server SDK; the separate token endpoint remains an optional browser-grant example.

Before public hosting, use the application's real authentication, live membership and number authorization, HTTPS origin, managed sessions and CSRF protection appropriate to the application. Keep project and organization credentials exclusively on the server.

Laravel uses its real HTTP application and Blade view service; Symfony uses HttpKernel, HttpFoundation and Twig. Their dependencies and Composer lock file are separate from the SDK package. Blade caches and sessions remain outside the source checkout. Asset building bundles the workspace Web Components and downloads pinned HTMX 2.0.4 after verifying its SHA-256 digest.

Run the native HTTP tests with PHP 8.2 or newer:

```sh
EXAMPLE_STATE_DIR="$HOME/.polymorfa-agent-work/php-web-host-tests" php tests/run.php
```

The test starts loopback servers on ports 31305 and 31306 with synthetic credentials. It verifies both frameworks, initial template rendering, POST-only sign-in, invalid credentials, foreign origins, opaque cookies, exact server-derived SDK mint requests, browser response claims and revocation after sign-out. PHP 8.2 and 8.4 passed these tests. Earlier browser smoke checks covered sign-in and an empty inbox. Functional video acceptance is recorded separately below. No customer credentials or live WhatsApp number were used.

The Connect number endpoint creates a hosted supplementary linked-device invitation for the server-assigned `POLYMORFA_SESSION`. Assign an eligible Official Number that can add linked devices. The API still checks assignment, eligibility, consent and funding. Browser fields cannot choose another Number or change custody. This does not create an initial Number or establish live WhatsApp pairing.

The inbox now calls the native PHP SDK for text sends and consumes signed native
webhooks at `/webhooks/polymorfa`. Configure `POLYMORFA_RECIPIENT` and
`POLYMORFA_WEBHOOK_SECRET` on the server; register `message.received` and
`message.ack` for the assigned Number with the same secret. The browser cannot
choose a different target. Native signatures are checked before parsing and
updates are confined to the assigned Number and canonical conversation ID.

The private `EXAMPLE_STATE_DIR` keeps at most 100 messages, 128 send attempts and
1024 recent event IDs. Clear this directory explicitly to reset the example. It
is application-owned state and does not enable HMS. Sends retain their UUID key
on unknown outcomes; retry the same text and key. Display timestamps use whole
seconds, matching native message events. Laravel and Symfony share these handlers.
The inbox does not use the separate token/connect examples.

Set `POLYMORFA_EXAMPLE_TRANSPORT=local-test-number` to label simulated transport.
The local Inspector video acceptance checks native sends, an independent paired peer's
reply, signed HTTPS delivery, reload and logout. It does not prove registry,
staging or production availability.
