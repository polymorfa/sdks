# Polymorfa .NET SDK

Handwritten server SDK for .NET 8 and later. This package is in development and has not been published to NuGet. It uses the API contract revision `2026-09-22` pinned in this repository.

Create a messaging client with an team key or a project token. Keep server credentials in your server process.

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

Writes that generate an idempotency key prefer `RequestOptions.IdempotencyKey`,
then a caller's case-insensitive `Idempotency-Key` header. Matching header aliases
collapse to one value; conflicting aliases are rejected unless the explicit
option supplies the key. Reusing the same caller key preserves the identity
across separate method calls and their retries. Without a caller key, each method
call receives a new key. Keys contain 1–255 UTF-8 bytes and valid header characters.
The SDK copies request headers without changing the caller's dictionary. A raw
header alone does not enable automatic retries for an unsafe request; endpoint
retry limits and replay behavior still apply.

`Webhooks.ConstructEvent` verifies native HMAC signatures against the exact raw request bytes before parsing. `ConstructLocalEvent` separately verifies timestamped CLI forwarding signatures. Unknown event names retain their envelope and payload. Deduplicate processed event IDs in your application. `Webhooks.CreateFixture` signs exact JSON bytes for application tests.

Typed resources include sessions, all 20 message content kinds, QuickLinks, webhooks, Business, Channels, contacts, groups, hosted history, profile, presence, labels, privacy, identities, client token rules, organization metadata, billing, customer management, project settings, BanSafe, Flows, Functions, Voice, usage, SIP, and call controls. Native HTTP tests check the methods recorded in `coverage.json`.

Known webhooks have typed payloads for all 84 names in the pinned TypeScript contract. Unknown events retain their envelope and payload. Event streams provide asynchronous enumeration and resume from a saved cursor. `MessagingMedia.SignedUrlExpiry` reads a previously received URL's expiry without a request. Media helpers verify SHA-256 and HMAC before releasing decrypted content; API downloads use a separate credential-free storage client. Voice upload sends bytes over that independent storage transport, then completes the asset through the API.

`Events.LiveSource` and `EventStreamSource` feed decoded webhook bodies to an application-owned store. Each subscription resumes from its saved cursor and skips events whose body was not retained. Dispose the subscription to stop delivery; await `DisposeAsync` or `Completion` to wait for stream cleanup. `OnError` receives terminal stream or listener failures.

The existing coverage ledger records 442 covered operations. The separate campaign/custody supplement adds 30 source implementations with TCP fixtures; its ledger adoption is pending. Graph and testing-phone supplements retain their separate fixtures. This is source-level contract coverage, not a registry release or hosted acceptance result.

`CallsClient` tracks incoming and outgoing calls. `Call` provides answer, join, reject, leave, end, participant controls and typed media frames. Connections authenticate in the first WebSocket frame, refresh expiring credentials, detect missed heartbeats and reconnect within a bounded attempt budget. Media reconnect preserves connection identity and acknowledged preferences. `CallsTokenSource` shares concurrent provider requests while preserving each caller's cancellation. PCM uses the rate announced in `Call.SampleRate`; H.264 frames retain timestamps. Outgoing H.264 uses the protocol's reserved source zero; received source ownership is exposed separately.

Use `Call.MediaFramesAsync` for PCM, H.264, source ownership and keyframe requests, and `SendAudioAsync`/`SendVideoAsync` to send encoded media. `VideoSources` is a snapshot of the current connection's owners and clears when media disconnects or the call ends. This native media interface does not require browser tracks.

`WhatsAppMedia.DecryptToFileAsync` and `DownloadToFileAsync` authenticate encrypted media before decrypting it into a private scratch file and atomically committing the verified result. They bound input size, clean up failures and preserve existing files unless overwrite is requested. `MessagingMedia.DownloadToFileAsync` performs bounded API media downloads over the separate credential-free storage transport.

The [examples](examples/README.md) include an ASP.NET Core authenticated token/webhook server, Blazor WebAssembly and MAUI Blazor Hybrid hosts, and a programmatic Calls agent. Native builds verify the examples; ASP.NET and Blazor WebAssembly run in a browser against local API fixtures. The MAUI Mac Catalyst app completes sign-in, component mounting, token minting, inbox loading and logout against the same fixtures. Other MAUI platforms remain unexercised.

Signal cryptography and key custody remain in the customer-operated Signal service; the SDK connects to its local application API.

### Campaign, audience profiles and custody defaults

The 30-operation campaign/custody supplement follows API source
`f97ad78b172e80788c33bdc0fcf28f75db9283ec`. These helpers use
`Polymorfa-Version: 2026-10-14` when `RequestOptions.ApiVersion` is absent.
An explicit override is preserved. Existing helpers retain their `2026-09-22`
default. This is unpublished source; the supplement remains held for release.

