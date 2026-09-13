# Polymorfa SDK Architecture

**Status:** Approved for implementation review  
**Date:** 2026-08-19  
**Repository:** `polymorfa/sdks`

## Purpose

This repository provides handwritten Polymorfa API clients, browser primitives,
UI components, and development tooling. It replaces the previous SDK codebase
with a fresh history and treats the API specifications as coverage contracts,
not client generators.

The initial release covers the Messaging and Platform APIs. Graph-compatible
APIs and mobile-native UI kits are outside the initial release.

## Product principles

1. API clients are handwritten and idiomatic in each language.
2. Contract drift is visible, attributable, and maintained deliberately.
3. Browser code never receives server credentials.
4. Headless state and transport are separate from rendered UI.
5. The web component layer makes the UI usable without React.
6. React and Next.js receive first-class bindings where framework integration
   adds real value.
7. Development diagnostics are rich in non-production environments and absent
   from production bundles and behavior.
8. Stable releases come from `main`; ongoing work happens on `dev`.
9. Package versions and changelogs are independent so consumers only upgrade
   the surfaces they use.

## Research basis

The design borrows patterns rather than visual or source-level imitation:

- Stripe separates server libraries, browser libraries, and UI bindings; its
  libraries expose retries, idempotency, request metadata, typed errors, and
  webhook verification. Its testing assistant is automatically available in
  sandbox environments and absent from live mode.
  - <https://docs.stripe.com/sdks>
  - <https://github.com/stripe/openapi>
  - <https://github.com/stripe/stripe-node>
  - <https://github.com/stripe/react-stripe-js>
  - <https://docs.stripe.com/elements/appearance-api?platform=web>
  - <https://docs.stripe.com/sdks/stripejs-testing-assistant>
- Clerk separates shared internals, headless behavior, framework packages, and
  rendered components. Its appearance contract has themes, variables, layout,
  and element-level customization, plus an interactive theme editor.
  - <https://github.com/clerk/javascript>
  - <https://clerk.com/docs/reference/react/overview>
  - <https://clerk.com/docs/guides/customizing-clerk/overview>
  - <https://clerk.com/components/theme-editor>
- Stream separates low-level clients and state from platform UI kits while
  preserving shared concepts, tokens, and component customization points.
  - <https://getstream.io/chat/docs/sdk/android/>
  - <https://getstream.io/chat/docs/sdk/flutter/stream-chat-flutter/customizing-widgets/>
  - <https://getstream.io/chat/docs/sdk/ios/swiftui/view-customizations/>
  - <https://getstream.io/chat/docs/sdk/react/components/core-components/chat/>
- Kapso demonstrates a compact handwritten resource client and treats its
  inbox as a reference application rather than presenting application code as
  a reusable component library.
  - <https://github.com/gokapso/whatsapp-cloud-api-js>
  - <https://github.com/gokapso/whatsapp-cloud-inbox>
  - <https://github.com/gokapso/chat-sdk-adapter>

## Repository layout

```text
contracts/                 Coverage ledgers, fixtures, and spec snapshots
packages/
  typescript/              @polymorfa/sdk
  browser/                 @polymorfa/browser
  ui/                      @polymorfa/ui
  elements/                @polymorfa/elements
  react/                   @polymorfa/react
  nextjs/                  @polymorfa/nextjs
  devtools/                @polymorfa/devtools
  python/                  polymorfa-sdk
  go/                      github.com/polymorfa/sdks/go
  php/                     polymorfa/sdk
  dotnet/                  Polymorfa.Sdk
  rust/                    polymorfa-sdk
examples/
  vanilla/
  react/
  nextjs/
scripts/                   Coverage and repository maintenance tools
.github/workflows/         CI, coverage, and release preparation
```

JavaScript packages share a workspace, test fixtures, lint rules, and release
tooling. Non-JavaScript packages remain idiomatic projects with their native
build and test tools. No package imports unpublished repository internals.

## Published package identities

| Surface                  | Package identity                                 | Initial priority |
| ------------------------ | ------------------------------------------------ | ---------------- |
| TypeScript server client | `@polymorfa/sdk`                                 | Required         |
| Browser controllers      | `@polymorfa/browser`                             | Required         |
| Shared UI contract       | `@polymorfa/ui`                                  | Required         |
| Web Components           | `@polymorfa/elements`                            | Required         |
| React bindings           | `@polymorfa/react`                               | Required         |
| Next.js helpers          | `@polymorfa/nextjs`                              | Required         |
| Development assistant    | `@polymorfa/devtools`                            | Required         |
| Python                   | distribution `polymorfa-sdk`, import `polymorfa` | Required         |
| Go                       | `github.com/polymorfa/sdks/go`                   | Required         |
| PHP                      | `polymorfa/sdk`                                  | Required         |
| .NET                     | `Polymorfa.Sdk`                                  | Required         |
| Rust                     | `polymorfa-sdk`                                  | Required         |

