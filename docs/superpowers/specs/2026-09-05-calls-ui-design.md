# Calls UI design

**Date:** 2026-09-05
**Status:** Shipped on `dev` in `@polymorfa/react` (`CallSurface`,
`IncomingCallCard`, `CallStage`, `CallControls`, `DialPad`) over the
`@polymorfa/browser` `CallsController`.

## Outcome

One call UI for both calling lines — a paired WhatsApp device session
(`linkedDevice`, audio and video) and the WhatsApp Business Calling API
(`cloudApi`, audio only) — behind a single capability-gated call model.
Components read `snapshot.capabilities`; nothing branches on the line name.

## Design language

Monochrome Material 3: black identity, white surfaces, tonal fills, hairline
outlines, 8px radius, Roboto with the appearance font as override. The verbs
carry the only color — success green answers or places a call, danger red
declines or hangs up. Cards follow the appearance theme (`light`, `dark`, or
`system`); the call stage, and the incoming card once it shows a camera
preview, is always dark like an OS call screen.

Colors resolve from the shared `--pmfa-*` appearance variables with the
monochrome palette as fallbacks: `--pmfa-color-foreground` is the identity
accent, `--pmfa-color-background` / `--pmfa-color-border` / `--pmfa-color-muted`
shape cards, `--pmfa-color-success` and `--pmfa-color-danger` are the verbs,
`--pmfa-radius-medium` and `--pmfa-font-family` carry shape and type. The
`call` entry of `appearance.elements` adds a class and inline styles to every
call root.

## Layout (after the official desktop call windows)

- **Incoming card** — big centered name, muted "WhatsApp audio/video call"
  subtitle, then the media middle: the avatar for audio offers, a mirrored
  self-preview with camera and mute toggles and a ⋯ device menu for video
  offers. Two labeled verbs close the card: Reject, Answer. Voice offers keep
  the same 16/10 footprint as video offers and carry no mute row.
- **Stage** — remote video full-bleed when the far side sends video, the
  centered avatar hero otherwise, the local preview as a picture-in-picture
  tile; before connecting, an outgoing video call shows the identity above an
  inset self-preview. The line under the name reads "Ringing +number…" while
  an outgoing call waits, then alternates number ⇄ duration every five seconds.
- **Dock** — split pills `[camera|⌄]` and `[mic|⌄]`: the toggle is the
  action, the chevron opens the device panel (camera picks the camera; mic
  picks microphone and speaker). The camera pill is disabled until the call
  connects and on lines without video. Red hang-up pill on the right.
- **Dial pad** — digits only (no letter sub-labels), E.164 entry, audio call
  always, video call only where the line carries video.
- **Pop-out** — `CallSurface` offers a ↗ button that moves the stage and dock
  into a separate resizable window; closing it, or the call ending, brings
  the call back inline.

## Behavior rules

- Video is per direction: enabling the local camera never renegotiates the
  peer's stream. Answering a video offer with the camera toggled off still
  acquires video muted so the in-call toggle can enable it.
- Device panels overlay the widget and never resize it. Device picks apply
  live: a microphone or camera change replaces the outgoing track in place
  and mute state carries over; the speaker pick uses `setSinkId` where the
  browser supports it.
- No hover growth, no press bounce, no drop shadows. All motion (answer pulse,
  dock rise) is disabled under `prefers-reduced-motion: reduce`.
- Avatars: a resolved profile picture wins; otherwise a stable hash of the
  caller id picks one of eight muted palette tones so the same caller always
  gets the same color.
- Examples and documentation use fictional numbers and personas only.

## Wire contract

Signaling is the REST surface on the client token — offer/answer, trickle ICE
submission and polling, idempotent teardown — through
`createSignalingCallsBackend`. Inbound calls arrive by either of two paths,
and an application picks one: `CallsSocket` subscribes to the lifecycle
directly and needs no webhook plumbing (the Transport addendum below), or the
application relays the server's `call.received` webhook into
`IncomingCallRelay`, with `incomingCallFromWebhook` mapping the payload. The
relay is the fallback for deployments that already carry webhooks to the
browser, not a prerequisite. The server mints the browser token
with `MessagingClient.voip.token` after granting the session's client rules the
`voip_place`, `voip_answer`, and `voip_signal` actions.

### Outbound placement (2026-09-06)

`voip_place` authorizes browser signaling for an outbound call; it does not
create one. Nothing on the client-token surface dials a destination — `/offer`
carries only SDP, and it reaches a pod through the call's affinity record, so a
call id the browser invents resolves to no pod and its offer is refused as
not-ready for as long as it is retried. Starting a call is a server-key
operation on the Business Calling surface (`action: "connect"`).

Outbound calls therefore run through the backend's `place` hook:

1. The browser posts the destination to the application's own route.
2. That route places the call with the server SDK, on the server credential.
3. It answers with the platform's call id.
4. The browser attaches media to that id, and only then does signaling apply.

Without the hook the placement fails, which the controller reports the way it
reports every call failure — an `error` snapshot with code `place_failed`.
`place()` itself resolves either way, so the snapshot is what an integrator
watches, not a rejected promise — it rejects only when the controller has been
disposed, which a UI holding a shared controller should still absorb. An application that only answers inbound
calls needs no such route.

## Transport (2026-09-06 addendum)

The kit no longer depends on the application relaying webhooks. `CallsSocket`
opens the calls WebSocket with a single-use ticket (`POST /api/voip/ws-ticket`)
and is both the backend's lifecycle source (incoming, accepted, ended with the
pod's reason mapped onto the controller vocabulary) and the media factory's
`candidateTransport`. REST candidate polling pauses while the socket is up and
resumes while it reconnects; `IncomingCallRelay` remains for deployments that
prefer their own channel. The camera button on an audio call now calls
`controller.enableVideo()` (camera + re-offer on the same connection), and a
dropped connection renders the existing "Reconnecting" message while the
controller restarts ICE inside a 15 s resumption window. None of this changes
the visual design.
