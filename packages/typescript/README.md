# `@polymorfa/sdk`

The handwritten Polymorfa server SDK for TypeScript and Node.js.

Install the development prerelease from npm:

```bash
npm install @polymorfa/sdk@dev
```

Pin an exact `0.1.0-dev.<timestamp>` version for reproducible installs. See the
[repository installation guide](../../README.md#typescript-development-install)
to build and install a packed tarball from source.

The Calls client is part of this package as `@polymorfa/sdk/calls`.
`@polymorfa/sdk/calls/internal` exists for the Polymorfa browser package;
applications must not import it.

Import the management and Messaging clients, errors, response metadata,
request options, pagination, webhook utilities, and public request/response
types from the package root:

```ts
import {
  BridgeClient,
  Client,
  MessagingClient,
  PolymorfaError,
  SystemClient,
  webhooks,
  type RequestOptions,
} from "@polymorfa/sdk";
```

See the repository README for the complete development contract and current
typed-resource coverage. This package has no runtime dependencies and requires
Node.js 20 or newer.

## Management client and project views

`Client` has one ownership context for its lifetime. Construct an organization
client with an organization API key, then derive immutable project views with
`project(projectId)`:

```ts
const platform = new Client({
  credential: {
    type: "organizationApiKey",
    value: process.env.POLYMORFA_PLATFORM_API_KEY!,
  },
  apiVersion: "2026-03-20",
});

const project = platform.project("project_123");
const events = await project.events.list({ limit: 25 });
console.log(events.items, events.response.metadata.requestId);
```

A project token can construct only a project view and requires `projectId`:

```ts
const project = new Client({
  credential: {
    type: "projectToken",
    value: process.env.POLYMORFA_PROJECT_TOKEN!,
  },
  projectId: "project_123",
});
```

The server verifies that initial binding. Rebinding the same project-token
client to a different project fails before transport. A project view exposes
only owner-bound management resources; organization resources such as
`projects`, `members`, and `billing` stay on the organization client.
`MessagingClient` remains separate because its session APIs and credentials
have a different authorization boundary.

Messaging credentials are explicit: `apiKey` for an organization server key,
`projectToken` for the single opaque project-token format, and `clientToken`
for the browser action allowlist. Server credentials fail in browser runtimes.
An organization key is exactly `pmfa_` plus 72 unpadded base64url characters;
a project token is exactly `pmfa_pt_` plus 94. The SDK checks only this public
v1 grammar and never decodes or decrypts the credential.

The SDK rejects `pmfa_ct_` browser tokens and CLI-only `pmfa_ls_` listener
credentials before a management request. It also rejects retired call-agent
`pmfa_at_` and socket `pmfa_wst_` tickets and simulated-device `pmfa_sd_`
capabilities as server API keys. `Client.events.stream()` exposes an
`AsyncIterable` for the separate [server event stream](#stream-events-in-real-time),
subject to scope and beta access. Live forwarding belongs to `polymorfa listen`.

## System and Bridge clients

`SystemClient` is credential-free. Its four methods preserve the normal
`ApiResponse<T>` metadata while calling public service probes:

```ts
const system = new SystemClient();
const [status, version, health, ping] = await Promise.all([
  system.status(),
  system.version(),
  system.health(),
  system.ping(),
]);
```

`BridgeClient` accepts only `{ type: "projectToken", value }`. It exposes
`routes.resolve()` for regional Bridge route discovery:

```ts
const bridge = new BridgeClient({
  credential: {
    type: "projectToken",
    value: process.env.POLYMORFA_PROJECT_TOKEN!,
  },
});

const route = await bridge.routes.resolve();
console.log(route.data.wsUrl, route.metadata.requestId);
```

`BridgeClient` does not open the returned WebSocket or manage its lifecycle.
It is also unrelated to the CLI-only SSE listener protocol. Project tokens and
listener credentials are not interchangeable; `pmfa_ls_` fails before a
Bridge request.

## Customers

Use `Client.customers` to manage project-owned Customers and their
Numbers. The resource covers the complete Customers contract, including
enablement, profile lifecycle, pairing links, recent events, and Number
transfers.

```ts
const customer = await platform.customers.create(
  {
    projectId: "project_123",
    name: "Ada",
    externalCustomerId: "crm_456",
  },
  { idempotencyKey: crypto.randomUUID() },
);

const pairing = await platform.customers.createPairingLink(
  customer.data.data.id,
  {
    projectId: "project_123",
    methods: ["qr", "phone"],
  },
  { idempotencyKey: crypto.randomUUID() },
);

console.log(pairing.data.data.url);
```

The pairing URL is returned once. An idempotent replay returns the same link
record with `url: null`. `customers.list()` preserves both the Customer array
and the cursor metadata from the API response.

## BanSafe Health and telemetry

`Client.banSafe` reads Health, telemetry collection status, the fixed
signal catalogue, findings, restrictions, incidents, claims, and Health action
history. Paged methods preserve the API's `data` array and `page` metadata.

```ts
const health = await platform.banSafe.getHealth("support");
const telemetry = await platform.banSafe.getTelemetry("support");
const actions = await platform.banSafe.listHealthActions({
  projectId: "project_123",
  session: "support",
  status: "succeeded",
});

console.log(
  health.data.data.health,
  telemetry.data.data.collection.state,
  actions.data.page.hasMore,
);
```

Use `platform.projects` for project Safe Mode, warm-up, Ban Insurance evidence,
and Health policy settings. Use `platform.sessions` for one number's Safe Mode
override. `MessagingClient.banSafe` exposes the same settings on the Messaging
API for organization API keys and project tokens; its responses carry
`success: true` beside `data`. Browser client tokens fail before any request.

Claim `measuredCents`, `capCents`, and `amountCents` are credit quantities with
up to six decimal places, not integer cents. Finding acknowledgement and
enforcement appeals require a signed-in dashboard session and are not SDK
methods.

```ts
const policy = await platform.projects.getHealthPolicy("project_123");
await platform.projects.updateHealthPolicy("project_123", {
  version: policy.data.data.version,
  enabled: true,
  threshold: 50,
  sessionAction: "slow_down",
  slowDownMps: 0.5,
  emailNotification: true,
  webhookNotification: true,
});

const messaging = new MessagingClient({
  credential: {
    type: "projectToken",
    value: process.env.POLYMORFA_PROJECT_TOKEN!,
  },
});
const safeMode = await messaging.banSafe.getSessionSafeMode("support");
console.log(safeMode.data.data.effective.presence);
```

Finding acknowledgement and restriction appeals require a signed-in dashboard
user. The organization-key SDK does not expose those two mutations.

## Browser client tokens

`MessagingClient.clientTokens` mints short-lived tokens and manages the live
session rules that authorize them. Use it only on the server. The browser-safe
transport and allowed-action resources live in `@polymorfa/browser`; the
Next.js-compatible route adapter lives in `@polymorfa/nextjs`.

Minting a client token and updating its session rules require all six client
delegation scopes: `sessions:manage`, `messages:write`, `contacts:read`,
`presence:read`, `presence:observe`, and `mcp`. The issuing key must cover
every action that the session rules can delegate to the browser token.
`clientTokens.mint` (`POST /platform/client-tokens`) is the only token issuer,
including for Calls; there are no call-specific tokens or tickets.

### Customer-scoped tokens (beta)

Pass a Polymorfa Customer ID in `customer` instead of `session` to mint one
token for the numbers a Customer owns. The issuing key also needs
`customers:read`, and the team must be enrolled in the Customer-scoped client
tokens beta.

```ts
const { data } = await messaging.clientTokens.mint({
  customer: "0190f0b6-7c1e-7a55-9d1a-2f0c6b1e4a10",
  ephemeralId: "user_42",
  allow: ["send_message", "read_presence"],
  ttlSeconds: 900,
});
```

The token covers the numbers the Customer owns at mint time. A number moved
to another Customer stops working with the token on the next request; a
number moved to this Customer needs a new token. Each request is still
limited by that session's client rules, and `allow` (typed as
`CustomerClientTokenAction`) narrows it further. Customer-scoped tokens can't
use Calls or MCP. Never pass your own external ID as `customer`; look up the
Customer on your server first. The SDK throws `PolymorfaConfigurationError`
before sending if both or neither of `session` and `customer` are set, or if
`allow` is set without `customer`.

## Session connection lifecycle

Session administration uses Platform routes and requires a server credential.
The existing `MessagingClient.sessions` method names remain available.
Start an existing Linked Device session, then retrieve its connection status with
`sessions.retrieve`. The standard pairing flow is QuickLink. Direct JSON QR and phone
pairing-code routes require `sessions:manage` plus an explicit organization
entitlement; without it, the API returns `403` and the application must create
a QuickLink. Follow a returned operation ID with `Client.operations.get` or
`Client.operations.wait`.

```ts
const started = await messaging.sessions.start("support", {
  idempotencyKey: "start-support",
});

console.log(started.data.data.started);
console.log((await messaging.sessions.retrieve("support")).data);
```

`sessions.retrieve` is the typed source of session connection status. The
pinned API contract does not expose session logs or a separate
connection-status endpoint. The API no longer emits `session.qr` webhook
events. Applications must observe QuickLink state through the QuickLink flow;
the entitlement-gated `sessions.qr` and `sessions.requestPairingCode` methods
remain available only for organizations that have direct pairing enabled.

## Project templates

`MessagingClient.templates` provides the seven canonical project-template
operations: list, create, retrieve, update, delete, preview, and submit to Meta.
Definitions use the exported `TemplateDefinition` model instead of generic
component objects.

```ts
const created = await messaging.templates.create("support", {
  name: "order_ready",
  definition: {
    version: 1,
    kind: "standard",
    category: "UTILITY",
    language: "en_US",
    body: "Hello {{name}}, your order is ready.",
    variables: [{ name: "name", type: "text", example: "Ada" }],
  },
});

await messaging.templates.preview("support", created.data.data.id, {
  values: { name: "Grace" },
});
```

Keep this client on the server. Browser builders use an application-owned
route, such as `createTemplateBuilderRoute` from `@polymorfa/nextjs`.

## Contacts

`MessagingClient.contacts` exposes the complete Linked Device contact surface.
Read operations require `contacts:read`; blocking and unblocking require
`contacts:manage`.

```ts
const contacts = await messaging.contacts.list("support");
const registrations = await messaging.contacts.check("support", [
  "+15551234567",
  "+15557654321",
]);

const firstRegistration = registrations.data.data[0];
if (firstRegistration?.exists && firstRegistration.id) {
  await messaging.contacts.block("support", firstRegistration.id, {
    idempotencyKey: "block-abusive-contact",
  });
}

console.log(contacts.data.data, contacts.metadata.requestId);
```

The resource also provides `retrieve`, `picture`, `info`, `devices`,
`businessProfile`, `blocklist`, and `unblock`. Contact operations are not
available for Cloud API sessions.

## Polymorfa Calls

`MessagingClient.voip` controls calls from a server. Every incoming call rings
until a participant accepts or rejects it; nothing answers automatically.

```ts
const placed = await messaging.voip.place(
  { session: "support", to: "+15551234567", participant: "agent-7" },
  { idempotencyKey: "place-order-1042" },
);

const accepted = await messaging.voip.accept(incomingCallId, {
  exclusive: true,
  participant: "agent-7",
});
console.log(accepted.data.data.answeredBy); // "server:agent-7"

await messaging.voip.addParticipant(placed.data.data.callId, {
  to: "+15557654321",
});
await messaging.voip.leave(incomingCallId, { connectionId: "conn_desk_1" });
await messaging.voip.end(placed.data.data.callId);
```

- `place` requires `session` with a server credential and accepts `video`,
  `exclusive`, and `participant`. Send an idempotency key to retry safely.
- `accept` answers a ringing call. Later accepts from other participants join
  the call unless a participant claimed it with `exclusive: true`; those
  requests fail with `409 call_claimed` (`PolymorfaConflictError`). Repeating
  an accept as the same participant has no further effect.
- `reject` declines a ringing call and fails with `409 call_not_ringing`
  otherwise.
- `leave` closes one media connection. `end` ends the call for everyone.
- `addParticipant` invites another WhatsApp user and returns a
  `VoipParticipant`.

A server credential acts as `server:<participant>`; `participant` matches
`[A-Za-z0-9._:@-]{1,128}` and defaults to `default`. A client token acts as its
own participant, so the SDK rejects `participant` for client tokens. The SDK
checks `participant` and `connectionId` (`[A-Za-z0-9_-]{8,64}`) before sending.

`voip.retrieveCallSettings(session)` and `voip.updateCallSettings(session,
{ conferenceMode, inboundRoute, sipTrunkId, sipClaim, hostCloudApiCalls })` read and change the
session's call settings through `/platform/sessions/{session}/call-settings`.
`callsEnabled: false` turns calling off for the session: placing, answering,
joining, inviting and media fail with `PolymorfaAuthorizationError`
(`calls_disabled`), incoming calls are declined, and calls in progress
continue. `conferenceMode` (default `true`) lets every participant you connect
to a call (browser, app and server connections, and SIP trunk callers) hear
the WhatsApp party and each other; with `false`, each hears only the WhatsApp
party. The WhatsApp party always hears all of your participants, and nobody
hears their own audio in either mode. `inboundRoute` is `clients` (the default) or
`sip_trunk`, which also sends incoming calls to `sipTrunkId`; `sipClaim`
(default `true`) makes the trunk's answer claim the call. On a Cloud API
session, `hostCloudApiCalls: true` has Polymorfa Calls answer incoming calls;
with the default `false`, your Graph API integration answers them. An update changes
only the settings you send. Pass the `revision` you read as
`expectedRevision` to fail with `PolymorfaConflictError` (`state_conflict`) if
the settings changed meanwhile.
These methods require a server credential.

`voip.report(callId, report)` sends diagnostics your app measured for one of
its media connections: `{ kind: "quality", connectionId, quality }` with at
least one of `rttMs`, `jitterMs`, `packetsLost`, `packetsReceived`,
`audioCodec`, `videoCodec`, `candidateType` and `reconnects`, or
`{ kind: "error", connectionId, error: { code } }`. `client` optionally names
the SDK (`sdk`, `version`, `platform`). The SDK rejects fields the platform
does not accept before sending. The platform accepts one quality report per
connection every 5 seconds and 20 error reports per minute, while the call is
live and for 10 minutes after it ends. Treat reports as best-effort: do not
retry a `4xx`, and drop reports refused with `429` or `503`. Client tokens
need the `voip_signal` action and cannot send `participant`. The browser and
Calls clients send these reports for you.

## Call consent

Every call is checked against the team's call policy before the destination
rings. Reading and changing the policy needs an organization key; project
tokens and client tokens receive `403`.

```ts
const policy = await platform.callPolicy.retrieve();
console.log(policy.data.blockedCountryCodes, policy.data.optOutCount);

await platform.callPolicy.update({
  blockedCountryCodes: ["44", "1876"],
  expectedRevision: policy.data.revision,
});
```

Blocked codes are country calling codes or longer dialing prefixes, written as
1 to 4 digits without `+`: `44` blocks the United Kingdom, `1876` blocks
Jamaica without blocking the rest of `+1`. `update` replaces the whole list;
send `[]` to allow every country. The SDK checks the digits and the 300-code
limit before sending. Pass the `revision` you read as `expectedRevision` to
fail with `PolymorfaConflictError` (`state_conflict`) if someone changed the
policy meanwhile. While any code is blocked, a call to a person whose phone
number is unknown is refused too, because the destination country cannot be
checked.

`platform.callOptOuts` manages the team's do-not-call list. A call to a listed
person fails with `PolymorfaAuthorizationError` (`call_recipient_opted_out`).

```ts
const added = await platform.callOptOuts.create({
  phoneNumber: "+14155550123",
  note: "Asked not to be called on 2026-09-18",
});
added.metadata.status; // 201 when added, 200 when already listed

const imported = await platform.callOptOuts.import({
  entries: [
    { phoneNumber: "+14155550123" },
    { bsuid: "US.13491208655302741918" },
  ],
});
console.log(
  imported.data.added,
  imported.data.existing,
  imported.data.rejected,
);

for await (const entry of await platform.callOptOuts.list({ limit: 100 })) {
  console.log(entry.id, entry.phoneNumber ?? entry.bsuid, entry.source);
}

await platform.callOptOuts.delete(added.data.id);
```

- `create` takes exactly one of `phoneNumber` (E.164) or `bsuid`; the SDK
  rejects both or neither before sending. Adding someone already listed returns
  the stored entry with `200` and leaves its note unchanged.
- `import` takes 1 to 5,000 entries. Valid entries are added together; invalid
  ones come back in `rejected` with their `index` and a `reason`
  (`invalid_phone_number`, `invalid_bsuid`, `missing_identifier`,
  `multiple_identifiers`, or `invalid_note`).
- `list` returns a `CursorPage<CallOptOut>` ordered newest first. It follows
  `page.nextCursor` for you; filter by `phoneNumber` or `bsuid`, not both.
- A list that would pass 100,000 entries fails with `PolymorfaConflictError`
  (`call_opt_out_limit`).

The list is matched on what you supply: an entry for a phone number does not
block a call to the same person addressed only by user ID.

### Call permission on Cloud API Numbers

WhatsApp requires a person's permission before a Cloud API Number calls them.
Ask for it with `callPermissionRequest` content:

```ts
await messaging.messages.send("support", {
  conversation: { phoneNumber: "+14155550123" },
  content: {
    callPermissionRequest: {
      body: "We would like to call you about order 1522.",
    },
  },
});
```

`body` is 1 to 1,024 characters. Outside the customer service window, send an
approved template with a call permission request button using `template`
content instead. WhatsApp allows one request per person every 24 hours and two
every 7 days; a connected call resets both. A send past that limit fails with
`PolymorfaRateLimitError` (`call_permission_request_limited`), whose
`rateLimitReason` is `call_permission_request` and whose
`metadata.headers["retry-after"]` carries WhatsApp's reset when it reports one.
A person who already granted permanent permission produces
`PolymorfaConflictError` (`call_permission_granted`); place the call instead.

```ts
const permission = await messaging.voip.retrieveCallPermission(
  "support",
  "+14155550123",
);
const state = permission.data.data;
state.status; // "none" | "temporary" | "permanent" | "revoked"
state.expiresAt; // when a temporary permission ends
state.actions?.requestPermission?.limits;

const check = await messaging.voip.check({
  session: "support",
  to: "+14155550123",
});
check.data.data.allowed;
check.data.data.refusal; // null, or the first reason a call would fail
```

- `retrieveCallPermission(session, to)` takes a public user ID or an E.164
  phone number and encodes it for you. It asks WhatsApp on every request and
  returns its limits in `actions`. When WhatsApp cannot be reached, it returns
  the stored state with `fresh: false` and `actions: null`. It needs
  `sessions:read`.
- `check({ session, to })` runs the checks a placement runs without placing a
  call or reserving anything. `refusal` is `calls_disabled`,
  `call_recipient_opted_out`, `call_destination_blocked`,
  `call_permission_required`, or `call_limit_reached`. `permission` is `null`
  on linked-device Numbers. A placement made afterwards runs the same checks
  again. If required check state is unavailable, it raises
  `PolymorfaServerError` (`503 service_unavailable`) without an allow or
  refusal result.
- Both require a server credential. `retrieveCallPermission` fails with
  `409 unsupported_for_connection` on a linked-device Number; `check` supports
  linked-device Numbers and returns `permission: null` for them.

Permission changes arrive as the `call.permission_changed` webhook event with a
`CallPermissionChangedPayload`: the `conversation`, the new `status`, the
`previousStatus`, `expiresAt`, a `source` (`user_action`, `automatic`, `sync`,
or `call_refused`) and `changedAt`. No event is published when a temporary
permission reaches `expiresAt`; schedule your own follow-up from `expiresAt`.
The person's reply also arrives as `message.received` with `interactive.type`
`call_permission_reply`.

## SIP trunks

`Client.sipTrunks` manages the SIP trunks that connect a PBX to a project's
calls. SIP trunks are part of Calls and need no enrollment.
Team clients name the project on `list` and `create`; project clients use their
own project.

```ts
const project = platform.project("018f0000-0000-7000-8000-000000000002");
const { data } = await project.sipTrunks.create({
  name: "Head office PBX",
  direction: "both",
  outbound: { targetUri: "sips:pbx.example.com", transport: "tls" },
  inbound: { session: "support", allowedAddresses: ["203.0.113.10"] },
});
// Store data.inboundCredentials now; the password is not returned again.
await project.sipTrunks.update(data.trunk.id, {
  enabled: false,
  expectedRevision: data.trunk.revision,
});
```

`endpoint()` returns the SIP address to configure in your PBX and allow in
your firewall. `SipEndpoint` is a union on `status`. `SipEndpointHosted`
carries the `host`, the `transports` with their ports and SRTP policy, and the
UDP `rtp` port range for call audio; narrowing on `status === "hosted"` gives
them without a cast. `SipEndpointNotHosted` carries `status`
`sip_not_hosted`, a `null` `host` and `rtp`, and no transports, which is a
successful response, not an error. The address is the same for every project
and trunk, team and project clients call it without a project, and it needs
`sessions:read`.

```ts
const { data: address } = await platform.sipTrunks.endpoint();
if (address.status === "hosted") {
  console.log(address.host, address.transports, address.rtp);
}
```

`retrieve`, `update`, `delete`, and `rotateCredentials` take a trunk ID. A
project client built from a team key reads the trunk first and refuses a trunk
of another project with `PolymorfaNotFoundError`. Conflicts raise
`PolymorfaConflictError` with `code` `sip_trunk_in_use`,
`sip_trunk_revision_conflict`, `sip_trunk_limit`, or `state_conflict`.

## Voice audio library

`Client.voice` follows the merged Voice Automation API contract. The API
requires `calls.voice-automation` enrollment for writes except `delete`;
without it, writes fail with `PolymorfaAuthorizationError` and
`code: "voice_not_enabled"`. Reads, previews and deletes remain available
after enrollment withdrawal. These methods do not enable an audience or
establish deployed availability. Credentials need
`voice:read` to read and `voice:manage` to change anything; client tokens
are refused. Team clients name the project on `audio.list`,
`audio.createUpload`, `audio.upload` and `audio.synthesize`; project clients
use their own project.

`voice.audio` stores recordings and text-to-speech renders. Every asset is
transcoded to 16 kHz mono audio and moves from `pending_upload` or
`transcoding` to `ready` or `failed`.

```ts
import { readFile } from "node:fs/promises";

const project = platform.project("018f0000-0000-7000-8000-000000000002");

// Create the asset, send the file to its upload URL, and start transcoding.
const { data: uploaded } = await project.voice.audio.upload({
  name: "Welcome message",
  contentType: "audio/mpeg",
  body: await readFile("welcome.mp3"),
  retentionDays: 90,
});

// Render speech with Polymorfa's managed key, or pass credentialId for yours.
const { data: spoken } = await project.voice.audio.synthesize({
  name: "Opening hours",
  text: "We are open from nine to five, Monday to Friday.",
  provider: "openai",
  voiceId: "coral",
});

const { data: ready } = await project.voice.audio.waitUntilReady(spoken.id);
if (ready.status === "ready") {
  const { data: preview } = await project.voice.audio.previewUrl(ready.id);
  console.log(preview.url); // Opus in Ogg, valid for 5 minutes
}
```

`upload` accepts a `Buffer`, `Uint8Array`, `ArrayBuffer`, `Blob` or
`ReadableStream` of up to 16 MiB in `audio/mpeg`, `audio/wav`,
`audio/x-wav`, `audio/ogg`, `audio/mp4` or `audio/x-m4a`. A stream needs
`sizeBytes`. For bytes and Blobs the SDK uses the body's byte length and
refuses a different `sizeBytes` with a `PolymorfaValidationError` before it
creates the asset. It calls `createUpload`, sends the bytes to `upload.url` with
only the returned `Content-Type` header and without your credential, then
calls `complete`. If sending fails, the asset stays in `pending_upload`. You
receive the HTTP status for an upload refusal; the SDK omits the storage
response body and headers from the error because they may contain the signed
upload URL. You can run the three steps yourself with `createUpload` and
`complete`; the
upload URL is valid for 5 minutes and grants access on its own, so do not log
it.

`retrieve`, `update`, `delete`, `complete` and `previewUrl` take an asset ID.
`update` changes `name` and `retentionDays` (`null` keeps the asset until
deleted) and accepts `expectedRevision`. `list` returns a `CursorPage` and
filters by `status`. `waitUntilReady` polls until the asset is `ready` or
`failed` and throws `PolymorfaTimeoutError` once `timeoutMs` (default 2
minutes) has passed, cancelling a read still in flight; in production, prefer the
`voice.asset_ready` and `voice.asset_failed` webhooks, typed as
`VoiceAssetReadyPayload` and `VoiceAssetFailedPayload`. These events are
project-scoped and arrive with an empty `session`.

`voice.providerCredentials` stores your own ElevenLabs or OpenAI keys for
text-to-speech:

```ts
const { data: credential } = await platform.voice.providerCredentials.create({
  provider: "elevenlabs",
  label: "Production",
  apiKey: process.env.ELEVENLABS_API_KEY!,
  projectId: null, // every project of the team; team keys only
});
await project.voice.audio.synthesize({
  name: "Greeting",
  text: "Hello!",
  provider: "elevenlabs",
  voiceId: "21m00Tcm4TlvDq8ikWAM",
  credentialId: credential.id,
});
```

The key is write-only. Responses return `keyFingerprint`, the first 8 hex
characters of its SHA-256, and the SDK never logs the key or includes it in
errors. `create` and `verify` check the key with the provider and fail with
`provider_credential_invalid` when it is rejected. Project clients create
credentials for their own project only. A project client built from a team
key can read team-wide credentials but verifies and deletes only its
project's.

Errors: `voice_not_enabled` (403), `gate_limit_reached` (402,
`PolymorfaPaymentRequiredError`), `provider_credential_invalid` (422),
`provider_unavailable` and `voice_unavailable` (503), and `asset_not_ready`,
`voice_asset_in_use` and `voice_asset_revision_conflict` (409,
`PolymorfaConflictError`). Input status filters, upload content types,
provider names and TTS selections use the values accepted by the API.
Response fields preserve unknown values: treat an unrecognized audio status
as unusable and an unrecognized credential status as invalid. The `VOICE_*`
lists identify the known response values. Preview responses have
`contentType: "audio/ogg"`.

The voice resources are available only in this TypeScript SDK.

## Call analytics and call records

`Client.calls` reads call statistics and call detail records. It needs
`sessions:read`. A team client covers every project of the team unless you
pass `projectId`; a project client reads only its own project, and the SDK
refuses another `projectId` before sending. A project token that names a
different project gets `PolymorfaNotFoundError` from the API.

Every method accepts the same filters: `sessionId`, `direction` (`inbound` or
`outbound`), `upstream` (`linked_device` or `cloud_api`), `outcome`
(`answered`, `missed`, `declined`, `failed`, or `in_progress`), and `since` and
`until` as RFC 3339 date-time strings with `Z` or an offset, or `Date` objects.
The SDK rejects invalid calendar dates, date-only strings, and values outside
these sets before sending.

```ts
const { data: stats } = await platform.calls.stats({
  since: "2026-09-01T00:00:00Z",
  until: "2026-09-18T00:00:00Z",
  groupBy: "day",
  timezone: "Europe/Lisbon",
});
console.log(stats.totals.answerRate, stats.groups, stats.heatmap);

for await (const call of await platform.calls.list({ outcome: "missed" })) {
  console.log(call.callId, call.peerRef, call.endReason);
}
```

- `stats(params)` returns `CallStats`: `totals`, one `groups` entry per
  bucket, and a 168-cell `heatmap` of calls by ISO day of week (Monday is 1)
  and hour. `groupBy` is `day` (the default, up to 366 days), `hour` (up to 31
  days), `session` (the 500 busiest numbers; `groupsTruncated` reports more),
  or `outcome`. `timezone` is an IANA name, including single-name zones such
  as `CET` and `GMT`, and defaults to `UTC`. The API matches names in any case
  and refuses UTC offsets. Without `since` and `until` the range is the last 7 days. A
  query that takes too long fails with `PolymorfaServerError`
  (`service_unavailable`).
- `list(params)` returns a `CursorPage<CallRecord>`, newest first. `limit` is
  1 to 100 (default 25). `peerRef` is a team-specific pseudonym of the other
  party; call records never contain phone numbers.
- `export(params)` returns one page of up to 1,000 records (`limit` 1 to 1,000)
  as `{ format, body, nextCursor }`. `format` is `csv` (the default; every page
  starts with a header row and uses CRLF line endings) or `ndjson` (one call
  record per line). Pass `nextCursor` back as `cursor` with the same filters;
  it is `null` on the last page.
- `exportAll(params)` yields the body of every page in order. CSV pages after
  the first drop their header row, so the chunks join into one CSV file. If
  the API returns a cursor that was already requested, including the starting
  `cursor`, `exportAll` throws `PolymorfaServerError` (`invalid_response`)
  without yielding that page, so a replayed page never reaches your output.

```ts
import { createWriteStream } from "node:fs";

const file = createWriteStream("calls.csv");
for await (const chunk of platform.calls.exportAll({
  since: "2026-09-01T00:00:00Z",
})) {
  file.write(chunk);
}
file.end();
```

## Call data retention

`Client.callRetention` reads and changes how long Polymorfa keeps your team's
call data. It is one setting for the whole team, so a project client reads the
same value as its team. Changing it requires a team API key; a project token
receives `PolymorfaAuthorizationError`.

```ts
const { data: current } = await platform.callRetention.retrieve();
// { policy: "extended", retentionDays: 90, appliesTo: [...], revision: 0, updatedAt: null }

await platform.callRetention.update({
  policy: "custom",
  retentionDays: 45,
  expectedRevision: current.revision,
});
```

To read the team setting with a project token when you do not have its project
ID, create the retention client directly:

```ts
import { createTeamCallRetentionClient } from "@polymorfa/sdk";

const retention = createTeamCallRetentionClient({
  credential: { type: "projectToken", value: projectToken },
});
const { data } = await retention.retrieve();
```

This client exposes only call retention. Other project-token methods still
require an explicit project ID.

`policy` is `short` (7 days), `standard` (30 days), `extended` (90 days, the
default), `compliance` (365 days), or `custom`. `custom` requires
`retentionDays` (1 to 2555), and `UpdateCallRetentionRequest` rejects a
`custom` update without it at compile time. With a named policy, omit `retentionDays` or send
exactly that policy's period; any other value raises
`PolymorfaValidationError` with `code` `invalid_parameter`. When
`expectedRevision` no longer matches the stored revision (0 for a team on the
default), the update raises `PolymorfaConflictError` with `code`
`state_conflict`. The revision guard is optional: omitting
`expectedRevision` applies the update without checking for intervening changes
(last write wins).

Deletion of call data older than `retentionDays` starts on a date Polymorfa
announces in its changelog; until then the setting records a choice and
nothing is deleted. Once deletion runs, a shorter period also applies to call
data already stored, and deleted data cannot be recovered. `appliesTo`
lists the kinds of call data the period covers (`call_records`,
`call_events`, and `client_reports`); new kinds are added to the list and
follow the same period, so treat it as an open list of strings.

## Calls and stable user identity

The `calls`, `identities`, and `users` resources use public Polymorfa user IDs.
Identity resolution accepts an ID, phone number, or BSUID. Calling and security
code checks require a connected Linked Device Number; identity resolution also
supports Cloud Numbers when their business portfolio is configured.

```ts
await messaging.calls.reject(
  "support",
  incomingCallId,
  { from: callerId },
  { idempotencyKey: incomingCallId },
);

const identity = await messaging.identities.resolve("support", {
  phoneNumber: "+15551234567",
});

if (identity.data.data.id) {
  const code = await messaging.users.getSecurityCode(
    "support",
    identity.data.data.id,
  );
  console.log(code.data.data.numericCode, code.data.data.qrCode);
}
```

`calls.reject` requires `chats:manage`. Its call ID must contain 1 through 128
characters and the JSON `from` field must contain the incoming caller's
public Polymorfa user ID or E.164 phone number. Path identifiers are URL-encoded.
The SDK sends an idempotency key
when supplied and only permits automatic retries of this POST when that key is
nonempty. This session-scoped route is separate from the Polymorfa Calls
routes on `MessagingClient.voip`.

The pinned OpenAPI declares a generic synchronous `SuccessResponse` for call
rejection. The live runner returns
`{ success: true, data: { status: "REJECTED" } }`. A caller can explicitly send
`Prefer: respond-async` through `RequestOptions.headers`, in which case the live
RPC returns HTTP 202 with `{ success: true, data: { requestId } }`.
`RejectCallResponse` represents all three source-observable shapes.

`identities.resolve` requires `contacts:read`. `ResolveIdentityParams` is a discriminated
union that permits exactly one of these inputs:

- `phoneNumber`: digits with an optional leading `+`; the runner trims
  surrounding whitespace and returns a normalized leading `+` when known
- `id`: a decimal Polymorfa user ID
- `username`: 3 through 35 characters, with an optional four-digit
  `usernameKey`

`usernameKey` is invalid without `username`, and competing identity inputs are
rejected before runner dispatch. The response can contain the stable `id`, a
phone number, a BSUID, a username, and `keyRequired` when
WhatsApp needs the username's four-digit key. The source exposes no bulk
resolution, search, list, pagination, or retained identity history.

`users.getSecurityCode` also requires `contacts:read` and accepts only a stable
decimal Polymorfa user ID. The result contains that ID,
optional known aliases, a 60-digit `numericCode`, and a base64-encoded display
`qrCode`. The runner deliberately excludes WhatsApp's private verification QR
payload, and the API schema rejects an upstream response that does not match
the public shape. The API marks successful and failed responses
`Cache-Control: private, no-store`; callers can inspect that header through
`ApiResponse.metadata.headers`. This GET is always synchronous. The source
exposes no security-code list, cache, history, refresh, or verification-submit
operation.

All three methods preserve request IDs and response metadata and accept the
standard timeout, cancellation, API-version, custom-header, and retry options.

## Groups

`MessagingClient.groups` exposes all 21 operations in the pinned Groups tag.
Reads require `groups:read`; mutations require `groups:manage`.

```ts
const groups = await messaging.groups.list("support");
const group = groups.data.data[0];

if (group) {
  const participants = await messaging.groups.listParticipants(
    "support",
    group.id,
  );

  await messaging.groups.addParticipants(
    "support",
    group.id,
    { participants: ["15551234567"] },
    { idempotencyKey: "add-support-participant" },
  );

  console.log(participants.data.data, participants.metadata.requestId);
}
```

The resource includes create and retrieve, invite-code lookup and revocation,
join-info lookup, join and leave, participant add/remove/promote/demote,
subject and description updates, profile pictures, and all four group
permission settings. `delete` maps the API's DELETE leave alias; it does not
delete the remote group for every participant. Group identifiers and session
names are encoded as path segments, and every mutation accepts idempotency,
timeout, cancellation, and API-version request options.

The source exposes no pagination for group or participant lists. Browser client
tokens cannot access Groups routes because no Groups action exists in the
client-token allowlist; use a server API key with the required scope.

## Messages

`MessagingClient.messages` maps the complete five-operation Messages tag:
`send`, `markSeen`, `setTyping`, `react`, and `star`. All five require
`messages:write` when called with a server API key and accept the standard
`RequestOptions`, including idempotency, cancellation, timeouts, custom
headers, and API-version overrides.

The source has one send route rather than separate routes for each message
kind. `SendMessageRequest` is therefore a union of the exact typed payloads for
text, image/file/voice/video media, polls, locations, contacts, phone-number
requests, products, product lists, orders, lists, buttons, address messages,
flows, and call permission requests. Template sends use `SendTemplateMessageRequest`. Select exactly one
message kind inside `content`; `conversation` selects its destination.

```ts
await messaging.messages.send(
  "support",
  {
    conversation: { phoneNumber: "+15551234567" },
    content: {
      buttons: {
        body: "Continue with this request?",
        buttons: [
          { type: "reply", text: "Continue", id: "continue" },
          { type: "reply", text: "Cancel", id: "cancel" },
        ],
      },
    },
    quotedMessage: {
      id: "739182640518204",
    },
  },
  { idempotencyKey: "reply-to-message-id" },
);
```

Reply context uses `quotedMessage`; forwarding is represented by
`isForwarded`. Neither is a separate endpoint. The pinned contract exposes no
message list, search, or standalone forward/reply route in `messages`. Hosted
message history is read through `MessagingClient.chats` as described below.

### Hosted message history beta

`MessagingClient.chats.list(session, params)` lists stored conversations;
`retrieve(session, conversation)` reads one. `listMessages(session,
conversation, params)` and `retrieveMessage(session, conversation, messageId)`
read stored messages. A conversation can be a public ID or E.164 phone number;
the SDK encodes it in the path. Keep message IDs and cursors as opaque strings.

```ts
const page = await messaging.chats.listMessages("support", "+14155550123", {
  limit: 50,
  order: "desc",
  types: "text,image",
});
for (const message of page.data.data) console.log(message.id, message.text);
if (page.data.nextCursor) {
  const older = await messaging.chats.listMessages("support", "+14155550123", {
    cursor: page.data.nextCursor,
    order: "desc",
    types: "text,image",
  });
  console.log(older.data.previousCursor);
}
console.log(page.metadata.headers["polymorfa-data-region"]);
```

These four reads require an organization key or project token, a visible
Number with hosted message storage enabled, team enrollment in
`messaging.history`, and `chats:read` or `messages:read` as appropriate. The
feature is an unreleased enrolled beta; an SDK method does not grant access.
Client tokens are refused before transport. A disabled HMS Number yields
`404 hms_not_enabled`; absent beta access yields `403 permission_denied`, and
an unavailable regional read yields `503 service_unavailable`. Media entries
carry an API download path, not a signed URL; downloading requires `media:read`.

Client tokens can call all five Messages operations only when the corresponding
live rule is enabled: `send_message` for send and star, `send_reaction` for
react, `send_typing` for typing, and `send_seen` for seen markers. Send and
reaction are also subject to recipient rules and send limits. Edit and delete
are not Messages routes: they remain `MessagingClient.chats.editMessage` and
`deleteMessage`, require `chats:manage` with a server key, and are not in the
client-token allowlist.

### Idempotent sends

These methods send an `Idempotency-Key` on every call:

- `messages.send` and `messages.react`
- `chats.editMessage` and `chats.deleteMessage`
- `channels.reactToMessage`
- `campaigns.create` and `campaigns.launch`

If you don't pass `idempotencyKey`, the SDK generates a random UUID for the
call. Every automatic retry of that call reuses the key, so the API never
runs the write twice. If the first attempt succeeded but its response was lost,
the retry fails with `PolymorfaConflictError` (`idempotency_completed`) instead
of sending the message again. Pass your own key, such as
an order event ID, to deduplicate across processes or restarts:

```ts
await messaging.messages.send(
  "support",
  {
    conversation: { phoneNumber: "+15551234567" },
    content: { text: "Shipped" },
  },
  { idempotencyKey: `order-${orderId}-shipped` },
);
```

The API keeps each key for 24 hours per credential. Reusing a key for a
different request fails with `PolymorfaConflictError` (`idempotency_conflict`).
A retry that arrives while the first request is still running receives
`idempotency_in_progress`, and the SDK retries it after `Retry-After`. When a
response carries `Idempotent-Replayed: true`, the SDK treats it as final and
does not retry. A replayed `result_unknown`, or `idempotency_outcome_unknown`,
means the first attempt's outcome is unknown, so check message events before
you send again with a new key.

`BrowserMessagingClient.messages.send` and `react` generate keys the same way.

## Messaging media

`MessagingClient.media` is distinct from `Client.media`. It covers the
Messaging Media tag for Linked Device sessions. Every download method requires
a server credential with `media:read`; client tokens cannot call media routes.

| Method                             | Result                                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `downloadStream(mediaId, options)` | `{ body: ReadableStream<Uint8Array>, contentType?, contentLength?, filename?, requestId?, redirected, metadata }` |
| `downloadBlob(mediaId, options)`   | `{ blob, filename?, requestId? }`, with `blob.type` set from `Content-Type`                                       |
| `downloadUrl(mediaId, options)`    | `{ streamed: false, url, expiresAt? }` or `{ streamed: true, url: undefined }`                                    |
| `download(mediaId, options)`       | `ApiResponse<ArrayBuffer>` (buffers the whole file)                                                               |
| `retrieve(mediaId)`                | `MessagingMediaInfo`                                                                                              |
| `persist(mediaId)`                 | Saves the object to the tenant's object storage; requires `media:manage`                                          |

The API either streams the file or answers `302` with a fresh signed storage
URL. `downloadStream`, `downloadBlob` and `downloadUrl` send requests with
`redirect: "manual"`. When the SDK follows a redirect, it requests the storage
URL without the `Authorization` header, custom headers or cookies.

```ts
import { Readable } from "node:stream";

const download = await messaging.media.downloadStream("media-id", {
  signal: request.signal,
});
console.log(download.contentType, download.filename, download.requestId);
Readable.fromWeb(download.body).pipe(response);
```

- `downloadStream` retries only before it returns the body. After that, a
  failed read errors the stream with `PolymorfaConnectionError`, or with
  `PolymorfaCancelledError` if the caller aborted it. `timeoutMs` applies until
  response headers arrive. `signal` also cancels a body that is still being
  read.
- `filename` comes from `Content-Disposition`. The SDK prefers the RFC 6266
  `filename*` value and keeps only the last path segment. Treat it as a
  display name, not as a path.
- `downloadUrl` does not follow the redirect. It returns the signed URL, so
  your app can hand a browser a direct link instead of proxying the bytes.
  The URL is short-lived and acts as a bearer credential: never log or store
  it, and give it only to a user you have already authorized for this media.
  `expiresAt` is derived from SigV4 or `Expires` query parameters when they
  are present. When the API streams the file instead, `downloadUrl` cancels
  the body and returns `{ streamed: true }`.
- API errors keep the existing error classes, such as
  `PolymorfaNotFoundError` for 404 and `PolymorfaAuthorizationError` for 403.
  A failed storage request raises `PolymorfaError` with code
  `media_storage_error`. A redirect to anything other than HTTPS raises code
  `invalid_redirect`.

`download()` buffers the response into an `ArrayBuffer` and keeps its existing
behavior. Timeout and cancellation stay active while the body is buffered.
`response.metadata.headers` keeps `Content-Type`. Credentialed clients send
`download()` requests with `redirect: "error"`, so `download()` fails when the
API answers with a storage redirect. Use `downloadStream` or `downloadBlob`
when media may be served from object storage.

### Write media to a file (Node.js)

`@polymorfa/sdk/node` contains the Node-only helpers, which import `node:fs`
and `node:crypto`. The main entry does not import `node:fs`.

```ts
import { downloadMediaToFile } from "@polymorfa/sdk/node";

await downloadMediaToFile(messaging.media, "media-id", "./attachment.bin", {
  signal,
});
```

The helper writes to a sibling temporary file (`.<name>.<uuid>.partial`,
mode `0600`) and renames it into place when the download finishes. If the
download fails or is aborted, the helper deletes the temporary file and leaves
any existing file at the destination unchanged. With `overwrite: false`, the
final step is an atomic link that fails with `PolymorfaConflictError` (code
`file_exists`) when the destination exists. `maxBytes` stops the download with
`media_too_large`, either from `Content-Length` before any bytes are read or
once too many bytes arrive. `writeStreamToFile(body, path, options)` applies
the same steps to any web stream.

### Download media directly from WhatsApp

When a project does not persist media, image, video, audio, document and
sticker message webhooks include `media`. This field is a base64 protobuf of
the WhatsApp attachment, including its CDN URL, `directPath`, hashes and
`mediaKey`. The SDK can fetch the encrypted file directly from the WhatsApp
CDN and decrypt it locally. This makes no Polymorfa API call and sends no
Polymorfa credential.

```ts
import { constructWebhookEvent, isEvent } from "@polymorfa/sdk";
import {
  downloadWhatsAppMediaToFile,
  nodeMediaCrypto,
} from "@polymorfa/sdk/node";

const event = await constructWebhookEvent(rawBody, signature, secret);
if (
  isEvent(event, "message.received") &&
  typeof event.payload.media === "string"
) {
  // Buffered, verified before any byte is released (default).
  const media = await messaging.media.downloadFromWhatsApp(event.payload, {
    maxBytes: 50 * 1024 * 1024,
  });
  const blob = await media.blob(); // typed with media.mimetype

  // Streamed to disk; renamed into place only after verification.
  await downloadWhatsAppMediaToFile(event.payload, "./incoming.bin");

  // Streamed to a consumer that can discard partial output on error.
  const live = await messaging.media.downloadFromWhatsApp(event.payload, {
    crypto: nodeMediaCrypto,
    verify: "streaming",
  });
}
```

`downloadWhatsAppMedia(input, options)` is the standalone form.
`decodeWhatsAppMedia(base64, messageType)` returns the decoded descriptor.
`deriveWhatsAppMediaKeys` and `decryptWhatsAppMedia(bytesOrStream, keys,
options)` cover apps that fetch the encrypted bytes themselves.

Verification follows the WhatsApp client order:

1. HKDF-SHA256 expands `mediaKey` to 112 bytes with the per-type info string.
   Stickers use the image string. The first 80 bytes give the IV, cipher key
   and MAC key.
2. The encrypted file is `ciphertext || mac10`. The SDK checks its SHA-256
   against `fileEncSha256` when that hash is present.
3. The SDK compares the HMAC-SHA256 of `iv || ciphertext`, truncated to 10
   bytes, in constant time.
4. The SDK decrypts with AES-256-CBC and strict PKCS#7 unpadding, then checks
   the plaintext SHA-256 against `fileSha256`. A descriptor without
   `fileSha256` is rejected.

A failure raises `PolymorfaMediaIntegrityError`. Its `code` is one of
`media_invalid_descriptor`, `media_too_short`, `media_too_large`,
`media_invalid_ciphertext`, `media_enc_hash_mismatch`, `media_mac_mismatch`,
`media_invalid_padding` or `media_hash_mismatch`.

- **Verification modes.** The default WebCrypto backend buffers the file and
  releases plaintext only after every check passes. `nodeMediaCrypto`
  decrypts incrementally and supports `verify: "streaming"`, which emits
  plaintext before the MAC is verified. If verification then fails, the
  stream errors and consumers must discard everything they received. Asking
  for `streaming` without an incremental backend raises
  `PolymorfaConfigurationError`.
- **Limits.** `maxBytes` defaults to 256 MiB and applies to the plaintext.
  The SDK also caps the encrypted size at the padded `fileLength` from the
  descriptor. It rejects an oversized `Content-Length` before reading the
  body. The descriptor input is limited to 1 MiB of base64. The decoder
  interprets only varint and length-delimited fields, and rejects wrong key
  or hash lengths.
- **Hosts.** The SDK tries the descriptor `url` first. It then tries
  `https://mmg.whatsapp.net` with `directPath` and the `hash`, `mms-type` and
  `__wa-mms` parameters. Every URL, including redirect targets, must be HTTPS
  on `*.whatsapp.net` with the default port.
- **Browsers.** `mmg.whatsapp.net` returned `access-control-allow-origin: *`
  to an unauthenticated probe on 2026-09-17. This was checked only on error
  responses, not on a real object. Even if a browser can fetch the file,
  decrypting there means giving the browser the `mediaKey`. Keep the
  descriptor on the server and use the `whatsapp` mode of
  `createMediaDownloadRoute` from `@polymorfa/nextjs`.
- **Privacy.** `media` contains a decryption key. Treat stored webhook
  payloads as secrets, never log them, and delete them when your retention
  period ends. The CDN URL expires, and once WhatsApp removes the object the
  file can no longer be downloaded. Messages with `mediaUrl` (persisted media)
  have no `media` field, so use the Media API for them.

The pinned source specifies no maximum download size. Retrieve metadata first
when an application must enforce its own memory limit. It exposes no Messaging
media upload, deletion, resumable upload, range-download, or list endpoint.
Message-send `url` and `base64` fields are send inputs, not media-upload APIs.
Media routes are absent from the client-token allowlist, so every API method
requires a server API key. `persist` accepts an idempotency key through the
standard `RequestOptions`.

`MessagingMediaInfo.s3Url` includes `null` because the API returns a null value
before persistence even though the generated schema marks the field as
optional. The SDK type reflects the verified response.

## Labels and observation policies

`MessagingClient.labels` covers all six direct Linked Device label operations.
Reads require `labels:read`; create, update, delete, and chat-label replacement
require `labels:manage`.

```ts
const labels = await messaging.labels.list("support", {
  includeObservation: true,
});

await messaging.labels.replaceForChat(
  "support",
  "15551234567@s.whatsapp.net",
  { labels: ["priority", "customer"] },
  { idempotencyKey: "replace-customer-labels" },
);

console.log(labels.data.data, labels.metadata.requestId);
```

`replaceForChat` maps the source `setChatLabels` operation and replaces the
complete label set. Passing an empty array detaches every label. The source has
no incremental attach/detach route and no message-label route. Label reads are
not paginated; `includeObservation` selects either the legacy label array or
the typed observation envelope.

The Labels tag also includes the cross-cutting policy routes exposed as
`MessagingClient.observationPolicies`. Project methods require
`presence:read` or `presence:observe`; setting `labelMode` additionally requires
`labels:manage`. Session methods carry the same scopes and are Linked Device
only. Policy updates replace the supplied presence and typing modes while the
label mode remains optional in the pinned request schema.

Neither labels nor observation policies appears in the client-token action
allowlist. Use a server API key; the API rejects browser client tokens before
route handling.

## Business App quick replies

`MessagingClient.quickReplies` exposes the complete four-operation quick-reply
subfamily in the Business App contract. Listing requires `profile:read`;
create, full replacement, and delete require `profile:write`.

```ts
const remembered = await messaging.quickReplies.list("support");

const created = await messaging.quickReplies.create(
  "support",
  {
    shortcut: "hours",
    message: "We are open from 09:00 to 18:00.",
    keywords: ["open", "hours"],
  },
  { idempotencyKey: "create-hours-quick-reply" },
);

await messaging.quickReplies.replace(
  "support",
  created.data.data.id,
  {
    shortcut: "openinghours",
    message: "We are open weekdays from 09:00 to 18:00.",
    keywords: ["open", "hours", "weekday"],
    count: 0,
  },
  { idempotencyKey: "replace-hours-quick-reply" },
);

console.log(remembered.data.data.status, remembered.metadata.requestId);
```

The list response is a bounded observation collection containing policy,
freshness status, and associated label IDs. It is not paginated. The update
route replaces the complete quick reply, so the SDK names it `replace` instead
of implying a partial update. The source exposes no retrieve-by-ID, send, or
manual sync operation.

The pinned public observation-policy request schemas do not include
`quickReplyMode`, although policy responses contain that field. Quick-reply
CRUD therefore does not alter observation policy, and the SDK does not add an
undocumented policy update field.

Quick-reply routes are absent from the browser client-token action allowlist.
Use a server API key with the required profile scope.

## Session profile

`MessagingClient.profile` exposes the complete five-operation Profile tag for
Linked Device sessions. `get` requires `profile:read`; `setName`, `setStatus`,
`setPicture`, and `deletePicture` require `profile:write`.

```ts
const profile = await messaging.profile.get("support");

await messaging.profile.setName(
  "support",
  { name: "Polymorfa Support" },
  { idempotencyKey: "profile-name-2026-08-19" },
);

await messaging.profile.setPicture(
  "support",
  { url: "https://cdn.example.com/support-profile.jpg" },
  { idempotencyKey: "profile-picture-2026-08-19" },
);

console.log(profile.data.data, profile.metadata.requestId);
```

Picture input is JSON containing optional `url` and `base64` string fields. It
is not a binary upload or streaming method. The pinned public schema does not
declare those fields mutually exclusive and does not publish a size limit. The
pinned runner prefers non-empty base64 when both fields are supplied, rejects a
payload with neither source, and internally limits fetched or decoded data to
50 MiB. Use one source per request for unambiguous behavior.

Profile routes are absent from the browser client-token action allowlist. Use a
server API key with the required profile scope. The Profile tag has no profile
history, picture download, or standalone upload operation.

## Privacy

`MessagingClient.privacy` exposes the complete three-operation Privacy tag for
Linked Device sessions. `get` requires `profile:read`; `set` and
`setDefaultDisappearingTimer` require `profile:write`.

```ts
const privacy = await messaging.privacy.get("support");

await messaging.privacy.set(
  "support",
  { setting: "online", value: "match_last_seen" },
  { idempotencyKey: "privacy-online-2026-08-19" },
);

await messaging.privacy.setDefaultDisappearingTimer(
  "support",
  { durationSeconds: 604800 },
  { idempotencyKey: "privacy-default-timer-2026-08-19" },
);

console.log(privacy.data.data, privacy.metadata.requestId);
```

`PrivacySettingMutation` is discriminated by `setting`; incompatible values
fail type checking. `PRIVACY_SETTING_VALUES` exposes the same matrix at runtime
for command parsers and validation:

| Setting                                 | Accepted values                                |
| --------------------------------------- | ---------------------------------------------- |
| `groupadd`, `last`, `status`, `profile` | `all`, `contacts`, `contact_blacklist`, `none` |
| `readreceipts`                          | `all`, `none`                                  |
| `online`                                | `all`, `match_last_seen`                       |
| `calladd`                               | `all`, `known`                                 |
| `messages`                              | `all`, `contacts`                              |
| `defense`                               | `on_standard`, `off`                           |
| `stickers`                              | `contacts`, `contact_allowlist`, `none`        |

Default disappearing-message durations are seconds: `0` disables the account
default, `86400` is one day, `604800` is seven days, and `7776000` is 90 days.
This account default does not replace the per-chat timer exposed by
`MessagingClient.chats.setDisappearingTimer`.

Privacy routes are absent from the browser client-token action allowlist. Use a
server API key with the required profile scope. The Privacy tag has no privacy
history, allowlist/blacklist member-management, or pagination operation.

## Presence

`MessagingClient.presence` exposes the complete four-operation Presence tag
for Linked Device sessions. `get` and `getForChat` require `presence:read`,
`set` requires `presence:write`, and `subscribe` requires `presence:observe`.

```ts
const self = await messaging.presence.get("support");

await messaging.presence.set(
  "support",
  { presence: "available" },
  { idempotencyKey: "presence-self-2026-08-20" },
);

const subscription = await messaging.presence.subscribe(
  "support",
  "15551234567@s.whatsapp.net",
  { idempotencyKey: "presence-subscription-2026-08-20" },
);
const observed = await messaging.presence.getForChat(
  "support",
  "15551234567@s.whatsapp.net",
);

console.log(
  self.data.data,
  observed.data.data,
  subscription.metadata.requestId,
);
```

`PRESENCE_STATES`, `PRESENCE_OBSERVATION_STATUSES`,
`PRESENCE_UNKNOWN_REASONS`, and `PRESENCE_CHAT_STATES` are root runtime
exports for input validation and response narrowing. Self presence is the
runner's remembered desired and last successfully sent value. Its
`authoritative` field is always `false`; `get` does not query remote account
state.

Chat presence is also not a live query. `getForChat` reads the bounded
observation projection controlled by `MessagingClient.observationPolicies`.
`off` and `events` modes can return an unknown state without retained presence;
`cache` mode returns `fresh` or `stale` cached observations. Typing observation
is reported alongside presence but remains distinct from
`MessagingClient.messages.setTyping`.

The pinned runtime makes each successful subscription or renewal valid for 120
seconds and returns the exact `expiresAt`; consumers must use that timestamp
rather than assuming a fixed lifetime. Subscriptions accept user and LID
identifiers, while chat reads also accept groups. Observation limits can return
429 and place presence subscriptions in a temporary suspension window. The
source exposes no stream, watch, history, polling helper, or unsubscribe route.

Browser client tokens can call `get` and `getForChat` with the
`read_presence` action and `subscribe` with `subscribe_presence`. They cannot
call `set`; that route requires a server API key. Client-token rules also bind
the request to the token's session. The server SDK accepts either credential
kind and leaves the live action check to the API.

The pinned OpenAPI describes the synchronous `set` result as a generic
`SuccessResponse`, while the pinned live RPC handler returns
`{ success: true, data: { status: "OK" } }`. `SetPresenceResponse` represents
both shapes, plus the documented async-accepted envelope. The subscription
type likewise includes its documented async response when callers explicitly
send `Prefer: respond-async`.

## Business App

`MessagingClient.business` exposes the 25 credential-compatible Business App
operations outside the separately maintained `quickReplies` resource. Every
operation requires a connected Linked Device session. Cloud API sessions,
project credentials, browser client tokens, dashboard sessions, and staff
credentials cannot use this resource.

```ts
const catalog = await messaging.business.getCatalog("sales", {
  jid: "15551234567@s.whatsapp.net",
  limit: 25,
});

const product = await messaging.business.createProduct(
  "sales",
  {
    name: "Mint tea",
    currency: "USD",
    price: "12000",
    images: [{ url: "https://cdn.example.com/tea.jpg" }],
  },
  { idempotencyKey: crypto.randomUUID() },
);

console.log(
  catalog.data.data.products,
  catalog.data.data.next,
  product.metadata.requestId,
);
```

The exact server scopes are:

| Scope           | Operations                                                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profile:read`  | `getProfile`, `getMerchantCompliance`                                                                                                                   |
| `profile:write` | `updateProfile`, `setCoverPhoto`, `deleteCoverPhoto`, `setMerchantCompliance`, catalog creation/cart mutation, and every product or collection mutation |
| `business:read` | `getCatalog`, `getProduct`, `listCollections`, `getCollection`, `getOrder`, `getLinkedAccounts`, `getEligibility`                                       |

All 17 non-GET operations accept `RequestOptions`, including idempotency keys.
They also represent the live `{ success: true, data: { requestId } }` result
returned when a caller explicitly sends `Prefer: respond-async`. This includes
`getOrder`, which is a token-bearing POST lookup despite its read semantics.
GET operations remain synchronous.

### Profile and account state

The profile surface is `getProfile`, `updateProfile`, `setCoverPhoto`, and
`deleteCoverPhoto`. Profile updates accept address, email, description, one or
two HTTP(S) websites, or business hours. `specific_hours` days require
distinct minute-of-day `openTime` and `closeTime` values; `open_24h` and
`appointment_only` reject those fields. A profile update must contain at least
one field, and a week cannot contain duplicate days.

`business.getProfile` always addresses the connected account's own Business
App profile. It reuses the public `BusinessProfile` response type but remains
distinct from `contacts.businessProfile`, which reads another contact's
profile by identifier.

Cover photos use one JSON source: an HTTP(S) URL fetched by the API or base64
data. There is no multipart, binary, file, streaming, resumable, or separate
upload operation. The API permits at most 5 MiB after decoding and 6,990,508
base64 characters. Remote downloads are capped at 5 MiB, require a public
host, reject URL credentials and private/reserved addresses, revalidate each
redirect, and time out after 60 seconds. The SDK's union prevents supplying a
URL and base64 together.

`getMerchantCompliance` and `setMerchantCompliance` read or completely replace
the merchant entity, customer-care, and grievance-officer fields. The server
trims strings and enforces the documented UTF-8 byte limits. `getLinkedAccounts`
returns optional Facebook Page, Facebook Business, Instagram Professional, and
WhatsApp ad-identity records. `getEligibility` returns at most the six exact
feature kinds declared by `BusinessFeature` with live upstream status strings.
Neither read offers history or pagination.

### Catalogs, products, collections, and orders

`getCatalog` requires a public business-owner ID. It accepts an opaque `after`
cursor, `limit` from 1 through 100, and optional image dimensions from 1 through 1024. Its response contains `products`, optional `next`, and optional
`previous`. `listCollections` uses the same owner ID and cursor model with
`collectionLimit` from 1 through 20 and `itemLimit` from 1 through 100; its
response contains `collections` and optional `next`. These are explicit cursor
fields, not offset pages, and the SDK does not synthesize `hasMore`.

`getCollection` accepts `after` and a product `limit`, but the pinned response
contains only the collection and products—no next cursor. The SDK preserves
that source limitation rather than claiming automatic pagination. Product,
collection, business-owner, order, cover-photo, and session identifiers are
encoded by the SDK. Cursors and order tokens remain query/body values rather
than path data.

Product creation and replacement require one through ten image sources. Each
image is exactly one of:

- `url`: an arbitrary public HTTPS image fetched through the bounded,
  SSRF-safe downloader, with a 16 MiB response cap;
- `base64`: JSON base64 capped at 16 MiB decoded and 22,369,624 encoded
  characters; or
- `mediaUrl`: an existing HTTPS URL on a WhatsApp or Meta host, reused without
  downloading.

`videoUrls` contain at most ten existing WhatsApp or Meta HTTPS URLs. The
resource does not invent file-path, byte-array, multipart, streaming,
resumable-upload, or media-upload methods. Product prices are unsigned integer
amounts in thousandths with up to 18 digits. Currency is a three-letter
uppercase code and is required with `price`; `currency` and `salePrice` are
invalid without `price`. Omitting `hidden` produces `false` in the pinned
runner. During replacement, that can trigger the separate visibility mutation
and unhide an existing product, so callers preserving a hidden product must
send `hidden: true` explicitly.

Collection creation requires one through 100 unique product IDs. Updates must
change the name or include at least one product addition/removal; each list is
unique and an ID cannot occur in both. Reordering requires one through 100
unique collection moves with indices from 0 through 99. Product and collection
appeal reasons are trimmed, nonempty, and capped at 4,096 UTF-8 bytes. The
generated OpenAPI exposes a 4,096-character maximum, so multibyte text can pass
schema validation and still fail the byte check; the SDK leaves that API error
visible as a typed validation error.

`getOrder` requires the exact order ID and opaque lookup token supplied by the
Business App event. It is not an order list, search, history, checkout, or
fulfilment API. The source likewise exposes no catalog listing independent of
a business-owner ID, no product search, no collection search, and no upload
progress.

## Channels

`history.sync` payloads distinguish linked-device indexes and their preserved
WhatsApp archive from Cloud history's `{ kind: "history", value }` envelope.
Narrow `HistorySyncPayload` with `"kind" in payload` before reading provider-specific
fields; `LinkedHistorySyncPayload` and `CloudHistorySyncPayload` are exported.

`MessagingClient.channels` exposes the complete 13-operation Channels tag for
connected Linked Device sessions. Channels are WhatsApp newsletters in the
protocol layer, but the SDK keeps the public API's `channels` terminology and
does not merge them with chats or groups.

```ts
const channels = await messaging.channels.list("support");
const channel = await messaging.channels.retrieve(
  "support",
  "120363000000000000@newsletter",
);
const messages = await messaging.channels.listMessages(
  "support",
  "120363000000000000@newsletter",
  { count: 25, before: 951 },
);
const updates = await messaging.channels.listMessageUpdates(
  "support",
  "120363000000000000@newsletter",
  { count: 25, since: 1787212800, after: 951 },
);

console.log(
  channels.data.data,
  channel.data.data,
  messages.data.data,
  updates.data.data,
);
```

The read surface is `list`, `retrieve`, `listMessages`,
`listMessageUpdates`, and `subscribeToLiveUpdates`; each requires
`channels:read`. `create`, `delete`, `markMessageViewed`, `reactToMessage`,
`follow`, `unfollow`, `mute`, and `unmute` require `channels:manage`. All
mutations accept `RequestOptions`, including an idempotency key.

Message history and update history are bounded arrays, not `CursorPage`
objects. Both accept `count` from 1 through 100 and default to 50. Message
history accepts a positive numeric message server ID as `before`. Update
history accepts a non-negative Unix timestamp in seconds as `since` and a
positive numeric message server ID as `after`; the pinned runner treats
`since: 0` as unset. Responses do not include `next`, `hasMore`, or a cursor,
so the SDK does not synthesize them. Update rows use the same `ChannelMessage`
shape as message rows, but `text` can be absent because update payloads contain
view and reaction counts without message content.

`subscribeToLiveUpdates` performs a temporary subscription mutation and
returns the upstream `durationSeconds`. It does not return a stream, iterator,
websocket, or listener. The source exposes no explicit unsubscribe operation;
applications can query `listMessageUpdates` while their upstream subscription
is active.

No channel route is present in the browser client-token action allowlist. Use a
server API key with `channels:read` or `channels:manage`; client tokens are
rejected before route execution. Every operation requires an active Linked
Device connection.

The pinned source has two request/response discrepancies:

- `CreateChannelRequest` publicly declares optional `picture`, while the
  runner unmarshals a field named `profileUrl`. The current handler therefore
  creates the channel without applying the declared picture. The SDK exposes
  only the contract field and does not claim that picture setup succeeds.
- Follow, unfollow, mute, unmute, viewed, and reaction routes declare generic
  `SuccessResponse` results. The live runner returns data envelopes with the
  statuses `FOLLOWED`, `UNFOLLOWED`, `MUTED`, `UNMUTED`, `VIEWED`, and
  `UPDATED`. The action response types represent both shapes, plus the live
  RPC async-accepted result available through `Prefer: respond-async` even
  though these routes omit 202 from the pinned OpenAPI.

The public reaction schema permits at most 32 characters. The runner performs
a second check against 32 UTF-8 bytes, so a multibyte reaction can pass route
validation and still receive a 400 response. Empty reaction text is preserved
and removes the caller's reaction upstream. Channel, session, and public
message identifiers are URL-encoded by the SDK.

## Messaging campaigns

`MessagingClient.campaigns` provides `list`, `create`, `retrieve`, `analytics`,
`listRecipients`, `addRecipients`, `launch`, `pause`, `resume`, `stop`, and
`requeue`. Reads require `campaigns:read`; writes require `campaigns:manage`.
Pass the project's slug as the first argument. Campaigns accept organization
API keys or project tokens; browser client tokens cannot use these methods.

```ts
const created = await messaging.campaigns.create(
  "support",
  {
    name: "August launch",
    templateId,
    recipients: [{ phone: "+14155550100", variables: { firstName: "Ada" } }],
  },
  { idempotencyKey: "campaign-august-create" },
);

const appended = await messaging.campaigns.addRecipients(
  "support",
  created.data.data.id,
  {
    recipients: [{ phone: "+442071838750", variables: { firstName: "Alan" } }],
  },
);
console.log(appended.data.data.added, appended.data.data.invalidRows);

const launched = await messaging.campaigns.launch(
  "support",
  created.data.data.id,
  { scheduledAt: Date.parse("2026-08-25T09:00:00Z") },
  { idempotencyKey: "campaign-august-launch" },
);
console.log(launched.data.data.operationId, launched.metadata.requestId);
```

Create accepts inline recipients, an audience ID in `recipientListId`, or both.
Each append accepts up to 1,000 recipients before launch and reports duplicates
and invalid rows. Each append sends an idempotency key, generated unless you pass
`idempotencyKey`, and automatic retries reuse it. Within 24 hours a retry of a
successful append returns its original counts with `Idempotent-Replayed: true`,
even after the campaign has launched. Pass your own key when you retry across
process restarts.

`listRecipients(projectSlug, campaignId, { status, cursor, limit })` returns
`{ data, page }` inside the response's `data`. Read recipients from
`response.data.data` and pass `response.data.page.nextCursor` into the next
request while `page.hasMore` is true. Each recipient includes its send,
delivery, read, failure and reply timestamps. Campaign `list` returns a complete
array; recipient pagination does not change that method.

Launch, pause and resume return the campaign state with an `operationId`.
They accept the transition without waiting for sending to finish. Stop always
cancels; its `operationId` is null when the campaign had no active delivery run
and was cancelled immediately. Check for null before calling
`Client.operations.wait(operationId)`. A launched campaign waiting for its
scheduled start can be stopped, but its start time cannot be changed.
Launch, pause, resume, and stop generate one idempotency key per call unless you
pass one. Automatic retries reuse that key; a completed replay returns the
API's `idempotency_completed` conflict, so inspect the campaign state after a
lost response.

`requeue` moves eligible failed recipients, and optionally recipients skipped
with an error, back into the queue. It returns the number moved. The API refuses
unentitled campaigns with `402`, suspension with `403`, and invalid lifecycle
transitions with `409`. Throughput above the eligible number pool's ceiling is
`400 campaign_throughput_capped`.

`Client.campaigns` provides the Platform campaign methods. Its single-campaign
reads, updates and deletion take a `PlatformCampaignParams` argument: a team
API key must supply the owning `projectId`. This resource is available only
on organization clients, not project views or project-token clients. Recipient
listing and append also require `projectId`. Platform
`recipients` uses the same cursor-page shape. `Client.audiences` manages audience
members, and `Client.optOuts` reads and replaces team keyword settings.

`create` and `launch` generate an `Idempotency-Key` for each call. A supplied
key is preserved across retries within the API's 24-hour replay window. If the
outcome remains uncertain after that window, reconcile campaign state before
starting another request; see [Idempotent sends](#idempotent-sends).
`archive` returns a receipt for a completed, failed, or cancelled campaign;
other states return `409`. A pending final event or active delivery run also
returns `409`; retry after both finish. Platform `delete` accepts draft,
completed, failed, cancelled, or archived campaigns. A completed or failed
campaign with a pending final event or active delivery run returns `409`.
The Messaging API has no campaign update, deletion, archive, duplicate, or
campaign event history method. The SDK does not substitute Platform routes for
those operations.

## Chats

`MessagingClient.chats` exposes the credential-compatible Linked Device chat
management surface. Every operation requires `chats:manage`.

```ts
await messaging.chats.editMessage(
  "support",
  "15551234567@s.whatsapp.net",
  "message-id",
  { text: "Corrected copy" },
  { idempotencyKey: "edit-message-id" },
);

await messaging.chats.setDisappearingTimer(
  "support",
  "15551234567@s.whatsapp.net",
  { durationSeconds: 604800 },
);
```

The duration is typed to the four values accepted by the API: disabled, one
day, one week, or 90 days. The resource also provides `deleteMessage`,
`archive`, and `unarchive`. Chat operations are not available for Cloud API
sessions.

## Webhooks and events

`MessagingClient.webhooks` lists, creates, retrieves, updates, and deletes
webhook registrations with a server credential carrying `webhooks:manage`.
Webhook mutations accept the same `RequestOptions` as every other resource,
including idempotency keys, cancellation, timeouts, and API-version overrides.

Use `webhooks.verify` with the exact raw request bytes before inspecting an
inbound Messaging delivery. `isEvent` narrows known event names to their
exported payload types:

```ts
const event = await webhooks.verify({
  body: rawBody,
  signature,
  secret: webhookSecret,
});

if (isEvent(event, "history.sync")) {
  if ("kind" in event.payload) {
    console.log("Meta Cloud API history batch", event.payload.value);
  } else {
    console.log(event.payload.syncType, event.payload.progress);
  }
} else if (isEvent(event, "contact.sync")) {
  console.log(event.payload.kind, event.payload.value);
} else if (isEvent(event, "message.echo")) {
  console.log(event.payload.source, event.externalId);
} else if (isEvent(event, "call.received")) {
  console.log(
    event.payload.callId,
    event.payload.from.id,
    event.payload.hasVideo,
  );
} else if (isEvent(event, "call.accepted")) {
  // answeredBy and exclusive say who answered and whether they claimed it.
  console.log(event.payload.answeredBy, event.payload.exclusive === true);
} else if (isEvent(event, "message.failed")) {
  if (event.payload.error === "blocked_by_safety") {
    console.log(event.payload.code, event.payload.retryAfter);
  }
} else if (isEvent(event, "bansafe.action")) {
  console.log(event.payload.rung, event.payload.requires);
} else if (isEvent(event, "campaign.stopped")) {
  console.log(event.payload.campaignId, event.payload.abandonedCount);
} else if (isEvent(event, "customer.pairing_link.connected")) {
  console.log(event.payload.customerId, event.payload.sessionId);
}
```

The catalog also types Customer lifecycle events (`customer.*`), BanSafe events
(`bansafe.health_threshold`, `bansafe.action`, `bansafe.incident`, and
`bansafe.claim`), campaign progress and lifecycle events (`campaign.*`),
`call.permission_changed`, `message.failed`, and `template.status`. `message.failed`
reports `blocked_by_safety` when BanSafe stops a send, with an optional `code`
and `retryAfter` in seconds. Unknown event names still parse as
`UnknownWebhookEvent`.

`contact.sync` delivers a Meta Cloud API contact batch as
`{ kind: "contacts", value }`. `message.echo` reports a message sent from the
WhatsApp Business app on a connected Meta Cloud API number as
`{ source: "whatsapp_business_app", value }`. Events for a session created by a
QuickLink include its optional `externalId`.

Development builds also export `CallEndedPayload` and `CallTelemetryPayload`.
For `call.ended`, check `from` before reading its identity: it is `null` when
the media host disappeared before reporting the caller. The reason is
`pod_lost` for those recovered terminal events. Telemetry fields `recvKbps`
and `sendKbps` contain cumulative kilobits, not rates.

`webhooks.verifySignature()` performs the same production signature check and
returns a boolean without parsing. `webhooks.createFixture()` creates an exact
JSON byte sequence and matching production signature for local tests.
`webhooks.verifyLocal()` verifies the timestamped signature used by local CLI
forwarding. These helpers are credential-free. The older
`constructWebhookEvent` and `verifyWebhookSignature` exports remain available
through the first stable major. A later major can remove them with a migration
release.

The management `Client` owns a separate durable developer API at both
organization and project scope:

- `events.list`, `retrieve`, and `replay`
- `webhooks.list`, `create`, `retrieve`, `update`, `delete`, `test`, and
  `rotateSecret`
- `webhookDeliveries.list`, `retrieve`, `listAttempts`, `retrieveAttempt`, and
  `retry`
- `operations.list`, `get`, `listTransitions`, `cancel`, and `wait`

```ts
const deliveries = await project.webhookDeliveries.list({
  webhookId: "wh_123",
  limit: 25,
});

const delivery = deliveries.items[0];
if (delivery) {
  const attempts = await project.webhookDeliveries.listAttempts(delivery.id);
  if (attempts.items[0]) {
    const attempt = await project.webhookDeliveries.retrieveAttempt(
      delivery.id,
      attempts.items[0].id,
    );
    // Failed HTTP responses carry a redacted excerpt of at most 8192 UTF-8 bytes.
    console.log(attempt.data.response?.excerpt);
  }
}

const replay = await project.events.replay(
  "evt_123",
  { webhookId: "wh_123" },
  { idempotencyKey: crypto.randomUUID() },
);

console.log(replay.data.operationId);
```

Cursor-based list methods return `CursorPage<T>`. Mutations return owner-specific typed
receipts and preserve response metadata, request IDs, and idempotency receipts.
Organization and project `events.list({ afterOffset: "0" })` instead return an
`FollowableIndexedEventPage`: `highWatermark` gives the retained-stream baseline,
`nextOffset` identifies the continuation point when more events exist, and `nextPage()`
continues in ingestion order using that offset. The raw response's
`page.nextCursor` is null in this mode. Pass decimal offsets as strings;
`afterOffset` cannot be combined with
`cursor`, `since`, or `until`. The ordinary cursor list remains available when
`afterOffset` is omitted.

```ts
const indexed = await project.events.list({ afterOffset: "0", limit: 100 });
console.log(indexed.highWatermark, indexed.items);
if (indexed.hasMore) {
  const next = await indexed.nextPage();
  console.log(next?.nextOffset);
}
```

`events.listIndexed({ afterOffset: "0" })` also returns an indexed page with
`items`, `page.nextOffset`, `page.highWatermark`, and response `metadata`. Pass
`page.nextOffset` to the next call while `page.hasMore` is true. When the page
is exhausted, save `page.highWatermark` as the next polling baseline.

Use `operations.get()` or `operations.wait()` to inspect asynchronous work,
and `operations.cancel()` while `capabilities.cancellable` is true. Reads need
`operations:read`; cancellation needs `operations:cancel`.

Console and staff routes remain absent from the server client and its raw
guidance. The CLI listener protocol stays private to the CLI.

### Stream events in real time

`events.stream()` follows a project's server-sent event stream. It needs a
credential with `events:listen` and a team enrolled in the Event streams beta;
without enrollment the iterator throws `PolymorfaAuthorizationError` with code
`feature_unavailable`. Organization clients pass `projectId`.

```ts
const controller = new AbortController();
const stream = client.project(projectId).events.stream({
  types: ["message.*", "session.connected"],
  since: savedCursor, // optional: resume after this cursor
  signal: controller.signal,
  onGap: (gap) => console.warn(`${gap.missedEvents} events expired`),
});

for await (const item of stream) {
  if (item.webhook) handle(item.webhook); // the exact webhook body
  await saveCursor(item.cursor);
}
```

Each item carries the event metadata (`item.event`, the same fields as
`events.retrieve`), the decoded webhook body (`item.webhook`, or `null` when
hosted message storage did not keep it), and its `cursor`. The iterator
reconnects with exponential backoff and jitter after a dropped connection, an
`expiry`, a missed heartbeat, `429`, `5xx`, or a recoverable gap, resuming from
the last delivered cursor. It ends with an error on an invalid or expired
cursor, an authentication or authorization failure, or a `revoked` stream.
Aborting `signal` or leaving the loop ends it without an error.

Pass `ack: "manual"` to have the server wait for your processing, and confirm
progress with
`events.acknowledgeStream(item.streamId, { cursor: item.cursor, sequence: item.sequence })`.

`events.liveSource()` returns a `LiveEventSource` for `@polymorfa/store`:

```ts
connectEventSource(
  store,
  client.project(projectId).events.liveSource({ types: ["message.*"] }),
);
```

It passes webhook bodies to the store with their cursors and skips events whose
body was not kept. Use it on a server or trusted worker; server credentials must
not reach a browser.

## Platform automation

Organization API keys can use handwritten campaign, audience, opt-out, and
media resources:

```ts
const campaign = await platform.campaigns.create(
  {
    projectId: "project_123",
    name: "August launch",
  },
  {
    idempotencyKey: "campaign-august-2026",
    timeoutMs: 10_000,
  },
);

console.log(campaign.data.data, campaign.metadata.requestId);
```

`Client.campaigns.create` requires `CreatePlatformCampaignRequest`, including
`name` and the owning `projectId`. It accepts `templateId`, `recipientListId`,
`senderConfig`, `scheduledAt`, inline `recipients` (at most 1,000), and
`recipientCount` (ignored when inline recipients are supplied). The named
`composerBlueprint`, `messagesArray`, `audienceRef`, `complianceConfig`,
`variants`, and `variantStrategy` values remain opaque JSON. Extra top-level
fields are not part of the create contract. Lifecycle action payloads remain
open `PlatformPayload` objects. Launch, pause, resume, and stop generate one
idempotency key per call unless you pass one. Archive, duplicate, and requeue
do not generate keys because their contracts do not declare replay. Templates
and Flows are not methods on `Client`:
their endpoints require a dashboard bearer and reject the organization API key
used by the server client.

## Metered call usage and gates

`Client.usage` reads the merged usage API. It needs `sessions:read`.
Organization clients can read team usage or filter by project and session;
project clients read only their bound project's usage. Gate state is team-wide:
`listGates()` requires an organization credential, and the API returns 403 for
project credentials.

```ts
const { data: usage } = await platform.usage.summary({ period: "2026-09" });
console.log(usage.billingEnabled, usage.meters);

for await (const record of platform.usage.iterateRecords({
  callId: "CALL-1",
})) {
  console.log(record.id, record.revision, record.quantity);
}

const { data: state } = await platform.usage.listGates({ session: "support" });
console.log(state.gates);
```

`summary()` defaults to the current UTC calendar month. `listRecords()` and
`iterateRecords()` include every month when `period` is omitted. Records use
closed meter and unit types; `usage.recorded` carries the same record shape.
Keep the highest `revision` for each record ID when a later event corrects it.
The event envelope's timestamp identifies that revision; `recordedAt` remains
the original record time.

Usage remains unpriced. Gate modes describe behavior only where `active` is
true; inactive voice gates have no runtime enforcement. This SDK resource
does not change prices, modes or customer access. Package publication and live access require separate release and deployment checks.

## Billing and usage

`Client.billing` exposes the complete organization-key billing family.
Reads require `sessions:read`. Credit quantities, including fields ending in
`Cents`, support up to six decimal places. They are not cash minor units.
Team warnings follow the fixed one-day and two-hour insufficiency forecast;
notification preferences are managed in the Console.

```ts
const [balance, usage, transactions, pricing] = await Promise.all([
  platform.billing.retrieve(),
  platform.billing.usage(),
  platform.billing.listTransactions(),
  platform.billing.listPricing(),
]);

console.log({
  balance: balance.data.data,
  usage: usage.data.data,
  transactions: transactions.data.data,
  pricing: pricing.data.data,
  requestId: usage.metadata.requestId,
});
```

### Change a number tier

Create a quote, show its credit charge and effective time, then confirm its ID
only after the customer accepts. Upgrades buy a fresh 24-hour window and replace
the remaining paid time. Downgrades apply when the paid window ends.

```ts
const reviewed = await platform.sessions.quoteTierChange(sessionId, {
  tierOverride: "pro",
});
const quote = reviewed.data.data;
console.log(quote.quote.amountCents, quote.quote.effectiveAtMs);

// After the customer confirms this exact quote:
await platform.sessions.setTierOverride(sessionId, { quoteId: quote.id });
const result = await platform.sessions.retrieveTierChange(sessionId, quote.id);
console.log(result.data.data.status);
```

A queued result has not granted the tier. Poll until it is applied or rejected.
A quote expires after ten minutes and can become invalid if the number or price
changes. Show a new quote for confirmation after a conflict; never silently
purchase a replacement. Set `tierOverride: null` when quoting to restore project
inheritance. The old `setTierOverride({tierOverride})` request and
`billing.updateReminderSettings` method are removed.

## Organization access and security

The organization view exposes key metadata, members, audit logs, session bans,
security incidents, and project-token metadata:

```ts
const [keys, members, audit, bans, incidents, tokens] = await Promise.all([
  platform.apiKeys.list(),
  platform.members.list(),
  platform.auditLogs.list({
    action: "session.stop",
    resource: "session",
    limit: 100,
  }),
  platform.sessionBans.listActive(),
  platform.securityIncidents.list(),
  platform.projectTokens.list("018f0000-0000-7000-8000-000000000002"),
]);

await platform.securityIncidents.acknowledge(incidents.data.data[0]!.id, {
  idempotencyKey: "acknowledge-incident-1",
});
await platform.apiKeys.deactivate(keys.data.data[0]!.keyId, {
  idempotencyKey: "deactivate-key-1",
});
```

These read operations require `sessions:read`. API-key deactivation and incident
acknowledgement require `sessions:manage`. The two mutations are direct
organization-scoped writes rather than asynchronous operations. The SDK retries
them only when an idempotency key is supplied, but the pinned handlers do not
persist that header. Incident acknowledgement is repeatable; an API-key
deactivation retry after an unseen successful response can return `404` because
the key is already inactive.

These list responses are complete arrays. The source exposes no cursor or
page token. The live audit handler accepts exact `action` and `resource`
filters plus a limit bounded to 1 through 500, although those query fields are
missing from the pinned OpenAPI operation. Project-token metadata requires an
explicit project ID for organization-key calls even though OpenAPI marks the
query field optional. Neither token-list operation returns bearer secrets.

The API-key list handler currently reports the all-scopes mask for each row
instead of the stored row-specific mask. The SDK preserves that numeric wire
field without interpreting it as proof of the caller's live authorization.
Incident acknowledgement records an empty acting-user value for API-key calls;
the subsequent incident list can therefore expose an empty `acknowledgedBy`
string rather than a dashboard user ID.

Organization updates, member role changes, member deletion, invitations,
billing top-ups, and console usage insights require a dashboard session and
are not exposed by the server SDK. Browser client tokens are rejected by the
Management API. Project tokens are accepted only by a project-scoped `Client`;
organization-only resources are absent from that view's public type.

## QuickLink lifecycle and settings

`MessagingClient.quickLinks` owns the authenticated hosted pairing lifecycle:

```ts
const quickLink = await messaging.quickLinks.create(
  {
    projectId: "11111111-2222-4333-8444-555555555555",
    externalId: "crm-account-42",
    configuration: { methods: ["qr", "pairing"] },
  },
  { idempotencyKey: crypto.randomUUID() },
);

const status = await messaging.quickLinks.retrieve(quickLink.data.data.id);
console.log(quickLink.data.data.url, status.data.data.status);
```

The resource accepts organization API keys or project tokens with
`quicklink:manage`. It rejects browser client tokens before transport. An
organization key can select `projectId` when creating a link; a project token
is bound by the server. `cancel()` invalidates a pending link and removes its
pending session. Connected links cannot be cancelled. The source exposes no
list, recover, or history operation.

`Client.quickLinkSettings.retrieve` and `update` map the management
`GET /platform/quicklink` and `PUT /platform/quicklink` operations. Use them on the root
organization client or an immutable project view:

```ts
const organizationSettings = await platform.quickLinkSettings.retrieve();
const projectSettings = await platform
  .project("project_123")
  .quickLinkSettings.update(
    {
      theme: "dark",
      enabled: true,
      successCallbackUrl: "https://app.example.com/whatsapp/connected",
      failureCallbackUrl: "https://app.example.com/whatsapp/cancelled",
      allowPhoneChange: false,
    },
    { idempotencyKey: "quicklink-project-123-dark" },
  );
```

These methods manage saved settings only. Hosted lifecycle methods stay on
`MessagingClient.quickLinks`, not `Client` or `client.project(...)`, because
the `/messaging/quicklinks/{id}` routes do not carry an immutable project path for an
organization-key project view. Console-only logo routes are outside the SDK.

`successCallbackUrl` and `failureCallbackUrl` are project-only HTTPS
destinations; the API copies them into each link when it is issued, and link
creation has no callback override. `allowPhoneChange` lets recipients replace a
prefilled number and defaults to `false`. `hideWatermark: true` requires an active Branded QuickLink
add-on. Saved settings have no redirect-URI allowlist. `externalId` on
creation is an integrator correlation value copied to the resulting session; it
can repeat across invitations and does not grant access.

## Management session lifecycle

The organization client's `sessions.start` requests a start for one stopped or
failed session. It accepts a session UUID or stable slug and an optional project
context:

```ts
const start = await platform.sessions.start(
  "support",
  { projectId: "11111111-2222-4333-8444-555555555555" },
  { idempotencyKey: "start-support" },
);
```

The returned `SessionStartResult` confirms that the start request was accepted;
it does not claim that the session has connected. A paid start first reserves
credit. An HTTP 402 response throws `PolymorfaPaymentRequiredError`, preserving
the API's error code, message, and request ID. It is not automatically retried;
resolve the funding or entitlement problem before submitting another start.
The charge is committed on successful connection. `sessions.stopMany` and
`deleteMany` cover the two bounded batch operations. All three require
`sessions:manage`. Batch methods accept `sessionIds` plus an optional
`projectId`:

```ts
const stop = await platform.sessions.stopMany(
  {
    projectId: "11111111-2222-4333-8444-555555555555",
    sessionIds: ["support", "sales"],
  },
  { idempotencyKey: "stop-support-sales" },
);

const removal = await platform.sessions.deleteMany(
  { sessionIds: ["old-support", "old-sales"] },
  { idempotencyKey: "delete-old-support-sales" },
);
```

The source accepts 1–100 UUIDs or stable slugs. It trims identifiers and the
live handler deduplicates repeats, while OpenAPI declares the array unique.
Only matching rows contribute to `{ stopping }` or `{ removed }`; the API does
not return per-item results or errors for missing identifiers. Batch stop
requires session-control publishing and queues fire-and-forget stop commands.
Batch delete removes rows first, then best-effort queues kill commands for
rows that were not disconnected. Neither route returns a durable operation ID,
stream, watcher, or completion status.

The transport retries these mutations only when an idempotency key is
provided. The pinned handlers do not persist that header. A repeated stop can
enqueue another stop command; a repeated delete reports only rows still found.
QuickLink settings updates are state upserts and can safely converge on the
same supplied values.

## Session creation and configuration

Create new sessions with `MessagingClient.quickLinks.create`. Direct
`sessions.create` and Platform `sessions.createTesting` have been removed in this
breaking contract update. Reconnect and delete still operate on existing sessions.

```ts
const link = await messaging.quickLinks.create({
  projectId,
  configuration: {
    connectionPreference: "linked",
    historySync: { consent: "ask" },
  },
});
```

Page text, appearance, legal links, and callbacks belong in saved
`Client.quickLinkSettings`, not individual invitations. Links report nullable
`expiresAt`; new invitations remain usable until completion or cancellation.
Free-tier real-account pairing is available only in the authenticated Console.

Use `Client.sessionConfiguration` for team defaults and
`client.project(projectId).sessionConfiguration` for project defaults. Session
updates take `{revision, configuration: {set, reset}}`; resets remove explicit
overrides so later defaults continue to apply. Reads expose effective values,
sources, consent restrictions, and pending runtime application.

For simulation, create a QuickLink with `configuration.testing`, including initial
`configuration` and the explicit `editable` subset delegated to the recipient.
Test access is checked independently; simulation cannot contact real accounts.

Test history content is uploaded separately from session configuration:

```ts
const fixture = await messaging.testing.createHistoryFixture(projectId, {
  messages: [
    {
      id: "example-1",
      senderPhone: testPhone,
      text: "Demo",
      timestamp: 1,
      fromMe: false,
    },
  ],
});
const invitation = await messaging.quickLinks.create({
  projectId,
  configuration: {
    testing: { configuration: { historyFixtureId: fixture.data.fixtureId } },
  },
});
```

Fixture senders must be existing simulated numbers in that project. Test-number
entitlements and history consent still apply; uploading a fixture does not enable
hosted message storage.

### Trigger test events

Fire a named, signed test event for a Test number. The event reaches your
webhooks and event history with `source: "test"` and does not change the Test
number. Real numbers are refused with a `PolymorfaValidationError`, and each
project can trigger 30 test events per minute (`PolymorfaRateLimitError`).

```ts
import { TEST_EVENT_FIXTURES } from "@polymorfa/sdk";

const result = await messaging.testing.triggerEvent(projectId, {
  session: "my-test-number",
  event: "message.received", // one of TEST_EVENT_FIXTURES
  overrides: { text: "hi", from: "+15550100001" },
});
console.log(result.data.eventId);

// Rare events: failed delivery, ban warning, incoming call, template rejection.
await messaging.testing.triggerEvent(projectId, {
  session: "my-test-number",
  event: "template.status",
  overrides: { templateStatus: "REJECTED", reason: "INVALID_FORMAT" },
});

const { data } = await messaging.testing.listEventFixtures(projectId);
```

Set `fromSession` on a `message.received` request to send a simulated text
from another connected Test number in the same project instead; the response
has `delivery: "simulated"` and the event arrives as ordinary Test number
activity. Both methods require an organization API key or project token with
`sandbox:write` (trigger) or `sandbox:read` (list) and Test numbers access.

Use `session.restriction_updated` with `{ restrictionActive: false }` to
test a restriction ending, or `true` to test one starting. The `call.ended`
fixture accepts `callEndReason: "call_restricted"` for a restricted call.

Pass `{ idempotencyKey }` as the third argument to `triggerEvent` to retry
safely. Repeating the request with the same key and body reuses the same event
ID, so a retry after an uncertain response never creates a second event or
duplicate webhook deliveries. With a key, the SDK also retries network and
5xx failures.

Trusted servers continue an issued Meta Cloud API invitation with
`messaging.cloudOnboarding.advance({ quicklinkId, projectId, result })`.
`result` contains the Embedded Signup authorization code, selected WABA and phone
IDs, and Coexistence/history choices. This method does not create a session or
accept Meta app secrets. Its progress response is not proof that messaging is
ready; inspect the QuickLink status.

## Contract update notes

The typed webhook catalog includes `session.restriction_updated` with
`type`, `active`, `enforcementType`, `expiresAt`, and `observedAt`.
`session.logged_out` requires a numeric `code` and a `reason` of `banned`,
`device_removed`, or `unknown`. Test event requests support the restriction
fixture with `restrictionActive` and the call-end reason `call_restricted`.

`Client.callRetention` covers the team call-retention settings. `Client.calls`
covers the three public call analytics and export operations. `Client.voice`
covers the Voice audio and credential operations. `Client.callPolicy` and
`Client.callOptOuts` cover consent controls. The contract snapshot is pinned
to API Hybrid Link source commit `2dd0c1563b1fc4e6525f708afc12e0685110cfe0`,
now merged into API `dev` by PR #260.

## Functions

Use a project client with `functions:read`, `functions:manage` or
`functions:invoke`, according to the operation. Your organization must be enabled
for Functions and the selected execution region must be available. Client tokens
cannot access this control plane.

```ts
const functions = client.project(projectId).functions;
const created = await functions.create({ name: "Order lookup" });
const deployed = await functions.deployments.create(created.data.id, {
  deploymentId: crypto.randomUUID(),
  language: "typescript",
  region: configuredRegion,
  compatibilityDate: "2026-09-22",
  source: `export default {
    handler() { return Response.json({ status: "ok" }); }
  };`,
  egressOrigins: [],
  secretVersionIds: [],
});
const result = await functions.invocations.create(
  created.data.id,
  {
    deploymentId: deployed.data.id,
    trigger: "test",
    request: {
      method: "POST",
      url: "https://function.polymorfa.invalid/test",
      headers: {},
      bodyBase64: "e30=",
    },
  },
  { idempotencyKey: crypto.randomUUID() },
);
```

`deployments.promote` selects the default deployment and requires
`expectedRevision`. `update` and `delete` also require the current revision.
`secrets.create` returns version metadata only; pin its ID in a new deployment.
`secrets.revoke` prevents subsequent invocations from using that version.
`deployments.list` returns deployment metadata without source code. Use
`deployments.retrieve` with a deployment ID to read its source.

Mutations and invocations have no automatic network retries. Keep the original
idempotency key when checking an interrupted invocation. Replays return a receipt
without the original response. An `unknown` outcome can mean an external effect
occurred; reconcile it before choosing a new key. Request/response bodies and
customer log output are not retained. List responses contain `items` and
`nextCursor`; pass that cursor as `before` to read the next page.