`OrganizationClient.AudienceProfiles` provides `ListAsync`, `RetrieveAsync`,
`PutAsync`, `DeleteAsync` and `ListConsentAsync`. Its `Imports` resource provides
`CreateAsync`, `RetrieveAsync` and `CancelAsync`. Profiles contain customer-supplied
campaign data. They do not import WhatsApp contacts, and consent assertions do
not authorize a send. Attribute values use `AudienceProfileAttributeValue`,
including its explicit `Null`; campaign test variables use
`CampaignVariableValue` and admit string, finite number or boolean values.

`OrganizationClient.Campaigns` provides `GetReplyFlowAsync`,
`CreateReplyFlowAsync`, `SetReplyFlowAsync`, `TestSendAsync`,
`ListLaunchApprovalsAsync`, `LinksAsync`, `ExportRecipientsAsync` and
`GetSettingsAsync`. `Audiences.CreateFromCampaignAsync` creates an outcome-based
audience. `OptOuts` provides `GetConfirmationSettingsAsync`,
`UpdateConfirmationSettingsAsync` and `GetConfirmationSummaryAsync`.

A retained `platform.Project(projectId).Campaigns` view exposes the same seven
campaign methods with its captured project. Settings and organization profile,
import, retarget and STOP resources remain on the organization client. The six
Messaging campaign methods use a project slug and keep `SuccessEnvelope<T>`;
all require a server principal. Platform campaign responses retain
`DataEnvelope<T>`. Reply flows use the closed `CampaignReplyText`,
`CampaignReplyButtons`, `CampaignReplyList`, `CampaignReplyForm` send variants
and `CampaignReplyKeyword`, `CampaignReplyChoice`, `CampaignReplySubmission`
matches. Unpaired UTF-16 surrogates are refused before HTTP because the .NET serializer
would replace them. Well-formed Unicode retains the contract UTF-8 and UTF-16
bounds. Responses preserve required nulls and reject malformed successful
responses, unknown variants and missing fields.

```csharp
using var platform = new OrganizationClient(Credential.OrganizationApiKey(apiKey));
using var project = platform.Project(projectId);
await project.Campaigns.SetReplyFlowAsync(campaignId, new(null));
await project.SignalCustody.UpdateCustomerAsync(customerId, new(0, null));
var defaults = await project.SignalCustody.RetrieveAsync();
Console.WriteLine(defaults.Data.EffectiveSignalMode);
```

A null reply-flow ID detaches the flow. Customer custody null restores Project
inheritance. Project updates require a concrete `SignalCustodyMode`; these
settings affect future defaults and do not move existing Number keys. The four
bound `SignalCustody` methods unwrap the data envelope once and retain metadata.
The equivalent organization `Projects` and `Customers` aliases retain
`DataEnvelope<SignalCustodyDefault>`. Disposing a borrowed Project view does not
close its owner's transport. Project tokens cannot rebind to another project;
team keys retain their existing rebind behavior.

Profile and consent lists return one `AudienceProfilePage<T>` with
`Page.NextCursor` and `Page.HasMore`. Exports return one
`CampaignRecipientExportPage` with the exact CSV, next cursor and display
filename. The SDK does not fetch subsequent pages, create files, poll imports
or follow export redirects. STOP updates retain disabled `false` and required
null locale. Import replay keys remain body identity, and ordinary new writes
have no automatic replay by default even when given an HTTP key. Explicit retry
limits remain caller choices. Test sends capture one caller or generated key,
request headers and body for their retries. Cancellation stops the HTTP wait;
it does not cancel an operation already admitted by the API.

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

### Contact frequency caps, audience segments and drips (beta)

These methods follow `contracts/campaign-frequency-cap.json` and
`contracts/campaign-segments-drip.json`. They do not enroll a team in a beta;
the API returns `403 feature_unavailable` when a team lacks access.

`Campaigns.GetFrequencyCapAsync` returns the team limits, `Revision` and
`UpdatedAt` (null until first saved). `UpdateFrequencyCapAsync` replaces both
windows with the revision you read; null limits remove them. The PUT is sent
once, and a stale revision throws `PolymorfaConflictException`, so read again
and reconcile. Campaign create and update take `FrequencyCap`
(`PatchValue<CampaignFrequencyCap>.Set(null)` removes a campaign cap),
recipients report `CampaignRecipientFailureReason.FrequencyCap`, and analytics
add `FrequencyCap.SkippedRecipientCount`.

`OrganizationClient.AudienceSegments` lists, retrieves, creates, updates and
deletes saved segments, and previews a saved segment or unsaved rules.
`ProjectClient` has no segment resource. Conditions are records such as
`AudienceSegmentTagContains` and `AudienceSegmentAttributeCompare`;
`AudienceSegmentValue.Of` keeps each value's exact JSON spelling. Conditions the
SDK does not model decode as `AudienceSegmentUnknownCondition` and are rejected
in requests. Updates and deletes need the last observed revision. Writes and
both previews are sent once; a 409 `state_conflict` means a stale revision or an
evaluation timeout, so re-read or simplify the rules.

