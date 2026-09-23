# `@polymorfa/devtools`

An explicit development assistant for testing Polymorfa appearance, direction,
motion, viewport presets, network profiles, and redacted request diagnostics.

The assistant only enables when a trusted build environment and the client-token
environment match and both are non-production. URL query parameters are never
consulted. The `@polymorfa/devtools/production` entry point is inert.

```ts
import { DevAssistant, mountDevAssistant } from "@polymorfa/devtools";

const assistant = new DevAssistant({
  environment: "development",
  tokenEnvironment: "development",
});

mountDevAssistant(assistant);
```

The assistant starts as a 40px launcher button in the bottom-left corner, so
it stays clear of a chat composer. Selecting it opens the panel beside it;
Escape or the close button closes the panel and returns focus to the
launcher. The open state is kept in `sessionStorage` for the tab when
storage is available. The launcher and panel render in a shadow root, follow
the system light or dark color scheme, and skip their transitions when
reduced motion is preferred.

```ts
const mounted = mountDevAssistant(assistant, {
  position: "top-right", // "bottom-left" (default), "bottom-right", "top-left"
  defaultOpen: false,
  offset: { x: 16, y: 16 },
  parent: document.body,
});
mounted?.open();
mounted?.dispose();
```

Passing a parent element as the second argument still works. The returned
`element` is the host; the controls are inside its open `shadowRoot`.
