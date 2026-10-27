# Shared server SDK fixtures

`behavior.json` contains handwritten wire scenarios reviewed against the
TypeScript transport and webhook tests at SDK commit
`ff51567105b64bf6997e7330ba8eb502d875e7b9`. OpenAPI does not generate these
fixtures or runtime source.

Start `node scripts/sdk-fixture-server.mjs --port 0`. The first output line
contains the loopback URL. Set the per-request header
`x-polymorfa-fixture: <scenario-id>` to select the expected wire scenario.
Alternatively, start with `--scenario <scenario-id>` and use the normal
loopback base URL with no selection header. Client URL resolution remains
unchanged. Each scenario owns its request counter, so languages can share one process.
Reset with `POST /__fixtures/<scenario-id>/reset`. Inspect counters and
redacted mismatches with `GET /__fixtures/<scenario-id>/state`.

Tests must invoke the public client method, assert the decoded result or typed
error and metadata, then assert the expected attempt count and no mismatches.
Passing a route manifest alone is not coverage. Operation-specific tests live
with each handwritten client and supplement these transport scenarios.

Native webhooks sign only the exact raw body with HMAC-SHA256. They do not
have timestamps or intrinsic replay prevention; applications deduplicate the
verified event ID. Local-forward signatures use their separate timestamped
protocol. The webhook cases explicitly distinguish the two.

All credentials and webhook secrets in this directory are synthetic fixtures.
Never use them against a real environment.
