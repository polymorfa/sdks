# Native SDK release procedure

The native SDKs are development source packages. No native registry package, Go
release tag, Composer source mirror or release deployment is created by this
change. `native-release.yml` prepares accepted artifacts and does not publish.

## Release gates

Run the workflow from reviewed `main`, with an exact `x.y.z` for stable or an
empty version for nightly. Configure the `native-sdk-stable` and
`native-sdk-nightly` environments with release reviewers before dispatching.
Both use the existing read-only SDK coverage GitHub App to retrieve the API
acceptance receipt. Staging acceptance is required for nightly; production
acceptance is required for stable. The receipt must match the API source SHA,
contract hashes, version, deployment and passing scenarios. Source merge,
health checks and local fixture tests cannot replace it.

The gate verifies every primary TypeScript covered operation in every native
language, checks the full snapshot hashes and reconciles feature supplement
pins. An older full contract with a newer supplement fails closed. This branch
retains its existing contract pins; a publication hold requires a separately
reviewed reconciliation and matching deployed acceptance. Do not edit pins just
to make the gate pass.

The pack jobs run baseline format, type, test, example and build checks; stamp a
single accepted version into package metadata and user-agent constants; embed
`release-contract.json`; then rebuild native distribution artifacts. Python uses
PEP 440 `.dev<timestamp>` while the other packages use
`-dev.<timestamp>`. The workflow uploads packages and source archives for review.
It has no registry credentials or write permission.

## Publication ownership

| Destination | Prepared identity                       | Release authority still required                                                              |
| ----------- | --------------------------------------- | --------------------------------------------------------------------------------------------- |
| PyPI        | `polymorfa-sdk`                         | Project ownership and a project-scoped token or trusted publisher                             |
| crates.io   | `polymorfa-sdk`                         | Crate ownership and a publish credential                                                      |
| NuGet       | `Polymorfa.Sdk`                         | Package ownership and a package-scoped API key                                                |
| Packagist   | `polymorfa/sdk`                         | A dedicated PHP source repository, its push authority, and the Packagist registration/webhook |
| Go module   | `github.com/polymorfa/sdks/packages/go` | Reviewed version/source commit and permission to create `packages/go/v<version>`              |

The presence, validity and exercised status of publication credentials have not
been checked. The preparation workflow does not need them. Configure registry
credentials in the matching protected release environment, never in source or
an artifact. Packagist requires `composer.json` at the source repository root;
`packages/php` needs an approved mirror. A tag on the monorepo alone cannot
publish that Composer package. See the [Packagist guide](https://packagist.org/about)
and [Go module source guide](https://go.dev/doc/modules/managing-source).

After explicit release authorization, download and inspect the accepted
artifacts. Verify package metadata and the embedded receipt against the exact
reviewed source. Do not rebuild with different source during publication.
Python uploads the accepted wheel and sdist with `python -m twine upload`;
NuGet uses `dotnet nuget push`; Rust uses `cargo publish` from the corresponding
accepted, version-stamped source. Go and Composer require reviewed source
commits/tags, with matching provenance; the preparation workflow does not create
or push them. Registry duplicate versions require checking existing artifact
integrity, not a blind skip. Save publication receipts and verify a fresh install
against the exact published version before announcing availability.

## Customer documentation

Publication must include the matching Mintlify language guides, overview,
navigation and a dated shipped changelog entry in `polymorfa/polymorfa`. Source
examples in this SDK repository describe development use. Do not advertise a
registry install until the package and its release eligibility are verified.
Signal remains owned by the Signal thread. Unmerged direct media, direct history
and storage implementations remain separate dependencies; no SDK release may
claim those surfaces from this implementation.
