# Changelog

## Unreleased

- Added `createBrowserCalls`: direct client-token placement, shared call models
  and lifecycle events connected to the existing WebRTC controller and UI.
  Browser mode auto-answers remotely; Answer attaches local media and Reject
  ends the call. The existing custom backend remains available.
- Browser media setup now stops when a remote end arrives, and late placement
  results after cancellation or disconnect are torn down. One widget refuses
  overlapping placements and preserves an active call.
- The browser package now depends on the shared Calls package. Install both
  matching development artifacts when consuming unpublished builds.

- `createSignalingCallsBackend` no longer invents a call id for outbound
  calls. Nothing on the client-token surface dials a destination, so an
  invented id reached no pod and its offer was refused as not-ready forever.
  Outbound calling now goes through a `place` hook that hands the destination
  to the application's server and takes back the platform's call id; the
  removed `createCallId` option had no working use.
- `CallsSocket` heartbeats. A half-open connection still reports OPEN, so
  candidates were dropped while the media factory kept REST polling disabled;
  an unanswered `ping` now closes it and reconnects. `heartbeatMs` tunes the
  period, 0 disables it.
- `CallsSocket` takes a `line`, carried onto the calls it delivers. It always
  reported `linkedDevice`, so a Business Calling API session showed video
  controls on an audio-only line.
- `CallsSignalingClient.socketTicket` no longer names a session. The client
  token is bound to one, and the API answers 403 when a request names another.
- `CallsSocket` reports a signaling client that cannot mint tickets as an
  `unsupported` error and stops, instead of backing off forever against a
  failure that can never succeed; ordinary ticket failures still retry, now
  reported as `ticket_failed`.
- `CallsSocket` gained `onError`, so a server `error` frame reaches the
  application instead of being parsed and dropped while the socket keeps
  reconnecting against a permanent failure.
- Timer defaults are bound to `globalThis`. `CallsController`, `CallsSocket`,
  `WebRtcMediaFactory`, and the QuickLink controller called the unbound
  `setTimeout`/`setInterval` with the instance as receiver, which browsers
  reject with `TypeError: Illegal invocation`.
- Calls hardening: a recovered ICE flap leaves `reconnecting` instead of
  waiting for a connection-state change that may never come; mute pressed
  while the microphone was still being acquired now reaches the tracks;
  pushed ICE candidates are held until the answer is applied rather than
  discarded; setup failures release the candidate subscription; an audio-only
  call no longer keeps an unnegotiated camera track (which had made the video
  upgrade unretryable); a failed upgrade rolls the camera back; the calls
  WebSocket survives a throwing constructor and validates every frame shape; a
  camera button in `pmfa-call` upgrades an audio call over a video-capable
  line, as the React dock's already did; a
  failed re-offer rolls the peer out of `have-local-offer` so later upgrades
  and ICE restarts are not blocked by the stale offer; the audio→video upgrade
  acquires the camera chosen during the call rather than the one selected when
  it opened; a failed device swap
  releases the stream it acquired; and `pmfa-call` localizes the connected
  heading rather than rendering a raw status identifier.

- Added `CallsSocket` (the calls WebSocket: pushed `call.*` lifecycle events,
  ICE both ways, ticket-based auth, capped reconnect) as a drop-in lifecycle
  source for `createSignalingCallsBackend` and a `candidateTransport` for
  `WebRtcMediaFactory`; `CallsSignalingClient` gained `renegotiate`,
  `socketTicket`, and `socketUrl`; `BrowserTransport` exposes `baseUrl`.
- `CallsController` gained `enableVideo()` (audio→video upgrade by re-offer),
  a `reconnecting` status with ICE restart and a bounded resumption window,
  and ends the call as `pod_lost` / `capacity` when the offer is refused
  with 410 / 503. The React camera button upgrades audio calls to video;
  `CallStage` and `pmfa-call` show "Reconnecting…".
