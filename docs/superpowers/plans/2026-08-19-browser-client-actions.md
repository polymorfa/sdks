# Browser client actions implementation plan

**Goal:** Provide an end-to-end, browser-safe client-token workflow and typed
access to the exact runtime allowlist.

**Architecture:** The server SDK mints and manages token rules. A framework-
neutral Next.js route helper adapts application identity to mint requests. The
browser package consumes normalized claims and exposes session-bound resources
over its existing safe transport. App-only operations remain explicit
controller adapters.

## Task 1: Server client-token resource

1. Add failing request-shape and public-export tests.
2. Implement mint, retrieve rules, update rules, and delete rules methods.
3. Export the resource and all public request/response types.
4. Update the coverage ledger for the four operations.

## Task 2: Token route integration

1. Add failing tests for mapping a server mint response to browser claims.
2. Implement a dependency-injected mint adapter in `@polymorfa/nextjs`.
3. Add a browser token-route provider with strict response validation.
4. Document the end-to-end route and browser setup.

## Task 3: Browser allowed-action client

1. Add failing tests covering messages, presence, contacts, and widget paths.
2. Implement a session-bound `BrowserMessagingClient` over
   `BrowserTransport`.
3. Add a composer adapter for text/reply sends; keep uploads injected because
   media routes are denied to client tokens.
4. Export all browser-safe request and response types.

## Task 4: Coverage and verification

1. Map newly typed Messaging operations without double-counting methods that
   already exist on the server client.
2. Run formatting, lint, typecheck, tests, all builds, coverage, name checks,
   package dry-runs, and production dependency audit.
3. Push `dev` and require hosted Node 20 and Node 22 CI before reporting the
   milestone.
