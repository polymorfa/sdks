# `@polymorfa/browser`

Framework-neutral browser transport and product controllers for Polymorfa.

This package accepts only short-lived `pmfa_ct_` client tokens obtained from an application callback. It never accepts or stores server API keys.

```ts
import { BrowserTransport } from "@polymorfa/browser";

const transport = new BrowserTransport({
  getClientToken: async () => {
    const response = await fetch("/api/polymorfa/token", { method: "POST" });
    return response.json();
  },
});
```

Requests expose status, request ID, response headers, and attempt count. Safe reads retry transient failures; mutations retry only when supplied an idempotency key. Caller cancellation and timeouts use distinct exported error types.

Product controllers use immutable snapshots and `subscribe()`/`getSnapshot()` so Web Components and framework bindings share the same behavior.

Available controller families are QuickLink, conversations and composing,
template building, and calls. Calls use `CallsSignalingClient` for the
`voip-v2` offer/answer and trickle ICE REST paths plus `WebRtcMediaFactory` for
browser media. Applications supply `CallsBackend` for lifecycle and call-control
operations that are not part of that REST signaling surface.
