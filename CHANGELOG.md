# Changelog

## Unreleased

- `Client.sipTrunks.endpoint()` returns the SIP address your PBX points at.
  `SipEndpoint` is a union on `status`: `SipEndpointHosted` carries the
  `host`, the `transports` (`SipEndpointTransport`, with port and SRTP
  policy) and the `rtp` range (`SipEndpointRtp`); `SipEndpointNotHosted`
  carries `status: "sip_not_hosted"`, a `null` `host` and `rtp`, and no
  transports. Narrowing on `status === "hosted"` gives a `host` and an `rtp`
  range without a cast. The method is available on team and project clients,
  takes no project, and needs `sessions:read`.
- Webhooks: `KNOWN_WEBHOOK_EVENT_TYPES` and `WebhookPayloadMap` add
  `bansafe.risk_changed` and `bansafe.health_changed`, with the
  `BanSafeRiskChangedPayload` and `BanSafeHealthChangedPayload` types and
  their `BanSafeForecast`, `BanSafeRiskFactor`, `BanSafeModelRef`,
  `BanSafeHealthPenalties`, and `BanSafeHealthFinding` members.
- Added `Client.operations` on organization and project clients: `list`
  (filter by `projectId`, status, kind, resource, and time), `get` with an
  optional server long-poll (`wait`, 0 to 30 seconds), `listTransitions`,
  `cancel` (generates an `Idempotency-Key`), and `wait`, which chains
  long-polls until the operation is terminal or `maxWaitMs` ends. Requires
  `operations:read`; `cancel` requires `operations:cancel`.
- Client rules: `ClientRules` and `SetClientRulesRequest` add
  `conversationTtlSeconds`, the seconds a sender stays replyable in
  `conversation` mode (300 to 604800; the API default is 86400).
  `ClientRules.recipientMode` is now `conversation`, `any`, `none`, or the
  legacy `verified` that older saved rules may return, instead of allowing an
  empty string. `rateLimit` and `maxDaily` must be 0 or more.
- `PolymorfaErrorCode` adds `feature_unavailable`,
  `stream_connection_limit_reached`, `stream_cursor_expired`, and
  `stream_cursor_invalid`.
- Added `Client.events.stream()`, an async iterator over a project's
  server-sent event stream with type filters, resume from a cursor, automatic
  reconnect with backoff, heartbeat supervision, and retention-gap reporting.
  `Client.events.acknowledgeStream()` confirms progress on manual-ack streams,
  and `Client.events.liveSource()` adapts the stream for `@polymorfa/store`.
  The API route is a beta that requires `events:listen` and team enrollment.
- `CreateProjectRequest.defaultTier` is typed as `"free" | "standard" | "pro"`,
  and `ProductionEnrollmentResult` includes `billingMode: "payg"`.
- Drop-in components. `createPolymorfaHandler()` in `@polymorfa/nextjs`
  serves the token, webhook, media, history, events, connect and template
  routes from one catch-all route, with `toExpress()` and `toHono()`
  adapters. Its required `mint()` callback returns an explicit grant
  (session or Customer, conversations, `allow`, TTL); nothing is granted by
  default. `<PolymorfaProvider tokenEndpoint>` fetches and refreshes client
  tokens with backoff and exposes `usePolymorfaClient()` and
  `usePermissions()`. New React components: `<Inbox/>`,
  `<ConversationList/>`, `<ContactPanel/>`, `<ConnectWhatsAppButton/>`
  (opens the hosted QuickLink page), `<SessionStatus/>`, `<CallButton/>` and
  `<TemplateManager/>`. Controls the token lacks are hidden, with one
  development warning. `@polymorfa/elements` adds `definePolymorfa()`,
  `<pmfa-inbox>`, `<pmfa-connect-whatsapp>` and `<pmfa-session-status>`.
  `@polymorfa/store` adds `createStoreInboxSource()`. `ComposeBox` gains an
  `attachments` prop. See `examples/five-minute-inbox`.
- Message writes are safe to retry. `messages.send`, `messages.react`,
  `chats.editMessage`, `chats.deleteMessage`, `channels.reactToMessage`, and
  Messaging `campaigns.create` and `campaigns.launch` generate an
  `Idempotency-Key` when you don't pass `idempotencyKey`, and their automatic
  retries reuse it. The browser client's `messages.send` and `react` do the
  same. A response with `Idempotent-Replayed: true` is final and is not
  retried, in both the server and browser transports. A caller-supplied key
  still wins. `PolymorfaErrorCode` adds `idempotency_completed`,
  `idempotency_conflict`, `idempotency_in_progress`, and
  `idempotency_outcome_unknown`.
