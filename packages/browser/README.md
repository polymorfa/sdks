# `@polymorfa/browser`

Framework-neutral browser transport and product controllers for Polymorfa.

This package accepts only short-lived `pmfa_ct_` client tokens obtained from an application callback. It never accepts or stores server API keys.

```ts
import {
  BrowserMessagingClient,
  createClientTokenProvider,
} from "@polymorfa/browser";

const messaging = new BrowserMessagingClient({
  session: "support",
  getClientToken: createClientTokenProvider(),
});

await messaging.messages.send({
  chatId: "15551234567@s.whatsapp.net",
  type: "text",
  text: "Hello",
});
```

Requests expose status, request ID, response headers, and attempt count. Safe reads retry transient failures; mutations retry only when supplied an idempotency key. Caller cancellation and timeouts use distinct exported error types.

Product controllers use immutable snapshots and `subscribe()`/`getSnapshot()` so Web Components and framework bindings share the same behavior.

`BrowserMessagingClient` binds one session and exposes only the exact
client-token allowlist: message actions, presence reads/subscriptions, contact
reads, and widget start/status/pairing/handoff actions. Conversation history,
template management, media upload, and call lifecycle/control remain
application-owned server adapters.

`createBrowserComposerActions` connects a `MessageComposerController` to the
message resource for text and reply sends. Supply an upload adapter and a
`createMessage` mapping for attachments; client tokens cannot call the media
routes directly.

Available controller families are QuickLink, conversations and composing,
template building, and calls. Calls use `CallsSignalingClient` for the
`voip-v2` offer/answer and trickle ICE REST paths plus `WebRtcMediaFactory` for
browser media. Applications supply `CallsBackend` for lifecycle and call-control
operations that are not part of that REST signaling surface.

## Template builder

The builder uses the canonical `TemplateDefinition` contract: standard,
carousel, authentication, and limited-time-offer templates with structured
headers, buttons, variables, and previews. Saving and Meta submission are
separate controller actions.

```ts
import {
  TemplateBuilderController,
  createSameOriginTemplateBuilderTransport,
} from "@polymorfa/browser";

const templates = new TemplateBuilderController(
  createSameOriginTemplateBuilderTransport({
    path: "/api/polymorfa/templates",
  }),
);

templates.create({
  name: "order_ready",
  definition: {
    version: 1,
    kind: "standard",
    category: "UTILITY",
    language: "en_US",
    body: "Hello {{name}}",
    variables: [{ name: "name", type: "text", example: "Ada" }],
  },
});

await templates.save();
await templates.refreshPreview();
```

The same-origin transport sends application actions with browser cookies. It
does not accept a server credential, project slug, or Cloud API session. The
application route resolves those values after authorizing the request.
