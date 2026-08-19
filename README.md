# Polymorfa SDKs

Handwritten API clients, UI packages, and developer tooling for Polymorfa.

This development branch currently ships the TypeScript server SDK foundation.
It follows the Messaging and Platform contracts recorded at source revision
`5475b869a953d87ae39a94cdfb1e4be2cd3f4f0c`. Graph-compatible APIs are outside
this SDK's initial scope.

## TypeScript development install

The package has not been published to npm. Install the verified development
branch directly from GitHub:

```bash
npm install github:polymorfa/sdks#dev
```

The Git install runs the package build through `prepare`. The published package
name and root import are already stable:

```ts
import { MessagingClient, PlatformClient } from "@polymorfa/sdk";
```

Node.js 20 or newer is required. The package has no runtime dependencies.

## Messaging client

```ts
import { MessagingClient } from "@polymorfa/sdk";

const messaging = new MessagingClient({
  credential: {
    type: "apiKey",
    value: process.env.POLYMORFA_MESSAGING_API_KEY!,
  },
  apiVersion: "2026-08-19",
});

const sessions = await messaging.sessions.list();
console.log(sessions.data.data, sessions.metadata.requestId);

const sent = await messaging.messages.send(
  "support",
  {
    chatId: "15551234567@s.whatsapp.net",
    type: "text",
    text: "Hello",
  },
  { idempotencyKey: crypto.randomUUID() },
);
console.log(sent.data.data.id, sent.metadata.attempts);
```

Messaging credentials use an explicit discriminator. Server keys use
`{ type: "apiKey", value }`; short-lived client tokens use
`{ type: "clientToken", value }`. A discriminator/prefix mismatch fails before
any network request. Server keys are rejected in browser runtimes.

The handwritten Messaging resources in this milestone are:

- `sessions`: list, create, retrieve, update, delete, start, stop, restart,
  logout, and account
- `messages`: send, mark seen, set typing state, react, and star
- `webhooks`: list, create, retrieve, update, and delete

## Platform client

```ts
import { PlatformClient } from "@polymorfa/sdk";

const platform = new PlatformClient({
  apiKey: process.env.POLYMORFA_PLATFORM_API_KEY!,
});

const projects = await platform.projects.list();
const sessions = await platform.sessions.list({
  projectId: projects.data.data[0]?._id,
});
```

The Platform client accepts only `pmfa_` server API keys. It rejects client
tokens and project tokens before making a request.

The handwritten Platform resources in this milestone are:

- `organizations`: retrieve and update
- `projects`: list, create, request production enrollment, approve, and cancel
- `sessions`: list, stop, delete, set tier override, and create a testing
  session

## Response metadata and errors

Every request resolves to an `ApiResponse<T>`:

```ts
interface ApiResponse<T> {
  readonly data: T;
  readonly metadata: {
    readonly status: number;
    readonly requestId?: string;
    readonly apiVersion?: string;
    readonly attempts: number;
    readonly headers: Readonly<Record<string, string>>;
  };
}
```

Failures use exported error classes for configuration, validation,
authentication, authorization, not found, conflict, rate limiting, server,
connection, timeout, and caller-cancellation cases. HTTP errors carry status,
request ID, decoded details, and response metadata when the server supplied
them.

## Timeouts, cancellation, retries, and idempotency

Client defaults are a 30-second timeout and two network retries. Configure
them on the client or override them for one request:

```ts
const controller = new AbortController();

const response = await platform.projects.create(
  { name: "Support" },
  {
    signal: controller.signal,
    timeoutMs: 5_000,
    maxNetworkRetries: 1,
    idempotencyKey: "project-support-2026-08-19",
  },
);
```

GET, HEAD, and OPTIONS requests can retry transient connection failures,
timeouts, HTTP 408, 409, 429, and server failures. POST, PUT, PATCH, and DELETE
requests retry only when the caller supplies an idempotency key. The transport
honors `Retry-After`, then uses bounded exponential backoff with jitter.

## API versions and raw requests

Set `apiVersion` on a client or a single request. The SDK sends it as the
`Polymorfa-Version` header.

Every client exposes `raw.request<T>()` for endpoints without a curated method:

```ts
const response = await platform.raw.request<{ data: unknown }>({
  method: "GET",
  path: "/v1/operations/operation_123",
  query: { projectId: "project_123" },
});
```

Raw paths must start with one slash and cannot be absolute URLs, preventing a
credential from being forwarded to another host. Raw requests retain typed
errors, metadata, cancellation, API versions, retry rules, and idempotency.

`raw.paginate()` accepts a page decoder and returns `CursorPage<T>`, which
supports `items`, `nextCursor`, `hasMore`, `nextPage()`, and async item
iteration. The current contract has few cursor endpoints; the primitive is
available for new endpoints without reimplementing transport behavior in the
CLI.

## Webhooks

Verify the exact raw request body before parsing:

```ts
import { constructWebhookEvent, isEvent } from "@polymorfa/sdk";

const event = await constructWebhookEvent(
  rawBody,
  signatureHeader,
  webhookSecret,
);
if (isEvent(event, "message.received")) {
  console.log(event.payload);
}
```

Native deliveries use the hexadecimal `X-Webhook-Signature` value. The helper
also accepts the `sha256=<hex>` compatibility form. Verification uses
HMAC-SHA256 and constant-time comparison over the unmodified bytes. Known
events narrow to exported payload types; unknown event names and payloads are
preserved for forward compatibility.

## Coverage status

`contracts/coverage.json` maps all 331 Messaging and Platform operations in the
pinned contract. This milestone has 32 handwritten resource methods, 50
dashboard/staff routes excluded from the server credential surface, and 249
operations available through the raw escape hatch while typed methods are
added. Missing and structurally changed operations are reported individually;
the ledger never presents raw access as typed parity.

## Development

```bash
npm install
npm test
npm run lint
npm run format:check
npm run typecheck
npm run build
npm run check:coverage
npm run check:names
```

Package publication, tags, and GitHub releases require a separate explicit
release instruction.

## License

MIT
