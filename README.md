# Polymorfa SDKs

Handwritten API clients, UI packages, and developer tooling for Polymorfa.

The development branch contains the TypeScript server SDK, a framework-neutral
browser runtime, shared UI contracts, Web Components, React bindings, thin
Next.js server helpers, and a production-gated developer assistant. It follows
the Messaging and Platform contracts recorded at source revision
`cdc7ec09a32309ee8233d9f8a3007eea18203c6e` on monorepo `dev`. Graph-compatible APIs are outside
this SDK's initial scope.

## Package architecture

| Package                | Runtime              | Responsibility                                                                    |
| ---------------------- | -------------------- | --------------------------------------------------------------------------------- |
| `@polymorfa/sdk`       | Node.js 20+          | Messaging, management, system, and Bridge server clients                          |
| `@polymorfa/sdk/calls` | Node.js 22+, Browser | Calls lifecycle, answer/join/leave, and programmatic media sockets                |
| `@polymorfa/browser`   | Browser              | Client-token transport and framework-neutral product controllers                  |
| `@polymorfa/ui`        | Isomorphic           | Appearance, locale, direction, motion, and diagnostic contracts                   |
| `@polymorfa/elements`  | Browser              | Portable custom elements for React-free, Vue, Svelte, and plain HTML applications |
| `@polymorfa/react`     | Browser              | React bindings over the same controllers                                          |
| `@polymorfa/store`     | Browser              | Opt-in IndexedDB store for webhook-shaped events, with live sources and chat data |
| `@polymorfa/nextjs`    | Server               | App Router-compatible client-token and webhook helpers                            |
| `@polymorfa/devtools`  | Development browser  | Configuration, theme, viewport, network, and redacted diagnostic assistant        |

The eight public packages are available on npm under the `dev` tag as development
prereleases. `@polymorfa/sdk/calls` is a subpath of `@polymorfa/sdk`.
No mobile-native binding is part of this milestone.

## TypeScript development install

Each push to `dev` publishes the public packages to npm under the `dev`
dist-tag, with versions such as `0.1.0-dev.20260919094454`:

```bash
npm install @polymorfa/sdk@dev
npm install @polymorfa/browser@dev   # browser apps
```

Pin an exact `0.1.0-dev.<timestamp>` version for reproducible installs. These
are development prereleases; use `@dev` or an exact version when installing.
To build from source, install a packed tarball:

```bash
git clone --branch dev https://github.com/polymorfa/sdks.git
cd sdks
npm ci
npm run build:workspaces
npm pack -w @polymorfa/sdk           # add -w @polymorfa/browser for browser apps
npm install /path/to/sdks/polymorfa-sdk-0.1.0-dev.0.tgz   # from your application
```

See [docs/releasing.md](docs/releasing.md) for the version scheme and the
publishing workflow.

`npm install github:polymorfa/sdks#dev` no longer installs the SDK: the
repository root is a private workspace, and `@polymorfa/sdk` lives in
`packages/typescript`.

The published package name and root import are already stable:

```ts
import {
  BridgeClient,
  Client,
  MessagingClient,
  SystemClient,
} from "@polymorfa/sdk";
```

Node.js 20 or newer is required. The package has no runtime dependencies.

The programmatic Calls client ships inside the same package as the
`@polymorfa/sdk/calls` subpath; there is no separate Calls package to install.
`@polymorfa/browser` depends on `@polymorfa/sdk` and uses this same Calls
client, so errors raised by browser calls are the classes exported from
`@polymorfa/sdk/calls`:

```ts
import { CallsClient } from "@polymorfa/sdk/calls";
```

`@polymorfa/sdk/calls` needs Node.js 22 or newer for its built-in `WebSocket`.
On older runtimes, pass a `WebSocket` implementation to `CallsClient`.

## Messaging client

