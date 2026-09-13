# Contract coverage

The snapshots are byte-identical copies from `polymorfa/polymorfa` commit
`b61d3198aa242d8cba5705e468d2845dc826bf5b`. `source.json` records paths and hashes.

| Status              | Operations |
| ------------------- | ---------: |
| Covered             |        114 |
| Partial             |        159 |
| Missing             |         39 |
| Excluded            |        144 |
| Changed fingerprint |          0 |
| Total               |        456 |

This is a refreshed inventory, not full SDK parity. `cloud-reconciliation.json`
records each operation's prior path, current status and evidence. Partial rows
retain existing methods whose changed request identity or response contracts
remain unverified. Missing rows have no reviewed typed implementation. Exclusions
name credential boundaries; Graph remains outside this ledger's two API families.

The Cloud/QuickLink update verifies saved settings, Customers, invitations and
`MessagingClient.cloudOnboarding.advance`. Calls and browser messaging use the
`/messaging` prefix. Integrator-owned `/api/polymorfa` routes remain unchanged.
The retired, unpublished browser widget handoff method and type were removed.
It has no equivalent in this contract; hosted QuickLink onboarding is separate.

The one-time migration is reproducible from the preceding ledger with
`node scripts/reconcile-cloud-contracts.mjs <api-repository> b61d3198aa242d8cba5705e468d2845dc826bf5b`.
It refuses another source revision and is idempotent after migration. Shape-only
path relocation does not establish runtime coverage; the affected route consumers
and request tests are updated together.

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