Platform create takes `SegmentId` (omission only) and update takes
`SegmentId = PatchValue<string>.Set(null)` to clear it. `Drip` takes
`CampaignDripInput` on create and a partial `CampaignDripPatch` on update; the
SDK applies no defaults and omitted fields keep their stored values. Drip steps
take `DelayUnit` and a per-step `SendWindow`. Ordinary creates allow
`DelayAfterSec` up to 86400; drip creates and every PATCH allow up to 2592000,
and the API checks the stored drip, delay unit and eligibility. `EnrollAsync`
on both campaign resources adds a contact to a continuous drip and is never
retried automatically. Campaign reads expose `Drip`, `EnrollmentOpen`,
`PauseReason`, `SegmentId` and `SegmentSnapshot`; analytics expose per-step
`Drip` results. The new fields are init-only properties, so existing positional
constructors are unchanged.

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
Each payload must contain exactly one complete compressed stream. Truncation,
whole-byte tails, padding bytes, concatenated streams, invalid wrapper headers
and checksum failures return `media_invalid_ciphertext`. Unused bits in the last
required DEFLATE byte are allowed. Gzip optional fields, including long terminated
names/comments and FHCRC, are supported; zlib preset dictionaries are refused.
Inflated overflow returns `media_too_large` before a later bad wrapper trailer.

Decoding snapshots input before its first suspension and validates a full raw
DEFLATE pass plus a last-byte-shortened pass over that same snapshot. Output is
withheld until both passes and wrapper checks finish. Input/output work uses
bounded windows and cooperative cancellation/yields. Cancellation cannot
interrupt a synchronous native decoder or protobuf call already executing.
The default ceiling remains 512 MiB: the compressed snapshot, retained output,
contiguous result and protobuf copies can coexist. This is not zero-copy decoding.
Local exact-stream regressions cover .NET 8.0.3 and 10.0.2; other runtime/platform
acceptance remains separate from these checks.

Common fields have native types; original protobuf bytes, unknown fields and
`ulong` values remain in `HistoryChunk.Proto`. `DecodeWith` accepts your
application's full-schema decoder. Native history typing covers fewer fields
than TypeScript's complete generated schema.

`SignalClient` is server-only and uses a separate application bearer secret of
at least 16 visible ASCII characters; values beginning with `pmfa_` throw
`PolymorfaConfigurationException` before any request.
It rejects browser execution, sends no Origin header, refuses redirects, and
never holds Signal master/session keys. Native SSE has no resume cursor or
automatic acknowledgement. Commit application data before `AcknowledgeAsync`;
delivery can repeat. `VerifyWebhook` authenticates the exact timestamp and raw
body before parsing. Its key must be an independent secret of at least 16 bytes;
keys beginning with `pmfa_` throw `PolymorfaConfigurationException` before any
verification. Use a timestamp window and durable event-ID deduplication
before returning 2xx. `SignalHistoryDescriptor.ChunkInput` converts local history
notifications into verified download inputs.

### Customer-owned storage

Implement `IWhatsAppMediaUploadTransport` for application-owned uploads and pass
it to `WhatsAppMedia.UploadAsync(session, prepared, transport, cancellation)`.
Its `WhatsAppEncryptedUploadBody` exposes media type, encrypted SHA-256, encrypted
length and `OpenAsync(offset)`. It exposes no media key, plaintext or API
credential. Hash getters return copies, and the returned upload information is
captured before calling the custom transport.

`RelayTransport()` and `DirectTransport(options)` implement that same interface
and can be wrapped to add application behavior. Existing `UploadRelayAsync` and
`UploadDirectAsync` remain available. Custom names appear in the result's
`Egress`. Custom transports own network requests and opened streams; pass through
cancellation, close streams and finalize only after the verified stream ends.
Changed-source integrity errors and caller transport errors remain unchanged.
Pre-cancellation prevents transport invocation; in-progress cancellation returns
control to the caller. Custom network code must observe its cancellation token.

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
configuration and verification gates. The browser-local IndexedDB adapter and a
Supabase RLS preset are described below.


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

The `S3MediaStore.UploadToWhatsAppAsync(options, transport, cancellation)`
overload accepts a custom `IWhatsAppMediaUploadTransport` and retains both
ETag-pinned source reads. An independent custom transport makes no Polymorfa API
request; built-in relay/direct transports can also be wrapped.

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

### Customer-owned Firestore

The separate, unpublished `Polymorfa.Storage.Firestore` package adds
`Polymorfa.Storage.Firestore.FirestoreStorageAdapter` through the official
`Google.Cloud.Firestore` 4.5.0 client. Pass a customer-owned `FirestoreDb` and
`new FirestoreStorageOptions(namespace)`. The caller owns project/database
selection, Google credentials, TLS, deadlines and client lifetime. Database
credentials stay separate from Polymorfa API credentials. This server adapter
refuses browser construction.

```csharp
using Polymorfa.Storage.Firestore;
var adapter = new FirestoreStorageAdapter(customerDatabase,
    new FirestoreStorageOptions("my_app"));
```

