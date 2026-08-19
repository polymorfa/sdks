# Browser client actions design

## Goal

Connect the browser SDK to the exact short-lived client-token surface in the
pinned Messaging contract and runtime. Keep every route outside that allowlist
behind an application-owned server boundary.

## Source of truth

The contract is pinned to Polymorfa source commit
`f156af2dda13e62b6b106a542fdedb39524bdb66`. The OpenAPI document describes
authentication at the broad bearer-scheme level, while the runtime client-rule
middleware is the narrower authorization boundary. The SDK therefore follows
the runtime's exact route-to-action allowlist.

## Package boundaries

- `@polymorfa/sdk` adds server-side client-token minting and rule management.
- `@polymorfa/nextjs` adapts an authorized application subject into a mint
  request without owning application authorization or importing Next.js.
- `@polymorfa/browser` adds a safe token-route provider and session-bound
  resources for client-token actions.
- Browser packages continue to reject server keys and never import
  `@polymorfa/sdk`.

## Browser action surface

The direct browser client may expose only:

- message send, reaction, typing, seen, and star actions;
- presence reads and subscriptions;
- contact list, retrieve, picture, and check reads;
- widget start, status, QR, pairing code, and handoff actions.

The client binds one session at construction. Every path segment is encoded,
and mutation retries remain opt-in through an idempotency key.

## Explicit server-adapter surfaces

Conversation history, media upload, template management, widget-session
creation/cancellation, and call lifecycle/control are not general client-token
actions. Existing controllers keep their application transport boundaries for
those operations. The SDK must not turn the broad OpenAPI bearer declaration
into an authorization claim.

## Token flow

1. An application POST route authenticates its own user.
2. The server SDK mints a token bound to a session and ephemeral browser ID.
3. The Next.js-compatible helper returns normalized browser claims with
   private, non-cacheable response headers.
4. The browser provider validates the response shape and supplies the token to
   `BrowserTransport` without persisting or logging it.

## Verification

- Test the server resource request shapes and exported types.
- Test authorization-before-mint and response normalization in the route
  helper.
- Test malformed token-route responses fail closed without exposing token
  values.
- Test every browser resource path, method, query, body, and idempotency
  behavior against injected fetch.
- Keep repository import-boundary and retired-name checks green.
