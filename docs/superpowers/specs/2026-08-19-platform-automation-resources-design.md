# Platform Automation Resources Design

**Status:** Approved for implementation  
**Date:** 2026-08-19  
**Repository:** `polymorfa/sdks`  
**Target branch:** `dev`

## Goal

Expand the handwritten TypeScript server SDK with the customer-facing
Platform operations that accept an organization API key and are needed for
campaign automation. Preserve the credential boundary by excluding endpoints
that require a live dashboard session.

## Contract source

- Source repository: the Polymorfa source monorepo before its planned repository transfer
- Source commit: `f156af2dda13e62b6b106a542fdedb39524bdb66`
- Contract: `apps/api/docs/openapi.management.json`
- SDK snapshot: `contracts/openapi.platform.json`

The source and SDK snapshot were verified byte-identical at design time.

## Included operations

Add four resources to `PlatformClient`:

- `campaigns`: list, create, retrieve, update, delete, launch, pause, resume,
  stop, archive, duplicate, requeue, analytics, events, and recipients.
- `audiences`: list, create, retrieve, delete, and create an upload URL.
- `optOuts`: list, create one, create a batch, and delete by phone number.
- `media`: retrieve a media URL, delete media, and create an upload URL.

These 27 operations accept `ApiKeyAuth` in the pinned Platform contract.

## Credential boundary

`PlatformClient` continues to accept only a `pmfa_` organization server API
key. It must not accept a dashboard JWT, project token, or browser client token.

The ten `/v1/templates*` and `/v1/flows*` operations are excluded from the
server SDK coverage target because the pinned contract marks them
`x-dashboard-only` and explicitly rejects organization keys and project tokens.
They belong in the later application-server adapter milestone, where an
application can authorize a dashboard user without exposing a privileged token
to browser code.

## Public types

The contract gives campaign, audience, opt-out, and media requests and
responses open object schemas. The SDK must represent that fact honestly:

```ts
export type PlatformPayload = Readonly<Record<string, unknown>>;

export interface ListCampaignsParams {
  readonly projectId: string;
  readonly projectSlug?: string;
}
```

Methods with an open request body accept `PlatformPayload`. Methods with an
optional OpenAPI request body make the body optional. Responses use
`DataEnvelope<PlatformPayload>` rather than invented domain fields. Path and
query identifiers remain explicitly typed strings and are always encoded.

When the Platform contract gains closed schemas, later handwritten changes can
replace the open payload types under normal versioning rules.

## Resource behavior

Every method:

- delegates to the existing `HttpTransport`;
- returns `ApiResponse<DataEnvelope<PlatformPayload>>`;
- accepts `RequestOptions` as its final argument;
- preserves timeout, cancellation, API-version, metadata, and typed errors;
- encodes every path segment with `encodeURIComponent`;
- sends only contract-defined query fields;
- retries unsafe requests only when the caller supplies an idempotency key.

Shared private helpers may consolidate repeated campaign action paths, but no
generic public `action(name)` method is exposed.

## Coverage ledger

The 27 included operations move from `missing` to `covered` with an exact
`PlatformClient.<resource>.<method>` mapping. The ten dashboard-only template
and flow operations move from `missing` to `excluded` with a credential-boundary
reason. Graph remains excluded.

Expected coverage after this milestone:

- total: 331
- covered: 59
- missing: 212
- excluded: 60
- changed: 0

Raw request access does not count as handwritten coverage.

## Tests

Tests use the existing real local HTTP server recorder and prove:

- exact HTTP method, encoded path, query string, and JSON body for all 27
  methods;
- request options and idempotency keys reach the shared transport;
- response metadata remains available;
- every new resource is exported from the package root and attached to
  `PlatformClient`;
- the ten dashboard-only operations are excluded rather than falsely mapped;
- the strict coverage checker reports the expected counts and zero changed
  fingerprints.

The full repository format, lint, typecheck, test, build, package, name, audit,
and coverage checks must pass on Node.js 20 and 22 before `dev` is pushed.

## Documentation and release boundary

Update the root README, TypeScript package README, and changelog with the new
resources and the dashboard-only template/flow boundary. Do not publish npm
packages, create a tag, update SDK `main`, or claim complete Platform parity.