```ts
import { MessagingClient } from "@polymorfa/sdk";

const messaging = new MessagingClient({
  credential: {
    type: "apiKey",
    value: process.env.POLYMORFA_MESSAGING_API_KEY!,
  },
  apiVersion: "2026-03-20",
});

const sessions = await messaging.sessions.list();
console.log(sessions.data.data, sessions.metadata.requestId);

const sent = await messaging.messages.send(
  "support",
  {
    conversation: { phoneNumber: "+15551234567" },
    content: { text: "Hello" },
  },
  { idempotencyKey: crypto.randomUUID() },
);
console.log(sent.data.data.id, sent.metadata.attempts);
```

Messaging credentials use an explicit discriminator. Organization server keys
use `{ type: "apiKey", value }`, project tokens use
`{ type: "projectToken", value }`, and short-lived client tokens use
`{ type: "clientToken", value }`. A discriminator/prefix mismatch fails before
any network request. Server credentials are rejected in browser runtimes.

The handwritten Messaging resources in this milestone are:

- `banSafe`: retrieve and update project Safe Mode, warm-up, Ban Insurance
  evidence, and Health policy settings, and one number's Safe Mode override,
  with an organization API key or project token
- `sessions`: list, retrieve, update, delete, start, stop, restart,
  logout, account, and entitlement-gated direct JSON QR or phone pairing
- `quickLinks`: create, retrieve, and cancel hosted QuickLink pairing sessions
- `cloudOnboarding`: continue an issued Meta Cloud API QuickLink from a trusted
  server
- `business`: manage the connected Business App profile, commerce catalog,
  products, collections, orders, compliance, linked accounts, and eligibility
- `calls`: reject an identified incoming Linked Device call
- `voip`: place, accept, reject, leave, and end Polymorfa Calls, add
  participants, and read or update a session's call settings
- `campaigns`: list, create (with inline recipients), retrieve, inspect
  analytics, launch, pause, resume, stop, requeue, and page or append campaign
  recipients through the Messaging control plane
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
- `identities`: resolve one phone number, public user ID, BSUID, or username to known
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
the CLI-only `pmfa_ls_` listener credential before transport. Organization
keys must use the single v1 form `pmfa_` plus 72 unpadded base64url characters;
project tokens must use `pmfa_pt_` plus 94. The SDK validates that grammar
without decoding the credential. Retired call-agent and socket tickets and
simulated-device capabilities are also rejected before transport.

Both organization and project views expose owner-bound resources:

- `events`: list, retrieve, and replay durable events; stream one project's
  events when the required scope and beta access are available
- `webhooks`: list, create, retrieve, update, delete, test, and rotate secrets
- `webhookDeliveries`: list and retrieve deliveries, list and retrieve their
  physical attempts, and retry a delivery
- `quickLinkSettings`: retrieve and update the saved QuickLink configuration
- `operations`: list, get, wait for, list transitions of, and cancel
  asynchronous operations

List methods return `CursorPage<T>`. Mutations return typed receipts with the
resource, operation, and idempotency identifiers supplied by the API.

```ts
const enrollment = await client.projects.requestProductionEnrollment(
  "project_123",
  { business },
);
const done = await client.operations.wait(enrollment.data.data.operationId, {
  maxWaitMs: 10 * 60_000,
});
if (done.data.status !== "succeeded") {
  console.error(done.data.status, done.data.error?.code);
}
```

`operations.wait` chains server long-polls (up to 30 seconds each) until the
operation succeeds, fails, or is cancelled, its `sequence` passes
`afterSequence`, or `maxWaitMs` (default 5 minutes) ends. It returns the latest
state, so check `status`. `operations.get(id, { wait })` makes one long-poll
read. `operations.cancel(id)` works only while `capabilities.cancellable` is
true and sends a generated `Idempotency-Key` unless you pass one. Reads need
`operations:read`; cancellation needs `operations:cancel`. Organization
clients see team and project operations and accept a `projectId` filter;
project clients see only their project.

The organization view also exposes these management resources:

- `organizations`: retrieve the organization visible to the API key
- `apiKeys`: list key metadata and deactivate an organization API key
- `members`: list organization members
- `auditLogs`: list the organization audit trail with live action, resource,
  and limit filters
- `sessionBans`: list all or active session bans
- `securityIncidents`: list and acknowledge leaked-credential incidents
- `projectTokens`: list token metadata for an explicit project
- `sipTrunks`: list, create, retrieve, update, delete, and rotate the
  credentials of a project's SIP trunks, and read the SIP address your PBX
  points at with `endpoint()` (also on project clients)
- `billing`: retrieve balance and currency, inspect usage meters, list
  transactions and tier pricing
- `banSafe`: inspect Health, telemetry collection, signal definitions, findings,
  restrictions, incidents, claims, and Health action history; report and retract
  customer incidents
- `projects`: list, create, request production enrollment, approve, and cancel;
  retrieve and update Safe Mode, warm-up, Ban Insurance evidence, and Health
  policy settings
- `sessions`: list, start, stop, or delete one session; stop or delete a bounded
  batch; review and confirm a tier change; create a testing session; and
  retrieve or update the session Safe Mode override
- `campaigns`: list, create, retrieve, update, delete, lifecycle actions,
  analytics, events, and paged or appended recipients. The single-campaign
  operations require the owning `projectId`. This resource is available only
  on organization clients. `create` requires `CreatePlatformCampaignRequest`
  with `name` and `projectId`; its named JSON fields pass through unchanged.
  `update` accepts `recipientListId` to point an unlaunched draft at another
  audience, or null to detach it
- `customers`: enable Customers for a project; create, list, retrieve, update,
  archive, and restore Customers; inspect Numbers and events; create, list,
  and revoke pairing links; and transfer Numbers between Customers
- `audiences`: list, create from inline members or a spreadsheet import,
  retrieve, delete, create an upload URL, and add, page, or remove members
- `optOuts`: list, create one, create a batch, delete by phone number, and read
  or replace the organization's STOP/START keyword settings
- `media`: retrieve a URL, delete, and create an upload URL

Customer creation and pairing-link creation require caller-supplied
idempotency keys. The SDK returns the pairing URL only on the first successful
creation attempt. Customer list responses retain their cursor metadata under
`response.data.page`.

Audience creation and membership, campaign creation and recipients, and opt-out
settings are fully typed. The remaining campaign, audience, opt-out, and media operations
expose their payloads as open objects in the pinned contract, so those methods
use the exported `PlatformPayload` type instead of claiming fields the contract
does not define.

`Client.campaigns.recipients` returns a cursor page. `status` finds, for
example, the recipients a campaign skipped because they opted out:

```ts
let cursor: string | undefined;
do {
  const page = await client.campaigns.recipients(campaignId, {
    projectId,
    status: "skipped",
    ...(cursor === undefined ? {} : { cursor }),
  });
  for (const recipient of page.data.data) {
    console.log(recipient.phone, recipient.lastError);
  }
  cursor = page.data.page.nextCursor ?? undefined;
} while (cursor !== undefined);
```

Appending recipients or audience members accepts partial success: the result
reports `added`, `duplicateCount`, `invalidCount` and up to 20 `invalidRows`.

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

Every API error also exposes the fields from its error body:

```ts
import { PolymorfaError, PolymorfaRateLimitError } from "@polymorfa/sdk";

try {
  await messaging.messages.send("sales", message);
} catch (error) {
  if (error instanceof PolymorfaError) {
    error.code; // "conversation_window_closed", typed as PolymorfaErrorCode
    error.requestId; // body `request_id`, else the X-Request-Id header
    error.requestLogUrl; // Console request log, for team keys and project tokens
    error.docUrl; // https://docs.polymorfa.com/api/errors#conversation-window-closed
  }
  if (error instanceof PolymorfaRateLimitError) {
    error.rateLimitReason; // "whatsapp", "request_rate", ...
  }
}
```

