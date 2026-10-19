# Documentation snippets

`doc-snippets.json` contains self-contained server programs checked against the
public package surface. Its schema is `doc-snippets.schema.json`. Consumers pin
the **export commit** containing this file. `sourceCommit` identifies the exact
SDK source compiled, which can precede the export commit. `sourceFilesSha256`
binds the tracked package and contract inputs to that source revision, so a
later tooling or documentation commit does not create a self-reference.

The current source includes main's separately pinned webhook phone-offline
supplement. The baseline stays at `Polymorfa-Version: 2026-09-22`, with API source
`171a9683ff45d11a4b5d3917dc428ad2722b0d99` and the two hashes in `specs`.
Separately pinned supplements retain their own versions. The generator rejects
changed source files, coverage pins and OpenAPI snapshots until the source is
rebound and the catalog is verified again.

## Consumption

Read `operations[operationId][language].code`. Each available entry is a complete
program making one public SDK call. Missing operation or language means use the
page's cURL example. Never synthesize a call from `coverage.json` method labels.
Match the catalog's API version, API source and specification hashes to the API
reference being rendered. A newer or mismatched page uses cURL, even if its
operation ID has the same spelling. Do not rewrite an older SDK call to fit it.

Replace `{{POLYMORFA_API_KEY}}` with a credential of the explicit
`credentialKind`. These recipes use an **organization API key** and the matching
client principal. A project Test key does not authorize organization operations.
The docs renderer owns key selection and retrieval; this catalog never retrieves,
stores or logs a reader's key. It must escape substituted values as string
literals in the selected language. Plain text replacement of untrusted values is
unsafe, particularly for PHP dollar interpolation and quote/backslash handling.

Every spec path parameter appears under its exact name, such as `{{session}}`,
`{{sessionId}}`, `{{projectId}}`, `{{operationId}}` and `{{collectionId}}`.
Preserve their names when consuming the artifact. Non-path request values are
synthetic examples: replace the send recipient `+15550001111`, message IDs,
business ID `42` and product IDs with values authorized for the intended request.
The `request` metadata records the minimal body and required query used by the
recipe. Its schemas and union branches are validated against the pinned OpenAPI.
No optional request fields are included in this initial catalog.

There are **31 operations per language**, 186 complete programs. Each language's
coverage ledger contains 442 covered operations, leaving **411 omitted per
language**. The initial recipes cover text sends, message actions, session
lifecycle, business profiles/catalogs/collections and project event listing.
The remaining operations have no verified recipe in this catalog and retain
cURL fallback. Coverage of a method does not imply a verified documentation
program for it.

## Runtime and dependencies

These are server programs. The same runtime boundaries as the existing SDK CI
apply. Source checks use local artifacts; these instructions do not claim the
packages are available from registries.

| Language   | Program setup                                                                                                                                                                      |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript | Node 20 or 22, TypeScript with strict NodeNext modules, `@types/node`, `@polymorfa/sdk`; save as `.ts` in an ESM project.                                                          |
| Go         | Go 1.24 or 1.25, module `github.com/polymorfa/sdks/packages/go`; save as `main.go`. The Go module has no manifest version; releases use `packages/go/v<version>` tags.             |
| Python     | Python 3.10 or 3.13, `polymorfa-sdk`; save as `.py`. The program uses `asyncio` and closes the owned client with an async context manager.                                         |
| PHP        | PHP 8.2 or 8.4 with the SDK's required extensions, Composer autoloading for `polymorfa/sdk`; save beside `vendor/`. PHPStan verifies exported programs at its maximum level.       |
| .NET       | .NET 8 or 10 SDK, a `net8.0` executable project referencing `Polymorfa.Sdk`, nullable checks and warnings as errors. The program disposes its client.                              |
| Rust       | Rust 1.85 or stable, edition 2021, `polymorfa-sdk` plus `tokio` 1 with `rt` and `macros`; save as `src/main.rs`. The current-thread runtime and owned clients drop at program end. |

TypeScript uses the runtime's fetch transport; Go's buffered request helper owns
and closes each response body. PHP uses its synchronous owned transport. The
programs neither borrow caller-owned streaming bodies nor require a manual
transport close.

`packages` records source names and versions. `releaseStatus: "source-only"`
means **no `install` field is emitted**. PHP's source transport version is
`0.1.0-dev.0`, which is not a Composer release constraint. The local archive
consumer uses the explicitly local `dev-doc-snippets` alias. It is not an
installation instruction or a registry version. Python retains its PEP 440
`0.1.0.dev0` spelling. Future released catalogs need accepted publication receipts
for the exact SDK source, exact published ecosystem versions and clean registry
installation proof before adding customer installation commands. Existing API
acceptance and release-contract gates still apply.

## Maintenance and checks

Recipes are handwritten under `scripts/doc-snippets/`, grounded in public
signatures and existing wire tests. `recipes.mjs` defines the OpenAPI-validated
request; language modules supply explicit calls and complete program wrappers.
There is no method-label argument inference and no raw-request fallback.

After changing SDK signatures, request serialization, public exports, package
versions, coverage or contract inputs:

1. Inspect every affected native public method and its wire fixtures. Update its
   explicit language recipe, or remove it until it can be verified.
2. Commit the SDK/package inputs, then bind `sourceCommit` to that exact source
   commit. Merge current `main` first when it adds package/contract inputs that
   the PR's actual merge tree will compile. Keep the API baseline and supplement
   pins separate. Do not advance versions to make a check pass.
3. Run `npm run generate:doc-snippets`, `npm run check:doc-snippets` and
   `npm run test:doc-snippets`.
4. In order, run `npm run verify:doc-snippets -- <language> --negative-test` for
   `typescript`, `go`, `python`, `php`, `dotnet`, `rust`. Set
   `SDK_PYTHON_VERSION` to the Python runtime under test when needed.
5. Commit the verified export and pin consumers to that export commit. State
   counts, omissions and source/publication status at handoff.

The verifier materializes the **actual exported JSON code**, substitutes safe
synthetic values, and runs `tsc`, `go vet`, strict `mypy`, `php -l` plus PHPStan,
`dotnet build` and `cargo check`. It never runs the programs or sends API calls.
Every emitted program is checked; any failure fails the command and CI.
`--negative-test` replaces the exported send call with a nonexistent public
method and requires the real checker to reject it. Structural tests reject bad
placeholders, uncovered operations, invalid/missing body and queries, invalid
unions, stale SDK/API/spec provenance and unpublished install commands.

TypeScript consumes an npm tarball, Go an extracted exact-source module with
`GOWORK=off`, Python an installed wheel, PHP a copied package archive through
Composer, .NET a local NuGet package, and Rust packaged SDK/core crates. The Rust
unpublished storage-core dependency is patched to the packaged local core,
matching existing package verification. This does not prove registry resolution.
Check artifacts stay under `~/.polymorfa-agent-work/sdk-doc-snippets-20261019/checks/`.
CI fetches history so `sourceCommit` exists and verifies the actual merge tree
against it. A later main change to bound inputs correctly requires rebinding
and rerunning verification.
