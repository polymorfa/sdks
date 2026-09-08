# `@polymorfa/sdk`

The handwritten Polymorfa server SDK for TypeScript and Node.js.

Install the development branch:

```bash
npm install github:polymorfa/sdks#dev
```

Import Messaging and Platform clients, errors, response metadata, request
options, pagination, webhook utilities, and all public request/response types
from the package root:

```ts
import {
  MessagingClient,
  PlatformClient,
  PolymorfaError,
  constructWebhookEvent,
  type RequestOptions,
} from "@polymorfa/sdk";
```

See the repository README for the complete development contract and current
typed-resource coverage. This package has no runtime dependencies and requires
Node.js 20 or newer.

## Customers

Use `PlatformClient.customers` to manage project-owned Customers and their
Numbers. The resource covers the complete Customers contract, including
enablement, profile lifecycle, pairing links, recent events, and Number
transfers.

```ts
const customer = await platform.customers.create(
  {
    projectId: "project_123",
    name: "Ada",
    phone: "+15551234567",
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

`PlatformClient.banSafe` reads Health, telemetry collection status, the fixed
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
override.

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
```

Finding acknowledgement and restriction appeals require a signed-in dashboard
user. The organization-key SDK does not expose those two mutations.

## Browser client tokens

`MessagingClient.clientTokens` mints short-lived tokens and manages the live
session rules that authorize them. Use it only on the server. The browser-safe
transport and allowed-action resources live in `@polymorfa/browser`; the
Next.js-compatible route adapter lives in `@polymorfa/nextjs`.

## Session connection lifecycle

Start a Linked Device session, retrieve its JSON QR payload or request a phone
pairing code, then poll the returned durable lifecycle operation. Pairing
requires `sessions:manage`; operation retrieval accepts any of
`sessions:read`, `campaigns:read`, or `webhooks:manage`.

```ts
const started = await messaging.sessions.start("support", {
  idempotencyKey: "start-support",
});

const qr = await messaging.sessions.qr("support");
console.log(qr.data.data.qr, qr.metadata.requestId);

const pairingCode = await messaging.sessions.requestPairingCode(
  "support",
  { phone: "+15551234567" },
  { idempotencyKey: "pair-support-phone" },
);

const operation = await messaging.operations.retrieve(started.data.operationId);
console.log(pairingCode.data.data.code, operation.data.data.status);
```

`sessions.retrieve` is the typed source of session connection status. The
pinned API contract does not expose session logs or a separate
connection-status endpoint. QR image rendering remains an application concern;
the server SDK deliberately requests the typed JSON QR representation.

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

## Calls and stable user identity

The compact `calls`, `lids`, and `users` resources cover all three operations
in their pinned source tags. Each requires an organization server API key and
a connected Linked Device session. Project credentials, browser client tokens,
Cloud API sessions, dashboard sessions, and staff credentials cannot use these
routes.

