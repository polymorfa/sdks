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

Before the last command, set `EXAMPLE_APP_USERNAME`, `EXAMPLE_APP_PASSWORD`, `POLYMORFA_PROJECT_TOKEN` and `POLYMORFA_SESSION` in the server environment. Open `http://127.0.0.1:8080`. Use `-framework nethttp` for the standard library host. `POLYMORFA_API_BASE_URL` optionally selects an API origin; authenticated plaintext is restricted to loopback. Asset building bundles the workspace Web Components and downloads HTMX 2.0.4 after checking its SHA-256 digest.

This loopback example has one configured application account. Sign-in creates a random, server-held session with a 30-minute lifetime and an HttpOnly, SameSite=Strict cookie. POST routes enforce the application origin. The authenticated token endpoint derives the user and authorized number on the server, requests a ten-minute client token through `ClientTokens.Mint`, and returns only browser claims with `Cache-Control: no-store`. Browser input cannot select an identity or number. Sign-out removes the server session and disposes the browser client. The displayed connection indicator describes the browser grant; it does not establish a connected WhatsApp number.

The history handler returns an empty application-owned store. Replace it with your authorized history source to display conversations. This example stores no WhatsApp content. Before hosting it publicly, integrate the application's real authentication, live membership and number authorization, HTTPS origin, and durable session management. Keep project and organization credentials exclusively in the server process.

`main_test.go` uses real HTTP servers to verify both hosts, credential/version headers, server-derived mint fields, POST-only sign-in, invalid credentials, foreign origins and revocation after sign-out. The browser flow was also exercised with a synthetic upstream: sign-in mounted the real components, one token mint served the session, an empty inbox rendered, and sign-out removed the components. No real number, customer credentials or live provider was used.

To change the template, regenerate the tracked Go view:

```sh
go run github.com/a-h/templ/cmd/templ@v0.3.960 generate
```

The SDK itself has no Gin, templ or HTMX dependency. This example uses a separate Go module and a local `replace` directive until an SDK release is available.

The Connect number action creates a hosted supplementary linked-device invitation for the server-assigned `POLYMORFA_SESSION`. Assign an eligible Official Number that can add linked devices. The API still checks assignment, eligibility, consent and funding. Browser fields cannot choose another Number or change custody. This does not create an initial Number or prove live WhatsApp pairing.