- `CreateProjectRequest.icon` is typed as `ProjectIconInput`, whose `type` is
  `emoji`, `icon`, or `image`, matching what the API accepts.
- Dev prereleases of `@polymorfa/sdk`, `@polymorfa/browser`, `@polymorfa/ui`,
  `@polymorfa/elements`, `@polymorfa/react`, `@polymorfa/store`,
  `@polymorfa/nextjs` and `@polymorfa/devtools` publish to npm under the
  `dev` dist-tag on each push to `dev`. Versions follow
  `0.1.0-dev.<UTC timestamp>`, internal dependencies are pinned to the same
  version, and each release carries npm provenance. Install with
  `npm install @polymorfa/sdk@dev`. See [releasing](docs/releasing.md).
- Added `MessagingClient.testing.triggerEvent()` and
  `MessagingClient.testing.listEventFixtures()` to fire signed test events for
  Test numbers, with typed fixture names (`TestEventFixture`,
  `TEST_EVENT_FIXTURES`), per-fixture `TestEventOverrides`, and the
  `fromSession` simulated-message option. `triggerEvent()` accepts an optional
  `idempotencyKey` so a retried trigger reuses the same event.
- `PolymorfaError` exposes `requestLogUrl`, `docUrl`, and `rateLimitReason`,
  and `requestId` now prefers the error body's `request_id` over the
  `X-Request-Id` header. `code` is typed as `PolymorfaErrorCode`, a union of
  the documented codes (including the new WhatsApp codes
  `recipient_not_on_whatsapp`, `conversation_window_closed`,
  `template_not_approved`, `media_too_large`, `whatsapp_rate_limited`,
  `new_chat_limit_reached`, and `whatsapp_account_restricted`; the Calls and SIP trunk codes; and the Platform `payg_required` and `premium_required` codes) that still
  accepts any string. A `413` now throws `PolymorfaValidationError`.
  `BrowserError` gains `docUrl` and reads `code`, `requestId`, and the message
  from the error object. The `polymorfa-ratelimit-reason` header is kept in
  response metadata.
- Breaking (types only): `Client.projects.create` returns `CreatedProject`, and
  `CreateProjectRequest.defaultTier` is `ProjectDefaultTier`.
  `ProductionEnrollmentResult` adds `billingMode: "payg"`.
- `MessagingClient.clientTokens.mint` accepts `customer` (a Polymorfa
  Customer ID) instead of `session`, with an optional `allow` list, to mint a
  Customer-scoped client token (beta). The token covers the numbers the
  Customer owns when it is minted; the API re-checks ownership on every
  request. `MintClientTokenRequest` is now a union of
  `MintSessionClientTokenRequest` and `MintCustomerClientTokenRequest`, and
  `CustomerClientTokenAction` lists the allowed actions. The SDK throws
  `PolymorfaConfigurationError` before sending when both or neither of
  `session` and `customer` are set, or when `allow` is set without
  `customer`. `@polymorfa/nextjs` `createMessagingClientTokenMint` accepts
  the same `customer` and `allow` from `resolve`.
- New opt-in package `@polymorfa/store` keeps a local IndexedDB copy of
  webhook-shaped events. `createPolymorfaStore()` files messages,
  conversations, contacts, presence, calls, labels, sessions, and templates
  into separate stores, logs every event, and keeps other types in `custom`.
  Ingest skips repeated event IDs and never replaces newer state with older
  state. `connectEventSource()` follows `fromEventSource()`,
  `fromEventStream()`, `fromWebSocket()`, or `fromIterable()` sources and
  saves a resume cursor. `fromEventStream({ format: "project" })` reads the
  project event stream frames through a backend relay.
  `createStoreConversationSource()` backs
  `ConversationController`, and `@polymorfa/store/react` adds
  `usePolymorfaStoreQuery()`. Stores sync across tabs, apply retention, fall
  back to memory when IndexedDB is unavailable, and accept `encrypt`,
  `decrypt`, and `redact` options. Message content is stored on the device.
  The Polymorfa client-token event stream is planned and not available yet.
  See the [store guide](packages/store/README.md).
- Added streaming media downloads to `MessagingClient.media`.
  `downloadStream()` returns an unbuffered body with `contentType`,
  `contentLength`, `filename` and `requestId`. `downloadBlob()` returns a
  typed `Blob`. `downloadUrl()` returns the short-lived signed storage URL
  without following it. When the SDK follows a storage redirect, it never
  sends the Polymorfa credential to the storage host. `download()` keeps its
  existing behavior.