Collections use `polymorfa_{namespace}_{entity}`. Native transactions read all
touched documents before writing, check row revisions and commit at most 250
writes, including the engine lease fence. A stale revision rejects the complete
batch. Inputs are copied before the first asynchronous call, so retries retain
the prepared row and query scope. Queries use declared equality fields only,
read at most `MaxQueryRows + 1` rows (default 100,001), reject an oversized scan
and apply portable range, cursor and ordering rules. `SetupAsync` does not
provision collections or indexes. The customer configures required composite
indexes and retention. Firestore document, nesting, field-name and transaction
limits still apply.

This implements source `3bacf46f9c4213426314001586f5bae43aaa77de`. Literal
JSON tag-shaped objects remain ordinary objects; Firestore-native timestamps,
references, blobs and other non-JSON values are refused. Actual emulator tests
use the official driver for all 17 schema entities, JSON values, 2,000 history
rows, rollback, replay, checkpoint CAS, lease fencing, namespace separation,
closed query scopes and scan bounds. Hosted Google IAM, TLS, indexes and
production availability remain separate verification gates.

### libSQL and Turso storage

The separate, unpublished `Polymorfa.Storage.LibSql` package adds
`LibSqlStorageAdapter` using Turso's maintained
`Turso.Data.Sqlite.Provider` 0.8.3. It reuses `Polymorfa.Storage.Sql` and its
schema-2 DDL, typed rows and revision checks. Install the optional package only
in server applications; the base SDK gains no database dependency. This package
also includes the existing SQL package's SQLite, PostgreSQL and MySQL drivers.
The storage source is `3bacf46f9c4213426314001586f5bae43aaa77de`.

```csharp
using Polymorfa.Storage.LibSql;
using Polymorfa.Storage.Sql;
using Turso.Data.Sqlite;

await using var connection = new SqliteConnection(
    Environment.GetEnvironmentVariable("CUSTOMER_LIBSQL_CONNECTION")!);
await connection.OpenAsync();
await using var adapter = new LibSqlStorageAdapter(connection,
    new SqlStorageOptions { TablePrefix = "app_" });
await adapter.SetupAsync();
var storage = new Polymorfa.Sdk.Storage.CustomerStorage(adapter);
```

This adapter supports direct remote Hrana connections only. Native files,
in-memory databases and embedded replicas are rejected before adapter commands.
Use `Polymorfa.Storage.Sql.SqlStorageAdapter.SqliteAsync` for local SQLite.
Turso provider 0.8.3 exhibited intermittent native reader and lock failures in
repeated independent-file-writer tests, including with pooling enabled. The adapter does not reopen or replace the caller's connection.

The caller opens and owns the remote connection and configures its database
URL, auth token, TLS and timeouts. Use a server-held customer database token with the
required database permissions. Pass no Polymorfa API credential to this driver.
Keep connection strings out of browser bundles, logs and exception reports from
application-owned connection setup. Use the provider's connection-string
builder when composing values. Direct remote connections require TLS;
`libsql://` uses HTTPS by default.
Loopback development can use `Tls=False` or HTTP.
A table prefix provides naming, not tenant authorization. A customer database
and its access policy remain the customer's responsibility.

The adapter borrows the open connection, serializes its operations and leaves
it open when disposed. Give each adapter an exclusive connection; application
commands and another adapter must not share that connection while it is in use.
Each commit uses an explicit database transaction, including conditional deletes
and inserts. A revision or duplicate-key conflict rolls back the entire commit.
The 500-write limit includes the engine's session fence. A provider batch alone
does not establish atomicity. Driver failures surfaced by adapter operations
omit raw errors, inner exceptions, URLs, SQL and stored values. Cancellation
retains a sanitized `OperationCanceledException`. Network failures during commit
can leave its outcome uncertain; inspect the saved checkpoint before resuming.
Unclassified transaction admission failures return a sanitized provider failure
rather than an assumed revision conflict. A fresh retry still checks the original
expected revision. The adapter does not silently retry an uncertain commit.

`CreateTables = false` supports customer-managed schema installation. Export
SQLite schema-2 statements with `StorageSqlSchema.Statements` and
`StorageSqlDialect.Sqlite`. Direct remote Hrana connections are exercised by
the adapter tests. Replica sync, failover and production Turso credentials are
not acceptance-tested. This source package is not published and does not establish hosted service availability or a feature release.

Run its direct remote conformance executable with:

```bash
dotnet run --project packages/dotnet/tests/Polymorfa.Storage.LibSql.Tests
```

Set `POLYMORFA_STORAGE_LIBSQL_CONNECTION` to a customer-owned test connection
string to include direct remote conformance.
Set `POLYMORFA_STORAGE_LIBSQL_RACE_ITERATIONS` (1-1000, default 20) for repeated
independent-client races. The tests use unique table
prefixes and retain remote test tables. They cover all 17 entities, JSON/scalar
round trips, 2,000-message history, paging, replay, lease fencing, stale
checkpoints, revision and duplicate-key rollback, validation, cancellation,
sanitized errors and borrowed connection lifetime. Independent remote connections
race on one revision and verify exactly one winner; an unclassified admission
failure remains explicit. Removing the prepared-input snapshot makes the
mutation test fail.

