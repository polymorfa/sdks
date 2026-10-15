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


Chat clears and row planning renew the live lease conditionally between reads once
half its duration remains. Expired or replaced leases fail closed. Configure
customer operation deadlines and lease duration so one query or commit can
finish before expiry.

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
configuration and verification gates. The libSQL, document-store and browser adapters remain separate work; a
Supabase RLS preset is exported below.


The separate, unpublished `Polymorfa.Storage.S3` package adds
`Polymorfa.Storage.S3.S3MediaStore` using the official AWS S3 driver. Pass a
customer-owned `IAmazonS3` client with explicit credentials, endpoint, TLS and
retry settings. The helper borrows that client and does not dispose it or copy
Polymorfa API credentials into it. Storage and media operations require a server
application.

```csharp
using Polymorfa.Storage.S3;
var store = new S3MediaStore(new(customerS3Client, "customer-media", "app/"));
var archived = await store.ArchiveAsync(descriptor,
    new("incoming/photo", customerPrivateSpoolDirectory));
var uploaded = await store.UploadToWhatsAppAsync(
    new(messaging.WhatsAppMedia, sessionId, "incoming/photo",
        Polymorfa.Sdk.WhatsAppUploadMediaType.Image));
```

`ArchiveAsync` accepts a decoded descriptor or inbound base64 media and message
type fields. It snapshots mutable descriptor bytes before I/O and requires a
caller-selected private spool parent. It verifies the MAC, padding and plaintext hash, plus the ciphertext hash and
exact length when supplied, before starting any object PUT, then removes its
private spool. A corrupt, truncated or
cancelled download cannot overwrite an existing object. Metadata contains only
the selected media kind, plaintext hash, optional encoded filename and explicit
caller metadata; the helper never derives metadata from the media key.

`UploadToWhatsAppAsync` uses two streaming reads pinned to the same object ETag.
A failed conditional GET or a changed complete second-pass hash fails before
final encrypted bytes or finalization. Relay is the default; select
`S3WhatsAppEgress.Direct` to use grant-based direct upload. Object writes can
have an uncertain outcome after cancellation or transport failure.

This media helper follows source
`254fc6a2d073e7fc79420cf95f9b03927d00c04a`. Native tests exercise the official
driver against MinIO, including verified spooling, conditional reads, changed
objects, cancellation and ciphertext-only relay/direct uploads. Hosted AWS/R2
credentials, IAM policies and deployment behavior remain separate acceptance
gates. This package has not been published.


`Polymorfa.Storage.Sql.SupabaseStoragePreset.Sql` exports the schema-2 customer
tables, live session memberships and forced-RLS policies from storage source
`3bacf46f9c4213426314001586f5bae43aaa77de`. Review and install it once in a
customer-owned migration using `SupabasePresetOptions`. Adapter setup never
installs these policies. Reuse the schema and prefix in `SqlStorageOptions` and
set `CreateTables = false` for the server SQL adapter.

The separate reader role can select only sessions mapped to `auth.uid()` in
`storage_memberships`. It cannot write storage data or memberships. Configure
trusted Supabase/PostgREST JWT enforcement; never expose a direct reader SQL
credential or let a browser set the database subject. Keep reader and server
roles distinct, without superuser/BYPASSRLS rights or reader inheritance of the
writer role. Membership deletion takes effect on the next query. Native
PostgreSQL tests cover all 17 entities, anonymous/write denial, a non-superuser
owner's FORCE-RLS boundary, revocation and missing-subject denial. Hosted
Supabase JWT and deployment acceptance remain separate gates.


The separate, unpublished `Polymorfa.Storage.DynamoDb` package adds
`Polymorfa.Storage.DynamoDb.DynamoDbStorageAdapter` through the official AWS
driver. Pass a customer-owned `IAmazonDynamoDB` client and
`new DynamoDbStorageOptions(namespace, tableName)`. The caller configures
credentials, TLS/endpoints, retries and deadlines, and owns client lifetime.
The adapter never reads Polymorfa API credentials and requires a server app.

The table needs string partition key `pk` and sort key `sk`. Setup validates
these key names. Set `CreateTable = true` only for explicit table creation; AWS
table activation is a separate provisioning gate. Namespaces separate stored
keys; configure customer IAM/table authority independently.

Conditional transactions contain at most 100 writes, including the session
fence. Strongly consistent queries page at 1,000 rows and scan the entity
partition before applying its schema index. `MaxQueryRows` defaults to 100,000
for the complete scanned partition. DynamoDB item and transaction byte limits
still apply. Timeout and transport failures can leave a commit outcome unknown;
resume with saved event/checkpoint state and conditional revisions.