Registry release workflows may be prepared and validated, but no public
package is published without an explicit release instruction and the required
registry identities and credentials.

## API scope and client contract

### Included contracts

- Messaging API
- Platform API

The initial bootstrap reads both specifications from the monorepo `dev`
branch. After bootstrap, SDK branches track matching monorepo branches:

| Monorepo branch | Reusable workflow ref                                    | SDK target branch |
| --------------- | -------------------------------------------------------- | ----------------- |
| `dev`           | `polymorfa/sdks/.github/workflows/sdk-coverage.yml@dev`  | `dev`             |
| `main`          | `polymorfa/sdks/.github/workflows/sdk-coverage.yml@main` | `main`            |

`main` is stable in both repositories. `dev` is the integration branch.

### Bootstrap sequence

The first implementation is built from scratch on SDK `main`, using the
monorepo `dev` specifications as a one-time bootstrap exception. After the
implementation is complete and verified, SDK `dev` is created from the
completed SDK `main`. All later contract checks use strict branch parity.

### Excluded contracts

- Graph-compatible endpoints
- Generated client code
- Mobile-native UI packages during the initial release

### Shared behavior

Every server SDK provides:

- separate, explicit clients or namespaces for Messaging and Platform
  credentials;
- API-version pinning and a visible client version;
- typed resources, request parameters, responses, and errors;
- request identifiers, response status, response headers, and retry metadata;
- bounded retries with exponential backoff and jitter for safe operations;
- idempotency-key support where an operation can be retried safely;
- configurable timeouts, cancellation, base URL, proxy where idiomatic, and
  custom transport hooks;
- per-request overrides without mutating shared client configuration;
- idiomatic automatic and manual pagination;
- raw-body webhook signature verification before event parsing;
- typed webhook events plus forward-compatible unknown event handling;
- a documented raw-request escape hatch for newly released endpoints;
- semantic errors for authentication, authorization, validation, rate limits,
  conflicts, server failures, connection failures, and timeouts;
- user-agent metadata that identifies the SDK, version, language, and runtime
  without transmitting application secrets.

The clients reject browser runtimes when initialized with server credentials.
Browser packages only accept scoped, short-lived client tokens issued by an
application server.

## Handwritten coverage model

OpenAPI documents are input to coverage verification only. They never emit
runtime client source.

`contracts/coverage.json` records each operation with:

- contract family;
- HTTP method and normalized path;
- operation identifier and structural fingerprint;
- owning SDK method for each required language;
- implementation status: `covered`, `partial`, `missing`, or `excluded`;
- an explanation and milestone for every non-covered entry;
- the source specification revision last reviewed.

Coverage tests prove that each `covered` mapping resolves to a public SDK
method and has a request/response fixture test. A changed fingerprint returns
the mapping to review even when the method and path remain unchanged.

The ledger is explicit about partial coverage. Aggregate percentages never
hide individual missing operations.

## Browser and UI architecture

### Dependency direction

```text
@polymorfa/sdk          server only
        |
        +--> @polymorfa/nextjs

@polymorfa/browser      browser transport and headless controllers
        |
        +--> @polymorfa/elements
        +--> @polymorfa/react

@polymorfa/ui           appearance, tokens, localization, icons
        |
        +--> @polymorfa/elements
        +--> @polymorfa/react
        +--> @polymorfa/devtools
```

No UI package imports the server SDK or embeds a server credential. UI actions
requiring privileged access call an application-owned server transport.

### Headless controllers

`@polymorfa/browser` owns stable state machines and browser-safe transports:

- `QuickLinkController` manages link state, completion, cancellation, expiry,
  and recovery.
- `ConversationDataSource` is an application-provided interface for initial
  history, pagination, optimistic sends, delivery updates, and subscriptions.
- `MessageComposerController` manages text, attachments, reply context,
  validation, upload state, and send state.
- `TemplateBuilderController` validates canonical drafts locally, while
  `TemplateBuilderTransport` delegates privileged load, save, preview, delete,
  and Meta submission operations to an application server.
- `CallsController` manages capabilities, media permissions, devices,
  signaling state, participants, reconnection, and hang-up.

Conversation history is never assumed to exist in the platform. Applications
must provide a data source backed by an explicitly enabled hosted store or by
their own webhook-backed store. Empty history is a valid state, not an error.

### Rendered components

Required product areas are exposed through stable subpaths:

- `/quicklink`
- `/chat`
- `/templates`
- `/calls`

The web component package is the portable web baseline for vanilla JavaScript,
Vue, Svelte, Angular, server-rendered templates, desktop webviews, and other
custom-element-capable surfaces. React bindings provide providers, hooks,
typed event adapters, and native React composition. Next.js helpers provide
server-only token minting, webhook verification, and server action or route
handler adapters.

The initial component set includes:

- QuickLink launcher, dialog, progress, completion, and recovery states;
- chat drawer, conversation list, message list, composer, attachment tray,
  reply preview, delivery states, and empty/error states;
- template builder, variable editor, validation summary, preview, and
  submission states;
- incoming and outgoing call surfaces, active call controls, participant
  layout, device selector, permission recovery, reconnection, and call-ended
  states.

Components support controlled and uncontrolled composition where the state
model permits it. Applications can replace major regions through slots or
render callbacks without forking the controller.

### Provider example

```tsx
<PolymorfaProvider
  getClientToken={getClientToken}
  appearance={appearance}
  developerTools="auto"
>
  <QuickLink />
  <ChatDrawer dataSource={chatDataSource} />
  <TemplateBuilder controller={templateBuilderController} />
  <Calls />
</PolymorfaProvider>
```

## Appearance and accessibility

The shared appearance schema has four layers:

- `theme`: a named preset or theme object;
- `variables`: colors, typography, spacing, radii, shadows, motion, and layer
  tokens;
- `layout`: density, placement, sizing, and product-area layout options;
- `elements`: stable component-part overrides for targeted customization.

Web components expose documented CSS custom properties, parts, attributes, and
events. React uses the same appearance object. Package-owned styles do not
depend on application class-name generation.

All rendered components must satisfy keyboard operation, focus visibility,
semantic labeling, contrast, reduced-motion behavior, responsive layout,
bidirectional text, and localization requirements. English is the bundled
fallback; applications can provide complete or partial locale dictionaries.

## Development assistant

`@polymorfa/devtools` provides the configuration and theming feedback loop. It
is enabled with `developerTools="auto"` only when both the SDK build and the
credential environment are non-production. It is unavailable in production
exports and does not activate from a query string alone.

The assistant displays:

- SDK and API versions, host, runtime, and active feature packages;
- redacted credential audience, expiry, scopes, and permitted actions;
- controller state, selected data source, realtime state, and media
  permissions;
- call capabilities, active devices, and signaling transitions;
- request timing, request identifiers, retries, rate-limit state, and typed
  failures;
- webhook or browser event inspection with configured sensitive-field
  redaction;
- live appearance editing for themes, variables, layout, and elements;
- responsive widths, component states, locale, direction, reduced motion, and
  bounded network-condition simulation;
- copyable configuration and a diagnostic report containing no raw secrets.

It never displays server credentials, raw client tokens, webhook secrets,
authorization headers, message bodies by default, or unredacted customer
metadata. Sensitive payload inspection requires an explicit local opt-in and
is visually persistent while active.

## Coverage workflow contract

The reusable workflow lives at:

```text
.github/workflows/sdk-coverage.yml
```

It is invoked by the monorepo with these required string inputs:

- `source_repository`
- `source_sha`
- `source_branch`
- `sdk_target_branch`
- `messaging_spec_path`
- `platform_spec_path`

It accepts these required secrets:

- `SDK_COVERAGE_APP_ID`
- `SDK_COVERAGE_APP_PRIVATE_KEY`

The workflow always creates or updates issues in `polymorfa/sdks` with the
label `coverage`. The GitHub App has repository metadata and contents read
access plus issues write access on this repository. It requires no write
access to the source repository.

For each missing or changed operation, the workflow creates or updates one
issue containing:

- a hidden stable key derived from target branch, contract family, method, and
  normalized path;
- source repository, source branch, source revision, and target SDK branch;
- operation identifier and structural fingerprint;
- the affected-language coverage matrix;
- required acceptance criteria.

Dedupe is branch-specific. A repeated gap updates the existing open issue. A
resolved gap closes its issue. Regressions reopen the matching issue. Coverage
gaps do not block a source-repository merge, but workflow execution or issue
delivery failures remain visible as failed checks.

The workflow trusts the caller-provided source identity only for reporting and
checkout. It validates branch pairing, restricts issue writes to the fixed SDK
repository, avoids evaluating specification content as code, and never prints
App credentials.

## Tests and quality gates

### Server SDKs

Each required language runs:

- unit tests for configuration, serialization, pagination, retries,
  idempotency, cancellation, and error mapping;
