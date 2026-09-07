# @polymorfa/elements

Framework-neutral Web Components for QuickLink, chat and composing, template
building, and calls. Applications own controllers and data transports; elements
render their immutable snapshots.

```ts
import { definePolymorfaElements } from "@polymorfa/elements";

definePolymorfaElements();
```

The registered elements are `pmfa-quicklink`, `pmfa-message-list`,
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

The token needs `voip_place`, `voip_answer` and `voip_signal`. See the
[browser package](../browser/README.md#calls) for answer-mode behavior,
media ownership and participant limits. The element keeps its existing layout,
controls, appearance and accessibility behavior.

If a reject or hangup request fails, the call stays active and its controls remain
available for retry. The UI shows a localized failure message and keeps existing
media connected until the call ends. `snapshot.error` clears when ending succeeds.
