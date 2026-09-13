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
  chatId: "15551234567@s.whatsapp.net",
  type: "text",
  text: "Hello",
});
```

Requests expose status, request ID, response headers, and attempt count. Safe reads retry transient failures; mutations retry only when supplied an idempotency key. Caller cancellation and timeouts use distinct exported error types.

Product controllers use immutable snapshots and `subscribe()`/`getSnapshot()` so Web Components and framework bindings share the same behavior.

`BrowserMessagingClient` binds one session and exposes only the exact
client-token allowlist: message actions, presence reads/subscriptions, contact
reads, and widget start/status/pairing actions. Conversation history,
template management and media upload remain application-owned server adapters.
`createBrowserCalls` supplies client-token call lifecycle and controls.

`createBrowserComposerActions` connects a `MessageComposerController` to the
message resource for text and reply sends. Supply an upload adapter and a
`createMessage` mapping for attachments; client tokens cannot call the media
routes directly.

## Calls

`createBrowserCalls` connects the shared Calls client to `CallsController` and
WebRTC. Supply a short-lived client token with `voip_place`, `voip_answer`, and
`voip_signal` actions and the permitted destination/concurrency rules.

```ts
import {
  createBrowserCalls,
  createClientTokenProvider,
} from "@polymorfa/browser";

const calls = createBrowserCalls({
  session: "support",
  getClientToken: createClientTokenProvider(),
});
await calls.connect();
await calls.controller.place("+15550100");
// On application teardown:
await calls.dispose();
```

Pass `calls.controller` to React's `CallSurface` or the `pmfa-call` element.
`controller.call` exposes the shared `Call`, including its state, duration,
end reason and `addParticipant()` method. Direct placement supports linked
WhatsApp devices. Existing custom backends retain their `cloudApi` line support.

Connecting claims `browser` answer mode for the token's bound session. That
mode auto-answers the remote caller; the widget's Answer action attaches local
WebRTC media, and Reject ends the call. It does not send `/accept` or `/reject`,
which apply to calls parked in `sdk` mode. The mode claim persists after disposal.
A connected call requires both remote acceptance and a connected media path.

The lifecycle socket reconnects with backoff. ICE candidates use REST signaling
and polling. The controller retains device switching, mute, audio-to-video
upgrade, and its bounded ICE resumption window. Disposal releases tracks and
closes the lifecycle socket. A second call cannot replace an active call in
one widget; additional inbound calls are declined.

The shared call's PCM/video-frame streams belong to programmatic socket media.
Use `controller.localStream` and `controller.remoteStream` for browser media.
Participant invitations return the invited participant. The lifecycle stream
keeps `call.participants` and participant `state` in sync for browser WebRTC
calls. `audioMuted` and `video` remain reserved as `false`.

`createSignalingCallsBackend`, `CallsSocket` and `IncomingCallRelay` remain
available for applications that supply their own placement or event channel.
The signaling backend still requires its `place` hook. Use `createBrowserCalls`
for direct client-token placement through `POST /api/voip/calls`.

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

If a reject or hangup request fails, the call stays active and its controls remain
available for retry. The UI shows a localized failure message and keeps existing
media connected until the call ends. `snapshot.error` clears when ending succeeds
or when an incoming call is successfully answered after a failed reject.
