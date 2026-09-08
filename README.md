# Polymorfa SDKs

Handwritten API clients, UI packages, and developer tooling for Polymorfa.

The development branch contains the TypeScript server SDK, a framework-neutral
browser runtime, shared UI contracts, Web Components, React bindings, thin
Next.js server helpers, and a production-gated developer assistant. It follows
the Messaging and Platform contracts recorded at source revision
`8c244aab0e5626d101a2c8c4915287427f39e014`. Graph-compatible APIs are outside
this SDK's initial scope.

## Package architecture

| Package               | Runtime             | Responsibility                                                                    |
| --------------------- | ------------------- | --------------------------------------------------------------------------------- |
| `@polymorfa/sdk`      | Node.js 20+         | Messaging, management, system, and Bridge server clients                          |
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
import {
  BridgeClient,
  Client,
  MessagingClient,
  SystemClient,
} from "@polymorfa/sdk";
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
  apiVersion: "1.0.0",
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
- `business`: manage the connected Business App profile, commerce catalog,
  products, collections, orders, compliance, linked accounts, and eligibility
- `calls`: reject an identified incoming Linked Device call
- `voip`: mint the browser call token used by `@polymorfa/browser` signaling
- `campaigns`: list, create, retrieve, inspect analytics, launch, pause, resume,
  stop, and requeue project campaigns through the Messaging control plane
- `messages`: send every contract-defined message kind through one typed send
  union, mark seen, set typing state, react, and star
- `media`: download binary media, retrieve metadata, and request durable object
  persistence
- `chats`: edit or delete sent messages, archive or unarchive chats, and set
  disappearing-message timers
- `channels`: list, create, retrieve, and delete channels; page channel
  messages and updates; and manage viewing, reactions, live-update
  subscriptions, following, and mute state
- `contacts`: list, check registration, retrieve contact metadata, inspect the
  blocklist, profile picture, user info, devices, and business profile, and
  block or unblock a contact
- `groups`: list, retrieve, create, join, leave, manage invite codes and
  participants, and update group profile and permission settings
- `labels`: list, create, update, delete, list a chat's labels, and replace a
  chat's complete label set
- `lids`: resolve one phone number, stable user ID, or username to known stable
  identity aliases
- `observationPolicies`: retrieve and update project ceilings and session
  overrides for presence, typing, and label observation
- `profile`: retrieve the session profile and set its name, status, or JSON
  URL/base64 picture source, plus delete the picture
- `privacy`: retrieve account privacy, update setting-specific values, and set
  the account default disappearing-message timer
- `presence`: set and inspect the session's own non-authoritative presence
  snapshot, inspect retained chat observations, and subscribe to user presence
- `quickReplies`: list, create, replace, and delete remembered Business App
  quick replies
- `templates`: list, create, retrieve, update, delete, preview, and submit to
  Meta
- `users`: retrieve a display-only identity verification code for a stable
  LID-backed user ID
- `webhooks`: list, create, retrieve, update, and delete

## Management client

```ts
import { Client } from "@polymorfa/sdk";

const client = new Client({
  credential: {
    type: "organizationApiKey",
    value: process.env.POLYMORFA_PLATFORM_API_KEY!,
  },
});

const projects = await client.projects.list();
const sessions = await client.sessions.list({
  projectId: projects.data.data[0]?._id,
});

const project = client.project("project_123");
const events = await project.events.list({ limit: 25 });
console.log(events.items, events.response.metadata.requestId);
```

`Client` binds its ownership context when you construct it. An organization
API key without `projectId` creates an organization client. Call
`client.project(projectId)` to create an immutable project view, or construct a
project view directly with an organization key or a `pmfa_pt_` project token:

```ts
const project = new Client({
  credential: {
    type: "projectToken",
    value: process.env.POLYMORFA_PROJECT_TOKEN!,
  },
  projectId: "project_123",
});
```

Project tokens require an explicit project ID. The server verifies the initial
token-to-project binding. A later attempt to bind that client to another
project fails before transport. `Client` also rejects browser client tokens and
the CLI-only `pmfa_ls_` listener credential before transport.

Both organization and project views expose owner-bound resources:

- `events`: list, retrieve, and replay durable events
- `webhooks`: list, create, retrieve, update, delete, test, and rotate secrets
- `webhookDeliveries`: list and retrieve deliveries, list and retrieve their
  physical attempts, and retry a delivery
- `operations`: list, retrieve, list transitions, cancel, and wait for a
  terminal state
- `quickLinkSettings`: retrieve and update the saved QuickLink configuration

