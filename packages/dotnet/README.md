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

`Webhooks.ConstructEvent` verifies native HMAC signatures against the exact raw request bytes before parsing. `ConstructLocalEvent` separately verifies timestamped CLI forwarding signatures. Unknown event names retain their envelope and payload. Deduplicate processed event IDs in your application. `Webhooks.CreateFixture` signs exact JSON bytes for application tests.

Typed resources include sessions, all 20 message content kinds, QuickLinks, webhooks, Business, Channels, contacts, groups, hosted history, profile, presence, labels, privacy, identities, client token rules, organization metadata, billing, customer management, project settings, BanSafe, Flows, Functions, Voice, usage, SIP, and call controls. Native HTTP tests check the methods recorded in `coverage.json`.

Known webhooks have typed payloads for all 84 names in the pinned TypeScript contract. Unknown events retain their envelope and payload. Event streams provide asynchronous enumeration and resume from a saved cursor. `MessagingMedia.SignedUrlExpiry` reads a previously received URL's expiry without a request. Media helpers verify SHA-256 and HMAC before releasing decrypted content; API downloads use a separate credential-free storage client. Voice upload sends bytes over that independent storage transport, then completes the asset through the API.

`Events.LiveSource` and `EventStreamSource` feed decoded webhook bodies to an application-owned store. Each subscription resumes from its saved cursor and skips events whose body was not retained. Dispose the subscription to stop delivery; await `DisposeAsync` or `Completion` to wait for stream cleanup. `OnError` receives terminal stream or listener failures.

All 439 REST operations covered by the pinned TypeScript server SDK have handwritten C# methods and native HTTP fixtures. Campaign supplements add three more operations; Graph and testing-phone supplements have separate fixtures. This is source-level contract coverage, not a registry release or hosted acceptance result.

`CallsClient` tracks incoming and outgoing calls. `Call` provides answer, join, reject, leave, end, participant controls and typed media frames. Connections authenticate in the first WebSocket frame, refresh expiring credentials, detect missed heartbeats and reconnect within a bounded attempt budget. Media reconnect preserves connection identity and acknowledged preferences. `CallsTokenSource` shares concurrent provider requests while preserving each caller's cancellation. PCM uses the rate announced in `Call.SampleRate`; H.264 frames retain timestamps. Outgoing H.264 uses the protocol's reserved source zero; received source ownership is exposed separately.

Use `Call.MediaFramesAsync` for PCM, H.264, source ownership and keyframe requests, and `SendAudioAsync`/`SendVideoAsync` to send encoded media. `VideoSources` is a snapshot of the current connection's owners and clears when media disconnects or the call ends. This native media interface does not require browser tracks.

`WhatsAppMedia.DecryptToFileAsync` and `DownloadToFileAsync` authenticate encrypted media before decrypting it into a private scratch file and atomically committing the verified result. They bound input size, clean up failures and preserve existing files unless overwrite is requested. `MessagingMedia.DownloadToFileAsync` performs bounded API media downloads over the separate credential-free storage transport.

The [examples](examples/README.md) include an ASP.NET Core authenticated token/webhook server, Blazor WebAssembly and MAUI Blazor Hybrid hosts, and a programmatic Calls agent. Native builds verify the examples; ASP.NET and Blazor WebAssembly run in a browser against local API fixtures. The MAUI Mac Catalyst app completes sign-in, component mounting, token minting, inbox loading and logout against the same fixtures. Other MAUI platforms remain unexercised.

Signal cryptography and key custody remain in the customer-operated Signal service; the SDK connects to its local application API.

Run the native checks from the repository root:

```sh
node scripts/verify-native-sdk.mjs dotnet
```

`WhatsAppMediaDecryptor` provides native incremental CBC, MAC and hash verification. `WhatsAppMedia.DecryptStreamAsync` and `DownloadStreamAsync` return asynchronous read-only plaintext streams. The default `MediaVerifyMode.BeforeRelease` emits nothing until complete verification; `Streaming` releases unverified bytes, which must all be discarded if a later read fails. Downloads accept decoded descriptors or existing `LinkedDeviceMessagePayload` values; `MessagingMedia.DownloadFromWhatsAppStreamAsync` exposes the same helper. Dispose the stream/download even when abandoning a body. Reads enforce encrypted/plaintext limits and cancellation. `WhatsAppMediaStreamDownload.WriteToFileAsync` promotes a private partial file only after complete stream verification, preserving the destination on failure. `ConfigureHttpHandler` supports native DNS, proxy and trust-root configuration; the SDK owns cookie, credential and redirect policies, enforces HTTPS WhatsApp hosts and preserves signed URL queries.