### Entity Framework Core models

The separate, unpublished `Polymorfa.Storage.EntityFrameworkCore` package exports
schema-2 models for all 17 customer-owned SQL entities. It uses EF Core 8.0.32
and the SQL package's existing drivers. This configures models only; it does
not connect to a database, install tables or change access policies.

Use `PolymorfaStorageDbContext` with application-owned provider options and the
same `StorageSqlDialect` and `SqlStorageOptions` as the native SQL adapter.
Each entity is an EF shared-type property bag. Property names follow the
portable schema (`sessionId`, `messageId`, `timestamp`); physical column names
match the native adapter (`session_id`, `message_id`, `timestamp`). JSON
properties use `JsonElement?`, `_v` uses `JsonElement`, and `_rev` is a `long`
concurrency token. Optional scalar properties are nullable.

```csharp
using Microsoft.EntityFrameworkCore;
using Polymorfa.Sdk.Storage;
using Polymorfa.Storage.EntityFrameworkCore;
using Polymorfa.Storage.Sql;

await using var context = new PolymorfaStorageDbContext(
    customerEfOptions, StorageSqlDialect.Postgres,
    new SqlStorageOptions { TablePrefix = "app_" });
var recent = await context.StorageRows(StorageEntity.Messages).AsNoTracking()
    .Where(row => EF.Property<string>(row, "sessionId") == sessionId)
    .OrderByDescending(row => EF.Property<double?>(row, "timestamp"))
    .Take(50).ToListAsync();
```

The supplied context includes dialect, schema and table prefix in its model
cache key. Existing application contexts can call
`modelBuilder.ConfigurePolymorfaStorage(dialect, options)` and use
`context.StorageRows(entity)`; configure one storage prefix per model and
include naming options in the application's model cache key if they vary.
Identifiers and derived index names receive the native SQL schema validation.
PostgreSQL schema selection and binary key collations match the SQL adapter.
The customer owns migrations, provider configuration, database credentials and
live access policies. A table prefix does not grant tenant authority.

Use `CustomerStorage` for event/history writes: EF's revision concurrency token
does not apply the storage engine's field-version merges, replay markers,
checkpoint CAS or lease fences. Direct application writes must respect those
rules. Model JSON converters preserve ordinary JSON, including literal
`$date`/`$binary` objects, and snapshot parsed values independently of a
`JsonDocument` lifetime.

This follows source `3bacf46f9c4213426314001586f5bae43aaa77de`. Actual SQLite,
PostgreSQL and MySQL checks prove all 17 native-table mappings, nullable values,
JSON replacement, stale EF revisions and model-cache separation. An EF-created
SQLite schema also passes the native engine's complete conformance suite,
including 2,000 history rows and fenced writes. Hosted database access and
application migrations remain customer acceptance gates.

### Store events and decoded history

`StorageReducers.ReduceEvent` maps the 24 stored webhook event types to schema-2 operations. `ReduceHistoryChunk` accepts `StorageHistoryInput` and typed `StorageHistoryChunk` objects from a full WhatsApp protobuf decoder. It maps messages, media references, receipts, reactions, group membership, push names, PN/LID mappings and history progress. An explicit `StorageHistoryIdentityIndex` joins native identifiers to Polymorfa IDs; unmatched identifiers use stable `wa:` keys. Revokes and deletes permanently clear the contract's content and media secret fields. Other event types produce empty batches.

The HTTP history reader preserves raw protobuf bytes and decodes its documented subset. Supply a full-schema decoder to populate the storage history models. The storage reducer does not infer missing protobuf fields or download media bytes.

```csharp
using Polymorfa.Sdk.Storage;

var storage = new CustomerStorage(customerOwnedAdapter);
var result = await storage.ApplyEventAsync(verifiedWebhook);
// Return a successful webhook response after this task completes.

await using var sync = platform.Project(projectId).Events.SyncToStorage(storage);
await sync.Completion;
```

`ApplyEventAsync` also accepts `StorageApplyEventOptions.DecodeHistory` for linked `history.sync` notifications. The callback receives the typed notification and verified event, and returns a fully decoded `StorageHistoryChunk` or `null` for progress only. Replay checks the stored event ID before invoking the callback. Cloud inline history notifications do not invoke it. `storage.WebhookHandler(options)` returns the corresponding async webhook handler; verify the original body signature before calling it.

`SyncToStorage` requests manual acknowledgement and resumes the saved cursor. It stores the reduced event and deduplication marker, saves the cursor with a compare-and-set guard, then acknowledges the stream. The default checkpoint is session `*`, stream `events`. Missing event bodies and retention gaps stop consumption without advancing the checkpoint or acknowledgement. Set `RequirePayload = false` only for intentional metadata-only consumption. `OnApplied` runs after acknowledgement; a failure there leaves the event and cursor stored.