- Added direct WhatsApp media downloads.
  `MessagingClient.media.downloadFromWhatsApp()` and
  `downloadWhatsAppMedia()` fetch the encrypted file named by a message
  webhook's `media` field from `*.whatsapp.net`, then verify and decrypt it
  locally. `decodeWhatsAppMedia()`, `deriveWhatsAppMediaKeys()` and
  `decryptWhatsAppMedia()` are exported for custom fetching. Integrity and
  size failures raise the new `PolymorfaMediaIntegrityError`.
- Added the `@polymorfa/sdk/node` entry point. It provides
  `downloadMediaToFile()`, `downloadWhatsAppMediaToFile()`,
  `writeStreamToFile()` (temporary file, then rename) and `nodeMediaCrypto`
  for streaming decryption.
- `@polymorfa/nextjs` adds `createMediaDownloadRoute()` with `redirect`,
  `proxy` and `whatsapp` modes, a required fail-closed `authorize` callback,
  and safe response headers.
- Packaging: `@polymorfa/browser` depends on `@polymorfa/sdk` and uses its
  Calls client (`@polymorfa/sdk/calls`) instead of a separate package, so
  there is one copy of the Calls classes: `instanceof CallsDisabledError`
  (and the other Calls errors) with the class from `@polymorfa/sdk/calls`
  works for errors raised by browser calls. The SDK now lives in the
  `packages/typescript` workspace; installing from the GitHub repository root
  (`npm install github:polymorfa/sdks#dev`) no longer installs it. Install the
  packed `@polymorfa/sdk` tarball instead.
- `@polymorfa/sdk/calls`: a placed call records the answer in `call.claim`
  (`answered`, `answeredBy`, `exclusive`) and emits `claim` when the callee
  picks up. `disconnect()` and `leave()` wait for an answer still in flight
  and leave the call if it succeeds. Concurrent token requests share one
  provider call without sharing cancellation: cancelling one request no
  longer fails the others, and the provider call is cancelled only when
  every waiting request is.
- Call diagnostics. `MessagingClient.voip.report()` sends quality figures or
  an error code for one of your media connections
  (`POST /messaging/voip/calls/{id}/reports`), with the new
  `VoipCallReportRequest` types. `createBrowserCalls` reports each
  connection's round-trip time, jitter, packet counts, codecs, ICE candidate
  type and reconnect count every 15 seconds and when it closes, plus error
  codes for denied or missing devices, ICE and negotiation failures, stalled
  media, reconnection give-up and unsupported browsers. `@polymorfa/sdk/calls`
  reports media timeouts, token failures and reconnection give-up, and each
  connection's reconnect count. Reports carry no personal data, are
  best-effort, and never affect the call. Turn them off with
  `diagnostics: false` on `createBrowserCalls`, the `CallsController` options
  or `CallsClient`.
- The programmatic Calls client ships inside `@polymorfa/sdk` as the
  `@polymorfa/sdk/calls` subpath. Import `CallsClient` and the Calls error
  classes from `@polymorfa/sdk/calls`; there is no separate `@polymorfa/calls`
  package to install.
- `@polymorfa/sdk/calls` on Node.js 22: a lifecycle or media socket whose
  handshake fails (connection refused or reset, or a non-WebSocket reply) now
  settles like a dropped socket. `connect()` resolves and retries with backoff,
  and a media `connect()` rejects, instead of waiting indefinitely.
- Breaking: the `includeSelfAudio` call setting is replaced by
  `conferenceMode` (default `true`) in `SessionCallSettings`,
  `UpdateSessionCallSettingsRequest` and `MessagingClient.voip`
  `retrieveCallSettings` / `updateCallSettings`. With conference mode on,
  every participant you connect to a call (browser, app and server
  connections, and SIP trunk callers) hears the WhatsApp party and each
  other; with it off, each hears only the WhatsApp party. The WhatsApp party
  always hears all of your participants, and nobody hears their own audio in
  either mode. The platform rejects `includeSelfAudio`, and the SDK fails
  before sending it with a `PolymorfaValidationError` that names
  `conferenceMode`.
