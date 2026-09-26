# `@polymorfa/sdk/calls`

This directory is the source of the `@polymorfa/sdk/calls` subpath. It is built
into the `@polymorfa/sdk` package and is not published on its own.

Programmatic Polymorfa Calls: a client you run from code that follows a session,
rings on inbound WhatsApp calls, places outbound ones, and hands you each call's
audio and video to read and write. The browser call UI in `@polymorfa/react` and
`@polymorfa/elements` uses the same call model with WebRTC as its media path.

```ts
import { CallsClient } from "@polymorfa/sdk/calls";

const client = new CallsClient({
  token: process.env.POLYMORFA_API_KEY!, // or a client-token provider
  session: "support",
  participant: "voice-agent", // server credentials only
});

client.on("incoming", async (call) => {
  // `exclusive: true` claims the call: other participants stop ringing.
  await call.answer({ exclusive: true });
  call.audio.on("data", (pcm) => recognizer.push(pcm)); // call → you
  call.audio.write(synth.speak("Hello, how can I help?")); // you → call
  call.on("ended", (reason) => console.log("ended:", reason));
});

await client.connect();

const call = await client.place("+15550100", { video: false });
```

## Credentials

`token` is either a string or a provider function. A provider receives
`{ refresh }` and returns a string or `{ value, expiresAt }`:

- Browser and other untrusted clients use a client token. Your server mints it
  with `POST /platform/client-tokens` and grants `voip_place`, `voip_answer`,
  and `voip_signal`. The token decides the session and the participant.
- Server applications use an organization API key or project token. They may
  set `participant` (`[A-Za-z0-9._:@-]{1,128}`, default `default`); the
  platform refers to them as `server:<participant>`.

Never put a server credential in a browser. There is no calling ticket, token
exchange, or session answer mode.

## Answering, joining, and claims

Every incoming call rings until a participant answers or declines it. The
client never declines a call on its own.

| Call                                | Effect                                                                                                                                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `call.answer({ exclusive, video })` | Accepts the call and attaches media. `exclusive` defaults to `false`: other participants keep ringing and can join. `exclusive: true` claims it; others get `call_claimed`.                         |
| `call.join({ video })`              | Accepts a call another participant answered without a claim. Never claims.                                                                                                                          |
| `call.reject()`                     | Declines a ringing call. This ends the call for everyone.                                                                                                                                           |
| `call.leave()`                      | Closes this client's media connection. The call continues for others. A placed call that is still ringing is ended instead. If the request fails, the call stays live and `leave()` can be retried. |
| `call.end()`                        | Ends the call for every participant.                                                                                                                                                                |
| `call.addParticipant(to)`           | Invites another WhatsApp party.                                                                                                                                                                     |

`call.claim` reports `answered`, `answeredBy`, `exclusive`, `claimedByOther`,
and `canJoin`, and the `claim` event fires when they change. When another
participant claims the call, `claimedByOther` is `true`: stop ringing and do
not call `reject()`, which would end the call for the participant who
answered. `answer()` and `join()` reject with `CallClaimedError` in that case.
A second `answer()` or `join()` while one is in progress returns the same
promise: it resolves once media connects and rejects if media fails.

## Model

- **`CallsClient`** — one per session. `connect()` starts receiving the
  session's calls and resolves once the first attempt settles.
  `participantReference` names this client once known. A replacement token
  must belong to the same organization, project, session and participant.
  The client replaces the token before it expires, reconnects with backoff, and detects dead connections. When the token stops
  working it emits a `CallsAuthError` (`code: "unauthorized"`) and asks the
  provider for a fresh token. An invalid session or participant stops
  reconnection with `invalid_request`; `rate_limited` keeps retrying with
  backoff. Events: `incoming`, `call`, `ended`, `ready`,
  `disconnected`, `error`. `disconnect()` leaves joined calls and ends
  outbound calls that are still ringing; it never declines a ringing call.
- **`Call`** — states `incoming`, `ringing`, `connecting`, `connected`,
  `reconnecting`, and `ended`, with the methods above, `participants`,
  `connectionId`, and `startedAt` / `connectedAt` / `duration`.
- **`call.audio`** — merged call audio as signed 16-bit mono PCM at `sampleRate`
  (16 kHz unless the platform names another rate), both directions. It never
  contains your own audio. With the session's `conferenceMode` call setting
  on (the default) it also carries the session's other participants; with it
  off, only the WhatsApp party.