`Stop()`, disposal and cancellation stop admission of the next event. An event already admitted finishes storage, checkpoint and acknowledgement with independent operation lifetimes. Await `Completion` or `DisposeAsync` to observe its outcome. Stopping the stream does not hide failures from an admitted storage or acknowledgement operation. Adapter, decoder, checkpoint and acknowledgement failures propagate; an unacknowledged event can replay and deduplicate. `IStorageEventStreamSource` allows an application-owned stream with the same persistence ordering. These helpers acknowledge the Platform event stream; they do not change any local Signal service acknowledgement.

This source is unpublished. The SDK's existing server browser-credential restriction and the API's permissions and availability checks still apply.

### Blazor WebAssembly IndexedDB storage

The separate, unpublished `Polymorfa.Storage.IndexedDb` package adds
`IndexedDbStorageAdapter` for browser-local schema-2 storage. It uses the
application's `IJSRuntime` and a packaged JavaScript module with native
IndexedDB transactions. The source contract is
`3bacf46f9c4213426314001586f5bae43aaa77de`. The base SDK gains no browser runtime
or database dependency.

Call it after Blazor's JavaScript runtime is available, such as from a
component's first `OnAfterRenderAsync` callback:

```csharp
using Polymorfa.Storage.IndexedDb;
using Polymorfa.Sdk.Storage;

await using var adapter = await IndexedDbStorageAdapter.ConnectAsync(JS,
    new IndexedDbStorageOptions("user_42")
    {
        DatabaseName = "customer_app_user_42",
        MaxQueryRows = 100000
    });
var storage = new CustomerStorage(adapter);
```

The adapter borrows the runtime and owns its module reference and database
connection. Dispose it when the component or application owner ends. Disposal
closes the connection and retains the stored data. No Polymorfa API client,
credential, hosted retention setting or network storage service is involved.
The SDK's browser prohibition on organization and project credentials remains
in force; browser API calls still require an authorized client principal.

Choose a stable, separate namespace and database for each application owner.
The namespace must start with an ASCII letter and contain at most 64 letters,
digits, underscores or hyphens. A database is bound to one namespace, including
when callers choose its name explicitly. This prevents accidental rebinding;
it is not authentication, encryption or isolation from other scripts on the
same origin. The application owns login/logout handling, account changes,
retention and deletion of its device data. Browser storage can be denied,
limited or evicted; do not treat it as a guaranteed permanent archive.

All 17 entity stores use schema version 2. Setup upgrades an existing version-1
database without discarding its existing rows. An upgrade blocked by an older
open connection returns a safe provider error; close that connection and retry.
Native version changes close the old connection. Unsupported newer database
versions fail to open. Index names and scopes come from the SDK's closed schema.
Queries scan the selected entity within `MaxQueryRows` (1-100000, default
100000); exceeding that count fails before loading its rows. This adapter does
not create native secondary indexes or claim unbounded query performance.

Each commit supports at most 1000 writes, including the engine's session fence.
The module reads every expected revision and queues every write in one native
read/write transaction. It returns success only after the transaction's
`complete` event. A conflict or confirmed abort leaves the entire commit
unapplied. Large history batches use the existing engine's fenced commits and
write their replay marker last.

Cancellation before admission starts no operation. Cancellation during an
active transaction requests a native abort and waits for its final receipt.
If completion wins the race, the committed operation returns success. A canceled
.NET wait alone never establishes rollback. Runtime interruption can leave a
commit outcome unknown; inspect its saved checkpoint before resuming. Native
errors returned by adapter operations omit raw browser exceptions, customer rows
and inner exceptions.

The committed Blazor fixture runs the real C# engine and IndexedDB in Chromium.
It covers all 17 entities, JSON/scalars, 2000-message history, pagination,
conditional rollback, replay, stale checkpoints, lease fences, namespace binding,
query bounds, caller mutation, active-transaction cancellation, cancellation
after commit, schema upgrades, blocked-upgrade recovery and browser credential
guards. The pinned TypeScript oracle covers 43 event and 15 history reductions;
native row snapshots verify event/history persistence and replay. A synthetic
full-schema decoder and application-owned event stream exercise decoded history
and persistence/checkpoint/acknowledgement ordering without API credentials.
A sandbox with an opaque origin exercises native storage denial.
Safari, Firefox, browser crash recovery, device storage persistence permissions
and production application integration remain acceptance work. This package
has not been published and introduces no hosted feature release or entitlement.

Build the fixture outside the repository and serve its static files on loopback:

```bash
dotnet publish packages/dotnet/tests/Polymorfa.Storage.IndexedDb.BrowserTests \
  -c Release -p:PublishTrimmed=false \
  -o "$HOME/.polymorfa-agent-work/dotnet-indexeddb/browser"
python3 packages/dotnet/tests/Polymorfa.Storage.IndexedDb.BrowserTests/serve.py \
  --root "$HOME/.polymorfa-agent-work/dotnet-indexeddb/browser/wwwroot"
```