List methods return `CursorPage<T>`. Mutations return typed receipts with the
resource, operation, and idempotency identifiers supplied by the API. The
SDK-only `operations.wait()` helper polls `retrieve`; it does not create a
second remote operation or cancel the remote operation when local waiting is
aborted. A larger server `Retry-After` raises the next poll delay without
extending the caller's total wait deadline.

The organization view also exposes these management resources:

- `organizations`: retrieve the organization visible to the API key
- `apiKeys`: list key metadata and deactivate an organization API key
- `members`: list organization members
- `auditLogs`: list the organization audit trail with live action, resource,
  and limit filters
- `sessionBans`: list all or active session bans
- `securityIncidents`: list and acknowledge leaked-credential incidents
- `projectTokens`: list token metadata for an explicit project
- `billing`: retrieve balance and currency, inspect usage meters, list
  transactions and tier pricing, and update low-balance reminders
- `projects`: list, create, request production enrollment, approve, and cancel
- `sessions`: list, start, stop, or delete one session; stop or delete a bounded
  batch; set tier override; and create a testing session
- `campaigns`: list, create, retrieve, update, delete, lifecycle actions,
  analytics, events, and recipients
- `customers`: enable Customers for a project; create, list, retrieve, update,
  archive, and restore Customers; inspect Numbers and events; create, list,
  and revoke pairing links; and transfer Numbers between Customers
- `audiences`: list, create, retrieve, delete, and create an upload URL
- `optOuts`: list, create one, create a batch, and delete by phone number
- `media`: retrieve a URL, delete, and create an upload URL

Customer creation and pairing-link creation require caller-supplied
idempotency keys. The SDK returns the pairing URL only on the first successful
creation attempt. Customer list responses retain their cursor metadata under
`response.data.page`.

The pinned campaign, audience, opt-out, and media contracts expose their
operation payloads as open objects. These methods therefore use the exported
`PlatformPayload` type instead of claiming fields the contract does not define.

Platform template and Flow endpoints require a live dashboard bearer and reject
organization server keys. They are intentionally absent from `Client`;
browser template tooling must reach them through an application-owned server
adapter that authorizes the signed-in user.

## System and Bridge clients

`SystemClient` calls the credential-free status, version, readiness, and
liveness routes. It does not accept a credential:

```ts
import { SystemClient } from "@polymorfa/sdk";

const system = new SystemClient();
const [status, version, health, ping] = await Promise.all([
  system.status(),
  system.version(),
  system.health(),
  system.ping(),
]);
```

`BridgeClient` accepts only a project token and exposes one discovery method:

```ts
import { BridgeClient } from "@polymorfa/sdk";

const bridge = new BridgeClient({
  credential: {
    type: "projectToken",
    value: process.env.POLYMORFA_PROJECT_TOKEN!,
  },
});

const route = await bridge.routes.resolve();
console.log(route.data.wsUrl, route.data.expiresAt);
```

Route discovery returns the regional Bridge connection details. The client does
not open the WebSocket, manage reconnects, or participate in the CLI listener
protocol. A `pmfa_ls_` listener credential is rejected before transport.

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

