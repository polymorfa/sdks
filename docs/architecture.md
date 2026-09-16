# SDK architecture research

The package split and runtime behavior were chosen after reviewing maintained,
public implementations rather than copying their visual design or API names.

## Observed patterns

- [Stripe's Node SDK](https://github.com/stripe/stripe-node) keeps a server-only
  client with resource-oriented methods, per-request options, request IDs,
  bounded retries, idempotency, typed errors, API-version control, and a raw
  request escape hatch. Polymorfa adopts those operational qualities while
  keeping credentials and API shapes specific to Polymorfa.
- [Clerk's JavaScript repository](https://github.com/clerk/javascript) is a
  monorepo of shared runtime packages and framework-specific adapters under one
  organization. Polymorfa similarly keeps product state in framework-neutral
  controllers and makes React, Web Components, and Next.js adapters thin.
- [Kapso's open-source inbox](https://github.com/gokapso/whatsapp-cloud-inbox)
  demonstrates that a useful messaging surface includes conversation state,
  templates, media and failure feedback rather than only generated HTTP calls.
  Polymorfa keeps these behaviors in reusable controllers instead of coupling
  them to one reference application.
- [Kapso's TypeScript SDK](https://github.com/gokapso/whatsapp-cloud-api-js)
  and published support matrix make capability boundaries visible. Polymorfa's
  coverage ledger serves the same transparency goal without claiming that raw
  request access equals a handwritten method.

## Deliberate differences

- The SDK remains handwritten. The OpenAPI contracts drive coverage checks and
  issue creation, not generated public clients.
- Server API keys never enter browser packages. Browser packages accept only
  short-lived, browser-audience client tokens.
- Web Components are the portable baseline. React bindings wrap the same
  controllers; Vue, Svelte and other Custom Elements-compatible surfaces do not
  need duplicated business logic.
- The developer assistant is explicit and production-gated. It does not enable
  itself from a query string or inspect secret material.
- Mobile-native packages are deferred. The browser and server contracts avoid
  assuming React Native so a future binding can reuse the controller protocol.
- Calls follow Calls contract revision 1: no session answer modes and no
  calling tickets. Clients authenticate REST calls and both call sockets with
  the existing token (a client token in browsers). Applications choose per
  answer whether to claim a call; components default to not claiming and never
  decline a call on their own. Audio is merged per participant; video stays
  one stream per participant.
- Calls packages export neutral calling operations only. Signaling, WebRTC
  negotiation, sockets and media framing are internal modules; sibling
  packages reach them through a package-private `./internal` subpath that
  applications must not import.
