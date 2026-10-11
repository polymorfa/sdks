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

The typed resources include sessions, messages, QuickLinks, webhooks, call controls, contacts, groups, chats, profile, presence, labels, privacy, identities, client token rules, organization metadata, API key metadata, project token metadata, audit logs, security incidents, and ban history. Event streams provide async enumeration and reconnect from the saved cursor. Remaining resources, full webhook payload typing, media, server Calls sockets, and framework examples are being implemented. The coverage ledger records those gaps; this package does not claim TypeScript parity or customer availability.

Signal integration is owned by the Signal workstream and is outside this package change.

Run the native checks from the repository root:

```sh
node scripts/verify-native-sdk.mjs dotnet
```
