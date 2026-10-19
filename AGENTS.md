# SDK maintenance guide

Start with `git status --short --branch` and preserve unrelated work. Inspect the
API contract, affected public SDK methods, callers, tests and existing PR before
editing. This repository's integration branch and PR base are `main`.

## A feature counterpart covers every supported SDK

When the user asks for an SDK counterpart to a feature, include TypeScript, Go,
Python, PHP, Rust and C# (.NET) in the same coordinated scope. Do not stop after
TypeScript or the language used by the first example. Implement sequentially in
dependency order unless the user explicitly authorizes another arrangement.

For each affected language:

- Update idiomatic public methods, typed requests/responses, validation,
  serialization, errors, pagination, webhooks/events and examples as applicable.
- Verify the same API source revision, credential boundaries, idempotency,
  cancellation and omission/null semantics through the language's native client.
  A raw request escape hatch or a TypeScript transport does not count as a native
  counterpart.
- Update `contracts/coverage.json` and the native package's `coverage.json` when
  the accepted contract changes. Keep separately pinned supplement inventories
  and their per-language wire evidence in sync. Do not mark unsupported methods
  covered or advance a release pin just to make a check pass.
- Run the affected language's `scripts/verify-native-sdk.mjs` workflow and the
  shared coverage checks. New or changed package surfaces also need a fresh
  physical-package consumer; source imports do not prove package contents.
- Update affected language documentation and examples in this cycle. Coordinate
  the customer docs and CLI against the same accepted dependency revision.

Track every language as implemented, explicitly excluded with contract/policy
reason, or blocked by a named dependency in the internal handoff. Browser-only
renderers and media are not automatically server-SDK features. Investigate that
boundary and record any exclusion. Do not call the counterpart complete while an
in-scope language remains unfinished, and do not silently defer it to a later
request. Fixes to an existing feature must revisit all six implementations.

Use `node scripts/check-native-coverage.mjs` and `npm run check:coverage` with the
matching contract revision. These check attribution and drift; passing them does
not replace native wire tests, package consumers or runtime acceptance. The API
drift workflow reports gaps; it does not generate or maintain handwritten SDKs.

## Public PR descriptions

Keep public SDK and CLI PR descriptions short. State the behavior, useful
verification and material release limitation. Link demos when relevant. Do not
paste feature-impact or no-impact tables, internal dependency inventories or
session transcripts into the description. Keep the detailed assessment in the
owning internal handoff and link the evidence when reviewers need it. Use the
small template in `.github/pull_request_template.md` for SDK PRs.

Do not request automated reviews. Verify unsolicited findings against the current
source before acting. Keep implementation, local verification, CI, merge,
registry publication, deployment and customer availability as separate facts.
Nightlies require matching staging API acceptance; stable releases require
matching production acceptance. Never publish or claim installability from a
local package build alone.

## Documentation snippet maintenance

Public signature, request, export, package or coverage changes must revisit
`contracts/doc-snippets.json` and its explicit recipes. Follow
`contracts/doc-snippets.md`: bind the exact SDK source and API/spec inputs,
regenerate, check every emitted program with its actual native checker, and
retain cURL fallback for missing or mismatched entries. Source/package builds
are not registry publication or API acceptance evidence.
