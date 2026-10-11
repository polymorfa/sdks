# Native server SDK development

The Go, Python, PHP, Rust and .NET packages are handwritten development
implementations. They are not registry releases. Each package documents its
tested resources and remaining gaps. Do not infer full parity, live API
availability or enrollment from an installed client.

The implementation reference is the TypeScript server SDK at
`ff51567105b64bf6997e7330ba8eb502d875e7b9`. The full Messaging and Platform
snapshots remain pinned to API source
`171a9683ff45d11a4b5d3917dc428ad2722b0d99`; supplements keep their exact
recorded revisions. No global contract repin is part of this change.

| Language | Source            | Intended package                        | Baseline    |
| -------- | ----------------- | --------------------------------------- | ----------- |
| Go       | `packages/go`     | `github.com/polymorfa/sdks/packages/go` | Go 1.24     |
| Python   | `packages/python` | `polymorfa-sdk`, import `polymorfa`     | Python 3.10 |
| PHP      | `packages/php`    | `polymorfa/sdk`                         | PHP 8.2     |
| Rust     | `packages/rust`   | `polymorfa-sdk`                         | Rust 1.85   |
| C#       | `packages/dotnet` | `Polymorfa.Sdk`                         | .NET 8      |

Go's module path follows the actual repository subdirectory. The original
design's `github.com/polymorfa/sdks/go` would resolve source from a different
directory. Go version tags must use `packages/go/v<version>`, as described in
the [Go module source guide](https://go.dev/doc/modules/managing-source).

Run `node scripts/verify-native-sdk.mjs <language>` from the repository root.
Native tools must be installed. The native CI matrix verifies each baseline
and a newer runtime and builds package artifacts. This workflow has no registry
publication step or publication credentials.

## Contract and coverage evidence

The schema-version-2 ledger declares all six server SDK languages. Each
operation has a mapping for each language. `missing` and `partial` require a
reason and milestone; `covered` requires a public method. The checker keeps
per-language gaps visible even when TypeScript covers the same operation.
Tracker reports include the affected-language matrix.

Each native package's tests must resolve its public methods and exercise the
request, response, errors and metadata. Shared behavior fixtures and the
loopback mock server are described in
[`contracts/fixtures/README.md`](../contracts/fixtures/README.md).
Raw requests, method manifests and ledger counts do not prove typed parity.
Retain explicit gaps until native tests pass.

## Ownership and availability

Signal integration is owned by the Signal thread. Direct media, direct
history and self-hosted storage depend on their merged TypeScript references
and matching backend contracts. This work does not edit those branches or
define a second protocol.

The SDKs add no feature evaluator, entitlement, enrollment or admin control.
The API remains the authority for scopes, customer membership, release
eligibility and paid capabilities. An SDK method does not grant access.

## Release preparation

Prepare PyPI wheels/sdists, crates.io crates, NuGet packages, Composer archives
and Go module source tags through native tools. Before publication, verify
full claimed coverage, package contents, baseline runtimes and the same API
acceptance receipt used by the npm release gate. Nightlies require staging
acceptance; stable releases require production acceptance. Registry ownership
and release credentials must be configured separately.

Publication, tags and releases require an explicit release instruction.
Do not add a release changelog or public Mintlify installation guide until the
package exists for the stated audience. Language documentation in this repo
describes source development; the release checklist must publish the matching
Mintlify guides and navigation with the packages.
