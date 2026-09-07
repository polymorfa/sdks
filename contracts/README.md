# Contract coverage

The snapshots are byte-identical copies of the Messaging and Platform OpenAPI
files at `polymorfa/polymorfa` commit
`3bf3a6ba3de8b19a547afd16fca1f3b368d7d4e7`. `source.json` records their original
paths and SHA-256 hashes. `coverage.json` uses the same source revision.

| Status              | Operations |
| ------------------- | ---------: |
| Covered             |        226 |
| Missing             |        103 |
| Excluded            |         73 |
| Partial             |          0 |
| Changed fingerprint |          0 |
| Total               |        402 |

Coverage spans the TypeScript server SDK, browser transport, and Calls package.
It does not claim coverage in other languages, package publication, or a
successful live call.

## Reconciliation

This snapshot adds 22 operations and removes 11 widget operations relative to
the previous snapshot. The added operations are five implemented Calls
operations, ten missing QuickLink operations, and seven Console-only
operations excluded by their credential contract.

`HttpCallsApi.place`, `accept`, `reject`, `addParticipant`, and `setMode` cover
the five Calls operations. Request tests invoke these methods and check the
HTTP method, encoded path, body, authentication, and response handling.

The removed widget rows included three covered mappings. Two pointed to
`PlatformClient.widgetSettings` methods that still request `/v1/widget`; one
pointed to `BrowserMessagingClient.widget.handoff`. None implements the new
QuickLink routes. The ledger removes those old rows and keeps QuickLink
missing.

All 93 existing missing entries remain missing. Of those, 38 had the stale
reason "Operation is absent from the coverage ledger" even though their rows
were already present. Their reasons now describe the missing methods. The
existing durable Platform gaps comprise 37 operations across organization and
project events, webhooks, deliveries, and operations; session start is the
other entry in that group of 38. Organization operation retrieval remains
covered by `PlatformClient.operations.retrieve`.

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
