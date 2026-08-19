# Polymorfa SDKs

Handwritten API clients, UI packages, and developer tooling for Polymorfa.

The development branch contains the TypeScript server SDK, a framework-neutral
browser runtime, shared UI contracts, Web Components, React bindings, thin
Next.js server helpers, and a production-gated developer assistant. It follows
the Messaging and Platform contracts recorded at source revision
`f156af2dda13e62b6b106a542fdedb39524bdb66`. Graph-compatible APIs are outside
this SDK's initial scope.

## Package architecture

| Package               | Runtime             | Responsibility                                                                    |
| --------------------- | ------------------- | --------------------------------------------------------------------------------- |
| `@polymorfa/sdk`      | Node.js 20+         | Messaging and Platform server clients, webhooks, and raw requests                 |
| `@polymorfa/browser`  | Browser             | Client-token transport and framework-neutral product controllers                  |
| `@polymorfa/ui`       | Isomorphic          | Appearance, locale, direction, motion, and diagnostic contracts                   |
| `@polymorfa/elements` | Browser             | Portable custom elements for React-free, Vue, Svelte, and plain HTML applications |
| `@polymorfa/react`    | Browser             | React bindings over the same controllers                                          |
| `@polymorfa/nextjs`   | Server              | App Router-compatible client-token and webhook helpers                            |
| `@polymorfa/devtools` | Development browser | Configuration, theme, viewport, network, and redacted diagnostic assistant        |

The non-server packages are complete development artifacts on `dev`, but have
not been published. Their names are the intended public identities in the
Polymorfa npm organization. No mobile-native binding is part of this milestone.

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
  logout, account, JSON QR retrieval, and phone pairing codes
- `operations`: retrieve durable lifecycle operation status
- `messages`: send, mark seen, set typing state, react, and star
- `chats`: edit or delete sent messages, archive or unarchive chats, and set
  disappearing-message timers
- `contacts`: list, check registration, retrieve contact metadata, inspect the
  blocklist, profile picture, user info, devices, and business profile, and
  block or unblock a contact
- `templates`: list, create, retrieve, update, delete, preview, and submit to
  Meta
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

const campaign = await platform.campaigns.create(
  { projectId: projects.data.data[0]?._id, name: "August launch" },
  { idempotencyKey: crypto.randomUUID() },
);
console.log(campaign.data.data, campaign.metadata.requestId);
```

The Platform client accepts only `pmfa_` server API keys. It rejects client
tokens and project tokens before making a request.

The handwritten Platform resources in this milestone are:

- `organizations`: retrieve the organization visible to the API key
- `billing`: retrieve balance and currency, inspect usage meters, list
  transactions and tier pricing, and update low-balance reminders
- `projects`: list, create, request production enrollment, approve, and cancel
- `sessions`: list, stop, delete, set tier override, and create a testing
  session
- `campaigns`: list, create, retrieve, update, delete, lifecycle actions,
  analytics, events, and recipients
- `audiences`: list, create, retrieve, delete, and create an upload URL
- `optOuts`: list, create one, create a batch, and delete by phone number
- `media`: retrieve a URL, delete, and create an upload URL

The pinned campaign, audience, opt-out, and media contracts expose their
operation payloads as open objects. These methods therefore use the exported
`PlatformPayload` type instead of claiming fields the contract does not define.

Platform template and Flow endpoints require a live dashboard bearer and reject
organization server keys. They are intentionally absent from `PlatformClient`;
browser template tooling must reach them through an application-owned server
adapter that authorizes the signed-in user.

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
events narrow to exported payload types for all 33 event schemas in the pinned
Messaging contract, including messages, sessions, groups, presence, contacts,
chats, calls, labels, history sync, command results, and business quick
replies. Unknown event names and payloads are preserved for forward
compatibility.

Messaging server credentials can manage webhook registrations through
`MessagingClient.webhooks`. The Platform contract has no server-credential
event listing, webhook delivery inspection, replay, or test-delivery endpoint.
Its console webhook settings require a dashboard session, and its cross-org
webhook controls require a staff identity, so neither surface is exposed by
`PlatformClient` or counted as missing server SDK coverage.

## Browser controllers and UI

Browser code accepts only short-lived `pmfa_ct_` tokens returned by an
application callback. It rejects server credentials and absolute request URLs.
The framework-neutral controllers cover QuickLink, conversations, composing,
template building, and one-to-one calls. They expose immutable snapshots through
`getSnapshot()` and `subscribe()`; React and Web Components render those same
objects rather than reimplementing product state.

```ts
import {
  BrowserMessagingClient,
  BrowserTransport,
  QuickLinkController,
  createClientTokenProvider,
} from "@polymorfa/browser";
import { quickLinkBackend } from "./quicklink-backend.js";