Open `http://127.0.0.1:54865/?id=unique-test-run`. Each run needs a fresh `id`;
append `&reopen=1` to the same URL to verify durable reads after a page reload.
The fixture uses synthetic data and does not access an operator browser profile.

## Campaign and direct-history contracts

Campaign requests expose `CampaignVariableMapping`, `CampaignVariableBinding`
and `CampaignTrackedLink`. Use `PatchValue<T>.Set(null)` for a PATCH reset;
leave its default value to omit the field. Create mappings and binding members
reject explicit null. Messaging updates require at least one captured field.
Platform updates allow null or empty bodies and open extensions, but reject
`projectId`, `id` and extensions that collide with typed fields. Select the
Project in `PlatformCampaignParameters` and the campaign in the method path.
Platform launch takes `LaunchPlatformCampaignRequest` and returns a typed,
open `PlatformCampaignLaunchResult`.

The client checks mapping, link, variation and follow-up constraints before HTTP.
Tracked-link checks validate URL syntax and domain names, without DNS lookup.
Requests retain the caller's URL spelling; returned URLs reflect server storage.
Follow-up validation uses the server's effective defaults without adding omitted
timing fields to the request. Stored link arrays have no request-count cap.
Platform composed messages use `PlatformCampaignMessage`; empty drafts and open
nested media/button extensions remain supported. Stored campaign `Messages`
remain opaque JSON. Recipient filters can combine reason, status, cursor and
limit. Messaging recipient `NextMessageAt` retains fractional JSON numbers;
Platform recipient decoding requires an integer.

Read history delivery with `HistorySyncDelivery` (`Archive` or `Descriptor`).
Writes use `HistorySyncDeliveryOverride.Descriptor`. Delivery-specific writes
and resets, initial QuickLink custody, and QuickLink delivery select
`2026-10-14` only when the request has no explicit `ApiVersion`. Existing GETs,
whole-history resets and requests without new intent retain the client default.
`Session.SignalMode` is an optional immutable fact, separate from configuration.
Initial QuickLinks cannot select an existing session. Supplementary links require
both session and connection, and cannot choose custody, Customer, external ID,
billing controls or a single-connection goal.

Direct grants and history retry/delete require server credentials. Prepared
uploads may already have consumed plaintext during explicit local preparation;
a Client denial prevents further source, grant and storage work. Scoped Client
relay uploads and custom ciphertext-only transports remain supported. A retry
acknowledgement is not chunk delivery. Deletion validates the API acknowledgement
and does not delete local history.

Verified `history.sync` parsing exposes `DirectHistorySyncMediaPayload` and
`DirectHistorySyncInlinePayload` alongside archive and Cloud events. Descriptor
events use projected WhatsApp identities and ISO time, and require exactly one
media or inline branch. Their diagnostics redact descriptor material. Typed
parsing does not download, decode or persist history. `StorageHistoryDecoder`
remains archive-only. Use the separate `StorageHistoryDescriptorDecoder` and
descriptor handling modes described below for descriptor storage.

Sticker sends require a WebP descriptor and reject caption and unsupported
media fields before HTTP. A standard descriptor send includes its key in the
API body and does not establish customer-owned Signal custody. Server consent,
eligibility, approval, funding, feature policy and pairing checks still apply.
These source and local package checks do not establish registry publication,
live WhatsApp, browser pairing or production availability.

### Descriptor history storage

`StorageApplyEventOptions.DecodeHistory` remains archive-only with the same
`LinkedHistorySyncPayload`, event and cancellation arguments, and nullable
progress-only result. Use the separate descriptor callback:

```csharp
var handler = storage.WebhookHandler(new()
{
    DecodeHistoryDescriptor = async (descriptor, webhookEvent, cancellation) =>
        await DownloadDecodeAndProjectAuthorizedHistoryAsync(descriptor, webhookEvent, cancellation)
});
```

The application defines this function. It receives a validated
`DirectHistorySyncPayload` and the original verified event and must return a
non-null `StorageHistoryChunk`. The application owns authorized media access,
key custody, complete-schema decoding and storage projection. `HistoryChunks`
preserves verified protobuf and its documented subset; it does not supply a
generic full-schema decoder. Storage never downloads media implicitly. Missing,
null, failed or invalid descriptor decoding fails before progress, marker,
checkpoint or ACK. A legitimate empty chunk is allowed. Descriptor errors and
diagnostics omit media keys, hashes and inline bytes.

The default `HistoryDescriptorMode = StorageHistoryDescriptorMode.Decode`
requires the new callback. Explicit `StorageHistoryDescriptorMode.MetadataOnly`
validates and consumes progress and the event marker, skipping all decoders even
when configured. Stream sync then saves its cursor and manually ACKs. The event
is deduplicated, so adding a decoder later cannot import it through ordinary replay.
There is no automatic backfill or marker deletion. Valid duplicate descriptors
skip decoders before checking availability. Notification IDs never map individual
messages; existing native `wa:` fallback keys retain their joining limits. Content
and marker commit precede checkpoint CAS and ACK. A failed remote ACK leaves
committed data intact. Archive and Cloud behavior remain unchanged. This establishes
local package behavior, not registry or deployed availability.

