# Signed v2 credential cutover preparation

This branch is a Phase 3 draft. Do not merge or publish it until the API and
deployment cutover is coordinated. The codec contract is pinned to Polymorfa
PR #638 at 47d34d0a1fe29579611b3296ca61ab2bd5eefcf9. Public API issuance still uses v1 before cutover.

TypeScript organization/project credential validation now accepts variable-length,
canonical base64url v2 shapes and rejects v1. This client-side shape check never
verifies signatures or grants authority. The API still verifies the signature,
key purpose/activation, environment, issuer/audience and live issuance record.
Client-token prefix checks are unchanged because the prefix remains pmfa_ct_.
Listener credentials remain limited to the listener protocol.

The browser, Calls and Next.js packages transport opaque client-token strings.
Their prefix checks remain valid for v2; no claim decoding or fixed-length client
check was found at baseline 2b28e8a30764fc3912a09cdd4e3d5b7122b0bbd1.
The native source baseline is SDK PR #348 at
0822c934f25e0a8fa70ae4a799344ccb54f215bb. This draft is stacked on that
unmerged branch and must wait for it. Go, Python, PHP, Rust and C# contained
fixed v1 validators; each now validates bounded canonical v2 framing, with
public org/project golden tokens and explicit v1/padding/size rejection tests.
Their client-token prefix checks remain unchanged. No native verifier or
private signing key is distributed to SDK customers.

The CLI at 16596a61373afbf1a96054e9b923c0bdb1dcbc73 delegates project validation
to this SDK in src/config/credentials.ts. Its release must pin an accepted,
published v2-capable SDK version after publication; a local workspace build is
not registry availability. No speculative unpublished dependency is introduced.

Validation: 1,534 tests passed on Node 24.15.0, including the clean package
consumer and opaque credential fixtures. Typecheck passed. Lint has zero errors
and two existing unused-disable warnings in packages/store. No live API call,
registry installation of this change, deployment or production acceptance ran.
Native validation: Go `go test -p 2 ./...` passed; Python 1,643 passed and
30 optional integration tests skipped; Rust default-feature tests and doctests
passed; C# signed-v2 golden/rejection checks and the core native transport
suites passed. The full C# harness stopped at its prebuilt Blazor/ASP.NET example
prerequisite; no native desktop/browser host acceptance is claimed. PHP 8.2 native transport, crypto/history and portable storage tests passed; optional external provider integrations were skipped.

The API, CLI dependency publication and public documentation remain coordinated
release gates. No Admin state/action, permissions, pricing, feature settings,
telemetry or entitlement behavior changes in this SDK draft.
