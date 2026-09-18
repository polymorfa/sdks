# Changelog

## Unreleased

- New opt-in package `@polymorfa/store` keeps a local IndexedDB copy of
  webhook-shaped events. `createPolymorfaStore()` files messages,
  conversations, contacts, presence, calls, labels, sessions, and templates
  into separate stores, logs every event, and keeps other types in `custom`.
  Ingest skips repeated event IDs and never replaces newer state with older
  state. `connectEventSource()` follows `fromEventSource()`,
  `fromEventStream()`, `fromWebSocket()`, or `fromIterable()` sources and
  saves a resume cursor. `createStoreConversationSource()` backs
  `ConversationController`, and `@polymorfa/store/react` adds
  `usePolymorfaStoreQuery()`. Stores sync across tabs, apply retention, fall
  back to memory when IndexedDB is unavailable, and accept `encrypt`,
  `decrypt`, and `redact` options. Message content is stored on the device.
  The Polymorfa client-token event stream is planned and not available yet.
  See the [store guide](packages/store/README.md).
- `ComposeBox` and `pmfa-compose-box` gain a WhatsApp-style toolbar: an emoji
  picker with search, recent emoji, and categories; voice notes with a
  recording bar, timer, and level meter; and "/" quick replies with
  keyboard selection. New props are `placeholder`, `startActions`,
  `endActions`, `emoji`, `voiceNotes`, `voiceNoteAutoSend`, `quickReplies`,
  `onQuickReply`, and `maxRows`; the element takes the matching attributes,
  a `quickReplies` property, `start-actions` and `end-actions` slots, and a
  `pmfa-quick-reply` event. New slots are `composerToolbar`, `emojiButton`,
  `emojiPicker`, `voiceButton`, `recordingBar`, and `quickReplyMenu`. See the
  [React](packages/react/README.md#chat) and
  [Web Component](packages/elements/README.md#chat) guides.
- `@polymorfa/browser` adds `VoiceNoteRecorder`, which records WebM, Ogg, or
  (in Safari) MP4 audio, and `@polymorfa/ui` adds
  `QuickReplyOption`, the built-in emoji set, and composer helpers. See
  [voice notes](packages/browser/README.md#voice-notes).
- The `@polymorfa/devtools` panel now starts collapsed behind a small
  launcher in the bottom-left corner, so it no longer covers the composer.
  `mountDevAssistant()` accepts `position`, `defaultOpen`, and `offset`, and
  the panel closes on Escape and follows the system color scheme. See the
  [devtools guide](packages/devtools/README.md).

- The chat and template components in `@polymorfa/react` and
  `@polymorfa/elements` now ship a stylesheet: message bubbles by direction
  with time and delivery status, a drawer that is full width on small
  screens, a labelled template form that stacks on narrow containers, and a
  WhatsApp-style template preview. Both packages follow the `light`, `dark`,
  and `system` themes. Messages render oldest first whatever order the
  controller holds, and the list stays at the newest message while the reader
  is at the end. `ChatDrawer` shows its close button only when `onClose` is
  set, and closes on Escape. `@polymorfa/ui` exports `COMPONENT_STYLES`,
  `injectComponentStyles()` and `themeClassName()`, plus new locale keys for
  the labels.
- Chat components in `@polymorfa/react` and `@polymorfa/elements` gain
  attachments, replies, and retry. Messages show image thumbnails and file
  cards, a quote of the message they reply to, date separators, grouping by
  side, and pending, sent, or failed icons; failed outbound messages offer
  Retry. The composer attaches files from a button, a paste, or a drop, shows
  upload progress with a remove button, reports rejected files, and shows a
  reply banner. `ChatDrawer` and `pmfa-chat-drawer` accept
  `composerController` to render the composer and wire Reply to it, move
  focus into the drawer on open, and restore it on close. The message list is
  now a `role="log"` region. See the [React](packages/react/README.md#chat)
  and [Web Component](packages/elements/README.md#chat) guides.
- `@polymorfa/browser` adds `LocalAttachment.file`,
  `MessageAttachment.url` and `previewUrl`, `localAttachmentFromFile()`, and
  `createConversationComposerActions()`, which sends composer drafts through
  a `ConversationController`. `ConversationController.send()` accepts an
  optional `AbortSignal`; the composer actions pass the composer's signal, so
  `cancelSend()` cancels the request and marks the message failed.
- Attachment URLs render as links or images only when they use `https:`,
  `http:`, or `blob:`. `@polymorfa/ui` exports `safeAttachmentUrl()` for the
  same check in custom renderers.
- `ChatDrawer` and `pmfa-chat-drawer` no longer take focus when they mount
  open; pass `autoFocus` (React) or set the `autofocus` attribute. Focus
  still moves in when `open` changes to `true`. Escape closes a drawer only
  when pressed inside it and not during IME composition. A rejected-file
  message in the composer clears after an edit, a successful send, or a
  reset. `pmfa-compose-box` re-renders its reply banner when its
  `conversation` updates.
- `pmfa-template-builder` names its preview area `preview-panel`; `preview`
  stays on the Preview button, and `slotPartName("preview")` returns
  `preview-panel`. Validation messages keep their nodes between edits.
- Styling: bundled rules sit in `@layer polymorfa`, so unlayered app CSS
  overrides them. Appearance adds `darkVariables` (emitted as
  `--pmfa-dark-color-*`) and `unstyled`. Every chat and template node has a
  slot name: React applies `appearance.elements[slot]`, a new `classNames`
  prop, and `data-slot`; Web Components add kebab-case `part` names next to
  the existing ones and accept `configuration.stylesheet`. `MessageList`
  adds `renderAttachment` and `onReply`. See the
  [styling reference](packages/ui/README.md#styling).
- Breaking: the React `MessageList` root is now a `div` with `role="log"`
  that wraps the `ol`; select it with `[data-pmfa="message-list"]`. The Web
  Component list part `message-list` moved to the same wrapper. Web
  Components now share one adopted stylesheet instead of a `<style>` element
  per render, and default dark-theme danger buttons use dark text.

- Breaking: removed the embedded QuickLink UI. `@polymorfa/browser` no longer
  exports `QuickLinkController` or its transport types, `@polymorfa/elements`
  no longer registers `pmfa-quicklink` or exports the `./quicklink` subpath, and
  `@polymorfa/react` no longer exports `QuickLink`. QuickLink is a hosted page:
  create a link with `MessagingClient.quickLinks.create()` on the server and
  send the person to its `url`.

- `WhatsAppAccount`, `ProfileData`, and the `session.connected` webhook payload
  replace the raw `platform` string with `phonePlatform` (`android`, `ios`, `meta_cloud`, or
  `unknown`) and `accountType` (`whatsapp_app`, `business_app`, `meta_cloud`,
  or `meta_coexistence`). `SessionConnectedPayload` now types the account's
  Polymorfa `id` instead of `lid`. Both new types are exported.

- Added typed BanSafe Health, telemetry, collection, findings, enforcement,
  incidents, claims, and Health action reads to `Client.banSafe`.
  Project and session resources now cover Safe Mode, warm-up, Ban Insurance
  evidence, and Health policy settings, and `MessagingClient.banSafe` covers
  the same settings on the Messaging API for organization API keys and project
  tokens. Claim credit amounts are decimal quantities. Dashboard-only finding
  acknowledgement and appeals remain outside the server SDK.
- Breaking: saved QuickLink settings drop `allowedRedirectUris` and add
  `successCallbackUrl`, `failureCallbackUrl`, and `allowPhoneChange`, matching
  the management contract. Customer profiles and create/update requests no
  longer carry `phone`, `CustomerSummary` no longer carries `phoneMasked`, and
  Customer pairing-link creation no longer accepts `locale` or `theme`. Use
  `expectedPhone` on the pairing link to restrict a number.
- Export typed `contact.sync` and `message.echo` webhooks and the optional
  QuickLink `externalId` on every webhook envelope.
- Type the Customer lifecycle, BanSafe, campaign, `message.failed`, and
  `template.status` webhook events. `message.failed` includes the
  `blocked_by_safety` reason with optional `code` and `retryAfter`.
- Webhook delivery attempts now include `response`, a redacted excerpt of a
  failed HTTP response, or `null`.

- Export typed terminal Calls webhooks. `call.ended` preserves a nullable caller
  identity for `pod_lost`; `call.telemetry` preserves cumulative traffic values.

- Browser WebRTC calls now receive participant joins, state changes, and
  departures through the lifecycle stream. Late invitation replies cannot
  overwrite newer roster state or restore a participant who already left. The
  TypeScript webhook catalog exports payload types for the same three events.

- Keep call controls and media available after a failed reject or hangup, with
  a localized retry message in React and custom elements.

- Send call rejection without a request body, matching the API contract.

- Refreshed the pinned API contracts through the completed Calls and TURN
  producer changes. The snapshots now include literal webhook event names,
  nullable terminal-call callers, participant lifecycle events, client-token
  delegation scopes, and TURN health diagnostics. Coverage remains 226 of 402
  operations, with 103 missing and 73 excluded; no SDK package release is
  included in this reconciliation.
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
