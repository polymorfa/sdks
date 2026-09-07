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

## Runtime

Node 22+ for the global `WebSocket`, or pass `WebSocket` from `ws` on Node 20.
`fetch`, timers and `WebSocket` are all injectable, which is how the tests run
without a network.

## Credentials

A server API key. It never belongs in a browser: the browser kit uses client
tokens, which the platform scopes to a single session and to answering rather
than placing.