- `Client.sipTrunks` manages SIP trunks (a standard Calls feature; no
  enrollment). Session call settings add
  `callsEnabled` (turn calling off for a session; refusals use
  `calls_disabled`, raised as `CallsDisabledError` by `@polymorfa/sdk/calls` and
  the browser client), `inboundRoute`, `sipTrunkId`, `sipClaim`, `hostCloudApiCalls` (whether
  Polymorfa Calls answers a Cloud API session's calls), and `revision`. An update changes
  only the settings you send (`conferenceMode` is optional) and accepts
  `expectedRevision`. Webhook types add `call.connection_joined` and
  `call.connection_left`, including the SIP trunk departure reasons.
- Call webhook payload types match the contract. `CallReceivedPayload` adds
  `hasVideo`, and optional `sessionConnection` and `capabilities`
  (`WebhookCallCapabilities`). `CallAcceptedPayload` is its own type with
  optional `answeredBy`, `exclusive`, `sessionConnection` and `capabilities`.
  `CallEndedPayload` adds optional `sessionConnection`. `CallMissedPayload` and
  `CallRejectedPayload` no longer extend or alias `CallReceivedPayload`.
- `@polymorfa/sdk/calls`: when media fails after an answer, join or remote
  pickup, or is lost for good, the call is released on the platform before it
  ends locally: ended when this client claimed it (exclusive answer or
  placement), otherwise left. `answer()` and `join()` reject after the
  release, which waits at most 5 seconds.
- `Call.leave()` ends a placed call that is still ringing, and a failed leave
  request keeps the call live so it can be retried. A placed call's
  controller status stays `ringing` until the callee answers, for every
  backend, and the React stage shows "Ringing" only in that state. A partial
  capability report changes only the flags it reports, and a placed call the
  answer reports as audio-only opens no camera.
- Capabilities reported with `call.accepted` now apply: `Call.capabilities`
  and `Call.hasVideo` update (new `capabilities` event on `Call`), and the
  browser controller refreshes `snapshot.capabilities` for the displayed call
  and for waiting invitations. `IncomingCallRelay.accepted()` accepts the
  webhook's `capabilities`.
- Browser calls: when a microphone or camera switch fails,
  `snapshot.selectedDevices` goes back to the device the capture is using,
  also after several quick switches.
- Browser calls: when media fails on a call this browser claimed (an
  exclusive answer or placement), the call is ended rather than left, so the
  other party is not left on an answered call. The React incoming card
  applies its pre-answer microphone and camera choices only to the call that
  was answered.
- Browser calls: a group video slot request whose re-offer failed is offered
  again on the next report, so participants beyond the initial slots become
  visible; participants and an answer reported before an outbound placement
  returned are shown on the placed call. With `createBrowserCalls`, a placed
  call stays `ringing` while its media opens until the callee answers, then
  moves to `connecting`; the React stage shows "Ringing" only until then.
- `CallsClient` no longer emits `incoming` for a call whose `call.ended`,
  `call.missed` or `call.rejected` event arrived before `call.received`; the
  call is reported through `ended` only. The browser `CallsController` also
  ignores an invitation that arrives after its call was reported ended.
- `ClientTokenManager` (browser) and `CallsTokenSource` (`@polymorfa/sdk/calls`)
  never reuse or cache a provider call that started before a forced refresh
  or `invalidate()`, so a reconnect after a revoked token asks for a new one.
- Breaking: Calls use one neutral calling API. Session answer modes and
  calling tickets are gone; the token your server issues authenticates
  everything, and group audio and per-participant video are supported.
  Upgrade steps:
  - Mint browser tokens on your server with `POST /platform/client-tokens`
    (`clientTokens.mint`, or `@polymorfa/nextjs` helpers). `MessagingClient.voip`
    no longer has `token()`, `socketTicket()` or `agentToken()`; it has
    `place`, `accept`, `reject`, `leave`, `end`, `addParticipant`,
    `retrieveCallSettings` and `updateCallSettings` (`conferenceMode`,
    `updatedAt` is `null` until changed). `reject` and `leave` accept
    `participant` for server credentials.
  - Signaling, media negotiation, sockets and media framing are internal. The
    package entry points no longer export `HttpCallsApi`, `LifecycleSocket`,
    `MediaSocket`, frame encoders and parsers, `VideoCodec`,
    `CallsSignalingClient`, `BrowserCallsApi`, `createSignalingCallsBackend`,
    `CallsSocket`, `IncomingCallRelay`, `incomingCallFromWebhook`,
    `WebRtcMediaFactory`, or SDP, candidate and ticket types. Use
    `CallsClient` on servers and `createBrowserCalls` in browsers.
    `CallsController` is exported as a type; create it with
    `createBrowserCalls`. `BrowserCallsOptions` no longer takes `media` or
    `mediaFactory`, and `CallsClientOptions` no longer takes `api` or
    `mediaMode`.
  - `@polymorfa/sdk/calls`: pass `token` (string or provider) and, for server
    credentials, `participant`. `Call.hangup()` is now `Call.end()` (ends the
    call for everyone). New: `answer({ exclusive })`, `join()`, `leave()`,
    `claim`, `claimedByOther`, `canJoin`, `connectionId`, the `claim` event,
    the `reconnecting` state, `CallsAuthError`, and `CallClaimedError`.
    `call.video` is always present; use `call.hasVideo` for the offer.
    Received frames are `CallVideoFrame` (`source`, `keyframe`,
    `timestampUs`, `data`); `write()` takes `OutgoingVideoFrame`;
    `video.sources` maps `CallVideoSource` (`id`, `label`, `participant` or
    `connectionId` and `connectionParticipant`).
  - Calls report their own `capabilities` (`video`, `invite`; the browser
    snapshot adds `mute`). `CallLine`, `capabilitiesFor`, the `line` options
    and the React `DialPad` `line` prop are removed; use
    `DialPad allowVideo={false}` for numbers whose calls cannot carry video.
    `Call.capabilities` is new in `@polymorfa/sdk/calls`.
  - `@polymorfa/browser`: incoming calls are never declined for you.
    `CallsController` tracks every invitation (`snapshot.invitations`) and
    adds `join()`, `leave()`, `end()`, `dismiss()`, `select()`,
    `answer({ exclusive, callId })`, and snapshot fields `claimedByOther`,
    `canJoin`, `answeredBy`, `exclusive`, `participants` and `remoteVideos`.
    `controller.remoteVideos` holds a `ParticipantVideo` (`key`, `label`,
    owner, `MediaStream`) per remote participant, and `remoteStream` carries
    the merged call audio. An expired or revoked token reaches `onError` as
    `unauthorized` and is replaced on reconnect.
  - `@polymorfa/react`: new `ParticipantVideoGrid` and `ParticipantList`;
    `CallSurface` and `IncomingCallCard` take `exclusive` (default `false`);
    the card shows Join or Dismiss for calls answered elsewhere; `CallControls`
    adds Leave (`showLeave`). `renderMedia` also receives `videos`, and
    `labelVideo` receives `RemoteVideoInfo` with a `label`.
  - `@polymorfa/elements`: `pmfa-call` accepts the `exclusive` attribute and
    renders Join, Dismiss, Leave, waiting calls and participants.
  - `CallsSnapshot.answering` is `true` while an answer or join is in flight;
    the controller then refuses `answer()`, `join()`, `reject()` and
    `place()`, and the React and element incoming controls are disabled. An
    answer completes for the call it started on, even if another invitation
    was selected meanwhile; a call dismissed during its answer is left, or
    ended when the answer claimed it. The React card also disables its
    pre-answer camera and microphone choices while answering.
  - A refused answer keeps the call displayed as `incoming` with
    `snapshot.error`. When media fails after answering, the next waiting
    call is displayed and keeps the failure; `snapshot.error.callId` names
    the failed call. The React card and `pmfa-call` (`failure` part) show a
    notice (`calls.answerFailed`, `calls.previousFailed`).
  - A call you placed offers only Hang up until it connects;
    `controller.leave()` ends it in that state, and a local media failure
    (such as a denied microphone) while it rings ends it rather than leaving
    the callee ringing. A second `answer()` or `join()` while one is in
    progress settles with the first, once media connects or fails.
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
- Added `examples/full-platform`, Acme Support: a multi-agent WhatsApp help
  desk built with Next.js on every Polymorfa SDK surface. It has a ticket inbox
  with queues, assignment, transfer, tags, private notes, quick replies,
  templates, interactive messages, voice notes, calls, contacts, campaigns,
  connections, a dashboard, admin pages, and light and dark themes from 360px
  wide up. Without credentials it runs on built-in demo data. History comes
  from the app's own webhook-fed store, live changes arrive as
  webhook-shaped server-sent events, and an opt-in IndexedDB cache opens chats
  instantly. QuickLink appears only as a created hosted `url`. The example
  checks the request origin on state-changing routes, rejects replayed
  webhooks, and serves media with download-safe headers. It needs the
  `ComposeBox` and `mountDevAssistant` options added in this release.

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
