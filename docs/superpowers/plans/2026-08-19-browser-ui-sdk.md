# Browser and UI SDK Implementation Plan

> Execute this plan on `dev`. Keep every product surface controller-driven so Web Components, React, and Next.js share behavior instead of implementing parallel state machines.

**Goal:** Ship framework-neutral browser controllers, a shared appearance and localization contract, portable Web Components, React bindings, Next.js server helpers, and a production-safe development assistant for QuickLink, chat/composer, templates, and calls.

**Architecture:** `@polymorfa/browser` owns token-aware transports and state machines. `@polymorfa/ui` owns serializable appearance, localization, and diagnostic types. `@polymorfa/elements` is the portable rendered baseline. `@polymorfa/react` adapts the same controllers and events. `@polymorfa/nextjs` supplies server-only token and webhook adapters. `@polymorfa/devtools` observes public controller/transport diagnostics and never receives raw credentials. No browser package imports `@polymorfa/sdk`.

**Tooling:** TypeScript 6, npm workspaces, Vitest, Happy DOM, React 19 test renderer, native Custom Elements, CSS custom properties and parts.

---

## Global constraints

- Browser packages accept only short-lived `pmfa_ct_` client tokens supplied by an async callback.
- Server credentials and server SDK imports fail repository checks in browser package source.
- Conversation history is application-provided; an empty history is a valid ready state.
- Calls expose product states, capabilities, media/device state, participants, waiting-room state, reconnecting, and end reasons. MatrixRTC and LiveKit remain transport details.
- Every controller mutation emits one immutable snapshot and has a deterministic fixture test.
- Components work without React. React bindings wrap, but do not replace, controllers.
- Development tools are inert in production and redact tokens, authorization headers, secrets, and message bodies by default.
- No registry publication, release, or tag is part of this plan.

### Task 1: JavaScript workspace and shared UI contract

**Files:** root workspace configuration; `packages/ui`; shared test setup.

1. Write failing tests for deep appearance merging, stable CSS variable projection, partial locale fallback, RTL direction, reduced-motion selection, and immutable snapshots.
2. Add npm workspaces and per-package build/typecheck metadata without changing the existing `@polymorfa/sdk` entrypoint.
3. Implement `defineAppearance`, `mergeAppearance`, `appearanceToCssVariables`, `createLocale`, and diagnostic redaction primitives.
4. Prove `@polymorfa/ui` has no runtime dependencies and packs only `dist`, README, and license material.
5. Run focused tests, root typecheck/build, and commit `feat: add shared UI contract`.

### Task 2: Browser token transport and observable controller base

**Files:** `packages/browser/src/token.ts`, `transport.ts`, `controller.ts`, `diagnostics.ts`, tests.

1. Write failing tests for token prefix/audience validation, token refresh deduplication, expiry skew, cancellation, timeout, request metadata, safe retry/idempotency, and protected headers.
2. Implement an injectable `getClientToken` callback and browser fetch transport. Never persist tokens to storage or include them in snapshots/errors.
3. Implement an immutable subscribable controller base with explicit `idle`, `loading`, `ready`, `error`, and product-specific states.
4. Emit redacted request lifecycle diagnostics with timing, request ID, retry count, and typed failure category.
5. Add repository tests rejecting server SDK imports and server-key prefixes from browser package source.
6. Run focused tests and commit `feat: add browser transport and controller core`.

### Task 3: QuickLink controller

**Files:** `packages/browser/src/quicklink/*`, tests.

1. Write state-transition tests for launch, QR/link readiness, progress, completion, expiry, cancellation, recoverable failure, retry, and disposal.
2. Define a `QuickLinkTransport` boundary that exchanges client-token-scoped session data only.
3. Implement `QuickLinkController` with monotonic operation IDs so stale async completions cannot overwrite newer state.
4. Test reconnect and expiry timers with fake clocks and prove disposal removes subscriptions/timers.
5. Commit `feat: add QuickLink controller`.

### Task 4: Conversation and composer controllers

**Files:** `packages/browser/src/chat/*`, tests.

1. Write fixture tests for empty history, initial load, cursor pagination, subscription updates, optimistic send/ack/failure/retry, dedupe, and teardown.
2. Define `ConversationDataSource` and immutable conversation/message models without assuming platform-hosted history.
3. Write composer tests for text, reply context, attachments, validation, upload progress, send locking, cancellation, and draft reset.
4. Implement `ConversationController` and `MessageComposerController`; keep upload/send behavior behind application interfaces.
5. Commit `feat: add chat and composer controllers`.

### Task 5: Template builder controller

