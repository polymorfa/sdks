# Test-event fixture correction

Local source repair based on SDK `8392f66b4df0b0fee3403e27e3d2914516b0e243`.
API source is `63111fec728ac3ebc9a825ea57ebc4c592abdafc`; its exact test-event
schemas and source hash are in `contracts/testing-events.json`. The full API
snapshots and coverage ledger retain their separately recorded revision.

The exported fixture list gains `session.restriction_updated`; its overrides
gain `restrictionActive?: boolean`. `callEndReason` also gains the existing
API value `call_restricted`. HTTP paths, serialization, credentials, and
retry behavior are unchanged. Tests compare the fixture catalog against the
API snapshot and serialize both boolean values and the restriction call
outcome through `MessagingClient.testing.triggerEvent`.

This fixes CLI #15's use of an SDK catalog that rejects a fixture returned by
the server. The companion CLI branch `fix/trigger-fixture-contract-20260922`
also types `restrictionActive` in its override parser. Its released SDK pin
must only change after this SDK is published and the package contents are
verified. A locally packed `0.1.0-dev.0` artifact is validation evidence, not
a release version or publication claim.

| Part             | State                                         | Reason                                                                                                                                                                                                 |
| ---------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| API              | Unaffected                                    | Existing fixture schemas at the pinned revision; no request or authority change.                                                                                                                       |
| SDKs             | Updated locally                               | TypeScript fixture catalog and request types, API snapshot, serializer and catalog checks. Browser/UI packages do not expose this server-only testing client. No other-language SDK parity is claimed. |
| CLI              | Blocked on SDK publication                    | Companion parser/tests exist; exact published dependency and lockfile still need updating.                                                                                                             |
| Docs             | Updated locally                               | TypeScript README explains restriction fixtures. Existing Mintlify test-event guide already documents the API behavior. No customer changelog is added before package availability.                    |
| Feature releases | Unaffected authority; availability unverified | Existing Test numbers beta gate, enrollment and operational disable remain enforced by API. This SDK method grants no access.                                                                          |
| Admin            | Unaffected                                    | No new state, configuration, entitlement, or staff action. Generated events use existing webhook and event-history controls.                                                                           |

Finish by publishing the SDK through the authorized release process, verifying
its built catalog and types, updating the CLI pin, and repeating CLI checks
with the registry artifact. Live trigger/webhook/listener behavior still needs
an enrolled Test-number project in a configured environment. The later
declared-event retirement must update its own pinned contract and consumers;
the two BanSafe fixtures remain valid at this repair's API revision.
