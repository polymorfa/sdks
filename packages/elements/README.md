# @polymorfa/elements

Framework-neutral Web Components for chat and composing, template
building, and calls. Applications own controllers and data transports; elements
render their immutable snapshots.

```ts
import { definePolymorfaElements } from "@polymorfa/elements";

definePolymorfaElements();
```

The registered elements are `pmfa-message-list`,
`pmfa-compose-box`, `pmfa-chat-drawer`, `pmfa-template-builder`, and
`pmfa-call`. Assign a matching `@polymorfa/browser` controller through the
element's `controller` property. Appearance and locale configuration uses the
`configuration` property.

Every element uses an open shadow root, stable CSS parts, keyboard-native
controls, live-region status, direction propagation, and controller unbinding
when disconnected. Vue, Svelte and other frameworks can use the elements
without a React runtime.

`pmfa-template-builder` uses the same canonical template controller as the
React binding. Its open shadow root exposes stable parts for the editor,
validation messages, preview buttons/cards, save action, preview action, and
Meta submission action.

## Calls

Create a browser calls component and assign its existing controller to `pmfa-call`:

```ts
import {
  createBrowserCalls,
  createClientTokenProvider,
} from "@polymorfa/browser";
import { PolymorfaCallElement } from "@polymorfa/elements";

const calls = createBrowserCalls({
  session: "support",
  getClientToken: createClientTokenProvider(),
});
await calls.connect();
const element = document.querySelector<PolymorfaCallElement>("pmfa-call");
if (element) element.controller = calls.controller;
// Call await calls.dispose() when the application releases this widget.
```

Your server mints the client token with `POST /platform/client-tokens`; it
needs `voip_place`, `voip_answer` and `voip_signal`. See the
[browser package](../browser/README.md#calls) for token replacement, media
ownership and participant limits.

```html
<pmfa-call exclusive></pmfa-call>
```

The boolean `exclusive` attribute (or `element.exclusive` property) makes
Answer claim the call so other participants stop ringing. Without it, Answer
leaves the call open for others to join. The element never declines a call on
its own:

- A call another participant answered without a claim shows Join (`join`
  part) and Dismiss (`dismiss` part).
- A call another participant claimed shows "Answered by another participant"
  (`claimed` part) and Dismiss only.
- Other waiting calls are listed in the `invitations` part with Show buttons.
- While an answer is in flight, Answer, Join and Reject are disabled. A failed
  answer shows a `failure` notice on the incoming call: on the call itself
  when it is still ringing, or on the next waiting call when the answered
  call's media failed.
- During a call nobody claimed, Leave (`leave` part) closes only this
  connection, and the `hangup` button reads "End call for everyone". A call
  this browser placed shows only Hang up until it connects.
- The `participants` part lists the call's WhatsApp participants.

Participant video tiles are part of the React package; this element renders
controls and state.

If a reject or hangup request fails, the call stays active and its controls remain
available for retry. The UI shows a localized failure message and keeps existing
media connected until the call ends. `snapshot.error` clears when ending succeeds.