Receipt-timed campaign follow-ups are available in the typed Messaging and Platform
campaign requests, campaign responses, recipient summaries, and analytics reports.
A follow-up sends text or a template. Omit its timing fields to use API defaults;
returned timing fields also remain optional. Clear a draft follow-up with an explicit
null (`PatchValue<CampaignFollowUp>.Set(null)`).
The API requires beta enrollment and a single first message, and owns receipt timing,
reply and opt-out cancellation, expiry, and send eligibility. The SDK never grants access.

Use `PaginateRawAsync` for a raw endpoint with its own page shape. Supply a
`RawRequest`, a decoder returning `DecodedRawPage<T>`, and an optional cursor
parameter name. `RawCursorPage<T>` retains the response and metadata, supports
`NextPageAsync` and `await foreach`, and preserves request bodies, filters,
headers, and cancellation across pages. A project client accepts only paths
relative to its bound project.

Voice synthesis uses provider-specific inputs:

```csharp
using var platform = new OrganizationClient(Credential.OrganizationApiKey(
    Environment.GetEnvironmentVariable("POLYMORFA_API_KEY")!));
var speech = new OpenAiVoiceAudioInput(
    "Greeting", "Hello", OpenAiTtsVoice.Alloy, OpenAiTtsModel.Gpt4oMiniTts);
var synthesis = await platform.Voice.Audio.SynthesizeAsync(speech, "project-id");
```

Use `ElevenLabsVoiceAudioInput` with a provider voice ID and an
`ElevenLabsTtsModel` for ElevenLabs. These inputs replace the former string-based
`SynthesizeVoiceAudioInput` constructor. Template definitions use
`TemplateDefinitionVersion.V1`, `TemplateKind`, `TemplateCategory`,
`TemplateVariableType`, `TemplateOtpType`, and `TemplateSurface`. Carousel headers
must be `TemplateImageHeader`, `TemplateVideoHeader`, or `TemplateDocumentHeader`.
Replace numeric/string arguments with those types when updating source callers.

The `Voice.Audio.UploadAsync` stream overload uploads as the source produces
bytes, using a bounded buffer. Declare the exact byte length and content type in
`CreateVoiceAudioUploadInput`; the maximum is 16 MiB. The SDK leaves the caller's
stream open, refuses shorter or longer input, and never completes or retries a
failed storage write. Storage requests use a separate HTTP client, contain no
API credential, and refuse redirects.

Configured API base URLs can include a reverse-proxy path. Requests and relative download capabilities retain that prefix; a trailing slash does not change the request path.

## Customer-owned media, history and Signal service

These unpublished helpers follow TypeScript `254fc6a2d073e7fc79420cf95f9b03927d00c04a`
and Signal service `8aa191ef0d4c318229c91bcdf474bf2d79dac47c`. Local implementation
does not establish deployed access or enrollment. New media/history operations
and descriptor sends select API revision `2026-10-14` per request; existing
operations keep their previous default.

`WhatsAppMedia.EncryptAsync(source, destination, options)` encrypts incrementally
and keeps caller streams open. `PrepareUploadAsync` accepts bytes, a single-use
stream, or a factory returning a fresh stream of identical plaintext. Factories
use a hash pass followed by bounded streaming encryption; the SDK owns and
closes each factory stream. It withholds the final bytes until EOF verifies the
second hash. Single-use inputs buffer bounded ciphertext. The default plaintext
limit is 256 MiB. Cancellation does not undo provider-side bytes already sent.

```csharp
var prepared = await WhatsAppMedia.PrepareUploadAsync(
    _ => Task.FromResult<Stream>(File.OpenRead("attachment.jpg")),
    new(WhatsAppUploadMediaType.Image) { Mimetype = "image/jpeg" });
var uploaded = await client.WhatsAppMedia.UploadRelayAsync("support", prepared);
var descriptor = WhatsAppMedia.ToSendDescriptor(uploaded.Info, uploaded.Location);
await client.Messages.SendAsync("support",
    new(new(PhoneNumber: "+15551234567"), new DescriptorImageContent(descriptor)));
```

Relay sends ciphertext only through the session's connection. `UploadDirectAsync`
uses a short-lived grant and a separate HTTPS client confined to WhatsApp media
hosts. It preserves grant parameters, refuses redirects, refreshes unauthorized
grants, resumes interrupted uploads and sends documents above 50 MiB in parts.
`WhatsAppDirectUploadOptions` configures the separate CDN proxy/trust settings.
No changed source can reach multipart finalization.

Standard `DescriptorImageContent`, `DescriptorVideoContent`,
`DescriptorFileContent`, `DescriptorVoiceContent` and `StickerContent` send the
media key through the API. For zero-knowledge sessions, pass
`descriptor.ToSignalDescriptor(...)` to the local `SignalClient` instead.
That conversion rejects thumbnail, waveform and animation metadata because the
pinned service does not accept them.

