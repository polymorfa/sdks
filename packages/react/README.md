# @polymorfa/react

React bindings for the framework-neutral controllers in `@polymorfa/browser`.

```tsx
import { PolymorfaProvider, QuickLink } from "@polymorfa/react";

<PolymorfaProvider appearance={{ theme: "dark" }}>
  <QuickLink controller={quickLinkController} />
</PolymorfaProvider>;
```

`QuickLink`, `MessageList`, `ComposeBox`, `ChatDrawer`, `TemplateBuilder`, and
`CallSurface` subscribe with `useSyncExternalStore`. Controllers may be passed
directly or created through a component factory; only factory-created
controllers are disposed by the binding. `useController` and
`useResolvedController` support custom rendering without forking state logic.

`TemplateBuilder` edits canonical headers, bodies, footers, button labels,
carousel card bodies, and variable examples. It keeps “Save draft” and “Submit
to Meta” as separate actions and renders structured previews. Use
`renderPreview` to replace the preview region without replacing controller
state.

## Calls

`CallSurface` is the whole call experience: the incoming card while a call
rings, the stage and control dock during the call, and a ↗ button that pops
the call into its own resizable window. `IncomingCallCard`, `CallStage`,
`CallControls`, and `DialPad` compose individually. All of them render from a
`CallsController` and follow the provider's appearance and locale.

```tsx
import {
  BrowserTransport,
  CallsController,
  CallsSignalingClient,
  CallsSocket,
  WebRtcMediaFactory,
  createClientTokenProvider,
  createSignalingCallsBackend,
} from "@polymorfa/browser";
import { CallSurface, DialPad, PolymorfaProvider } from "@polymorfa/react";

const transport = new BrowserTransport({
  getClientToken: createClientTokenProvider(), // POST /api/polymorfa/token → pmfa_ct_…
});
const signaling = new CallsSignalingClient(transport);
// The calls WebSocket: incoming calls ring without webhook plumbing, remote
// hang-ups land immediately, ICE trickles over the socket (REST is the
// fallback while it reconnects).
const socket = new CallsSocket({ signaling });
const calls = new CallsController(
  createSignalingCallsBackend({
    signaling,
    incoming: socket,
    // Outbound calls start on the server: the client token cannot dial a
    // destination. Omit this hook if you only answer inbound calls (and drop
    // `DialPad`, which places them).
    place: async ({ to, video, line, idempotencyKey }, signal) => {
      const response = await fetch("/api/calls/place", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // One key per placement: forward it to the server SDK call so a
          // retried request cannot start a second call.
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({ to, video, line }),
        signal,
      });
      if (!response.ok) throw new Error("The call could not be placed.");
      return ((await response.json()) as { callId: string }).callId;
    },
  }),
  new WebRtcMediaFactory({ signaling, candidateTransport: socket }),
);
calls.initialize();
void socket.connect();

<PolymorfaProvider>
  <CallSurface controller={calls} resolveName={lookupContactName} />
  <DialPad controller={calls} />
</PolymorfaProvider>;
```

The incoming card mirrors the official desktop call window: name, "WhatsApp
audio/video call" subtitle, avatar or a mirrored self-preview with camera and
mute toggles and a ⋯ device menu, then Reject and Answer. Answering a video
offer with the camera off still acquires video muted, so the in-call camera
toggle can enable it. The dock carries split pills — `[camera|⌄]` and
`[mic|⌄]` whose dropdowns pick devices live — and a red hang-up pill. Video is
per direction; on an audio call the camera button upgrades to video
(`controller.enableVideo()`, a re-offer on the same connection) and
`disableVideo` hides it. A dropped connection shows "Reconnecting…" while the
controller restarts ICE, and gives up as `connection_failed` after the
resumption window. Avatars come from
`resolveAvatar` (a URL or a promise of one; `BrowserMessagingClient.contacts
.picture` works when the token carries `read_contact`); without one a stable
hash of the caller id picks one of eight palette tones.