Decoded-history numeric strings follow the producer's finite `Number(string)`
contract, including signed zero, exact ECMAScript whitespace and full ASCII
numeric grammar. Unsigned radix values retain the existing BigInteger path and
one binary64 rounding. Bare radix prefixes already failed correctly. Generic
row numbers and safe revisions remain strict. Full public assemblies and local
NuGet consumers provide local evidence; registry publication and matching
environment acceptance remain separate release gates.

Media downloads retain the successful API request deadline through body EOF. Each approved storage redirect hop has its own request deadline, retained through the final body. Async and synchronous body reads distinguish the request deadline from caller cancellation. Disposing a download releases its response, timer and owned storage transport; it does not dispose the API client. Body failures do not replay the download. Calls WebSockets retain the configured base-path prefix and authenticate in the first frame. Raw cursor pages reject repeated cursors before requesting them again, including cycles across manually requested pages.

Signal finite JSON requests share one header/body deadline. Event streams enforce a requested session and report incomplete lines or frames at EOF; they retain their idle timeout and manual acknowledgment policy. ACK success requires exactly HTTP 204. Usage iteration preserves a starting cursor and rejects its repetition. Native HTTP fixtures verify these local consumer rules; they do not establish service deployment or registry availability.

## Credential handling

Treat every Polymorfa credential as an opaque string. Pass the complete value
from the Console. Never parse credentials or assume a fixed length. Store at
least 512 characters, preferably unrestricted text. Client-token length varies
with its bindings, Customer block and signing key ID.

The SDK checks server-credential prefixes, canonical base64url and the checksum.
These checks do not authenticate a credential. The API checks the issuance record
and live permissions. Test keys use the same project-token format; their test-only
restriction is enforced by the service.

### Project event-stream validation and limits

`EventStream.Cursor` advances after the base64 payload, webhook envelope and
stream delivery fields parse. Invalid base64 follows the existing reconnect
policy. An invalid decoded webhook remains terminal; after correcting the source,
resume explicitly from the retained cursor or durable storage checkpoint.
Project event frames have a 4 MiB UTF-8 byte budget, including incomplete lines,
all `data:` lines, field syntax and comments. CRLF counts as one line terminator;
a blank line resets the budget. Oversized frames follow the existing reconnect
policy. Signal parsing is unchanged.

Storage synchronization uses `StreamOptions.Since` when no checkpoint exists and
the saved cursor otherwise. Event commit, checkpoint CAS and manual ACK keep that
order. These changes are unreleased source behavior.


## Official API round-2 betas

Native Number catalog-cache reads/sync, marketing status, Official group JPEG
upload, identity changes, incoming carts and signed webhook batches have source
counterparts. These additions remain unreleased betas and may return
`feature_unavailable`. They grant no enrollment or provider authority. See
[the shared beta guide](../../docs/official-api-round2.md) for ownership, batching,
whole-body signatures and release gates.

Incoming cart `CloudOrderItem.Quantity` uses `long` to preserve the API's positive
safe integers through `9007199254740991` in signed deliveries, batches and history.
`ItemPrice` remains `double`; catalog prices remain strings. The JSON contract is
unchanged. Callers assigning a quantity to `int` must check their own range before
converting, and rebuild consumers against the widened DTO. This source correction
is unreleased.

The following uses an existing server client. Preserve the API's opaque cursor;
stop when the response omits it. Catalog prices remain exact strings.

```csharp
var page = await client.Catalogs.ListProductsAsync("number-id", "123", new(100, "opaque_-"), new() { CancellationToken = cancellationToken });
var nextCursor = page.Data.Data.NextCursor;
```

## Simultaneous calls source preparation

This counterpart is prepared against API #559 merge `c1a43a1e`. It is not a
registry availability claim. Use the HTTP API until a matching SDK release is
published and accepted against the target environment.

Call-settings reads expose `simultaneousCalls`, default false. Updates accept
`simultaneousCalls` and `acknowledgeRisk`. Omission preserves stored state;
explicit false disables the setting. Acknowledgment alone changes no setting
and is rejected. The API requires a team key and `acknowledgeRisk: true` for an
off-to-on transition. Project tokens may disable it. The SDK forwards values
without guessing the stored state. Existing `invalid_parameter`,
`permission_denied` and `state_conflict` errors remain authoritative.

The setting affects linked-device Numbers. Cloud API Numbers ignore it.
Unlimited concurrent calls differ from WhatsApp's apps and void Ban Insurance
when the 30-day claim window overlaps an enabled period. Claim verdicts and
`bansafe.claim` webhook verdicts recognize `simultaneous_calls`. Claim evidence
includes `simultaneousCalls`; the webhook does not acquire an evidence object.

No browser/client-token authority, call media behavior, automatic state read,
retry policy or feature availability is added by these SDK fields.
