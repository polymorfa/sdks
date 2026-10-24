# Direct server passkey relay (unreleased)

Use server credentials with `sessions:manage` for every operation, including reads.
The API also checks live Number ownership, direct-pairing access, relay enrollment
and the current attempt. These methods accept ceremony data supplied by an
external participant. They do not run WebAuthn, store credentials, poll, or confirm
a pairing automatically. Hosted QuickLink and extension relay endpoints are excluded.

Challenge TTL uses seconds; ceremony `timeoutMs` uses milliseconds. The server
owns ceremony options and ignores the deprecated `userVerification` and
`timeoutMs` request fields. An optional expected `challengeB64Url` must match the
current attempt. Keep `rawIdB64Url` and the named `*B64` assertion strings unchanged;
do not convert between base64 and base64url. Omit optional fields when absent.

Challenge issuance, assertion submission and explicit confirmation each make one
attempt, even with caller retry options or an idempotency key. If the outcome is
uncertain, read current challenge/confirmation state and reconcile it before a new
write. Assertion acceptance is not pairing completion. Forwarded API failures keep
their status and open error code; the SDK does not invent passkey error codes.

The whole JSON body is limited to 1 MiB. Credential ID strings allow 1364 UTF-16
units and optional user handles allow 86. Other opaque assertion fields share the
body limit. The API validates encodings, decoded bounds and challenge binding.

The matching API source is accepted. Package qualification and publication are
still required before using a released package.

| Operation              | TypeScript               | Go                         | Python                    | PHP                       | Rust                        | .NET                          |
| ---------------------- | ------------------------ | -------------------------- | ------------------------- | ------------------------- | --------------------------- | ----------------------------- |
| issuePasskeyChallenge  | passkeys.issueChallenge  | Passkeys().IssueChallenge  | passkeys.issue_challenge  | passkeys->issueChallenge  | passkeys().issue_challenge  | Passkeys.IssueChallengeAsync  |
| getPasskeyChallenge    | passkeys.getChallenge    | Passkeys().GetChallenge    | passkeys.get_challenge    | passkeys->getChallenge    | passkeys().get_challenge    | Passkeys.GetChallengeAsync    |
| submitPasskeyAssertion | passkeys.submitAssertion | Passkeys().SubmitAssertion | passkeys.submit_assertion | passkeys->submitAssertion | passkeys().submit_assertion | Passkeys.SubmitAssertionAsync |
| getPasskeyConfirmation | passkeys.getConfirmation | Passkeys().GetConfirmation | passkeys.get_confirmation | passkeys->getConfirmation | passkeys().get_confirmation | Passkeys.GetConfirmationAsync |
| confirmPasskey         | passkeys.confirm         | Passkeys().Confirm         | passkeys.confirm          | passkeys->confirm         | passkeys().confirm          | Passkeys.ConfirmAsync         |

Confirmation states are `none`, `challenge_pending`, `assertion_sending`,
`assertion_submitted`, `code_available`, `confirmation_sending`,
`waiting_for_pairing`, `completed` and `failed`. Optional code, ticket, handoff and
error fields retain their presence. A missing code does not authorize confirmation.

New Rust request structs use optional fields or `Default` where applicable; public
struct literals must name their fields. These additions do not change existing
Calls struct shapes. New .NET records leave existing constructors and Deconstruct
methods unchanged.