- fixture-driven request and response tests for every covered operation;
- shared webhook signature fixtures including malformed, expired, replayed,
  and unknown events;
- a wire-level mock server to verify headers, URLs, encodings, bodies, and
  response metadata;
- public API surface checks against the coverage ledger;
- native formatter, linter, type checker, and package build.

Shared fixtures define behavior, not language-specific implementation. Each
SDK uses idiomatic public APIs and documentation.

### Browser and UI

Browser packages run:

- controller unit and state-transition tests;
- component tests for all required states;
- Playwright coverage for QuickLink, chat, template building, and calls;
- accessibility checks, keyboard flows, reduced-motion checks, and
  localization and right-to-left snapshots;
- light, dark, high-contrast, and custom-theme visual regression tests;
- responsive tests across narrow embeds, drawers, desktop layouts, and
  desktop webviews;
- package-consumer builds for vanilla JavaScript, React, and Next.js examples;
- production-bundle checks proving development tooling is absent.

Real media tests use controlled test devices and explicit permissions. Unit
tests mock browser media only where real-device behavior is not under test.

### Repository gates

- No case-insensitive reference to the retired product name in tracked files.
- No generated API client source.
- No server credential accepted by a browser package.
- No `covered` ledger entry without a public method and fixture test.
- No undocumented public export.
- No package release from an unverified or dirty build.

## Releases and branches

Packages use independent semantic versions and changelogs. Changesets record
package impact. Release preparation builds immutable artifacts, generates a
software bill of materials where supported, attaches provenance, and verifies
package contents before any registry action.

`dev` may publish opt-in prereleases after registry access is configured.
`main` publishes stable releases only through a protected, reviewed workflow.
Creating tags, releases, or registry publications always requires an explicit
release instruction.

The repository uses MIT licensing. Examples are tested consumers, not hidden
sources of package behavior.

## Error and recovery behavior

- Invalid local configuration fails before a network request and names the
  invalid field without echoing its value.
- Authentication and authorization failures are distinct typed errors.
- Rate-limit errors expose retry metadata without automatically retrying an
  unsafe operation.
- Unknown response fields are preserved or safely ignored according to the
  language's compatibility conventions.
- Unknown event types remain inspectable without unsafe coercion.
- UI errors are recoverable where the controller can retry; destructive or
  duplicated user actions require explicit confirmation.
- Calls surface permission denial, unavailable devices, signaling loss, and
  reconnection as distinct states.
- Development diagnostics explain the failure boundary without exposing
  credentials or private payloads.

## Initial implementation phases

1. Establish repository policy, workspace tooling, contract snapshots,
   coverage ledger schema, shared fixtures, and reusable coverage workflow.
2. Implement the TypeScript server SDK and use it to validate shared client
   semantics and coverage tooling.
3. Implement Python, Go, PHP, .NET, and Rust clients against the same behavior
   fixtures.
4. Implement browser controllers and shared appearance/localization contracts.
5. Implement Web Components, React bindings, Next.js helpers, and the four
   required product surfaces.
6. Implement the development assistant and production-exclusion checks.
7. Complete consumer examples, documentation, full matrix verification, and
   release-preparation workflows.
8. Push the completed bootstrap to `main`, create `dev` from that exact commit,
   then enforce branch-parity coverage.

Phases may overlap internally, but no package is presented as complete until
its acceptance criteria pass.

## Acceptance criteria

The bootstrap is complete when:

- all required packages build from a clean checkout;
- every included API operation has an honest ledger status and every covered
  operation has an implemented, tested public method in each claimed SDK;
- raw webhook verification, typed errors, pagination, retry, timeout, and
  response metadata behavior pass shared fixtures;
- QuickLink, chat drawer and composer, template builder, and calls work in the
  vanilla, React, and Next.js reference applications;
- UI accessibility, localization, theming, responsive, and reduced-motion
  gates pass;
- the development assistant supports the specified diagnostics and is proven
  absent from production behavior and bundles;
- the reusable coverage workflow passes a fixture-based dispatch test and
  correctly creates, updates, closes, and reopens branch-specific issues;
- repository scans find no retired-name references, generated client source,
  committed credentials, or accidental server imports in browser packages;
- `main` is stable and `dev` points to the same verified bootstrap commit;
- no registry package, GitHub release, or tag has been published without a
  separate explicit instruction.

## Deferred work

- Graph-compatible client coverage
- React Native and Expo packages
- Flutter UI components
- SwiftUI components
- Jetpack Compose components
- framework-specific wrappers that add no behavior beyond Web Components

Deferred surfaces must reuse the established headless concepts, appearance
schema, fixtures, and product vocabulary rather than inventing incompatible
contracts.