- Added `MessagingClient.voip.socketTicket` and `voip.agentToken`; typed
  `maxSetupsPerMinute` in the client rules; refreshed the contracts and the
  coverage ledger to polymorfa@b413f2c6a (renegotiate, ws-ticket,
  agent-token).

- Added `MessagingClient.voip.token` for minting the browser call token, typed
  the client-rules response the runtime actually returns (including the calls
  bindings `maxConcurrency` and `allowedNumber`), and typed client actions.
- Added `createSignalingCallsBackend`, `IncomingCallRelay`, and
  `incomingCallFromWebhook` so browser calls run end to end on the REST
  signaling surface; `CallsController` now carries the calling `line` and
  `capabilities`, device lists and selections, live device switching, and
  `connectedAt`.
- Replaced the placeholder `CallSurface` with the complete call UI —
  `IncomingCallCard`, `CallStage`, `CallControls`, `DialPad`, a pop-out call
  window, and `useCallDuration` — themed from the shared appearance variables
  and localized through new `calls.*` messages; `pmfa-call` follows the same
  controller contract.
- Refreshed the Messaging and Platform contracts and the coverage ledger for
  the `/api/voip/*` signaling routes and the `call.ended` / `call.telemetry`
  webhook events.

## 0.1.0-dev.0 - 2026-08-19

- Added handwritten Messaging clients for sessions, messages, and webhooks.
- Replaced open-ended structured message objects with root-exported types for
  every send kind and aligned quoted replies with the current API contract.
- Added Messaging media metadata, binary download, and persistence operations
  with binary-aware timeout and error handling.
- Added typed Messaging label CRUD, full-set chat-label replacement, and
  project/session observation-policy resources.
- Added typed Business App quick-reply listing, creation, replacement, and
  deletion.
- Added typed session profile retrieval plus name, status, and JSON URL/base64
  picture mutations.
- Added typed account privacy retrieval, setting-specific privacy mutations,
  and default disappearing-message timer controls.
- Added handwritten Platform clients for organizations, projects, and sessions.
- Added the complete typed Customers resource, including project enablement,
  profile lifecycle, pairing links, recent events, and Number transfers.
- Added handwritten Platform resources for campaigns, audiences, opt-outs, and
  media, covering 27 additional organization-key operations.
- Added typed organization-key resources for API-key metadata and deactivation,
  member reads, audit logs, session bans, security incidents, durable operation
  polling, and project-token metadata.
- Added typed Connect widget settings retrieval and updates plus bounded batch
  session stop and deletion for organization server keys.
- Added the complete Messaging project campaign workflow: list, create,
  retrieve, analytics, durable launch/pause/resume/stop commands, and direct
  failed-recipient requeueing.
- Excluded dashboard-only member invitations, role changes, and deletion from
  the organization-key client.
- Excluded dashboard-only template and Flow endpoints from the organization-key
  server client instead of exposing methods with an incompatible credential.
- Added typed errors, response metadata, timeouts, cancellation, safe retries,
  idempotency support, per-request API versions, and raw requests.
- Added cursor pagination primitives.
- Added server-side client-token minting and rule management, a Next.js mint
  adapter, and a same-origin browser token provider.
- Added a session-bound browser Messaging client for the exact client-token
  message, presence, contact, and widget allowlist, plus a text/reply composer
  adapter.
- Added raw-body webhook signature verification and typed event parsing.
- Added explicit contract coverage reporting against the pinned Messaging and
  Platform specifications.
- Added a framework-neutral browser transport and controllers for QuickLink,
  conversations, composing, template building, and one-to-one calls.
- Added shared UI contracts, portable Web Components, React bindings, and thin
  Next.js server helpers.
- Added a production-gated configuration, theming, network simulation, and
  redacted diagnostics assistant.
- Aligned call signaling and media behavior with the `voip-v2` implementation.

This is a Git development channel. No npm package has been published.
