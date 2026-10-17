# Signed v2 credential cutover preparation

This branch is a Phase 3 draft. Do not merge or publish it until the API and
deployment cutover is coordinated. The codec contract is pinned to Polymorfa
PR #638 at f72b09b4bc. Public API issuance still uses v1 before cutover.

TypeScript organization/project credential validation now accepts variable-length,
canonical base64url v2 shapes and rejects v1. This client-side shape check never
verifies signatures or grants authority. The API still verifies the signature,
key purpose/activation, environment, issuer/audience and live issuance record.
Client-token prefix checks are unchanged because the prefix remains pmfa_ct_.
Listener credentials remain limited to the listener protocol.

The browser, Calls and Next.js packages transport opaque client-token strings.
Their prefix checks remain valid for v2; no claim decoding or fixed-length client
check was found at baseline 2b28e8a30764fc3912a09cdd4e3d5b7122b0bbd1.
The baseline contains the TypeScript/browser packages, not the native-language
client sources; this inventory does not establish native-language parity.

The CLI at 16596a61373afbf1a96054e9b923c0bdb1dcbc73 delegates project validation
to this SDK in src/config/credentials.ts. Its release must pin an accepted,
published v2-capable SDK version after publication; a local workspace build is
not registry availability. No speculative unpublished dependency is introduced.

Validation: 1,534 tests passed on Node 24.15.0, including the clean package
consumer and opaque credential fixtures. Typecheck passed. Lint has zero errors
and two existing unused-disable warnings in packages/store. No live API call,
registry installation of this change, deployment or production acceptance ran.
The API, CLI dependency publication and public documentation remain coordinated
release gates. No Admin state/action, permissions, pricing, feature settings,
telemetry or entitlement behavior changes in this SDK draft.
