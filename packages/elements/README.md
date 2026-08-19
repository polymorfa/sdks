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