```ts
await messaging.calls.reject(
  "support",
  incomingCallId,
  { from: callerJid },
  { idempotencyKey: incomingCallId },
);

const identity = await messaging.lids.resolve("support", {
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
nonempty JID. Session, call, and caller identifiers are passed without semantic
rewriting; path identifiers are URL-encoded. The SDK sends an idempotency key
when supplied and only permits automatic retries of this POST when that key is
nonempty. The source exposes no call list, retrieve, accept, history, watch,
stream, or outgoing-call operation.

The pinned OpenAPI declares a generic synchronous `SuccessResponse` for call
rejection. The live runner returns
`{ success: true, data: { status: "REJECTED" } }`. A caller can explicitly send
`Prefer: respond-async` through `RequestOptions.headers`, in which case the live
RPC returns HTTP 202 with `{ success: true, data: { requestId } }`.
`RejectCallResponse` represents all three source-observable shapes.

`lids.resolve` requires `contacts:read`. `ResolveLidParams` is a discriminated
union that permits exactly one of these inputs:

- `phoneNumber`: digits with an optional leading `+`; the runner trims
  surrounding whitespace and returns a normalized leading `+` when known
- `id`: a stable LID-backed user ID; the runner requires the `@lid` server
- `lid`: the deprecated input alias for `id`
- `username`: 3 through 35 characters, with an optional four-digit
  `usernameKey`

`usernameKey` is invalid without `username`, and competing identity inputs are
rejected before runner dispatch. The response can contain the stable `id`, its
deprecated `lid` alias, a phone number, a username, and `keyRequired` when
WhatsApp needs the username's four-digit key. The source exposes no bulk
resolution, search, list, pagination, or retained identity history.

`users.getSecurityCode` also requires `contacts:read` and accepts only a stable
user ID matching digits followed by `@lid`. The result contains that ID,
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
and flows. Template sends use `SendTemplateMessageRequest`; the API requires a
`type` value but ignores it when `template` is present.

```ts
await messaging.messages.send(
  "support",
  {
    chatId: "15551234567@s.whatsapp.net",
    type: "buttons",
    buttons: {
      body: "Continue with this request?",
      buttons: [
        { type: "reply", text: "Continue", id: "continue" },
        { type: "reply", text: "Cancel", id: "cancel" },
      ],
    },
    quotedMessage: {
      messageId: "message-id",
      participant: "15551234567@s.whatsapp.net",
    },
  },
  { idempotencyKey: "reply-to-message-id" },
);
```

Reply context uses `quotedMessage`; forwarding is represented by
`isForwarded`. Neither is a separate endpoint. The pinned contract exposes no
message history, list, search, or standalone forward/reply route.

Client tokens can call all five Messages operations only when the corresponding
live rule is enabled: `send_message` for send and star, `send_reaction` for
react, `send_typing` for typing, and `send_seen` for seen markers. Send and
reaction are also subject to recipient rules and send limits. Edit and delete
are not Messages routes: they remain `MessagingClient.chats.editMessage` and
`deleteMessage`, require `chats:manage` with a server key, and are not in the
client-token allowlist.

## Messaging media

`MessagingClient.media` is distinct from `PlatformClient.media`. It exposes all
three operations in the Messaging Media tag for Linked Device sessions:

- `download(mediaId)` returns `ApiResponse<ArrayBuffer>` and requires
  `media:read`.
- `retrieve(mediaId)` returns `MessagingMediaInfo` and requires `media:read`.
- `persist(mediaId)` asks the server to download and save the object to the
  tenant's configured object storage and requires `media:manage`.

```ts
const info = await messaging.media.retrieve("media-id");
const downloaded = await messaging.media.download("media-id", {
  timeoutMs: 30_000,
});

await writeFile("attachment.bin", new Uint8Array(downloaded.data));
console.log(info.data.data.mimeType, downloaded.metadata.requestId);
```

The API can stream bytes directly or redirect to object storage. The SDK
follows the platform fetch implementation's redirect behavior and buffers the
successful response into an `ArrayBuffer`; it does not represent the result as
JSON or claim streaming semantics. Timeout and cancellation remain active
while the body is buffered. Content type, content length, and content
disposition remain available in `response.metadata.headers`.

The pinned source specifies no maximum download size. Retrieve metadata first
when an application must enforce its own memory limit. It exposes no Messaging
media upload, deletion, resumable upload, range-download, or list endpoint.
Message-send `url` and `base64` fields are send inputs, not media-upload APIs.
Media routes are absent from the client-token allowlist, so all three methods
require a server API key. `persist` accepts an idempotency key through the
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

`getCatalog` requires a user or LID business JID. It accepts an opaque `after`
cursor, `limit` from 1 through 100, and optional image dimensions from 1 through 1024. Its response contains `products`, optional `next`, and optional
`previous`. `listCollections` uses the same JID and cursor model with
`collectionLimit` from 1 through 20 and `itemLimit` from 1 through 100; its
response contains `collections` and optional `next`. These are explicit cursor
fields, not offset pages, and the SDK does not synthesize `hasMore`.

`getCollection` accepts `after` and a product `limit`, but the pinned response
contains only the collection and products—no next cursor. The SDK preserves
that source limitation rather than claiming automatic pagination. Product,
collection, business JID, order, cover-photo, and session identifiers are
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
a business JID, no product search, no collection search, and no upload
progress.

## Channels

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
and removes the caller's reaction upstream. Channel, session, and numeric
message identifiers are URL-encoded by the SDK.

## Messaging campaigns

`MessagingClient.campaigns` exposes the complete nine-operation project-slug
campaign workflow: `list`, `create`, `retrieve`, `analytics`, `launch`,
`pause`, `resume`, `stop`, and `requeue`. Reads require `campaigns:read`;
creation and lifecycle changes require `campaigns:manage`.

```ts
const created = await messaging.campaigns.create(
  "support",
  {
    name: "August launch",
    templateId: "order-ready",
    recipientListId: "active-customers",
    scheduledAt: Date.parse("2026-08-25T09:00:00Z"),
  },
  { idempotencyKey: "campaign-august-create" },
);

