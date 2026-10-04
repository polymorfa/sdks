# Package releases from main

SDK PRs target `main`. The monorepo keeps its `dev` and `main` environments.
The preserved SDK `dev` branch is no longer a publication trigger.

The daily nightly runs at 02:00 UTC and publishes under npm's `dev` tag. It
skips a source fingerprint already published on that channel. Stable releases
use manual dispatch with an explicit `x.y.z` and the protected `npm-stable`
environment. The workflow filename remains `publish-dev.yml` to preserve the
existing trusted-publisher binding.

## Acceptance gates

Before packing, the workflow checks `contracts/source.json`, both local spec
hashes and `NATIVE_API_VERSION` against an API acceptance artifact from
`polymorfa/polymorfa`'s `api-contract-acceptance.yml` workflow. Nightlies require
staging acceptance from monorepo `dev`; stable releases require production
acceptance from monorepo `main`. A merged PR, passing build or healthy container
cannot substitute for authenticated route acceptance.

The artifact must bind the exact API commit, contract date, hashes, successful
scenarios, deployed commit and trusted workflow run. Missing, expired or
mismatched evidence blocks publication. A historical source pin without this
evidence stays blocked until the contract is deliberately reconciled and
accepted. Repinning alone does not establish SDK coverage.

`Polymorfa-Version` advances for each published API contract batch. Nightly
package timestamps do not change that date. Compatibility notes, upgrade
instructions and customer changelogs belong to the corresponding contract
release and its actual availability.

## Packages and provenance

Public workspaces publish in dependency order at one exact version. Private
`@polymorfa/calls` continues to ship inside `@polymorfa/sdk/calls`. Internal
package dependencies and peer dependencies pin the same exact version.

Every tarball contains `dist/release-contract.json` with the SDK source commit,
source fingerprint and matching API acceptance receipt. The CLI uses this file
to pin an accepted SDK version. A retry verifies registry integrity before
accepting an existing version; conflicting contents fail. Publication receipts
also include feature-to-Linear stage events for a later posting bot. The bot
must deduplicate event IDs and must not infer production availability from a
nightly or source merge.

Nightlies use `<base>-dev.<UTC YYYYMMDDHHmmss>`; stable packages use the requested
`x.y.z`. Install `@polymorfa/sdk@dev` for the latest accepted nightly or pin an
exact version for reproducible builds. Stable packages use `latest`.

## Operator configuration

- Keep the existing `npm-dev` trusted publishers for `publish-dev.yml`.
- Configure the same workflow for `npm-stable`, with release approval and
  branch protection restricted to `main`. An `NPM_TOKEN` fallback is optional.
- The existing SDK coverage GitHub App needs Contents and Actions read access
  to `polymorfa/polymorfa` for private acceptance artifacts. Set its existing
  `SDK_COVERAGE_CLIENT_ID` and `SDK_COVERAGE_APP_PRIVATE_KEY` in the SDK repo.
- API staging and production acceptance each require their own dedicated API
  fixture key and deployed application identity; see the monorepo release
  catalog. No fixture or provider credential belongs in a receipt or tarball.
- Linear coverage uses `LINEAR_API_KEY` and the existing team's `LINEAR_TEAM_ID`.
  Without these, the coverage report is saved and tracker reconciliation reports
  a blocker. It does not create substitute GitHub issues or close feature tickets.

The feature registry in the monorepo links Notion definitions to specific
Linear identifiers. Add existing identifiers after reconciliation; do not invent
new tickets when the tracker cannot be read. Coverage synchronization saves
feature-to-ticket mappings as a workflow artifact for the cycle coordinator.

## Local verification

Use a disposable worktree under `~/.polymorfa-agent-work/`. Run `npm ci`, the CI
checks, `node --test scripts/release-gate.test.mjs scripts/sync-linear-coverage.test.mjs`
and `npm run build:workspaces`. Packing additionally requires a verified
`--provenance` file and edits package manifests and compiled version constants
in that disposable checkout. Local packing is not registry publication or
hosted API acceptance.

Roll back an unusable package channel to a previously verified version through
an authorized release action. Never overwrite a published version or roll back
applied API migrations. API, SDK and CLI rollback decisions must use the same
contract and availability evidence.