`PolymorfaErrorCode` lists the documented codes, including
`recipient_not_on_whatsapp`, `conversation_window_closed`,
`template_not_approved`, `media_too_large`, `whatsapp_rate_limited`,
`new_chat_limit_reached`, `whatsapp_account_restricted`, the BanSafe codes, and the Calls and SIP trunk codes,
and still accepts codes a newer API adds. `POLYMORFA_ERROR_CODES` and
`isKnownPolymorfaErrorCode()` are exported. `requestLogUrl` is absent for
client tokens and for requests the API did not log. `BrowserError` exposes
`code`, `requestId`, and `docUrl` from the same body, so browser callers get the
request ID even when the `X-Request-Id` header is not readable.

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

Campaign recipient and audience member appends (`campaigns.addRecipients` on
both clients and `audiences.addMembers`) are sent once. The API does not replay
them, so a retry after a lost response would count the first attempt's rows as
duplicates. They retry only when that request sets both `maxNetworkRetries`
and `idempotencyKey`; the key does not make the API replay the append.

## API versions and raw requests

Set `apiVersion` on a client or a single request to a supported contract date,
such as `2026-03-20`. The SDK sends it as the `Polymorfa-Version` header. This
value uses `YYYY-MM-DD`, not the SDK package version. Omitting it lets the API
select its configured current version.

Every client exposes `raw.request<T>()` for deliberate API escape hatches:

```ts
const response = await client.raw.request<{ data: unknown }>({
  method: "GET",
  path: "/platform/events/event_123",
});
```

Organization raw paths remain relative API paths. Project raw paths are
relative to the bound project and receive the encoded
`/platform/projects/{projectId}` prefix automatically. Project raw requests reject
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
presence, contacts, chats, calls, labels, history sync, Meta Cloud API contact
sync and Business app echoes, command results, and business quick replies. Unknown event names and payloads are preserved for
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