const getClientToken = createClientTokenProvider();
const transport = new BrowserTransport({ getClientToken });
const messaging = new BrowserMessagingClient({
  session: "support",
  getClientToken,
});

await messaging.messages.setTyping({ chatId: "customer", state: "typing" });
const quickLink = new QuickLinkController(quickLinkBackend(transport));
```

The browser Messaging client is session-bound and exposes only the runtime's
exact client-token action allowlist. `createBrowserComposerActions` connects
text/reply compose boxes to that client. Conversation history, template
management, media upload, and call lifecycle/control stay behind explicit
application-owned adapters because client tokens cannot call those routes.

The canonical template builder is the paired path for template management:
`MessagingClient.templates` performs server operations,
`createTemplateBuilderRoute` authorizes and scopes same-origin browser actions,
and `createSameOriginTemplateBuilderTransport` connects the framework-neutral
controller without exposing a server key, project slug, or submission session.
The controller models standard, carousel, authentication, and limited-time
offer definitions and keeps saving separate from Meta submission.

`@polymorfa/elements` provides custom elements for plain HTML and for frameworks
that interoperate with the Custom Elements standard. `@polymorfa/react`
provides idiomatic hooks and components, including controlled and SDK-owned
controller lifecycles.

### Calls boundary

Call media and signaling follow the implementation in `voip-v2`: browser WebRTC
media, offer/answer exchange, trickle ICE candidate submission and polling, and
the existing `/api/voip/calls/{id}` signaling paths. The application supplies a
`CallsBackend` for place, answer, reject, hangup, and lifecycle events because
that control plane is not exposed by the current `voip-v2` REST signaling
surface. The SDK does not invent group rooms, participants, reactions, hand
raising, or waiting rooms.

## Next.js and dev mode

`@polymorfa/nextjs` builds Web `Request`/`Response` handlers, so it has no Next.js
runtime dependency. Applications provide their own authorization and minting
logic; webhook helpers read raw bytes once and delegate verification to
`constructWebhookEvent` from the server SDK.

Template routes use the same application-owned authorization boundary. Project
scope and Cloud API session selection are resolver callbacks that run only on
the server; browser-provided replacements are ignored.

`@polymorfa/devtools` provides an explicit development overlay for appearance,
RTL, motion, viewport and network testing plus redacted request diagnostics. It
only enables when trusted build and token environments match and are both
non-production. Query-string flags cannot enable it, and the `production`
subpath exports an inert mount function.

## Coverage status

`contracts/coverage.json` maps all 331 Messaging and Platform operations in the
pinned contract. This milestone has 96 handwritten resource methods, 63
dashboard-only or staff routes excluded from the server credential surface,
and 172 operations available through the raw escape hatch while typed methods
are added. Missing and structurally changed operations are reported
individually; the ledger never presents raw access as typed parity.

## Development

```bash
npm install
npm test
npm run lint
npm run format:check
npm run typecheck
npm run build
npm run build:workspaces
npm run check:coverage
npm run check:names
```

Package publication, tags, and GitHub releases require a separate explicit
release instruction.

## License

MIT
