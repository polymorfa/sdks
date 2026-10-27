# Native SDK publication setup

`.github/workflows/native-release.yml` prepares and publishes the native SDKs
from `main` only, by manual dispatch. Nothing in this repository has been
published by it yet. GitHub release environments and immutable Go tag protection
are configured. Registry trust policies and account access remain prerequisites.

## What the workflow does

1. **gate** requires the exact deployed API acceptance receipt for the channel
   (staging for nightly, production for stable), every feature contract pin,
   including frequency caps, segments/drips and client-token ceilings, reconciled with the
   release contract, and complete native coverage. It computes one version and
   writes `release-contract.json`, binding source SHA, fingerprint, API
   acceptance and every registry version form.
2. **pack** verifies each language, stamps the accepted version and receipt into
   build inputs (never committed to `main`), builds every public artifact and
   inspects it. The PHP job also prepares the Composer mirror tree from the
   inspected archive.
3. **plan** downloads every accepted pack, re-inspects it and writes
   `publish-plan.json`: 16 publications in dependency order, each with its
   artifact SHA-256 values.
4. One job per registry re-checks the plan against the downloaded receipt and
   artifacts before any effect. It refuses to overwrite an existing version with
   different contents, treats an existing identical version as done, stops
   dependents when a dependency is not confirmed, and re-reads the registry
   after an upload error instead of retrying.

| Registry  | Packages, in order                                                                                                                              | Job credential                                                            |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| crates.io | `polymorfa-storage-core`, then `polymorfa-sdk` and `polymorfa-storage-indexeddb`                                                                | Trusted publishing (`rust-lang/crates-io-auth-action`), `id-token: write` |
| NuGet     | `Polymorfa.Sdk`, `Polymorfa.Storage.Sql`, then `LibSql`, `EntityFrameworkCore`, `MongoDb`, `DynamoDb`, `Firestore`, `Cosmos`, `S3`, `IndexedDb` | Trusted publishing (`NuGet/login`), `id-token: write`                     |
| PyPI      | `polymorfa-sdk` wheel and sdist                                                                                                                 | Trusted publishing (`pypa/gh-action-pypi-publish`), `id-token: write`     |
| Go        | `github.com/polymorfa/sdks/packages/go` tag `packages/go/v<version>`                                                                            | `GITHUB_TOKEN` with `contents: write` in that job only                    |
| Packagist | `polymorfa/sdk` from a dedicated mirror repository                                                                                              | GitHub App token for the mirror repository only                           |

Internal packages build with one accepted version. Rust requirements are
`=<version>` with no path; NuGet sibling dependencies are emitted as
`<version>`, NuGet's inclusive minimum, which the resolver satisfies with that
exact version when it exists. Third-party pins keep their committed ranges.

Credentials reach registries only through environment variables and request
headers. The crates.io job uploads the exact accepted `.crate` bytes through the
registry publish API instead of `cargo publish`, which would repack them. NuGet
compares packages without the repository signature nuget.org adds.

### Go module release commit

Go has no upload registry. `scripts/go-release-tag.mjs` creates a commit whose
parent is the accepted `main` SHA and whose only changes are
`packages/go/transport.go` and `packages/go/calls_diagnostics.go` (the version
stamp) and `packages/go/release-contract.json`. It tags that commit, downloads
the module through the Go command from the local repository and checks that the
module zip contains the stamped version and receipt. It then pushes only the
tag. No branch is created or moved. An existing tag at a different commit is a
hard failure and is never moved; an existing tag at the same commit resumes.
Afterwards the job requires `proxy.golang.org` to serve the same `h1:` hash.

### PHP mirror

`scripts/php-mirror-publish.mjs` writes exactly the files of the inspected
archive (the mirror plan) into the mirror repository root, binds the commit
message to the accepted source and archive hashes, and fast-forwards `main`.
Stable releases also push the tag `v<version>`; nightlies are `dev-main`. It
never forces a branch or moves a tag, and it requires Packagist metadata to
reference the pushed commit.

## Publication prerequisites

Complete repository configuration through authorized GitHub access. Registry
account actions require access to the owning account; a repository permission
does not grant registry ownership.

1. **GitHub environments** in `polymorfa/sdks`: `native-sdk-nightly`
   and `native-sdk-stable` exist with only `main` allowed. No required reviewer
   was added. Manual dispatch and the exact acceptance gate control entry;
   registry trust must name the matching environment.
2. **Tag protection**: the active Go ruleset for `refs/tags/packages/go/v*`
   blocks updates and deletion without bypass actors.
3. **crates.io** (crate owner): crates.io trusted publishing cannot create a
   crate. Publish the first version of each of the three crates manually, in
   dependency order, using the accepted artifacts from a reviewed workflow run,
   with a short-lived token scoped to `publish-new` and revoked afterwards. Then
   add a trusted publisher for each crate: repository `polymorfa/sdks`, workflow
   `native-release.yml`, environment `native-sdk-nightly` and, separately,
   `native-sdk-stable`.
4. **NuGet** (nuget.org owner of the `Polymorfa.*` prefix): add a trusted
   publishing policy for owner `polymorfa`, repository `sdks`, workflow file
   `native-release.yml`, scoped to the ten package IDs including new-package
   publication. Set repository variable `NUGET_USER` to the nuget.org profile
   name. Consider reserving the `Polymorfa.` ID prefix.
5. **PyPI** (project owner): add a pending trusted publisher for project
   `polymorfa-sdk`, owner `polymorfa`, repository `sdks`, workflow
   `native-release.yml`, environment `native-sdk-nightly` (and a second for
   `native-sdk-stable`). A pending publisher creates the project on first
   upload; it does not reserve the name.
6. **PHP mirror** (organization owner and Packagist maintainer): the empty
   `polymorfa/sdk-php` repository exists, and `PHP_MIRROR_REPOSITORY` is
   `sdk-php`. Its `main` history and `v*` tags are protected against rewriting
   and deletion. Install a GitHub App with
   contents write on that repository only; store its client ID in variable
   `PHP_MIRROR_APP_CLIENT_ID` and private key in environment secret
   `PHP_MIRROR_APP_PRIVATE_KEY`. Submit the mirror to Packagist as
   `polymorfa/sdk` and enable the Packagist GitHub integration so pushes update
   it.
7. **API acceptance**: the gate reads the backend repository's
   `api-contract-acceptance.yml` artifacts through the existing
   `SDK_COVERAGE_CLIENT_ID` / `SDK_COVERAGE_APP_PRIVATE_KEY` app, which must be
   available to both environments.

## Verification without registries

`node --test scripts/native-publish.test.mjs` exercises planning, stale or
tampered receipts, dependency stops, resumption and overwrite refusal against
recording substitutes. A fixture run proves control flow only; it does not show
that any registry accepts the artifacts, and no package is published by it.