**Files:** `packages/browser/src/templates/*`, tests.

1. Write tests for draft loading, component edits, variables, local validation, debounced server validation, preview, submit/update, stale response rejection, and recoverable errors.
2. Define `TemplateBuilderTransport` for privileged operations delegated to the application server.
3. Implement immutable draft/validation/preview/submission snapshots and dirty-state tracking.
4. Commit `feat: add template builder controller`.

### Task 6: Calls controller based on the calls integration

**Files:** `packages/browser/src/calls/*`, tests.

1. Write transition tests for incoming, outgoing, ringing, waiting room, connecting, active, reconnecting, permission denied, unavailable devices, signaling failure, remote/local end, and retry.
2. Define a `CallsTransport` adapter with capability discovery, start/answer/reject/hang-up, device selection, mute/video, participants, reactions, hand raise, waiting-room admission, and selected video participant.
3. Model audio/video media kinds, direction, participant roles/states, active speaker, selected publisher, device inventory, permission state, and explicit end reasons.
4. Implement `CallsController` with serialized commands, stale-event rejection, media cleanup on failure/end/disposal, and reconnect state that never implies the call ended.
5. Test browser permission denial and device removal using injected media/device adapters.
6. Commit `feat: add calls controller`.

### Task 7: Portable Web Components

**Files:** `packages/elements/src/{quicklink,chat,templates,calls}`, common rendering/styles, Happy DOM tests.

1. Write failing DOM tests for registration, attributes/properties, events, slots, CSS parts, keyboard behavior, focus restoration, ARIA labels/live regions, direction, reduced motion, and disconnect cleanup.
2. Implement controller-bound custom elements for QuickLink, chat drawer/list/message list/composer, template builder/editor/preview, and incoming/outgoing/active call surfaces.
3. Expose stable product subpaths `/quicklink`, `/chat`, `/templates`, and `/calls`.
4. Prove the package works from a vanilla consumer and contains no React dependency.
5. Commit `feat: add portable web components`.

### Task 8: React bindings

**Files:** `packages/react/src`, tests.

1. Write hook tests for provider configuration, controller subscription through `useSyncExternalStore`, ownership/disposal, error boundaries, and typed event adapters.
2. Implement `PolymorfaProvider`, controller hooks, and native React components for the four product areas using the shared appearance and localization contract.
3. Support controlled and uncontrolled controllers plus render callbacks for major regions.
4. Verify React is a peer dependency and no second controller implementation exists.
5. Commit `feat: add React bindings`.

### Task 9: Next.js server helpers

**Files:** `packages/nextjs/src`, compile-time boundary tests.

1. Write tests for short-lived client-token response adapters, webhook raw-body adapters, safe error mapping, and server-only import guards.
2. Implement framework-thin helpers around application-provided token minting and `@polymorfa/sdk` webhook verification.
3. Provide route-handler and server-action adapters without importing browser packages into server bundles.
4. Commit `feat: add Next.js helpers`.

### Task 10: Configuration and theming development assistant

**Files:** `packages/devtools/src`, tests.

1. Write tests proving `auto` enables only in non-production with a non-production credential audience and cannot be activated by query string.
2. Write redaction tests covering token values, authorization, webhook secrets, message bodies, and nested sensitive metadata.
3. Implement diagnostics for versions, host/runtime, active packages, token audience/expiry/scopes, controller states, media permissions/devices, request timing/IDs/retries/rate limits, and typed failures.
4. Implement live appearance/locale/direction/reduced-motion/state/viewport/network simulation with copyable redacted configuration and diagnostic reports.
5. Provide a production export that is inert and tree-shakeable; add bundle inspection proving production output excludes the interactive assistant.
6. Commit `feat: add safe development assistant`.

### Task 11: Reference consumers, documentation, and CI

**Files:** `examples/vanilla`, `examples/react`, `examples/nextjs`, package READMEs, root README/changelog, CI.

1. Build tested examples for QuickLink, chat/composer, template builder, and calls using deterministic mock application transports.
2. Add interaction tests covering the complete happy path and one recovery path per product in vanilla and React; compile the Next.js boundary example.
3. Document install identities, credential boundaries, framework ownership, appearance schema, accessibility, data-source requirements, calls transport contract, and devtools production exclusion.
4. Extend CI across Node 20/22 with package builds, tests, lint, typecheck, pack inspection, browser/server import boundary scans, and example builds.
5. Run the complete clean-tree matrix and inspect every tarball.
6. Commit `docs: publish browser and UI SDK contract`, push `dev`, and report exact SHA plus shipped and deferred surfaces.
