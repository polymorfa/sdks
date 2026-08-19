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
