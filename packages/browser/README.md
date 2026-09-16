# `@polymorfa/browser`

Framework-neutral browser transport and product controllers for Polymorfa.

This package accepts only short-lived `pmfa_ct_` client tokens obtained from an application callback. It never accepts or stores server API keys.

```ts
import {
  BrowserMessagingClient,
  createClientTokenProvider,
} from "@polymorfa/browser";

const messaging = new BrowserMessagingClient({
  session: "support",
  getClientToken: createClientTokenProvider(),
});

await messaging.messages.send({
  conversation: { phoneNumber: "+15551234567" },
  content: { text: "Hello" },
});
```

Requests expose status, request ID, response headers, and attempt count. Safe reads retry transient failures; mutations retry only when supplied an idempotency key. Caller cancellation and timeouts use distinct exported error types.

Product controllers use immutable snapshots and `subscribe()`/`getSnapshot()` so Web Components and framework bindings share the same behavior.

`BrowserMessagingClient` binds one session and exposes only the exact
client-token allowlist: message actions, presence reads/subscriptions, contact
reads, and permitted widget pairing actions. Session start and status require a server
Platform credential; use QuickLink for onboarding. The browser widget start/status
helpers are removed in this breaking contract revision. Conversation history,
template management and media upload remain application-owned server adapters.
`createBrowserCalls` supplies client-token call lifecycle and controls.

`createBrowserComposerActions` connects a `MessageComposerController` to the
message resource for text and reply sends. Supply an upload adapter and a
`createMessage` mapping for attachments; client tokens cannot call the media
routes directly.

## Calls

`createBrowserCalls` connects the shared Calls client to `CallsController` and
WebRTC. Your server mints a short-lived client token with
`POST /platform/client-tokens`, granting `voip_place`, `voip_answer`, and
`voip_signal` and the destination and concurrency rules you need. The browser
uses that token directly: as the bearer for REST calls and as the first frame
of the lifecycle socket (`/voip/ws`). The token never appears in a URL, and no
calling ticket or answer mode is involved.

```ts
import {
  createBrowserCalls,
  createClientTokenProvider,
} from "@polymorfa/browser";

const calls = createBrowserCalls({
  session: "support",
  getClientToken: createClientTokenProvider(),
  onError: (error) => {
    // "unauthorized": the platform stopped accepting the token (4401).
  },
});
await calls.connect();
await calls.controller.place("+15550100");
// When the application releases the widget:
await calls.dispose();
```

Pass `calls.controller` to React's `CallSurface` or the `pmfa-call` element.
`controller.call` exposes the shared `Call`, including its state, duration,
end reason, claim state and `addParticipant()` method. Direct placement
supports linked WhatsApp devices. Custom backends retain `cloudApi` line
support.

### Tokens

Return `{ value, audience: "browser", expiresAt }` from `getClientToken` so
the SDK can replace the token before it expires: it asks for a new token and
sends it on the open socket as another `auth` frame. When a token expires or
is revoked, the platform closes the socket with code 4401; `onError` receives
`code: "unauthorized"` and the next reconnect asks `getClientToken` for a new
token. REST requests refresh a cached token before it expires; a provider
that returns an expired token fails with `expired_client_token`.

### Answering, joining, and leaving

Incoming calls ring until a participant answers or declines them.
`snapshot.invitations` lists every ringing call; several can ring at once and
the controller never declines one for you. The first invitation is displayed;
`controller.select(callId)` shows another while no call is active, and
`controller.dismiss(callId?)` hides one locally without declining it.

- `controller.answer({ exclusive, video, callId })` accepts the call and
  attaches WebRTC. `exclusive` defaults to `false`, which leaves other
  participants ringing so they can join. `exclusive: true` claims the call.
- `controller.join({ video, callId })` joins a call another participant
  answered without a claim (`snapshot.canJoin`).
- `snapshot.claimedByOther` is `true` when another participant claimed the
  call. `answer()` and `join()` then reject with `CallClaimedError`, and
  `reject()` is refused: declining would end the claimer's call.
- `controller.reject()` declines a ringing call and ends it for everyone.
- `controller.leave()` closes this browser's connection; the call continues.
- `controller.end()` (and `hangup()`) ends the call for every participant.
- Disposing the controller leaves the call; it never ends it.

After a call ends, the next waiting invitation is displayed.

### Media

`WebRtcMediaFactory` offers, in order: one audio transceiver, a data channel
negotiated out of band (`pmfa.calls`, id 0), one sendrecv camera transceiver
(present on audio calls too, so the camera can start later), and
`videoSlots` receive-only video transceivers (default 3). Offers, re-offers,
ICE candidates, candidate polling and leave all carry the connection's
`connectionId`. `createBrowserCalls` uses the `Call`'s id.

The platform assigns remote video sources to transceivers and announces them
on the data channel. Each source becomes an entry in `controller.remoteVideos`
with its own `MediaStream`, a stable `key` (`participant:<id>` or
`connection:<id>`), and the owning `participant`, or `connectionId` plus its
`connectionParticipant` reference;
`snapshot.remoteVideos` carries the same entries without streams. When the
platform reports more sources than slots, the factory adds receive-only
transceivers and renegotiates, up to `maxVideoSlots` (default 32, camera
included). `controller.remoteStream` carries the merged call audio only.

The controller keeps device switching, mute, audio-to-video upgrade, and its
bounded ICE resumption window. `snapshot.participants` follows the call's
WhatsApp participants. Disposal releases tracks and closes the lifecycle
socket.

`createSignalingCallsBackend`, `CallsSocket` and `IncomingCallRelay` remain
available for applications that supply their own placement or event channel.
`CallsSocket` authenticates the same way; with a server key, pass `session`
and `participant`, which travel as query parameters. The signaling backend still requires
its `place` hook. Use `createBrowserCalls` for direct client-token placement.

If a reject or hangup request fails, the call stays active and its controls remain
available for retry. The UI shows a localized failure message and keeps existing
media connected until the call ends. `snapshot.error` clears when ending succeeds
or when an incoming call is successfully answered after a failed reject.

## Template builder

The builder uses the canonical `TemplateDefinition` contract: standard,
carousel, authentication, and limited-time-offer templates with structured
headers, buttons, variables, and previews. Saving and Meta submission are
separate controller actions.

```ts
import {
  TemplateBuilderController,
  createSameOriginTemplateBuilderTransport,
} from "@polymorfa/browser";

const templates = new TemplateBuilderController(
  createSameOriginTemplateBuilderTransport({
    path: "/api/polymorfa/templates",
  }),
);

templates.create({
  name: "order_ready",
  definition: {
    version: 1,
    kind: "standard",
    category: "UTILITY",
    language: "en_US",
    body: "Hello {{name}}",
    variables: [{ name: "name", type: "text", example: "Ada" }],
  },
});

await templates.save();
await templates.refreshPreview();
```

The same-origin transport sends application actions with browser cookies. It
does not accept a server credential, project slug, or Cloud API session. The
application route resolves those values after authorizing the request.