The storage source is `3bacf46f9c4213426314001586f5bae43aaa77de`. DynamoDB
Local tests use the official driver and cover all 17 entities, JSON scalars,
atomic rollback, 2,000-message history, replay, cursor paging, checkpoints,
expired-writer fences and caller-mutation capture. Hosted AWS credentials, IAM
and deployment acceptance remain separate gates.


The separate, unpublished `Polymorfa.Storage.MongoDb` package adds
`Polymorfa.Storage.MongoDb.MongoDbStorageAdapter` through the official native
MongoDB driver. Pass a customer-owned `IMongoDatabase` and
`new MongoDbStorageOptions(namespace)`. The caller configures credentials, TLS,
server selection, connection and operation timeouts and owns client lifetime.
The adapter derives sessions from that database's client, never reads Polymorfa
API credentials and requires a server app.

```csharp
using Polymorfa.Storage.MongoDb;
var adapter = new MongoDbStorageAdapter(customerDatabase,
    new MongoDbStorageOptions("my_app"));
```

Use a replica set or sharded deployment with transaction support. Setup refuses
standalone servers before index changes and creates schema-2 indexes by
default. Set `CreateIndexes = false` for operator-managed indexes. Collections
are named `polymorfa_{namespace}_{entity}`; configure database permissions
separately from the namespace.

Commits use native snapshot/majority transactions and at most 500 writes,
including the session fence. Conditional revisions and the native driver's
transaction retries preserve atomicity. MongoDB document and transaction
lifetime limits still apply. A transport failure or timeout may leave a commit
outcome unknown; recover using saved event/checkpoint state and conditional
revisions.

Queries forward only declared index scope fields. `MaxQueryRows` defaults to
100,000 for the complete matching scope before cursor/range sorting. Bound
retention or configure the limit for the workload. JSON remains JSON, including
literal `$date`, `$binary` and `$numberLong` objects; BSON-specific stored types
are refused. Caller row and query values are captured before asynchronous work.

The storage source is `3bacf46f9c4213426314001586f5bae43aaa77de`.
Actual local replica-set tests cover all 17 entities, literal/scalar JSON,
2,000-message history, atomic rollback, replay, checkpoints, expired-writer
fences, namespaces, read bounds and mutation during a request. Actual standalone
tests prove refusal without partial writes. Hosted MongoDB authorization, TLS,
sharded deployment and operational failover remain customer acceptance gates.


The separate, unpublished `Polymorfa.Storage.Cosmos` package adds
`Polymorfa.Storage.Cosmos.CosmosStorageAdapter` using the official Azure Cosmos
DB .NET driver. Pass a customer-owned `Container` and
`new CosmosStorageOptions(namespace)`. The caller configures credentials,
TLS, endpoints, connection mode, retry policy and timeouts and owns the client.
The adapter uses native stream APIs for its JSON wire shape, independently of
any custom serializer on that client. It never reads Polymorfa API credentials
and requires a server app.

```csharp
using Polymorfa.Storage.Cosmos;
var adapter = new CosmosStorageAdapter(customerContainer,
    new CosmosStorageOptions("my_app"));
await adapter.SetupAsync();
```

Provision the customer database and container separately. The container must
have exactly one partition-key path, `/namespace`; setup verifies it and never
creates resources. Every commit stays in that namespace's logical partition.
Namespace keys complement customer account/container permissions and do not
replace them.

Conditional commits use native atomic batches with at most 100 writes,
including the session fence. Each replacement carries the ETag from its point
read, so a concurrent writer rolls back the complete batch. Deletes replace
payloads with tombstones to preserve conditional identity. Tombstones consume
customer storage; this adapter does not silently purge them. Cosmos document,
batch, logical-partition and throughput limits still apply. A timeout can leave
a write outcome unknown; resume with saved event/checkpoint state and
conditional revisions.

Queries use fixed, parameterized SQL and scan the namespace's entity rows
before applying the schema index, range and cursor. `MaxQueryRows` defaults to
100,000 for that scan; each query response is bounded to 8 MiB. Bound customer
retention and configure operation deadlines and lease duration for the workload.
Caller rows and query scopes are captured before asynchronous work.

The schema source is `3bacf46f9c4213426314001586f5bae43aaa77de`.
Actual local Cosmos DB emulator tests use the official driver and cover all
17 entities, literal/scalar JSON, 2,000-message history, replay, checkpoints,
expired-writer fences, tombstones, namespace/read bounds, incorrect partition
keys and caller mutation. A forced concurrent replacement proves native
ETag-batch rollback with no partial insert. Hosted Azure credentials, account
permissions, TLS, region consistency and operational failover remain customer
acceptance gates.
