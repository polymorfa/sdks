# @polymorfa/react

React bindings for the framework-neutral controllers in `@polymorfa/browser`.

```tsx
import { MessageList, PolymorfaProvider } from "@polymorfa/react";

<PolymorfaProvider appearance={{ theme: "dark" }}>
  <MessageList controller={conversationController} />
</PolymorfaProvider>;
```

`MessageList`, `ComposeBox`, `ChatDrawer`, `TemplateBuilder`, and
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
rings, the stage, control dock and participant list during the call, and a ↗
button that pops the call into its own resizable window. `IncomingCallCard`,
`CallStage`, `ParticipantVideoGrid`, `ParticipantList`, `CallControls`, and
`DialPad` compose individually. All of them render from a `CallsController`
and follow the provider's appearance and locale.

```tsx
import {
  createBrowserCalls,
  createClientTokenProvider,
} from "@polymorfa/browser";
import { CallSurface, DialPad, PolymorfaProvider } from "@polymorfa/react";

// Create once in the browser; call dispose() when the app releases it.
const calls = createBrowserCalls({
  session: "support",
  getClientToken: createClientTokenProvider(),
});
await calls.connect();

<PolymorfaProvider>
  <CallSurface
    controller={calls.controller}
    resolveName={lookupContactName}
    exclusive={false}
  />
  <DialPad controller={calls.controller} />
</PolymorfaProvider>;
```

The client token comes from your server (`POST /platform/client-tokens`) and
needs `voip_place`, `voip_answer` and `voip_signal`. The components use it
directly; there is no calling ticket. `calls.controller.call` is the shared
`Call` model. See the [browser package](../browser/README.md#calls) for token
replacement, lifecycle ownership and limits.

### Answering and claims

`exclusive` on `CallSurface` and `IncomingCallCard` decides what Answer does:

- `false` (default): the call is answered without a claim. Other participants
  keep ringing and can join it.
- `true`: Answer claims the call. Other participants stop ringing and cannot
  join.

The card never declines a call on its own. A call another participant
answered without a claim shows Join and Dismiss. A call another participant
claimed shows "Answered by another participant" and only Dismiss, because
declining would end the call for the participant who answered. Other waiting
calls are listed under the card with a Show button.

In a call, `CallControls` shows Leave on calls nobody claimed (`showLeave`
overrides this). Leave closes only this browser's connection; the red button
ends the call for everyone and is labelled "End call for everyone" when Leave
is shown. A call this browser placed shows only Hang up until it connects,
because leaving it would keep the callee ringing.

### Participant video

`CallStage` renders `ParticipantVideoGrid` when anyone sends video: one tile
per remote participant, keyed by participant or connection so a tile survives
camera and source changes. Tiles are muted video elements with an accessible
name ("Video from …") and a visible label; call audio plays through one
hidden element and follows the selected speaker. Tiles for other app
connections show their participant reference (`client:<id>` or
`server:<name>`) unless `labelVideo` names them. `renderMedia` receives `{ local, remote, videos }` to
replace the media region. `ParticipantList` shows the WhatsApp participants
and their state.

The incoming card mirrors the official desktop call window: name, "WhatsApp
audio/video call" subtitle, avatar or a mirrored self-preview with camera and
mute toggles and a ⋯ device menu, then Reject and Answer. Answering a video
offer with the camera off still acquires video muted, so the in-call camera
toggle can enable it. The dock carries split pills — `[camera|⌄]` and
`[mic|⌄]` whose dropdowns pick devices live — the Leave button when shown,
and a red end-call pill. Video is
per direction; on an audio call the camera button upgrades to video
(`controller.enableVideo()`, a re-offer on the same connection) and
`disableVideo` hides it. A dropped connection shows "Reconnecting…" while the
controller reconnects media, and gives up as `connection_failed` after the
resumption window. Avatars come from
`resolveAvatar` (a URL or a promise of one; `BrowserMessagingClient.contacts
.picture` works when the token carries `read_contact`); without one a stable
hash of the caller id picks one of eight palette tones.

If a reject or hangup request fails, the call stays active and its controls remain
available for retry. The UI shows a localized failure message and keeps existing
media connected until the call ends. `snapshot.error` clears when ending succeeds.
