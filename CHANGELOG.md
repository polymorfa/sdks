# Changelog

## 0.1.0-dev.0 - 2026-08-19

- Added handwritten Messaging clients for sessions, messages, and webhooks.
- Replaced open-ended structured message objects with root-exported types for
  every send kind and aligned quoted replies with the current API contract.
- Added Messaging media metadata, binary download, and persistence operations
  with binary-aware timeout and error handling.
- Added typed Messaging label CRUD, full-set chat-label replacement, and
  project/session observation-policy resources.
- Added handwritten Platform clients for organizations, projects, and sessions.
- Added handwritten Platform resources for campaigns, audiences, opt-outs, and
  media, covering 27 additional organization-key operations.
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
