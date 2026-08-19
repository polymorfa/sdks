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