const response = await client.projects.create(
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

Every client exposes `raw.request<T>()` for deliberate API escape hatches:

```ts
const response = await client.raw.request<{ data: unknown }>({
  method: "GET",
  path: "/v1/operations/operation_123",
  query: { projectId: "project_123" },
});
```

Organization raw paths remain relative API paths. Project raw paths are
relative to the bound project and receive the encoded
`/v1/projects/{projectId}` prefix automatically. Project raw requests reject
absolute URLs, traversal, explicit project prefixes, backslashes, and
`Authorization` overrides before transport. Raw requests retain typed errors,
metadata, cancellation, API versions, retry rules, and idempotency.

`raw.paginate()` accepts a page decoder and returns `CursorPage<T>`, which
supports `items`, `nextCursor`, `hasMore`, `nextPage()`, and async item
iteration. The current contract has few cursor endpoints; the primitive is
available for new endpoints without reimplementing transport behavior in the
CLI.

## Webhooks

Verify the exact raw request body before parsing:

```ts
import { isEvent, webhooks } from "@polymorfa/sdk";

const event = await webhooks.verify({
  body: rawBody,
  signature: signatureHeader,
  secret: webhookSecret,
});
if (isEvent(event, "message.received")) {
  console.log(event.payload);
}
```

Native deliveries use the hexadecimal `X-Webhook-Signature` value. The helper
also accepts the `sha256=<hex>` compatibility form. Verification uses
HMAC-SHA256 and constant-time comparison over the unmodified bytes. Recognized
events narrow to exported payload types, including messages, sessions, groups,
presence, contacts, chats, calls, labels, history sync, command results, and
business quick replies. Unknown event names and payloads are preserved for
forward compatibility.
`webhooks.verifySignature()` returns a boolean without parsing.
`webhooks.createFixture()` creates exact-byte local fixtures, and
`webhooks.verifyLocal()` verifies payloads re-signed by local CLI forwarding.
The older `constructWebhookEvent` and `verifyWebhookSignature` exports remain
available through the first stable major. A later major can remove them with a
migration release.

Messaging server credentials can manage webhook registrations through
`MessagingClient.webhooks`. The management `Client` owns the separate durable
organization and project event, webhook, delivery, attempt, and operation
resources described above. Dashboard and staff routes retain their separate
credential requirements.

The SDK has no listener, event stream, `AsyncIterable`, or forwarding API.
`polymorfa listen` connects to a separate CLI-only protocol; its `pmfa_ls_`
credential cannot be used by `Client`, `MessagingClient`, or their raw request
helpers.

## QuickLink settings

`client.quickLinkSettings.retrieve()` and `update()` map only the management
`GET /v1/quicklink` and `PUT /v1/quicklink` settings contract. The same methods
on `client.project(projectId)` use the immutable project ownership context.

The SDK does not expose hosted QuickLink creation, inspection, or cancellation
for `/api/quicklinks`. Those ephemeral flows belong to an application adapter
and the browser controller, not the management client.

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

### Calls

`createBrowserCalls` connects the shared `@polymorfa/calls` model to the
existing browser controller and WebRTC media. It places calls directly with a
short-lived client token, receives lifecycle events, and exposes the active
model as `controller.call`. Pass its controller to React or Web Components.

```ts
import { createBrowserCalls } from "@polymorfa/browser";

const calls = createBrowserCalls({ session: "support", getClientToken });
await calls.connect();
await calls.controller.place("+15550100");
// Release the widget and connections when leaving the application.
await calls.dispose();
```

The token needs `voip_place`, `voip_answer` and `voip_signal` actions. Requests
use its bound session. Connecting claims `browser` mode, which auto-answers
remotely; the widget's Answer action attaches local media and Reject hangs up.
Direct placement supports linked devices. Custom signaling backends and
application-fed lifecycle channels remain available.

Calls carry a `line`: `linkedDevice` (a paired WhatsApp device session, audio
and video) or `cloudApi` (the WhatsApp Business Calling API, audio only). Every
component gates on the snapshot's `capabilities`, never on the line name. The
controller also owns capture/playback device choice (`setPreferredDevices`,
`switchDevice`, `refreshDevices`) so a microphone or camera swap mid-call is a
track replacement, not a renegotiation. The shared call model supports
participant invitations. Browser WebRTC calls receive live participant joins,
state changes, and departures through the lifecycle stream.

`@polymorfa/react` ships the complete call UI: `CallSurface` (incoming card,
stage, control dock, and a pop-out window), plus `IncomingCallCard`,
`CallStage`, `CallControls`, and `DialPad` for composition. The design mirrors
the official WhatsApp desktop call windows in a monochrome Material-3 voice;
colors derive from the shared appearance variables.

## Next.js and dev mode

`@polymorfa/nextjs` builds Web `Request`/`Response` handlers, so it has no Next.js
runtime dependency. Applications provide their own authorization and minting
logic; webhook helpers read raw bytes once and delegate verification to
`webhooks.verify` from the server SDK.

Template routes use the same application-owned authorization boundary. Project
scope and Cloud API session selection are resolver callbacks that run only on
the server; browser-provided replacements are ignored.

`@polymorfa/devtools` provides an explicit development overlay for appearance,
RTL, motion, viewport and network testing plus redacted request diagnostics. It
only enables when trusted build and token environments match and are both
non-production. Query-string flags cannot enable it, and the `production`
subpath exports an inert mount function.

## Coverage status

`contracts/coverage.json` records every Messaging and Platform operation in its
pinned contracts. Covered mappings include methods in the server, browser, and
Calls packages. A mapping records an HTTP operation, not package publication or
live-call readiness. The durable management resources and QuickLink settings
map to typed `Client` resources; dashboard, staff, and CLI-listener routes keep
explicit credential-boundary exclusions.

`npm run check:coverage` requires every contract operation to have a ledger
row. It permits explicit missing and excluded entries; passing that check does
not establish API parity. Raw requests never count as typed coverage. See the
[contract notes](contracts/README.md) for source hashes and reconciliation
rules.

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
