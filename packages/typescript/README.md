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
