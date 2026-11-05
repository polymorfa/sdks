# Simultaneous calls

## Simultaneous calls source preparation

This counterpart is prepared against API #559 merge `c1a43a1e`. It is not a
registry availability claim. Use the HTTP API until a matching SDK release is
published and accepted against the target environment.

Call-settings reads expose `simultaneousCalls`, default false. Updates accept
`simultaneousCalls` and `acknowledgeRisk`. Omission preserves stored state;
explicit false disables the setting. Acknowledgment alone changes no setting
and is rejected. The API requires a team key and `acknowledgeRisk: true` for an
off-to-on transition. Project tokens may disable it. The SDK forwards values
without guessing the stored state. Existing `invalid_parameter`,
`permission_denied` and `state_conflict` errors remain authoritative.

The setting affects linked-device Numbers. Cloud API Numbers ignore it.
Unlimited concurrent calls differ from WhatsApp's apps and void Ban Insurance
when the 30-day claim window overlaps an enabled period. Claim verdicts and
`bansafe.claim` webhook verdicts recognize `simultaneous_calls`. Claim evidence
includes `simultaneousCalls`; the webhook does not acquire an evidence object.

No browser/client-token authority, call media behavior, automatic state read,
retry policy or feature availability is added by these SDK fields.
