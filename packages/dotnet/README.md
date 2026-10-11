# Polymorfa .NET SDK

Handwritten server SDK for .NET 8 and later. This package is in development and has not been published to NuGet. It uses the API contract revision `2026-09-22` pinned in this repository.

Create a messaging client with an organization API key or a project token. Keep server credentials in your server process.

```csharp
using Polymorfa.Sdk;

using var client = new MessagingClient(
    Credential.OrganizationApiKey(Environment.GetEnvironmentVariable("POLYMORFA_API_KEY")!));
var response = await client.Messages.SendAsync(
    "support",
    new SendMessageRequest(
        new ConversationReference(PhoneNumber: "+15551234567"),
        new TextContent("Hello")));
Console.WriteLine(response.Data.Data.Id);
```

Organization and project clients provide immutable project views. A project token requires an explicit project ID and cannot be rebound to another project. Messaging client tokens cannot call server administration methods.

Every response includes status, API version, request ID, attempt count, and safe response headers. Request options support cancellation, timeout, API version, custom headers, and an explicit idempotency key. Safe reads and keyed writes retry transient failures; ordinary writes do not. Message sends use a stable key throughout retries. Call links and transient call reactions never retry automatically.

`Webhooks.ConstructEvent` verifies native HMAC signatures against the exact raw request bytes before parsing. `ConstructLocalEvent` separately verifies timestamped CLI forwarding signatures. Unknown event names retain their envelope and payload. Deduplicate processed event IDs in your application.

Typed resources include sessions, all 20 message content kinds, QuickLinks, webhooks, Business, Channels, contacts, groups, hosted history, profile, presence, labels, privacy, identities, client token rules, organization metadata, billing, customer management, project settings, BanSafe, Flows, Functions, Voice, usage, SIP, and call controls. Native HTTP tests check the methods recorded in `coverage.json`.

Known webhooks have typed payloads for all 84 names in the pinned TypeScript contract. Unknown events retain their envelope and payload. Event streams provide asynchronous enumeration and resume from a saved cursor. Media helpers verify SHA-256 and HMAC before releasing decrypted content; API downloads use a separate credential-free storage client. Voice upload sends bytes over that independent storage transport, then completes the asset through the API.

All 439 REST operations covered by the pinned TypeScript server SDK have handwritten C# methods and native HTTP fixtures. Campaign supplements add three more operations; Graph and testing-phone supplements have separate fixtures. This is source-level contract coverage, not a registry release or hosted acceptance result.

`CallsClient` tracks incoming and outgoing calls. `Call` provides answer, join, reject, leave, end, participant controls and typed media frames. Connections authenticate in the first WebSocket frame, refresh expiring credentials, detect missed heartbeats and reconnect within a bounded attempt budget. Media reconnect preserves connection identity and acknowledged preferences. `CallsTokenSource` shares concurrent provider requests while preserving each caller's cancellation. PCM uses the rate announced in `Call.SampleRate`; H.264 frames preserve source and timestamp fields.

`WhatsAppMedia.DecryptToFileAsync` and `DownloadToFileAsync` authenticate encrypted media before decrypting it into a private scratch file and atomically committing the verified result. They bound input size, clean up failures and preserve existing files unless overwrite is requested. `MessagingMedia.DownloadToFileAsync` performs bounded API media downloads over the separate credential-free storage transport.

The [examples](examples/README.md) include an ASP.NET Core authenticated token/webhook server, a reusable Razor component for Blazor and MAUI Blazor Hybrid hosts, and a programmatic Calls agent. Native builds verify the examples; device and browser hosting require application-specific authentication and frontend bundling.

Signal integration is owned by the Signal workstream and is outside this package change.

Run the native checks from the repository root:

```sh
node scripts/verify-native-sdk.mjs dotnet
```
