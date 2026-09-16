# `@polymorfa/calls`

Programmatic Polymorfa Calls: a client you run from code that follows a session,
rings on inbound WhatsApp calls, places outbound ones, and hands you each call's
audio and video to read and write. The browser call UI in `@polymorfa/react` and
`@polymorfa/elements` uses the same call model with WebRTC as its media path.

```ts
import { CallsClient } from "@polymorfa/calls";

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

| Call                                | Effect                                                                                                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `call.answer({ exclusive, video })` | Accepts the call and attaches media. `exclusive` defaults to `false`: other participants keep ringing and can join. `exclusive: true` claims it; others get `call_claimed`. |
| `call.join({ video })`              | Accepts a call another participant answered without a claim. Never claims.                                                                                                  |
| `call.reject()`                     | Declines a ringing call. This ends the call for everyone.                                                                                                                   |
| `call.leave()`                      | Closes this client's media connection. The call continues for others.                                                                                                       |
| `call.end()`                        | Ends the call for every participant.                                                                                                                                        |
| `call.addParticipant(to)`           | Invites another WhatsApp party.                                                                                                                                             |

`call.claim` reports `answered`, `answeredBy`, `exclusive`, `claimedByOther`,
and `canJoin`, and the `claim` event fires when they change. When another
participant claims the call, `claimedByOther` is `true`: stop ringing and do
not call `reject()`, which would end the call for the participant who
answered. `answer()` and `join()` reject with `CallClaimedError` in that case.

## Model

- **`CallsClient`** — one per session. Opens `wss://<api host>/voip/ws`,
  authenticates with `{ type: "auth", token }` as its first frame, and waits
  for `ready` (which names the session and your participant reference). Server
  credentials name the session and participant in the URL
  (`?session=support&participant=voice-agent`); client tokens send no query
  parameters. A replacement token must resolve to the same organization,
  project, session and participant. It sends a replacement token before the current one expires,
  reconnects with backoff, and heartbeats. A 4401 close emits a
  `CallsAuthError` (`code: "unauthorized"`); the next attempt asks the provider
  for a fresh token. A 4400 close (invalid session or participant) stops
  reconnection with `invalid_request`; 4409, 4429 and 1013 closes report
  `socket_conflict`, `rate_limited` or nothing and keep retrying with backoff.
  Events: `incoming`, `call`, `ended`, `ready`,
  `disconnected`, `error`. `disconnect()` leaves joined calls and ends
  outbound calls that are still ringing; it never declines a ringing call.
- **`Call`** — states `incoming`, `ringing`, `connecting`, `connected`,
  `reconnecting`, and `ended`, with the methods above, `participants`,
  `connectionId`, and `startedAt` / `connectedAt` / `duration`.
- **`call.audio`** — merged call audio as s16le mono PCM at `sampleRate`
  (16 kHz unless the platform names another rate), both directions. By
  default the merged stream excludes your own audio; the session's
  `includeSelfAudio` call setting changes that.
- **`call.video`** — one outgoing H.264 stream (`write()`, Annex-B access
  units, source 0) and one inbound stream per remote source. `sources` maps
  each handle to its owner: `connectionId` (with its `connectionParticipant`
  reference) for another app connection, or `participant` for a WhatsApp
  participant. Events: `frame` (with
  `frame.source`), `source`, `sourceRemoved`, and `keyframeRequest` — send a
  keyframe with decoder configuration when it fires.

## Media socket

Each attached call opens `wss://<api host>/voip/calls/{callId}/media` with the
`pmfa.calls.v2` subprotocol and no query parameters. The first frame is
`{ type: "auth", token, connectionId, participant? }` (`participant` only for
server credentials); a replacement auth frame cannot change either field. `connectionId` is
generated from 18 crypto-random bytes (base64url) per call, or supplied, and
matches `[A-Za-z0-9_-]{8,64}`. The client reuses it to reconnect after a
dropped socket (up to `reconnectAttempts`, default 3; state `reconnecting`).

The call reattaches after 4401 (with a fresh token), 4429, 1013 and other
transient closes. It does not reattach after a normal 1000 close (the
connection left or the call ended), a 4409 close (claimed or no longer
available; `CallClaimedError` when claimed), or a 4400/1008 refusal. An
authentication refusal arrives as `{ type: "error", code }` followed by the
close.

Binary frames start with a kind byte: `0x01` audio (s16le PCM), `0x02` video
with a 14-byte big-endian header — codec (`0x01` H.264), flags (bit 0
keyframe), source (u32), timestamp in microseconds (u64) — then one Annex-B
access unit. Text frames are JSON: the platform sends `ready`,
`participant_joined`, `participant_state`, `participant_left`,
`video_source`, `video_source_removed`, `keyframe_request`, and `pong`; the
client sends `auth`, `ping`, `leave`, and `end_call`. The framing is
implemented once in `protocol.ts`.

## Runtime

Node 22+ for the global `WebSocket`, or pass `WebSocket` from `ws` on Node 20.
`fetch`, timers and `WebSocket` are injectable, which is how the tests run
without a network.

## Browser media adapters

Use `createBrowserCalls` from `@polymorfa/browser` for the built-in WebRTC
widget. Its controller exposes this package's `Call` as `controller.call` and
uses `mediaMode: "external"`: the widget owns media streams and device
controls, PCM writes and encoded frame events are unavailable on that path,
and `call.connectionId` names the WebRTC connection.

For an external adapter, `answer()` resolves after acceptance and
`call.mediaConnected()` reports media readiness. Outbound calls remain ringing
until remote acceptance. `client.getCall(id)` includes bounded recent ended
calls. `place()` accepts `video`, `exclusive`, `signal` and `idempotencyKey`;
a placement that returns after cancellation or disconnect is ended instead of
tracked.
