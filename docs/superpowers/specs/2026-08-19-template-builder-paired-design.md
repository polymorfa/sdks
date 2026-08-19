# Canonical template builder paired design

## Status

Approved for the `dev` SDK line on 2026-08-19. The contract tracks monorepo
source revision `f156af2dda13e62b6b106a542fdedb39524bdb66`.

## Decision

Project templates use one canonical `TemplateDefinition` across the handwritten
server client, framework-neutral browser controller, React binding, and Web
Components. The previous lowercase category and generic `components[]` draft
cannot represent carousels, authentication, limited-time offers, media headers,
or typed variables and is replaced rather than translated lossily.

The server SDK exposes `MessagingClient.templates` with list, create, retrieve,
update, delete, preview, and Meta submission methods. The browser never calls
those credentialed routes directly.

## Application-mediated browser boundary

`createTemplateBuilderRoute` accepts a signed-in application request and then:

1. authorizes the application subject;
2. resolves the subject's project slug on the server;
3. dispatches a typed load, save, preview, submit, or delete action;
4. resolves the Cloud API session on the server for submission; and
5. returns a private, non-cacheable browser-safe response.

Browser-provided project slugs and submission sessions are ignored. Internal
SDK failures are not reflected into the response body.

`createSameOriginTemplateBuilderTransport` sends those actions with same-origin
credentials. It rejects absolute and protocol-relative route URLs and has no
server-key configuration.

## Controller and rendering contract

`TemplateBuilderController` owns immutable snapshots, local validation,
stale-operation protection, cancellation, saving, previewing, deletion, and
Meta submission. `save()` and `submitToMeta()` remain distinct. A dirty or
unsaved template cannot be submitted.

React and Web Components render the same snapshot. Their baseline editor covers
canonical header text, body, footer, variable examples, button labels, and
carousel card bodies. Structured previews retain buttons and cards. Applications
can replace React preview rendering without replacing controller state.

## Research basis

The layering follows the current product pattern shared by Clerk and Stripe:
prebuilt UI over lower-level state primitives, with stable appearance and a
server boundary for privileged work. It does not copy deprecated Clerk Elements
internals or Stripe's payment-specific state model.

References:

- <https://clerk.com/docs/guides/customizing-clerk/overview>
- <https://clerk.com/docs/guides/development/custom-flows/overview>
- <https://docs.stripe.com/elements/appearance-api?platform=web>

## Verification

Behavioral tests cover exact server paths and bodies, server-owned scoping,
failure redaction, canonical controller validation and stale responses,
same-origin action payloads, structured React rendering, structured Web
Component rendering, and coverage-ledger method resolution.