const launched = await messaging.campaigns.launch(
  "support",
  created.data.data.id,
  {},
  { idempotencyKey: "campaign-august-launch" },
);

const operation = await messaging.operations.retrieve(
  launched.data.data.operationId,
);
console.log(operation.data.data.status, launched.metadata.requestId);
```

Launch, pause, resume, and stop append durable lifecycle commands and return the
campaign's current persisted state plus an `operationId`. They do not wait for
the campaign state to change. Poll that identifier with
`MessagingClient.operations.retrieve`; the API does not expose a campaign
watcher, stream, or command-cancellation route. Launch accepts an optional
epoch-millisecond schedule. Pause requires a running campaign, resume requires
a paused campaign, and stop accepts draft, running, or paused campaigns.

`requeue` is a direct transaction, not a durable operation. It moves failed
recipients back to pending and can also include recipients skipped with an
error. Its `{ requeued }` result is the number actually moved. Lists are
complete newest-first arrays; the source exposes no cursor, page token, search,
event history, replay, or delivery-listener endpoint.

This Messaging family is distinct from `PlatformClient.campaigns`, which maps
the Management API's organization-key campaign model. The Messaging routes
accept organization API keys. Their live authorization layer also accepts a
project token only when it is bound to the exact path project, but the public
`MessagingClient` credential contract does not accept project tokens, so this
resource deliberately remains organization-key-only. Browser client tokens
are not allowlisted for any campaign action and fail before the handler.
Campaigns are project control-plane objects and have no Linked Device versus
Cloud session-mode discriminator.

For organization-key calls, the live list and create handlers resolve the path
project slug. The other seven handlers currently authorize the organization
and campaign ID but do not verify that the campaign belongs to the supplied
slug. Callers must still supply the intended project slug; the SDK encodes it
and does not weaken this source behavior. The pinned OpenAPI campaign schema
omits several JSON repository fields and leaves analytics untyped. The SDK
exports the exact live analytics counters and preserves the extra campaign
fields as optional `unknown` values rather than asserting undocumented shapes.

The transport retries these mutations only when an idempotency key is
provided, but the pinned handlers do not persist that header. A create retry
after an unseen success can create another campaign. Repeating a lifecycle
command can conflict with the resulting state or append another intent;
repeating requeue normally reports zero after the matching recipients have
already moved. The live API reports entitlement failures as `402` and invalid
lifecycle state conflicts as `400`, rather than the more specific statuses
suggested by their semantics.

The source exposes no Messaging campaign update, deletion, archive, duplicate,
recipient listing, or campaign event inspection operation. The SDK does not
substitute similarly named Management API routes or `raw.request` calls for
those gaps.

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

Use `constructWebhookEvent` with the exact raw request bytes before inspecting
an inbound delivery. `isEvent` narrows all 33 event names in the pinned
Messaging contract to their exported payload types:

```ts
const event = await constructWebhookEvent(rawBody, signature, webhookSecret);

