# `@polymorfa/calls`

Programmatic Polymorfa Calls: a client you run from code that follows a session,
rings on inbound WhatsApp calls, places outbound ones, and hands you each call's
audio and video to read and write — the shape of a bot client rather than a
widget. The browser call UI in `@polymorfa/react` and `@polymorfa/elements` is one
consumer of the same call model, running on client tokens with WebRTC as its
media path.

```ts
import { CallsClient } from "@polymorfa/calls";

const client = new CallsClient({
  apiKey: process.env.POLYMORFA_API_KEY!,
  session: "support",
});

client.on("incoming", async (call) => {
  await call.answer();
  call.audio.on("data", (pcm) => recognizer.push(pcm)); // WhatsApp → you
  call.audio.write(synth.speak("Hello, how can I help?")); // you → WhatsApp
  call.on("ended", (reason) => console.log("ended:", reason));
});

await client.connect(); // claims the session's `sdk` answer mode, then follows its calls

const call = await client.place("+15550100", { video: false });
```

## Model

- **`CallsClient`** — one per session. Opens the calls lifecycle socket with a
  fresh single-use ticket, reconnects with backoff, heartbeats so a half-open
  connection is dropped rather than silently swallowing events. Emits
  `incoming`, `call`, `ended`, `ready`, `disconnected`, `error`.
- **`Call`** — `incoming | ringing | connecting | connected | ended`, with
  `answer()`, `reject()`, `hangup()`, `addParticipant()`, `participants`, and
  `startedAt` / `connectedAt` / `duration`.
- **`call.audio`** — s16le mono PCM at `sampleRate` (16 kHz by default), both
  directions. **`call.video`** — present when the call carries video; encoded
  frames with a fixed header, both directions.

Media rides a per-call socket to the voip pod, opened with a per-call ticket.
Binary frames are tagged (`0x01` audio, `0x02` video) so audio and video share
the socket; text frames are JSON control (`ready`, `hangup`, `video_state`,
`participant_*`). The framing is defined once in `protocol.ts`; the pod
implements the same contract.

Calls created with `mediaMode: "external"` receive the same participant roster
through the lifecycle socket. `participantJoined`, `participantState`, and
`participantLeft` update `call.participants` without opening a media socket.

## Runtime

Node 22+ for the global `WebSocket`, or pass `WebSocket` from `ws` on Node 20.
`fetch`, timers and `WebSocket` are all injectable, which is how the tests run
without a network.

## Credentials

A server API key. It never belongs in a browser: the browser kit uses client
tokens scoped to one session and explicit call actions, including placement.

## Browser media adapters

Use `createBrowserCalls` from the browser package for the built-in WebRTC widget.
Its controller exposes this package's `Call` as `controller.call`. The adapter
claims `answerMode: "browser"` and uses `mediaMode: "external"`, so the Calls
client never requests an agent ticket. The widget owns media streams and device
controls; PCM writes and encoded frame events are unavailable on this path.

For an external adapter, `answer()` resolves after acceptance and
`call.mediaConnected()` reports media readiness. Outbound calls remain ringing
until remote acceptance. Socket media remains the default and ignores
`mediaConnected()`. `client.getCall(id)` includes bounded recent ended calls.
`place()` also accepts an optional `signal` and `idempotencyKey`; a placement
that returns after cancellation or disconnect is torn down instead of tracked.
