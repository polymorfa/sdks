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

Organization updates, member mutations, invitations, billing top-ups, and
console usage insights require a dashboard session and are not exposed by the
server SDK. `PlatformClient` accepts organization API keys and deliberately
rejects project and browser client tokens.