- **`call.video`** — one outgoing H.264 stream and one received stream per
  remote participant. `sources` maps each `CallVideoSource.id` to its `label`
  and owner: `participant` for a WhatsApp participant, or `connectionId` and
  `connectionParticipant` for another application connection.

When WhatsApp ends a call because of a calling restriction, `call.endReason`
and the call's and client's `ended` events report `call_restricted`. An
unrecognized reason from a newer server is reported as `unknown`.

## Media

`call.audio` and `call.video` carry the call's media once it is connected:

```ts
call.audio.on("data", (pcm) => {
  // Int16Array of mono samples at call.audio.sampleRate
});
call.audio.write(samples);

call.video.on("source", (source) => console.log(source.id, source.label));
call.video.on("frame", (frame) => decoder.decode(frame.source, frame.data));
call.video.on("keyframeRequest", () => encoder.forceKeyframe());
call.video.write({ keyframe, timestampUs, data }); // H.264 Annex-B
```

Each call has a `connectionId`. When the media connection drops, the client
reconnects it automatically (up to `reconnectAttempts`, default 3; state
`reconnecting`) and asks the token provider for a new token when the old one
stopped working. It does not reconnect after it leaves, after the call ends,
when another participant claimed the call (`CallClaimedError`), or when the
platform refuses the connection; the call then ends with a reason.

When media cannot be set up after an answer, join or remote pickup, or it is
lost for good (reconnection exhausted or refused), the client first releases
the call on the platform: it ends a call this client claimed (an exclusive
answer or an exclusive placement) and otherwise leaves with its
`connectionId`. The release waits at most 5 seconds and its failure is not
reported; the call then ends with `connection_failed` and the media error.
A call another participant claimed is not released.

While calling is turned off for the session in its call settings, placing,
answering, joining, inviting and connecting media reject with
`CallsDisabledError` (`code: "calls_disabled"`). Calls in progress continue.

## Diagnostics

The client sends call diagnostics for its own media connections to
`POST /messaging/voip/calls/{id}/reports`, where they appear with the call in
the Console: an error code when media fails to attach, times out
(`media_timeout`), loses its token (`token_refresh_failed`) or gives up
reconnecting (`reconnect_exhausted`); other failures are reported as `other`.
When the connection closes, it reports how many times the connection
reconnected. It sends no other figures, because it does not measure them.
Each report names the connection and `@polymorfa/sdk` with its version and
runtime. No phone numbers, names, audio or video are sent. Reports are
best-effort and never affect the call. Pass `diagnostics: false` to
`new CallsClient()` to send none.

## Runtime

Node 22+ for the global `WebSocket`, or pass `WebSocket` from `ws` on Node 20.
`fetch`, timers and `WebSocket` are injectable, which is how the tests run
without a network.

## Browser calls

Use `createBrowserCalls` from `@polymorfa/browser` in browsers. Its controller
exposes this package's `Call` as `controller.call`; the browser component owns
microphone, camera and playback, so `call.audio` and `call.video` do not carry
media there.

`client.getCall(id)` includes bounded recent ended calls. `place()` accepts
`video`, `exclusive`, `signal` and `idempotencyKey`; a placement that returns
after cancellation or disconnect is ended instead of tracked.

## Public API

The package entry point exports `CallsClient`, `Call`, `AudioTrack`,
`VideoTrack`, `CallsError`, `CallsApiError`, `CallsAuthError`,
`CallClaimedError`, `CallsDisabledError`, `DEFAULT_SAMPLE_RATE`, and their option, event, token and
media types. Everything else is internal to the Polymorfa packages and has no
stability guarantee.

### Reactions and hands

When `call.socialSupported` is true, `call.sendReaction("👍")` sends a transient
reaction and `call.sendReaction("")` clears it. Listen for `reaction`; the sender
is either `{self: true}` or a public `participantId`. Reconnection does not
replay reactions. The SDK does not retry an uncertain send.

`call.setHandRaised(true)` raises the Number's hand and `false` lowers it.
`call.handRaised` and the `handState` event report the confirmed state. One
Number shares its hand state across all application connections; remote hands
are reported in `participant.handRaised` and disappear with the participant.
These controls require an attached connection and runtime support. Cloud API
calls refuse them. This source addition still needs a published package and
matching API deployment before use.
