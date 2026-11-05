# Campaign webhook metadata (unreleased source)

This source supplement consumes accepted API source
`9bb1e2ed92d8b4a07ff727f8e7ae185498f0868f`, containing the original API326 pause
producer. It does not change the baseline API date `2026-09-22` or baseline
snapshots. Source acceptance does not establish publication or environment availability.

| Event                        | Optional field   | Contract                                                            | Timestamp unit                 |
| ---------------------------- | ---------------- | ------------------------------------------------------------------- | ------------------------------ |
| `campaign.paused`            | `reason`, `code` | Strings when present, automatic pauses only; future codes stay open | `pausedAt`: Unix seconds       |
| `campaign.recipient_skipped` | `messageIndex`   | Integer >= 0; zero is meaningful                                    | `skippedAt`: Unix milliseconds |
| `campaign.recipient_skipped` | `followUpId`     | UUID string identifying a capped follow-up                          | `skippedAt`: Unix milliseconds |

A manual pause carries neither reason nor code. Skips without sequence or
follow-up metadata omit those fields. Frequency-cap skips can name a sequence
position and a receipt-timed follow-up. Reasons include `frequency_cap_exceeded`
and `whatsapp_marketing_limit`, but consumers must retain unknown future strings.
The required event fields are unchanged. Do not convert timestamps or treat zero
as absence. Ordinary Campaign `pauseReason` is a different field.

All six SDKs expose this metadata through their existing public webhook types.
Go typed projections use optional pointers; Rust uses `Option`; C# uses optional
properties. Python and PHP retain raw payload dictionaries/arrays, and TypeScript
retains raw payload objects. The existing language-specific parser tolerance and
malformed-type policy remain unchanged; the API's optional non-null contract is
not a new blanket SDK validator. Raw envelopes retain future keys even when a
typed projection omits an unknown key. Verify the exact whole body before parsing
any single event or batch member; preserve member order and deduplicate event IDs.

## Source compatibility

C# keeps the existing four-position pause constructor/Deconstruct and five-position
skip constructor/Deconstruct. New optional init properties serialize sparsely.
Rust adds public optional struct fields. Consumers that construct these payloads
with full struct literals must add `reason: None`, `code: None`, or
`message_index: None`, `follow_up_id: None` as appropriate. Existing serialized
payloads without those fields remain decodable. Go unkeyed public struct literals
also need an update; prefer keyed construction. No transport/retry/error code,
security/runtime floor, credential, pause-control, entitlement or feature flag changes.

## Source and validation evidence

`contracts/campaign-paused-reasons.json` pins the exact two accepted schema
fragments and Messaging spec SHA256. The original API326 skip snapshot is not
claimed equivalent to accepted9bb: the accepted sequence and follow-up fields are
included. `contracts/fixtures/campaign-webhook-metadata.json` supplies synthetic
automatic/manual/sequence/follow-up/future-code payloads to default native tests.
Package READMEs show per-language verified-event handling fragments. These are
source-only examples; no registry install command or provider call is claimed.

Fresh exact-source hosted checks, physical consumers, package publication and
matching API environment acceptance remain separate release gates. Public Docs,
CLI and Console must adopt an actual accepted published version before claiming
availability. No customer-facing Docs release is performed by this SDK change.
