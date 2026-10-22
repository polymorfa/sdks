# .NET integrations

These source examples use the development SDK. They do not establish registry or hosted API availability.

## ASP.NET Core

`aspnet-core` compiles against .NET 8. Set `POLYMORFA_PROJECT_TOKEN` (or `POLYMORFA_API_KEY`), `POLYMORFA_SESSION`, `POLYMORFA_RECIPIENT` and `POLYMORFA_WEBHOOK_SECRET` in server configuration. Run `dotnet run --project aspnet-core/Polymorfa.Example.AspNet.csproj` from this directory.

The Development-only sign-in route requires `POLYMORFA_EXAMPLE_PASSWORD`; it is disabled without that setting or outside Development. It signs an opaque HttpOnly cookie, validates its server-owned session on every request and revokes it at logout. Restarting this example clears its sessions and signing authority. Replace this demonstration identity with your application's authentication scheme before deployment. Token requests require an authenticated subject and a `polymorfa_session` claim equal to the configured session. Resolve that claim from trusted application authorization; never copy a browser-supplied session or customer identifier into it. The token endpoint uses POST, checks the same origin, returns a five-minute client token and disables caching. The token body includes the browser grant; untrusted request fields cannot change the subject or session.

The webhook endpoint verifies the exact bounded raw body using `x-webhook-signature`. The ASP.NET native inbox projects assigned-Number replies and receipts into a bounded application-owned conversation after signature verification. Do not log the request body.

From the repository root run `npm ci`, `npm run build:workspaces`, and `node packages/dotnet/examples/build-elements.mjs` before starting the example. It mounts the existing Web Components with a custom application data source. Every
text send calls the native C# SDK on the server. Replies arrive through a signed
native webhook, restricted to the assigned Number and canonical conversation ID.
The state holds up to 100 messages, 128 send attempts and 1024 recent event IDs
until the server stops. It does not enable HMS. A UUID key belongs to one text;
unknown outcomes retain it for retry. Display timestamps use whole seconds,
matching native events. Reload restores the authenticated inbox.

Set `POLYMORFA_EXAMPLE_TRANSPORT=local-test-number` to label simulated transport.
The local Inspector recording covers the ASP.NET custom UI, a paired simulated
WhatsApp peer, signed HTTPS delivery, reload and logout. It does not establish
registry, staging or production availability. Blazor and MAUI below still use
their separate browser-grant renderer and empty history route; this recording
does not establish their send/receive acceptance. Server credentials stay in
ASP.NET Core.

## Blazor WebAssembly

`blazor-components` provides the same reusable Razor component for either host. It compiles independently; it does not reference the server SDK or contain server credentials. Reference its project from the host, bundle `wwwroot/messaging.ts` to `messaging.js`, and render `<Messaging TokenEndpoint="/api/polymorfa/token" />`. The component imports the module after rendering and disposes the browser client when removed.

`blazor-wasm` is a runnable same-origin WebAssembly host. Run `dotnet publish packages/dotnet/examples/blazor-wasm/Polymorfa.Example.Blazor.csproj --configuration Release --output packages/dotnet/examples/blazor-wasm/bin/served` and `node packages/dotnet/examples/prepare-blazor.mjs` from the repository root. Start ASP.NET Core, sign in at `/`, then open `/blazor/`. It uses the authenticated ASP.NET Core token endpoint and server-owned API configuration above. The WebAssembly host is checked in a browser against local API fixtures.

Use one mounted component per browser client. Install and bundle the same accepted TypeScript package version as the owning release. These integrations reuse `@polymorfa/elements`; they do not implement another messaging or calling UI.

## MAUI Blazor Hybrid

`maui` is a runnable Mac Catalyst host for the same Razor component. Its native application bridge owns the authenticated application cookie and allowlists fixed config, token, history and connection routes. JavaScript receives short-lived client tokens; it never receives the application cookie or a server API key. The application origin is a build-owned setting. Production configuration requires HTTPS; loopback HTTP is limited to the debug example.

See [the MAUI instructions](maui/README.md) for the supported workload, build and native bridge tests. Local Mac Catalyst runtime proof covers sign-in, component mounting, token minting, inbox loading and logout against synthetic API fixtures. Windows, Android and iOS hosts are not supplied or exercised.

## Programmatic Calls

`calls-agent` connects the server lifecycle socket, answers incoming calls and consumes typed PCM frames. Set `POLYMORFA_API_KEY` and `POLYMORFA_SESSION`, then run `dotnet run --project calls-agent/Polymorfa.Example.Calls.csproj`. Add consent and application policy before answering. Ctrl+C cancels the event and media consumers. Production providers can use `CallsTokenSource` to supply and refresh short-lived credentials.

The client reconnects media with the same connection identity, restores acknowledged media preferences and bounds retry attempts. Browser call media remains in the TypeScript Calls package.

The authenticated ASP.NET connect route adds Linked Devices to its server-assigned
Number. Set `POLYMORFA_SESSION` to an existing Number with an eligible Official
API connection. The route requests a supplementary hybrid QuickLink and ignores
client-supplied session choices. Initial invitations must omit session and
addConnection. Blazor and MAUI use this same authenticated route; bridge/build
checks do not establish browser pairing or live provider acceptance.
