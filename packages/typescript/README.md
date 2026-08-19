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
