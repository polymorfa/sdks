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

`createBrowserCalls` is the browser calling component: incoming calls,
placement, answer, join, leave and end, microphone, camera and device
control, and per-participant video. Your server mints a short-lived client
token with `POST /platform/client-tokens`, granting `voip_place`,
`voip_answer`, and `voip_signal` and the destination and concurrency rules you
need. That token is the only credential the component uses; it never appears
in a URL.

```ts
import {
  createBrowserCalls,
  createClientTokenProvider,
} from "@polymorfa/browser";

const calls = createBrowserCalls({
  session: "support",
  getClientToken: createClientTokenProvider(),
  onError: (error) => {
    // "unauthorized": the platform stopped accepting the token.
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
supports linked WhatsApp devices.

### Tokens

Return `{ value, audience: "browser", expiresAt }` from `getClientToken` so
the SDK can replace the token before it expires without interrupting calls.
When a token expires or is revoked, `onError` receives
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
  connects microphone, camera and speaker. `exclusive` defaults to `false`, which leaves other
  participants ringing so they can join. `exclusive: true` claims the call.
- `controller.join({ video, callId })` joins a call another participant
  answered without a claim (`snapshot.canJoin`).
- `snapshot.claimedByOther` is `true` when another participant claimed the
  call. `answer()` and `join()` then reject with `CallClaimedError`, and
  `reject()` is refused: declining would end the claimer's call.
- While calling is turned off for the number, `place()`, `answer()` and
  `join()` reject with `CallsDisabledError` from `@polymorfa/calls`.
- `controller.reject()` declines a ringing call and ends it for everyone.
- `controller.leave()` closes this browser's connection; the call continues.
  On a call this browser placed that has not connected, it ends the call
  instead, so the callee stops ringing.
- `controller.end()` (and `hangup()`) ends the call for every participant.
- Disposing the controller leaves a joined call. It ends only a call this
  browser placed that is still ringing.

After a call ends, the next waiting invitation is displayed.

### Media

- `controller.localStream` is your microphone and camera.
- `controller.remoteStream` is the merged call audio; play it through one
  element.
- `controller.remoteVideos` holds one entry per remote participant who sends
  video: a `MediaStream`, a stable `key`, a display `label`, and the
  `participant` or the other connection's `connectionId` and
  `connectionParticipant`. `snapshot.remoteVideos` carries the same entries
  without streams, so a render can react to changes. Videos are separate
  streams; nothing is composed.
- `controller.setMuted()`, `enableVideo()`, `switchDevice()`,
  `setPreferredDevices()` and `refreshDevices()` control capture and playback.
- `snapshot.participants` lists the call's WhatsApp participants.
- A dropped connection shows `reconnecting` and recovers or ends as
  `connection_failed` after a bounded window.

Disposal releases tracks and connections.

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