`HistoryChunks.DownloadAsync` authenticates encrypted history before decompression
and protobuf parsing. It accepts descriptors or inline payloads, detects
zlib/gzip/raw DEFLATE, and limits inflated data to 512 MiB by default.
Common fields have native types; original protobuf bytes, unknown fields and
`ulong` values remain in `HistoryChunk.Proto`. `DecodeWith` accepts your
application's full-schema decoder. Native history typing covers fewer fields
than TypeScript's complete generated schema.

`SignalClient` is server-only and uses a separate application bearer secret.
It rejects browser execution, sends no Origin header, refuses redirects, and
never holds Signal master/session keys. Native SSE has no resume cursor or
automatic acknowledgement. Commit application data before `AcknowledgeAsync`;
delivery can repeat. `VerifyWebhook` authenticates the exact timestamp and raw
body before parsing. Use a timestamp window and durable event-ID deduplication
before returning 2xx. `SignalHistoryDescriptor.ChunkInput` converts local history
notifications into verified download inputs.

### Customer-owned storage

`Polymorfa.Sdk.Storage` provides schema-2 operations, deterministic per-field
merges, conditional checkpoints, durable session leases and a memory adapter.
`D1BridgeStorageAdapter.ConnectAsync` verifies a signed handshake with a
customer-hosted D1 Worker binding before returning an atomic adapter. Read the
expected authority and table prefix from trusted application configuration and
use an independent customer application secret. Never use a Polymorfa API
credential for the bridge. HTTPS is required outside loopback fixtures, and
redirects are refused.

```csharp
using Polymorfa.Sdk.Storage;
using var adapter = await D1BridgeStorageAdapter.ConnectAsync(new(
    new Uri("https://storage.example.com/"), "customer-app", "app_",
    Environment.GetEnvironmentVariable("CUSTOMER_STORAGE_SECRET")!));
var storage = new CustomerStorage(adapter);
```

The bridge protocol is `polymorfa-d1-storage-v1`, schema 2, source
`9ae35e671f7f4868a67c1562422c5af9284b95c1`. Every response must match the
request nonce, valid exact-body HMAC, expected authority, table prefix and schema.
Commits contain at most 50 writes, including the engine's session fence; reads
and queries are paged at 1,000 rows. Request and response bodies are limited to
8 MiB. Schema setup requires explicit operator enablement in the Worker.
The adapter does not use D1 administrative REST or assume its batches are atomic.

Large batches span fenced commits, with the deduplication marker committed last.
A failed chunk stops before later rows or the marker. Timeouts and cancellation
can leave a commit outcome unknown. Resume through conditional revisions and
saved event/checkpoint state. Persist content, then the conditional checkpoint,
then acknowledge the application event. Storage never enables hosted history or
automatically acknowledges Signal events.

The schema/merge baseline is storage source
`3bacf46f9c4213426314001586f5bae43aaa77de`; the native engine additionally
stops after the first failed CAS chunk. Memory and the D1 bridge are included in
the base SDK. Other provider adapters and full event/history reducers remain in
progress. This package remains unpublished.


The separate, unpublished `Polymorfa.Storage.Sql` package adds
`Polymorfa.Storage.Sql.SqlStorageAdapter`. It uses maintained native ADO.NET
SQLite, Npgsql and MySqlConnector drivers without adding database dependencies to
the base SDK. `SqliteAsync`, `Postgres` and `MySql` accept customer database
connection strings. They do not read Polymorfa database settings. Configure TLS
and customer database roles explicitly; a table prefix is naming, not tenant
authorization. PostgreSQL also accepts an explicit schema. Set
`SqlStorageOptions.CreateTables = false` for operator-managed tables and export
schema-2 DDL with `StorageSqlSchema.Statements`.

```csharp
using Polymorfa.Storage.Sql;
await using var adapter = SqlStorageAdapter.Postgres(
    Environment.GetEnvironmentVariable("CUSTOMER_DATABASE_CONNECTION")!,
    new() { TablePrefix = "app_", CreateTables = false });
var storage = new Polymorfa.Sdk.Storage.CustomerStorage(adapter);
```

Every SQL commit uses a database transaction and rolls back all writes after a
stale revision. Commit capacities are 500 writes for SQLite and 1,000 for
PostgreSQL/MySQL, including the engine's session fence. Scope and cursor indexes
follow schema 2. Invalid or oversized derived identifiers fail before connecting,
preventing PostgreSQL name truncation. Driver errors omit connection strings, SQL
and customer values. SQL adapters require a server application. Hosted
Supabase/Neon/PlanetScale authority and deployment acceptance remain customer
configuration and verification gates. The libSQL, Supabase RLS, document-store
and browser adapters are separate work.
