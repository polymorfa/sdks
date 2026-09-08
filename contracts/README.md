# Contract coverage

The snapshots are byte-identical copies of the Messaging and Platform OpenAPI
files at `polymorfa/polymorfa` commit
`6918c56135e28ba64557e344cb72889f1f517eb5`. `source.json` records their original
paths and SHA-256 hashes. `coverage.json` uses the same source revision.

| Status              | Operations |
| ------------------- | ---------: |
| Covered             |        271 |
| Missing             |          0 |
| Excluded            |        131 |
| Partial             |          0 |
| Changed fingerprint |          0 |
| Total               |        402 |

Coverage spans the TypeScript server SDK, browser transport, and Calls package.
It does not claim coverage in other languages, package publication, or a
successful live call.

## Reconciliation

This refresh adds and removes no operations. Two Messaging operation
fingerprints changed: browser candidate retrieval remains excluded from the
server SDK, and `MessagingClient.voip.agentToken` remains covered by its typed
method and request test. Schema updates include literal webhook event names,
nullable terminal-call callers, participant lifecycle events, client-token
delegation scopes, and TURN health diagnostics. These changes do not alter the
operation coverage totals or the existing missing-operation inventory.

This snapshot records complete handwritten TypeScript coverage for every
customer-credential-compatible operation in the pinned contracts. Routes that
require console, staff, browser, or ephemeral QuickLink credentials are
excluded with an operation-specific reason.

`HttpCallsApi.place`, `accept`, `reject`, `addParticipant`, and `setMode` cover
the five Calls operations. Request tests invoke these methods and check the
HTTP method, encoded path, body, authentication, and response handling.

The unified `Client` owns organization control-plane resources and creates
immutable project views with `client.project(projectId)`. QuickLink management
uses `Client.quickLinkSettings`; obsolete `/v1/widget` mappings are gone.
Credential-free service probes use `SystemClient`, project-token Bridge route
discovery uses `BridgeClient`, and listener transport remains CLI-only.

## Updating the ledger

1. Select one exact merged source commit on the matching branch. Copy both
   authoritative OpenAPI files without editing or formatting them.
2. Run `scripts/check-coverage.mjs` against the new files and the existing
   ledger without `--strict` to inspect gaps and removed operations. Determine
   absent rows by their family, HTTP method, and path; an old reason string is
   not evidence that a row is absent.
3. Inspect the real SDK transport before assigning coverage. A renamed API
   route does not inherit coverage from a method that still calls its old
   path. Keep unimplemented methods missing and explain credential-based
   exclusions. Raw requests do not count as typed methods.
4. Update the ledger, source revision, hashes, and mapping tests together.
   Remove obsolete rows after reviewing their replacements.
5. Run the full SDK CI checks. The repository coverage tests require the
   reviewed counts, zero changed fingerprints, valid public method mappings,
   and source snapshot integrity.

`npm run check:coverage` uses the checked-in snapshots. Its strict flag requires
a ledger row for every operation; it does not require every row to be covered.
The cross-repository workflow compares an exact source revision and reports
missing or changed contracts for follow-up. Its dedicated GitHub App must have
access to read SDK contents and write coverage issues. A token-creation failure
occurs before comparison and says nothing about SDK parity.
