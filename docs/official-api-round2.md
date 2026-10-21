# Official API round-2 betas

These client additions prepare the six merged backend contracts in
`contracts/official-api-round2.json`. They do not establish a published package,
deployment or enabled audience. Use the matching accepted SDK prerelease after
publication. API contract dates are independent of package timestamps.

| Item  | TypeScript surface                                                                              | Scope                                                                                                                                                                                                                                                                                                                               |
| ----- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OA-03 | `quickLinks.retrieve`, `CloudReadinessFailureCode`, named send errors                           | Readiness is checked by the backend. `meta_readiness_unknown` stays pending until cancellation or expiry; it never proves readiness.                                                                                                                                                                                                |
| OA-16 | `catalogs.list/retrieve/sync/listProducts`, incoming `order` in webhook/history types           | Native Number routes, `business:read`, enrolled beta. Reads use the snapshot; sync explicitly reads Meta. Prices remain provider values. An invalid order cart is omitted as a whole.                                                                                                                                               |
| OA-17 | `cloudMarketing.getStatus`, refreshed Graph `cloudMarketing.status`, two lifecycle events       | Native beta requires `sessions:read`. Unknown values never grant eligibility. Terms are accepted in WhatsApp Manager. The deprecated MM Lite Graph field is removed from the current response type.                                                                                                                                 |
| OA-18 | `contacts.block/unblock`, `parentBsuid`, `contact.update.identityChange`                        | Use public contact IDs for native blocks. Parent BSUIDs are metadata, never recipients or block targets. Previous identities stay separate. Reuse the existing native methods and caller idempotency keys; inspect uncertain outcomes before starting another operation.                                                            |
| OA-21 | `officialGroups.setPicture`, `groups.setPicture`, `chats` history                               | Official-only picture is a multipart JPEG, square, at least 192 x 192 pixels, at most 5 MB. Server validation checks bytes/dimensions. Hybrid operations use `groups` through Linked Devices only. `hybrid_group_linked_devices_unavailable` means not executed; never retry through Official. History remains opt-in and regional. |
| OA-30 | Platform `client.webhooks.create/update`, `constructWebhookDelivery`, `webhooks.verifyDelivery` | Native-format enrolled beta, opt-in/default off. The older `messaging.webhooks` resource does not accept batching.                                                                                                                                                                                                                  |

`feature_unavailable` is a normal typed `PolymorfaError` with its HTTP status,
request ID and code retained. Do not fall back to another API or bypass access
checks. Transport errors and unknown provider results must remain visible.

Catalog IDs are strings of 1-32 digits. Product pages accept `limit` 1-100
(default 50) and the API's opaque `nextCursor`. Sync may run for 50 seconds;
its SDK timeout defaults to 60 seconds. It is sent once, even with retry overrides.
A new attempt within 120 seconds returns `catalog_sync_cooldown` with Retry-After.
A failed attempt preserves the previous snapshot except definite `not_linked`.

Batch settings are `{enabled, maxEvents?, windowMs?}`. Limits are 2-100 events
and 100-1000 ms; defaults are 100 and 1000. Omission on create keeps single
delivery. Omission on update preserves stored settings. Disabling remains
available after beta withdrawal. The server verifies saved format and access.

Before enabling batching, replace a single-only receiver's
`constructWebhookEvent` with `constructWebhookDelivery`. The result is either
the existing event or `{object:"event_batch",version:1,id,events}`. A window may
contain one event. The original parser still accepts only a single event.
Verify the signature over the whole raw request. Deduplicate individual event
IDs and batch IDs in durable storage. Acknowledge only the whole request;
partial acknowledgement is unsupported. Batch retries retain bytes, membership,
order and IDs. Later admitted work may wait behind earlier endpoint deliveries.

The compile-checked example is `examples/official-api-round2/index.ts`.
Private Console routes in backend #612, #615 and #616 have no SDK surface.
Go, Python, PHP, Rust and C# additions are coordinated separately with SDK #348.
