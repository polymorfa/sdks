# `@polymorfa/browser`

Framework-neutral browser transport and product controllers for Polymorfa.

## Drop-in client

`PolymorfaClient` (`createPolymorfaClient({ tokenEndpoint })`) fetches client
tokens from your `createPolymorfaHandler` route, refreshes them before expiry
with backoff, and reports the grant through `can(permission)`. It never sends
or chooses permissions. `InboxController` with `createHandlerInboxSource()`
drives an inbox from the handler's `history` and `events` routes, and
`connectWhatsApp(client)` asks the handler for a QuickLink and opens the
hosted URL. The React and Web Component drop-ins are built on these.

`@polymorfa/browser` depends on `@polymorfa/sdk` for the Calls client
(`@polymorfa/sdk/calls`). It imports nothing else from that package, so no
server code reaches the browser, and call errors such as `CallsDisabledError`
are the classes exported from `@polymorfa/sdk/calls`.

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

Native Messaging requests default to `Polymorfa-Version: 2026-09-22`, matching
the `whatsapp_ids` message-reference object. An explicit version header in request
options is preserved; retired versions return the API error without an automatic
upgrade or resend. Raw Graph-compatible paths and same-origin application
handlers receive no default native version header. Client-token permissions and
Hybrid preview restrictions still apply.

Requests expose status, request ID, response headers, and attempt count. Safe reads retry transient failures; mutations retry only when supplied an idempotency key. A response carrying `X-Polymorfa-Operation-Id` is never retried. If its body cannot be read, the error retains the receipt in `error.metadata.operationId` so an authorized server client can check the operation before another send. Caller cancellation and timeouts use distinct exported error types.

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

## Voice notes

`VoiceNoteRecorder` records from the microphone with `getUserMedia` and
`MediaRecorder`. Its snapshot has `status` (`idle`, `requesting`,
`recording`, `stopping`, or `error`), `elapsed` milliseconds, an input
`level` from 0 to 1, the container `mimeType`, and an `error` of
`permission-denied`, `unavailable`, or `failed`.

```ts
import { VoiceNoteRecorder, localAttachmentFromFile } from "@polymorfa/browser";

if (VoiceNoteRecorder.isSupported()) {
  const recorder = new VoiceNoteRecorder();
  await recorder.start();
  // later
  const file = await recorder.stop(); // File or undefined
  if (file) await composer.addAttachment(localAttachmentFromFile(file));
}
```

`stop()` resolves with an `audio/webm`, `audio/ogg`, or `audio/mp4` file named
`voice-note-<time>.webm` (`.ogg` or `.m4a`); the time is ISO 8601 with `:` and `.`
replaced by `-`. `cancel()` discards the recording. The microphone tracks
stop when recording ends, when a pending permission request is cancelled,
and on `dispose()`.

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
  `join()` reject with `CallsDisabledError` from `@polymorfa/sdk/calls`.
- While an answer or join is in flight, `snapshot.answering` is `true` and
  `answer()`, `join()`, `reject()` and `place()` are refused. `select()` and
  `dismiss()` still work: the answered call is displayed once it is accepted,
  even if you selected another invitation. If you dismissed it, the controller
  leaves it (or ends it when the answer claimed it) instead of showing it.
  Only that call ending cancels the answer; `end()` for another displayed
  call is refused meanwhile.
- If the platform refuses an answer, the call stays displayed as `incoming`
  with `snapshot.error` (`answer_failed` or `join_failed`), so it can be
  retried or declined. If media fails after the call was answered, the
  failed call is published as `error` (or `ended` for a terminal offer)
  and the next waiting invitation is displayed. The failure stays in
  `snapshot.error`; `error.callId` names the call it belongs to.
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

### Diagnostics

While a call's media is open, the controller sends call diagnostics for this
browser's connection to `POST /messaging/voip/calls/{id}/reports`, where
they appear with the call in the Console:

- Every 15 seconds, and once when the connection closes: round-trip time,
  audio jitter, packets lost and received, the audio and video codecs, the
  ICE candidate type (`relay` means a TURN relay), and how many times the
  connection reconnected. Figures come from `RTCPeerConnection.getStats()`.
- When something fails: an error code (`media_permission_denied`,
  `device_not_found`, `device_in_use`, `ice_failed`, `negotiation_failed`,
  `media_timeout`, `reconnect_exhausted` or `unsupported_browser`).

Each report names the connection and `@polymorfa/browser` with its version.
Reports contain no phone numbers, names, device labels, IP addresses, audio or
video. They are best-effort: a failed report is not retried, a refused one
(other than rate limiting) stops reporting for the connection, and nothing
about reporting affects the call. The client token needs the `voip_signal`
action. Turn reporting off with `createBrowserCalls({ diagnostics: false })`.

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
