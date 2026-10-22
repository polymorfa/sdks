# Native SDK example browser evidence

Tested SDK source: `a01ff3e2ec39cc243a3c81f507b839494ccf484c`.
The screenshots render the actual example hosts and bundled Web Components in
the T3 collaborative browser. These are local fixtures, not published packages.

| Example                   | Desktop viewport | Narrow viewport | Result                                                                                                                                                                  |
| ------------------------- | ---------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Python FastAPI and Django | 1440 x 1000      | 390 x 844       | Browser grant and empty inbox render; logout removes components and token access returns 401.                                                                           |
| Go net/http and Gin       | 1440 x 1000      | 390 x 844       | Same browser grant, empty inbox and logout results.                                                                                                                     |
| PHP Laravel and Symfony   | 1440 x 1000      | 390 x 844       | Same results after the HTMX response settles.                                                                                                                           |
| Rust Yew with Axum        | 1440 x 1000      | 390 x 844       | Real WASM form sign-in, grant, empty inbox and logout succeed.                                                                                                          |
| ASP.NET Core              | 1440 x 640       | 390 x 844       | Grant and empty inbox render; screenshots scroll past the authentication form.                                                                                          |
| Blazor WebAssembly        | 1440 x 1000      | 390 x 844       | Same authenticated ASP.NET server, grant and empty inbox. Separate 1440 x 640 screenshot shows Reconnecting and Retry when the synthetic token service refuses minting. |

All measured document widths fit their viewports. Screenshots can have a
different pixel size because the browser scales its capture; `manifest.json`
records both CSS viewport and PNG dimensions and SHA-256 hashes.

## Fixture limits

- One synthetic application identity and an assigned `authorized-support`
  session. Server SDKs call a loopback token service; the history source is the
  examples' real application-owned empty store. No customer account is used.
- Connected describes the short-lived browser grant. It does not establish a
  WhatsApp connection, customer-owned Signal custody, hosted retention,
  supplementary QuickLink execution or browser-tunnel acceptance.
- No message was sent and no pairing invitation was exercised. The local
  upstream checks the API version and server-selected token fields. Real
  authentication, live membership, enrollment and funding remain API concerns.
- Authentication forms, credentials and customer content are excluded from the
  committed screenshots. ASP.NET logout returns 204 and later token access 401;
  Blazor shares that server session. No desktop logout UI acceptance is claimed.
- MAUI Mac Catalyst builds at this source with SDK/workload 10.0.401 and
  warnings treated as errors. Native interaction remains blocked: the supplied
  desktop driver returns `-10005: The element ID is no longer valid` for controls
  immediately after a fresh accessibility snapshot. No post-sign-in native
  screenshot is claimed. Windows, Android and iOS are outside the supplied host.

The first navigation raced FastAPI startup (`ERR_CONNECTION_REFUSED`); retry
after server readiness passed. The first Rust fixture rejected its legitimate
server-generated UUID identity; correcting that fixture passed without an SDK
edit. The first ASP.NET fixture used an invalid synthetic team key;
the documented credential shape corrected it. Reusing a loopback origin also
cached Yew's static page: a cache reload and distinct URL selected ASP.NET and
passed. These setup failures are not SDK runtime regressions.

## Build and source verification

Node 24 rebuilds all five web asset entry points. Go builds the actual web host;
Rust stable builds the Yew release WASM and Axum server; .NET builds ASP.NET,
publishes/prepares Blazor and builds MAUI. The original Trunk invocation rejected
the inherited `NO_COLOR=1`; `NO_COLOR=true` passed. Dependencies and locks remain
unchanged. This commit adds only screenshots, this index and their manifest.

The 579-operation pinned baseline and separately mapped supplements remain
distinct from final release coverage. API contract dates, publication holds,
versions and runtime logic are unchanged. Matching API acceptance, registry
publication, clean registry installs and deployed customer routes remain gates.
