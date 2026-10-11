# .NET integrations

These source examples use the development SDK. They do not establish registry or hosted API availability.

## ASP.NET Core

`aspnet-core` compiles against .NET 8. Set `POLYMORFA_API_KEY`, `POLYMORFA_SESSION`, and `POLYMORFA_WEBHOOK_SECRET` in server configuration. Run `dotnet run --project aspnet-core/Polymorfa.Example.AspNet.csproj` from this directory.

Register your application's authentication scheme where the example indicates. Token requests require an authenticated subject and a `polymorfa_session` claim equal to the configured session. Resolve that claim from trusted application authorization; never copy a browser-supplied session or customer identifier into it. The token endpoint uses POST, checks the same origin, returns a five-minute client token and disables caching. It fails closed until authentication is configured.

The webhook endpoint verifies the exact bounded raw body using `x-webhook-signature`. Add durable event-ID deduplication and application processing before using it for delivery receipts. Do not log the request body.

Bundle `aspnet-core/wwwroot/elements.ts` to `elements.js` with your frontend tooling. It mounts the existing TypeScript Web Components; server credentials stay in ASP.NET Core.

## Blazor WebAssembly and MAUI Blazor Hybrid

`blazor-components` provides the same reusable Razor component for either host. It compiles independently; it does not reference the server SDK or contain server credentials. Reference its project from the host, bundle `wwwroot/messaging.ts` to `messaging.js`, and render `<Messaging TokenEndpoint="/api/polymorfa/token" />`. The component imports the module after rendering and disposes the browser client when removed.

A same-origin Blazor WebAssembly application can use the authenticated ASP.NET Core token endpoint above. A MAUI host must supply its own authenticated HTTPS token route and application session transport. Do not embed an organization key or project token in the app, and do not point a signed app at a browser-selected API host. Configure CORS and authentication in the owning application. The Razor component build does not verify a MAUI device or WebAssembly runtime.

Use one mounted component per browser client. Install and bundle the same accepted TypeScript package version as the owning release. These integrations reuse `@polymorfa/elements`; they do not implement another messaging or calling UI.

## Programmatic Calls

`calls-agent` connects the server lifecycle socket, answers incoming calls and consumes typed PCM frames. Set `POLYMORFA_API_KEY` and `POLYMORFA_SESSION`, then run `dotnet run --project calls-agent/Polymorfa.Example.Calls.csproj`. Add consent and application policy before answering. Ctrl+C cancels the event and media consumers. Production providers can use `CallsTokenSource` to supply and refresh short-lived credentials.

The client reconnects media with the same connection identity, restores acknowledged media preferences and bounds retry attempts. Browser call media remains in the TypeScript Calls package.
