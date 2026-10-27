# MAUI Blazor Hybrid

This Mac Catalyst application hosts the existing `blazor-components` Razor component and `@polymorfa/elements`. It uses an authenticated application server to mint short-lived client tokens and load inbox history. It contains no server API key. These development sources do not establish registry publication or hosted API availability.

## Build and run

Use .NET SDK **10.0.401**, workload set **10.0.401**, MAUI **10.0.20** and Xcode **26.6** on an Apple Silicon Mac. The [official Mac Catalyst release](https://github.com/dotnet/macios/releases/tag/dotnet-10.0.1xx-xcode26.5-10318) supplies pack **26.5.10318** for Xcode 26.6. Workload set `10.0.401.1` targets another Xcode version; use the pinned set below. See the [MAUI Mac Catalyst CLI guide](https://learn.microsoft.com/en-us/dotnet/maui/mac-catalyst/cli?view=net-maui-10.0) for platform setup.

From the repository root:

```sh
npm ci
npm run build:workspaces
node packages/dotnet/examples/build-elements.mjs
dotnet workload install maui-maccatalyst --version 10.0.401
dotnet build packages/dotnet/examples/maui/app/Polymorfa.Example.Maui.csproj -f net10.0-maccatalyst26.5 -c Debug -p:TreatWarningsAsErrors=true
open "packages/dotnet/examples/maui/app/bin/Debug/net10.0-maccatalyst26.5/maccatalyst-arm64/Polymorfa MAUI.app"
```

Start the [ASP.NET Core example](../README.md#aspnet-core) at `http://127.0.0.1:58284` with its Development demonstration identity configured before signing in. Its server owns `POLYMORFA_API_KEY`, `POLYMORFA_SESSION` and `POLYMORFA_EXAMPLE_PASSWORD`. Enter only the application password in MAUI. Keep API credentials in server configuration. Replace the demonstration identity with your application's authorization before deployment.

`app/MauiProgram.cs` sets the trusted application server at build time. Debug uses the loopback address above. Release uses `https://your-application.example/`; replace that placeholder with your application server's HTTPS address before building a release. JavaScript, request bodies and runtime environment variables cannot select another server. The local networking entitlement permits the development loopback host; it does not disable certificate verification or permit arbitrary insecure origins.

## Authentication bridge

The native bridge keeps the HttpOnly application cookie in an in-memory `CookieContainer`. It sends the application password with POST and keeps the cookie out of JavaScript. The shared components run at the bundled WebView origin `app://0.0.0.1`, which cannot use the server's Strict SameSite cookie directly. Their fixed config, token, history and connection requests cross the native bridge; the native client supplies the configured server's exact Origin. Server routes retain their authentication and origin checks.

The bridge passes only a fixed action identifier. Browser-supplied headers, cookies, session identifiers and bodies cannot choose the trusted principal or API scope. Unrelated API requests retain the ordinary browser client transport and its short-lived scoped token. There is no general-purpose URL proxy. Redirects are refused, responses are bounded to 1 MiB, and a 30-second deadline covers both response headers and body. Unknown non-JSON responses become a safe error envelope.

Sign-out calls the server's session revocation route, clears native cookies and removes the components. A server sign-out failure reports that only local clearing was confirmed. An unauthorized response clears the local session and removes the mounted components. Native cookies are not persisted across app restarts.

## Verification

The bridge tests need .NET 8 or later and no MAUI workload:

```sh
dotnet run --project packages/dotnet/examples/maui/bridge-tests/Polymorfa.Example.Maui.Bridge.Tests.csproj
node packages/dotnet/examples/maui/bridge-tests/native-bridge.test.mjs
```

The console tests use actual TCP HTTP responses to check authentication, exact Origin, fixed route admission, cookie isolation, redirects, HTML failures, body limits, cancellation, stalled-body deadlines, revocation and logout. The JavaScript tests check the opaque WebView origin, route and method allowlists, discarded browser fields, cancellation and restoration of the original fetch function. An optional `--live http://127.0.0.1:58284/` argument exercises the local ASP.NET Core example with the synthetic test password `local-example-only`.

The Mac Catalyst app was built with warnings treated as errors and exercised on macOS 26.6: native sign-in mounted the shared components, obtained a scoped token, loaded the empty synthetic inbox and signed out. The owning ASP.NET server independently confirmed the login, config, token, history and logout requests. This proves the local native host and authentication bridge; it does not prove live WhatsApp or provider connectivity. Windows, Android and iOS hosts are not supplied or exercised.