`Client.events.stream()` returns an `AsyncIterable` of project events with
automatic reconnect and cursor resume. It requires an organization API key or
project token with `events:listen`, and Event streams beta access enabled for
the enrolled team. Organization clients pass `projectId`; project views use
their bound project. See the [streaming guide](packages/typescript/README.md#stream-events-in-real-time)
for iteration, cancellation, and manual acknowledgement.

`polymorfa listen` owns local forwarding and connects to a separate CLI-only
protocol. Its `pmfa_ls_` credential cannot be used by `Client`,
`MessagingClient`, or their raw request helpers. Browser client tokens cannot
use the server event stream.

## QuickLink lifecycle and settings

`MessagingClient.quickLinks.create()`, `retrieve()`, and `cancel()` map the
authenticated hosted lifecycle at `/messaging/quicklinks`. They accept organization
API keys or project tokens with `quicklink:manage`; browser client tokens fail
before transport. Organization keys can set `projectId` on creation, while a
project token remains bound by the server.

These methods expose the short-lived connection URL and status record. They do
not add list, recovery, or history operations that the API does not provide.

`client.quickLinkSettings.retrieve()` and `update()` map only the management
`GET /platform/quicklink` and `PUT /platform/quicklink` settings contract. The same methods
on `client.project(projectId)` use the immutable project ownership context.

Saved settings hold the project's `successCallbackUrl` and `failureCallbackUrl`
HTTPS destinations and `allowPhoneChange`, which controls whether recipients can
replace a prefilled number (default `false`). The API copies callback
destinations into each link when it is issued. Settings have no redirect-URI
allowlist. `hideWatermark: true` requires an active Branded QuickLink add-on.

## Browser controllers and UI

Browser code accepts only short-lived `pmfa_ct_` tokens returned by an
application callback. It rejects server credentials and absolute request URLs.
The framework-neutral controllers cover conversations, composing,
template building, and one-to-one and group calls. They expose immutable snapshots through
`getSnapshot()` and `subscribe()`; React and Web Components render those same
objects rather than reimplementing product state.

QuickLink is a hosted Polymorfa page, not a browser SDK surface. Create the link
on your server with `MessagingClient.quickLinks.create()` and send the person
to the returned `data.url`.

```ts
import {
  BrowserMessagingClient,
  createClientTokenProvider,
} from "@polymorfa/browser";

const getClientToken = createClientTokenProvider();
const messaging = new BrowserMessagingClient({
  session: "support",
  getClientToken,
});

await messaging.messages.setTyping({
  conversation: { id: "739182640518203" },
  state: "typing",
});
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

`createBrowserCalls` connects the shared `@polymorfa/sdk/calls` model to the
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

The token needs `voip_place`, `voip_answer` and `voip_signal` actions. Your
server mints it with `POST /platform/client-tokens`; the browser uses it
directly for REST calls and for the first frame of each call socket. No
calling ticket is involved. Requests use the token's bound session.

Incoming calls ring until a participant answers or declines them. Several
calls can ring at once, and the widget never declines one for you. Answer
takes an `exclusive` choice: `false` (the default) leaves other participants
ringing so they can join, and `true` claims the call. A call another
participant answered without a claim offers Join; a claimed call shows as
answered elsewhere. Leave closes only this browser's connection; hang-up ends
the call for everyone. A call you placed offers only hang-up until it
connects, and a microphone failure while it rings ends it. Each remote participant's video arrives as its own
stream in `controller.remoteVideos`; call audio is merged. Signaling, media
negotiation and socket transports are internal to the SDK; the packages export
only these calling operations.

Each call reports its `capabilities` (`video`, `invite`, `mute`), and every
component gates its controls on them. A placed call starts with video and
invitations allowed and takes the platform's report when the callee answers.
The
controller also owns capture/playback device choice (`setPreferredDevices`,
`switchDevice`, `refreshDevices`) so a microphone or camera swap mid-call is a
track replacement, not a renegotiation. The shared call model supports
participant invitations. Browser WebRTC calls receive live participant joins,
state changes, and departures through the lifecycle stream.

The browser and Calls clients send call diagnostics for their own media
connections (quality figures and error codes, no personal data) so the Console
can show why a call sounded bad or failed. Pass `diagnostics: false` to turn
this off; `MessagingClient.voip.report()` sends your own.

`@polymorfa/react` ships the complete call UI: `CallSurface` (incoming card,
stage, control dock, and a pop-out window), plus `IncomingCallCard`,
`CallStage`, `CallControls`, `ParticipantVideoGrid`, `ParticipantList`, and
`DialPad` for composition. The design mirrors
the official WhatsApp desktop call windows in a monochrome Material-3 voice;
colors derive from the shared appearance variables.

### Local event store

`@polymorfa/store` keeps an opt-in IndexedDB copy of webhook-shaped events for
applications that store messages themselves. Your backend receives webhooks
and streams them to the browser; the store files messages, conversations,
contacts, presence, calls, labels, sessions, templates, and other events into
separate stores and feeds `ConversationController` through
`createStoreConversationSource()`. Message content is written to the device;
see the [store guide](packages/store/README.md#privacy) for encryption,
redaction, and retention.

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

The repository is an npm workspace: `packages/typescript` is `@polymorfa/sdk`,
and `packages/calls` is a private workspace compiled into
`@polymorfa/sdk/calls`.

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

## Contract update notes

The typed webhook catalog includes `session.restriction_updated` with
`type`, `active`, `enforcementType`, `expiresAt`, and `observedAt`.
`session.logged_out` requires a numeric `code` and a `reason` of `banned`,
`device_removed`, or `unknown`. Test event requests support the restriction
fixture with `restrictionActive` and the call-end reason `call_restricted`.

Typed call analytics and call retention settings methods are not implemented.
These five public operations remain recorded as
missing in the contract ledger. The contract snapshot is provisional; the
final merged API revision must be pinned before this SDK update is merged or
published. See the repository contract notes for the exact source revision.