if (isEvent(event, "history.sync")) {
  console.log(event.payload.syncType, event.payload.progress);
} else if (isEvent(event, "call.received")) {
  console.log(event.payload.callId, event.payload.from.id);
}
```

The Platform contract exposes campaign events through
`PlatformClient.campaigns.events`. It does not expose key-authenticated webhook
delivery inspection, replay, test delivery, or a general event list. Console
webhook settings require a dashboard identity; staff webhook inspection and
disable operations require a staff identity. Those routes are intentionally
absent from the server client, including its raw-request guidance.

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

The pinned contract defines these operation payloads as open objects, exposed
as `PlatformPayload`. Templates and Flows are not methods on `PlatformClient`:
their endpoints require a dashboard bearer and reject the organization API key
used by the server client.

## Billing and usage

`PlatformClient.billing` exposes the complete organization-key billing family.
Reads require `sessions:read`; updating reminder settings requires
`sessions:manage`.

```ts
const [balance, usage, transactions, pricing] = await Promise.all([
  platform.billing.retrieve(),
  platform.billing.usage(),
  platform.billing.listTransactions(),
  platform.billing.listPricing(),
]);

await platform.billing.updateReminderSettings(
  {
    lowBalanceThresholdCents: 2_500,
    reminderChannels: ["email", "inApp"],
  },
  { idempotencyKey: "billing-reminders-august" },
);

console.log({
  balance: balance.data.data,
  usage: usage.data.data,
  transactions: transactions.data.data,
  pricing: pricing.data.data,
  requestId: usage.metadata.requestId,
});
```

## Organization access, security, and operations

The organization-key Platform surface exposes ten exact operations through
seven resources:

```ts
const [keys, members, audit, bans, incidents, operation, tokens] =
  await Promise.all([
    platform.apiKeys.list(),
    platform.members.list(),
    platform.auditLogs.list({
      action: "session.stop",
      resource: "session",
      limit: 100,
    }),
    platform.sessionBans.listActive(),
    platform.securityIncidents.list(),
    platform.operations.retrieve("018f0000-0000-7000-8000-000000000001"),
    platform.projectTokens.list("018f0000-0000-7000-8000-000000000002"),
  ]);

await platform.securityIncidents.acknowledge(incidents.data.data[0]!.id, {
  idempotencyKey: "acknowledge-incident-1",
});
await platform.apiKeys.deactivate(keys.data.data[0]!.keyId, {
  idempotencyKey: "deactivate-key-1",
});
```

The read operations require `sessions:read`. API-key deactivation and incident
acknowledgement require `sessions:manage`. The two mutations are direct
organization-scoped writes rather than asynchronous operations. The SDK retries
them only when an idempotency key is supplied, but the pinned handlers do not
persist that header. Incident acknowledgement is repeatable; an API-key
deactivation retry after an unseen successful response can return `404` because
the key is already inactive. `operations.retrieve` polls the durable state of
asynchronous work started elsewhere and does not open a stream or wait for
completion.

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
Management API, and `PlatformClient` deliberately rejects project and browser
client tokens before transport.

## Legacy widget settings

`PlatformClient.widgetSettings.retrieve` and `update` still request
`/v1/widget`, which is absent from the pinned API contract. The API now exposes
QuickLink settings at `/v1/quicklink`. These methods do not implement that
contract, and the ledger marks both QuickLink settings operations missing.
Do not use the widget settings methods against this API revision.

## Batch session lifecycle

`PlatformClient.sessions.stopMany` and `deleteMany` cover the two exact batch
operations. They require `sessions:manage` and accept `sessionIds` plus an
optional `projectId`:

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
Widget updates are state upserts and can safely converge on the same supplied
values.
